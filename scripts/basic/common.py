#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""基础部分共享工具：请求 / 解析辅助 / basic.json 读写 / 输出。

设计原则（线性流）：
  - 每个脚本只负责一条独立的业务链路，无跨源来回兜底。
  - 请求统一走 fetch()，带 重试 + 风控日志 + 可选 jitter。
  - basic.json 是唯一「前合并」数据源，各并发脚本按 id 回写字段。

basic.json 结构：
  {
    "_meta": {"schema": "basic/v1", "updated": "...", "count": N},
    "horses": [ { "id": int 自增, "jbis_id": ..., "生年": ..., "馬名": ..., "母名": ...,
                   "nk_id": ..., "馬名意味": ..., "pedigree_file": ..., ... } ]
  }
"""
import csv
import io
import json
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---- 路径 ----
SCRIPTS_DIR = Path(__file__).resolve().parent        # scripts/basic/
ROOT = SCRIPTS_DIR.parent.parent                     # 重构工作区根
DATA_DIR = ROOT / "data"                             # 全部数据统一放根 data/
PEDIGREE_DIR = DATA_DIR / "pedigree"
TMP_DIR = DATA_DIR / "_tmp" / "basic"                # 基础并发缓存（merge 后删除）
BASIC_JSON = DATA_DIR / "basic.json"

# 全角罗马数字 → 拉丁（统一用 I/II/III...）
ROMAN_FULL = {"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V",
              "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X"}

# ---- 站点/常量 ----
JBIS = "https://www.jbis.or.jp"
JBIS_SIRE_ID = "0001237042"                        # コントレイル JBIS id
JBIS_PROGENY_URL = (JBIS + "/horse/{sid}/sire/progeny/"
                    "?sort=born&order=A&items=100&year={year}&belong=0#")
JBIS_PEDIGREE_URL = JBIS + "/horse/{jbis_id}/pedigree/"

NK = "https://db.netkeiba.com"
NK_SIRE_ID = "2017101835"                          # コントレイル netkeiba id
NK_LIST_URL = (NK + "/horse/list.html?sire_id={sid}&limit=100&page={page}&sort=age-asc")
NK_HORSE_URL = NK + "/horse/{nk_id}/"

STUD = "https://www.studbook.jp"

COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ---- 按域名配置请求间隔（基准秒，会再乘以 0.8~1.2 抖动） ----
# 值参考实际风控表现：netkeiba 对高频抓取敏感（间隔需大），JBIS/studbook 相对宽松。
# 运行后可在 data/fetch_log.csv 里按 host 观察，按需调整这里。
DOMAIN_SLEEP = {
    "www.jbis.or.jp": 1.5,       # JBIS 建档/血统
    "db.netkeiba.com": 6.0,      # netkeiba 列表/详情（风控严，保守）
    "www.studbook.jp": 1.2,      # studbook 産駒/意味
}
DEFAULT_SLEEP = 2.0              # 未匹配到域名的兜底间隔


def domain_of(url):
    """从 URL 提取 host（小写）。"""
    m = re.search(r"https?://([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def sleep_for(url, fallback=None):
    """按域名返回抖动后的请求间隔（秒）。
    优先 DOMAIN_SLEEP[host]，未配置则用 fallback 或 DEFAULT_SLEEP。"""
    base = DOMAIN_SLEEP.get(domain_of(url), fallback if fallback is not None else DEFAULT_SLEEP)
    return base * random.uniform(0.8, 1.2)


# ---------------- 请求 ----------------
def fetch(url, retries=3, encoding="utf-8", session=None, sleep_on_403=20):
    """GET 并按 encoding 解码；403 长退避，其余重试。返回响应文本。"""
    t0 = time.time()
    s = session or requests
    for attempt in range(retries):
        try:
            r = s.get(url, headers=HEADERS, timeout=30)
            r.encoding = encoding
            r.raise_for_status()
            log_fetch(url, r.status_code, time.time() - t0, attempt + 1)
            return r.text
        except requests.exceptions.HTTPError as e:
            if "403" in str(e) and attempt < retries - 1:
                time.sleep(sleep_on_403 + attempt * 15)
                continue
            log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80])
            raise
        except Exception as e:
            if attempt == retries - 1:
                log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80])
                raise
            time.sleep(2)
    raise RuntimeError(f"fetch failed: {url}")


def log_fetch(url, status, dur, retries, note=""):
    """风控观测：记录 域名 + 最小必要请求信息，失败不影响抓取。"""
    try:
        log = DATA_DIR / "fetch_log.csv"
        path = url.split("?")[0].replace(JBIS, "").replace(NK, "").replace(STUD, "")
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


def jitter(url_or_base, fallback=None):
    """请求间隔（0.8~1.2 抖动）。
    传 URL → 按域名取间隔（DOMAIN_SLEEP）；
    传数值 base → 兼容旧调用，当作基准间隔。"""
    if isinstance(url_or_base, str) and url_or_base.startswith("http"):
        return sleep_for(url_or_base, fallback)
    base = url_or_base if url_or_base is not None else DEFAULT_SLEEP
    return base * random.uniform(0.8, 1.2)


def soup_of(url, encoding="utf-8", **kw):
    return BeautifulSoup(fetch(url, encoding=encoding, **kw), "lxml")


def norm(s):
    """去 全半角空格/括号 等噪音（用于名字/键归一）。"""
    return re.sub(r"[ 　()（）\[\]【】]", "", s or "").strip()


# ---------------- basic.json 读写 ----------------
def load_basic():
    """读 basic.json → {_meta, horses}；不存在则返回空骨架。"""
    if not BASIC_JSON.exists():
        return {"_meta": {"schema": "basic/v1", "updated": "", "count": 0}, "horses": []}
    data = json.loads(BASIC_JSON.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "horses" in data:
        return data
    return {"_meta": {"schema": "basic/v1", "updated": "", "count": len(data)}, "horses": data}


def save_basic(data):
    """写 basic.json（更新 _meta）。"""
    data["_meta"] = {
        "schema": "basic/v1",
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(data["horses"]),
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BASIC_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def next_id(data):
    """下一个自增主键（从 1 开始）。"""
    return max((h["id"] for h in data["horses"]), default=0) + 1


# ---------------- 并发缓存（写独立文件，避免并发覆盖 basic.json） ----------------
def tmp_path(name):
    """缓存文件路径：data/_tmp/<name>.json"""
    return TMP_DIR / f"{name}.json"


def write_cache(name, mapping):
    """把 {id: 值} 映射写入独立缓存文件。可被并发脚本安全使用（互不覆盖）。"""
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path(name).write_text(json.dumps(mapping, ensure_ascii=False, indent=1), encoding="utf-8")


def read_cache(name):
    """读缓存文件 → dict；不存在返回 {}。"""
    p = tmp_path(name)
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def clean_cache_all():
    """合并完成后删除全部缓存（_tmp 目录）。"""
    if TMP_DIR.exists():
        for f in TMP_DIR.glob("*.json"):
            f.unlink()


# ---------------- 归一化 ----------------
def norm_mare(s):
    """母名归一化：去产地括注 + 去空白 + 罗马数字统一拉丁。netkeiba/JBIS 两侧一致。"""
    s = re.sub(r"[（(][A-Za-z]+[）)]", "", s or "")
    s = s.replace(" ", "").replace("　", "")
    for k, v in ROMAN_FULL.items():
        s = s.replace(k, v)
    return s
