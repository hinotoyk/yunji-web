#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层常量单源：路径 + 站点 + 颜色 + 网络默认。

由原 core/paths.py 扩展而来（2026-xx 用户决策）：不再只放路径——两条管线
（basic / races）各自 common.py 里手工维护的路径、站点 URL、颜色、网络默认
全部收进本模块，common.py 只做薄再导出，不再各持一份拷贝。

约定：
- 纯 stdlib（pathlib），不 import 任何管线；管线 import 本模块（经 core/__init__ 或直接）。
- 中立层不得出现管线「概念」：各管线取值不同的**风控口径**（限速表 DOMAIN_SLEEP、
  log_fetch 剥前缀 STRIP_BASES）不写死在这里，仍由各 common.py 以形参注入 net（见 net.bind）。
- 品牌字段（site.*）是配置驱动（config/sire.json），不在字面量里，见 sire_config。
"""
from pathlib import Path

# ── 路径 ──
CORE_DIR = Path(__file__).resolve().parent        # scripts/core/
SCRIPTS_DIR = CORE_DIR.parent                     # scripts/
ROOT = SCRIPTS_DIR.parent                           # 项目根
DATA_DIR = ROOT / "data"                            # 全部数据统一放根 data/
BASIC_JSON = DATA_DIR / "basic.json"
OVERRIDES_JSON = DATA_DIR / "manual_overrides.json"  # 人工维护表（脚本只读，人/编辑服务写）


def tmp_dir(pipeline):
    """管线缓存目录：data/_tmp/<pipeline>/（merge 后清空）。"""
    return DATA_DIR / "_tmp" / pipeline


# 管线各自的数据子目录（basic 用 pedigree/，races 用 races/）
PEDIGREE_DIR = DATA_DIR / "pedigree"              # 基础管线：血统图文件 data/pedigree/{id}.json
RACES_DATA_DIR = DATA_DIR / "races"               # 竞赛管线：每匹逐场成绩文件 data/races/{id}.json


# ── 颜色（毛色枚举，详情/统计/前端共用） ──
COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")

# ── 网络默认（请求头 / 兜底间隔） ──
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
DEFAULT_SLEEP = 2.0              # 未匹配到域名的兜底间隔


# ── 站点 URL（两管线共用；各管线专用也集中在此，common 只再导出） ──
JBIS = "https://www.jbis.or.jp"
JBIS_PROGENY_URL = (JBIS + "/horse/{sid}/sire/progeny/"
                    "?sort=born&order=A&items=100&year={year}&belong=0#")
JBIS_PEDIGREE_URL = JBIS + "/horse/{jbis_id}/pedigree/"

NK = "https://db.netkeiba.com"
NK_LIST_URL = NK + "/horse/list.html?sire_id={sid}&limit=100&page={page}&sort=age-asc"
NK_HORSE_URL = NK + "/horse/{nk_id}/"                       # 马详情页（EUC-JP）
NK_RESULT_URL = NK + "/horse/result/{nk_id}/"               # 成绩页（EUC-JP）

STUD = "https://www.studbook.jp"

RACE_SP_URL = "https://race.netkeiba.com/race/result.html?race_id={race_id}"     # 中央/海外 比赛结果页（SP 域）
RACE_SP_URL_NAR = "https://nar.netkeiba.com/race/result.html?race_id={race_id}"  # 地方 比赛结果页（SP 域）
