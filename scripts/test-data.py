#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据测试：小样本抽样验证（每类 2-3 匹），不做全量。
测试原则：全量抓取由人工跑（Actions 按钮 / 命令行），测试只做抽样冒烟。
用法:
    python scripts/test-data.py                # 本地数据校验（raw + crops.json，每类抽样）
    python scripts/test-data.py --smoke        # 网络冒烟：每类抽 2-3 匹实际抓取验证
"""
import argparse
import csv
import io
import json
import os
import random
import re
import sys
import time
from pathlib import Path

_ORIG_STDOUT = sys.stdout               # 防 GC：包装后原对象仍被引用
sys.stdout = io.TextIOWrapper(_ORIG_STDOUT.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SAMPLE = 3                      # 每类抽样匹数（测试用，勿改大全量）

# 分类规则：命名 netkeiba / 未命名仔 / JBIS 兜底 / 台账建档
def is_unnamed(name):
    return bool(re.search(r"の(19|20)\d\d$", name or ""))

def classify(h):
    if not h.get("nk_id") and not h.get("jbis_id") and h.get("races"):
        return "ledger_created"
    if not h.get("nk_id"):
        return "jbis_only"
    if is_unnamed(h.get("馬名")):
        return "unnamed"
    return "named"

def sample_of(records, cls, n=SAMPLE):
    pool = [h for h in records if classify(h) == cls]
    rng = random.Random(42)
    rng.shuffle(pool)
    return pool[:n]

def check_ledger_horse(h, out):
    """台账建档马：只要求有履历（血统/基本信息本来就没有）"""
    ok = True
    if not h.get("races"):
        out.append(f"  ✗ {h.get('馬名', '?')}: 台账建档马无履历")
        ok = False
    return ok

def check_horse(h, out):
    name = h.get("馬名", "?")
    ok = True
    p = h.get("pedigree") or {}
    if not p.get("父"):
        out.append(f"  ✗ {name}: 无血统")
        return False
    for side in ("父", "母"):
        for d, row in enumerate(p.get(side) or []):
            if len(row) != 2 ** d:
                ok = False
                out.append(f"  ✗ {name} {side} G{d+1}: {len(row)} 格 ≠ {2**d}")
    if not h.get("生年"):
        ok = False
        out.append(f"  ✗ {name}: 缺生年")
    return ok

def local_check():
    out = []
    crops = json.loads((ROOT / "data" / "crops.json").read_text(encoding="utf-8"))
    nk = json.loads((RAW / "netkeiba.json").read_text(encoding="utf-8"))
    jb = json.loads((RAW / "jbis.json").read_text(encoding="utf-8"))
    out.append(f"✔ 数据量: netkeiba {len(nk)} / jbis 兜底 {len(jb)} / crops {len(crops)}")
    classes = {"named": [], "unnamed": [], "jbis_only": [], "ledger_created": []}
    for h in crops:
        classes[classify(h)].append(h)
    for cls, label in (("named", "命名马(netkeiba源)"), ("unnamed", "未命名仔"),
                       ("jbis_only", "JBIS兜底"), ("ledger_created", "台账建档")):
        pool = classes[cls]
        out.append(f"✔ {label}: {len(pool)} 匹 → 抽样 {min(SAMPLE, len(pool))} 匹")
        ok_all = True
        checker = check_ledger_horse if cls == "ledger_created" else check_horse
        for h in sample_of(pool, cls):
            ok_all = checker(h, out) and ok_all
        if ok_all:
            out.append(f"  ✓ {label} 抽样全部通过")
    with_ped = sum(1 for h in crops if h.get("pedigree", {}).get("父"))
    out.append(f"✔ 血统覆盖: {with_ped}/{len(crops)}")
    return out

def smoke(netkeiba_sleep=1.0, jbis_sleep=1.5):
    """网络冒烟：每类抽 2-3 匹实抓验证（不写库，仅解析验证）"""
    sys.path.insert(0, str(ROOT / "scripts"))
    out = []
    spec_import = __import__("importlib.util").util
    def load(name):
        spec = spec_import.spec_from_file_location(name, str(ROOT / "scripts" / f"{name}.py"))
        mod = spec_import.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)      # 脚本 stdout 包装已幂等（utf-8 时跳过）
        return mod

    nk = json.loads((RAW / "netkeiba.json").read_text(encoding="utf-8"))
    jb = json.loads((RAW / "jbis.json").read_text(encoding="utf-8"))
    crops = json.loads((ROOT / "data" / "crops.json").read_text(encoding="utf-8"))

    snk = load("scrape_netkeiba")
    out.append("── netkeiba 血统冒烟（抽 3 匹）──")
    for h in sample_of(crops, "named") + sample_of(crops, "unnamed")[:1]:
        try:
            html = snk.fetch(snk.PEDIGREE_URL.format(id=h["nk_id"]))
            r = snk.parse_pedigree(html)
            n = sum(len(x) for x in (r["pedigree"].get("父", []) + r["pedigree"].get("母", [])))
            ok = "✓" if n >= 60 else "⚠"
            out.append(f"  {ok} {h['馬名']}: {n} 格 fno={r['fno'] or '-'}")
        except Exception as e:
            out.append(f"  ✗ {h['馬名']}: {e}")
        time.sleep(netkeiba_sleep)

    sjb = load("scrape_jbis")
    out.append("── JBIS 兜底冒烟（抽 2 匹）──")
    for h in sample_of(crops, "jbis_only")[:2]:
        try:
            html = sjb.fetch(sjb.HORSE_URL.format(id=h["jbis_id"]))
            d = sjb.parse_detail(html)
            ped = sjb.parse_pedigree(sjb.fetch(sjb.PEDIGREE_URL.format(id=h["jbis_id"])))
            n = sum(len(x) for x in (ped["pedigree"].get("父", []) + ped["pedigree"].get("母", [])))
            out.append(f"  ✓ {h['馬名']}: 详情={d['生年月日'] or '-'} ped={n}格 fno={ped['fno'] or '-'}")
        except Exception as e:
            out.append(f"  ✗ {h['馬名']}: {e}")
        time.sleep(jbis_sleep)
    return out

def contract_check():
    """契约B/契约C 全量断言（见 docs/data-contracts.md）——数据源换格式立刻报错，不静默"""
    out = []
    sys.path.insert(0, str(ROOT / "scripts"))
    import racelib

    # ── 契约B：ledger.csv 全量校验 ──
    ledger_path = ROOT / "data" / "races" / "ledger.csv"
    if ledger_path.exists():
        issues = []
        with open(ledger_path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        recs = []
        for row in rows:
            rec = racelib.coerce_record(row, issues)
            if rec:
                recs.append(rec)
        for it in issues:
            out.append(f"  ✗ 契约B ledger 校验: **{it['type']}**: {it}")
        for r in recs:
            if r["venue_type"] not in ("中央", "地方", "海外"):
                out.append(f"  ✗ 契约B venue_type 异常: {r['出走馬名']} {r['日付']} → {r['venue_type']}")
            if r["格"] not in ("", *racelib.GRADES):
                out.append(f"  ✗ 契约B 格 异常: {r['出走馬名']} {r['日付']} → {r['格']}")
            if r["馬場"] not in ("芝", "ダート", "AW", ""):
                out.append(f"  ✗ 契约B 馬場 异常: {r['出走馬名']} {r['日付']} → {r['馬場']}")
            if not (isinstance(r["結果"], int) or r["結果"] in racelib.RESULT_DNF):
                out.append(f"  ✗ 契约B 結果 异常: {r['出走馬名']} {r['日付']} → {r['結果']}")
            if r["賞金"] is None or r["賞金"] < 0:
                out.append(f"  ✗ 契约B 賞金 异常: {r['出走馬名']} {r['日付']}")
        if not issues and recs:
            out.append(f"✔ 契约B ledger.csv 通过（{len(recs)} 条 / {len(set(r['出走馬名'] for r in recs))} 匹，0 异常）")
    else:
        out.append("⚠ 无 data/races/ledger.csv，跳过契约B（先跑 python scripts/pull_races.py）")

    # ── 契约C：crops.json races/stats 一致性（逐匹） ──
    crops = json.loads((ROOT / "data" / "crops.json").read_text(encoding="utf-8"))
    bad = 0
    for h in crops:
        races = h.get("races") or []
        if not races:
            continue
        s = h.get("stats") or {}
        started = sum(1 for r in races if isinstance(r.get("結果"), int) or r.get("結果") == "中止")
        wins = sum(1 for r in races if r.get("結果") == 1)
        prize = sum(r.get("賞金") or 0 for r in races)
        dates = [r["日付"] for r in races]
        if s.get("出賽数") != started:
            bad += 1
            out.append(f"  ✗ 契约C {h.get('馬名')}: 出賽数 {s.get('出賽数')} ≠ 履历 {started}")
        if s.get("勝") != wins:
            bad += 1
            out.append(f"  ✗ 契约C {h.get('馬名')}: 勝 {s.get('勝')} ≠ 履历 {wins}")
        if s.get("賞金合計") != prize:
            bad += 1
            out.append(f"  ✗ 契约C {h.get('馬名')}: 賞金合計 {s.get('賞金合計')} ≠ 履历 {prize}")
        if s.get("初出走") != min(dates) or s.get("最終出走") != max(dates):
            bad += 1
            out.append(f"  ✗ 契约C {h.get('馬名')}: 首末战不符")
    if bad == 0:
        out.append("✔ 契约C crops.json races/stats 逐匹一致")
    return out


def main():
    ap = argparse.ArgumentParser(description="小样本数据测试（每类 2-3 匹，非全量）")
    ap.add_argument("--smoke", action="store_true", help="网络冒烟测试（实抓验证，勿全量）")
    args = ap.parse_args()
    out = local_check()
    out.extend(contract_check())
    if args.smoke:
        out.extend(smoke())
    print("\n".join(out))
    fail = [l for l in out if l.lstrip().startswith("✗")]
    if fail:
        sys.exit(f"❌ {len(fail)} 项失败")
    print("✔ 测试通过（抽样 + 契约校验）")

if __name__ == "__main__":
    main()
