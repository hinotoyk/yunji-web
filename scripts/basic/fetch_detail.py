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
from core import text  # noqa: E402

DETAIL_FIELDS = ["登録状態", "性別", "毛色", "馬齢", "生年月日", "産地", "馬主",
                 "調教師", "生産牧場", "通算成績", "獲得賞金 (中央)", "獲得賞金 (地方)", "欧字馬名", "セリ取引価格"]

TRAINER_URL = "https://db.netkeiba.com/trainer/{tid}/"


def fetch_trainer_fullname(tid):
    """trainer_id → 调教师**全名**（<title>大久保龍志の調教師成績…</title>）。

    为什么需要这一步：详情页的『調教師』单元格用的是 netkeiba 的**显示名**，长名字被截短
    （实测 title 属性也是「大久保龍」），照抄入库就会在页面上显示残名（大久保龍 / 中内田充 /
    西田雄一 / 久保田貴 / 和田正一）。赛事记录那边一直是按 trainer_id 取全名的，两边因此对不上。
    失败返回 ""（调用方保留原短名，不猜）。"""
    try:
        html = common.fetch(TRAINER_URL.format(tid=tid))   # profile 页（新版标题「〇〇のプロフィール | 調教師データ」）
        return text.person_from_title(html, "調教師")
    except Exception:
        return ""


def parse_txt01(txt):
    sex_m = re.search(r"(牡|牝|セ|セン)", txt)
    status_m = re.search(r"(現役|抹消|引退|繁殖|功労馬|登録)", txt)
    age_m = re.search(r"(\d+)歳", txt)
    # 毛色：正则提全 token（漢字1-3+毛），白名单命中优先——未收录毛色用原值，
    # 也修掉旧子串扫描的截断 bug（栃栗毛/鹿栗毛 被缩成 栗毛）
    m_all = re.findall(r"[\u4e00-\u9fff]{1,3}毛", txt)
    color = next((c for c in m_all if c in common.COLORS), m_all[0] if m_all else "")
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
    trainer_id = ""
    tbl = soup.select_one("table.db_prof_table")
    if tbl:
        for tr in tbl.find_all("tr"):
            th = tr.find("th")
            td = tr.find("td")
            if th and td:
                key = th.get_text(strip=True)
                prof[key] = td.get_text(" ", strip=True)
                if key == "調教師":        # 单元格里带 /trainer/{id}/ 链接 → 拿 id 才能查全名
                    a = td.find("a", href=True)
                    m = re.search(r"/trainer/(\d+)/", a["href"]) if a else None
                    if m:
                        trainer_id = m.group(1)
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
        "trainer_id": trainer_id,
        "生産牧場": prof.get("生産者", ""),
        "通算成績": prof.get("通算成績", ""),
        "獲得賞金 (中央)": prof.get("獲得賞金 (中央)", prof.get("獲得賞金(中央)", "")),
        "獲得賞金 (地方)": prof.get("獲得賞金 (地方)", prof.get("獲得賞金(地方)", "")),
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
    trainers = common.read_cache("trainers") or {}   # trainer_id → 全名（本次运行内复用，一人只抓一次）
    for i, h in enumerate(todo, 1):
        try:
            html = common.fetch(common.NK_HORSE_URL.format(nk_id=nk_of(h)))   # 编码跟随响应头
            d = parse_detail(html)
            tid = str(d.get("trainer_id") or "").strip()
            if tid:
                if tid not in trainers:
                    trainers[tid] = fetch_trainer_fullname(tid)
                    time.sleep(common.sleep_for(TRAINER_URL.format(tid=tid)))
                full = trainers[tid]
                if full:
                    # 详情页给的是「短名 (場所)」；换成全名并统一全角括号（与 text.norm_trainer 同格式）
                    m = re.search(r"[（(]([^）)]*)[）)]\s*$", d.get("調教師") or "")
                    d["調教師"] = f"{full}（{m.group(1)}）" if m else full
            cache[str(h["id"])] = d
            ok += 1
            print(f"  [{i}/{len(todo)}] {h['id']} {h.get('馬名','')} 详情OK "
                  f"{d['登録状態']} {d['生年月日']} {d['通算成績']}")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {h['id']} {h.get('馬名','')}: {e}")
        time.sleep(common.sleep_for(common.NK_HORSE_URL.format(nk_id=nk_of(h))))   # 按域名限速

    common.write_cache("detail", cache)
    common.write_cache("trainers", trainers)
    print(f"✔ 完成：{ok}/{len(todo)} 匹，已写缓存 _tmp/detail.json"
          + (f"（调教师全名 {len(trainers)} 位）" if trainers else ""))


if __name__ == "__main__":
    main()
