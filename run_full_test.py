#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""完整流水线自测：删空数据 → 第一部分(建档+基础) → 第二部分(竞赛) → 汇总报告。

流程：
  0. 删除 data/ 下全部数据（含 fetch_log 等日志）—— 从 0 开始
  1. 第一部分 scripts/basic/：build_registry(建档) → run_all(并发三件套+详情+合并)
  2. 第二部分 scripts/races/：run_all(详情更新+判变 → 成绩增量 → 本賞金 → 台账 → 合并)
  3. 汇总：数据统计 + 每步结果 + 风控日志分析，写入日志文件

输出约定（方便远程监督，不刷屏）：
  - 详细日志（每步子进程完整输出 + 汇总）→ test-logs/full-<时间戳>.log
  - stdout 每步只打一行状态（[步骤] 完成/失败 exit=N 耗时=Xs），出错时附错误摘要

用法:
  python run_full_test.py              # 完整自测（删数据重建）
  python run_full_test.py --dry-run    # 只打印计划与将删除的内容，不执行

预计耗时：第一部分约 35 分钟（血统 277×1.5s ∥ 列表/意味，详情 276×6s 串行），
          第二部分约 55 分钟（详情 276×6s + 成绩 276×6s），全程约 1.5 小时。
"""
import argparse
import csv
import datetime
import io
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

# 与各子脚本一致：stdout 统一 UTF-8（Windows 控制台默认 GBK，⚠/日文会编码失败）
if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
BASIC = ROOT / "scripts" / "basic"
RACES = ROOT / "scripts" / "races"
LOG_DIR = ROOT / "test-logs"
PY = sys.executable

TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
LOG_FILE = LOG_DIR / f"full-{TS}.log"
results = []          # (步骤名, returncode, 耗时秒)


def log(msg="", echo=True):
    """写日志文件；echo 控制是否同时打到 stdout。"""
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if echo:
        print(line, flush=True)


def run_step(name, script, *args):
    """跑一个子脚本：完整输出进日志，stdout 只打一行状态。返回 (returncode, 秒)。"""
    log(f"\n───── [{name}] {Path(script).name} {' '.join(args)} ─────", echo=False)
    t0 = time.time()
    try:
        r = subprocess.run([PY, str(script), *args],
                           capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=7200)
    except subprocess.TimeoutExpired:
        log(f"✗ [{name}] 超时(7200s)")
        results.append((name, -1, time.time() - t0))
        return -1, time.time() - t0
    dt = time.time() - t0
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join("  | " + ln for ln in (r.stdout or "").splitlines()) + "\n")
        if (r.stderr or "").strip():
            f.write("  [stderr]\n" + "\n".join("  ! " + ln for ln in r.stderr.splitlines()) + "\n")
    results.append((name, r.returncode, dt))
    status = "完成" if r.returncode == 0 else f"失败(exit={r.returncode})"
    log(f"✔ [{name}] {status} · 耗时 {dt/60:.1f} 分钟")
    if r.returncode != 0:
        tail = [ln for ln in (r.stdout or "").splitlines() if ln.strip()][-3:]
        log(f"  …末尾输出: {tail}")
    return r.returncode, dt


def wipe_data(dry_run=False):
    """删除 data/ 下全部内容（含 _tmp、日志、报告）。"""
    if not DATA.exists():
        log("[0] data/ 不存在，无需删除")
        return
    items = list(DATA.iterdir())
    for it in items:
        log(f"  删除: {it.relative_to(ROOT)}", echo=not dry_run)
        if not dry_run:
            shutil.rmtree(it) if it.is_dir() else it.unlink()
    if not dry_run:
        log(f"[0] 已删除 data/ 下 {len(items)} 项")


def summary():
    """汇总：数据统计 + 风控日志分析。"""
    lines = ["", "════════ 汇总 ════════"]
    lines.append(f"测试时间: {TS}")
    lines.append("步骤结果:")
    for name, rc, dt in results:
        mark = "OK " if rc == 0 else f"FAIL({rc})"
        lines.append(f"  [{mark}] {name}  {dt/60:.1f} 分钟")
    total = sum(dt for _, _, dt in results)
    lines.append(f"总耗时: {total/60:.1f} 分钟")

    basic_path = DATA / "basic.json"
    if basic_path.exists():
        b = json.loads(basic_path.read_text(encoding="utf-8"))
        hs = b["horses"]
        lines += ["", "数据（data/）:"]
        lines.append(f"  basic.json: {b['_meta'].get('count')} 匹")
        for fld in ("nk_id", "欧字馬名", "馬名意味", "pedigree_file", "races_file"):
            n = sum(1 for h in hs if h.get(fld))
            lines.append(f"  {fld}: {n}/{len(hs)}")
        n_sd = sum(1 for h in hs if h.get("収得賞金"))
        lines.append(f"  収得賞金: {n_sd}/{len(hs)}")
        ped = list((DATA / "pedigree").glob("*.json")) if (DATA / "pedigree").exists() else []
        rc_ = list((DATA / "races").glob("*.json")) if (DATA / "races").exists() else []
        lines.append(f"  pedigree 文件: {len(ped)} · races 文件: {len(rc_)}")
    else:
        lines.append("  ⚠ basic.json 未生成（第一部分失败）")

    fclog = DATA / "fetch_log.csv"
    if fclog.exists():
        rows = list(csv.DictReader(open(fclog, encoding="utf-8")))
        lines += ["", "风控日志 fetch_log.csv:"]
        lines.append(f"  总请求 {len(rows)} 条")
        for host, grp in __import__("itertools").groupby(sorted(rows, key=lambda x: x["host"]), key=lambda x: x["host"]):
            grp = list(grp)
            bad = sum(1 for x in grp if x["status"] != "200")
            lines.append(f"  {host}: {len(grp)} 条 · 非200: {bad}")
    for rep in ("studbook_report.md", "races_report.md"):
        p = DATA / rep
        lines.append(f"  {rep}: {'有' if p.exists() else '无'}")

    for ln in lines:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(ln + "\n")
    print("\n".join(lines), flush=True)


def main():
    ap = argparse.ArgumentParser(description="完整流水线自测（删数据重建）")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划与将删除的内容，不执行")
    args = ap.parse_args()

    log(f"══ 完整流水线自测开始 {TS} ══ 日志: {LOG_FILE}")
    if args.dry_run:
        log("[dry-run] 将删除以下 data/ 内容：")
        wipe_data(dry_run=True)
        log("[dry-run] 计划执行：")
        log("  1) python scripts/basic/build_registry.py   （建档 2023+2024）")
        log("  2) python scripts/basic/run_all.py          （并发三件套 + 详情 + 合并）")
        log("  3) python scripts/races/run_all.py          （详情+判变 → 成绩 → 本賞金 → 台账 → 合并）")
        log("[dry-run] 结束（未执行任何操作）")
        return

    log("⚠ 即将删除 data/ 下全部数据（从 0 重建）……")
    wipe_data()

    # 第一部分：建档 + 基础
    run_step("1/3 第一部分·建档 build_registry", BASIC / "build_registry.py")
    run_step("2/3 第一部分·基础 run_all(并发+详情+合并)", BASIC / "run_all.py")

    # 第二部分：竞赛
    run_step("3/3 第二部分·竞赛 run_all(判变→成绩→本賞金→台账→合并)", RACES / "run_all.py")

    log("\n══ 自测结束 ══")
    summary()


if __name__ == "__main__":
    main()
