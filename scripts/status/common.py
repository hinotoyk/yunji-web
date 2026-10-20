#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""登录状态任务共享工具：本任务限速口径注入 + URL 常量 + basic.json 读写再导出。

2026-10（用户定稿）：独立于 basic/races 两管线的日频任务——JRA 抹消/去向/地方调教师追踪。
数据源 = NAR 竞走馬一覧/馬详情 + keibabook 抹消馬簿/馬検索/近況履歴；直写 data/basic.json
的抹消组四键 + 調教師（合并持久化语义见 core/manual.apply_overrides / docs/pipeline.md §4）。
业务隔离：status 不 import basic/races 的任何业务模块。
"""
import sys
from pathlib import Path
from urllib.parse import quote

# requests / bs4 惰性重导出：import common 不触发第三方依赖（离线场景可纯 stdlib 跑合并类逻辑）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from core import basic_io, constants, manual, net, runtime, sire_config  # noqa: E402

__getattr__ = runtime.install_lazy_http()

runtime.install_utf8_stdout()

ROOT = constants.ROOT

# ---- 数据源 URL（业务隔离：不进 core/constants，只有 status 用） ----
KB = "https://p.keibabook.co.jp"
KB_MASYOBA_URL = KB + "/cyuou/masyoba/{page}"          # page: 1=栗東 2=美浦（不是分页）
KB_SEARCH_URL = KB + "/db/search/horse"                # 必须带 masyof%5B%5D=1（含現役以外），否则只返回現役
KB_KINKYO_URL = KB + "/db/uma/{kb_id}/kinkyo"          # 近況履歴：抹消日期唯一免费来源
NAR = "https://www.keiba.go.jp"
NAR_LIST_URL = NAR + "/KeibaWeb/DataRoom/RaceHorseList"  # 免登录；k_activeCode=1 实测=NAR在册+JRA抹消全集
NAR_INFO_URL = NAR + "/KeibaWeb/DataRoom/RaceHorseInfo?k_lineageLoginCode={code}"  # 详情页：調教師
STUD = constants.STUD                                    # studbook.jp（状态环：繁殖登録确认；CI 出口 IP 被拦 → 403 容错）

# ---- 本任务的网络口径（以形参注进中立层：net 不含任务概念） ----
DOMAIN_SLEEP = {
    "p.keibabook.co.jp": 1.5,
    "www.keiba.go.jp": 1.5,
    "www.studbook.jp": 1.2,       # 状态环繁殖登録检查（本机直连正常；CI 403 降级）
}
STRIP_BASES = (KB, NAR, STUD)   # log_fetch 记 path 时剥掉的站点根

_NET = net.bind(DOMAIN_SLEEP, STRIP_BASES)
sleep_for = _NET["sleep_for"]
fetch = _NET["fetch"]
soup_of = _NET["soup_of"]

quote = quote

# ---- basic.json 读写（任务直写落库层） ----
load_basic = basic_io.load_basic
save_basic = basic_io.save_basic
load_overrides = manual.load_overrides

# ---- 种马名（config/sire.json 驱动，非字面量） ----
SIRE_NAME_JA = sire_config.sire_name_ja()
