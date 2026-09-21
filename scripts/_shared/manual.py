#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层人工维护表 data/manual_overrides.json：抓取/派生之后最后套用，人工值优先。

两条管线收尾都要调用（scripts/basic/merge_basic.py 与 scripts/races/merge_races.py），
否则只跑 --basic 时人工钉住的 馬主/調教師/登録状態 会被抓取值整片抹掉。
契约与字段口径见 data/SCHEMA.md。
"""
import json

from . import paths


def load_overrides():
    """data/manual_overrides.json → {id: {字段: 值}}；文件不存在 → {}。"""
    if not paths.OVERRIDES_JSON.exists():
        return {}
    raw = json.loads(paths.OVERRIDES_JSON.read_text(encoding="utf-8"))
    return {str(k): v for k, v in raw.items()
            if not str(k).startswith("_") and isinstance(v, dict)}


def apply_overrides(h, overrides):
    """把该马的人工值套到记录上 → 返回被套字段名列表（无覆盖 → []）。
    '_' 前缀键（_orig 原值快照 / _note 钉住理由）只服务编辑态，不参与合并。"""
    ov = overrides.get(str(h.get("id"))) or {}
    hit = []
    for k, v in ov.items():
        if k.startswith("_") or v in (None, ""):
            continue
        h[k] = v
        hit.append(k)
    return hit
