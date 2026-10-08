#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立共享层：basic / races 两条管线**都**可依赖，本层永不 import 任一管线。

两管线取值不同的东西（限速表 DOMAIN_SLEEP、log_fetch 剥前缀的 base 列表、缓存目录）
不写死在这里，由各自 common.py 以形参注入（见 OPTIMIZATION_PLAN §3.2）。
"""
from .net import (COLORS, DEFAULT_SLEEP, HEADERS, domain_of, fetch, jitter,
                  log_fetch, sleep_for, soup_of)
from .paths import BASIC_JSON, DATA_DIR, OVERRIDES_JSON, ROOT, tmp_dir
from .basic_io import (BASIC_FIELDS, BASIC_ORDER, BASIC_PIPELINE_FIELDS,
                       BASIC_TEMPLATE, clean_cache_all, load_basic, next_id,
                       read_cache, save_basic, tmp_path, write_cache)
from .manual import apply_overrides, load_overrides
from .text import ROMAN_FULL, norm, norm_mare

__all__ = [
    "COLORS", "DEFAULT_SLEEP", "HEADERS", "domain_of", "fetch", "jitter",
    "log_fetch", "sleep_for", "soup_of",
    "BASIC_JSON", "DATA_DIR", "OVERRIDES_JSON", "ROOT", "tmp_dir",
    "BASIC_FIELDS", "BASIC_ORDER", "BASIC_PIPELINE_FIELDS", "BASIC_TEMPLATE",
    "clean_cache_all", "load_basic", "next_id", "read_cache", "save_basic",
    "tmp_path", "write_cache",
    "apply_overrides", "load_overrides",
    "ROMAN_FULL", "norm", "norm_mare",
]
