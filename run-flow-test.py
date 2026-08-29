#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹 (yunji-web) 全流程本地测试运行器（零影响、零 token）。

背景
----
在不动仓库的前提下，把 GitHub Actions `update-data.yml` 的同步链路在本地完整跑一遍：
    daily  : scrape_netkeiba --new → pull_races → scrape_netkeiba --races
             → build-data → test-data
    weekly : --new → pull_races → --ped → jbis --fill → build-data → test-data
    all    : netkeiba --all → jbis --all → build-data → test-data（重，慎用）
    single : netkeiba --name → jbis --horse → build-data → test-data

做法
----
1. 在系统临时目录（或 --temp-dir）新建 `yunji-flow-test-<时间戳>/`，
   把仓库的 data/ scripts/ page/ history/ docs/ 原样复制进去（层级与项目完全一致）。
2. 项目脚本复制件原样使用（一个字节不改）；在临时目录根部注入 sitecustomize.py
   请求日志钩子，配合 PYTHONPATH 让每个子进程自动记录每一次 HTTP 请求
   （requests + urllib 全覆盖：netkeiba / JBIS / Google Sheets）→ data/raw/request_log.csv。
   项目自带的 data/raw/fetch_log.csv 也会照常生成。
3. 依次执行各步骤（cwd=临时目录），stdout 实时打印并落盘 run.log；任一步失败即中止
   （同 GitHub Actions 行为）。
4. 所有产物只写临时目录；仓库只读、零改动。运行全程为本地 Python，不消耗任何 token。
5. 请求限速（默认开启，--no-pacing 关闭）：netkeiba 每请求间隔 20-30s、jbis 40-60s，
   由钩子统一控制（脚本自身 --sleep 置 0），避免被源站限流/超时；钩子同时把请求超时放宽到 ≥60s。
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent                 # 仓库根（本文件所在目录）
MIRROR_DIRS = ["data", "scripts", "page", "history", "docs"]  # 与项目层级完全一致

# 注入到临时目录根部的请求日志钩子（sitecustomize，解释器启动时自动导入）
SITECUSTOMIZE = r'''# -*- coding: utf-8 -*-
"""请求日志钩子：由 run-flow-test.py 注入。PYTHONPATH 命中本文件时自动生效。
记录本进程发出的每一次 HTTP 请求（requests.api.request + urllib.request.urlopen）
到 YUNJI_REQ_LOG 指向的 CSV（ts, script, method, url, status, dur_ms, note）。"""
import csv
import os
import random
import sys
import time

_LOG = os.environ.get("YUNJI_REQ_LOG") or ""
if not _LOG:
    sys.modules[__name__]._installed = False
else:
    _SCRIPT = os.path.basename(sys.argv[0] or "python")
    try:
        import threading
        _LOCK = threading.Lock()
    except Exception:
        _LOCK = None

    def _pace():
        """请求限速：YUNJI_PACE_NK / YUNJI_PACE_JBIS = "低,高" 秒（env）。
        命中 netkeiba / jbis 域名的请求结束后随机 sleep，避免被源站限流/超时。"""
        ranges = []
        for key, host_kw in (("YUNJI_PACE_NK", "netkeiba"), ("YUNJI_PACE_JBIS", "jbis")):
            raw = os.environ.get(key) or ""
            try:
                lo, hi = (float(x) for x in raw.split(","))
            except Exception:
                continue
            if lo > 0:
                ranges.append((host_kw, lo, hi))
        if not ranges:
            return None

        def apply(url):
            host = (str(url) or "").lower()
            for kw, lo, hi in ranges:
                if kw in host:
                    time.sleep(random.uniform(lo, hi))
                    return
        return apply

    _PACE = _pace()

    def _append(method, url, status, dur_ms, note=""):
        new = not os.path.exists(_LOG)
        with open(_LOG, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts", "script", "method", "url", "status", "dur_ms", "note"])
            w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), _SCRIPT, method,
                        url, status, round(dur_ms, 1), note])

    def _log(method, url, status, dur_ms, note=""):
        try:
            if _LOCK:
                with _LOCK:
                    _append(method, url, status, dur_ms, note)
            else:
                _append(method, url, status, dur_ms, note)
        except Exception:
            pass

    def _wrap_requests():
        try:
            import requests.api
        except Exception:
            return
        orig = requests.api.request

        def request(method, url, **kw):
            t0 = time.time()
            # 脚本内写死的 30s 超时在慢网/限流时易误伤 → 测试钩子放宽到 ≥60s
            t = kw.get("timeout")
            try:
                if isinstance(t, (int, float)):
                    kw["timeout"] = max(float(t), 60.0)
                elif t is None:
                    kw["timeout"] = 60.0
            except Exception:
                pass
            try:
                resp = orig(method, url, **kw)
                _log(method.upper(), url, getattr(resp, "status_code", "?"),
                     (time.time() - t0) * 1000)
                if _PACE:
                    _PACE(url)
                return resp
            except Exception as e:
                _log(method.upper(), url, "ERR", (time.time() - t0) * 1000, str(e)[:80])
                if _PACE:
                    _PACE(url)
                raise

        requests.api.request = request  # requests.get/post 内部经此调用

    def _wrap_urlopen():
        try:
            import urllib.request
        except Exception:
            return
        orig = urllib.request.urlopen

        def _url_str(u):
            return u.full_url if hasattr(u, "full_url") else str(u)

        def urlopen(url, *a, **k):
            t0 = time.time()
            try:
                resp = orig(url, *a, **k)
                status = getattr(resp, "status", None) or resp.getcode()
                _log("GET", _url_str(url), status, (time.time() - t0) * 1000)
                if _PACE:
                    _PACE(_url_str(url))
                return resp
            except Exception as e:
                _log("GET", _url_str(url), "ERR", (time.time() - t0) * 1000, str(e)[:80])
                if _PACE:
                    _PACE(_url_str(url))
                raise

        urllib.request.urlopen = urlopen

    _wrap_requests()
    _wrap_urlopen()
    sys.modules[__name__]._installed = True
'''


def _importable(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False


def check_deps():
    missing = [m for m in ("requests", "bs4", "lxml") if not _importable(m)]
    if missing:
        sys.exit(f"❌ 缺少依赖: {missing}。请先执行: pip install requests beautifulsoup4 lxml")


def build_steps(mode, horse_name, sleep, limit, from_zero=False, pacing=True):
    """生成步骤列表 [(名称, 命令列表)]。from_zero=True → 从0重建链路（空库）：
    netkeiba --all → jbis --all（兜底）→ pull_races → build-data → test-data；
    --limit N 只处理前 N 匹（此时 jbis --all 因不支持 --limit 而跳过，避免误触发全量兜底）。
    pacing=True → 抓取脚本自身 --sleep 置 0，由 sitecustomize 钩子统一限速
    （netkeiba 30-60s / jbis 60-90s，避免源站限流/超时）。"""
    nk_sleep = sleep if sleep is not None else (0.0 if pacing else 1.0)
    jb_sleep = (sleep if sleep is not None else
                (0.0 if pacing else {"all": 1.2, "weekly": 3.0, "single": 1.2}.get(mode, 1.2)))
    steps = []
    if from_zero:
        steps.append(("netkeiba 全量 (--all，从空库)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--all", "--sleep", str(nk_sleep)]))
        if limit is None:
            steps.append(("JBIS 全量 (--all，兜底)",
                          [sys.executable, "scripts/scrape_jbis.py", "--all", "--sleep", str(jb_sleep)]))
        steps.append(("拉取比赛台账 (pull_races)",
                      [sys.executable, "scripts/pull_races.py"]))
    elif mode in ("daily", "weekly"):
        steps.append(("netkeiba 新马/改名对账 (--new)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--new", "--sleep", str(nk_sleep)]))
        steps.append(("拉取比赛台账 (pull_races)",
                      [sys.executable, "scripts/pull_races.py"]))
    if not from_zero and mode == "daily":
        steps.append(("netkeiba 成绩页增量 (--races)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--races", "--sleep", str(nk_sleep)]))
    elif not from_zero and mode == "weekly":
        steps.append(("netkeiba 血统/クロス 补全 (--ped)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--ped", "--sleep", str(nk_sleep)]))
        steps.append(("JBIS 兜底补填 (--fill)",
                      [sys.executable, "scripts/scrape_jbis.py", "--fill", "--sleep", str(jb_sleep)]))
    elif not from_zero and mode == "all":
        steps.append(("netkeiba 全量 (--all)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--all", "--sleep", str(nk_sleep)]))
        steps.append(("JBIS 全量 (--all)",
                      [sys.executable, "scripts/scrape_jbis.py", "--all", "--sleep", str(jb_sleep)]))
    elif not from_zero and mode == "single":
        steps.append(("netkeiba 单匹 (--name)",
                      [sys.executable, "scripts/scrape_netkeiba.py", "--name", horse_name, "--sleep", str(nk_sleep)]))
        steps.append(("JBIS 单匹 (--horse)",
                      [sys.executable, "scripts/scrape_jbis.py", "--horse", horse_name, "--sleep", str(jb_sleep)]))
    if limit is not None:
        for _name, cmd in steps:
            if "scrape_netkeiba.py" in cmd[1]:   # 注意：scrape_jbis.py 不支持 --limit
                cmd += ["--limit", str(limit)]
    steps.append(("构建 (build-data)",
                  [sys.executable, "scripts/build-data.py", "--note",
                   ("from-0 同步" if from_zero else f"{mode} 同步")]))
    steps.append(("校验 (test-data)",
                  [sys.executable, "scripts/test-data.py"]))
    return steps


def run_step(step_name, cmd, cwd, env, logf):
    print(f"\n===== {step_name} =====")
    print(f"      $ {' '.join(str(c) for c in cmd)}")
    logf.write(f"\n===== {step_name} =====\n$ {' '.join(str(c) for c in cmd)}\n")
    logf.flush()
    t0 = time.time()
    try:
        p = subprocess.Popen(cmd, cwd=str(cwd), env=env, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                             errors="replace", bufsize=1)
    except OSError as e:
        logf.write(f"❌ 启动失败: {e}\n")
        return 127, 0.0
    for line in p.stdout:
        line = line.rstrip("\n")
        if line:
            print("  | " + line)
            logf.write(line + "\n")
    rc = p.wait()
    dur = time.time() - t0
    status = "✔ OK" if rc == 0 else f"✗ FAIL(rc={rc})"
    msg = f"  → {status}  ({dur:.1f}s)"
    print(msg)
    logf.write(msg + "\n")
    logf.flush()
    return rc, dur


def main():
    ap = argparse.ArgumentParser(
        description="云迹全流程本地测试：复制仓库到系统临时目录后按 Actions 链路执行，仓库零改动",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python run-flow-test.py                          # daily 模式\n"
            "  python run-flow-test.py --mode weekly            # 血统/クロス + JBIS 兜底\n"
            "  python run-flow-test.py --mode all               # 全量抓取（重，慎用）\n"
            "  python run-flow-test.py --mode single --horse-name アオイハルカ\n"
        ))
    ap.add_argument("--mode", choices=["daily", "weekly", "all", "single"], default="daily",
                    help="同步模式（与 Actions workflow_dispatch 一致，默认 daily）")
    ap.add_argument("--horse-name", default="", help="single 模式必填（日文马名）")
    ap.add_argument("--sleep", type=float, default=None,
                    help="覆盖抓取脚本的请求间隔秒数（默认：pacing 开启时置 0，由钩子统一限速；关闭时与 Actions 一致）")
    ap.add_argument("--no-pacing", action="store_true",
                    help="关闭请求限速钩子（netkeiba 20-30s / jbis 40-60s），仅调试小样本时用")
    ap.add_argument("--limit", type=int, default=None,
                    help="只处理前 N 匹马（调试小样本；注意不是 N 页）")
    ap.add_argument("--from-zero", action="store_true",
                    help="从0重建：不复制 data/，建空库骨架（空 registry/jbis），"
                         "流程=netkeiba --all → jbis --all（兜底，--limit 小样本时跳过）"
                         "→ pull_races → build-data → test-data")
    ap.add_argument("--temp-dir", default=None,
                    help="临时目录的基目录（默认系统 TEMP；必须在仓库外）")
    ap.add_argument("--cleanup", action="store_true", help="运行结束后删除临时目录")
    args = ap.parse_args()

    if args.mode == "single" and not args.horse_name:
        sys.exit("❌ single 模式必须提供 --horse-name（日文马名）")
    check_deps()

    base = Path(args.temp_dir).resolve() if args.temp_dir else Path(tempfile.gettempdir())
    if base == REPO or REPO in base.parents:
        sys.exit("❌ --temp-dir 不能位于仓库内（保证零影响）")
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp = base / f"yunji-flow-test-{ts}"
    tmp.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("云迹全流程本地测试（完全本地执行，不消耗任何 token）")
    print(f"  模式        : {args.mode}" + ("（从0重建）" if args.from_zero else ""))
    print(f"  请求限速    : " + ("netkeiba 20-30s / jbis 40-60s（--no-pacing 关闭）"
                                 if not args.no_pacing else "关闭"))
    print(f"  仓库(只读)  : {REPO}")
    print(f"  临时目录    : {tmp}")
    print("=" * 70)

    print("\n[1/3] 复制仓库结构 → 临时目录（层级与项目完全一致）…")
    if args.from_zero:
        # 从0模式：只复制 脚本/页面/文档；data 从空库骨架开始（build-data 自行分配 id 1..N）
        for name in ("scripts", "page", "docs"):
            src = REPO / name
            if src.exists():
                shutil.copytree(src, tmp / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            else:
                (tmp / name).mkdir(parents=True, exist_ok=True)
        for name in ("data/raw", "data/races", "data/racefiles", "data/pedigree", "data/images", "history"):
            (tmp / name).mkdir(parents=True, exist_ok=True)
        today = datetime.date.today().isoformat()
        (tmp / "data" / "raw" / "jbis.json").write_text("[]", encoding="utf-8")
        (tmp / "data" / "raw" / "jbis_pedigree.json").write_text("[]", encoding="utf-8")
        (tmp / "data" / "registry.json").write_text(
            json.dumps({"horses": [], "updated": today}, ensure_ascii=False, indent=2), encoding="utf-8")
        if (REPO / "data" / "jockeys.json").exists():
            shutil.copy2(REPO / "data" / "jockeys.json", tmp / "data" / "jockeys.json")
        print("  （从0模式：data/ 为空库骨架：registry 空 + jbis.json/jbis_pedigree.json 空 +"
              " jockeys.json 静态字典表；history/ 为空）")
    else:
        for name in MIRROR_DIRS:
            src = REPO / name
            if src.exists():
                shutil.copytree(src, tmp / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            else:
                (tmp / name).mkdir(parents=True, exist_ok=True)
    (tmp / "data" / "raw").mkdir(parents=True, exist_ok=True)

    print("\n[2/3] 注入请求日志钩子（sitecustomize.py）…")
    sc = tmp / "sitecustomize.py"
    sc.write_text(SITECUSTOMIZE, encoding="utf-8")
    req_log = tmp / "data" / "raw" / "request_log.csv"

    env = dict(os.environ)
    env["PYTHONPATH"] = str(tmp) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    env["YUNJI_REQ_LOG"] = str(req_log)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    if not args.no_pacing:
        env["YUNJI_PACE_NK"] = "20,30"      # netkeiba 每请求间隔 20-30s
        env["YUNJI_PACE_JBIS"] = "40,60"    # jbis 每请求间隔 40-60s

    run_log = tmp / "run.log"
    logf = open(run_log, "w", encoding="utf-8")
    logf.write(f"# 云迹全流程测试 run.log\n# 时间: {datetime.datetime.now().isoformat()}\n"
               f"# 模式: {args.mode} | 临时目录: {tmp}\n")

    steps = build_steps(args.mode, args.horse_name, args.sleep, args.limit,
                        from_zero=args.from_zero, pacing=not args.no_pacing)
    if args.from_zero and args.limit is not None:
        print("  ⚠ 小样本模式（--limit）：JBIS --all 不支持 --limit，已跳过"
              "（完整 from-0 全量跑会自动包含 jbis --all）")
    print(f"\n[3/3] 执行 {len(steps)} 个步骤（cwd={tmp}）…")
    results = []
    for idx, (name, cmd) in enumerate(steps, 1):
        label = f"[{idx}/{len(steps)}] {name}"
        rc, dur = run_step(label, cmd, tmp, env, logf)
        results.append((label, rc, dur))
        if rc != 0:
            print(f"\n❌ 步骤失败「{name}」（rc={rc}），中止（同 GitHub Actions 行为）。")
            logf.write(f"\n❌ 步骤失败: {name} (rc={rc})\n")
            break

    print("\n" + "=" * 70)
    print("汇总")
    failed = [r for r in results if r[1] != 0]
    for name, rc, dur in results:
        mark = "✔" if rc == 0 else "✗"
        print(f"  {mark} {name}  ({dur:.1f}s)")
    n_req = 0
    if req_log.exists():
        with open(req_log, encoding="utf-8") as f:
            n_req = max(0, sum(1 for _ in f) - 1)
    print(f"\n  HTTP 请求总数（data/raw/request_log.csv）: {n_req}")
    print(f"  临时目录: {tmp}")
    print(f"  运行日志: {run_log}")
    if failed:
        print("  ❌ 有步骤失败（详见 run.log）")
    else:
        print("  ✔ 全流程通过")
    print("=" * 70)
    logf.write(f"\n# 请求数: {n_req} | 失败步骤: {len(failed)}\n")
    logf.close()

    if args.cleanup:
        shutil.rmtree(tmp, ignore_errors=True)
        print("（--cleanup 已删除临时目录）")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
