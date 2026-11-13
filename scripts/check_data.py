#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据一致性校验（--fix 自动补跑修复对应环节）。

检查项：
  1. basic.json 结构：能加载、匹数、必需字段存在
  2. pedigree_file 引用：文件存在
  3. races_file 引用：文件存在
  4. 比赛数据完整性：netkeiba 通算成績 战数 ≠ 文件里「來源=netkeiba」的出赛行数 → 抓漏/重复
     （同口径对账；台账补录的海外场次不在该口径内，只在报告里信息性列出。
      台账为**可选环节**（config/sire.json 的 ledger.url 为空 = 未启用）：
      未启用时数据里本就不会有台账来源记录，本项对账为空报告/空列表，属正常状态，无需处理。）
  5. 信息性统计：nk_id / 欧字馬名 / 馬名意味 / 香港馬名 / 自译馬名 填充数
  6. 数据体检（**仅报告，不影响退出码与流程**）：乱码特征 / 覆盖率骤降 / 字段整批为空 / 着顺缩写未归一

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
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))   # 本文件在 scripts/ 下，引导 scripts/core/（纯 stdlib）
from core import constants, runtime  # noqa: E402

runtime.install_utf8_stdout()

ROOT = constants.ROOT
DATA = constants.DATA_DIR
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


def actual_starts(recs, src=None):
    """实际出赛数：結果为名次(int)/中止/失格 算出赛，取消/除外 不算；全部场地。
    兼容历史单字 DNF（中/失），新数据已归一为全称。
    src 非空时只数该来源（來源=netkeiba / 台账）——与 netkeiba 通算成績 对账必须同口径：
    台账补录的海外场次不在通算成績 口径内，混算会让「netkeiba 抓漏一场」被「台账补一场」抵消。"""
    n = 0
    for r in recs:
        if src and (r.get("來源") or "netkeiba") != src:
            continue
        res = r.get("結果")
        if isinstance(res, int) or res in ("中止", "失格", "中", "失"):
            n += 1
    return n


# 着顺的合法值（数字另判）：其余字符串都算「没归一」的残留
_RESULT_OK = {"中止", "取消", "除外", "失格", "中", "失", "取", "除", ""}
# 乱码特征：A�（UTF-8 解败）+ 縺/繝（EUC-JP 被当 UTF-8 解）+ ã/Ã（被当 latin-1 解）
_MOJI = ("\ufffd", "縺", "繝", "ã", "Ã")


def health_checks(hs):
    """数据体检（2026-11-13）：**只产出报告，不改退出码、不参与 --fix、不阻断任何抓取/部署/提交**。

    为什么刻意「只报告」：体检一旦能挡住流程，第一反应就是把它关掉或绕过，等于没有；它的价值是
    让异常先被人看见，判断与处置留给人。故本函数只 append 报告行与打印，不 sys.exit、不改 problems。

    覆盖 fork 实战踩到的四类静默失败（都是「流程全绿、数据全错」）：
      ① 全库乱码（编码漂移）② 覆盖率骤降（抓取整批失败）③ 字段整批为空（解析失败仍写缓存）
      ④ 着顺缩写未归一（地方页新写法，统计静默失真）"""
    lines, fails, warns = [], [], []

    def note(level, msg):
        lines.append(f"  {'✗' if level == 'fail' else '⚠'} {msg}")
        (fails if level == "fail" else warns).append(msg)

    # ① 乱码：只看会进页面的名字字段（出现任一特征字形即判定，说明解码或抓取通道出问题）
    bad = [f"{h.get('id')} {fld}={str(h.get(fld))[:20]}"
           for h in hs for fld in ("馬名", "母名", "欧字馬名")
           if any(t in (h.get(fld) or "") for t in _MOJI)]
    if bad:
        note("fail", f"馬名/母名 疑似乱码 {len(bad)} 匹（例：{'；'.join(bad[:3])}）"
                     f" → 查抓取解码是否跟随响应头 charset")
    else:
        lines.append("  ✓ 馬名/母名 未见乱码特征（� / 縺 / 繝 / ã / Ã）")

    # ② 覆盖率骤降：基线取上一份 data/check_report.md（随 data/ 提交，clone 者也有历史可比）
    prev = {}
    try:
        if REPORT.exists():
            for ln in REPORT.read_text(encoding="utf-8").splitlines():
                if "字段填充:" in ln:
                    for kv in ln.split("字段填充:", 1)[1].split("·"):
                        m = re.match(r"\s*(\S+)\s*=\s*(\d+)/(\d+)", kv)
                        if m:
                            prev[m.group(1)] = int(m.group(2))
    except Exception:
        prev = {}
    dropped = []
    for fld in ("nk_id", "pedigree_file", "races_file"):
        cur = sum(1 for h in hs if h.get(fld))
        old = prev.get(fld)
        if old and cur < old * 0.95:          # 只报警「骤降」；抓漏一两匹属常态，不该天天红
            dropped.append(f"{fld} {old}→{cur}")
    if dropped:
        note("fail", f"覆盖率骤降：{' · '.join(dropped)}（较上一份报告的填充数少 5% 以上）"
                     f" → 多为某一步整批抓取失败，先看 data/fetch_log.jsonl")
    elif prev:
        lines.append(f"  ✓ 覆盖率与上一份报告持平（nk_id {prev.get('nk_id', '?')} 为基线）")

    # ③ 字段整批为空：口径要挑准，避免把「还没出赛的当歳马」误判成失败
    with_nk = [h for h in hs if h.get("nk_id")]
    if with_nk:
        empty = sum(1 for h in with_nk if not (h.get("登録状態") or "").strip())
        if empty / len(with_nk) > 0.40:
            note("fail", f"登録状態 为空 {empty}/{len(with_nk)}（>40%）"
                         f" → 详情页解析整批失败也会写缓存，别只看流程是否 exit 0")
        else:
            lines.append(f"  ✓ 登録状態 为空 {empty}/{len(with_nk)}，在正常范围")
    raced, no_sum = [], []
    for h in hs:
        p = DATA / "races" / f"{h.get('id')}.json"
        if not p.exists():
            continue
        try:
            recs = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if recs:
            raced.append(h)
            if not (h.get("通算成績") or "").strip():
                no_sum.append(str(h.get("id")))
    if raced and len(no_sum) / len(raced) > 0.20:
        note("fail", f"有比赛记录但通算成績 为空 {len(no_sum)}/{len(raced)}（>20%）"
                     f"（例：{','.join(no_sum[:5])}）→ 详情解析与成绩数据对不上")

    # ④ 着顺缩写未归一 + ⑤ SP 富化痕迹（発走 / trainer_id）——两个都要遍历 races，一趟读完
    unnorm = {}
    dep_tot = dep_empty = tr_empty = 0
    for p in (DATA / "races").glob("*.json"):
        try:
            recs = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for r in recs:
            v = r.get("結果")
            if not isinstance(v, int) and v not in _RESULT_OK:
                unnorm[repr(v)] = unnorm.get(repr(v), 0) + 1
            if (r.get("venue_type") or "").strip() in ("中央", "地方"):   # 海外没有発走/统一 trainer_id，不计
                dep_tot += 1
                if not (r.get("発走") or "").strip():
                    dep_empty += 1
                if not str(r.get("trainer_id") or "").strip():
                    tr_empty += 1
    if unnorm:
        note("warn", f"着顺出现未归一值 {unnorm} → 补 racelib.DNF_ABBR（否则统计会静默失真）")
    else:
        lines.append("  ✓ 着顺未发现未归一值")

    # ⑤ 発走 与 trainer_id 都是 SP 结果页独有的字段，整批空了 = SP 富化失败（race 域 400/403 的典型症状）。
    #    基线很干净：中央 788 / 地方 91 条，両者 0% 空。trainer_id 尤其要看 —— 它空了，調教師 会退化成
    #    「本马当前调教师」，历史场次写的是**错值**而不只是空值，比缺字段更危险。
    if dep_tot:
        rate = dep_empty / dep_tot
        if rate > 0.05:
            note("fail", f"中央/地方记录 発走 为空 {dep_empty}/{dep_tot}（{rate:.0%}）"
                         f" → SP 结果页整批取不到（race 域风控或页面结构变了），発走/コース/本賞金 会缺")
        elif dep_empty:
            note("warn", f"中央/地方记录 発走 为空 {dep_empty}/{dep_tot} → 少量 SP 富化失败，"
                         f"域恢复后 --races-force 可补回")
        else:
            lines.append(f"  ✓ 発走 全部就位（中央/地方 {dep_tot} 条，均非空）")
        trate = tr_empty / dep_tot
        if trate > 0.05:
            note("fail", f"trainer_id 为空 {tr_empty}/{dep_tot}（{trate:.0%}）→ SP 富化失败："
                         f"这些场次的 調教師 只能留空（已不再用马级调教师兜底），需 --races-force 重抓补齐")
        elif tr_empty:
            note("warn", f"trainer_id 为空 {tr_empty}/{dep_tot} → 少量场次 SP 缺失，调教师取值不可靠")
        else:
            lines.append(f"  ✓ trainer_id 全部就位（中央/地方 {dep_tot} 条，均非空）")

    return lines, fails, warns


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

    # 2) 比赛数据完整性（netkeiba 通算战数 vs 文件里 netkeiba 源出赛数 —— 同口径才叫对账）
    missing_races = 0
    ledger_only = []            # (id, 馬名, 台账场数)：台账补录的海外场次不在 netkeiba 口径内
                                # （台账为可选环节：ledger.url 空 = 未启用 → 此列表为空，对账照常通过）
    for h in hs:
        ref = h.get("races_file") or ""
        if not ref:
            continue
        name = ref.rsplit("/", 1)[-1]
        p = DATA / "races" / name
        if not p.exists():
            continue
        recs = json.loads(p.read_text(encoding="utf-8"))
        nk = actual_starts(recs, "netkeiba")
        exp = expected_starts(h)
        led = actual_starts(recs, "台账")
        if led:
            ledger_only.append((h["id"], h.get("馬名", ""), led))
        if nk != exp:
            missing_races += 1
            problems += 1
            why = "数据缺失（抓漏）" if nk < exp else "行数多于通算战数（重复/异常）"
            lines.append(f"  ✗ {h['id']} {h.get('馬名','')} 通算 {h.get('通算成績')} "
                         f"但 netkeiba 源出赛 {nk} 场 → {why}")
            fix_todo["races"].append(h["id"])
    lines.append(f"- 比赛数据缺失（netkeiba 通算战数 ≠ 文件 netkeiba 源出赛）: {missing_races}")
    if ledger_only:
        lines.append(f"- 台账补录场次（不在 netkeiba 通算成績 口径内，逐场通算战绩会大于展示值）: "
                     + "、".join(f"{m}(id{i} {c}场)" for i, m, c in ledger_only))

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

    # 5) 数据体检：只出报告。**不并入 problems、不改退出码** —— 体检一旦能阻断抓取/部署/提交，
    #    就会被人关掉或绕过；它的职责是把异常摆到人眼前（2026-11-13 定稿）。
    health_lines, h_fail, h_warn = health_checks(hs)
    lines += ["", "数据体检（仅报告，不影响任何流程）:"] + health_lines

    lines += ["", f"问题合计: {problems}"]
    for k, v in fix_todo.items():
        lines.append(f"  可修复 {k}: {len(v)} 项")

    DATA.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"✔ 校验完成：问题 {problems} 项 → 详见 {REPORT}")
    print(f"  数据体检：判死 {len(h_fail)} 项 · 留意 {len(h_warn)} 项（仅报告，不阻断流程）")
    for ln in h_fail + h_warn:
        print(f"    · {ln}")
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
