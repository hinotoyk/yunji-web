#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并竞赛缓存 → races 文件 + basic.json，合并后删除临时数据（竞赛流水线最后一环）。

输入缓存（key 均为 str(id)）：
  _tmp/detail.json    {id: {登録状態, 性別, ..., 通算成績, 獲得賞金, 欧字馬名, ...}}
  _tmp/changed.json   {id: {"旧", "新"}}              （报告用）
  _tmp/races.json     {id: [新增 netkeiba 成绩记录]}
  _tmp/prize.json     {id: {race_id: 该马着順本賞金(円)}}
  _tmp/ledger.json    {id: [新增台账海外记录]}
  _tmp/failures.json  {id: 错误信息}

做的事：
  1. 详情字段回填 basic.json：会变化字段（登録状態/性別/馬齢/馬主/調教師/通算成績/獲得賞金）
     无条件覆盖；稳定字段只在抓取值非空时覆盖。
  2. 新增成绩/台账记录合并进 data/races/{id}.json（按比赛键去重，已有记录不动）。
  3. 新增记录附上本賞金（按 race_id 查 prize 缓存）。
  4. 由合并后的完整履历统一计算 収得賞金（中央 compute_shutoku + 地方 Jpn
     compute_shutoku_jpn，纯规则无网络），写 basic.json 新字段。
  5. 回填 races_file（"data/races/{id}.json"，站点根相对，与 pedigree_file 同口径）。
  6. 写 data/races_report.md 报告，删除 _tmp 缓存（--keep 保留调试）。

用法:
    python merge_races.py            # 合并并删除缓存
    python merge_races.py --keep     # 合并但保留缓存（调试）
"""
import argparse
import json
import sys
from datetime import datetime

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402

# 会变化字段：无条件覆盖；稳定字段：抓取值非空才覆盖（与 fetch_detail 定义一致）
VOLATILE_FIELDS = ["登録状態", "性別", "馬齢", "馬主", "調教師", "通算成績", "獲得賞金"]
STABLE_FIELDS = ["毛色", "生年月日", "産地", "生産牧場", "欧字馬名", "セリ取引価格"]

RACES_FILE_PREFIX = "data/races/{id}.json"   # basic.json 里 races_file 的引用口径（站点根相对）


def load_races_file(id_s):
    p = common.RACES_DATA_DIR / f"{id_s}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def save_races_file(id_s, recs):
    common.RACES_DATA_DIR.mkdir(parents=True, exist_ok=True)
    # 结果字段统一归一（历史单字 DNF 中/取/除/失 → 全称 中止/取消/除外/失格）
    for r in recs:
        r["結果"] = racelib.normalize_result(r.get("結果", ""))
    recs.sort(key=lambda r: r.get("日付", ""), reverse=True)
    (common.RACES_DATA_DIR / f"{id_s}.json").write_text(
        json.dumps(recs, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="合并竞赛缓存 → races 文件 + basic.json")
    ap.add_argument("--keep", action="store_true", help="合并后保留缓存（默认删除）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    by_id = {str(h["id"]): h for h in horses}

    detail = common.read_cache("detail") or {}
    changed = common.read_cache("changed") or {}
    races = common.read_cache("races") or {}
    prize = common.read_cache("prize") or {}
    ledger = common.read_cache("ledger") or {}
    failures = common.read_cache("failures") or {}

    n_detail = n_changed = n_new = n_led = n_prize = 0
    shutoku_missing = []          # (id, 日付, レース名, 結果) 収得缺本賞金

    # 1) 详情回填 basic.json
    for id_s, d in detail.items():
        h = by_id.get(id_s)
        if not h:
            continue
        for k in VOLATILE_FIELDS:
            h[k] = d.get(k, "")
        for k in STABLE_FIELDS:
            if d.get(k):
                h[k] = d[k]
        n_detail += 1
    n_changed = len(changed)

    # 2)+3) 新增成绩记录 → races 文件（按比赛键去重，已有不动），附本賞金
    for id_s, new_recs in races.items():
        recs = load_races_file(id_s)
        exist_keys = set()
        for r in recs:
            exist_keys |= common.record_keys(r)
        pz = prize.get(id_s, {})
        added = 0
        for r in new_recs:
            if common.record_keys(r) & exist_keys:
                continue
            r["本賞金"] = pz.get(str(r.get("race_id") or ""), 0)
            recs.append(r)
            exist_keys |= common.record_keys(r)
            added += 1
        n_new += added
        # 目标马总是保存：触发 结果字段归一（历史单字 DNF → 全称）与日付排序（幂等）
        save_races_file(id_s, recs)

    # 4) 台账海外记录 → races 文件（同样去重，双键）
    for id_s, new_led in ledger.items():
        recs = load_races_file(id_s)
        exist_keys = set()
        for r in recs:
            exist_keys |= common.record_keys(r)
        added = 0
        for r in new_led:
            if common.record_keys(r) & exist_keys:
                continue
            recs.append(r)
            exist_keys |= common.record_keys(r)
            added += 1
        n_led += added
        if added:
            save_races_file(id_s, recs)

    # 5) 収得賞金：由合并后的完整履历统一计算（纯规则）
    for h in horses:
        id_s = str(h["id"])
        p = common.RACES_DATA_DIR / f"{id_s}.json"
        if not p.exists():
            continue
        recs = json.loads(p.read_text(encoding="utf-8"))
        flat = racelib.compute_shutoku(recs, birth_year=h.get("生年"))
        jpn = racelib.compute_shutoku_jpn(recs)
        h["収得賞金"] = {"平地": flat["平地"], "障害": flat["障害"], "Jpn": jpn["Jpn"]}
        for it in flat["缺失"]:
            shutoku_missing.append((h.get("馬名"), *it))
        for it in jpn["缺失"]:
            shutoku_missing.append((h.get("馬名"), *it))
        h["races_file"] = RACES_FILE_PREFIX.format(id=id_s)
        n_prize += 1

    common.save_basic(data)

    # 6) 报告
    lines = [
        "# 竞赛更新报告",
        "",
        f"- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 详情更新: {n_detail} 匹 · 通算成績变化: {n_changed} 匹",
        f"- 新增成绩记录: {n_new} 条 · 台账海外新增: {n_led} 条",
        f"- 収得賞金计算: {n_prize} 匹 · 収得缺本賞金: {len(shutoku_missing)} 场",
        f"- 抓取失败: {len(failures)} 匹",
    ]
    if shutoku_missing:
        lines += ["", "## 収得缺本賞金（重赏 1/2着，按 0 暂计）", "", "| 馬名 | 日付 | レース名 | 結果 |", "|---|---|---|---|"]
        for name, d, rn, res in shutoku_missing:
            lines.append(f"| {name} | {d} | {rn} | {res} |")
    if failures:
        lines += ["", "## 抓取失败", ""]
        for id_s, err in failures.items():
            h = by_id.get(id_s, {})
            lines.append(f"- {h.get('馬名', id_s)}: {err}")
    lines += ["", f"- 缓存: {'保留(--keep)' if args.keep else '已删除'}", ""]
    report = common.DATA_DIR / "races_report.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"✔ 已合并写回 basic.json：")
    print(f"   - 详情更新 {n_detail} 匹 · 通算成績变化 {n_changed} 匹")
    print(f"   - 新增成绩 {n_new} 条 · 台账海外 {n_led} 条 · 収得计算 {n_prize} 匹")
    print(f"   - 収得缺本賞金 {len(shutoku_missing)} 场 · 抓取失败 {len(failures)} 匹")
    print(f"✔ 已写 {report.name}")

    if not args.keep:
        common.clean_cache_all()
        print("✔ 已删除 _tmp 缓存")


if __name__ == "__main__":
    main()
