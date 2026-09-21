#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层网络：请求 / 按域名限速 / 风控日志。

两管线差异（basic 含 JBIS·studbook，races 含 race·nar 域）不写死在这里，
由各自 common.py 用 domain_sleep / strip_bases 形参注入。
"""
import csv
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from . import paths

COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# 按域名配置请求间隔（基准秒，会再乘以 0.8~1.2 抖动）：本层留空表，由管线 common.py 传参覆盖。
DOMAIN_SLEEP = {}
DEFAULT_SLEEP = 2.0              # 未匹配到域名的兜底间隔

# log_fetch 记 path 时剥掉的站点根前缀：同样由管线注入（两管线消费的域不同）。
STRIP_BASES = ()


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
def fetch(url, retries=3, encoding="utf-8", session=None, sleep_on_403=20,
          domain_sleep=None, strip_bases=None):
    """GET 并按 encoding 解码；403 长退避，其余重试。返回响应文本。"""
    t0 = time.time()
    s = session or requests
    for attempt in range(retries):
        try:
            r = s.get(url, headers=HEADERS, timeout=30)
            r.encoding = encoding
            r.raise_for_status()
            log_fetch(url, r.status_code, time.time() - t0, attempt + 1, strip_bases=strip_bases)
            return r.text
        except requests.exceptions.HTTPError as e:
            if "403" in str(e) and attempt < retries - 1:
                time.sleep(sleep_on_403 + attempt * 15)
                continue
            log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80], strip_bases=strip_bases)
            raise
        except Exception as e:
            if attempt == retries - 1:
                log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80], strip_bases=strip_bases)
                raise
            time.sleep(2)
    raise RuntimeError(f"fetch failed: {url}")


def log_fetch(url, status, dur, retries, note="", strip_bases=None):
    """风控观测：记录 域名 + 最小必要请求信息，失败不影响抓取。"""
    try:
        log = paths.DATA_DIR / "fetch_log.csv"
        paths.DATA_DIR.mkdir(parents=True, exist_ok=True)   # 首次运行目录可能还不存在
        bases = STRIP_BASES if strip_bases is None else strip_bases
        path = url.split("?")[0]
        for base in bases:
            path = path.replace(base, "")
        new = not log.exists()
        with open(log, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts", "script", "host", "path", "status", "dur_s", "retries", "note"])
            w.writerow([datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        Path(sys.argv[0]).name, domain_of(url), path,
                        status, round(dur, 2), retries, note])
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


def soup_of(url, encoding="utf-8", **kw):
    return BeautifulSoup(fetch(url, encoding=encoding, **kw), "lxml")
