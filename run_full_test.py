#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""完整流水线自测：删空数据 → 第一部分(建档+基础) → 第二部分(竞赛) → 汇总报告。

流程：
  0. 删除 data/ 下全部数据（含 fetch_log 等日志）—— 从 0 开始
  1. 第一部分 scripts/basic/：build_registry(建档) → run_all(并发三件套+详情+合并)
  2. 第二部分 scripts/races/：run_all(详情更新+判变 → 成绩增量(SP页含格/条件/調教師/本賞金) → 台账 → 合并)
  3. 汇总：数据统计 + 每步结果 + 风控日志分析，写入日志文件

输出约定（方便远程监督，不刷屏）：
  - 详细日志（每步子进程完整输出 + 汇总）→ test-logs/full-<时间戳>.log
  - stdout 每步只打一行状态（[步骤] 完成/失败 exit=N 耗时=Xs），出错时附错误摘要

用法:
  python run_full_test.py              # 完整自测（删数据重建）
  python run_full_test.py --dry-run    # 只打印计划与将删除的内容，不执行

预计耗时：无实测基准前不要相信任何「预计」（2026-11-13 更正）。fork 用同一套脚本在 729 匹上
          实测 6h02m / 4866 请求，其中 5.1h 是限速等待、1.84h 才是网络（fetch_log.jsonl 可复算）；
          按每匹 6.7 请求外推，277 匹约 3.5 小时 —— 原「约 1.5 小时」是按 1 请求/匹 拍的，低估一半以上。
"""
import argparse
import datetime
import io
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
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

"""步骤看门狗：连续 IDLE_TIMEOUT 秒**没有任何输出**判为卡死（2026-11-13 取代原单步总时长超时）。

为什么砍掉总时长超时：耗时是随机变量（fork 实测 729 匹全程 6h02m，其中 5.1h 是限速等待、
1.84h 才是网络；JBIS 单页 0.5~330s）。任何固定值/按马数缩放都在赌，赌输就是白跑数小时后被杀、
再拿不完整缓存去合并。脚本每匹马都 print 进度，天然有心跳：还在动就不杀。
总时长兜底交给 CI job timeout-minutes（GitHub 单 job 上限 6h），本地则靠人看/ctrl-C。

20 分钟的依据：单请求超时 90s（core/net.TIMEOUT）× 最多 4 次重试 + 退避 ≈ 7 分钟，留 3 倍余量。"""
IDLE_TIMEOUT = 1200
TOTAL_TIMEOUT = 0        # 总时长兜底（秒），0 = 不设；仅调试/本地应急时可临时给值


def log(msg="", echo=True):
    """写日志文件；echo 控制是否同时打到 stdout。"""
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if echo:
        print(line, flush=True)


def startup_notice():
    """启动自检：打印卡死判据 + 库内马数（马数只作现场参考，不再据此推算超时；口径与 run_update.py 一致）。"""
    n = None
    try:
        with open(DATA / "basic.json", "r", encoding="utf-8") as f:
            n = len((json.load(f) or {}).get("horses") or [])
    except Exception:
        pass
    log(f"卡死判据：连续 {IDLE_TIMEOUT // 60} 分钟无输出即中止（不设总时长上限）"
        f" · 库内马数 {n if n is not None else '未知（尚无 data/basic.json）'}")


def finish(code=0):
    """收尾：汇总后退出。正常结束与「卡死中止」共用，保证中止路径也有汇总。"""
    log("\n══ 自测结束 ══")
    summary()
    sys.exit(code)


def run_step(name, script, *args):
    """跑一个子脚本：输出**流式**写日志（原 capture_output 要等退出才拿得到，卡死时日志全空、
    也无法判断有没有在动），stderr 并入同一流；连续 IDLE_TIMEOUT 秒无输出 → 判卡死、杀进程、
    整轮中止（继续跑后面的步骤会用不完整缓存合出一份少数据的库）。返回 (returncode, 秒)。"""
    log(f"\n───── [{name}] {Path(script).name} {' '.join(args)} ─────", echo=False)
    t0 = time.time()
    try:
        p = subprocess.Popen([PY, str(script), *args],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace", bufsize=1,
                             env={**os.environ, "PYTHONUNBUFFERED": "1"})
    except OSError as e:
        log(f"✗ [{name}] 启动失败: {e}")
        results.append((name, -1, time.time() - t0))
        return -1, time.time() - t0

    q = queue.Queue()

    def _pump():
        try:
            for line in p.stdout:
                q.put(line)
        finally:
            q.put(None)

    threading.Thread(target=_pump, daemon=True).start()

    last_out = time.time()
    killed = ""
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        while True:
            try:
                line = q.get(timeout=5)
            except queue.Empty:
                now = time.time()
                if now - last_out > IDLE_TIMEOUT:
                    killed = f"连续 {IDLE_TIMEOUT}s 无输出"
                elif TOTAL_TIMEOUT and now - t0 > TOTAL_TIMEOUT:
                    killed = f"总时长超过 {TOTAL_TIMEOUT}s"
                if killed:
                    p.kill()
                    break
                continue
            if line is None:
                break
            last_out = time.time()
            f.write(line if line.endswith("\n") else line + "\n")
            f.flush()

    rc = p.wait()
    dt = time.time() - t0
    if killed:
        log(f"✗ [{name}] 判为卡死（{killed}）· 已耗时 {dt/60:.1f} 分钟")
        log("→ 整轮中止：不再执行后续步骤（避免用不完整缓存合并出少数据的库）")
        results.append((name, -1, dt))
        finish(2)
    results.append((name, rc, dt))
    status = "完成" if rc == 0 else f"失败(exit={rc})"
    log(f"✔ [{name}] {status} · 耗时 {dt/60:.1f} 分钟")
    return rc, dt


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
        for fld in ("nk_id", "欧字馬名", "馬名意味", "総賞金", "pedigree_file", "races_file"):
            n = sum(1 for h in hs if h.get(fld))
            lines.append(f"  {fld}: {n}/{len(hs)}")
        n_sd = sum(1 for h in hs if h.get("収得賞金"))
        lines.append(f"  収得賞金: {n_sd}/{len(hs)}")
        ped = list((DATA / "pedigree").glob("*.json")) if (DATA / "pedigree").exists() else []
        rc_ = list((DATA / "races").glob("*.json")) if (DATA / "races").exists() else []
        lines.append(f"  pedigree 文件: {len(ped)} · races 文件: {len(rc_)}")
    else:
        lines.append("  ⚠ basic.json 未生成（第一部分失败）")

    fclog = DATA / "fetch_log.jsonl"
    if fclog.exists():
        rows = [json.loads(line) for line in fclog.read_text(encoding="utf-8").splitlines() if line.strip()]
        lines += ["", "风控日志 fetch_log.jsonl:"]
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
    startup_notice()
    if args.dry_run:
        log("[dry-run] 将删除以下 data/ 内容：")
        wipe_data(dry_run=True)
        log("[dry-run] 计划执行：")
        log("  1) python scripts/basic/build_registry.py   （建档 2023+2024）")
        log("  2) python scripts/basic/run_all.py          （并发三件套 + 详情 + 合并）")
        log("  3) python scripts/races/run_all.py          （详情+判变 → 成绩增量 → 台账 → 合并）")
        log("[dry-run] 结束（未执行任何操作）")
        return

    log("⚠ 即将删除 data/ 下全部数据（从 0 重建）……")
    wipe_data()

    # 第一部分：建档 + 基础
    run_step("1/3 第一部分·建档 build_registry", BASIC / "build_registry.py")
    run_step("2/3 第一部分·基础 run_all(并发+详情+合并)", BASIC / "run_all.py")

    # 第二部分：竞赛
    run_step("3/3 第二部分·竞赛 run_all(判变→成绩→本賞金→台账→合并)", RACES / "run_all.py")

    finish(0)


if __name__ == "__main__":
    main()
