#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按「指定日期」快速更新（竞赛流水线新环）：SP 页**发现**产驹 → 复用原流程取值 → races.json 缓存。

动机：原流水线（fetch_detail 判变 → fetch_races 逐匹马成绩页）依赖 netkeiba **马匹成绩页**更新，
而该页更新滞后（上周末结果几天后才进），导致产驹新赛成绩迟迟不落库。本脚本反其道：
按天从 **SP 比赛结果页**（更新快、当天出）**发现**当天全部产驹出赛（按 nk_id 精确匹配库内马，
同一马名不同马 nk_id 不同 → 无同名歧义），再用**原流程同一套取值逻辑**（fetch_races 的
parse_races 成绩页 + enrich_from_sp + resolve_trainer/jockey）构建记录，保证字段值完全一致。

⚠ 关键：SP 结果页无「秒着差 / 逐马赏金 / 全名」——那些只在马匹成绩页/人物页上。故
取值一律复用 fetch_races._fetch（对命中马跑标准成绩页管线），只换「发现方式」为 SP 页。

数据源（发现用，静态 HTML 非 AJAX）：
  JRA 中央 : race.netkeiba.com/top/payback_list.html?kaisai_date=YYYYMMDD  （含各会场 kaisai_id）
  NAR 地方 : nar.netkeiba.com/top/payback_list.html?kaisai_date=YYYYMMDD
  每场 SP 结果页 : race.netkeiba.com/race/result.html?race_id=...（nar.netkeiba.com 同款）
  payback 结果表只含前 3 名（其余 JS 折叠）→ 只用来拿当天全部 race_id（按会场迭代）；
  完整出赛名单须逐场抓 SP 页，按 nk_id 找命中马。

与既有策略的关系（docs/pipeline.md）：
  - 独立闭环：fetch_day → merge_races（删缓存）→ 派生重建。绝不与 --races/--horse 同时写缓存。
  - 落库幂等：merge_races 按 race:{race_id} / horse:{馬名}|{日付} 双键去重，只增不覆盖。
  - 只写 races.json 一种缓存，不碰 detail/changed/ledger（不跑判变/台账），不污染原链路。

字段契约见 docs/SCHEMA.md §2（与 fetch_races 同一口径，值完全一致）。
用法:
    python fetch_day.py 20261017
    python fetch_day.py 20261017,20261018
    python fetch_day.py 20261017 --jra-only     # 跳过 NAR 地方
    python fetch_day.py 20261017 --dry-run      # 只打印命中，不写缓存
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402
import fetch_races  # noqa: E402  复用 to_contract_b / enrich_from_sp / find_race_row 等

JRA_PB = "https://race.netkeiba.com/top/payback_list.html?kaisai_date={d}"
NAR_PB = "https://nar.netkeiba.com/top/payback_list.html?kaisai_date={d}"
JRA_PB_BASE = "https://race.netkeiba.com/top/payback_list.html"
NAR_PB_BASE = "https://nar.netkeiba.com/top/payback_list.html"
RACEID_RE = re.compile(r"race_id=([0-9A-Za-z]+)")
HORSE_RE = re.compile(r"/horse/(\d+)")
KAISAI_RE = re.compile(r"kaisai_id=(\d+)&kaisai_date=(\d{8})")


# ---------- payback：当天全部 race_id（按会场迭代） ----------
def venue_ids_from_payback(html):
    """日期级 payback 页 → 当天各会场的 kaisai_id（RaceKaisaiWrap 链接）。
    多会场日（10-18 东京+京都+新潟）body 只显示默认会场，故须按会场逐个抓子页收齐。"""
    soup = common.BeautifulSoup(html, "lxml")
    kw = soup.select_one("div.RaceKaisaiWrap")
    ids = []
    if kw is None:
        return ids
    for a in kw.find_all("a", href=True):
        m = KAISAI_RE.search(a.get("href", ""))
        if m:
            ids.append(m.group(1))
    return ids


def race_ids_from_venue(html):
    """会场级 payback 页 → 该会场全部 race_id（div#tab_PaybackRaceNum_{N}_con 块）。"""
    soup = common.BeautifulSoup(html, "lxml")
    body = soup.select_one("div.RacePaybackListBody")
    ids = []
    if body is None:
        return ids
    for div in body.find_all("div", id=True):
        if div.get("id", "").startswith("tab_PaybackRaceNum_"):
            m = RACEID_RE.search(str(div))
            if m:
                ids.append(m.group(1))
    return ids


def collect_race_ids(date, include_nar=True):
    """当天全部 (domain, race_id)。JRA 非赛日 payback 返回 400 → 跳过不报错。"""
    out = []
    for domain, date_url, base in (
        ("JRA", JRA_PB.format(d=date), JRA_PB_BASE),
        ("NAR", NAR_PB.format(d=date), NAR_PB_BASE),
    ):
        if domain == "NAR" and not include_nar:
            continue
        try:
            html = common.fetch(date_url, encoding="utf-8")
        except Exception as e:
            print(f"  [{domain}] payback 抓取失败（可能非赛日）: {e}")
            continue
        venues = venue_ids_from_payback(html)
        if venues:
            for kid in venues:
                vurl = f"{base}?kaisai_id={kid}&kaisai_date={date}"
                try:
                    vhtml = common.fetch(vurl, encoding="utf-8")
                except Exception as e:
                    print(f"  [{domain} 会场{kid}] 抓取失败: {e}")
                    continue
                vids = race_ids_from_venue(vhtml)
                print(f"  [{domain} 会场{kid}] {len(vids)} 场")
                for rid in vids:
                    out.append((domain, rid))
        else:   # 单会场日：直接读日期页 body
            vids = race_ids_from_venue(html)
            print(f"  [{domain}] 日期页 body 直接读 {len(vids)} 场")
            for rid in vids:
                out.append((domain, rid))
    return out


# ---------- SP 结果页：完整出赛名单 ----------
def parse_sp_roster(sp_html):
    """SP 结果页 → 完整出赛马 [{nk_id, 馬名, 着順, 枠番, 馬番, 性齢, 斤量, 騎手, 厩舎, 単勝, 人気, タイム, 着差, 馬体重, 増減, 通過, 上り}]。
    RaceTable01 每行 td.Horse_Info 定位马名 + 马名 a 里的 nk_id。SP 表头是「合并列」
    （単勝オッズ / 馬体重(増減) / 枠 / コーナー通過順 / 後3F），用别名前缀映射到规范键。"""
    soup = common.BeautifulSoup(sp_html, "lxml")
    tbl = soup.find("table", class_=re.compile("RaceTable01")) or soup.find("table", class_=re.compile("HorseList"))
    if not tbl:
        return []
    ths = [re.sub(r"\s+", "", th.get_text(" ", strip=True)) for th in tbl.find_all("th")]

    def header_key(h):
        if h.startswith("着順"):
            return "着順"
        if h == "枠":
            return "枠番"
        if h == "馬番":
            return "馬番"
        if h == "馬名":
            return "馬名"
        if h == "性齢":
            return "性齢"
        if h == "斤量":
            return "斤量"
        if h == "騎手":
            return "騎手"
        if h == "厩舎":
            return "厩舎"
        if h.startswith("タイム"):
            return "タイム"
        if h == "着差":
            return "着差"
        if h.startswith("単勝"):
            return "単勝"
        if h.startswith("人気"):
            return "人気"
        if h.startswith("馬体重"):
            return "馬体重"
        if h.startswith("コーナー"):
            return "通過"
        if h.startswith("後3"):
            return "上り"
        return ""

    idx = {header_key(h): i for i, h in enumerate(ths) if header_key(h)}
    rows = []
    for tr in tbl.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) <= max(idx.values()):
            continue
        if "馬名" not in idx:
            continue
        name_td = tds[idx["馬名"]]
        a = name_td.find("a", href=True)
        m = HORSE_RE.search(a.get("href", "")) if a else None
        if not m:
            continue

        def g(k):
            i = idx.get(k)
            return tds[i].get_text(" ", strip=True) if (i is not None and i < len(tds)) else ""
        bw_txt = g("馬体重")                          # "434(+4)" → 馬体重=434, 増減=+4
        bw_m = re.search(r"(\d+)\s*(?:\(([+-]?\d+)\))?", bw_txt)
        rows.append({
            "nk_id": m.group(1),
            "馬名": name_td.get_text(" ", strip=True),
            "着順": g("着順"), "枠番": g("枠番"), "馬番": g("馬番"),
            "性齢": g("性齢"), "斤量": g("斤量"),
            "騎手": g("騎手"), "厩舎": g("厩舎"),
            "タイム": g("タイム"), "着差": g("着差"),
            "単勝": g("単勝"), "人気": g("人気"),
            "馬体重": bw_m.group(1) if bw_m else "",
            "増減": (bw_m.group(2) if bw_m and bw_m.group(2) is not None else ""),
            "通過": g("通過"), "上り": g("上り"),
        })
    return rows


# ---------- 比赛级元信息（SP 页 RaceData01/02） ----------
def race_meta_from_sp(sp_html, domain):
    """SP 结果页 → 比赛级元信息：日付(需外部)、場名/開催、R、レース名、距離/芝ダ、コース、
    天候、馬場、発走、頭数、venue_type。缺失字段留空串（enrich_from_sp 会再补 格/条件等）。"""
    soup = common.BeautifulSoup(sp_html, "lxml")
    d01 = soup.find("div", class_="RaceData01")
    d01_text = d01.get_text(" ", strip=True) if d01 else ""
    d02 = soup.find("div", class_="RaceData02")
    d02_text = d02.get_text(" ", strip=True) if d02 else ""
    meta = {
        "発走": "", "距離": "", "芝ダ": "", "コース": "", "天候": "", "馬場": "",
        "場名": "", "開催": "", "頭数": "", "venue_type": "中央" if domain == "JRA" else "地方",
    }
    hak = re.search(r"(\d{1,2}:\d{2})\s*発走", d01_text)
    if hak:
        meta["発走"] = hak.group(1)
    dm = re.search(r"(芝|ダ|障)(\d+)m", d01_text)
    if dm:
        meta["芝ダ"] = {"芝": "芝", "ダ": "ダート", "障": "障害"}[dm.group(1)]
        meta["距離"] = int(dm.group(2))
    cm = re.search(r"\(([^()]*)\)", d01_text)
    if cm:
        tok = re.sub(r"\s+", "", cm.group(1))
        if re.fullmatch(r"(?:右|左)(?:外|内)?(?:[A-D])?", tok):
            meta["コース"] = tok
    tm = re.search(r"天候[:：]?([^\s/]+)", d01_text)
    if tm:
        meta["天候"] = tm.group(1)
    bm = re.search(r"馬場[:：]?([^\s/]+)", d01_text)
    if bm:
        meta["馬場"] = bm.group(1)
    # 場名/開催：RaceData02 形如 "4回 東京 6日目 サラ系..." → 取白名单场名 + "N回場N日目"
    for v in racelib.JRA_VENUES | racelib.NAR_VENUES:
        if v in d02_text:
            meta["場名"] = v
            break
    km = re.search(r"(\d+)回\s*(\S+?)\s*(\d+)日目", d02_text)
    if km:
        meta["開催"] = f"{km.group(1)}回{km.group(2)}{km.group(3)}日目"
    nm = re.search(r"(\d+)頭", d02_text)
    if nm:
        meta["頭数"] = int(nm.group(1))
    return meta


def main():
    ap = argparse.ArgumentParser(description="按指定日期快速更新：SP 页发现产驹 + 原流程取值")
    ap.add_argument("dates", help="YYYYMMDD 或逗号分隔多个")
    ap.add_argument("--jra-only", action="store_true", help="跳过 NAR 地方")
    ap.add_argument("--dry-run", action="store_true", help="只打印命中，不写缓存")
    args = ap.parse_args()

    dates = [d for d in re.split(r"[,，]", args.dates) if re.match(r"^\d{8}$", d or "")]
    if not dates:
        sys.exit("日期须为 YYYYMMDD（可用逗号分隔多个）")

    basic = common.load_basic()
    horses = basic["horses"]
    idx = {}          # nk_id -> [horse]
    for h in horses:
        nk = str(h.get("nk_id") or "").strip()
        if nk:
            idx.setdefault(nk, []).append(h)
    print(f"库内马 {len(horses)} 匹 · 有 nk_id {len(idx)} 匹")

    # ── 1) 发现：SP 页 → 命中马 id 集合（快、完整名单、按 nk_id 精确匹配） ──
    matched_ids = {}     # id_s -> (馬名, 日期列表)
    for date8 in dates:
        date = f"{date8[:4]}-{date8[4:6]}-{date8[6:]}"
        print(f"\n══ {date8} {date} ══")
        race_ids = collect_race_ids(date8, include_nar=not args.jra_only)
        print(f"  当天共 {len(race_ids)} 场，逐场扫描 SP 结果页（发现产驹）…")
        for i, (domain, rid) in enumerate(race_ids, 1):
            sp_url = (common.RACE_SP_URL_NAR if domain == "NAR" else common.RACE_SP_URL).format(race_id=rid)
            try:
                sp_html = common.fetch(sp_url, encoding="utf-8")
            except Exception as e:
                print(f"  [{i}/{len(race_ids)}] {domain} {rid} 抓取失败: {e}")
                continue
            roster = parse_sp_roster(sp_html)
            hits = []
            for run in roster:
                matched = idx.get(run["nk_id"])
                if matched:
                    for h in matched:
                        hits.append((h, run))
            if hits:
                print(f"  ▶ [{domain}] {rid} 命中 {len(hits)} 匹")
                for h, run in hits:
                    id_s = str(h["id"])
                    if id_s not in matched_ids:
                        matched_ids[id_s] = {"馬名": h.get("馬名", ""), "dates": []}
                    matched_ids[id_s]["dates"].append(date8)
                    print(f"     id={id_s} {h.get('馬名')} → {run['着順']}着 馬番{run['馬番']} {run['性齢']}")
            time.sleep(common.sleep_for(sp_url))

    if not matched_ids:
        print("\n当日无库内马出赛，无新记录。")
        return
    print(f"\n◈ 发现产驹 {len(matched_ids)} 匹 → 复用原流程成绩页取值…")
    if args.dry_run:
        print("[dry-run] 未写缓存")
        return

    # ── 2) 取值：对命中马跑标准成绩页管线（parse_races + enrich + resolve_trainer/jockey）
    #        保证 着差=秒 / 赏金=円 / 骑手·调教师全名 等与原流程 --races 完全一致。 ──
    targets = {id_s: next(h for h in horses if str(h["id"]) == id_s) for id_s in matched_ids}
    fetch_races._fetch(targets, force=False)
    print(f"✔ 已由 fetch_races._fetch 写 races.json 缓存（{len(targets)} 匹，值与原流程一致）")
    print("   → 请随后运行 merge_races.py 落库（run_update.py --day 会自动执行）")


if __name__ == "__main__":
    main()
