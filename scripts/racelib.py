#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹·比赛域公共逻辑（与数据源无关）。

契约B 定义见 docs/data-contracts.md：
- coerce_record(): 字符串行 → 契约B 类型化记录（非法值记入 issues）
- venue_type() / race_class(): 场地/级别推导（领域知识，不依赖任何源）
- compute_stats() / derive_basic(): 汇总统计 / 建档推导

适配器（scripts/adapters/*）与本模块解耦：适配器只做"源格式 → 契约字段名 + 字符串值"，
类型规范化、值域校验、推导一律走本模块，保证任何数据源进入同一套逻辑。
"""
import re

JRA_VENUES = {"札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"}
NAR_VENUES = {"門別", "帯広", "盛岡", "水沢", "金沢", "笠松", "名古屋", "園田", "姫路",
              "高知", "佐賀", "大井", "船橋", "川崎", "浦和", "荒尾"}
OVERSEAS_VENUES = {"ウッドバイン", "デルマー", "フォートエリー", "ドバイ", "メイダン",
                   "シャティン", "ロンシャン", "サンタアニタ", "チャーチルダウンズ",
                   "アケダクト", "ベルモントパーク", "サラトガ", "キーンランド"}

RESULT_DNF = {"中止", "取消", "除外", "失格"}
GRADES = {"GI", "GII", "GIII", "L"}

DATE_RE = re.compile(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$")

# 契约B 字段清单（适配器必须提供；值可为字符串，由 coerce_record 类型化）
CONTRACT_FIELDS = [
    "日付", "場名", "R", "競走名", "条件", "格", "距離", "馬場", "状態", "天候",
    "出走馬名", "騎手", "性齢", "斤量", "頭数", "人気", "単勝", "結果", "タイム",
    "上り", "着差", "馬体重", "増減", "賞金", "Rt", "管理調教師", "母父名",
]


def parse_int(v):
    v = (v or "").strip().replace(",", "")
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def parse_float(v):
    v = (v or "").strip().replace(",", "")
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def venue_type(name):
    if name in JRA_VENUES:
        return "中央"
    if name in NAR_VENUES:
        return "地方"
    if name in OVERSEAS_VENUES:
        return "海外"
    return "未知"


def race_class(grade, cond):
    """重赏 / リステッド / オープン / 条件・未勝利"""
    grade = (grade or "").strip()
    cond = cond or ""
    if grade in ("GI", "GII", "GIII"):
        return "重賞"
    if grade == "L":
        return "リステッド"
    if "OP" in cond:
        return "オープン"
    return "条件・未勝利"


def _cell(row, key):
    v = row.get(key)
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def coerce_record(row, issues):
    """契约B：字符串行 → 类型化记录；非法/缺关键字段记入 issues 并返回 None"""
    name, date_s, result_s = _cell(row, "出走馬名"), _cell(row, "日付"), _cell(row, "結果")
    if not name:
        issues.append({"type": "缺馬名"})
        return None
    if not date_s:
        issues.append({"type": "缺日期", "馬名": name})
        return None
    m = DATE_RE.match(date_s)
    if not m:
        issues.append({"type": "日期格式异常", "馬名": name, "日付": date_s})
        return None
    date_norm = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    result = parse_int(result_s)
    dnf = ""
    if result is None:
        if result_s in RESULT_DNF:
            dnf, result = result_s, None
        else:
            issues.append({"type": "結果格式异常", "馬名": name, "日付": date_norm, "結果": result_s})
            return None

    prize = parse_int(_cell(row, "賞金")) or 0
    dist = parse_int(_cell(row, "距離"))
    if dist is None and _cell(row, "距離"):
        issues.append({"type": "距離非数字", "馬名": name, "日付": date_norm, "距離": _cell(row, "距離")})

    venue = _cell(row, "場名")
    vt = venue_type(venue)
    if vt == "未知":
        issues.append({"type": "未知場名", "馬名": name, "日付": date_norm, "場名": venue})

    return {
        "日付": date_norm,
        "場名": venue,
        "R": _cell(row, "R"),
        "競走名": _cell(row, "競走名"),
        "条件": _cell(row, "条件"),
        "格": _cell(row, "格"),
        "距離": dist if dist is not None else _cell(row, "距離"),
        "馬場": _cell(row, "馬場"),
        "状態": _cell(row, "状態"),
        "天候": _cell(row, "天候"),
        "出走馬名": name,
        "騎手": _cell(row, "騎手"),
        "性齢": _cell(row, "性齢"),
        "斤量": parse_float(_cell(row, "斤量")),
        "頭数": parse_int(_cell(row, "頭数")),
        "人気": parse_int(_cell(row, "人気")),
        "単勝": parse_float(_cell(row, "単勝")),
        "結果": result if result is not None else dnf,
        "タイム": _cell(row, "タイム"),
        "上り": _cell(row, "上り"),
        "着差": _cell(row, "着差"),
        "馬体重": parse_int(_cell(row, "馬体重")),
        "増減": _cell(row, "増減"),
        "賞金": prize,
        "Rt": parse_int(_cell(row, "Rt")),
        "管理調教師": _cell(row, "管理調教師"),
        "母父名": _cell(row, "母父名"),
        "venue_type": vt,
        "race_class": race_class(_cell(row, "格"), _cell(row, "条件")),
    }


def compute_stats(recs):
    """从契约B 逐场履历计算汇总 stats"""
    started = [r for r in recs if isinstance(r["結果"], int) or r["結果"] == "中止"]
    finished = [r for r in started if isinstance(r["結果"], int)]
    n = len(started)
    w = sum(1 for r in finished if r["結果"] == 1)
    p2 = sum(1 for r in finished if r["結果"] == 2)
    p3 = sum(1 for r in finished if r["結果"] == 3)
    prize = sum(r["賞金"] or 0 for r in recs)

    def rate(x, base):
        return f"{x / base:.3f}" if base else "0.000"

    dist, surf, cond, venue_s = {}, {}, {}, {}
    for r in recs:
        key_d = f"{r['馬場'] or '?'}{r['距離']}"
        key_s = r["馬場"] or "?"
        key_c = r["状態"] or "?"
        key_v = r["venue_type"] or "?"
        win = 1 if r["結果"] == 1 else 0
        in2 = 1 if r["結果"] in (1, 2) else 0
        for d, key in ((dist, key_d), (surf, key_s), (cond, key_c), (venue_s, key_v)):
            g = d.setdefault(key, {"出赛": 0, "勝": 0, "連対": 0, "賞金": 0})
            if isinstance(r["結果"], int) or r["結果"] == "中止":
                g["出赛"] += 1
            g["勝"] += win
            g["連対"] += in2
            g["賞金"] += r["賞金"] or 0

    graded = [r for r in recs if r["格"] in GRADES]
    graded_wins = [r for r in graded if r["結果"] == 1]

    dates = [r["日付"] for r in recs]
    return {
        "出賽数": n,
        "勝": w,
        "2着": p2,
        "3着": p3,
        "着外": max(0, len(finished) - w - p2 - p3),
        "中止": sum(1 for r in started if r["結果"] == "中止"),
        "取消": sum(1 for r in recs if r["結果"] == "取消"),
        "除外": sum(1 for r in recs if r["結果"] == "除外"),
        "勝率": rate(w, n),
        "連対率": rate(w + p2, n),
        "複勝率": rate(w + p2 + p3, n),
        "賞金合計": prize,
        "重賞出走": len(graded),
        "重賞勝ち": len(graded_wins),
        "重賞": [{"日付": r["日付"], "競走名": r["競走名"], "格": r["格"], "結果": r["結果"]} for r in graded],
        "距離別": dist,
        "馬場別": surf,
        "状態別": cond,
        "場地別": venue_s,
        "初出走": min(dates) if dates else "",
        "最終出走": max(dates) if dates else "",
    }


def derive_basic(recs):
    """从 性齢/日付 推导 性別（取最近一场，兼容被阉割）、生年（一致性推导）"""
    latest = max(recs, key=lambda r: r["日付"])
    m = re.match(r"([牡牝セ])", _cell(latest, "性齢"))
    sex = m.group(1) if m else ""
    births = set()
    for r in recs:
        m2 = re.search(r"(\d+)", _cell(r, "性齢"))
        if m2:
            births.add(int(r["日付"][:4]) - int(m2.group(1)))
    birth = ""
    if births:
        birth = str(min(births)) if len(births) == 1 else str(max(births))
    return sex, birth
