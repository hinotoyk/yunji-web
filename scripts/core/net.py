#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层网络：请求 / 按域名限速 / 风控日志。

请求头 / 兜底间隔 / 颜色等字面量常量收在 core/constants.py（单源，两条管线共用）；
两管线差异（basic 含 JBIS·studbook，races 含 race·nar 域）的风控口径不写死在这里，
由各自 common.py 用 domain_sleep / strip_bases 形参注入（见下方 bind()）。
"""
import functools
import json
import random
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# requests / bs4 不在模块顶层导入（2026-10-01）：core 会被 merge_basic / build_timeline 等
# 离线脚本连坐 import（core/__init__ re-export net），而 GitHub runner 镜像不再预装 requests，
# 顶层导入曾把 Pages 部署 job 炸掉（deploy.yml 该步按设计纯 stdlib）。改到真正发请求的函数内导入。
from . import constants

# 请求超时 / 重试 / 退避（2026-11-13 定稿，原 30s·3 次）：
# JBIS 单页实测 30~230s、且频繁 500 —— 30s 超时会在「正常但很慢」的页面上必然误判失败，
# 3 次重试在 500 连发时也不够。二者都是上游现状，不是本机网络问题，故放宽在常量里。
TIMEOUT = 90          # 单请求超时（秒）
RETRIES = 4           # 默认重试次数（含首次）
BACKOFF_BASE = 8      # 429/5xx 退避基数（秒），指数增长 + 抖动
BACKOFF_CAP = 90      # 单次退避上限（秒）

# 按域名配置请求间隔（基准秒，会再乘以 0.8~1.2 抖动）：本层留空表，由管线 common.py 传参覆盖。
DOMAIN_SLEEP = {}
DEFAULT_SLEEP = constants.DEFAULT_SLEEP   # 未匹配到域名的兜底间隔

# log_fetch 记 path 时剥掉的站点根前缀：同样由管线注入（两管线消费的域不同）。
STRIP_BASES = ()

# fetch_log.jsonl 滚动保留窗口（天）：日志入库可追踪（.gitattributes merge=union 抗并发 rebase 冲突），
# 滚动只留最近两个月（2026-10-26 定稿，merge 并发时可能多留几行，下次裁剪清掉）。
# 频率门控：裁剪是全量读 + 全量过滤（O(文件)），逐请求做等于每轮抓取重复读几百遍 4MB（实测 22.6k 行 /
# 4MB）；追加本是时间序 + 窗口 60 天，每 TRIM_CHECK_EVERY 次 log_fetch 检查一次足够。
LOG_RETENTION_DAYS = 60
TRIM_CHECK_EVERY = 200
_trim_counter = 0


def domain_of(url):
    """从 URL 提取 host（小写）。"""
    m = re.search(r"https?://([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def sleep_for(url, fallback=None, domain_sleep=None):
    """按域名返回抖动后的请求间隔（秒）。
    优先 domain_sleep[host]，未配置则用 fallback 或 DEFAULT_SLEEP。"""
    table = DOMAIN_SLEEP if domain_sleep is None else domain_sleep
    base = table.get(domain_of(url), fallback if fallback is not None else DEFAULT_SLEEP)
    return base * random.uniform(0.8, 1.2)


# ---------------- 请求 ----------------
def _backoff(attempt, resp=None):
    """429/5xx 单次退避秒数：优先尊重 Retry-After，否则指数退避 + 抖动，封顶 BACKOFF_CAP。"""
    if resp is not None:
        ra = (resp.headers.get("Retry-After") or "").strip()
        if ra.isdigit():
            return min(float(ra), BACKOFF_CAP * 2)
    return min(BACKOFF_BASE * (2 ** attempt), BACKOFF_CAP) * random.uniform(0.8, 1.2)


# ---------------- 域级熔断 ----------------
# 同一 host 连续被拒 BREAKER_THRESHOLD 次 → **本次运行内不再请求它**，后续调用立刻抛错
# （调用方照旧用 except 兜底，流程不会崩，只是不再白打）。依据：status/run_status.py 对
# keibabook 的 _kb_ok 同款先例 —— 对已经拒绝我们的主机持续轰炸，只会延长封禁、把重试退避的
# 时间全烧掉，还让日志被噪音淹没。2026-11-13 加：race.netkeiba.com 对机房出口整域回 400。
#
# 什么才算「被拒」：403（明确拒绝），或 **400 且响应体为空**（边缘/WAF 直接拒；实测 race 域
# 就是 400 + Content-Length: 0）。有正文的 400 通常是参数/页面不存在，不该连坐整个域。
BREAKER_THRESHOLD = 3
_broken = {}          # host -> 已连续被拒次数（进程内，不持久）


def _trip(host):
    """记一次「被拒」；达到阈值时打一行警告并熔断该域。"""
    n = _broken.get(host, 0) + 1
    _broken[host] = n
    if n == BREAKER_THRESHOLD:
        print(f"⚠ {host} 连续 {n} 次被拒（403 / 空响应 400）→ 本次运行熔断，不再请求该域", flush=True)


def reset_breaker():
    """清空熔断表（测试 / 长驻进程换场景时用）。"""
    _broken.clear()


def _rejected(status, resp):
    """这次失败是否算「主机在拒绝我们」（→ 计入熔断）。"""
    if status == 403:
        return True
    return status == 400 and resp is not None and not (resp.text or "").strip()


def fetch(url, retries=None, encoding=None, session=None, sleep_on_403=20,
          domain_sleep=None, strip_bases=None, timeout=None):
    """GET 并解码；403 长退避，429/5xx 指数退避重试，其余 4xx 直接抛。返回响应文本。

    encoding=None（默认）= **不写死编码，跟随响应头 charset**；响应头缺 charset 时
    （requests 对 text/* 会按 RFC 回一个 ISO-8859-1 的猜测）用 apparent_encoding 兜底。
    2026-11 netkeiba 全站由 EUC-JP 转 UTF-8：任何一处硬编码编码都会被上游一次切换打回乱码
    （表现为全库马名乱码 + nk_id 全抓不到），所以本层不再接受「按站点固定编码」的用法，
    确需强制时显式传 encoding。

    域级熔断：某 host 连续被拒 BREAKER_THRESHOLD 次后，本次运行内直接抛 RuntimeError，
    不再发任何请求（见 _trip / BREAKER_THRESHOLD 上方说明）。"""
    import requests                       # 惰性：见文件头说明（离线脚本不被迫装依赖）
    host = domain_of(url)
    if _broken.get(host, 0) >= BREAKER_THRESHOLD:
        raise RuntimeError(f"{host} 本次运行已熔断（连续被拒 {_broken[host]} 次），跳过请求：{url}")
    t0 = time.time()
    s = session or requests
    n = RETRIES if retries is None else max(1, int(retries))
    for attempt in range(n):
        last = attempt == n - 1
        try:
            r = s.get(url, headers=constants.HEADERS,
                      timeout=TIMEOUT if timeout is None else timeout)
            r.raise_for_status()
            if encoding:
                r.encoding = encoding
            elif not r.encoding or r.encoding.lower() == "iso-8859-1":
                r.encoding = r.apparent_encoding or "utf-8"
            _broken.pop(host, None)        # 成功即复位（断掉「连续」计数）
            log_fetch(url, r.status_code, time.time() - t0, attempt + 1, strip_bases=strip_bases)
            return r.text
        except requests.exceptions.HTTPError as e:
            resp = e.response
            status = resp.status_code if resp is not None else 0
            if _rejected(status, resp):
                _trip(host)                # 计入域级熔断（连续 3 次即整域停手）
            if not last and status == 403:
                time.sleep(sleep_on_403 + attempt * 15)
                continue
            if not last and (status == 429 or 500 <= status < 600):
                time.sleep(_backoff(attempt, resp))
                continue
            log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80], strip_bases=strip_bases)
            raise
        except Exception as e:
            if last:
                log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80], strip_bases=strip_bases)
                raise
            time.sleep(_backoff(attempt))
    raise RuntimeError(f"fetch failed: {url}")


def log_fetch(url, status, dur, retries, note="", strip_bases=None):
    """风控观测：记录 域名 + 最小必要请求信息，失败不影响抓取。

    逐行 append JSONL（`data/fetch_log.jsonl`）：每行自包含、免 header、无 CSV 引号/逗号转义坑。
    入库可追踪（.gitattributes merge=union 抗并发 rebase 冲突）+ 滚动只留最近两个月（trim_fetch_log）；
    进 dist 前仍由 vite copy-data 跳过 *.jsonl。"""
    try:
        log = constants.DATA_DIR / "fetch_log.jsonl"
        constants.DATA_DIR.mkdir(parents=True, exist_ok=True)   # 首次运行目录可能还不存在
        bases = STRIP_BASES if strip_bases is None else strip_bases
        path = url.split("?")[0]
        for base in bases:
            path = path.replace(base, "")
        record = {
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "script": Path(sys.argv[0]).name,
            "host": domain_of(url),
            "path": path,
            "status": str(status),
            "dur_s": round(dur, 2),
            "retries": retries,
            "note": note,
        }
        with open(log, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        global _trim_counter
        _trim_counter += 1
        if _trim_counter % TRIM_CHECK_EVERY == 1:
            trim_fetch_log()
    except Exception:
        pass


def trim_fetch_log():
    """滚动保留：data/fetch_log.jsonl 只留最近 LOG_RETENTION_DAYS 天（按行 ts 判定，2026-10-26 定稿）。

    全量按 ts 过滤、只在真有过期行时重写。**不依赖「首行即最旧」**：.gitattributes 的 merge=union
    合并可能把旧行夹到中间，只看首行会永久跳过裁剪；解析不了 ts 的行视为过期丢弃。
    频率由 log_fetch 的计数门控（每 TRIM_CHECK_EVERY 次一次），失败不影响抓取。"""
    try:
        log = constants.DATA_DIR / "fetch_log.jsonl"
        if not log.exists():
            return
        cutoff = (datetime.now() - timedelta(days=LOG_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
        with open(log, encoding="utf-8") as f:
            lines = f.readlines()
        kept = []
        for ln in lines:
            try:
                if json.loads(ln).get("ts", "") >= cutoff:
                    kept.append(ln)
            except Exception:
                pass
        if len(kept) != len(lines):
            with open(log, "w", encoding="utf-8") as f:
                f.writelines(kept)
    except Exception:
        pass


def jitter(url_or_base, fallback=None, domain_sleep=None):
    """请求间隔（0.8~1.2 抖动）。
    传 URL → 按域名取间隔（domain_sleep）；
    传数值 base → 兼容旧调用，当作基准间隔。"""
    if isinstance(url_or_base, str) and url_or_base.startswith("http"):
        return sleep_for(url_or_base, fallback, domain_sleep=domain_sleep)
    base = url_or_base if url_or_base is not None else DEFAULT_SLEEP
    return base * random.uniform(0.8, 1.2)


def soup_of(url, encoding=None, **kw):
    from bs4 import BeautifulSoup         # 惰性：见文件头说明
    return BeautifulSoup(fetch(url, encoding=encoding, **kw), "lxml")


def bind(domain_sleep, strip_bases):
    """把管线风控口径绑成具名 partial 集（common.py 再导出为模块级名）。

    收口 basic/common.py 与 races/common.py 相同的「五连 functools.partial」样板
    （2026-xx 用户决策）：net 接口签名变化时只改这里一处，两条管线调用点不变。
    返回 dict：{"sleep_for","jitter","fetch","soup_of","log_fetch"}。"""
    return {
        "sleep_for": functools.partial(sleep_for, domain_sleep=domain_sleep),
        "jitter": functools.partial(jitter, domain_sleep=domain_sleep),
        "fetch": functools.partial(fetch, domain_sleep=domain_sleep, strip_bases=strip_bases),
        "soup_of": functools.partial(soup_of, domain_sleep=domain_sleep, strip_bases=strip_bases),
        "log_fetch": functools.partial(log_fetch, strip_bases=strip_bases),
    }
