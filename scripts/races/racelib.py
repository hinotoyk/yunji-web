#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""竞赛域公共规则（与数据源无关）。

本模块只含「领域知识」：场地分类、格推导、収得賞金规则等。
抓取脚本产出原始字段后，统一走本模块规范化/计算，保证任何来源进入同一套逻辑。
"""
import re

JRA_VENUES = {"札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"}
NAR_VENUES = {"門別", "帯広", "盛岡", "水沢", "金沢", "笠松", "名古屋", "園田", "姫路",
              "高知", "佐賀", "大井", "船橋", "川崎", "浦和", "荒尾"}
OVERSEAS_VENUES = {"ウッドバイン", "デルマー", "フォートエリー", "ドバイ", "メイダン",
                   "シャティン", "ロンシャン", "サンタアニタ", "チャーチルダウンズ",
                   "アケダクト", "ベルモントパーク", "サラトガ", "キーンランド"}

RESULT_DNF = {"中止", "取消", "除外", "失格"}

# 格（从レース名括号后缀推导）：GRADE_ORDER 为规范顺序（含 Jpn*/OP）
GRADE_ORDER = ["GI", "JpnI", "GII", "JpnII", "GIII", "JpnIII", "L", "OP"]
GRADES = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII", "L", "JGI", "JGII", "JGIII"}
ALL_GRADES = GRADE_ORDER + ["JGI", "JGII", "JGIII"]

DATE_RE = re.compile(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$")


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


def _normalize_surface(surf):
    """芝ダ 归一化：netkeiba 距离列 芝/ダ/障；台账 芝/ダート/AW → 芝/ダ/AW；障害→障。"""
    return {"ダート": "ダ", "障害": "障", "芝": "芝", "ダ": "ダ", "障": "障", "AW": "AW"}.get(surf or "", surf or "")


def _cell(row, key):
    v = row.get(key)
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def coerce_record(row, issues):
    """台账/字符串行 → 类型化记录；非法/缺关键字段记入 issues 并返回 None。"""
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

    prize = parse_int(_cell(row, "賞金"))
    prize = prize if prize is not None else ""
    odds = parse_float(_cell(row, "単勝"))
    odds = odds if odds is not None else ""
    dist = parse_int(_cell(row, "距離"))
    if dist is None and _cell(row, "距離"):
        issues.append({"type": "距離非数字", "馬名": name, "日付": date_norm, "距離": _cell(row, "距離")})

    venue = _cell(row, "場名")
    vt = venue_type(venue)
    if vt == "未知":
        issues.append({"type": "未知場名", "馬名": name, "日付": date_norm, "場名": venue})

    seirei = _cell(row, "性齢")
    sex_m = re.match(r"([牡牝セ])", seirei)
    sex = sex_m.group(1) if sex_m else ""
    age_m = re.search(r"(\d+)", seirei)
    age = age_m.group(1) if age_m else ""
    return {
        "日付": date_norm,
        "場名": venue,
        "R": _cell(row, "R"),
        "レース名": _cell(row, "レース名") or _cell(row, "競走名"),
        "格": _cell(row, "格"),
        "条件": _cell(row, "条件"),
        "距離": dist if dist is not None else _cell(row, "距離"),
        "芝ダ": _normalize_surface(_cell(row, "芝ダ") or _cell(row, "馬場")),
        "馬場": _cell(row, "馬場"),
        "天候": _cell(row, "天候"),
        "出走馬名": name,
        "騎手": _cell(row, "騎手"),
        "性": sex,
        "年齢": age,
        "斤量": _cell(row, "斤量"),
        "頭数": parse_int(_cell(row, "頭数")),
        "人気": parse_int(_cell(row, "人気")),
        "単勝": odds,
        "結果": result if result is not None else dnf,
        "タイム": _cell(row, "タイム"),
        "上り": _cell(row, "上り"),
        "着差": _cell(row, "着差"),
        "通過": _cell(row, "通過"),
        "ペース": _cell(row, "ペース"),
        "馬体重": parse_int(_cell(row, "馬体重")),
        "増減": _cell(row, "増減"),
        "賞金": prize,
        "Rt": parse_int(_cell(row, "Rt")),
        "調教師": _cell(row, "調教師") or _cell(row, "管理調教師"),
        "venue_type": vt,
        "來源": _cell(row, "來源"),
    }


# ── 格推导：レース名 → (格, 条件) ──
# 障害重賞 netkeiba 记法为 (JG1)/(JG2)/(JG3)（阿拉伯），统一归一为 JGI/JGII/JGIII。
_GRADE_PATTERN = r"J?G(?:[I]{1,3}|[123])|Jpn[I]{1,3}"
GRADE_SUFFIX_RE = re.compile(rf"\(({_GRADE_PATTERN}|L|OP)\)\s*$")
_GRADE_ROMAN = {"G1": "GI", "G2": "GII", "G3": "GIII",
                "JG1": "JGI", "JG2": "JGII", "JG3": "JGIII"}
COND_SUFFIX_RE = re.compile(r"\((1勝クラス|2勝クラス|3勝クラス|OP)\)")
PLAIN_COND_RE = re.compile(r"(?:\d+歳(?:以上)?)?(?:新馬|未勝利|メイクデビュー|\d*勝クラス)")
COND_NAR_RE = re.compile(r"(C\d|\d+歳\s*[A-Z]|\d+歳ー?\d+)")

# 全角数字/括号 → 半角（netkeiba SP 正文用全角，统一折叠后匹配）
_FULLWIDTH = str.maketrans("０１２３４５６７８９（）", "0123456789()")


def _fold_fullwidth(s):
    return (s or "").translate(_FULLWIDTH)


def _norm_grade(g):
    """格归一：JG1/JG2/JG3 → JGI/JGII/JGIII（下游集合统一用罗马记法）。"""
    return _GRADE_ROMAN.get(g, g)


def race_meta_from_name(name):
    """レース名 → (格, 条件)。格 = 规范后缀（GI/GII/GIII/JpnI/JpnII/JpnIII/L/OP，含障害 JGI~JGIII）。
    例: '札幌2歳S(GIII)'→('GIII',''); '摩周湖特別(2勝クラス)'→('','2勝クラス');
        '野路菊S(OP)'→('OP',''); '2歳新馬'→('','2歳新馬'); '3歳A　4'→('','3歳A')。"""
    name = _fold_fullwidth((name or "").strip())
    m = GRADE_SUFFIX_RE.search(name)
    grade = _norm_grade(m.group(1)) if m else ""
    cond = ""
    cm = COND_SUFFIX_RE.search(name)
    if cm:
        cond = "オープン" if cm.group(1) == "OP" else cm.group(1)
    elif not grade:  # 重赏后缀优先；无后缀才尝试条件关键词
        pm = PLAIN_COND_RE.search(name)
        if pm:
            cond = "新馬" if pm.group(0) == "メイクデビュー" else pm.group(0)
        else:
            nm = COND_NAR_RE.search(name)
            if nm:
                cond = nm.group(1).replace("ー", "-")
    return grade, cond


# ── 格：Icon_GradeType 图标类号 → 格（netkeiba CSS :before 文本，HTML 只有类号）──
# JRA 与 NAR 映射范围不同（NAR 只取 Jpn1-3 与 G1-3），故拆成两个独立函数。
# JRA：重赏级图标 + 特别班赛的 クラス 图标（1勝/2勝/3勝クラス，含旧 500/900/1000/1600万下）。
_JRA_ICON_GRADE = {
    1: "GI", 2: "GII", 3: "GIII", 5: "OP", 10: "JGI", 11: "JGII", 12: "JGIII", 15: "L",
    6: "3勝クラス", 7: "2勝クラス", 8: "2勝クラス", 9: "1勝クラス",
    13: "3勝クラス", 16: "3勝クラス", 17: "2勝クラス", 18: "1勝クラス",
}
_NAR_ICON_GRADE = {
    1: "GI", 2: "GII", 3: "GIII", 19: "JpnI", 20: "JpnII", 21: "JpnIII",
}


def grade_from_icon_jra(icon_num):
    """中央(JRA)比赛：图标类号 → 格（GI/GII/GIII/OP/L/JGI/JGII/JGIII）；不识别返回空串。"""
    try:
        return _JRA_ICON_GRADE.get(int(icon_num), "")
    except (TypeError, ValueError):
        return ""


def grade_from_icon_nar(icon_num):
    """地方(NAR)比赛：只映射 G1-3 与 Jpn1-3；其余（重賞/OP/L/JG*）不映射，返回空串。"""
    try:
        return _NAR_ICON_GRADE.get(int(icon_num), "")
    except (TypeError, ValueError):
        return ""


def grade_from_icon(icon_num, venue_type):
    """按场地分发：地方走 NAR，其余走 JRA。"""
    if venue_type == "地方":
        return grade_from_icon_nar(icon_num)
    return grade_from_icon_jra(icon_num)


# ── 条件：RaceData02 → 条件串 ──
# 终止于 性别/括号/重量/頭数/本賞金；セン 作为整体匹配（避免误切 オープン 的 ン）
_COND_END = re.compile(r"牡|牝|セン|[（(【\[/]|定量|別定|馬齢|ハンデ|交換|\d+頭|本賞金")


def cond_from_racedata02(text):
    """从 RaceData02 提取条件串：省略 サラ系，去性别/重量/頭数，全角转半角，无空格。
    例：'サラ系３歳以上 １勝クラス 牝[指] 定量 8頭' → '3歳以上1勝クラス'。"""
    s = text or ""
    i = s.find("サラ系")
    if i < 0:
        return ""
    tail = s[i + 3:]            # 去掉 サラ系
    m = _COND_END.search(tail)
    if m:
        tail = tail[:m.start()]
    return re.sub(r"[ 　]", "", tail).translate(_FULLWIDTH)


def _class_token(name):
    """从比赛名提取班赛クラス token（1勝クラス/2勝クラス/3勝クラス/新馬/未勝利/オープン），
    重赏后缀存在时返回空（由图标映射处理）。"""
    name = _fold_fullwidth((name or "").strip())
    if GRADE_SUFFIX_RE.search(name):
        return ""
    cm = COND_SUFFIX_RE.search(name)
    if cm:
        return "オープン" if cm.group(1) == "OP" else cm.group(1)
    for kw in ("3勝クラス", "2勝クラス", "1勝クラス"):
        if kw in name:
            return kw
    if "メイクデビュー" in name or "新馬" in name:
        return "新馬"
    if "未勝利" in name:
        return "未勝利"
    if "オープン" in name or "(OP)" in name or "(L)" in name:
        return "オープン"
    return ""


def race_grade_resolve(icon_num, name, venue_type):
    """格：优先图标映射（重赏/特别班赛），无图标从名字提取班赛クラス。"""
    g = grade_from_icon(icon_num, venue_type)
    if g:
        return g
    return _class_token(name)



# ── 馬名匹配键 ──
_COUNTRY_SUFFIX_RE = re.compile(
    r"\((?:(?:JPN|USA|GB|IRE|NZ|FR|AU|AUS|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK))\)$")


def name_key(s):
    """馬名匹配键：去国家后缀（链式）+ 去空白，两侧统一后比较。"""
    s = (s or "").strip()
    prev = None
    while prev != s:
        prev = s
        s = _COUNTRY_SUFFIX_RE.sub("", s).strip()
    return s.replace(" ", "").replace("　", "")


# netkeiba 着順 DNF：成绩页用单字（中/取/除/失），台账/详情用全称（中止/取消/除外/失格）
DNF_ABBR = {"中止": "中止", "取消": "取消", "除外": "除外", "失格": "失格",
            "中": "中止", "取": "取消", "除": "除外", "失": "失格"}


def normalize_result(v):
    """着順文本 → int 或 DNF 字符串（兼容单字/全称）。兼容已规范化的 int。"""
    if isinstance(v, int):
        return v
    v = (v or "").strip()
    if v in DNF_ABBR:
        return DNF_ABBR[v]
    try:
        return int(v)
    except (ValueError, TypeError):
        return v


# ── 収得賞金 ──
# 収得 = Σ(結果∈{1,2} ∧ venue_type=中央)，平地/障害同表；海外/地方不计入（地方 Jpn 见 compute_shutoku_jpn）。
# 非重赏 1着 固定额（万円）：
SHUTOKU_FIXED = {
    "新馬": 400, "未勝利": 400, "1勝": 500,
    "2勝": 600, "オープン": 600, "3勝": 900,
}
SHUTOKU_GRADE_WIN = 0.50   # 重賞 1着 = 该马1着本賞金×50%
SHUTOKU_GRADE_2ND = 0.50   # 重賞 2着 = 该马2着本賞金×50%（对着順本賞金各算半額）
SHUTOKU_2YO_G3_WIN = 16000000  # 2歳重賞 GⅢ 1着 固定（非本賞金×50%）
SHUTOKU_2YO_G3_2ND = 6000000   # 2歳重賞 GⅢ 2着 固定
HALVE_2YO = False          # 2歳赛季収得 → 3歳后折半：默认关
_SHUTOKU_GRADE_HALF = {"GI", "GII", "JGI", "JGII", "JpnI", "JpnII"}  # 2歳重賞 按本賞金×50%（其余 2歳重賞=GⅢ 用固定额）
_JPN_GRADES = {"JpnI", "JpnII", "JpnIII"}                             # 地方重賞（ダートグレード）収得专用

_SHUTOKU_GRADES = {"GI", "GII", "GIII", "JGI", "JGII", "JGIII", "JpnI", "JpnII", "JpnIII"}
_SHUTOKU_GRADE_RE = re.compile(rf"\(({_GRADE_PATTERN})\)")


def race_shutoku_class(rec):
    """记录/レース名 → 収得クラス键（重賞 / 新馬 / 未勝利 / 1勝 / 2勝 / 3勝 / オープン / 条件）。
    重赏优先用规范化的 `格` 字段，回退レース名括号；条件クラス从レース名解析
    （メイクデビュー = 新馬别称）。非重赏 1着 固定额见 SHUTOKU_FIXED。"""
    if isinstance(rec, str):
        name, grade, cond = rec, "", ""
    else:
        name = rec.get("レース名") or rec.get("競走名") or ""
        grade = rec.get("格") or ""
        cond = rec.get("条件") or ""
    if grade in _SHUTOKU_GRADES or _SHUTOKU_GRADE_RE.search(name):
        return "重賞"
    for src in (cond, name):
        if not src:
            continue
        src = _fold_fullwidth(src)
        if "メイクデビュー" in src or "新馬" in src:
            return "新馬"
        if "未勝利" in src:
            return "未勝利"
        if "1勝" in src:
            return "1勝"
        if "2勝" in src:
            return "2勝"
        if "3勝" in src:
            return "3勝"
        if "OP" in src or "(OP)" in src or "(L)" in src or "オープン" in src:
            return "オープン"
    return "条件"


def _age_at_race(date, birth_year):
    """JRA 馬齢 = 比赛年份 - 生年（统一 1月1日 加龄，无生日调整）。返回 int 或 None。"""
    try:
        y = int(str(date or "")[:4])
        by = int(birth_year or 0)
    except (ValueError, TypeError):
        return None
    return y - by if y and by else None


def race_grade(r):
    """记录 → 具体重赏格（GI/GII/GIII/JGI…）；`格` 字段优先，回退レース名括号；非重赏返回空串。"""
    if isinstance(r, str):
        m = _SHUTOKU_GRADE_RE.search(r)
        return _norm_grade(m.group(1)) if m else ""
    grade = r.get("格") or ""
    if grade in _SHUTOKU_GRADES:
        return grade
    m = _SHUTOKU_GRADE_RE.search(r.get("レース名") or r.get("競走名") or "")
    return _norm_grade(m.group(1)) if m else ""


def compute_shutoku(recs, birth_year=None):
    """逐场记录列表 → 収得賞金 {平地, 障害, 缺失}（円）。仅中央；重赏按 JRA 表：
    - 3歳以上 重賞（含 2歳 GⅠ/GⅡ）：1/2着 = 该马着順本賞金×50%
    - 2歳 重賞 GⅢ：1着=1600万 / 2着=600万 固定（非本賞金×50%）
    非重赏 1着 按固定额表；2着 仅重赏算。重赏 1/2着 缺本賞金 → 按 0 计并记入 '缺失'。"""
    flat = sho = 0
    missing = []
    for r in recs:
        if r.get("venue_type") != "中央":
            continue
        result = r.get("結果")
        if result not in (1, 2):
            continue
        cls = race_shutoku_class(r)
        if cls == "重賞":
            honsho = r.get("本賞金") or 0
            if not honsho:
                missing.append((r.get("日付"), r.get("競走名") or r.get("レース名"), result))
                continue  # 本賞金缺失 → 该场按 0 暂计
            age = _age_at_race(r.get("日付"), birth_year)
            if age == 2 and race_grade(r) not in _SHUTOKU_GRADE_HALF:
                v = SHUTOKU_2YO_G3_WIN if result == 1 else SHUTOKU_2YO_G3_2ND  # 2歳 GⅢ 固定
            else:
                v = honsho * (SHUTOKU_GRADE_WIN if result == 1 else SHUTOKU_GRADE_2ND)
        elif result == 1 and cls in SHUTOKU_FIXED:
            v = SHUTOKU_FIXED[cls] * 10000
        else:
            v = 0
        if (r.get("芝ダ") or "") == "障":
            sho += v
        else:
            flat += v
    return {"平地": int(flat), "障害": int(sho), "缺失": missing}


def compute_shutoku_jpn(recs):
    """地方重賞 JpnI/JpnII/JpnIII 収得（与中央分开）。仅 Jpn 格 + 結果 1/2 着；
    本賞金 = 该马着順本賞金（地方ダートグレード）。规则（万円）：
    - 1着：本賞金 ≥1200 → ×50%；400 ≤ x < 1200 → 400万；x < 400 → 全额
    - 2着：本賞金 ≥480 → ×50%；160 ≤ x < 480 → 160万；x < 160 → 全额
    返回 {'Jpn': 円, '缺失': [...]}。"""
    jpn = 0
    missing = []
    for r in recs:
        if race_grade(r) not in _JPN_GRADES:
            continue
        result = r.get("結果")
        if result not in (1, 2):
            continue
        honsho = r.get("本賞金") or 0
        if not honsho:
            missing.append((r.get("日付"), r.get("競走名") or r.get("レース名"), result))
            continue  # 本賞金缺失 → 该场按 0 暂计
        man = honsho // 10000
        if result == 1:
            v = honsho * 0.5 if man >= 1200 else (4000000 if man >= 400 else honsho)
        else:
            v = honsho * 0.5 if man >= 480 else (1600000 if man >= 160 else honsho)
        jpn += v
    return {"Jpn": int(jpn), "缺失": missing}
