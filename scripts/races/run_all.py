#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞赛部分编排：线性单链，逐环执行 → 合并 → 删缓存。

链：
  ① fetch_detail  详情更新 + 通算成績判变（全部有 nk_id 的马）
  ② fetch_races   成绩增量（只抓 判变/无文件 的马；SP 页一次回填 格/条件/調教師/本賞金）
  ③ fetch_ledger  台账海外场增量（与①②无依赖，但合并前必须完成）
  ④ merge_races   合并 → races 文件 + basic.json → 删缓存

每个抓取脚本只写自己的独立缓存（data/_tmp/），互不覆盖，最后统一合并。
本賞金已并入②（与格/条件同 URL 的 SP 比赛结果页），不再有独立 ③ fetch_prize 环节。

用法:
    python run_all.py                 # 完整流水线
    python run_all.py --limit 5       # 调试：每环只处理前 5
    python run_all.py --skip-ledger   # 跳过台账环节
    python run_all.py --force         # 成绩页全量重抓（含 SP 页/调教师页/骑手页回填，已有记录缺失字段一并补齐）
    python run_all.py --keep          # 合并后保留缓存（调试）
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable

sys.path.insert(0, str(HERE.parent))        # 引导 scripts/core/（纯 stdlib）
from core import constants, runtime, sire_config  # noqa: E402

runtime.install_utf8_stdout()


def clean_stale_ledger_cache():
    """台账关闭/跳过时清掉上次启用可能残留的 _tmp/races/ledger.json（D6 编排层清理：
    fetch_ledger.py 内部只在「入口被调用」时清，关闭态编排层根本不调它 →
    这里显式补一次，防 merge_races 误消费存量；record_keys 幂等仅作兜底）。
    缓存真实路径 = constants.tmp_dir("races")/ledger.json（races/common.py TMP_DIR）。"""
    stale = constants.tmp_dir("races") / "ledger.json"
    if stale.exists():
        stale.unlink()
        print(f"✔ 已清理残留台账缓存: {stale}")


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

    if args.skip_ledger:
        print("\n◆ 跳过台账环节 (--skip-ledger)")
        clean_stale_ledger_cache()
    elif not sire_config.ledger_url():
        print("\n◆ 跳过台账环节 (台账未启用：config/sire.json 的 ledger.url 为空)")
        clean_stale_ledger_cache()
    else:
        run("fetch_ledger.py")

    print("\n◆ 合并缓存 → races 文件 + basic.json")
    run("merge_races.py", *(["--keep"] if args.keep else []))
    print("\n[OK] 竞赛流水线完成")


if __name__ == "__main__":
    main()
