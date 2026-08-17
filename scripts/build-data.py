#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹数据构建：netkeiba 主数据（基础+血统）+ JBIS 兜底/血统增强 → data/crops.json + manifest + 快照。
合并规则：
- 基础信息：netkeiba 优先；netkeiba 无记录（如 Hazey Jane）→ JBIS 兜底（jbis.json）
- 血统图：netkeiba 优先（404 匹全量）；netkeiba 无记录 → JBIS（jbis.json）
- FNo/クロス：netkeiba FNo 优先，JBIS 补充（jbis.json / jbis_pedigree.json 增强）
用法:
    python scripts/build-data.py                    # 从 data/raw/*.json 重建
    python scripts/build-data.py --note "手动更新"  # 备注
    python scripts/build-data.py --no-snapshot      # 不生成新快照
"""
import argparse
import csv
import io
import json
import os
import re
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # 供 racelib 导入
import racelib  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
HISTORY = os.path.join(ROOT, "history")
RAW = os.path.join(ROOT, "data", "raw")
RACES_DIR = os.path.join(DATA, "races")

# 前端展示用字段
FIELDS = [
    "nk_id", "jbis_id", "馬名", "性別", "生年月日", "毛色", "産地",
    "馬主", "生産牧場", "調教師", "通算成績", "獲得賞金", "総賞金",
    "母名", "母父名", "生年", "登録状態",
    "pedigree", "fno", "cross",
]


def load_raw(name):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm(name):
    return re.sub(r"[ 　()（）\[\]【】]", "", name or "").strip()


def merge(nk_records, jbis_records, jbis_ped_records):
    """netkeiba 主 + jbis 兜底 + jbis_pedigree 增强"""
    jbis = {norm(h.get("馬名", "")): h for h in jbis_records}
    enrich = {norm(h.get("馬名", "")): h for h in jbis_ped_records if h.get("pedigree")}
    nk_keys = {norm(r.get("馬名", "")) for r in nk_records}

    out = []
    for r in nk_records:
        key = norm(r.get("馬名", ""))
        j = jbis.get(key, {})
        e = enrich.get(key, {})
        h = {
            "nk_id": r.get("nk_id", ""),
            "jbis_id": r.get("jbis_id", "") or j.get("jbis_id", "") or e.get("jbis_id", ""),
            "馬名": r.get("馬名", ""),
            "性別": r.get("性別", ""),
            "生年月日": r.get("生年月日", ""),
            "毛色": r.get("毛色", ""),
            "産地": r.get("産地", ""),
            "馬主": r.get("馬主", ""),
            "生産牧場": r.get("生産牧場", ""),
            "調教師": r.get("調教師", ""),
            "通算成績": r.get("通算成績", ""),
            "獲得賞金": r.get("獲得賞金", ""),
            "総賞金": r.get("総賞金", ""),
            "母名": r.get("母名", ""),
            "母父名": r.get("母父名", ""),
            "生年": r.get("生年", ""),
            "登録状態": r.get("登録状態", ""),
            "pedigree": r.get("pedigree") or j.get("pedigree", {}),
            "fno": r.get("fno") or j.get("fno", "") or e.get("fno", ""),
            "cross": j.get("cross", "") or e.get("cross", ""),
        }
        if h["馬名"]:
            out.append(h)

    # JBIS 兜底：netkeiba 无记录的马
    for j in jbis_records:
        key = norm(j.get("馬名", ""))
        if key in nk_keys or not j.get("馬名"):
            continue
        out.append({
            "nk_id": "",
            "jbis_id": j.get("jbis_id", ""),
            "馬名": j.get("馬名", ""),
            "性別": j.get("性別", ""),
            "生年月日": j.get("生年月日", ""),
            "毛色": j.get("毛色", ""),
            "産地": j.get("産地", ""),
            "馬主": j.get("馬主", ""),
            "生産牧場": j.get("生産牧場", ""),
            "調教師": j.get("調教師", ""),
            "通算成績": j.get("通算成績", ""),
            "獲得賞金": "",
            "総賞金": j.get("総賞金", ""),
            "母名": "",
            "母父名": "",
            "生年": j.get("生年", ""),
            "登録状態": j.get("登録状態", ""),
            "pedigree": j.get("pedigree", {}),
            "fno": j.get("fno", ""),
            "cross": j.get("cross", ""),
        })

    out.sort(key=lambda h: (h["生年"] or "", h["馬名"] or ""), reverse=True)
    return out


def update_manifest(current_id, count, note="", versions=None):
    mf_path = os.path.join(DATA, "manifest.json")
    mf = {"current": current_id, "versions": []}
    if os.path.exists(mf_path):
        with open(mf_path, encoding="utf-8") as f:
            old = json.load(f)
        mf["versions"] = old.get("versions", [])
    mf["versions"] = [v for v in mf["versions"] if v["id"] != current_id]
    mf["versions"].insert(0, {
        "id": current_id,
        "file": f"history/{current_id}.json",
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": count,
        "note": note,
    })
    mf["versions"] = mf["versions"][:30]
    mf["current"] = current_id
    with open(mf_path, "w", encoding="utf-8") as f:
        json.dump(mf, f, ensure_ascii=False, indent=2)
    return mf


def load_aliases():
    path = os.path.join(DATA, "aliases.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_ledger():
    """读取契约B快照（pull_races.py 产出）→ 类型化记录 + 校验 issues"""
    path = os.path.join(RACES_DIR, "ledger.csv")
    if not os.path.exists(path):
        return [], []
    issues = []
    records = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rec = racelib.coerce_record(row, issues)
            if rec:
                records.append(rec)
    return records, issues


def attach_races(records, ledger_rows, aliases):
    """契约B关联到马档案：马名匹配 + 别名 + 自动建档 + 汇总stats。
    返回 (matched, created_names, unmatched_names, aliases, n_with_races)
    """
    by_norm = {}
    for h in records:
        by_norm.setdefault(norm(h.get("馬名", "")), []).append(h)
    for src, entry in aliases.items():
        tgt = entry.get("target", "") if isinstance(entry, dict) else entry
        if tgt:
            by_norm.setdefault(norm(src), []).extend(by_norm.get(norm(tgt), []))

    horse_recs = {}
    for r in ledger_rows:
        key = norm(r["出走馬名"])
        g = horse_recs.setdefault(key, {"name": r["出走馬名"], "recs": []})
        g["recs"].append(r)

    # 分配: attach(挂到现有马) / create(自动建档) / unmatched(待确认)
    assign = {}
    for key, g in horse_recs.items():
        if key in by_norm:
            assign[key] = ("attach", key)
            continue
        entry = aliases.get(g["name"]) or aliases.get(key) or {}
        action, tgt = entry.get("action") or "", entry.get("target") or ""
        if action == "create":
            assign[key] = ("create", None)
        elif tgt and norm(tgt) in by_norm:
            assign[key] = ("attach", norm(tgt))
        else:
            if not entry:
                note = "海外登记名，无日文名" if g["name"].isascii() else "台账有、仓库无，待确认"
                aliases[g["name"]] = {"action": "", "target": "", "note": note}
            assign[key] = (None, None)

    matched, created, unmatched = 0, [], []
    for key, (mode, _cname) in assign.items():
        if mode == "attach":
            matched += 1
        elif mode == "create":
            created.append(key)
        else:
            unmatched.append(key)

    attach_map = {cname: key for key, (mode, cname) in assign.items() if mode == "attach"}
    n_with = 0
    for h in records:
        key = attach_map.get(norm(h.get("馬名", "")))
        if key:
            h["races"] = horse_recs[key]["recs"]
            h["stats"] = racelib.compute_stats(h["races"])
            n_with += 1
        else:
            h.setdefault("races", [])
            h.setdefault("stats", racelib.compute_stats([]))
        h.setdefault("photo", "")

    # 台账有、仓库无 → 按别名表 action=create 自动建档（如 Grand Warrior）
    for key in created:
        g = horse_recs[key]
        sex, birth = racelib.derive_basic(g["recs"])
        h = {
            "nk_id": "", "jbis_id": "", "馬名": g["name"], "性別": sex, "生年月日": "",
            "毛色": "", "産地": "", "馬主": "", "生産牧場": "", "調教師": "",
            "通算成績": "", "獲得賞金": "", "総賞金": "", "母名": "", "母父名": "",
            "生年": birth, "登録状態": "",
            "pedigree": {}, "fno": "", "cross": "", "photo": "",
            "races": g["recs"], "stats": racelib.compute_stats(g["recs"]),
        }
        records.append(h)
        n_with += 1

    return matched, [horse_recs[k]["name"] for k in created], \
        [horse_recs[k]["name"] for k in unmatched], aliases, n_with


def build_merge_report(records, matched, created, unmatched, ledger_issues):
    lines = ["# 合并校验报告（build-data）", ""]
    lines.append(f"- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"- 关联成功: {matched} 匹")
    lines.append(f"- 自动建档: {len(created)} 匹" + (f" → {'、'.join(created)}" if created else ""))
    lines.append(f"- 待确认: {len(unmatched)} 匹" + (f" → {'、'.join(unmatched)}（已写入 data/aliases.json）" if unmatched else ""))
    lines.append(f"- ledger 校验异常: {len(ledger_issues)} 条")
    for it in ledger_issues[:20]:
        lines.append(f"  - **{it['type']}**: {it}")
    lines.append("")
    lines.append("## 数据覆盖情况（crops 有通算成績但台账缺记录的马）")
    missing = []
    for h in records:
        m = re.match(r"(\d+)戦", h.get("通算成績") or "")
        if m and int(m.group(1)) > 0 and not h.get("races"):
            missing.append(h.get("馬名", ""))
    lines.append(f"- 共 {len(missing)} 匹" + ("：" + "、".join(missing[:30]) if missing else "（无）"))
    lines.append("")
    lines.append("## 台账少于 netkeiba 通算成績（待校准）")
    fewer = []
    for h in records:
        m = re.match(r"(\d+)戦", h.get("通算成績") or "")
        if m and h.get("races"):
            led = sum(1 for r in h["races"] if isinstance(r["結果"], int) or r["結果"] == "中止")
            if int(m.group(1)) > led:
                fewer.append(f"{h.get('馬名', '')}（netkeiba {int(m.group(1))}戦 / 台账 {led}战）")
    lines.append(f"- 共 {len(fewer)} 匹" + ("：" + "、".join(fewer[:30]) if fewer else "（无）"))
    lines.append("")
    lines.append("## 说明")
    lines.append("- 自动建档马匹由台账生成，基本信息（性別/生年由性齢推导）待后续补充")
    lines.append("- 海外赛事赏金未在台账记录，赏金合计 = 中央 + 地方")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="云迹数据构建（netkeiba 主 + JBIS 兜底）")
    ap.add_argument("--note", default="netkeiba+JBIS 抓取更新")
    ap.add_argument("--no-snapshot", action="store_true")
    args = ap.parse_args()

    nk = load_raw("netkeiba.json")
    jb = load_raw("jbis.json")
    jb_ped = load_raw("jbis_pedigree.json")
    records = merge(nk, jb, jb_ped)
    if not records:
        sys.exit("❌ 无数据：先跑 scrape_netkeiba.py / scrape_jbis.py")

    with_ped = sum(1 for h in records if h.get("pedigree") and h["pedigree"].get("父"))
    with_nk_ped = sum(1 for h in records if h.get("nk_id") and h.get("pedigree", {}).get("父"))
    with_jbis_only = sum(1 for h in records if not h.get("nk_id"))
    with_cross = sum(1 for h in records if h.get("cross"))
    print(f"✔ netkeiba {len(nk)} 匹 + jbis 兜底 {len(jb)} 匹 → 合并 {len(records)} 匹")
    print(f"✔ 血统覆盖: {with_ped}/{len(records)}（netkeiba 源 {with_nk_ped}，JBIS 兜底 {with_jbis_only}）")
    print(f"✔ クロス增强: {with_cross} 匹")

    # ── 契约B 关联（data/races/ledger.csv 由 pull_races.py 产出）──
    aliases = load_aliases()
    ledger_rows, ledger_issues = load_ledger()
    if ledger_rows:
        matched, created, unmatched, aliases, n_with = attach_races(records, ledger_rows, aliases)
        with open(os.path.join(DATA, "aliases.json"), "w", encoding="utf-8") as f:
            json.dump(aliases, f, ensure_ascii=False, indent=1)
        print(f"✔ 比赛数据: 关联 {matched} 匹 · 自动建档 {len(created)} 匹 · 待确认 {len(unmatched)} 匹")
        if created:
            print("✔ 自动建档:", "、".join(created))
        if unmatched:
            print("⚠ 待确认（已写入 aliases.json）:", "、".join(unmatched))
        mreport = build_merge_report(records, matched, created, unmatched, ledger_issues)
        with open(os.path.join(DATA, "merge-report.md"), "w", encoding="utf-8") as f:
            f.write(mreport)
        print(f"✔ 已写: data/merge-report.md（覆盖/待校准清单）")
    else:
        print("⚠ 无 data/races/ledger.csv，跳过比赛数据（先跑 python scripts/pull_races.py）")

    os.makedirs(HISTORY, exist_ok=True)
    cur_id = datetime.now().strftime("%Y%m%d_%H%M")
    with open(os.path.join(DATA, "crops.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=1)

    if not args.no_snapshot:
        with open(os.path.join(HISTORY, f"{cur_id}.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=1)

    mf = update_manifest(cur_id, len(records), args.note)
    print(f"✔ crops.json 已更新 ({len(records)} 匹)")
    print(f"✔ 快照: history/{cur_id}.json · 版本数: {len(mf['versions'])}")


if __name__ == "__main__":
    main()
