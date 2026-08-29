#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本賞金拉取（竞赛流水线第 3 环）。

只处理本环新增记录（_tmp/races.json）里**収得需要本賞金**的场次：
  - 中央 重赏（GI/GII/GIII/JGI/JGII/JGIII）1/2着
  - 地方 Jpn 重赏（JpnI/JpnII/JpnIII）1/2着
（海外不参与収得、非重赏 1着用固定额，都不需要本賞金。）

按场地选源：
  - 地方 → nar.netkeiba.com/race/result.html?race_id={id}（SP 域，顿号十进制格式）
  - 中央 → race.netkeiba.com/race/result.html?race_id={id}（SP 域，逗号格式）
从页内 `本賞金:1着,2着,…万円` 阶梯取该马自己着順那档，写缓存：
  - _tmp/prize.json    {id: {race_id: 该马着順本賞金(円)}}
  - _tmp/failures.json {id: 错误信息}（追加）

収得賞金本身不在本环计算：等 merge_races 把全部记录合并后，
用 racelib.compute_shutoku / compute_shutoku_jpn 统一计算（纯规则，无网络）。

用法:
    python fetch_prize.py [--limit N]
"""
import argparse
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402

# 中央/海外 SP 页：`本賞金:4100,1600,1000,620,410万円`（1着~5着，付加賞-free）
HONSHO_RE = re.compile(r"本賞金:([\d,]+(?:,[\d,]+)*)万円")
# 地方 NAR SP 页：`本賞金:10000.0、3500.0、2000.0、1000.0、500.0万円`（十进制浮点、顿号分隔）
NAR_HONSHO_RE = re.compile(r"本賞金:([\d.,]+(?:[、,][\d.,]+)*)万円")

CENTRAL_GRADES = {"GI", "GII", "GIII", "JGI", "JGII", "JGIII"}
JPN_GRADES = {"JpnI", "JpnII", "JpnIII"}


def parse_honsho(html):
    """中央/海外 SP 页 → 本賞金阶梯 [1着,2着,3着,4着,5着]（円）；找不到返回 None。"""
    m = HONSHO_RE.search(html or "")
    if not m:
        return None
    try:
        return [int(x.replace(",", "")) * 10000 for x in m.group(1).split(",")]
    except (ValueError, TypeError):
        return None


def parse_honsho_nar(html):
    """地方 NAR SP 页 → 本賞金阶梯 [1着,2着,3着,4着,5着]（円）；找不到返回 None。"""
    m = NAR_HONSHO_RE.search(html or "")
    if not m:
        return None
    try:
        vals = []
        for x in re.split(r"[、,]", m.group(1)):
            x = x.strip()
            if x:
                vals.append(int(float(x) * 10000))
        return vals or None
    except (ValueError, TypeError):
        return None


def needs_honsho(rec):
    """収得需要本賞金的场次：中央重赏 1/2着 或 地方 Jpn 重赏 1/2着（海外不参与収得）。"""
    if rec.get("結果") not in (1, 2) or not rec.get("race_id"):
        return False
    if (rec.get("venue_type") or "").strip() == "中央":
        return rec.get("格") in CENTRAL_GRADES
    if (rec.get("venue_type") or "").strip() == "地方":
        return rec.get("格") in JPN_GRADES
    return False


def main():
    ap = argparse.ArgumentParser(description="重赏 1/2着 本賞金拉取")
    ap.add_argument("--limit", type=int, default=0, help="调试：只处理前 n 场")
    args = ap.parse_args()

    races = common.read_cache("races") or {}      # {id: [新增记录]}
    todo = []
    for id_s, recs in races.items():
        for r in recs:
            if needs_honsho(r):
                todo.append((id_s, r))
    if args.limit:
        todo = todo[:args.limit]

    print(f"✔ 需抓本賞金 {len(todo)} 场（新增记录中的重赏 1/2着）")

    prize = {}
    failures = common.read_cache("failures") or {}
    ok = 0
    for i, (id_s, r) in enumerate(todo, 1):
        rid = str(r["race_id"])
        place = int(r["結果"])          # 重賞 1/2着 → 1 或 2
        is_local = (r.get("venue_type") or "").strip() == "地方"
        url = (common.RACE_SP_URL_NAR if is_local else common.RACE_SP_URL).format(race_id=rid)
        parser = parse_honsho_nar if is_local else parse_honsho
        try:
            ladder = parser(common.fetch(url, encoding="utf-8"))
            if ladder and 1 <= place <= len(ladder):
                own = ladder[place - 1]      # 该马自己的着順本賞金（付加賞-free）
                prize.setdefault(id_s, {})[rid] = own
                ok += 1
                print(f"  [{i}/{len(todo)}] {id_s} {r['日付']} {r['レース名']} "
                      f"{place}着本賞金={own/10000:,.0f}万")
            else:
                print(f"  [{i}/{len(todo)}] ⚠ {id_s} {r['レース名']}: 本賞金阶梯解析失败")
        except Exception as e:
            failures[id_s] = f"prize {rid}: {e}"
            print(f"  [{i}/{len(todo)}] ❌ {id_s} {r['レース名']} ({rid}): {e}")
        time.sleep(common.sleep_for(url))

    common.write_cache("prize", prize)
    common.write_cache("failures", failures)
    print(f"✔ 本賞金成功 {ok}/{len(todo)} 场")


if __name__ == "__main__":
    main()
