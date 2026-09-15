#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""远端旧格式比赛记录合并（本地为主）+ 定向升级。

背景：远端 auto-update 提交可能新增「旧格式」比赛记录（无 発走/コース/photo，
旧字段顺序）。本地已是新格式（38 字段模板 + 発走/コース）。
本脚本：以本地数据为主，把「远端有而本地没有」的记录吸收进本地 races 文件，
记录这些旧格式记录的 race_id 清单，再按 race_id 专门抓 SP 页补 発走/コース。

用法:
    python tests/_merge_remote_races.py --compare   # 只对比，输出报告 + race_id 清单（默认）
    python tests/_merge_remote_races.py --absorb    # 吸收远端独有记录到本地文件（旧格式原样+模板排序）
    python tests/_merge_remote_races.py --upgrade   # 按 race_id 定向抓 SP 页，补 発走/コース
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts", "races"))
import common
import merge_races as mr

REMOTE_DIR = "tests/_trash/remote-races-20260914"
MANIFEST = "tests/_old-format-race-ids-20260914.json"   # 旧格式 race_id 清单（用户要求「记录下来」）
DUMP = "tests/_trash/absorbed-20260914.json"            # 已吸收记录快照（--upgrade 读取）


def load_local(hid):
    p = os.path.join("data/races", f"{hid}.json")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def find_new_records(remote_recs, local_recs):
    """远端记录中本地没有的（record_keys 判重，双键 race_id / 馬名+日付；本地为主）。"""
    lkeys = set()
    for r in local_recs:
        lkeys |= common.record_keys(r)
    return [r for r in remote_recs if not (common.record_keys(r) & lkeys)]


def collect():
    """对比全部远端文件 → {hid: [本地没有的旧格式记录]}。"""
    out = {}
    for fn in sorted(os.listdir(REMOTE_DIR)):
        if not fn.endswith(".json"):
            continue
        hid = fn[:-5]
        with open(os.path.join(REMOTE_DIR, fn), encoding="utf-8") as f:
            remote = json.load(f)
        new = find_new_records(remote, load_local(hid))
        if new:
            out[hid] = new
    return out


def upgrade_hakso_course(lr, html):
    """只从 SP 页 RaceData01 补 発走/コース，不动其它字段（以本地/远端已有值为准）。"""
    if not html:
        return
    soup = common.BeautifulSoup(html, "lxml")
    d01 = soup.find("div", class_="RaceData01")
    d01_text = d01.get_text(" ", strip=True) if d01 else ""
    m = re.search(r"(\d{1,2}:\d{2})\s*発走", d01_text)
    if m:
        lr["発走"] = m.group(1)
    cm = re.search(r"\(([^()]*)\)", d01_text)
    if cm:
        tok = re.sub(r"\s+", "", cm.group(1))      # "右 A"/"左 外 A"（含 \xa0）→ "右A"/"左外A"
        if re.fullmatch(r"(?:右|左)(?:外|内)?(?:[A-D])?", tok):
            lr["コース"] = tok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", action="store_true", help="只对比并输出 race_id 清单")
    ap.add_argument("--absorb", action="store_true", help="吸收远端独有记录到本地文件")
    ap.add_argument("--upgrade", action="store_true", help="按 race_id 定向抓 SP 页补 発走/コース")
    args = ap.parse_args()
    if not (args.compare or args.absorb or args.upgrade):
        args.compare = True

    if args.compare:
        new_map = collect()
        total = 0
        rid_set = set()
        manifest = []
        for hid in sorted(new_map):
            for r in new_map[hid]:
                total += 1
                rid = str(r.get("race_id") or "").strip()
                if rid:
                    rid_set.add(rid)
                manifest.append({
                    "file": hid, "race_id": rid, "日付": r.get("日付", ""),
                    "レース名": r.get("レース名", ""), "出走馬名": r.get("出走馬名", ""),
                    "結果": r.get("結果", ""),
                    "旧格式": not r.get("発走") or not r.get("コース"),
                })
                print(f'{hid}: 新增 {r.get("日付")} | {r.get("レース名")} | {r.get("出走馬名")} | race_id={rid} | 結果={r.get("結果")}')
        print(f"\n合计新增 {total} 条 · 唯一 race_id {len(rid_set)} 个")
        with open(MANIFEST, "w", encoding="utf-8") as f:
            json.dump({"合计新增": total, "race_ids": sorted(rid_set), "记录": manifest},
                      f, ensure_ascii=False, indent=1)
        print(f"race_id 清单已写 {MANIFEST}")

    if args.absorb:
        new_map = collect()
        for hid, recs in new_map.items():
            local = load_local(hid)
            local.extend(recs)
            mr.save_races_file(hid, local)   # 结果归一 + 模板排序 + 日付降序
            print(f"吸收 {len(recs)} 条 → data/races/{hid}.json")
        with open(DUMP, "w", encoding="utf-8") as f:
            json.dump(new_map, f, ensure_ascii=False, indent=1)
        print(f"已吸收记录快照写 {DUMP}")

    if args.upgrade:
        if not os.path.exists(DUMP):
            print("没有吸收快照，请先运行 --absorb")
            return
        with open(DUMP, encoding="utf-8") as f:
            new_map = json.load(f)
        cache = {}
        n_up = 0
        for hid in sorted(new_map):
            local = load_local(hid)
            for ar in new_map[hid]:
                rid = str(ar.get("race_id") or "").strip()
                if not rid:
                    continue
                is_local = (ar.get("venue_type") or "").strip() == "地方"
                key = (is_local, rid)
                if key not in cache:
                    url = (common.RACE_SP_URL_NAR if is_local else common.RACE_SP_URL).format(race_id=rid)
                    try:
                        cache[key] = common.fetch(url, encoding="utf-8")
                    except Exception:
                        cache[key] = None
                    time.sleep(common.sleep_for(url))
                html = cache.get(key)
                ak = common.record_keys(ar)
                for lr in local:
                    if common.record_keys(lr) & ak:
                        upgrade_hakso_course(lr, html)
                        n_up += 1
                        break
            mr.save_races_file(hid, local)
        print(f"定向升级完成：更新 {n_up} 条记录（补 発走/コース）")


if __name__ == "__main__":
    main()
