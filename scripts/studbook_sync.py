#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""studbook 本机同步（Tier2 闭环入口）：命名环 + 状态环 + 合并。

为什么本机跑：studbook.jp 对 GitHub Actions 出口 IP 403（2026-09 起每天如此，见
data/fetch_log.jsonl 的 SearchBameiList 403 记录），studbook 相关步骤只能在**本机直连**跑。
本脚本串起（与 status.yml 同序，命名环前置）：
  1. 命名环  scripts/basic/fetch_studbook.py
             (母名,生年,性) 匹配 → 空名回填 馬名/意味・由来/欧字名 + 冲突报告
             → scripts/basic/merge_basic.py（应用缓存 + 人工表 + 重排）
  2. 状态环  scripts/status/run_status.py
             NAR + 抹消馬簿 + keibabook 补查 + studbook 繁殖登録确认 → 直写 basic.json
             → scripts/basic/merge_basic.py（再套人工表，任务值跨合并存活）
  3. 报告    各环自带报告（data/studbook_report.md / data/登録状态任务报告.md）
             与 fetch_log.jsonl 一起不进 dist（vite copy-data 跳过 _tmp 与 *.md/*.jsonl）

Git 约定（AGENTS.md）：脚本默认只更新 data/，**不 commit/push**。
  - 本机预览确认无误后，由你本人提交/推送：
      git add data/ && git commit -m "data: studbook sync ..."   # 推送只能你操作
  - 传 --commit 可在数据有变化时自动 `git add data/ + commit`（仍**不 push**）。

Windows 任务计划（周频示例；实际路径以你机器为准）：
  powershell -Command "cd Z:\\IdeaProjects\\yunji-web; python scripts\\studbook_sync.py --commit"

用法:
    python scripts/studbook_sync.py            # 只更新 data/
    python scripts/studbook_sync.py --commit   # 更新 + 有变化则自动 commit（不 push）
"""
import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent


def run_step(title, cmd):
    print(f"\n===== {title} =====")
    subprocess.run([sys.executable, *cmd], check=True, cwd=ROOT)


def main():
    ap = argparse.ArgumentParser(description="studbook 本机同步：命名环+状态环+合并（不自动 push）")
    ap.add_argument("--commit", action="store_true",
                    help="数据有变化时自动 git add data/ + commit（仍不 push，推送由你本人操作）")
    args = ap.parse_args()

    run_step("命名环：studbook 意味/欧字/空名回填", ["scripts/basic/fetch_studbook.py"])
    run_step("合并（应用缓存+人工表+重排）", ["scripts/basic/merge_basic.py"])
    run_step("状态环：登録状態/去向/调教师 + studbook 繁殖登録确认", ["scripts/status/run_status.py"])
    run_step("合并（再套人工表）", ["scripts/basic/merge_basic.py"])

    print("\n===== 收尾 =====")
    print("✔ data/ 已更新。报告：")
    print("   - data/studbook_report.md（命名环：回填/冲突/库外産駒）")
    print("   - data/登録状态任务报告.md（状态环：繁殖/種馬 确认等）")
    if not args.commit:
        print("\n✔ 未自动提交。确认无误后由你本人执行（推送也只能你操作）：")
        print('   git add data/ && git commit -m "data: studbook sync"')
        return
    subprocess.run(["git", "add", "data/"], check=True, cwd=ROOT)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        print("\n✔ 数据无变化，跳过 commit")
        return
    msg = f"data: studbook sync {datetime.now():%Y-%m-%dT%H:%M}"
    subprocess.run(["git", "commit", "-m", msg], check=True, cwd=ROOT)
    print(f"\n✔ 已提交：{msg}")
    print("   （push 不自动执行，请由你本人推送）")


if __name__ == "__main__":
    main()
