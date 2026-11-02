#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""种马胜鞍派生（父子制覇数据源）：netkeiba 成绩页 → data/sire_wins.json

背景（2026-11-02）：`config/sire.json` 的 `sire.wins` 原为**手工维护**表，`build_timeline.py`
只按赛名精确匹配、没有任何校验源 —— 子站 kzn 曾把「きさらぎ賞」写成キズナ 的胜鞍（该马从未出走此赛），
导致 2025-02-09 サトノシャイニング 赢きさらぎ賞 时冒出一个凭空的「父子制覇」徽章。
本脚本把这张表改为**从种马本人成绩页派生**，手工表降级为兜底。

做法：
  1. 读 config/sire.json 的 `sire.netkeiba_id` → 抓 `db.netkeiba.com/horse/result/{id}/`（EUC-JP）；
  2. 复用竞赛管线解析器 `races/fetch_races.py::parse_races`（与产驹逐场成绩同源同口径）；
  3. 取 `着順 == 1` 的场次 → 解析「格」：先按赛名解析（racelib.race_meta_from_name），
     解析不出再抓该场 SP 结果页确认（每场最多 1 次请求，命中图标 class 才准）；
  4. 只保留**重赏**（GI/GII/GIII/JpnI-III/JGI-JGIII；L/OP/条件战不入表 —— 父子制覇口径 = 重赏）；
  5. 产出 `data/sire_wins.json`：{_meta, sire, wins[{date,name,grade,cn,race_id}]}；
     `cn` 从旧手工表按规范化赛名继承（译文不丢），缺了留空 → 前端回退日文名。

消费方：`scripts/timeline/build_timeline.py` 优先读本产物，读不到才回退 `config.sire.json`。

用法（手动跑，产物入库；不挂每日管线 —— netkeiba 对 CI 出口 IP 不稳）：
    python scripts/timeline/sync_sire_wins.py [--dry-run] [--force]
    --dry-run  只打印解析结果，不写文件
    --force    产物内容无变化也重写（默认内容相同则跳过，保持 git 干净）
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))                     # scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "races"))           # scripts/races（common.py 内部 `import racelib` 依赖）
from core import artifacts, constants, sire_config            # noqa: E402
import common as races_common                                 # noqa: E402  （races 管线薄再导出：fetch/UA/限速）
import fetch_races                                            # noqa: E402  （parse_races：成绩页解析，与产驹同源同口径）
import racelib                                                # noqa: E402  （格解析）

ROOT = constants.ROOT
DATA = constants.DATA_DIR
OUT = DATA / "sire_wins.json"

# 重赏枚举（与 build_timeline 的 GBADGE / racelib 规范化格一致；L/OP/条件战不入父子制覇）
GRADED = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII", "JGI", "JGII", "JGIII"}


def norm_race(s):
    """与 build_timeline.norm_race 同口径（去格级括号尾缀 + 去空格），用于继承旧表译文。"""
    s = "" if s is None else str(s)
    m = re.search(r"[（(]([^()（）]*)[)）]\s*$", s)
    if m:
        s = s[: m.start()]
    return s.replace(" ", "").replace("　", "").strip()


def resolve_grade(rec):
    """一场胜利的「格」：先赛名解析；解析不出再抓 SP 结果页看 Icon_GradeType。"""
    name = rec.get("レース名", "")
    grade, _cond = racelib.race_meta_from_name(name)
    if grade:
        return grade
    rid = rec.get("race_id") or ""
    if not rid:
        return ""
    venue_type = racelib.venue_type(rec.get("場名", ""))
    url = (constants.RACE_SP_URL_NAR if venue_type == "地方" else constants.RACE_SP_URL).format(race_id=rid)
    try:
        sp_html = races_common.fetch(url, encoding="utf-8")
    except Exception as e:                                    # 抓不到就按无格处理（不入表，不阻塞）
        print(f"  ⚠ SP 页抓取失败 {rid}: {e}")
        return ""
    icon_m = re.search(r"Icon_GradeType(\d+)", sp_html)
    return racelib.race_grade_resolve(icon_m.group(1) if icon_m else None, name, venue_type)


def main(argv):
    dry = "--dry-run" in argv
    force = "--force" in argv
    cfg = json.loads((ROOT / "config" / "sire.json").read_text(encoding="utf-8"))
    sire = cfg.get("sire") or {}
    nk = str(sire.get("netkeiba_id") or "").strip()
    if not nk:
        print("✗ config/sire.json 缺 sire.netkeiba_id，无法派生胜鞍")
        return 1

    url = constants.NK_RESULT_URL.format(nk_id=nk)
    print(f"→ 抓取 {sire.get('name_ja', '')} 成绩页 {url}")
    html = races_common.fetch(url, encoding="euc-jp")
    recs = fetch_races.parse_races(html)
    if not recs:
        print("✗ 成绩页解析为空（页面结构变化 / 反爬拦截），本次不写产物")
        return 1

    # 旧手工表的译文（按规范化赛名继承；手工表本身不再作为数据源，仅贡献 cn）
    old_cn = {}
    for w in sire_config.sire_wins():
        if isinstance(w, dict) and w.get("name"):
            old_cn[norm_race(w["name"])] = str(w.get("cn") or "")

    wins = []
    for r in recs:
        if r.get("着順") != 1:
            continue
        name = r.get("レース名", "")
        grade = resolve_grade(r)
        if grade not in GRADED:
            continue
        wins.append({
            "date": r.get("日付", ""),
            "name": norm_race(name),
            "grade": grade,
            "cn": old_cn.get(norm_race(name), ""),
            "race_id": r.get("race_id", ""),
        })
    wins.sort(key=lambda w: w["date"])

    # 唯一性（同一赛名重复胜鞍理论上存在，但父子制覇按赛名匹配 → 重名会让 tip 二义，直接报错）
    seen = {}
    for w in wins:
        if w["name"] in seen:
            print(f"✗ 胜鞍赛名重复：{w['name']}（{seen[w['name']]} / {w['date']}），请人工确认数据源")
            return 1
        seen[w["name"]] = w["date"]

    payload = {
        "meta": {
            "schema": "sire-wins/v1",
            "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "source": f"netkeiba horse/result/{nk}/",
            "sire": sire.get("name_ja", ""),
            "count": len(wins),
        },
        "sire": {"name_ja": sire.get("name_ja", ""), "netkeiba_id": nk},
        "wins": wins,
    }
    print(f"  解析 {len(recs)} 场出走 → 重赏一着 {len(wins)} 项：")
    for w in wins:
        print(f"    {w['date']}  {w['grade']:<5} {w['name']}" + (f"（{w['cn']}）" if w["cn"] else ""))

    if dry:
        print("（--dry-run：未写文件）")
        return 0
    if force:
        OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        print(f"→ 已写入 {OUT.relative_to(ROOT)}")
        return 0
    changed = artifacts.write_if_changed(OUT, payload, ("meta", "sire", "wins"), "种马胜鞍派生")
    if changed:
        print(f"→ 已写入 {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
