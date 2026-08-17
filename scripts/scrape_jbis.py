#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""JBIS 兜底抓取：netkeiba 无记录的コントレイル子嗣 → 基础信息 + 5代血统。
用法:
    python scripts/scrape_jbis.py --all          # 全量：産駒一覧 → 找出 netkeiba 无记录的马 → 详情+血统
    python scripts/scrape_jbis.py --horse アオイハルカ  # 单匹：按马名搜索 → 详情+血统
选项: --output <json> --sleep <秒> --force
"""
import argparse
import io
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE = "https://www.jbis.or.jp"
SIRE_ID = "0001237042"                              # コントレイル jbis id
PROGENY_URL = (BASE + "/horse/{sid}/sire/progeny/?year={year}&belong=0&sort=name&items=100&page={page}&order=A")
SEARCH_URL = BASE + "/horse/result/?keyword={kw}&match=exact&sort=name"
HORSE_URL = BASE + "/horse/{id}/"
PEDIGREE_URL = BASE + "/horse/{id}/pedigree/"
YEARS = ["0000", "2023", "2024", "2025", "2026"]    # 現役 + 各生年
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "jbis.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")

def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.encoding = "utf-8"
            r.raise_for_status()
            return r.text
        except requests.exceptions.HTTPError as e:
            if "403" in str(e) and attempt < retries - 1:
                time.sleep(20 + attempt * 15)
                continue
            raise
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2)

def soup_of(url):
    return BeautifulSoup(fetch(url), "lxml")

def norm(name):
    return re.sub(r"[ 　()（）\[\]【】]", "", name or "").strip()

def parse_progeny_rows(html):
    soup = BeautifulSoup(html, "lxml")
    out = {}
    for div in soup.select(".data-6-4 > div"):
        a = div.select_one('a[href^="/horse/"]')
        if not a or not a.get("href", "").startswith("/horse/") or a["href"] == "/horse/":
            continue
        m = re.search(r"/horse/(\d{10})/", a["href"])
        if not m:
            continue
        name = (div.select_one("b") or a).get_text(" ", strip=True)
        year = div.select_one("div:nth-child(2)")
        year = year.get_text(strip=True) if year else ""
        out[name] = {"jbis_id": m.group(1), "生年": year}
    return out

def build_id_map(sleep=1.0):
    """按年扫 産駒一覧 → {馬名: {jbis_id, 生年}}"""
    mp = {}
    for year in YEARS:
        page = 1
        while True:
            soup = soup_of(PROGENY_URL.format(sid=SIRE_ID, year=year, page=page))
            rows = parse_progeny_rows(str(soup))
            if not rows:
                break
            mp.update(rows)
            last = max((int(a.get_text()) for a in soup.select(".paging-1.pc-only ol li a")), default=1)
            print(f"  {year} page {page}: +{len(rows)} (累计 {len(mp)})")
            if page >= last:
                break
            page += 1
            time.sleep(sleep)
    return mp

def search_candidates(name, sleep=1.0):
    """单匹马名精确搜索 → jbis_id 候选列表（前 5 个）"""
    soup = soup_of(SEARCH_URL.format(kw=quote(name)))
    out = []
    for a in soup.select('a[href^="/horse/"]'):
        m = re.search(r"/horse/(\d{10})/$", a["href"])
        if m and m.group(1) not in out:
            out.append(m.group(1))
        if len(out) >= 5:
            break
    return out

def is_contrail_progeny(ped):
    """校验血统树：父侧 G1 应为コントレイル（防同名異馬）"""
    try:
        sire = ped["pedigree"]["父"][0][0]
        return sire.get("name", "").startswith("コントレイル")
    except (KeyError, IndexError):
        return False

def parse_detail(html):
    """JBIS 马详情页 → 基础信息"""
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    name = h1.get_text(" ", strip=True) if h1 else ""
    prof = {}
    dl = soup.select_one("dl.data-4-1")
    if dl:
        for item in dl.select(".data-4__item, .data-4__item-2, .data-4__item-4"):
            dt = item.find("dt")
            dd = item.find("dd")
            if dt and dd:
                prof[dt.get_text(strip=True)] = dd.get_text(" ", strip=True)
    def g(*keys):
        for k in keys:
            if k in prof:
                return prof[k]
        return ""
    prize = g("総賞金")
    if prize.endswith("万円"):
        prize = prize[:-2]
    return {
        "馬名": name,
        "登録状態": g("登録"),
        "性別": g("性別"),
        "生年月日": g("生年月日"),
        "毛色": g("毛色"),
        "産地": g("産地"),
        "馬主": g("馬主"),
        "生産牧場": g("生産牧場"),
        "調教師": g("調教師"),
        "通算成績": g("戦績"),
        "総賞金": prize,
    }

def parse_pedigree(html):
    """JBIS 5代血統表 → {pedigree, fno, cross}。
    每侧列 BFS 层序 1+2+4+8+16=31 项 → 扁平行结构 [[G1],[G2],[G3],[G4],[G5]]。"""
    soup = BeautifulSoup(html, "lxml")
    container = soup.select_one(".data-3-1") or soup
    blocks = container.select(".data-3__items")
    levels = [1, 2, 4, 8, 16]

    def parse_block(block):
        items = []
        for item in block.find_all(recursive=False):
            if not item.select_one(".txt-link"):
                continue
            male = "female" not in " ".join(item.get("class", []))
            a = item.select_one(".txt-link")
            node = {
                "name": a.get_text(" ", strip=True),
                "sex": "牡" if male else "牝",
            }
            m = re.search(r"/horse/(\d{10})/", a.get("href", ""))
            if m:
                node["id"] = m.group(1)
            meta = item.get_text(" ", strip=True)
            y = re.search(r"(\d{4})", meta)
            if y:
                node["year"] = y.group(1)
            col = next((c for c in COLORS if c in meta), None)
            if col:
                node["color"] = col
            items.append(node)
        rows = []
        cur = 0
        for n in levels:
            rows.append(items[cur:cur + n])
            cur += n
            if cur >= len(items):
                break
        return [r for r in rows if r]

    sides = {}
    names = ["父", "母"]
    for i, b in enumerate(blocks[:2]):
        rows = parse_block(b)
        if rows:
            sides[names[i]] = rows
    if len(sides) == 1 and "父" in sides:
        sides["母"] = []
    pedigree = {"父": sides.get("父", []), "母": sides.get("母", [])}

    fno = cross = ""
    for item in soup.select("dl.data-4-2 .data-4__item, dl.data-4-2 .data-4__item-2"):
        dt = item.find("dt")
        dd = item.find("dd")
        if not dt or not dd:
            continue
        k = dt.get_text(strip=True)
        v = dd.get_text(" ", strip=True)
        if "ファミリー" in k:
            fno = v
        elif "クロス" in k:
            cross = v
    return {"pedigree": pedigree, "fno": fno, "cross": cross}

def main():
    ap = argparse.ArgumentParser(description="JBIS 兜底抓取（netkeiba 无记录的马）")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="全量：産駒一覧 → netkeiba 无记录的马 → 详情+血统")
    g.add_argument("--horse", help="马名（单匹）")
    ap.add_argument("--output", default=str(DEFAULT_OUT))
    ap.add_argument("--sleep", type=float, default=1.2)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    merged = {}
    if out.exists():
        for h in json.loads(out.read_text(encoding="utf-8")):
            merged[h["馬名"]] = h

    if args.horse:
        cands = search_candidates(args.horse, args.sleep)
        targets = {}
        for jid in cands:
            try:
                ped = parse_pedigree(fetch(PEDIGREE_URL.format(id=jid)))
            except Exception:
                continue
            if is_contrail_progeny(ped):
                targets[args.horse] = {"jbis_id": jid, "生年": ""}
                break
        if not targets:
            sys.exit(f"❌ JBIS 未找到コントレイル産駒: {args.horse}")
        print(f"✔ 映射 {args.horse} -> {targets[args.horse]['jbis_id']}")
    else:
        mp = build_id_map(args.sleep)
        print(f"✔ 産駒一覧 {len(mp)} 匹")
        nk_path = out.parent / "netkeiba.json"
        nk_names = {norm(h.get("馬名", "")) for h in json.loads(nk_path.read_text(encoding="utf-8"))}
        targets = {}
        for name, t in mp.items():
            if "＿" in name:                     # 未命名仔跳过
                continue
            if norm(name) in nk_names:           # netkeiba 已有 → 无需兜底
                continue
            targets[name] = t
        print(f"✔ netkeiba 无记录 → 兜底目标 {len(targets)} 匹")

    todo = [(n, t) for n, t in targets.items() if args.force or n not in merged]
    if not todo:
        print("✔ 无待更新（--force 强制）")
    for i, (name, t) in enumerate(todo, 1):
        try:
            html = fetch(HORSE_URL.format(id=t["jbis_id"]))
            detail = parse_detail(html)
            ped = parse_pedigree(fetch(PEDIGREE_URL.format(id=t["jbis_id"])))
            if not is_contrail_progeny(ped):
                print(f"  [{i}/{len(todo)}] ⚠ {name}: 父非コントレイル，跳过")
                continue
            merged[name] = {
                "馬名": detail.get("馬名") or name,
                "jbis_id": t["jbis_id"],
                "生年": t.get("生年", ""),
                **{k: v for k, v in detail.items() if k != "馬名"},
                **ped,
            }
            n_cells = sum(len(r) for r in (ped["pedigree"].get("父", []) + ped["pedigree"].get("母", [])))
            print(f"  [{i}/{len(todo)}] {name} ({t['jbis_id']}) 详情OK ped={n_cells}格 fno={ped['fno'] or '-'}")
        except requests.exceptions.HTTPError as e:
            if "403" in str(e):
                print(f"  [{i}/{len(todo)}] ⚠ {name}: 限流跳过，稍后重试")
                time.sleep(10)
            else:
                print(f"  [{i}/{len(todo)}] ❌ {name}: {e}")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {name}: {e}")
        time.sleep(args.sleep)

    records = sorted(merged.values(), key=lambda h: (h.get("生年", ""), h.get("馬名", "")), reverse=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ {out} 共 {len(records)} 匹")

if __name__ == "__main__":
    main()
