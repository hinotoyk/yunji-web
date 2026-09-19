#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并竞赛缓存 → races 文件 + basic.json，合并后删除临时数据（竞赛流水线最后一环）。

输入缓存（key 均为 str(id)）：
  _tmp/detail.json    {id: {登録状態, 性別, ..., 通算成績, 獲得賞金 (中央), 獲得賞金 (地方), 欧字馬名, ...}}
  _tmp/changed.json   {id: {"旧", "新"}}              （报告用）
  _tmp/races.json     {id: [新增 netkeiba 成绩记录]}   （已含 格/条件/調教師/本賞金）
  _tmp/races_full.json{id: [全部记录]}                  （--force：已有记录已回填缺失字段 + 新增，整体替换）
  _tmp/ledger.json    {id: [新增台账海外记录]}
  _tmp/trainers.json  {trainer_id: 调教师正式名}       （台账记录匹配用）
  _tmp/failures.json  {id: 错误信息}

做的事：
  1. 详情字段回填 basic.json：会变化字段（登録状態/性別/馬齢/馬主/調教師/通算成績/獲得賞金 (中央)/獲得賞金 (地方)）
     无条件覆盖；稳定字段只在抓取值非空时覆盖。
  2. 新增成绩/台账记录合并进 data/races/{id}.json（按比赛键去重，已有记录不动）。
     新记录本賞金已由 fetch_races 的 SP 页解析写好，台账记录按映射附调教师 id。
  3. 由合并后的完整履历统一计算 収得賞金（中央 compute_shutoku + 地方 Jpn
     compute_shutoku_jpn，纯规则无网络），写 basic.json 新字段（円 → 'xx万円'/'xx億xx万円'，零值保留 0）。
  3b. 派生 性別_当前：取最近一场的 性（只有台账海外记录带），与官方 性別 不同才写入。
     官方 性別 是「登录性别」且保持 netkeiba 镜像不动 —— 无 JRA 登录的海外马去势后
     netkeiba / JBIS 两边都不回写，逐场记录才是当期事实；官方一旦更新，派生字段自动消失。
  3c. 最后套用人工维护表 data/manual_overrides.json（{id:{字段:值}}）：人工值优先于派生值，
     抓取脚本永不写该表（见 common.load_overrides）。
  3d. 派生 通算成績_逐场：由逐场全量记录（含海外台账场）计算 出走/1-3着/着外/未完走/未出走，
     作为全站通算战绩的唯一展示源（口径与 netkeiba 展示值对齐，实测 276 匹仅 id 130 不同）。
     官方 通算成績 字符串保持 netkeiba 镜像、降级为对账用（check_data 拿它比 netkeiba 源行数）。
  4. 回填 races_file（"data/races/{id}.json"，站点根相对，与 pedigree_file 同口径）。
  5. 写 data/races_report.md 报告，删除 _tmp 缓存（--keep 保留调试）。

用法:
    python merge_races.py            # 合并并删除缓存
    python merge_races.py --keep     # 合并但保留缓存（调试）
"""
import argparse
import json
import re
import sys
from datetime import datetime

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402

# 会变化字段：无条件覆盖；稳定字段：抓取值非空才覆盖（与 fetch_detail 定义一致）
VOLATILE_FIELDS = ["登録状態", "性別", "馬齢", "馬主", "調教師", "通算成績", "獲得賞金 (中央)", "獲得賞金 (地方)"]
STABLE_FIELDS = ["毛色", "生年月日", "産地", "生産牧場", "欧字馬名", "セリ取引価格"]

RACES_FILE_PREFIX = "data/races/{id}.json"   # basic.json 里 races_file 的引用口径（站点根相对）


def fmt_man(man):
    """万円金额 → 展示串：'400万円'；≥1億(10000万) → '1億1615.8万円'；0/空 → 0（数字）。"""
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


def fmt_yen(yen):
    """円金额 → 万円格式串：4000000円 → '400万円'；0 → 0（数字）。"""
    if not yen:
        return 0
    return fmt_man(yen / 10000)


def current_sex(recs):
    """逐场记录里「最近一场的 性」→ 牡/牝/セ；无则 ""。
    性 字段只有台账海外记录带（netkeiba 成绩页无此列），セン 归一为 セ。"""
    dated = [r for r in recs if r.get("性") and r.get("日付")]
    if not dated:
        return ""
    v = str(max(dated, key=lambda r: str(r.get("日付")))["性"]).strip()
    return "セ" if v.startswith("セ") else v


DNF_RES = ("中止", "失格")        # 未完走：计出走、不算完赛
EXC_RES = ("取消", "除外")        # 未出走：不计出走


def career_from_recs(recs):
    """逐场全量记录（含海外台账行）→ 通算成绩。

    口径与 netkeiba 详情页展示值对齐（实测全库 276 匹逐场推导 == 官方字符串）：
      出走 = 全部记录 − 未出走(取消/除外)；中止/失格 计入出走并单列未完走；
      着外 = 出走 − 1着 − 2着 − 3着（含未完走，故 1+2+3+着外 == 出走）。
    取代「前端正则解析 netkeiba 通算成績 字符串」——那份只覆盖 netkeiba 收录的比赛，
    海外台账补录的场次不进该口径，会导致有战绩的马显示「未出赛」（案例 id 130）。"""
    starts = exc = dnf = w = p2 = p3 = 0
    for r in recs:
        res = r.get("結果")
        if res in EXC_RES:
            exc += 1
            continue
        starts += 1
        if res in DNF_RES:
            dnf += 1
        elif res == 1:
            w += 1
        elif res == 2:
            p2 += 1
        elif res == 3:
            p3 += 1
    return {"出走": starts, "1着": w, "2着": p2, "3着": p3,
            "着外": starts - w - p2 - p3, "未完走": dnf, "未出走": exc}


def move_after(h, field, anchor):
    """派生字段在 basic.json 里的位置归位：紧跟其同源字段（只动键序，不动值）。"""
    keys = list(h.keys())
    if field not in keys or anchor not in keys:
        return
    keys.remove(field)
    keys.insert(keys.index(anchor) + 1, field)
    if keys == list(h.keys()):
        return
    for k in keys:
        h[k] = h.pop(k)


def load_races_file(id_s):
    p = common.RACES_DATA_DIR / f"{id_s}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def save_races_file(id_s, recs):
    common.RACES_DATA_DIR.mkdir(parents=True, exist_ok=True)
    # 结果字段统一归一（历史单字 DNF 中/取/除/失 → 全称 中止/取消/除外/失格）
    for i, r in enumerate(recs):
        r["結果"] = racelib.normalize_result(r.get("結果", ""))
        recs[i] = common.order_record(r)      # 固定字段模板顺序（模板外未知键兜底追加，不丢数据）
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
    races_full = common.read_cache("races_full") or {}   # force：id -> 全部记录（已有回填后+新增）
    ledger = common.read_cache("ledger") or {}
    failures = common.read_cache("failures") or {}
    trainers = common.read_cache("trainers") or {}   # {trainer_id: 正式名}（fetch_races 建）

    n_detail = n_changed = n_new = n_led = n_prize = n_full = 0
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

    # 2)+3) 新增成绩记录 → races 文件（按比赛键去重，已有不动）
    #        force 全量回填（races_full）：已有记录缺失字段已回填并合并新记录 → 整体替换
    # 2a) force 整体替换先做，后续 台账/新增 追加逻辑仍按文件内容去重，幂等
    for id_s, full_recs in races_full.items():
        save_races_file(id_s, full_recs)
        n_full += 1

    # 2b) 新增成绩记录 → races 文件（追加去重；force 时记录已含在整体替换里，只计数）
    #        本賞金已由 fetch_races 的 SP 页解析写好（重赏 1/2着）；无则保持 0
    for id_s, new_recs in races.items():
        if id_s in races_full:
            n_new += len(new_recs)      # 已整体替换（新记录已在文件中），只计数
            continue
        recs = load_races_file(id_s)
        exist_keys = set()
        for r in recs:
            exist_keys |= common.record_keys(r)
        added = 0
        for r in new_recs:
            if common.record_keys(r) & exist_keys:
                continue
            r.setdefault("本賞金", 0)
            recs.append(r)
            exist_keys |= common.record_keys(r)
            added += 1
        n_new += added
        # 目标马总是保存：触发 结果字段归一（历史单字 DNF → 全称）与日付排序（幂等）
        save_races_file(id_s, recs)

    # 4) 台账海外记录 → races 文件（同样去重，双键）
    #    调教师：台账 管理調教師 值 与 调教师映射 比对，一致则附 trainer_id（不一致直接用台账值）
    name_to_tid = {n: tid for tid, n in trainers.items() if n}
    for id_s, new_led in ledger.items():
        recs = load_races_file(id_s)
        exist_keys = set()
        for r in recs:
            exist_keys |= common.record_keys(r)
        added = 0
        for r in new_led:
            if common.record_keys(r) & exist_keys:
                continue
            tid = name_to_tid.get((r.get("調教師") or "").strip())
            if tid:
                r["trainer_id"] = tid
            recs.append(r)
            exist_keys |= common.record_keys(r)
            added += 1
        n_led += added
        if added:
            save_races_file(id_s, recs)

    # 5) 収得賞金：由合并后的完整履历统一计算（纯规则）
    # 5b) 性別_当前（派生）：官方 性別 是「登录性别」——无 JRA 登录的海外马去势后
    #     netkeiba / JBIS 两边都长期停在去势前的值，逐场记录的 性 才是当期事实。
    #     只在「最近一场的 性 ≠ 官方 性別」时另存派生字段；官方 性別 保持 netkeiba 镜像不动，
    #     哪天官方自己更新了，派生值与之相等即自动消失，不会留脏字段。
    overrides = common.load_overrides()
    sex_diff = []               # (馬名, 官方 性別, 逐场 性)
    career_diff = []            # (馬名, 官方 通算成績, 逐场推导) —— 两口径不一致即 netkeiba 未收录的场次
    manual_hits = []            # (馬名, [被套字段])
    for h in horses:
        id_s = str(h["id"])
        p = common.RACES_DATA_DIR / f"{id_s}.json"
        if not p.exists():
            continue
        recs = json.loads(p.read_text(encoding="utf-8"))
        flat = racelib.compute_shutoku(recs, birth_year=h.get("生年"))
        jpn = racelib.compute_shutoku_jpn(recs)
        h["収得賞金"] = {"平地": fmt_yen(flat["平地"]),
                        "障害": fmt_yen(flat["障害"]),
                        "Jpn": fmt_yen(jpn["Jpn"])}
        for it in flat["缺失"]:
            shutoku_missing.append((h.get("馬名"), *it))
        for it in jpn["缺失"]:
            shutoku_missing.append((h.get("馬名"), *it))
        h["races_file"] = RACES_FILE_PREFIX.format(id=id_s)
        cur = current_sex(recs)
        if cur and cur != h.get("性別"):
            h["性別_当前"] = cur
            sex_diff.append((h.get("馬名"), h.get("性別") or "—", cur))
        else:
            h.pop("性別_当前", None)
        # 5d) 通算成績_逐场：全站通算战绩的唯一展示源（含海外台账场）。
        #     官方 通算成績 字符串保持 netkeiba 镜像、降级为对账用（check_data 拿它比 netkeiba 源行数）。
        car = career_from_recs(recs)
        h["通算成績_逐场"] = car
        m = re.search(r"(\d+)戦", h.get("通算成績") or "")
        if m and int(m.group(1)) != car["出走"]:
            career_diff.append((h.get("馬名"), h.get("通算成績"), car))
        n_prize += 1

    # 5c) 人工维护表（data/manual_overrides.json）：在全部派生之后套用，人工值优先
    for h in horses:
        hit = common.apply_overrides(h, overrides)
        if hit:
            manual_hits.append((h.get("馬名"), hit))
        move_after(h, "性別_当前", "性別")   # 派生/人工两条写入路径都归位到 性別 下面
        move_after(h, "通算成績_逐场", "通算成績")

    common.save_basic(data)

    # 6) 报告
    lines = [
        "# 竞赛更新报告",
        "",
        f"- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 详情更新: {n_detail} 匹 · 通算成績变化: {n_changed} 匹",
        f"- 新增成绩记录: {n_new} 条 · 台账海外新增: {n_led} 条 · force 全量回填: {n_full} 匹",
        f"- 収得賞金计算: {n_prize} 匹 · 収得缺本賞金: {len(shutoku_missing)} 场",
        f"- 性別_当前 派生（官方登录 ≠ 逐场）: {len(sex_diff)} 匹 · 人工维护覆盖: {len(manual_hits)} 匹",
        f"- 通算成績 逐场推导 ≠ netkeiba 展示值: {len(career_diff)} 匹",
        f"- 抓取失败: {len(failures)} 匹",
    ]
    if career_diff:
        lines += ["", "## 通算成績 逐场推导 ≠ netkeiba 展示值（差值 = netkeiba 未收录的场次，多为海外台账）", "",
                  "| 馬名 | netkeiba 展示 | 逐场推导 |", "|---|---|---|"]
        for name, official, car in career_diff:
            lines.append(f"| {name} | {official or '—'} | {car['出走']}戦{car['1着']}勝 "
                         f"[ {car['1着']}-{car['2着']}-{car['3着']}-{car['着外']} ] |")
    if sex_diff:
        lines += ["", "## 性別_当前 派生（官方为登录性别，逐场记录为当期性别）", "",
                  "| 馬名 | 官方登录 | 逐场当前 |", "|---|---|---|"]
        for name, official, cur in sex_diff:
            lines.append(f"| {name} | {official} | {cur} |")
    if manual_hits:
        lines += ["", "## 人工维护覆盖（data/manual_overrides.json，优先级最高）", ""]
        for name, hit in manual_hits:
            lines.append(f"- {name}: {', '.join(hit)}")
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
    print(f"   - 新增成绩 {n_new} 条 · 台账海外 {n_led} 条 · force 全量回填 {n_full} 匹 · 収得计算 {n_prize} 匹")
    print(f"   - 収得缺本賞金 {len(shutoku_missing)} 场 · 抓取失败 {len(failures)} 匹")
    print(f"   - 性別_当前 派生 {len(sex_diff)} 匹 · 人工维护覆盖 {len(manual_hits)} 匹")
    print(f"   - 通算成績 逐场推导 ≠ netkeiba 展示值 {len(career_diff)} 匹")
    print(f"✔ 已写 {report.name}")

    if not args.keep:
        common.clean_cache_all()
        print("✔ 已删除 _tmp 缓存")


if __name__ == "__main__":
    main()
