#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立共享层：basic / races 两条管线**都**可依赖，本层永不 import 任一管线。

两管线取值不同的东西（限速表 DOMAIN_SLEEP、log_fetch 剥前缀的 base 列表）不写死在这里，
由各自 common.py 以形参注入（见 net.bind）；路径/站点/颜色等字面量常量单源 = constants。
"""
from .constants import (BASIC_JSON, COLORS, DATA_DIR, DEFAULT_SLEEP, HEADERS,
                        JBIS, JBIS_PEDIGREE_URL, JBIS_PROGENY_URL, NK,
                        NK_HORSE_URL, NK_LIST_URL, NK_RESULT_URL,
                        OVERRIDES_JSON, PEDIGREE_DIR, RACES_DATA_DIR,
                        RACE_SP_URL, RACE_SP_URL_NAR, ROOT, STUD, tmp_dir)
from .net import (domain_of, fetch, jitter, log_fetch, sleep_for, soup_of)
from .basic_io import (BASIC_FIELDS, BASIC_ORDER, BASIC_PIPELINE_FIELDS,
                       BASIC_TEMPLATE, clean_cache_all, load_basic, next_id,
                       read_cache, save_basic, tmp_path, write_cache)
from .manual import apply_overrides, load_overrides
from .text import ROMAN_FULL, norm, norm_mare

__all__ = [
    "BASIC_JSON", "COLORS", "DATA_DIR", "DEFAULT_SLEEP", "HEADERS",
    "JBIS", "JBIS_PEDIGREE_URL", "JBIS_PROGENY_URL", "NK",
    "NK_HORSE_URL", "NK_LIST_URL", "NK_RESULT_URL",
    "OVERRIDES_JSON", "PEDIGREE_DIR", "RACES_DATA_DIR",
    "RACE_SP_URL", "RACE_SP_URL_NAR", "ROOT", "STUD", "tmp_dir",
    "domain_of", "fetch", "jitter", "log_fetch", "sleep_for", "soup_of",
    "BASIC_FIELDS", "BASIC_ORDER", "BASIC_PIPELINE_FIELDS", "BASIC_TEMPLATE",
    "clean_cache_all", "load_basic", "next_id", "read_cache", "save_basic",
    "tmp_path", "write_cache",
    "apply_overrides", "load_overrides",
    "ROMAN_FULL", "norm", "norm_mare",
]
