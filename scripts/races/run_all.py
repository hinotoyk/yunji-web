#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞赛部分编排：线性单链，逐环执行 → 合并 → 删缓存。

链：
  ① fetch_detail  详情更新 + 通算成績判变（全部有 nk_id 的马）
  ② fetch_races   成绩增量（只抓 判变/无文件 的马）
  ③ fetch_prize   重赏 1/2着 本賞金（只处理②的新增记录）
  ④ fetch_ledger  台账海外场增量（与①②③无依赖，但合并前必须完成）
  ⑤ merge_races   合并 → races 文件 + basic.json → 删缓存

每个抓取脚本只写自己的独立缓存（data/_tmp/），互不覆盖，最后统一合并。

用法:
    python run_all.py                 # 完整流水线
    python run_all.py --limit 5       # 调试：每环只处理前 5
    python run_all.py --skip-ledger   # 跳过台账环节
    python run_all.py --force         # 成绩页全量重抓（含本賞金回填）
    python run_all.py --keep          # 合并后保留缓存（调试）
"""
import argparse
import io
import subprocess
import sys
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
    ap = argparse.ArgumentParser(description="竞赛部分线性编排")
    ap.add_argument("--limit", type=int, default=0, help="每环只处理前 n（调试）")
    ap.add_argument("--skip-ledger", action="store_true", help="跳过台账环节(④)")
    ap.add_argument("--force", action="store_true", help="成绩页全量重抓(②)")
    ap.add_argument("--keep", action="store_true", help="合并后保留缓存")
    args = ap.parse_args()

    def lim():
        return ["--limit", str(args.limit)] if args.limit else []

    run("fetch_detail.py", *lim())

    run("fetch_races.py", *lim(), *(["--force"] if args.force else []))

    run("fetch_prize.py", *lim())

    if not args.skip_ledger:
        run("fetch_ledger.py")
    else:
        print("\n◆ 跳过台账环节 (--skip-ledger)")

    print("\n◆ 合并缓存 → races 文件 + basic.json")
    run("merge_races.py", *(["--keep"] if args.keep else []))
    print("\n[OK] 竞赛流水线完成")


if __name__ == "__main__":
    main()
