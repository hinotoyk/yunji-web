#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日期图数据预计算：读 data/basic.json + data/races/*.json → data/datechart.json

页面 front/pages/datechart.html 只做渲染：fetch 本产物 → RUNS → 天/周/月/年 日历聚合
（2026-09-14 布局样式定稿，按 UI优化记录 §32.6 接入真实数据）。
产物 runs[] 与页面字段完全同构（布局稿 RUNS 契约），本脚本只做
「字段抽取 + 类型归一 + 排序」，不做任何聚合口径计算——进板数 6 段、🏆 计数、
赏金合计等全部由前端在 runs[] 上聚合，保证单一事实源（data/races）与页面零换算。

═══ data/datechart.json 字段模板（产物，前端只读）═══
{
  "meta": {
    "generated_at": "产物生成时间(ISO)，仅标识新鲜度；内容无变化时连文件都不重写",
    "source":       "数据来源说明",
    "stats": {
      "runs":        出走记录总数,
      "horses":      出走过的产驹数,
      "wins":        一着数（全部口径）,
      "trophy_wins": 重赏一着数（GI/GII/GIII/JpnI-3，同 races.html 重赏口径 = 🏆 计数）,
      "prize_total": 赏金合计（円，各条 pr 相加）,
      "first_date":  最早出走日（YYYY-MM-DD，无记录为空串）,
      "last_date":   最晚出走日（同上）
    }
  },
  "runs": [   // 按 日付 → 马id → R 升序（同日同马按 R）
    {
      "d":    "YYYY-MM-DD —— 日付",
      "id":   产驹id（profile.html?horse=id 跳转用）,
      "h":    馬名（日文名，显示用；空则回退 出走馬名/欧字馬名）,
      "r":    レース名（含格级尾缀，如 札幌2歳S(GIII)）,
      "g":    格（GI/GII/GIII/L/OP/JpnI-3/新馬/未勝利/N勝クラス/''，空串=无徽章）,
      "v":    場名,
      "R":    R 番号（int/str 原样，海外部分为 str；缺失=空串）,
      "dist": 距離（m，int；缺失=空串）,
      "s":    芝ダ（芝/ダ/障害/AW）,
      "p":    着顺（int 1-18；未完走=原样字符串 中止/取消/除外/失格）,
      "pr":   赏金（円，int；該马该场 賞金 空/非数=0）,
      "vt":   venue_type（中央/地方/海外 —— 前端 JRA/NAR/海外 场地范围筛选用）,
      "bk":   馬場状态（良/稍重/重/不良/''，明细表用）,
      "ki":   斤量（int/str 原样，海外可为 "120lb"；'' 缺失）,
      "nk":   人気（int/''，明细表人气徽章用）,
      "tm":   タイム（字符串，'' 缺失）,
      "bw":   馬体重（int/''）,
      "dz":   増減（"+2" 等/''）,
      "jk":   騎手,
      "tr":   調教師
    }
  ]
}

接入：run_update.py 各数据策略（basic/races/horse/races-force/ledger/ci）末尾自动重算；
内容签名比对，无变化跳过写入（避免 --ci 每轮空 diff 提交，同 build_timeline.py 约定）。

用法:  python scripts/datechart/build_datechart.py
"""
import datetime
import io
import json
import sys
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

# 重赏判定（同 races.html「重赏」筛选 / timeline.py GRADED 口径：G1/G2/G3/Jpn1/Jpn2/Jpn3；
# L/OP 在页面有级别徽章但不计入重赏 → 🏆 计数用本集合）
TROPHY_GRADES = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII"}


def norm_place(v):
    """結果 → p：数字（int/数字串）→ int；未完走（中止/取消/除外/失格）→ 原样字符串。"""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, int):
        return v
    s = str(v if v is not None else "").strip()
    if not s:
        return ""
    try:
        return int(s)
    except ValueError:
        return s


def norm_prize(v):
    """該马该场的 賞金 → pr（円 int）；空串/非数 → 0。"""
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v or "").strip().replace(",", "")
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _raw(v):
    """原样透传：None/缺失 → 空串，其余（int/str）不动。斤量/人气/马体重等海外值可能为 str。"""
    return "" if v is None else v


def build_runs(horses):
    """全库出走记录 → 渲染就绪 runs[]（字段同构，纯抽取+归一，不聚合）。"""
    runs = []
    for h in horses:
        rf = h.get("races_file")
        if not rf:                       # 与 build_timeline.py 一致：无成绩文件（未出道等）跳过
            continue
        f = ROOT / rf                    # races_file 已含 data/ 前缀（如 data/races/1.json）
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except FileNotFoundError:
            continue
        arr = data if isinstance(data, list) else (data.get("races") or [])
        for r in arr:
            d = str(r.get("日付") or "")
            if not d:
                continue
            dist = r.get("距離")
            runs.append({
                "d": d,
                "id": h.get("id"),
                "h": h.get("馬名") or r.get("出走馬名") or h.get("欧字馬名") or "",
                "r": str(r.get("レース名") or ""),
                "g": str(r.get("格") or ""),
                "v": str(r.get("場名") or ""),
                "R": r.get("R") if r.get("R") not in (None, "") else "",
                "dist": dist if isinstance(dist, (int, float)) and not isinstance(dist, bool) else "",
                "s": str(r.get("芝ダ") or ""),
                "p": norm_place(r.get("結果")),
                "pr": norm_prize(r.get("賞金")),
                "vt": str(r.get("venue_type") or ""),
                "bk": str(r.get("馬場") or ""),
                "ki": _raw(r.get("斤量")),
                "nk": _raw(r.get("人気")),
                "tm": str(r.get("タイム") or ""),
                "bw": _raw(r.get("馬体重")),
                "dz": str(r.get("増減") or ""),
                "jk": str(r.get("騎手") or ""),
                "tr": str(r.get("調教師") or ""),
            })
    runs.sort(key=lambda x: (x["d"], str(x["id"]), str(x["R"])))
    return runs


def main():
    basic = json.loads((DATA / "basic.json").read_text(encoding="utf-8"))
    horses = basic.get("horses", [])
    runs = build_runs(horses)

    wins = [x for x in runs if x["p"] == 1]
    stats = {
        "runs": len(runs),
        "horses": len({x["id"] for x in runs}),
        "wins": len(wins),
        "trophy_wins": sum(1 for x in wins if x["g"] in TROPHY_GRADES),
        "prize_total": sum(x["pr"] for x in runs),
        "first_date": min((x["d"] for x in runs), default=""),
        "last_date": max((x["d"] for x in runs), default=""),
    }
    payload = {
        "meta": {
            "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "source": "basic.json + races/*.json",
            "stats": stats,
        },
        "runs": runs,
    }
    out = DATA / "datechart.json"

    # 内容无变化时跳过写入：generated_at 每次运行都不同，若照写会使 --ci 每轮都产生空 diff 提交
    def content_signature(d):
        m = dict(d.get("meta") or {})
        m.pop("generated_at", None)
        return json.dumps({"meta": m, "runs": d.get("runs")}, ensure_ascii=False, sort_keys=True)

    if out.exists():
        try:
            if content_signature(json.loads(out.read_text(encoding="utf-8"))) == content_signature(payload):
                print("日期图数据预计算: 内容无变化，跳过写入")
                return
        except (json.JSONDecodeError, OSError):
            pass   # 旧文件损坏/不可读 → 走全量重写
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"日期图数据预计算完成: {stats['runs']} 条出走 / {stats['horses']} 匹产驹 / "
          f"一着 {stats['wins']} 场（🏆 {stats['trophy_wins']}）/ 赏金合计 {stats['prize_total']:,} 円 "
          f"（{stats['first_date']} ~ {stats['last_date']}）→ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
