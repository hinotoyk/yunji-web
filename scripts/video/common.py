#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""视频回放任务共享工具：B 站域名限速口径 + 接口 URL + 配置/路径单源。

2026-11（用户定稿）：比赛记录「视频回放」列的数据源 = B 站 UP 主（config/video-sources.json 配 mid）。
独立于 basic/races 两管线（业务隔离：不写 basic.json / races/*.json），只产两份文件：
  - data/video-map.json     自动匹配产物（fetch_video.py 抓清单 + build_video_map.py 匹配落盘）
  - data/video_manual.json  人工覆写表（脚本只读，人/编辑台写；人工值永远优先）

抓取通道（2026-11 实测）：
  A) 主通道 = 站内搜索接口按 UP 昵称搜（search_type=video&keyword=<昵称>&order=pubdate）：
     返回条目 author 恒为该 UP 主 → 等价于「全量投稿列表」，实测 192 条/10 页全覆盖。
     **这是拿全量的唯一可用通道**（arc/search 被风控，合集只覆盖被收录的部分）。
  B) 兜底通道 = 免登录的合集/系列接口：
     - x/polymer/web-space/seasons_series_list   合集+系列清单（page_size 必须 ≤10，>10 实测 -400）
     - x/polymer/web-space/seasons_archives_list 合集内视频（需真实 season_id，分页 30/页）
     - x/series/archives                         系列内视频（分页 30/页）
投稿全量接口 x/space/wbi/arc/search 对服务器 IP 一律风控（无签名 -352；WBI 签名 + buvid
+ dm_* 反爬参数仍 HTTP 412，2026-11 实测）→ **CI/GitHub Actions 不抓 B 站**，抓取只在
本地跑，产物入库后随 copy-data 进 dist。

比赛键（与 scripts/races/racelib.py::race_key 同构，两处改键需同步）：
  - 有 race_id：'race:<race_id>'（12 位数字）
  - 无 race_id（海外台账场）：'slot:<日付>|<場名>|<R>'
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from core import constants, net, runtime  # noqa: E402

__getattr__ = runtime.install_lazy_http()

runtime.install_utf8_stdout()

ROOT = constants.ROOT
DATA_DIR = constants.DATA_DIR
CONFIG_JSON = ROOT / "config" / "video-sources.json"
VIDEO_MAP_JSON = DATA_DIR / "video-map.json"
VIDEO_MANUAL_JSON = DATA_DIR / "video_manual.json"
VIDEO_REPORT_MD = DATA_DIR / "video_report.md"
# 全量清单：**入库**（CI 基线）。data/_tmp/ 被 gitignore，Actions 里读不到 → 必须落 tracked 路径，
# 否则「CI 抓取被风控」时无法用上一次的清单重建映射（每天把映射洗空的根因）。
# 不前端消费 → copy-data 显式跳过（见 front/vite.config.js），不进 dist。
RAW_JSON = DATA_DIR / "video_raw.json"
TMP_DIR = constants.tmp_dir("video")                 # data/_tmp/video/（gitignore：本地人看清单 videos.md）
TMP_VIDEOS_JSON = TMP_DIR / "videos.json"

# ---- B 站接口（业务隔离：不进 core/constants，只有 video 用） ----
API = "https://api.bilibili.com"
SEARCH_URL = API + "/x/web-interface/wbi/search/type"     # 搜索（按 UP 昵称捞全量投稿）
CARD_URL = API + "/x/web-interface/card"                  # UP 主名片（拿昵称/投稿数）
VIEW_URL = API + "/x/web-interface/view"                  # 单视频详情（分 P / 完整标题）
SEASONS_LIST_URL = API + "/x/polymer/web-space/seasons_series_list"
SEASONS_ARCHIVES_URL = API + "/x/polymer/web-space/seasons_archives_list"
SERIES_ARCHIVES_URL = API + "/x/series/archives"

# ---- 本任务的网络口径（以形参注进中立层：net 不含任务概念） ----
DOMAIN_SLEEP = {"api.bilibili.com": 1.5}
STRIP_BASES = (API,)

_NET = net.bind(DOMAIN_SLEEP, STRIP_BASES)
sleep_for = _NET["sleep_for"]
log_fetch = _NET["log_fetch"]


def load_config():
    """读 config/video-sources.json；缺失/未配置 mid → 显式退出（fail-fast）。"""
    if not CONFIG_JSON.exists():
        raise SystemExit(f"配置缺失：{CONFIG_JSON}（参照 docs/SCHEMA.md §10 创建；空 mid = 功能关闭态）")
    cfg = json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
    if not cfg.get("mid"):
        raise SystemExit("config/video-sources.json 未配置 mid → 视频回放功能关闭态，退出")
    return cfg


class RiskControl(RuntimeError):
    """B 站风控（机房/海外 IP 常见）：HTTP 200 + code=0，但 data 里只有 v_voucher 验证票、没有真实结果。
    必须显式识别——否则会被当成「这个 UP 主没有投稿」，把已有映射洗成空。"""


def guard_risk(data, url=""):
    """风控票识别（独立函数便于单测）：data 只有 v_voucher、无 result/list → RiskControl。"""
    if isinstance(data, dict) and data.get("v_voucher") and not (data.get("result") or data.get("list")):
        raise RiskControl(f"B 站风控（v_voucher 验证票，IP 被判定为非真人流量）: {url}")
    return data


def jget(url, referer="https://www.bilibili.com/"):
    """GET → JSON（code != 0 显式报错）；限速（1.5s × 0.8~1.2 抖动）+ fetch_log 走中立层同口径。
    纯 stdlib（urllib）实现：B 站接口是简单 JSON GET，无需 requests 高级特性——本机默认解释器
    不装第三方包也能跑（离线红线同精神，见 core/net.py 文件头）。
    referer：搜索接口要用 search.bilibili.com（用站内首页 Referer 会被 WAF 判 412 的概率更高）。
    Cookie：环境变量 BILI_COOKIE 存在则带上（CI 里配 secret 用登录态过风控；本地一般不设）。"""
    import os
    import urllib.request
    time.sleep(sleep_for(url))
    t0 = time.time()
    headers = {**constants.HEADERS, "Referer": referer}
    cookie = (os.environ.get("BILI_COOKIE") or "").strip()
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode("utf-8"))
    log_fetch(url, r.status, time.time() - t0, 1)
    if d.get("code") != 0:
        raise RuntimeError(f"B 站接口失败: {url} → code={d.get('code')} {d.get('message')}")
    data = d.get("data")
    return guard_risk(data, url) or {}
