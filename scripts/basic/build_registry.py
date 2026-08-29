#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""建档脚本：从 JBIS 産駒一覧 拉取コントレイル子嗣 → 写入 basic.json。

业务规则：
  - 唯一性 = (母名, 生年)：同一母马同年只建一档。母名清洗掉产地括注（如 (GER)/(USA)）。
  - 年份走数组 YEARS，自由添加（当前 ["2023","2024"]；2025/2026 未出赛，可后续补）。
  - 每个年份约 2 次请求（items=100，分页翻到底）。
  - 已存在（同 jbis_id 或 同 (母名,生年)）则跳过 —— 兼容手动在 basic.json 加好的马。
  - 建档后分配自增业务主键 id（从 1 开始），后续所有关联（血统/studbook/netkeiba）都用 id 关联。

提取字段：jbis_id, 生年, 馬名, 母名 → basic.json。

用法:
    python build_registry.py [--year 2023,2024] [--dry-run]
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

# 标准字段模板（建档即初始化，默认 ""）：后续各并发脚本按 id 回填。
BASIC_TEMPLATE = {
    "id": None,
    "nk_id": "",
    "jbis_id": "",
    "馬名": "",
    "欧字馬名": "",
    "香港馬名": "",
    "自译馬名": "",
    "母名": "",
    "生年": "",
    "馬名意味": "",
    "登録状態": "",
    "性別": "",
    "毛色": "",
    "生年月日": "",
    "産地": "",
    "馬主": "",
    "調教師": "",
    "生産牧場": "",
    "通算成績": "",
    "獲得賞金": "",
    "セリ取引価格": "",
    "photo": "",
    "races_file": "",
    "pedigree_file": "",
}


def clean_mare(name):
    """母名归一化：去产地括注 + 罗马数字统一拉丁（Ⅱ→II）。
    例：アレイヴィングビューティ(GER) → アレイヴィングビューティ
        コンヴィクションⅡ → コンヴィクションII
    保证 netkeiba(拉丁) / JBIS(全角) 两侧一致，供 (母名,生年) 唯一性匹配。"""
    s = re.sub(r"[（(][A-Za-z]+[）)]", "", name or "").strip()
    for k, v in ROMAN_FULL.items():
        s = s.replace(k, v)
    return s


def is_unnamed(name):
    """未命名占位判定：如 ＿＿＿＿＿＿＿＿＿（全角下划线）。返回 True 表示无意义，应存空 "". """
    s = (name or "").replace("＿", "").replace("_", "").strip()
    return s == ""


def parse_progeny_page(soup):
    """解析一页産駒 → {jbis_id: (馬名, 生年, 母名清洗后)}。跳过表头。"""
    container = soup.select_one(".data-6-4")
    if not container:
        return {}
    out = {}
    for div in container.find_all("div", recursive=False):
        a = div.select_one('a[href^="/horse/"]')
        if not a:
            continue
        m = re.search(r"/horse/(\d{10})/", a["href"])
        if not m:
            continue
        jid = m.group(1)
        name = (div.select_one("b") or a).get_text(" ", strip=True)
        d2 = div.find_all("div", recursive=False)
        year = d2[1].get_text(strip=True) if len(d2) > 1 else ""
        mare_a = d2[3].select_one("a") if len(d2) > 3 else None
        mare_raw = mare_a.get_text(" ", strip=True) if mare_a else ""
        out[jid] = (name, year, clean_mare(mare_raw))
    return out


def fetch_progeny(year, sleep=0.5):
    """抓取某年全部産駒 → {jbis_id: (馬名, 生年, 母名)}。"""
    all_recs = {}
    page = 1
    while True:
        url = (common.JBIS_PROGENY_URL.format(sid=common.JBIS_SIRE_ID, year=year)
               .replace("#", "") + f"&page={page}")
        soup = common.soup_of(url)
        page_recs = parse_progeny_page(soup)
        all_recs.update(page_recs)
        pages = [a.get_text(strip=True) for a in soup.select(".paging-1 a")]
        has_more = str(page + 1) in pages
        print(f"  {year} page {page}: +{len(page_recs)} (累计 {len(all_recs)})")
        if not has_more or not page_recs:
            break
        page += 1
        time.sleep(common.sleep_for(url))   # 按域名限速
    return all_recs


def build(years, dry_run=False):
    data = common.load_basic()
    horses = data["horses"]

    # 已存在索引：jbis_id 集合 + (母名,生年) 集合
    exist_jid = {h.get("jbis_id") for h in horses if h.get("jbis_id")}
    exist_key = {(h.get("母名", ""), h.get("生年", "")) for h in horses}

    added = 0
    for year in years:
        print(f"=== {year}年 建档 ===")
        recs = fetch_progeny(year)
        for jid, (name, yr, mare) in recs.items():
            if jid in exist_jid:
                continue
            key = (mare, yr)
            if key in exist_key:
                print(f"  ↺ 已存在(母+年): {mare} {yr} -> jbis_id {jid} 跳过")
                continue
            hid = dict(BASIC_TEMPLATE)   # 先按标准模板初始化全部字段（默认 ""）
            hid["id"] = common.next_id(data)
            hid["jbis_id"] = jid
            hid["生年"] = yr
            hid["馬名"] = "" if is_unnamed(name) else name   # 未命名占位 → 空
            hid["母名"] = mare
            horses.append(hid)
            exist_jid.add(jid)
            exist_key.add(key)
            added += 1
        print(f"  ✔ {year}年 新增 {added} 匹（本脚本累计 {added}）")

    print(f"\n✔ 建档完成：新增 {added} 匹，现有总数 {len(horses)}")
    if dry_run:
        print("(dry-run，未写入)")
        return
    common.save_basic(data)
    print(f"✔ 已写入 {common.BASIC_JSON}")


def main():
    ap = argparse.ArgumentParser(description="JBIS 建档 → basic.json")
    ap.add_argument("--year", default=",".join(YEARS_DEFAULT),
                    help="年份数组，逗号分隔，如 2023,2024")
    ap.add_argument("--dry-run", action="store_true", help="只打印不写入")
    args = ap.parse_args()
    years = [y.strip() for y in args.year.split(",") if y.strip()]
    build(years, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
