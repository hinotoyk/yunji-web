#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层人工维护表 data/manual_overrides.json：抓取/派生之后最后套用，人工值优先。

两条管线收尾都要调用（scripts/basic/merge_basic.py 与 scripts/races/merge_races.py），
否则只跑 --basic 时人工钉住的 馬主/調教師/登録状態 会被抓取值整片抹掉。
契约与字段口径见 docs/SCHEMA.md。
"""
import json

from . import constants


def load_overrides():
    """data/manual_overrides.json → {id: {字段: 值}}；文件不存在 → {}。"""
    if not constants.OVERRIDES_JSON.exists():
        return {}
    raw = json.loads(constants.OVERRIDES_JSON.read_text(encoding="utf-8"))
    return {str(k): v for k, v in raw.items()
            if not str(k).startswith("_") and isinstance(v, dict)}


def apply_overrides(h, overrides):
    """把该马的人工值套到记录上 → 返回被套字段名列表（无覆盖 → []）。
    '_' 前缀键（_orig 原值快照 / _note 钉住理由）只服务编辑态，不参与合并。
    抹消组（constants.MASYO_GROUP_KEYS）双写入者逐键合并（2026-10 定稿）：
    - 人工表条目里出现的键 → 人工值覆盖；值为空 → 显式清空该键
    - 条目里没有的键 → basic.json 已有值原样保留（scripts/status 任务的写入层；
      旧语义「有条目即整组重置」会把任务补的 種別/場所 一并洗掉，弃用）"""
    ov = overrides.get(str(h.get("id"))) or {}
    hit = []
    for k in constants.MASYO_GROUP_KEYS:          # 抹消组：逐键合并（人工键覆盖/显式清空，其余保留）
        if k not in ov:
            continue
        v = ov[k]
        if v in (None, ""):
            if k in h:
                del h[k]
                hit.append(k)
        elif str(h.get(k, "")) != str(v):
            h[k] = v
            hit.append(k)
    for k, v in ov.items():                       # 其余人工键（photo/香港馬名/登録状態…）：非空覆盖
        if k.startswith("_") or v in (None, ""):
            continue
        if str(h.get(k, "")) != str(v):
            h[k] = v
            hit.append(k)
    return hit
