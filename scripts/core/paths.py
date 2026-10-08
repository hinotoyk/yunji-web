#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层路径：仓库根 / data / basic.json / 各管线缓存目录（管线名作参数）。"""
from pathlib import Path

CORE_DIR = Path(__file__).resolve().parent        # scripts/core/
SCRIPTS_DIR = CORE_DIR.parent                     # scripts/
ROOT = SCRIPTS_DIR.parent                           # 项目根
DATA_DIR = ROOT / "data"                            # 全部数据统一放根 data/
BASIC_JSON = DATA_DIR / "basic.json"
OVERRIDES_JSON = DATA_DIR / "manual_overrides.json"  # 人工维护表（脚本只读，人/编辑服务写）


def tmp_dir(pipeline):
    """管线缓存目录：data/_tmp/<pipeline>/（merge 后清空）。"""
    return DATA_DIR / "_tmp" / pipeline
