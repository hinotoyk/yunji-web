#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""并发1：血统信息。按 id 抓 JBIS 血統页 → data/pedigree/{id}.json，回写 basic.json 的 pedigree_file。

血统文件内容：{ "id": int, "jbis_id": str, "馬名": str, "pedigree": {父:[..], 母:[..]}, "fno": str, "cross": str }

增量：basic.json 已有 pedigree_file 且文件存在 → 跳过。--force 强制重抓。

用法:
    python fetch_pedigree.py [--sleep 1.2] [--force] [--limit N] [--id 1,2,3]
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

COLORS = common.COLORS


def parse_pedigree(html):
    """JBIS 5代血統表 → {pedigree, fno, cross}。"""
    soup = common.BeautifulSoup(html, "lxml")
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
            node = {"name": a.get_text(" ", strip=True), "sex": "牡" if male else "牝"}
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
    ap = argparse.ArgumentParser(description="JBIS 血統抓取 → data/pedigree/{id}.json + 缓存引用")
    ap.add_argument("--sleep", type=float, default=1.2)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--id", help="逗号分隔的指定 id（默认全部未抓的）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]

    if args.id:
        want = {int(x) for x in args.id.split(",") if x.strip()}
        todo = [h for h in horses if h["id"] in want]
    else:
        # 处理全部有 jbis_id 的马；已有血统文件则直接复用引用（不重复请求）
        todo = [h for h in horses if h.get("jbis_id")]
    if args.limit:
        todo = todo[:args.limit]

    print(f"✔ 需处理血统 {len(todo)} 匹（已有文件则直接复用引用）")
    common.PEDIGREE_DIR.mkdir(parents=True, exist_ok=True)
    cache = {}                       # {id: pedigree_file}
    ok = 0
    fetched = 0
    for i, h in enumerate(todo, 1):
        try:
            fname = f"{h['id']}.json"
            fpath = common.PEDIGREE_DIR / fname
            if not fpath.exists() or args.force:
                html = common.fetch(common.JBIS_PEDIGREE_URL.format(jbis_id=h["jbis_id"]))
                ped = parse_pedigree(html)
                fpath.write_text(
                    json.dumps({"id": h["id"], "jbis_id": h["jbis_id"], "馬名": h.get("馬名", ""),
                                **ped}, ensure_ascii=False, indent=1), encoding="utf-8")
                fetched += 1
                time.sleep(common.sleep_for(common.JBIS_PEDIGREE_URL.format(jbis_id=h["jbis_id"])))   # 按域名限速
            cache[str(h["id"])] = f"data/pedigree/{fname}"
            ok += 1
            print(f"  [{i}/{len(todo)}] {h['id']} {h.get('馬名','')} 血統OK")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {h['id']} {h.get('馬名','')}: {e}")

    common.write_cache("pedigree", cache)     # 写独立缓存，不碰 basic.json
    print(f"✔ 完成：{ok}/{len(todo)} 匹引用，真实请求 {fetched} 匹，已写缓存 _tmp/pedigree.json")


if __name__ == "__main__":
    main()
