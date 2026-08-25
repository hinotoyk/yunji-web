#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""M2.2 骑手字典：data/jockeys.json = {jockey_id: 全名}，一次性抓完终身有效。

netkeiba 成绩页骑手名全站截断（5 字截成 4 字，如 佐々木大輔→佐々木大），但链接 jockey_id 完整。
从 /jockey/result/{id}/ 页 <title> 提取全名（"佐々木大輔の年度別成績 | 騎手データ - netkeiba"）。

用法:
    python scripts/tools/build_jockeys.py                 # 增量：只抓缺失的 id
    python scripts/tools/build_jockeys.py --force         # 全量重抓
    python scripts/tools/build_jockeys.py --limit 10      # 调试：只抓前 10 个缺失
    python scripts/tools/build_jockeys.py --sleep 1.0     # 请求间隔（默认 1.5s）
"""
import argparse
import io
import json
import re
import sys
import time
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scrape_netkeiba import fetch, jitter  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
RACES_DB = ROOT / "data" / "raw" / "netkeiba_races.json"
JOCKEYS_PATH = ROOT / "data" / "jockeys.json"
JOCKEY_URL = "https://db.netkeiba.com/jockey/result/{id}/"

TITLE_RE = re.compile(r"^(.*?)の(?:年度別成績|騎手成績)")


def fullname_from_title(title):
    """<title> '佐々木大輔の年度別成績 | 騎手データ - netkeiba' → '佐々木大輔'"""
    m = TITLE_RE.search(title or "")
    return m.group(1).strip() if m else ""


def fetch_fullname(jockey_id, sleep=1.5):
    html = fetch(JOCKEY_URL.format(id=jockey_id))
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    return fullname_from_title(m.group(1).strip() if m else "")


def collect_jockey_ids():
    """扫 netkeiba_races.json → distinct jockey_id"""
    ids = set()
    if not RACES_DB.exists():
        return ids
    db = json.loads(RACES_DB.read_text(encoding="utf-8"))
    for recs in db.values():
        for r in recs:
            jid = (r.get("jockey_id") or "").strip()
            if jid:
                ids.add(jid)
    return ids


def main():
    ap = argparse.ArgumentParser(description="生成骑手字典 jockeys.json（M2.2）")
    ap.add_argument("--force", action="store_true", help="全量重抓（默认增量）")
    ap.add_argument("--limit", type=int, help="调试：只抓前 n 个缺失")
    ap.add_argument("--sleep", type=float, default=1.5, help="请求间隔秒数（抖动）")
    args = ap.parse_args()

    ids = collect_jockey_ids()
    if not ids:
        sys.exit("❌ netkeiba_races.json 无 jockey_id（先跑 scrape_netkeiba.py --races 或适配器 update）")

    jockeys = {}
    if JOCKEYS_PATH.exists():
        jockeys = json.loads(JOCKEYS_PATH.read_text(encoding="utf-8"))

    todo = sorted(ids - set(jockeys)) if not args.force else sorted(ids)
    if args.limit:
        todo = todo[:args.limit]
    print(f"✔ jockey_id 共 {len(ids)} 个 · 已收录 {len(jockeys)} · 待抓 {len(todo)}")

    ok, fail = 0, []
    for i, jid in enumerate(todo, 1):
        try:
            name = fetch_fullname(jid, args.sleep)
            if name:
                jockeys[jid] = name
                ok += 1
                print(f"  [{i}/{len(todo)}] {jid} → {name}")
            else:
                fail.append(jid)
                print(f"  [{i}/{len(todo)}] ⚠ {jid}: 未解析出全名")
        except Exception as e:  # noqa: BLE001
            fail.append(jid)
            print(f"  [{i}/{len(todo)}] ❌ {jid}: {e}")
        time.sleep(jitter(args.sleep))

    JOCKEYS_PATH.write_text(json.dumps(jockeys, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 已写: data/jockeys.json（{len(jockeys)} 个）· 解析成功 {ok} · 失败 {len(fail)}")
    if fail:
        print("⚠ 失败 jockey_id:", ", ".join(fail))

    # 报告：截断名 → 全名 对照（供人工核对）
    if RACES_DB.exists():
        db = json.loads(RACES_DB.read_text(encoding="utf-8"))
        seen = {}
        for recs in db.values():
            for r in recs:
                jid = (r.get("jockey_id") or "").strip()
                short = (r.get("騎手") or "").strip()
                if jid and jid in jockeys and short and short != jockeys[jid]:
                    seen[jid] = (short, jockeys[jid])
        if seen:
            print("\n===== 截断名 → 全名 对照（{}/{}）=====".format(len(seen), len(ids)))
            for jid, (s, f) in sorted(seen.items()):
                print(f"  {s} → {f}")


if __name__ == "__main__":
    main()
