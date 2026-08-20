#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时验证工具：抓取指定 nk_id 的成绩页，打印 parse_races 输出（不写库、不入 crops）。
用法:
    python scripts/fetch_race_probe.py 2023103604 2023107377 2023106400 2023107345 2022105166
输出: JSON {nk_id: [战绩...]} 到 stdout（把输出贴回来即可）。
"""
import io
import json
import sys
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrape_netkeiba import fetch, parse_races, RESULT_URL  # noqa: E402


def main():
    ids = sys.argv[1:]
    if not ids:
        sys.exit("用法: python scripts/fetch_race_probe.py <nk_id> [<nk_id> ...]")
    out = {}
    for i, nk in enumerate(ids, 1):
        try:
            recs = parse_races(fetch(RESULT_URL.format(id=nk)))
            out[nk] = recs
            print(f"[{i}/{len(ids)}] {nk}: {len(recs)} 场", file=sys.stderr)
        except Exception as e:
            print(f"[{i}/{len(ids)}] {nk}: ERR {e}", file=sys.stderr)
        time.sleep(2)  # 轻量间隔，避免触发限流
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
