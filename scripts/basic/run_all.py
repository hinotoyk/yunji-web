#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""基础部分编排：并发抓取 → 合并 → 删缓存。

并发架构（避免 basic.json 覆盖）：
  - 每个并发脚本只写自己的独立缓存 data/_tmp/<name>.json，不碰 basic.json。
  - 因此无依赖的脚本可**真并行**：fetch_pedigree / fetch_nk_id / fetch_studbook。
  - fetch_detail 逻辑上依赖 nk_id（需读 basic.json 里的 nk_id），放在第二阶段。
  - 最后 merge_basic.py 把全部缓存合并进 basic.json 并删缓存。

用法:
    python run_all.py                     # 阶段1 并行3个 → 阶段2 detail → merge
    python run_all.py --skip-detail       # 只做阶段1 + merge（不抓详情）
"""
import argparse
import io
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = Path(__file__).resolve().parent
PY = sys.executable


def run(script, *args):
    print(f"\n===== {script} =====", flush=True)
    return subprocess.run([PY, str(HERE / script), *args])


def main():
    ap = argparse.ArgumentParser(description="基础部分并发编排")
    ap.add_argument("--skip-detail", action="store_true", help="跳过阶段2(detail)")
    ap.add_argument("--sleep", type=float, default=1.2)
    args = ap.parse_args()

    # 阶段1：三个无依赖脚本真并行（各写独立缓存）
    print("◆ 阶段1：并行 fetch_pedigree / fetch_nk_id / fetch_studbook")
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {
            ex.submit(run, "fetch_pedigree.py", "--sleep", str(args.sleep)): "血统",
            ex.submit(run, "fetch_nk_id.py", "--sleep", str(args.sleep)): "nk_id",
            ex.submit(run, "fetch_studbook.py", "--sleep", str(args.sleep)): "意味・由来",
        }
        for f in futs:
            f.result()

    # 阶段2：detail 需要 nk_id 就绪
    if not args.skip_detail:
        print("\n◆ 阶段2：fetch_detail（需 nk_id）")
        run("fetch_detail.py", "--sleep", str(args.sleep))
    else:
        print("\n◆ 跳过阶段2 (detail)")

    # 合并
    print("\n◆ 合并缓存 → basic.json")
    run("merge_basic.py")
    print("\n[OK] 全部完成")


if __name__ == "__main__":
    main()
