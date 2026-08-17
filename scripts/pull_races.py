#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹·比赛数据流水线（与数据源无关）。

职责：数据源适配器 → 契约B 校验/去重/场地推导 → 规范快照 data/races/ledger.csv + 校验报告。
数据源如何变化只影响 scripts/adapters/*（见 docs/data-contracts.md），本脚本及下游零改动。

用法:
    python scripts/pull_races.py                    # 默认适配器 sheets_ledger
    python scripts/pull_races.py --adapter 适配器名  # 换数据源时指定
    python scripts/pull_races.py --no-write         # 只打印不写文件
"""
import argparse
import csv
import io
import os
import sys
from collections import Counter
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # 供 racelib / adapters 导入
from racelib import coerce_record  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RACES_DIR = os.path.join(DATA, "races")
ADAPTERS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapters")


def load_adapter(name):
    sys.path.insert(0, ADAPTERS_DIR)
    return __import__(name)


def build_report(records, issues, adapter_name):
    lines = ["# 同步校验报告", ""]
    lines.append(f"- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"- 数据源适配器: {adapter_name}")
    lines.append(f"- 有效记录: {len(records)} 条 / {len(set(r['出走馬名'] for r in records))} 匹")
    lines.append("")
    lines.append("## 场地类型分布")
    lines.append("| 类型 | 记录数 |")
    lines.append("|---|---|")
    for k, v in Counter(r["venue_type"] for r in records).most_common():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("## 级别分布")
    lines.append("| 级别 | 记录数 |")
    lines.append("|---|---|")
    for k, v in Counter(r["格"] for r in records if r["格"]).most_common():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("## 比赛类别分布")
    lines.append("| 类别 | 记录数 |")
    lines.append("|---|---|")
    for k, v in Counter(r["race_class"] for r in records).most_common():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("## 异常清单")
    if not issues:
        lines.append("- 无")
    else:
        for it in issues:
            lines.append(f"- **{it['type']}**: {it}")
    lines.append("")
    lines.append("## 说明")
    lines.append("- 取消/除外不计入出赛数；中止计入（汇总在 build-data 阶段计算）")
    lines.append("- 本报告只反映台账健康度；马匹关联/覆盖情况见 build-data 的 merge-report.md")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="云迹·比赛数据流水线（适配器 → 契约B → ledger.csv）")
    ap.add_argument("--adapter", default="sheets_ledger", help="数据源适配器名（scripts/adapters/ 下）")
    ap.add_argument("--no-write", action="store_true", help="只打印不写文件")
    args = ap.parse_args()

    adapter = load_adapter(args.adapter)
    print(f"① 适配器 [{args.adapter}] 拉取数据源 …")
    raw_rows = adapter.fetch()
    print(f"✔ 原始行数: {len(raw_rows)}")

    print("② 契约B 校验/类型化 …")
    records, issues = [], []
    for row in raw_rows:
        rec = coerce_record(row, issues)
        if rec:
            records.append(rec)

    # 去重（同 日付+場名+R+馬名）
    seen, dedup = set(), []
    for r in records:
        key = (r["日付"], r["場名"], r["R"], r["出走馬名"])
        if key in seen:
            issues.append({"type": "重复行", "馬名": r["出走馬名"], "日付": r["日付"], "場名": r["場名"], "R": r["R"]})
        else:
            seen.add(key)
            dedup.append(r)
    records = sorted(dedup, key=lambda x: (x["日付"], x["場名"], x["R"]))

    names = [r["出走馬名"] for r in records]
    print(f"✔ 有效记录: {len(records)} 条 / {len(set(names))} 匹马 · 异常: {len(issues)} 条")

    print("③ 写 ledger.csv + sync-report.md …")
    report = build_report(records, issues, args.adapter)
    if not args.no_write:
        os.makedirs(RACES_DIR, exist_ok=True)
        with open(os.path.join(RACES_DIR, "ledger.csv"), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(records[0].keys()) if records else [])
            w.writeheader()
            w.writerows(records)
        with open(os.path.join(DATA, "sync-report.md"), "w", encoding="utf-8") as f:
            f.write(report)
        print(f"✔ 已写: data/races/ledger.csv（{len(records)} 条）")
        print(f"✔ 已写: data/sync-report.md")
    else:
        print("[dry-run] 未写文件")

    print("\n===== 台账统计 =====")
    print("场地类型:", dict(Counter(r["venue_type"] for r in records)))
    print("级别分布:", dict(Counter(r["格"] for r in records if r["格"])))
    print("比赛类别:", dict(Counter(r["race_class"] for r in records)))
    print(f"涉及马匹: {len(set(names))}")


if __name__ == "__main__":
    main()
