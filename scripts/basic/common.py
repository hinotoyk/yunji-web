#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""基础管线共享工具：本管线特有的站点常量 + 将中立层（scripts/_shared）注入本管线口径。

网络/路径/basic.json 读写/人工表等与竞赛管线逐字重复的部分已收进 _shared；
设计原则与并发架构见 scripts/README.md，basic.json 字段契约见 data/SCHEMA.md。
"""
import functools
import io
import sys
from pathlib import Path

import requests                  # noqa: F401  脚本以 common.requests 使用
from bs4 import BeautifulSoup    # noqa: F401  脚本以 common.BeautifulSoup 使用

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from _shared import basic_io, manual, net, paths, text    # noqa: E402

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

# ---- 路径 ----
ROOT = paths.ROOT
DATA_DIR = paths.DATA_DIR                                  # 全部数据统一放根 data/
BASIC_JSON = paths.BASIC_JSON
PEDIGREE_DIR = DATA_DIR / "pedigree"
TMP_DIR = paths.tmp_dir("basic")                           # 基础并发缓存（merge 后删除）

# ---- 站点/常量（仅基础管线消费） ----
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

COLORS = net.COLORS
HEADERS = net.HEADERS
DEFAULT_SLEEP = net.DEFAULT_SLEEP

# ---- 本管线的网络口径（以形参注进中立层：net 不含管线概念） ----
# 值参考实际风控表现：netkeiba 对高频抓取敏感（间隔需大），JBIS/studbook 相对宽松。
# 运行后可在 data/fetch_log.csv 里按 host 观察，按需调整这里。
DOMAIN_SLEEP = {
    "www.jbis.or.jp": 1.5,       # JBIS 建档/血统
    "db.netkeiba.com": 6.0,      # netkeiba 列表/详情（风控严，保守）
    "www.studbook.jp": 1.2,      # studbook 産駒/意味
}
STRIP_BASES = (JBIS, NK, STUD)   # log_fetch 记 path 时剥掉的站点根

domain_of = net.domain_of
sleep_for = functools.partial(net.sleep_for, domain_sleep=DOMAIN_SLEEP)
jitter = functools.partial(net.jitter, domain_sleep=DOMAIN_SLEEP)
fetch = functools.partial(net.fetch, domain_sleep=DOMAIN_SLEEP, strip_bases=STRIP_BASES)
soup_of = functools.partial(net.soup_of, domain_sleep=DOMAIN_SLEEP, strip_bases=STRIP_BASES)
log_fetch = functools.partial(net.log_fetch, strip_bases=STRIP_BASES)

norm = text.norm
norm_mare = text.norm_mare
ROMAN_FULL = text.ROMAN_FULL

load_basic = basic_io.load_basic
save_basic = basic_io.save_basic
next_id = basic_io.next_id
BASIC_FIELDS = basic_io.BASIC_FIELDS
BASIC_ORDER = basic_io.BASIC_ORDER
BASIC_TEMPLATE = basic_io.BASIC_TEMPLATE

tmp_path = functools.partial(basic_io.tmp_path, tmp_dir=TMP_DIR)
write_cache = functools.partial(basic_io.write_cache, tmp_dir=TMP_DIR)
read_cache = functools.partial(basic_io.read_cache, tmp_dir=TMP_DIR)
clean_cache_all = functools.partial(basic_io.clean_cache_all, tmp_dir=TMP_DIR)

load_overrides = manual.load_overrides
apply_overrides = manual.apply_overrides
