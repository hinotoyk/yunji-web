#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探针：对比两个比赛结果页接口，验证 race.netkeiba.com 能否取代 db.netkeiba.com/race/{id}/（#5 db 域）。

背景：当前 M2.4 用 db 域 /race/{id}/ 的 race_table_01（每行「賞金(万円)」= 獲得賞金，含付加賞），
再靠 4着/5着 反推本賞金（付加賞不派给 4/5着）。用户发现 race.netkeiba.com/race/result.html 可能
**直接显示本賞金**（付加賞-free），若能取代，収得計算（M4）可去掉反推噪声。

本脚本不预设解析器，只做「侦察」：
- 抽 10 场（可从 data/raw/netkeiba_races.json 随机取样，也可命令行指定 race_id）
- 同一 race_id 同时抓两个接口
- 对每页：打印 本賞金/付加賞/1着~5着賞金 关键词的 HTML 上下文 + 表格表头 + 金额正则扫描
- 输出可粘贴的报告（stdout）+ data/probe_race_report.md

用法:
    python scripts/probe_race_page.py                     # 随机 10 场（固定随机种子，可复现）
    python scripts/probe_race_page.py 202607010608 ...    # 指定 race_id
    python scripts/probe_race_page.py --sleep 2.0 --out data/probe_race_report.md
"""
import argparse
import io
import json
import random
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
RACES_DB = ROOT / "data" / "raw" / "netkeiba_races.json"
DEFAULT_OUT = ROOT / "data" / "probe_race_report.md"

RACE_SP_URL = "https://race.netkeiba.com/race/result.html?race_id={id}"   # 新接口（SP 域，UTF-8）
RACE_DB_URL = "https://db.netkeiba.com/race/{id}/"                        # 现 #5 db 域（EUC-JP）

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# 关注的金额/赏金关键词
PRIZE_KEYS = ["本賞金", "付加賞", "1着賞金", "2着賞金", "3着賞金", "4着賞金", "5着賞金", "払戻", "単勝", "複勝"]
AMOUNT_RE = re.compile(r"[\d,]{3,}(?:円|万)")


def fetch_text(url, encoding_guess=None):
    """抓取并按 guess 解码（db 域 EUC-JP / SP 域 UTF-8 强制优先，不信 requests 自动检测）；返回 (html, charset)"""
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    if encoding_guess:
        for enc in (encoding_guess, "euc-jp", "utf-8"):
            try:
                return r.content.decode(enc, errors="replace"), enc
            except (UnicodeDecodeError, LookupError):
                continue
    return r.text, r.encoding or "utf-8"


def snip(html, kw, before=160, after=340):
    """关键词首次出现的 HTML 上下文片段（去多余空白）"""
    i = html.find(kw)
    if i < 0:
        return None
    s = max(0, i - before)
    e = min(len(html), i + len(kw) + after)
    return re.sub(r"\s+", " ", html[s:e])


def table_heads_and_rows(html, max_rows=3):
    """每个 <table> 的 表头 + 前几行（文本）→ 列表，便于人眼核对列结构"""
    soup = BeautifulSoup(html, "lxml")
    out = []
    for t in soup.find_all("table"):
        ths = [re.sub(r"\s+", "", th.get_text(" ", strip=True)) for th in t.find_all("th")]
        rows = []
        for tr in t.find_all("tr")[:max_rows]:
            tds = [re.sub(r"\s+", "", td.get_text(" ", strip=True)) for td in tr.find_all("td")]
            rows.append(tds)
        cls = t.get("class") or []
        out.append({"class": cls, "headers": ths, "rows": rows})
    return out


def scan_amounts(html):
    """全页金额出现统计（去重计数），用于快速判断该页有无赏金字段"""
    return AMOUNT_RE.findall(html)


def probe_one(race_id, sleep):
    print(f"\n===== race_id={race_id} =====")
    report = {"race_id": race_id, "sp": {}, "db": {}}

    # ── 新接口 race.netkeiba.com ──
    try:
        html_sp, enc_sp = fetch_text(RACE_SP_URL.format(id=race_id), "utf-8")
        title_m = re.search(r"<title>(.*?)</title>", html_sp, re.S)
        title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else ""
        print(f"[SP  ] {title} (charset={enc_sp}, len={len(html_sp)})")
        report["sp"]["title"] = title
        report["sp"]["found"] = {k: bool(snip(html_sp, k)) for k in PRIZE_KEYS}
        report["sp"]["amounts"] = scan_amounts(html_sp)[:30]
        report["sp"]["tables"] = table_heads_and_rows(html_sp)
        for k in ("本賞金", "付加賞", "1着賞金", "2着賞金", "3着賞金", "4着賞金", "5着賞金"):
            s = snip(html_sp, k)
            if s:
                print(f"  [SP {k}] …{s}…")
    except Exception as e:  # noqa: BLE001
        print(f"[SP  ] ❌ {e}")
        report["sp"]["error"] = str(e)
        report["sp"]["found"] = {}

    # ── 现接口 db.netkeiba.com ──
    try:
        html_db, enc_db = fetch_text(RACE_DB_URL.format(id=race_id), "euc-jp")
        title_m = re.search(r"<title>(.*?)</title>", html_db, re.S)
        title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else ""
        print(f"[DB  ] {title} (charset={enc_db}, len={len(html_db)})")
        report["db"]["title"] = title
        report["db"]["found"] = {k: bool(snip(html_db, k)) for k in PRIZE_KEYS}
        report["db"]["amounts"] = scan_amounts(html_db)[:30]
        report["db"]["tables"] = table_heads_and_rows(html_db)
        for k in ("本賞金", "付加賞", "1着賞金", "2着賞金", "3着賞金", "4着賞金", "5着賞金"):
            s = snip(html_db, k)
            if s:
                print(f"  [DB {k}] …{s}…")
    except Exception as e:  # noqa: BLE001
        print(f"[DB  ] ❌ {e}")
        report["db"]["error"] = str(e)
        report["db"]["found"] = {}

    time.sleep(sleep)
    return report


def main():
    ap = argparse.ArgumentParser(description="对比 race.netkeiba.com 与 db.netkeiba.com 比赛页（能否取代 #5）")
    ap.add_argument("race_ids", nargs="*", help="指定 race_id；不填则从 netkeiba_races.json 随机抽 10")
    ap.add_argument("--count", type=int, default=10, help="随机抽样数量（默认 10）")
    ap.add_argument("--sleep", type=float, default=2.0, help="请求间隔秒数")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="报告输出路径")
    ap.add_argument("--seed", type=int, default=20260818, help="随机种子（默认固定，可复现）")
    args = ap.parse_args()

    if args.race_ids:
        ids = args.race_ids
    else:
        if not RACES_DB.exists():
            sys.exit(f"❌ 无 {RACES_DB}，无法随机取样（请先跑 netkeiba_races 适配器，或直接指定 race_id）")
        db = json.loads(RACES_DB.read_text(encoding="utf-8"))
        distinct = sorted({str(r.get("race_id")) for recs in db.values() for r in recs if r.get("race_id")})
        if len(distinct) < args.count:
            print(f"⚠ 只有 {len(distinct)} 个 race_id，全部测试")
        random.seed(args.seed)
        ids = random.sample(distinct, min(args.count, len(distinct)))
        print(f"✔ 随机抽取 {len(ids)} 场（seed={args.seed}）: {', '.join(ids)}")

    reports = [probe_one(rid, args.sleep) for rid in ids]

    # ── 汇总判断 ──
    print("\n\n===== 汇总 =====")
    sp_has, db_has = 0, 0
    for rp in reports:
        s = rp["sp"].get("found", {})
        d = rp["db"].get("found", {})
        row = f"{rp['race_id']}  SP本賞金={'✓' if s.get('本賞金') else '✗'} 付加賞={'✓' if s.get('付加賞') else '✗'}  |  DB本賞金={'✓' if d.get('本賞金') else '✗'} 付加賞={'✓' if d.get('付加賞') else '✗'}"
        print(row)
        if s.get("本賞金"):
            sp_has += 1
        if d.get("本賞金"):
            db_has += 1
    print(f"✔ SP 接口含「本賞金」字样: {sp_has}/{len(reports)} · DB 接口含: {db_has}/{len(reports)}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(reports, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 详细报告已写: {out}")


if __name__ == "__main__":
    main()
