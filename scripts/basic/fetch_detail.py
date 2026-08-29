#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""阶段四：netkeiba 马详情页 → 字段写回 basic.json。

前置：nk_id 已回写（见 fetch_nk_id.py）。
抓取 db.netkeiba.com/horse/{nk_id}/，解析后写回：
  登録状態, 性別, 毛色, 馬齢, 生年月日, 産地, 馬主, 調教師, 生産牧場,
  通算成績, 獲得賞金, 英文名, セリ取引価格

增量：已有关键字段（通算成績/生年月日）且非空 → 跳过（--force 强制）。

用法:
    python fetch_detail.py [--sleep 1.2] [--force] [--limit N] [--id 1,2,3]
"""
import argparse
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

DETAIL_FIELDS = ["登録状態", "性別", "毛色", "馬齢", "生年月日", "産地", "馬主",
                 "調教師", "生産牧場", "通算成績", "獲得賞金", "欧字馬名", "セリ取引価格"]


def parse_txt01(txt):
    sex_m = re.search(r"(牡|牝|セン)", txt)
    status_m = re.search(r"(現役|抹消|引退|繁殖|功労馬|登録)", txt)
    age_m = re.search(r"(\d+)歳", txt)
    color = next((c for c in common.COLORS if c in txt), "")
    return {
        "登録状態": status_m.group(1) if status_m else "",
        "性別": sex_m.group(1) if sex_m else "",
        "毛色": color,
        "馬齢": age_m.group(1) + "歳" if age_m else "",
    }


def parse_detail(html):
    soup = common.BeautifulSoup(html, "lxml")
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
    eng = soup.select_one("p.eng_name")
    return {
        "登録状態": t.get("登録状態", ""),
        "性別": t.get("性別", ""),
        "毛色": t.get("毛色", ""),
        "馬齢": t.get("馬齢", ""),
        "生年月日": prof.get("生年月日", ""),
        "産地": prof.get("産地", ""),
        "馬主": prof.get("馬主", ""),
        "調教師": prof.get("調教師", ""),
        "生産牧場": prof.get("生産者", ""),
        "通算成績": prof.get("通算成績", ""),
        "獲得賞金": prof.get("獲得賞金 (中央)", prof.get("獲得賞金(中央)", "")),
        "欧字馬名": eng.get_text(" ", strip=True) if eng else "",
        "セリ取引価格": prof.get("セリ取引価格", ""),
    }


def main():
    ap = argparse.ArgumentParser(description="netkeiba 详情 → basic.json")
    ap.add_argument("--sleep", type=float, default=1.2)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--id", help="逗号分隔的指定 id")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    # nk_id 来源：优先 nk_id 缓存（未 merge 前 basic.json 里还是空），否则回退 basic.json
    nk_cache = common.read_cache("nk_id")      # {id: nk_id}
    def nk_of(h):
        return nk_cache.get(str(h["id"])) or h.get("nk_id") or ""

    def already(h):
        return h.get("通算成績") or h.get("生年月日")

    if args.id:
        want = {int(x) for x in args.id.split(",") if x.strip()}
        todo = [h for h in horses if h["id"] in want]
    else:
        todo = [h for h in horses if nk_of(h) and (args.force or not already(h))]
    if args.limit:
        todo = todo[:args.limit]

    print(f"✔ 需抓详情 {len(todo)} 匹")
    ok = 0
    cache = {}                       # {id: {详情字段}} 写独立缓存，不碰 basic.json
    for i, h in enumerate(todo, 1):
        try:
            html = common.fetch(common.NK_HORSE_URL.format(nk_id=nk_of(h)), encoding="euc-jp")
            d = parse_detail(html)
            cache[str(h["id"])] = d
            ok += 1
            print(f"  [{i}/{len(todo)}] {h['id']} {h.get('馬名','')} 详情OK "
                  f"{d['登録状態']} {d['生年月日']} {d['通算成績']}")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {h['id']} {h.get('馬名','')}: {e}")
        time.sleep(common.sleep_for(common.NK_HORSE_URL.format(nk_id=nk_of(h))))   # 按域名限速

    common.write_cache("detail", cache)
    print(f"✔ 完成：{ok}/{len(todo)} 匹，已写缓存 _tmp/detail.json")


if __name__ == "__main__":
    main()
