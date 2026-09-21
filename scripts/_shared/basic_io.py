#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层 basic.json 读写 + 字段模板 + 并发缓存四件套。

BASIC_FIELDS 是 basic.json 字段契约的**唯一出处**（键序 = 落库列序）：
  建档模板 BASIC_TEMPLATE 与合并重排列序 BASIC_ORDER 都由它投影得到。
缓存写独立文件（data/_tmp/<管线>/），避免并发覆盖 basic.json；目录由调用方注入。
"""
import json
from datetime import datetime

from . import paths

# (字段, 建档默认值)：键序 = 落库列序
BASIC_FIELDS = [
    ("id", None),
    ("nk_id", ""),
    ("jbis_id", ""),
    ("馬名", ""),
    ("欧字馬名", ""),
    ("香港馬名", ""),
    ("自译馬名", ""),
    ("母名", ""),
    ("母父", ""),                                   # merge_basic 由血统图 derive
    ("生年", ""),
    ("馬名意味", ""),
    ("登録状態", ""),
    ("性別", ""),
    ("性別_当前", ""),                              # merge_races 3b 派生（官方 性別 是登录值），归位在 性別 之后
    ("毛色", ""),
    ("馬齢", ""),
    ("生年月日", ""),
    ("産地", ""),
    ("馬主", ""),
    ("調教師", ""),
    ("生産牧場", ""),
    ("通算成績", ""),
    ("通算成績_逐场", {}),                          # merge_races 3d 派生：全站通算战绩唯一展示源，归位在 通算成績 之后
    ("獲得賞金 (中央)", ""),
    ("獲得賞金 (地方)", ""),
    ("総賞金", ""),
    ("収得賞金", ""),                               # merge_races 由逐场本賞金统一计算
    ("セリ取引価格", ""),
    ("photo", ""),
    ("races_file", ""),
    ("pedigree_file", ""),
]

# 建档不预置的列：由竞赛/合并环节写入（建档时无值可写）
BASIC_PIPELINE_FIELDS = {"母父", "馬齢", "収得賞金"}
# 建档占位、但不进固定列序的派生列：重排时作为「模板外键」追加，位置由 merge_races.move_after 归位
BASIC_DERIVED_TAIL = ("性別_当前", "通算成績_逐场")

BASIC_ORDER = [k for k, _ in BASIC_FIELDS if k not in BASIC_DERIVED_TAIL]
BASIC_TEMPLATE = {k: d for k, d in BASIC_FIELDS if k not in BASIC_PIPELINE_FIELDS}


# ---------------- basic.json 读写 ----------------
def load_basic():
    """读 basic.json → {_meta, horses}；不存在则返回空骨架。"""
    if not paths.BASIC_JSON.exists():
        return {"_meta": {"schema": "basic/v1", "updated": "", "count": 0}, "horses": []}
    data = json.loads(paths.BASIC_JSON.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "horses" in data:
        return data
    return {"_meta": {"schema": "basic/v1", "updated": "", "count": len(data)}, "horses": data}


def save_basic(data):
    """写 basic.json（更新 _meta）。"""
    data["_meta"] = {
        "schema": "basic/v1",
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(data["horses"]),
    }
    paths.DATA_DIR.mkdir(parents=True, exist_ok=True)
    paths.BASIC_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def next_id(data):
    """下一个自增主键（从 1 开始）。"""
    return max((h["id"] for h in data["horses"]), default=0) + 1


# ---------------- 并发缓存（写独立文件，避免并发覆盖 basic.json） ----------------
def tmp_path(name, tmp_dir):
    """缓存文件路径：<tmp_dir>/<name>.json"""
    return tmp_dir / f"{name}.json"


def write_cache(name, mapping, tmp_dir):
    """把 {id: 值} 映射写入独立缓存文件。可被并发脚本安全使用（互不覆盖）。"""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path(name, tmp_dir).write_text(json.dumps(mapping, ensure_ascii=False, indent=1), encoding="utf-8")


def read_cache(name, tmp_dir):
    """读缓存文件 → dict；不存在返回 {}。"""
    p = tmp_path(name, tmp_dir)
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def clean_cache_all(tmp_dir):
    """合并完成后删除全部缓存（_tmp 目录）。"""
    if tmp_dir.exists():
        for f in tmp_dir.glob("*.json"):
            f.unlink()
