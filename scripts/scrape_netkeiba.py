#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""netkeiba 主数据源抓取：コントレイル全部子嗣 + 每匹基础信息 + 5代血统。
用法:
    python scripts/scrape_netkeiba.py --all          # 全量更新（列表 + 每匹详情 + 血统）
    python scripts/scrape_netkeiba.py --ped          # 只补血统（读现有 netkeiba.json 的 nk_id）
    python scripts/scrape_netkeiba.py --horse 2024103491   # 单匹更新（netkeiba id）
    python scripts/scrape_netkeiba.py --name アオイハルカ   # 单匹更新（按马名）
选项: --output <json> --sleep <秒> --limit <n> --force
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

SIRE_ID = "2017101835"                      # コントレイル netkeiba id
LIST_URL = "https://db.netkeiba.com/horse/list.html?sire_id={sid}&range=all&page={page}"
HORSE_URL = "https://db.netkeiba.com/horse/{id}/"
PEDIGREE_URL = "https://db.netkeiba.com/horse/ped/{id}/"
COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "netkeiba.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.encoding = "euc-jp"
            r.raise_for_status()
            return r.text
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2)

def soup_of(url):
    return BeautifulSoup(fetch(url), "lxml")

def parse_txt01(txt):
    """'現役　牝3歳　青鹿毛' / '抹消　牡　青鹿毛' → {status, sex, color, age}"""
    sex_m = re.search(r"(牡|牝|セン)", txt)
    status_m = re.search(r"(現役|抹消|引退|繁殖|功労馬|登録)", txt)
    age_m = re.search(r"(\d+)歳", txt)
    colors = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")
    color = next((c for c in colors if c in txt), "")
    return {
        "status": status_m.group(1) if status_m else "",
        "sex": sex_m.group(1) if sex_m else "",
        "color": color,
        "age": age_m.group(1) + "歳" if age_m else "",
    }

def clean_cell(s):
    return re.sub(r"\[[^\]]*\]", "", s).strip()

def parse_detail(html, nk_id):
    soup = BeautifulSoup(html, "lxml")
    title = soup.select_one("p.txt_01")
    t = parse_txt01(title.get_text(" ", strip=True)) if title else {}
    prof = {}
    tbl = soup.select_one("table.db_prof_table")
    if tbl:
        for tr in tbl.find_all("tr"):
            th = tr.find("th")
            td = tr.find("td")
            if th and td:
                prof[th.get_text(strip=True)] = td.get_text(" ", strip=True)
    def g(*keys):
        for k in keys:
            if k in prof:
                return prof[k]
        return ""
    return {
        "nk_id": nk_id,
        "登録状態": t.get("status", ""),
        "性別": t.get("sex", ""),
        "毛色": t.get("color", ""),
        "馬齢": t.get("age", ""),
        "生年月日": g("生年月日"),
        "産地": g("産地"),
        "馬主": g("馬主"),
        "調教師": g("調教師"),
        "生産牧場": g("生産者"),
        "通算成績": g("通算成績"),
        "獲得賞金": g("獲得賞金 (中央)", "獲得賞金(中央)"),
        "主な勝鞍": g("主な勝鞍"),
        "_raw_title": title.get_text(" ", strip=True) if title else "",
    }

def parse_pedigree(html):
    """netkeiba 5代血統表 → {pedigree, fno}。
    netkeiba 血統表为 DFS 先序（父优先）对角级联表：rowspan = 子树占行数
    （根 16 → 每层减半 → 叶子 1），同一行内右邻为父系、下行为母系。
    解法：按文档序 DFS 重建二叉树（左=父系牡/右=母系牝）→ BFS 分层。
    输出同 JBIS 格式：{父:[[G1],[G2],[G3],[G4],[G5]], 母:[...]}，节点 {name,sex,year,color,id}。"""
    soup = BeautifulSoup(html, "lxml")
    table = soup.select_one("table.blood_table")
    fno = ""
    m = re.search(r"FNo\.?\s*\[?([0-9A-Za-z\-\.]+)", html)
    if m:
        v = m.group(1).strip("[]")
        fno = v if v.startswith("F") else "F" + v
    if not table:
        return {"pedigree": {"父": [], "母": []}, "fno": fno}

    # 文档序 cell 列表：(rowspan, node)
    cells = []
    for tr in table.find_all("tr", recursive=False):
        for td in tr.find_all("td", recursive=False):
            a = td.find("a", href=True)
            if not a:
                continue
            m = re.search(r"/horse/(\w+)/", a["href"])
            if not m:
                continue
            raw_name = a.get_text("\n", strip=True).splitlines()
            raw_name = [s.strip() for s in raw_name if s.strip()]
            name = raw_name[0] if len(raw_name) > 1 else " ".join(raw_name)
            text = td.get_text(" ", strip=True)
            ym = re.search(r"\b(19|20)\d{2}\b", text)
            node = {"name": name, "id": m.group(1)}
            if ym:
                node["year"] = ym.group(0)
            color = next((c for c in COLORS if c in text), "")
            if color:
                node["color"] = color
            cells.append((int(td.get("rowspan", "1") or 1), node))

    def dfs(part, idx, rows):
        """DFS 重建：先父系后母系，行数对半切"""
        rs, node = part[idx]
        idx += 1
        if rs > 1:
            idx, sire = dfs(part, idx, rows // 2)
            idx, dam = dfs(part, idx, rows // 2)
            node["_children"] = [sire, dam]
        return idx, node

    def mark_sex(node, sex):
        node["_sex"] = sex
        if "_children" in node:
            mark_sex(node["_children"][0], "牡")
            mark_sex(node["_children"][1], "牝")

    max_rs = max(c[0] for c in cells)
    cut = next(i for i, (rs, _) in enumerate(cells) if i > 0 and rs == max_rs)

    pedigree = {"父": [], "母": []}
    for label, part in (("父", cells[:cut]), ("母", cells[cut:])):
        if not part:
            pedigree[label] = []
            continue
        _, root = dfs(part, 0, part[0][0])
        mark_sex(root, "牡" if label == "父" else "牝")
        queue = [root]
        while queue:
            nxt = []
            row = []
            for node in queue:
                row.append({"name": node["name"], "sex": node["_sex"], "id": node["id"],
                            **({"year": node["year"]} if "year" in node else {}),
                            **({"color": node["color"]} if "color" in node else {})})
                if "_children" in node:
                    nxt.extend(node["_children"])
            pedigree[label].append(row)
            queue = nxt
    return {"pedigree": pedigree, "fno": fno}


def parse_list_row(tr):
    cells = tr.find_all("td")
    if len(cells) < 12:
        return None
    a = cells[1].select_one('a[href*="/horse/"]')
    if not a:
        return None
    m = re.search(r"/horse/(\d+)/", a["href"])
    if not m:
        return None
    return {
        "nk_id": m.group(1),
        "馬名": a.get_text(" ", strip=True),
        "性別": cells[2].get_text(" ", strip=True),
        "生年": cells[3].get_text(" ", strip=True),
        "調教師": clean_cell(cells[5].get_text(" ", strip=True)),
        "母名": clean_cell(cells[7].get_text(" ", strip=True)),
        "母父名": clean_cell(cells[8].get_text(" ", strip=True)),
        "馬主": clean_cell(cells[9].get_text(" ", strip=True)),
        "生産牧場": clean_cell(cells[10].get_text(" ", strip=True)),
        "総賞金": cells[11].get_text(" ", strip=True),
    }

def fetch_list_all(limit=None, sleep=1.0):
    """扫描全部分页 → 列表记录列表"""
    horses = {}
    page = 1
    while True:
        soup = soup_of(LIST_URL.format(sid=SIRE_ID, page=page))
        rows = [parse_list_row(tr) for tr in soup.select("table.horse_list_table tr")]
        rows = [r for r in rows if r]
        if not rows:
            break
        for r in rows:
            horses[r["nk_id"]] = r
        pager = soup.select_one("div.pager")
        m = re.search(r"(\d+)\s*件中", pager.get_text(" ", strip=True)) if pager else None
        total = int(m.group(1)) if m else 0
        print(f"  page {page}: {len(rows)} 匹 (累计 {len(horses)}/{total})")
        if limit and len(horses) >= limit:
            break
        if page * 20 >= total:
            break
        page += 1
        time.sleep(sleep)
    return horses

def resolve_by_name(name, sleep=1.0):
    """全列表扫描找马名 → nk_id"""
    name = name.strip()
    page = 1
    while True:
        soup = soup_of(LIST_URL.format(sid=SIRE_ID, page=page))
        for tr in soup.select("table.horse_list_table tr"):
            r = parse_list_row(tr)
            if r and r["馬名"] == name:
                return r
        pager = soup.select_one("div.pager")
        m = re.search(r"(\d+)\s*件中", pager.get_text(" ", strip=True)) if pager else None
        total = int(m.group(1)) if m else 0
        if page * 20 >= total:
            break
        page += 1
        time.sleep(sleep)
    return None

def main():
    ap = argparse.ArgumentParser(description="netkeiba 抓取")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="全量更新（列表+详情+血统）")
    g.add_argument("--ped", action="store_true", help="只补血统（读现有 netkeiba.json）")
    g.add_argument("--horse", help="netkeiba 马 id")
    g.add_argument("--name", help="马名")
    ap.add_argument("--output", default=str(DEFAULT_OUT))
    ap.add_argument("--sleep", type=float, default=1.0)
    ap.add_argument("--limit", type=int, help="调试：只抓前 n 匹")
    ap.add_argument("--force", action="store_true", help="重抓已存在马匹")
    args = ap.parse_args()

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    merged = {}
    if out.exists():
        merged = {h["nk_id"]: h for h in json.loads(out.read_text(encoding="utf-8"))}

    if args.ped:
        ids = [h["nk_id"] for h in merged.values()]
        if args.limit:
            ids = ids[:args.limit]
        list_hits = {}
        print(f"✔ 补血统模式：{len(ids)} 匹")
    elif args.horse:
        ids = [args.horse]
        list_hits = {}
    elif args.name:
        hit = resolve_by_name(args.name, args.sleep)
        if not hit:
            sys.exit(f"❌ 列表未找到马名: {args.name}")
        ids = [hit["nk_id"]]
        list_hits = {hit["nk_id"]: hit}
        print(f"✔ 找到 {hit['馬名']} ({hit['nk_id']})")
    else:
        list_hits = fetch_list_all(args.limit, args.sleep)
        ids = list(list_hits.keys())
        print(f"✔ 列表共 {len(ids)} 匹")

    todo = [i for i in ids if args.force or i not in merged or args.ped and not merged[i].get("pedigree")]
    if not todo:
        print("✔ 无待更新马匹（--force 强制）")
    for i, nk_id in enumerate(todo, 1):
        try:
            row = list_hits.get(nk_id, merged.get(nk_id, {}))
            if not args.ped:
                html = fetch(HORSE_URL.format(id=nk_id))
                merged[nk_id] = {**row, **parse_detail(html, nk_id)}
            else:
                merged[nk_id] = dict(row)
            ped = parse_pedigree(fetch(PEDIGREE_URL.format(id=nk_id)))
            merged[nk_id]["pedigree"] = ped["pedigree"]
            merged[nk_id]["fno"] = ped["fno"]
            n_cells = sum(len(r) for r in (ped["pedigree"].get("父", []) + ped["pedigree"].get("母", [])))
            print(f"  [{i}/{len(todo)}] {row.get('馬名', nk_id)} ped=OK({n_cells}格) fno={ped['fno'] or '-'}")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {nk_id}: {e}")
        time.sleep(args.sleep)

    records = sorted(merged.values(), key=lambda h: (h.get("生年", ""), h.get("馬名", "")), reverse=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ {out} 共 {len(records)} 匹")

if __name__ == "__main__":
    main()
