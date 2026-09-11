#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据一致性校验（--fix 自动补跑修复对应环节）。

检查项：
  1. basic.json 结构：能加载、匹数、必需字段存在
  2. pedigree_file 引用：文件存在
  3. races_file 引用：文件存在
  4. 比赛数据完整性：races 文件里 中央+地方 实际出赛数 < 通算成績 应有战数 → 数据缺失
  5. 信息性统计：nk_id / 欧字馬名 / 馬名意味 / 香港馬名 / 自译馬名 填充数

输出：stdout 摘要 + data/check_report.md（含问题明细与问题 id 清单）。

--fix：对可修复问题补跑对应环节（subprocess 调各脚本）：
  - pedigree 引用缺失/文件缺失      → scripts/basic/fetch_pedigree.py --id <ids> + merge_basic
  - nk_id 为空                     → scripts/basic/fetch_nk_id.py（列表全扫补空）+ merge_basic
  - races 数据缺失（通算战数不符）  → scripts/races/fetch_races.py --id <ids> + merge_races

用法:
    python scripts/check_data.py             # 只校验 + 报告
    python scripts/check_data.py --fix       # 校验后自动补跑修复
"""
import argparse
import io
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BASIC = ROOT / "scripts" / "basic"
RACES = ROOT / "scripts" / "races"
PY = sys.executable

START_RE = re.compile(r"(\d+)戦")
REPORT = DATA / "check_report.md"


def run(script, *args):
    print(f"  · 补跑: {Path(script).name} {' '.join(args)}", flush=True)
    r = subprocess.run([PY, str(script), *args], capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.returncode == 0


def expected_starts(h):
    m = START_RE.search(h.get("通算成績") or "")
    return int(m.group(1)) if m else 0


def actual_starts(recs):
    """实际出赛数：結果为名次(int)/中止/失格 算出赛，取消/除外 不算；全部场地。
    兼容历史单字 DNF（中/失），新数据已归一为全称。"""
    n = 0
    for r in recs:
        res = r.get("結果")
        if isinstance(res, int) or res in ("中止", "失格", "中", "失"):
            n += 1
    return n


def race_key(r):
    """比赛唯一键（与 common.race_key 一致）：race_id 优先，否则 (日付,場名,R)。"""
    rid = str(r.get("race_id") or "").strip()
    if rid:
        return "race:" + rid
    return "slot:{}|{}|{}".format(r.get("日付", ""), r.get("場名", ""), r.get("R", ""))


def main():
    ap = argparse.ArgumentParser(description="数据一致性校验")
    ap.add_argument("--fix", action="store_true", help="校验后自动补跑修复")
    args = ap.parse_args()

    lines = [f"# 数据校验报告", "", f"- 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"]
    problems = 0
    fix_todo = {"pedigree": [], "nk_id": [], "races": []}

    if not (DATA / "basic.json").exists():
        print("❌ basic.json 不存在（先跑初始化/基本更新）")
        sys.exit(1)
    b = json.loads((DATA / "basic.json").read_text(encoding="utf-8"))
    hs = b["horses"]
    lines.append(f"- basic.json: {len(hs)} 匹")

    # 1) 引用完整性
    missing_ref = 0
    for h in hs:
        for fld, d in (("pedigree_file", DATA / "pedigree"), ("races_file", DATA / "races")):
            ref = h.get(fld) or ""
            if not ref:
                continue
            # 引用形如 data/pedigree/1.json → 实体在 DATA/1.json
            name = ref.rsplit("/", 1)[-1]
            if not (d / name).exists():
                missing_ref += 1
                problems += 1
                lines.append(f"  ✗ {h['id']} {h.get('馬名','')} {fld} 引用文件缺失: {ref}")
                if fld == "pedigree_file":
                    fix_todo["pedigree"].append(h["id"])
    lines.append(f"- 引用文件缺失: {missing_ref}")

    # 2) 比赛数据完整性（通算战数 vs 文件出赛数）
    missing_races = 0
    for h in hs:
        ref = h.get("races_file") or ""
        if not ref:
            continue
        name = ref.rsplit("/", 1)[-1]
        p = DATA / "races" / name
        if not p.exists():
            continue
        recs = json.loads(p.read_text(encoding="utf-8"))
        if actual_starts(recs) < expected_starts(h):
            missing_races += 1
            problems += 1
            lines.append(f"  ✗ {h['id']} {h.get('馬名','')} 通算 {h.get('通算成績')} "
                         f"但文件出赛 {actual_starts(recs)} 场 → 数据缺失")
            fix_todo["races"].append(h["id"])
    lines.append(f"- 比赛数据缺失（通算战数 > 文件出赛）: {missing_races}")

    # 3) 重复比赛检测：同一场比赛出现多条记录（同 race_id / 同 slot / 海外同 (日付,場名) 跨来源）
    dup = 0
    dup_detail = []
    dup_ids = []
    for h in hs:
        ref = h.get("races_file") or ""
        if not ref:
            continue
        p = DATA / "races" / ref.rsplit("/", 1)[-1]
        if not p.exists():
            continue
        recs = json.loads(p.read_text(encoding="utf-8"))
        groups = {}
        for r in recs:
            vt = (r.get("venue_type") or "").strip()
            if vt == "海外":
                key = "ov:{}|{}".format(r.get("日付", ""), r.get("場名", ""))   # 海外 R 常空/不一致 → 宽松键
            else:
                key = "{}|{}|{}".format(r.get("日付", ""), r.get("場名", ""), r.get("R", ""))
            groups.setdefault(key, []).append(r)
        for key, grp in groups.items():
            if len(grp) > 1:
                dup += 1
                r0 = grp[0]
                dup_detail.append("{} {} 重复: {} {} {} ×{}（来源 {}）".format(
                    h["id"], h.get("馬名", ""), r0.get("日付"), r0.get("場名"),
                    r0.get("レース名"), len(grp),
                    ",".join(sorted({g.get("來源", "") for g in grp}))))
                dup_ids.append(h["id"])
    lines.append(f"- 重复比赛记录: {dup}")
    for d in dup_detail[:10]:
        lines.append(f"  ✗ {d}")
    problems += dup   # 重复也计入问题（--fix 会清理）

    # 4) 信息性统计
    stats = {}
    for fld in ("nk_id", "欧字馬名", "馬名意味", "香港馬名", "自译馬名", "pedigree_file", "races_file"):
        stats[fld] = sum(1 for h in hs if h.get(fld))
        if fld in ("nk_id",) and stats[fld] < len(hs):
            for h in hs:
                if not h.get(fld):
                    fix_todo["nk_id"].append(h["id"])
    lines.append("- 字段填充: " + " · ".join(f"{k}={v}/{len(hs)}" for k, v in stats.items()))

    lines += ["", f"问题合计: {problems}"]
    for k, v in fix_todo.items():
        lines.append(f"  可修复 {k}: {len(v)} 项")

    DATA.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"✔ 校验完成：问题 {problems} 项 → 详见 {REPORT}")
    if problems:
        print("\n".join([ln for ln in lines if ln.startswith("  ✗")][:20]))

    # 4) --fix 补跑
    if args.fix and problems:
        print("── --fix 补跑 ──")
        if fix_todo["pedigree"]:
            run(BASIC / "fetch_pedigree.py", "--id", ",".join(map(str, fix_todo["pedigree"])))
            run(BASIC / "merge_basic.py")
        if fix_todo["nk_id"]:
            run(BASIC / "fetch_nk_id.py")
            run(BASIC / "merge_basic.py")
        if fix_todo["races"]:
            run(RACES / "fetch_races.py", "--id", ",".join(map(str, fix_todo["races"])))
            run(RACES / "merge_races.py")
        if dup_ids:
            # 清理跨来源重复：同场多条时删「台账」来源（netkeiba 记录更完整）；全台账则留一条
            fixed = 0
            for hid in sorted(set(dup_ids)):
                p = DATA / "races" / f"{hid}.json"
                recs = json.loads(p.read_text(encoding="utf-8"))
                groups = {}
                for r in recs:
                    vt = (r.get("venue_type") or "").strip()
                    key = ("ov:{}|{}".format(r.get("日付", ""), r.get("場名", "")) if vt == "海外"
                           else "{}|{}|{}".format(r.get("日付", ""), r.get("場名", ""), r.get("R", "")))
                    groups.setdefault(key, []).append(r)
                keep = []
                for grp in groups.values():
                    if len(grp) > 1:
                        non_ledger = [r for r in grp if r.get("來源") != "台账"]
                        keep.extend(non_ledger if non_ledger else grp[:1])
                    else:
                        keep.extend(grp)
                keep.sort(key=lambda r: r.get("日付", ""), reverse=True)
                p.write_text(json.dumps(keep, ensure_ascii=False, indent=1), encoding="utf-8")
                fixed += len(recs) - len(keep)
            print(f"  · 清理跨来源重复: 删 {fixed} 条（{len(set(dup_ids))} 匹）")
        print("✔ 补跑完成（建议再跑一次 --check 复核）")


if __name__ == "__main__":
    main()
