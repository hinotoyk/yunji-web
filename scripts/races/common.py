#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞赛管线共享工具：本管线特有的站点/比赛记录约定 + 将中立层注入本管线口径。

与基础管线（scripts/basic/）互不 import，二者只共用中立层 scripts/_shared；
设计原则与并发架构见 scripts/README.md，比赛记录字段契约见 data/SCHEMA.md。
"""
import functools
import io
import sys
from pathlib import Path

import requests                  # noqa: F401  脚本以 common.requests 使用
from bs4 import BeautifulSoup    # noqa: F401  脚本以 common.BeautifulSoup 使用

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from _shared import basic_io, manual, net, paths, text    # noqa: E402

import racelib  # noqa: E402  name_key 用于跨源去重键

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---- 路径 ----
ROOT = paths.ROOT
DATA_DIR = paths.DATA_DIR                                  # 全部数据统一放根 data/
RACES_DATA_DIR = DATA_DIR / "races"                        # 每匹逐场成绩文件 data/races/{id}.json
TMP_DIR = paths.tmp_dir("races")                           # 竞赛环节缓存（merge 后删除）
BASIC_JSON = paths.BASIC_JSON                              # 共享数据源
OVERRIDES_JSON = paths.OVERRIDES_JSON                      # 人工维护表（文件名带 manual，脚本永不写入）

# ---- 站点/常量（仅竞赛管线消费） ----
NK = "https://db.netkeiba.com"
NK_HORSE_URL = NK + "/horse/{nk_id}/"                       # 马详情页（EUC-JP）
NK_RESULT_URL = NK + "/horse/result/{nk_id}/"               # 成绩页（EUC-JP）
RACE_SP_URL = "https://race.netkeiba.com/race/result.html?race_id={race_id}"    # 中央/海外 比赛结果页（SP 域）
RACE_SP_URL_NAR = "https://nar.netkeiba.com/race/result.html?race_id={race_id}" # 地方 比赛结果页（SP 域）

COLORS = net.COLORS
HEADERS = net.HEADERS
DEFAULT_SLEEP = net.DEFAULT_SLEEP

# ---- 本管线的网络口径（以形参注进中立层：net 不含管线概念） ----
# netkeiba 对高频抓取敏感；SP 域（race/nar result 页）相对宽松。
# 运行后可在 data/fetch_log.csv 里按 host 观察 403/失败率，按需调整。
DOMAIN_SLEEP = {
    "db.netkeiba.com": 6.0,      # 详情 / 成绩页（风控严，保守）
    "race.netkeiba.com": 2.0,    # 中央/海外 比赛结果页（SP 域）
    "nar.netkeiba.com": 2.0,     # 地方 比赛结果页（SP 域）
}
STRIP_BASES = (NK, "https://race.netkeiba.com", "https://nar.netkeiba.com")

domain_of = net.domain_of
sleep_for = functools.partial(net.sleep_for, domain_sleep=DOMAIN_SLEEP)
jitter = functools.partial(net.jitter, domain_sleep=DOMAIN_SLEEP)
fetch = functools.partial(net.fetch, domain_sleep=DOMAIN_SLEEP, strip_bases=STRIP_BASES)
soup_of = functools.partial(net.soup_of, domain_sleep=DOMAIN_SLEEP, strip_bases=STRIP_BASES)
log_fetch = functools.partial(net.log_fetch, strip_bases=STRIP_BASES)

norm = text.norm

load_basic = basic_io.load_basic
save_basic = basic_io.save_basic

tmp_path = functools.partial(basic_io.tmp_path, tmp_dir=TMP_DIR)
write_cache = functools.partial(basic_io.write_cache, tmp_dir=TMP_DIR)
read_cache = functools.partial(basic_io.read_cache, tmp_dir=TMP_DIR)
clean_cache_all = functools.partial(basic_io.clean_cache_all, tmp_dir=TMP_DIR)

# ---------------- 人工维护表 data/manual_overrides.json（契约见 data/SCHEMA.md） ----------------
load_overrides = manual.load_overrides
apply_overrides = manual.apply_overrides


# ---------------- 比赛记录 ----------------
def race_key(r):
    """比赛唯一键：优先 race_id（全局稳定），否则 (日付, 場名, R)。
    用于增量去重：新增记录 = 键不在已有文件里。"""
    rid = str(r.get("race_id") or "").strip()
    if rid:
        return "race:" + rid
    return "slot:{}|{}|{}".format(r.get("日付", ""), r.get("場名", ""), r.get("R", ""))


def record_keys(r):
    """比赛记录 → 去重键集合（对称双键）：
    - race:{race_id}（有 race_id 时）
    - horse:{馬名}|{日付}（馬名+日付，跨源一致，一匹马同一天只能跑一场）
    任一键命中即判重；台账记录无 race_id，跨源去重靠 馬名+日付。"""
    keys = set()
    rid = str(r.get("race_id") or "").strip()
    if rid:
        keys.add("race:" + rid)
    name = racelib.name_key(r.get("出走馬名") or "")
    date = str(r.get("日付") or "").strip()
    if name and date:
        keys.add("horse:{}|{}".format(name, date))
    return keys


# ---- 比赛记录字段模板（键顺序 = 落库列序；写 races 文件时统一按此重排，保证新老记录一致） ----
RACE_RECORD_ORDER = [
    "日付", "発走", "出走馬名", "性", "年齢", "開催", "場名", "R", "コース", "レース名",
    "格", "条件", "距離", "芝ダ", "馬場", "天候", "斤量", "枠番", "馬番",
    "頭数", "人気", "単勝", "結果", "タイム", "上り", "着差", "通過", "ペース",
    "馬体重", "増減", "賞金", "本賞金", "騎手", "調教師", "jockey_id", "trainer_id",
    "venue_type", "race_id", "photo", "來源",
]


def order_record(rec):
    """按 RACE_RECORD_ORDER 重排记录字段（模板外的未知键追加在末尾，不丢数据）。"""
    ordered = {k: rec[k] for k in RACE_RECORD_ORDER if k in rec}
    for k, v in rec.items():
        if k not in ordered:
            ordered[k] = v
    return ordered
