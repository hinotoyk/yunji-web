#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""详情更新 + 通算成績判变（竞赛流水线第 1 环）。

对 basic.json 里**全部有 nk_id 的马**抓 netkeiba 马详情页
（db.netkeiba.com/horse/{nk_id}/，EUC-JP），解析后写独立缓存：
  - _tmp/detail.json     {id: {登録状態, 性別, 毛色, 馬齢, 生年月日, 産地,
                                馬主, 調教師, 生産牧場, 通算成績, 獲得賞金,
                                欧字馬名, セリ取引価格}}
  - _tmp/changed.json    {id: {"旧": 旧通算成績, "新": 新通算成績}}  只含「通算成績有变化」的马
  - _tmp/failures.json   {id: 错误信息}（各环共用，合并时写报告）

判变规则（必须准确）：
  通算成績 新旧两侧都做「空白折叠」后再精确比较（等长全等），
  只要战数/胜数/内栏任一不同即视为变化 → 下一环（成绩增量）只处理这些马。

用法:
    python fetch_detail.py [--limit N] [--id 1,2,3]
"""
import argparse
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402

# 会变化的字段：无论变没变都覆盖更新
VOLATILE_FIELDS = ["登録状態", "性別", "馬齢", "馬主", "調教師", "通算成績", "獲得賞金"]
# 稳定字段：只在抓取值非空时覆盖（避免抓取异常把已有值清空）
STABLE_FIELDS = ["毛色", "生年月日", "産地", "生産牧場", "欧字馬名", "セリ取引価格"]

DETAIL_FIELDS = VOLATILE_FIELDS + STABLE_FIELDS


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


def fold_ws(s):
    """判变比较用归一：去掉全部空白。两侧都先去空白再精确比较——
    只比「真实内容」（战数/胜数/内栏数字），空白差异一律不参与判变，杜绝误判。"""
    return re.sub(r"\s+", "", s or "")


def main():
    ap = argparse.ArgumentParser(description="详情更新 + 通算成績判变")
    ap.add_argument("--limit", type=int, default=0, help="调试：只处理前 n 匹")
    ap.add_argument("--id", help="调试：逗号分隔的指定 id")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]

    if args.id:
        want = {int(x) for x in args.id.split(",") if x.strip()}
        todo = [h for h in horses if h["id"] in want and h.get("nk_id")]
    else:
        todo = [h for h in horses if h.get("nk_id")]
    no_nk = [h for h in horses if not h.get("nk_id")]
    if args.limit:
        todo = todo[:args.limit]

    print(f"✔ 需抓详情 {len(todo)} 匹（无 nk_id 跳过 {len(no_nk)} 匹）")
    detail = {}
    changed = {}
    failures = common.read_cache("failures") or {}
    for i, h in enumerate(todo, 1):
        nk = h["nk_id"]
        url = common.NK_HORSE_URL.format(nk_id=nk)
        try:
            d = parse_detail(common.fetch(url, encoding="euc-jp"))
            detail[str(h["id"])] = d
            # 通算成績判变：两侧空白折叠后精确比较（必须准确）
            old, new = fold_ws(h.get("通算成績")), fold_ws(d["通算成績"])
            if old != new:
                changed[str(h["id"])] = {"旧": h.get("通算成績") or "", "新": d["通算成績"]}
                print(f"  [{i}/{len(todo)}] {h['id']} {h.get('馬名','')} ⚡通算成績变化: "
                      f"{old or '(空)'} → {new or '(空)'}")
            else:
                print(f"  [{i}/{len(todo)}] {h['id']} {h.get('馬名','')} 详情OK {d['通算成績']}")
        except Exception as e:
            failures[str(h["id"])] = f"detail: {e}"
            print(f"  [{i}/{len(todo)}] ❌ {h['id']} {h.get('馬名','')}: {e}")
        time.sleep(common.sleep_for(url))

    common.write_cache("detail", detail)
    common.write_cache("changed", changed)
    common.write_cache("failures", failures)
    print(f"✔ 详情缓存 {len(detail)} 匹 · 通算成績变化 {len(changed)} 匹")


if __name__ == "__main__":
    main()
