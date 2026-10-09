#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""基础管线共享工具：再导出 core 常量 + 本管线限速口径注入 + 缓存绑定。

2026-xx（用户决策）：路径/站点/颜色等字面量常量全部收进 core/constants.py，本文件只做
薄再导出；本管线特有的风控口径（DOMAIN_SLEEP / STRIP_BASES）仍由这里持有并以形参注入
中立层 net（net 不含管线概念）。业务隔离：basic 不 import races 的任何业务模块。

设计原则与并发架构见 docs/pipeline.md，basic.json 字段契约见 docs/SCHEMA.md。
"""
import functools
import sys
from pathlib import Path

# requests / bs4 惰性重导出（2026-10-01）：抓取脚本仍以 common.requests / common.BeautifulSoup
# 使用（PEP 562 __getattr__ 兜底），但 import common 本身不再触发第三方依赖 —— merge_basic 等
# 离线脚本在 GitHub runner（不预装 requests）上可纯 stdlib 运行，Pages deploy job 不再被炸。
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from core import basic_io, constants, manual, net, runtime, sire_config, text    # noqa: E402

__getattr__ = runtime.install_lazy_http()

runtime.install_utf8_stdout()

# ---- 路径 / 颜色 / 站点：单一出处 = core/constants.py（只再导出） ----
ROOT = constants.ROOT
DATA_DIR = constants.DATA_DIR                                  # 全部数据统一放根 data/
BASIC_JSON = constants.BASIC_JSON
PEDIGREE_DIR = constants.PEDIGREE_DIR                          # 血统图文件 data/pedigree/
TMP_DIR = constants.tmp_dir("basic")                           # 基础并发缓存（merge 后删除）

COLORS = constants.COLORS
HEADERS = constants.HEADERS
DEFAULT_SLEEP = constants.DEFAULT_SLEEP

JBIS = constants.JBIS
JBIS_PROGENY_URL = constants.JBIS_PROGENY_URL
JBIS_PEDIGREE_URL = constants.JBIS_PEDIGREE_URL
NK = constants.NK
NK_LIST_URL = constants.NK_LIST_URL
NK_HORSE_URL = constants.NK_HORSE_URL
STUD = constants.STUD

# ---- 种马 ID（config/sire.json 配置驱动，非字面量） ----
JBIS_SIRE_ID = sire_config.jbis_id()               # 种马 JBIS id（config/sire.json 的 sire.jbis_id）
NK_SIRE_ID = sire_config.netkeiba_id()             # 种马 netkeiba id（config/sire.json 的 sire.netkeiba_id）

# ---- 本管线的网络口径（以形参注进中立层：net 不含管线概念） ----
# 值参考实际风控表现：netkeiba 对高频抓取敏感（间隔需大），JBIS/studbook 相对宽松。
# 运行后可在 data/fetch_log.csv 里按 host 观察，按需调整这里。
DOMAIN_SLEEP = {
    "www.jbis.or.jp": 1.5,       # JBIS 建档/血统
    "db.netkeiba.com": 6.0,      # netkeiba 列表/详情（风控严，保守）
    "www.studbook.jp": 1.2,      # studbook 産駒/意味
}
STRIP_BASES = (JBIS, NK, STUD)   # log_fetch 记 path 时剥掉的站点根

_NET = net.bind(DOMAIN_SLEEP, STRIP_BASES)
domain_of = net.domain_of
sleep_for = _NET["sleep_for"]
jitter = _NET["jitter"]
fetch = _NET["fetch"]
soup_of = _NET["soup_of"]
log_fetch = _NET["log_fetch"]

norm = text.norm
norm_mare = text.norm_mare
ROMAN_FULL = text.ROMAN_FULL

load_basic = basic_io.load_basic
save_basic = basic_io.save_basic
next_id = basic_io.next_id
order_horse = basic_io.order_horse
BASIC_FIELDS = basic_io.BASIC_FIELDS
BASIC_ORDER = basic_io.BASIC_ORDER
BASIC_TEMPLATE = basic_io.BASIC_TEMPLATE

tmp_path = functools.partial(basic_io.tmp_path, tmp_dir=TMP_DIR)
write_cache = functools.partial(basic_io.write_cache, tmp_dir=TMP_DIR)
read_cache = functools.partial(basic_io.read_cache, tmp_dir=TMP_DIR)
clean_cache_all = functools.partial(basic_io.clean_cache_all, tmp_dir=TMP_DIR)

load_overrides = manual.load_overrides
apply_overrides = manual.apply_overrides
