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
    """写 basic.json（更新 _meta）。

    `updated` = **数据实质变化时间**（2026-10-02 定稿）：马匹内容与磁盘现状等值时保留旧时间戳，
    不盖新钟——deploy.yml 每次部署都幂等重跑 merge_basic，若每次都换时间戳，部署落库步骤
    （重算产物 commit 回 main）会因纯时间戳 diff 永远循环。实质有变化才进新钟。"""
    prev_meta, prev_horses = None, None
    try:
        prev = json.loads(paths.BASIC_JSON.read_text(encoding="utf-8"))
        prev_meta, prev_horses = prev.get("_meta"), prev.get("horses")
    except (OSError, json.JSONDecodeError, ValueError):
        pass
    stamp_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if prev_horses == data["horses"] and isinstance(prev_meta, dict) and prev_meta.get("updated"):
        updated = prev_meta["updated"]
    else:
        updated = stamp_now
    data["_meta"] = {
        "schema": "basic/v1",
        "updated": updated,
        "count": len(data["horses"]),
    }
    paths.DATA_DIR.mkdir(parents=True, exist_ok=True)
    paths.BASIC_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def next_id(data):
    """下一个自增主键（从 1 开始）。"""
    return max((h["id"] for h in data["horses"]), default=0) + 1


def move_after(h, field, anchor):
    """键序归位：field 紧跟 anchor 之后（只动键序，不动值；缺任一侧则不动）。
    与 scripts/races/merge_races.py 同名 helper 同语义（此处为落库序的单一出处）。"""
    keys = list(h.keys())
    if field not in keys or anchor not in keys:
        return
    keys.remove(field)
    keys.insert(keys.index(anchor) + 1, field)
    if keys == list(h.keys()):
        return
    for k in keys:
        h[k] = h.pop(k)


def order_horse(h, drop=()):
    """按契约列序重排单匹马（2026-10-02 定稿）：键序 = BASIC_ORDER，模板外键（含派生列）
    追加在末尾，再把派生列 BASIC_DERIVED_TAIL 归位到各自锚点之后。

    ⚠ 这是 basic.json 落库键序的**单一出处**：写盘的两条管线（scripts/basic/merge_basic.py 与
    scripts/races/merge_races.py）必须产出同一键序。此前 merge_basic 把派生列留在模板外尾部、
    merge_races 用 move_after 归位，两序并存 → 值全等却恒有 5000+ 行纯键序 diff，
    会让 deploy.yml 的产物落库步骤每次部署都 commit（键序抖动，无实质变化）。
    drop：不保留的旧字段名集合（如改名后的 獲得賞金 系列）。
    """
    extra = {k: v for k, v in h.items() if k not in BASIC_ORDER and k not in drop}
    reordered = {k: h.get(k, "") for k in BASIC_ORDER}
    reordered.update(extra)
    h.clear()
    h.update(reordered)
    for field, anchor in (("性別_当前", "性別"), ("通算成績_逐场", "通算成績")):
        move_after(h, field, anchor)


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
