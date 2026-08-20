#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹·比赛差异比对：契约B(台账) vs 契约D(netkeiba成绩页) → data/race-diffs.json + 报告。

匹配键：馬名 + 日付 + R（場名 二次校验）。字段级比对，比对前归一化：
- 状態：netkeiba "稍" → "稍重"（源站空格截断）
- 賞金：netkeiba 万円 ×10000 → 円（与台账口径一致）
- 数字字段：int/float 规范化后比较

输出：
    data/race-diffs.json      差异清单（每条 pending，供审核页 review.html 裁决）
    data/race-diffs-report.md 差异汇总报告

用法:
    python scripts/compare-races.py              # 全量比对
    python scripts/compare-races.py --limit 10   # 只比前 10 匹（调试）
"""
import argparse
import csv
import io
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import racelib  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# 双方共有、需要比对的字段（值域以契约为准）
FIELDS = [
    "日付", "場名", "天気", "R", "レース名", "頭数", "人気", "オッズ", "着順",
    "騎手", "斤量", "距離", "馬場", "状態", "タイム", "着差", "上り", "馬体重", "賞金",
]
# 台账缺、netkeiba 独有的字段（不比对，作补强提示）
D_ONLY = ["枠番", "馬番", "通過", "ペース", "増減"]

# 台账列名 → 比对字段名（比对字段以 netkeiba 侧为准）
B_MAP = {"天候": "天気", "競走名": "レース名", "結果": "着順", "単勝": "オッズ"}


def norm_value(field, v):
    """比对前归一化（返回可比较的规范化值）"""
    if v is None or v == "":
        return None
    if field == "状態":
        # netkeiba 简写：稍→稍重 不→不良
        return {"稍": "稍重", "不": "不良"}.get(str(v).strip(), str(v).strip() or None)
    if field == "着順" and isinstance(v, str):
        # netkeiba 简写：除→除外 中→中止 取→取消
        return {"除": "除外", "中": "中止", "取": "取消"}.get(v.strip(), v.strip())
    if field == "賞金":
        try:
            return int(float(str(v).replace(",", "")))
        except (ValueError, TypeError):
            return None
    if field in ("R", "頭数", "人気", "馬体重", "距離"):
        try:
            return int(str(v).replace(",", ""))
        except (ValueError, TypeError):
            return str(v).strip()
    if field in ("斤量", "オッズ"):
        try:
            return float(str(v).replace(",", ""))
        except (ValueError, TypeError):
            return str(v).strip()
    return str(v).strip()


def normalize_b(row):
    """契约B(台账) → 比对字段 dict（台账列名 → 比对字段名）"""
    out = {}
    for f in FIELDS:
        src = f
        for ledger_col, cmp_field in B_MAP.items():
            if cmp_field == f:
                src = ledger_col
                break
        out[f] = norm_value(f, row.get(src))
    return out


def normalize_d(row):
    """契约D(netkeiba) → 比对字段 dict（賞金 万円→円）"""
    out = {}
    for f in FIELDS:
        v = row.get(f)
        if f == "賞金" and v not in (None, ""):
            try:
                v = int(float(v) * 10000)
            except (ValueError, TypeError):
                pass
        out[f] = norm_value(f, v)
    return out


def load_ledger():
    path = os.path.join(DATA, "races", "ledger.csv")
    issues = []
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rec = racelib.coerce_record(row, issues)
            if rec:
                rows.append(rec)
    return rows


def main():
    ap = argparse.ArgumentParser(description="云迹·比赛差异比对（契约B vs 契约D）")
    ap.add_argument("--limit", type=int, help="调试：只比前 n 匹")
    args = ap.parse_args()

    # 1. 加载
    ledger = load_ledger()
    with open(os.path.join(DATA, "raw", "netkeiba_races.json"), encoding="utf-8") as f:
        nk_db = json.load(f)
    with open(os.path.join(DATA, "crops.json"), encoding="utf-8") as f:
        crops = json.load(f)
    name2nk = {h.get("馬名", ""): h.get("nk_id", "") for h in crops}

    # 2. 按马分组
    by_horse = {}
    for row in ledger:
        by_horse.setdefault(row["出走馬名"], []).append(row)
    if args.limit:
        by_horse = dict(list(by_horse.items())[:args.limit])

    diffs = []
    stats = Counter()
    d_only_total = Counter()

    for name, brows in by_horse.items():
        nk_id = name2nk.get(name, "")
        if not nk_id:
            stats["无netkeiba对照(海外/无nk_id)"] += len(brows)
            continue
        drows = nk_db.get(nk_id, [])
        bmap = {}
        for b in brows:
            bmap.setdefault((b["日付"], int(b["R"]) if str(b["R"]).isdigit() else b["R"]), []).append(b)
        dmap = {}
        dmap2 = {}  # R 为空（海外赛）时按 日付+場名 匹配
        for d in drows:
            key = (d["日付"], int(d["R"]) if str(d["R"]).isdigit() else d["R"])
            dmap.setdefault(key, []).append(d)
            if d["R"] in (None, ""):
                dmap2.setdefault((d["日付"], d["場名"]), []).append(d)

        consumed_d = set()
        for key, blist in bmap.items():
            dlist = dmap.get(key, []) or dmap2.get((key[0], blist[0]["場名"]), [])
            if not dlist:
                for b in blist:
                    diffs.append({"馬名": name, "race_key": "%s|%s|%s" % (b["日付"], b["場名"], b["R"]),
                                  "field": "__row__", "ledger": "台账有", "netkeiba": "netkeiba无", "action": "pending"})
                    stats["台账有/netkeiba无"] += 1
                continue
            for d in dlist:
                consumed_d.add((d["日付"], d["R"]))
            # 一对多时取第一条（正常一对一）
            for b in blist:
                d = dlist[0]
                bn, dn = normalize_b(b), normalize_d(d)
                if bn.get("場名") and dn.get("場名") and bn["場名"] != dn["場名"]:
                    diffs.append({"馬名": name, "race_key": "%s|%s|%s" % (b["日付"], b["場名"], b["R"]),
                                  "field": "場名", "ledger": bn["場名"], "netkeiba": dn["場名"], "action": "pending"})
                    stats["场次匹配(場名不一致)"] += 1
                for f in FIELDS:
                    if f == "場名":
                        continue
                    bv, dv = bn.get(f), dn.get(f)
                    if f == "賞金" and bv in (None, 0) and dv in (None, 0):
                        continue  # 双方都无赏金 → 视为一致
                    if bv != dv:
                        diffs.append({"馬名": name, "race_key": "%s|%s|%s" % (b["日付"], b["場名"], b["R"]),
                                      "field": f, "ledger": bv, "netkeiba": dv, "action": "pending"})
                        stats[f] += 1
        for key, dlist in dmap.items():
            if key in bmap or key in consumed_d:
                continue
            for d in dlist:
                diffs.append({"馬名": name, "race_key": "%s|%s|%s" % (d["日付"], d["場名"], d["R"]),
                              "field": "__row__", "ledger": "台账无", "netkeiba": "netkeiba有", "action": "pending"})
                stats["netkeiba有/台账无"] += 1
        # netkeiba 独有字段（补强提示，不算差异）
        for d in drows:
            for f in D_ONLY:
                if d.get(f) not in (None, ""):
                    d_only_total[f] += 1

    # 3. 输出
    diffs_path = os.path.join(DATA, "race-diffs.json")
    with open(diffs_path, "w", encoding="utf-8") as f:
        json.dump(diffs, f, ensure_ascii=False, indent=1)

    lines = ["# 比赛差异比对报告（契约B vs 契约D）", ""]
    lines.append(f"- 比对马匹: {len(by_horse)} 匹")
    lines.append(f"- 总差异: {len(diffs)} 条（待审核，action=pending）")
    lines.append("")
    lines.append("## 差异分布（按类型/字段）")
    for k, v in stats.most_common():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## netkeiba 独有字段覆盖（台账无此列，可作补强）")
    for k, v in d_only_total.most_common():
        lines.append(f"- {k}: {v} 条")
    lines.append("")
    lines.append("## 差异最多的马（前 15）")
    for name, n in Counter(d["馬名"] for d in diffs).most_common(15):
        lines.append(f"- {name}: {n} 条")
    report_path = os.path.join(DATA, "race-diffs-report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"✔ 比对 {len(by_horse)} 匹 → 差异 {len(diffs)} 条")
    for k, v in stats.most_common():
        print(f"   {k}: {v}")
    print(f"✔ 已写: data/race-diffs.json / data/race-diffs-report.md")


if __name__ == "__main__":
    main()
