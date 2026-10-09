#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞赛管线共享工具：再导出 core 常量 + 本管线限速口径注入 + 比赛记录约定。

2026-xx（用户决策）：路径/站点/颜色等字面量常量全部收进 core/constants.py，本文件只做
薄再导出；本管线特有的风控口径（DOMAIN_SLEEP / STRIP_BASES）仍由这里持有并以形参注入
中立层 net（net 不含管线概念）。业务隔离：races 不 import basic 的任何业务模块，
共享逻辑统一下沉 core。

设计原则与并发架构见 docs/pipeline.md，比赛记录字段契约见 docs/SCHEMA.md。
"""
import functools
import sys
from pathlib import Path

# requests / bs4 惰性重导出（2026-10-01，与 basic/common.py 同口径）：抓取脚本仍以
# common.requests / common.BeautifulSoup 使用（PEP 562 __getattr__ 兜底），import common
# 本身不再触发第三方依赖，离线/CI 场景不被 runner 预装包变化连坐。
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # 直跑脚本时 scripts/ 不在 sys.path
from core import basic_io, constants, manual, net, runtime, text    # noqa: E402

import racelib  # noqa: E402  name_key 用于跨源去重键

__getattr__ = runtime.install_lazy_http()

runtime.install_utf8_stdout()

# ---- 路径 / 颜色 / 站点：单一出处 = core/constants.py（只再导出） ----
ROOT = constants.ROOT
DATA_DIR = constants.DATA_DIR                                  # 全部数据统一放根 data/
RACES_DATA_DIR = constants.RACES_DATA_DIR                      # 每匹逐场成绩文件 data/races/{id}.json
TMP_DIR = constants.tmp_dir("races")                           # 竞赛环节缓存（merge 后删除）
BASIC_JSON = constants.BASIC_JSON                              # 共享数据源
OVERRIDES_JSON = constants.OVERRIDES_JSON                      # 人工维护表（文件名带 manual，脚本永不写入）

COLORS = constants.COLORS
HEADERS = constants.HEADERS
DEFAULT_SLEEP = constants.DEFAULT_SLEEP

NK = constants.NK
NK_HORSE_URL = constants.NK_HORSE_URL                          # 马详情页（EUC-JP）
NK_RESULT_URL = constants.NK_RESULT_URL                        # 成绩页（EUC-JP）
RACE_SP_URL = constants.RACE_SP_URL                            # 中央/海外 比赛结果页（SP 域）
RACE_SP_URL_NAR = constants.RACE_SP_URL_NAR                    # 地方 比赛结果页（SP 域）

# ---- 本管线的网络口径（以形参注进中立层：net 不含管线概念） ----
# netkeiba 对高频抓取敏感；SP 域（race/nar result 页）相对宽松。
# 运行后可在 data/fetch_log.csv 里按 host 观察 403/失败率，按需调整。
DOMAIN_SLEEP = {
    "db.netkeiba.com": 6.0,      # 详情 / 成绩页（风控严，保守）
    "race.netkeiba.com": 2.0,    # 中央/海外 比赛结果页（SP 域）
    "nar.netkeiba.com": 2.0,     # 地方 比赛结果页（SP 域）
}
STRIP_BASES = (NK, "https://race.netkeiba.com", "https://nar.netkeiba.com")

_NET = net.bind(DOMAIN_SLEEP, STRIP_BASES)
domain_of = net.domain_of
sleep_for = _NET["sleep_for"]
jitter = _NET["jitter"]
fetch = _NET["fetch"]
soup_of = _NET["soup_of"]
log_fetch = _NET["log_fetch"]

norm = text.norm

load_basic = basic_io.load_basic
save_basic = basic_io.save_basic
move_after = basic_io.move_after       # 键序归位单一出处（与 merge_basic/order_horse 同一落库序）

tmp_path = functools.partial(basic_io.tmp_path, tmp_dir=TMP_DIR)
write_cache = functools.partial(basic_io.write_cache, tmp_dir=TMP_DIR)
read_cache = functools.partial(basic_io.read_cache, tmp_dir=TMP_DIR)
clean_cache_all = functools.partial(basic_io.clean_cache_all, tmp_dir=TMP_DIR)

# ---------------- 人工维护表 data/manual_overrides.json（契约见 docs/SCHEMA.md） ----------------
load_overrides = manual.load_overrides
apply_overrides = manual.apply_overrides


# ---------------- 比赛记录 ----------------
race_key = racelib.race_key   # 比赛唯一键单源（防御版，docs/REFACTOR.md §5.1 R2 / §9 D4），common 只再导出


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
