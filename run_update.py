#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统一更新入口：9 种更新策略（供日常运行与 GitHub Actions 定时调用）。

策略（互斥，--since 可修饰 --races）：
  --init        初始化：删空 data/ 从 0 全量（复用 run_full_test.py 的完整测试流程）
  --basic       基本数据增量：新马对账建档(--year) + 补缺(血统/nk_id/意味/详情) + merge
  --races       比赛数据增量：详情更新+判变 → 成绩增量 → 本賞金 → 台账海外 → 合并
  --horse id    定向更新：只处理指定 id 的马（详情更新 + 成绩增量 + 本賞金 + 合并）
  --races-force 比赛全量刷新：全部马重抓成绩页（覆盖式重建，历史数据修正用）
  --check       数据校验：引用完整性 + 通算战数 vs 文件出赛数（--fix 自动补跑）
  --since N     轻量时段增量：只抓最近 N 天内出赛的马的成绩（不跑详情/判变，需配合 --races）
  --ledger      仅台账：只拉台账海外场并入（不跑 netkeiba）
  --ci          CI 全自动：基本增量 + 比赛增量 + 校验 + git 提交（有变化才提交）

输出约定：详细输出进 test-logs/update-<时间戳>.log，stdout 每步一行状态（便于远程监督）。

用法:
    python run_update.py --init
    python run_update.py --basic --year 2025,2026
    python run_update.py --races                # 比赛增量（判变∪缺失∪无文件）
    python run_update.py --races --since 7      # 轻量：只抓最近 7 天出赛的马
    python run_update.py --horse 1,2,3
    python run_update.py --races-force
    python run_update.py --check --fix
    python run_update.py --ledger
    python run_update.py --ci [--year 2025,2026]
"""
import argparse
import datetime
import io
import json
import subprocess
import sys
import time
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
BASIC = ROOT / "scripts" / "basic"
RACES = ROOT / "scripts" / "races"
CHECK = ROOT / "scripts" / "check_data.py"
FULL_TEST = ROOT / "run_full_test.py"
LOG_DIR = ROOT / "test-logs"
PY = sys.executable

TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
LOG_FILE = LOG_DIR / f"update-{TS}.log"
results = []


def log(msg="", echo=True):
    line = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if echo:
        print(line, flush=True)


def run_step(name, script, *args):
    log(f"\n───── [{name}] {Path(script).name} {' '.join(args)} ─────", echo=False)
    t0 = time.time()
    try:
        r = subprocess.run([PY, str(script), *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=10800)
    except subprocess.TimeoutExpired:
        log(f"✗ [{name}] 超时(10800s)")
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
    return r.returncode, dt


def git_commit_if_changed():
    """data/ 有变化才 git 提交；无 git 仓库时跳过并提示。"""
    log("── git 提交（仅 data/ 有变化时） ──")
    try:
        r = subprocess.run(["git", "-C", str(ROOT), "status", "--porcelain", "data/"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            log("⚠ 非 git 仓库（尚未 git init / 未配置 remote）→ 跳过提交，数据已保存在 data/")
            return
        if not (r.stdout or "").strip():
            log("✔ data/ 无变化，跳过提交")
            return
        changed = [ln.split()[1] for ln in r.stdout.splitlines() if ln.strip()]
        log(f"  变更 {len(changed)} 项，提交中…")
        for cmd in (["git", "-C", str(ROOT), "add", "data/"],
                    ["git", "-C", str(ROOT), "commit", "-m", f"data: auto update {TS}"]):
            c = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if c.returncode != 0:
                log(f"⚠ git {cmd[2]} 失败: {(c.stderr or c.stdout or '').strip()[:200]}")
                return
        push = subprocess.run(["git", "-C", str(ROOT), "push"],
                              capture_output=True, text=True, encoding="utf-8", errors="replace")
        if push.returncode == 0:
            log("✔ 已提交并推送")
        else:
            log(f"⚠ 已提交但推送失败: {(push.stderr or '').strip()[:200]}（可手动 git push）")
    except Exception as e:  # noqa: BLE001
        log(f"⚠ git 操作异常: {e}")


def main():
    ap = argparse.ArgumentParser(description="统一更新入口（9 种策略）")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--init", action="store_true", help="初始化：删空 data/ 从 0 全量")
    g.add_argument("--basic", action="store_true", help="基本数据增量")
    g.add_argument("--races", action="store_true", help="比赛数据增量")
    g.add_argument("--horse", help="定向：逗号分隔的指定 id")
    g.add_argument("--races-force", action="store_true", help="比赛全量刷新")
    g.add_argument("--check", action="store_true", help="数据校验")
    g.add_argument("--ledger", action="store_true", help="仅台账海外并入")
    g.add_argument("--ci", action="store_true", help="CI 全自动：基本+比赛+校验+git 提交")
    ap.add_argument("--year", default="", help="建档年份（--basic/--ci 用，如 2025,2026；默认现有年份）")
    ap.add_argument("--since", type=int, default=0, help="时段增量天数（配 --races，轻量模式）")
    ap.add_argument("--fix", action="store_true", help="配 --check：校验后自动补跑修复")
    ap.add_argument("--limit", type=int, default=0, help="调试：每环只处理前 n")
    args = ap.parse_args()

    log(f"══ 更新开始 {TS} · 策略: {next(k for k in ('init','basic','races','horse','races-force','check','ledger','ci') if getattr(args, k.replace('-', '_')))} ══ 日志: {LOG_FILE}")

    def lim():
        return ["--limit", str(args.limit)] if args.limit else []

    if args.init:
        run_step("初始化·从0全量", FULL_TEST)
    elif args.basic:
        y = ["--year", args.year] if args.year else []
        run_step("建档·新马对账", BASIC / "build_registry.py", *y)
        run_step("基础·补缺+合并", BASIC / "run_all.py")
    elif args.races:
        if args.since:
            run_step("比赛·轻量时段增量", RACES / "fetch_races.py", "--since", str(args.since), *lim())
            run_step("比赛·合并", RACES / "merge_races.py")
        else:
            run_step("比赛·增量流水线", RACES / "run_all.py", *lim())
    elif args.horse:
        ids = [x.strip() for x in args.horse.split(",") if x.strip()]
        if not ids:
            sys.exit("--horse 需要至少一个 id")
        run_step("比赛·详情更新(定向)", RACES / "fetch_detail.py", "--id", ",".join(ids))
        run_step("比赛·成绩增量(定向)", RACES / "fetch_races.py", "--id", ",".join(ids))
        run_step("比赛·本賞金", RACES / "fetch_prize.py")
        run_step("比赛·合并", RACES / "merge_races.py")
    elif args.races_force:
        run_step("比赛·全量刷新", RACES / "run_all.py", "--force")
    elif args.check:
        run_step("数据校验", CHECK, *(["--fix"] if args.fix else []))
    elif args.ledger:
        run_step("台账·海外拉取", RACES / "fetch_ledger.py")
        run_step("比赛·合并", RACES / "merge_races.py")
    elif args.ci:
        y = ["--year", args.year] if args.year else []
        run_step("CI·建档新马对账", BASIC / "build_registry.py", *y)
        run_step("CI·基础补缺+合并", BASIC / "run_all.py")
        run_step("CI·比赛增量流水线", RACES / "run_all.py", *lim())
        run_step("CI·数据校验", CHECK)
        git_commit_if_changed()

    log("\n══ 更新结束 ══")
    total = sum(dt for _, _, dt in results)
    log(f"总耗时 {total/60:.1f} 分钟 · 步骤: " + " · ".join(
        f"{n}{'OK' if rc == 0 else f'FAIL({rc})'}" for n, rc, _ in results))


if __name__ == "__main__":
    main()
