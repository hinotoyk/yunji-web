#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""视频回放 · 本机日频兜底（家宽 IP 全量抓 → 重算映射 → 提交推送，CI 负责构建部署）。

为什么需要它：B 站对机房 IP 有风控（GitHub runner 大概率只拿到 v_voucher 验证票，见
`.github/workflows/video-task.yml` 文件头）。家宽 IP 实测能拿全量 192 条，所以**最可靠的
日频方案是本地跑一次再 push**；push 后 CI 的 deploy 自动构建，线上就有了。

Windows 任务计划程序（每天 07:30，家宽网络下）：
    程序：  python
    参数：  Z:\\IdeaProjects\\yunji-web\\scripts\\video\\local_refresh.py
    起始于：Z:\\IdeaProjects\\yunji-web
或 PowerShell 里手动跑一次：
    python scripts/video/local_refresh.py            # 抓取 + 重算 + 提交推送
    python scripts/video/local_refresh.py --no-push  # 只看结果，不提交（调试用）

退出码：0 成功/无变化；1 抓取或推送失败（任务计划程序里会显示为失败，便于发现）。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PY = sys.executable
FILES = ["data/video_raw.json", "data/video-map.json", "data/video_report.md"]


def run(cmd, check=True):
    print(f"\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=str(ROOT))
    if check and r.returncode != 0:
        raise SystemExit(f"✗ 失败（exit={r.returncode}）：{' '.join(str(c) for c in cmd)}")
    return r.returncode


def git(*args, check=True):
    return run(["git", *args], check=check)


def main():
    ap = argparse.ArgumentParser(description="本机日频兜底：抓 B 站清单 → 重算映射 → 提交推送")
    ap.add_argument("--via", choices=["both", "search", "seasons"], default="both")
    ap.add_argument("--replace", action="store_true", help="覆盖清单（默认累积合并）")
    ap.add_argument("--no-push", action="store_true", help="只重算，不提交不推送")
    args = ap.parse_args()

    fetch = [PY, str(HERE / "fetch_video.py"), "--via", args.via]
    if args.replace:
        fetch.append("--replace")
    if run(fetch, check=False) != 0:
        # 抓取失败不阻断重算：用上一次的清单基线照样能挂上新入库的比赛
        print("⚠ 抓取失败 → 用已有 data/video_raw.json 继续重算")

    run([PY, str(HERE / "build_video_map.py")])

    meta = json.loads((ROOT / "data" / "video-map.json").read_text(encoding="utf-8")).get("_meta") or {}
    raw_n = len(json.loads((ROOT / "data" / "video_raw.json").read_text(encoding="utf-8")))
    print(f"\n结果：清单 {raw_n} 条 → 映射 {meta.get('auto', 0) + meta.get('manual', 0)} 场"
          f"（自动 {meta.get('auto')} · 人工 {meta.get('manual')} · 未匹配 {meta.get('unmatched')}）")

    if args.no_push:
        print("--no-push：跳过 git 提交")
        return

    git("add", *FILES)
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=str(ROOT)).returncode == 0:
        print("产物无变化，跳过提交")
        return

    git("commit", "-m", "data: video map update（本机抓取）")
    if git("pull", "--rebase", "--autostash", "origin", "main", check=False) != 0:
        git("rebase", "--abort", check=False)
        raise SystemExit("✗ rebase 冲突 → 本次不推送，请手工处理后重跑")
    if git("push", "origin", "HEAD:main", check=False) != 0:
        raise SystemExit("✗ 推送失败（检查网络/凭据）")
    print("\n✔ 已推送 → CI 的 deploy 会自动构建并上线")


if __name__ == "__main__":
    main()
