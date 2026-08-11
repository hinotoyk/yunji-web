#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ContrailCrops.json → data/crops.json
字段归一化：近况合并字段 → "近况"；价格从备考派生；评价取近况首段。
用法：python scripts/convert_crops.py [源json] [目标json]
"""
import json, re, sys
from pathlib import Path

SRC = Path(r"Z:\IdeaProjects\contrail_progeny\tampermonkey-project\data\ContrailCrops.json")
DST = Path(__file__).resolve().parent.parent / "data" / "crops.json"

PRICE_RE = re.compile(r"精选拍卖会价格[：:]\s*(\d+(?:\.\d+)?)e")
TOTAL_RE = re.compile(r"总价\s*(\d+(?:\.\d+)?)([ew])")


def derive_price(b):
    if not b:
        return "—"
    m = PRICE_RE.search(b)
    if m:
        return f"精选拍卖会 {m.group(1)}亿"
    m = TOTAL_RE.search(b)
    if m:
        u = "亿" if m.group(2) == "e" else "万"
        return f"募集 {m.group(1)}{u}"
    return "—"


def split_kin(s):
    if not s or not s.strip():
        return []
    return [p.strip() for p in s.split("・") if p.strip()]


def derive_eval(kin):
    for p in kin:
        nl = p.find("\n")
        label = p[:nl] if nl >= 0 else p
        if re.match(r"^(\d{1,2}月\d{1,2}|2[0-9]|1[0-9]|[0-9]+\.[0-9]+)", label):
            continue
        body = p[nl + 1:] if nl >= 0 else ""
        if body:
            return body
    return ""


def convert(src, dst):
    raw = json.loads(src.read_text(encoding="utf-8"))
    out = []
    for x in raw:
        kin = split_kin(x.get("近况更新/近走/牧场评价"))
        out.append({
            "馬名": x.get("馬名", ""),
            "译名": x.get("译名", ""),
            "馬主": x.get("馬主", ""),
            "性別": x.get("性別", ""),
            "毛色": x.get("毛色", ""),
            "母名": x.get("母名", ""),
            "母父名": x.get("母父名", ""),
            "生产牧场": x.get("生产牧场", ""),
            "管理調教師": x.get("管理調教師", ""),
            "近况": "\n".join(kin),
            "评价": derive_eval(kin),
            "价格": derive_price(x.get("备考", "")),
            "血统分析": x.get("血统分析", ""),
            "备考": x.get("备考", ""),
            "_source": x.get("_source", ""),
        })
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"ok: {len(out)} 匹 → {dst}")


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else DST
    convert(src, dst)
