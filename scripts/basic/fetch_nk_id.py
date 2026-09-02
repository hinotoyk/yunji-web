#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""并发2：netkeiba 列表 → nk_id 回写 basic.json。

业务：
  - 列表 URL 不能指定生年 → 翻遍全部分页，只收集 生年在 YEARS 数组 的马。
  - 匹配键 = (母名归一化, 生年)：netkeiba 与 JBIS 建档共享 (母名,生年) 唯一性。
    归一化：去 [..] 括注/空白/全半角、全角罗马数字(Ⅱ/Ⅲ) → 拉丁(II/III)，兼容两站写法差异。
  - 匹配到 → 回写 nk_id（按 id）。未匹配 → 记入报告，nk_id 留空（后续可补）。
  - 增量：已有 nk_id 且文件存在可不重查（--force 强制）。

用法:
    python fetch_nk_id.py [--year 2023,2024] [--sleep 0.6] [--force]
"""
import argparse
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

YEARS_DEFAULT = ["2023", "2024"]
ROMAN_FULL = {"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V",
              "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X"}


def norm_mare(s):
    """母名归一化：去 [..]/空白，全角罗马→拉丁，半角→统一。"""
    s = re.sub(r"\[.*?\]", "", s or "")
    s = s.replace(" ", "").replace("　", "")
    for k, v in ROMAN_FULL.items():
        s = s.replace(k, v)
    return s


def clean_mare_display(s):
    """展示用母名：去 [..] 括注与空白，保留原始罗马写法。"""
    return re.sub(r"\[.*?\]", "", s or "").replace(" ", "").replace("　", "")


def fmt_man(man):
    """万円金额 → 展示串：'269万円'；≥1億(10000万) → '1億1615.8万円'；0/空 → 0（数字）。"""
    if man in (None, ""):
        return 0
    try:
        v = float(str(man).replace(",", ""))
    except (ValueError, TypeError):
        return man
    if v == 0:
        return 0
    if v >= 10000:
        yi = int(v // 10000)
        rest = v - yi * 10000
        if abs(rest) < 1e-9:
            return f"{yi}億円"
        rest = int(rest) if abs(rest - round(rest)) < 1e-9 else round(rest, 1)
        return f"{yi}億{rest}万円"
    iv = int(v) if abs(v - round(v)) < 1e-9 else v
    return f"{iv}万円"


def norm_total(v):
    """列表页 総賞金(万円) 原始值（如 '269.0'）→ 格式化串（'269万円'/'1億1615.8万円'；空 → 0）。"""
    v = (v or "").strip().replace(",", "")
    if v in ("", "-", "--"):
        return 0
    try:
        return fmt_man(float(v))
    except (ValueError, TypeError):
        return v


def parse_row(tr):
    tds = tr.find_all("td")
    if len(tds) < 12:
        return None
    a = tds[1].select_one('a[href*="/horse/"]')
    if not a:
        return None
    m = re.search(r"/horse/(\d+)/", a["href"])
    if not m:
        return None
    return {"nk_id": m.group(1),
            "馬名": a.get_text(" ", strip=True),
            "生年": tds[3].get_text(" ", strip=True),
            "母名": clean_mare_display(tds[7].get_text(" ", strip=True)),
            "総賞金": norm_total(tds[11].get_text(" ", strip=True))}


def fetch_list_all(years, sleep=0.6):
    """翻遍全部页 → {nk_id: row}，只保留 生年∈years。"""
    years = set(years)
    allr = {}
    page = 1
    while True:
        url = common.NK_LIST_URL.format(sid=common.NK_SIRE_ID, page=page)
        soup = common.soup_of(url, encoding="euc-jp")
        tbl = soup.select_one("table.horse_list_table")
        got = 0
        if tbl:
            for tr in tbl.find_all("tr")[1:]:
                r = parse_row(tr)
                if r and r["生年"] in years:
                    allr[r["nk_id"]] = r
                    got += 1
        pg = soup.select_one("div.pager")
        m = re.search(r"(\d+)件中", pg.get_text(" ", strip=True)) if pg else None
        total = int(m.group(1)) if m else 0
        print(f"  page {page}: 收集到 {got}（累计 {len(allr)}）")
        if got == 0 or len(allr) >= total:
            break
        page += 1
        time.sleep(common.sleep_for(url))   # 按域名限速
    return allr


def main():
    ap = argparse.ArgumentParser(description="netkeiba 列表 → nk_id 回写 basic.json")
    ap.add_argument("--year", default=",".join(YEARS_DEFAULT), help="生年数组")
    ap.add_argument("--sleep", type=float, default=0.6)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    years = [y.strip() for y in args.year.split(",") if y.strip()]

    data = common.load_basic()
    horses = data["horses"]
    by_key = {(norm_mare(h.get("母名", "")), h.get("生年", "")): h for h in horses}

    print("=== netkeiba 列表抓取（翻页）===")
    nk_rows = fetch_list_all(years, args.sleep)
    print(f"✔ 生年{years} 的马 {len(nk_rows)} 匹")

    matched, miss, cache, total = 0, [], {}, {}
    for nk, r in nk_rows.items():
        key = (norm_mare(r["母名"]), r["生年"])
        h = by_key.get(key)
        if h:
            cache[str(h["id"])] = nk       # 写独立缓存，不碰 basic.json
            total[str(h["id"])] = r["総賞金"]   # 总赏金（列表页 総賞金(万円)，0 也写入）
            matched += 1
        else:
            miss.append((nk, r["馬名"], r["母名"], r["生年"]))

    common.write_cache("nk_id", cache)
    common.write_cache("总赏金", total)
    print(f"✔ 匹配回写 nk_id：{matched}/{len(nk_rows)}（缓存 _tmp/nk_id.json）")
    print(f"✔ 总赏金 総賞金(万円)：{len(total)} 匹（缓存 _tmp/总赏金.json）")
    if miss:
        print(f"⚠ 未匹配 {len(miss)} 匹（nk_id 未写入，可后续补）：")
        for nk, name, mare, yr in miss[:20]:
            print(f"    {nk} {name} | 母:{mare} {yr}年")
        # 报告
        rep = common.DATA_DIR / "nk_id_report.md"
        rep.write_text("\n".join(
            ["# nk_id 匹配报告", "",
             f"- 匹配 {matched}/{len(nk_rows)}", f"- 未匹配 {len(miss)}", "",
             "| nk_id | 馬名 | 母名 | 生年 |",
             "|---|---|---|---|"] +
            [f"| {nk} | {name} | {mare} | {yr} |" for nk, name, mare, yr in miss]
        ), encoding="utf-8")
        print(f"  详见 {rep}")


if __name__ == "__main__":
    main()
