#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""M1.1 身份映射表种子生成：从现有 data/crops.json（v1 裸数组）生成 data/registry.json。

每个马一条记录（见 data-funnel-v2.md §3.1）：
  id      = **按生年月日从小到大排序后的序号 1..N**（最年长 = 1；一次性种子，
            此后由 build-data.py 维护 max+1 自增；生年月日缺失退回生年）
  keys    = {nk_id, jbis_id}（外部键 → 本地 id 映射；id 是身份，外部 id 只是属性）
  names   = [当前马名]（首位即当前名；改名时 build-data 追加新名，旧名=曾用名）
  生年     = 生年
  created / updated = 今天
  未命名   = true（马名为占位名：〇〇の2025 或 母名＿2025）

用法:
    python scripts/tools/build_registry.py          # 生成（已存在则拒绝，需 --force）
    python scripts/tools/build_registry.py --force  # 覆盖重建（会丢失改名历史，慎用）
"""
import argparse
import io
import json
import os
import re
import sys
from datetime import datetime

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 供 racelib 导入
import racelib  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")
REGISTRY_PATH = os.path.join(DATA, "registry.json")
CROPS_PATH = os.path.join(DATA, "crops.json")


def _norm(name):
    return re.sub(r"[ 　()（）\[\]【】]", "", name or "").strip()


def generate_registry_seed(crops, updated=None):
    """crops（裸数组）→ {"horses": [...], "updated": "..."}。
    id = 按生年月日（缺失退生年）从小到大排序后的序号；并列按马名稳定排序。
    """
    updated = updated or datetime.now().strftime("%Y-%m-%d")
    ordered = sorted(crops, key=lambda h: (racelib.birth_date_key(h), _norm(h.get("馬名", ""))))
    horses = []
    for i, h in enumerate(ordered, 1):
        name = h.get("馬名", "")
        horses.append({
            "id": i,
            "keys": {"nk_id": h.get("nk_id", "") or "", "jbis_id": h.get("jbis_id", "") or ""},
            "names": [name],
            "生年": h.get("生年", "") or "",
            "created": updated,
            "updated": updated,
            "未命名": racelib.is_unnamed_name(name),
        })
    return {"horses": horses, "updated": updated}


def main():
    ap = argparse.ArgumentParser(description="生成身份映射表种子（M1.1）")
    ap.add_argument("--force", action="store_true", help="覆盖已有 registry.json（丢失改名历史，慎用）")
    args = ap.parse_args()

    if os.path.exists(REGISTRY_PATH) and not args.force:
        sys.exit("❌ data/registry.json 已存在：不覆盖（改名历史不可重建）。确认请加 --force")

    if not os.path.exists(CROPS_PATH):
        sys.exit("❌ 无 data/crops.json：先运行 python scripts/build-data.py")

    with open(CROPS_PATH, encoding="utf-8") as f:
        crops = json.load(f)

    seed = generate_registry_seed(crops)
    ids = [h["id"] for h in seed["horses"]]
    if len(ids) != len(set(ids)):
        sys.exit("❌ 种子 id 非唯一，终止")

    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)

    unnamed = sum(1 for h in seed["horses"] if h["未命名"])
    print(f"✔ 已生成: data/registry.json")
    print(f"✔ 根对象: {{horses: {len(seed['horses'])}, updated: {seed['updated']}}}（jq length = 1）")
    print(f"✔ id 唯一: {len(set(ids))} 条")
    print(f"✔ 未命名仔标记: {unnamed} 匹")


if __name__ == "__main__":
    main()
