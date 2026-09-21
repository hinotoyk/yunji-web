#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日期图数据预计算：读 data/basic.json + data/races/*.json → data/datechart.json

产物字段契约见 data/SCHEMA.md（6a 搬家）；页面只做渲染，聚合口径全在前端。
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
                "hc": h.get("香港馬名") or h.get("自译馬名") or "",
                "r": str(r.get("レース名") or ""),
                "g": str(r.get("格") or ""),
                "v": str(r.get("場名") or ""),
                "R": r.get("R") if r.get("R") not in (None, "") else "",
                "hs": str(r.get("発走") or ""),
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
