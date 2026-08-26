#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹·比赛域公共逻辑（与数据源无关）。

契约B 定义见 docs/data-contracts.md：
- coerce_record(): 字符串行 → 契约B 类型化记录（非法值记入 issues；W3/D3 字段规范）
- venue_type() / race_meta_from_name(): 场地/格 推导（领域知识，不依赖任何源）
- compute_stats() / derive_basic() / compute_age(): 汇总统计（W2/D2 主口径 中央+地方）/ 建档推导
- compute_shutoku() / compute_honsho_prize(): 収得賞金 规则
- strip_country_suffix() / is_unnamed_name(): 身份归一化

适配器（scripts/adapters/*）与本模块解耦：适配器只做"源格式 → 契约字段名 + 字符串值"，
类型规范化、值域校验、推导一律走本模块，保证任何数据源进入同一套逻辑。
"""
import re
import unicodedata

JRA_VENUES = {"札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"}
NAR_VENUES = {"門別", "帯広", "盛岡", "水沢", "金沢", "笠松", "名古屋", "園田", "姫路",
              "高知", "佐賀", "大井", "船橋", "川崎", "浦和", "荒尾"}
OVERSEAS_VENUES = {"ウッドバイン", "デルマー", "フォートエリー", "ドバイ", "メイダン",
                   "シャティン", "ロンシャン", "サンタアニタ", "チャーチルダウンズ",
                   "アケダクト", "ベルモントパーク", "サラトガ", "キーンランド"}

RESULT_DNF = {"中止", "取消", "除外", "失格"}
# 格（W3/D3，从 netkeiba レース名推导）：GRADE_ORDER 为规范顺序（含 Jpn*/OP）；
# GRADES = 重赏/重赏级（含障害 JG*，用于 重賞出走/has_graded_win，OP 不算重赏）。
GRADE_ORDER = ["GI", "JpnI", "GII", "JpnII", "GIII", "JpnIII", "L", "OP"]
GRADES = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII", "L", "JGI", "JGII", "JGIII"}
ALL_GRADES = GRADE_ORDER + ["JGI", "JGII", "JGIII"]

DATE_RE = re.compile(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$")

# 占位名（未命名仔）：netkeiba `〇〇の2025` / JBIS `母名＿2025`（见 docs/PROJECT.md §5.2）
UNNAMED_RE = re.compile(r"の(19|20)\d{2}$")


def is_unnamed_name(name):
    """占位名判定：占位名不能作为身份匹配依据，必须走 nk_id。"""
    name = name or ""
    return bool(UNNAMED_RE.search(name)) or ("＿" in name)


# 国家后缀（JBIS 登记名等，W1/D1）：`Grand Warrior(JPN)` 与 `Grand Warrior` 是同一匹马。
# 身份键归一化时去除，统一「去国家后缀 + 括号/空白」后的马名。
_COUNTRY_SUFFIX_RE = re.compile(
    r"\((?:(?:JPN|USA|GB|IRE|NZ|FR|AU|AUS|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK))\)$")


def strip_country_suffix(name):
    """去国家后缀 `(JPN)/(USA)/(GB)/(IRE)/(NZ)/(FR)/(AU)…`（链式，可多后缀）。
    仅去除末尾的国家代码括号后缀，不影响其它括号内容：`Grand Warrior(JPN)` → `Grand Warrior`。"""
    name = (name or "").strip()
    prev = None
    while prev != name:
        prev = name
        name = _COUNTRY_SUFFIX_RE.sub("", name).strip()
    return name


# 生年月日：netkeiba `2025年3月10日` / JBIS `2025.03.10` 等
BIRTH_RE = re.compile(r"(\d{4})[年./\-](\d{1,2})[月./\-](\d{1,2})日?")


def birth_date_key(h):
    """马匹出生排序键：生年月日 → (年, 月, 日) 可比较元组（升序=从小到大）。
    生年月日缺失（如台账建档马）→ 退回生年 → (年, 0, 0)；两者都无 → (0, 0, 0)。
    用于 registry id 分配与 basic.json 输出排序，保证 id 顺序 = 出生日期顺序。"""
    bd = h.get("生年月日") or ""
    m = BIRTH_RE.search(str(bd))
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    y = str(h.get("生年") or "").strip()
    if y.isdigit():
        return (int(y), 0, 0)
    return (0, 0, 0)

# 契约B 字段清单（适配器必须提供；值可为字符串，由 coerce_record 类型化）
# W3/D3 最终清单：`日付, 場名, R, レース名, 格, 距離, 芝ダ, 馬場, 天候, 出走馬名, 騎手, 性,
# 年齢, 斤量, 頭数, 人気, 単勝, 結果, タイム, 上り, 着差, 通過, ペース, 馬体重, 増減, 賞金,
# Rt, 調教師, venue_type, 來源`（race_class/条件/性齢/管理調教師/母父名 已舍弃）
CONTRACT_FIELDS = [
    "日付", "場名", "R", "レース名", "格", "距離", "芝ダ", "馬場", "天候",
    "出走馬名", "騎手", "性", "年齢", "斤量", "頭数", "人気", "単勝", "結果",
    "タイム", "上り", "着差", "通過", "ペース", "馬体重", "増減", "賞金", "Rt",
    "調教師", "venue_type", "來源",
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


def _normalize_surface(surf):
    """芝ダ 归一化（W3/D3）：netkeiba 距离列 芝/ダ/障；台账 芝/ダート/AW → 芝/ダ/AW；障害→障。"""
    return {"ダート": "ダ", "障害": "障", "芝": "芝", "ダ": "ダ", "障": "障", "AW": "AW"}.get(surf or "", surf or "")


def _cell(row, key):
    v = row.get(key)
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def coerce_record(row, issues):
    """契约B：字符串行 → 类型化记录；非法/缺关键字段记入 issues 并返回 None（W3/D3 字段规范）"""
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

    # W3/D3：赏金/単勝 缺失 → 空字符串（非 0）；斤量 保持字符串
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

    # W3：性/年齢 分离。台账源自带 性齢（如「牡2」）→ 性=首字、年齢=数字（JRA 馬齢表记，实岁）；
    # 已建档马的 年齢 由 build-data 按生年月日实时重算（更精确），此处为台账兜底。
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
        "距離": dist if dist is not None else _cell(row, "距離"),
        "芝ダ": _normalize_surface(_cell(row, "芝ダ") or _cell(row, "馬場")),
        "馬場": _cell(row, "馬場"),  # W3 新列：马场=状态（良/稍重/重...）
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


# netkeiba レース名 → 格/条件（适配器用；W3/D3 含 Jpn*/OP，不再生成 race_class）
GRADE_SUFFIX_RE = re.compile(r"\((J?G[I]{1,3}|Jpn[I]{1,3}|L|OP)\)\s*$")
COND_SUFFIX_RE = re.compile(r"\((1勝クラス|2勝クラス|3勝クラス|OP)\)")
PLAIN_COND_RE = re.compile(r"\d+歳(?:以上)?(?:新馬|未勝利|\d*勝クラス)")
COND_NAR_RE = re.compile(r"(C\d|\d+歳\s*[A-Z]|\d+歳ー?\d+)")


def race_meta_from_name(name):
    """netkeiba レース名 → (格, 条件)。格 = 规范后缀（GI/GII/GIII/JpnI/JpnII/JpnIII/L/OP，含障害 JG*）；
    条件 仅作信息保留（不再生成 race_class）。
    例: '札幌2歳S(GIII)'→('GIII',''); '摩周湖特別(2勝クラス)'→('','2勝クラス');
        '野路菊S(OP)'→('OP',''); '2歳新馬'→('','2歳新馬'); '3歳A　4'→('','3歳A')。"""
    name = (name or "").strip()
    m = GRADE_SUFFIX_RE.search(name)
    grade = m.group(1) if m else ""
    cond = ""
    cm = COND_SUFFIX_RE.search(name)
    if cm:
        cond = "オープン" if cm.group(1) == "OP" else cm.group(1)
    elif not grade:  # 重赏后缀优先；无后缀才尝试条件关键词
        pm = PLAIN_COND_RE.search(name)
        if pm:
            cond = pm.group(0)
        else:
            nm = COND_NAR_RE.search(name)
            if nm:
                cond = nm.group(1).replace("ー", "-")
    return grade, cond


def compute_honsho_prize(rec):
    """从 4着/5着 赏金反推本賞金（M2.4 回退，db 域 4/5着 无付加賞）。
    5着 = 本賞金×10%，4着 = 本賞金×15%（JRA 比率）。返回 1着 本賞金（円）或 0。"""
    for k in (5, 4):
        ratio = 0.10 if k == 5 else 0.15
        for r in rec:
            if r.get("結果") == k and r.get("賞金"):
                return int(r["賞金"] / ratio)
    return 0


DNF_ABBR = {"中止": "中止", "取消": "取消", "除外": "除外", "失格": "失格"}


def normalize_result(v):
    """netkeiba 着順文本 → int 或 DNF 字符串（契约B 结果字段）。
    兼容已规范化的 int（parse_races 已转 int）；字符串 '1'→1、'中止'/'取消'/'除外'/'失格'→ DNF。"""
    if isinstance(v, int):
        return v
    v = (v or "").strip()
    if v in DNF_ABBR:
        return DNF_ABBR[v]
    try:
        return int(v)
    except (ValueError, TypeError):
        return v


def compute_stats(recs):
    """从契约B 逐场履历计算汇总 stats（W2/D2：主口径只计 中央+地方，与 netkeiba 通算对齐；
    海外场只在 場地別 等展示分面保留，供 venue 标签筛选展示）"""
    # 主口径 = 中央 + 地方
    main = [r for r in recs if r.get("venue_type") in ("中央", "地方")]
    started = [r for r in main if isinstance(r["結果"], int) or r["結果"] == "中止"]
    finished = [r for r in started if isinstance(r["結果"], int)]
    n = len(started)
    w = sum(1 for r in finished if r["結果"] == 1)
    p2 = sum(1 for r in finished if r["結果"] == 2)
    p3 = sum(1 for r in finished if r["結果"] == 3)
    prize = sum(r["賞金"] or 0 for r in main)

    def rate(x, base):
        return f"{x / base:.3f}" if base else "0.000"

    # 展示分面保留全量（含海外，供场地筛选展示）；W3：芝ダ=芝/ダ/障，馬場=状态
    dist, surf, cond, venue_s = {}, {}, {}, {}
    for r in recs:
        key_d = f"{r['芝ダ'] or '?'}{r['距離']}"
        key_s = r["芝ダ"] or "?"
        key_c = r["馬場"] or "?"
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

    # 重賞统计同主口径（中央+地方，KPI 一致；海外重赏在履历表保留 + venue 标签）
    graded = [r for r in main if r["格"] in GRADES]
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
        "重賞": [{"日付": r["日付"], "レース名": r["レース名"], "格": r["格"], "結果": r["結果"]} for r in graded],
        "距離別": dist,
        "馬場別": surf,
        "状態別": cond,
        "場地別": venue_s,
        "初出走": min(dates) if dates else "",
        "最終出走": max(dates) if dates else "",
    }


def derive_basic(recs):
    """从 性/年齢（回退 性齢）推导 性別（取最近一场，兼容被阉割）、生年（年齢=馬齢 → 生年 = 比赛年 - 年齢）"""
    latest = max(recs, key=lambda r: r["日付"])
    m = re.match(r"([牡牝セ])", _cell(latest, "性") or _cell(latest, "性齢"))
    sex = m.group(1) if m else ""
    births = set()
    for r in recs:
        m2 = re.search(r"(\d+)", _cell(r, "年齢") or _cell(r, "性齢"))
        if m2:
            births.add(int(r["日付"][:4]) - int(m2.group(1)))
    birth = ""
    if births:
        birth = str(min(births)) if len(births) == 1 else str(max(births))
    return sex, birth


def compute_age(race_date, birth_ymd):
    """马在 race_date（YYYY-MM-DD）当天的 年齢（周岁，未满 1 岁 = 0；与 JRA 表记一致）。
    无生年月日 → 空字符串。"""
    if not race_date or not birth_ymd:
        return ""
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", str(race_date))
    bm = re.match(r"(\d{4})[年\-\./]?(\d{1,2})[月\-\./]?(\d{1,2})", str(birth_ymd))
    if not m or not bm:
        return ""
    rd = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    bd = (int(bm.group(1)), int(bm.group(2)), int(bm.group(3)))
    age = rd[0] - bd[0]
    if (rd[1], rd[2]) < (bd[1], bd[2]):
        age -= 1
    return str(max(0, age))


# ── 収得賞金（M4，规则见 docs/PROJECT.md §5.3）──
# 収得 = Σ(結果∈{1,2} ∧ venue_type=中央)，平地/障害同表；海外/地方不计入；付加賞不计入。
# 规则来源：13 匹 JRA 真值拟合（2026-08-18，11 精确 + 2 达 98%），详见设计文档 §4.1 拟合验证记录。
SHUTOKU_FIXED = {          # 1着 固定额（万円）
    "新馬": 400, "未勝利": 400, "1勝": 500,
    "2勝": 600, "オープン": 600, "3勝": 900,
}
SHUTOKU_GRADE_WIN = 0.50   # 重賞 1着 = 该马1着本賞金×50%
SHUTOKU_GRADE_2ND = 0.50   # 重賞 2着 = 该马2着本賞金×50%（JRA：对着順本賞金各算半額，见 docs/PROJECT.md §5.3）
SHUTOKU_2YO_G3_WIN = 16000000  # 2歳重賞 GⅢ 1着 固定（JRA，非本賞金×50%）
SHUTOKU_2YO_G3_2ND = 6000000   # 2歳重賞 GⅢ 2着 固定
HALVE_2YO = False          # 2歳赛季収得 → 3歳后折半：默认关（2016 番組改正疑似废止，13 匹拟合均未要求）
_SHUTOKU_GRADE_HALF = {"GI", "GII", "JGI", "JGII", "JpnI", "JpnII"}  # 2歳重賞 按本賞金×50%（其余 2歳重賞=GⅢ 用固定额）
_JPN_GRADES = {"JpnI", "JpnII", "JpnIII"}                             # 地方重賞（ダートグレード）収得专用

# 重赏标记（含障害 JG*）：契约B `格` 字段 or レース名括号后缀
_SHUTOKU_GRADES = {"GI", "GII", "GIII", "JGI", "JGII", "JGIII", "JpnI", "JpnII", "JpnIII"}
_SHUTOKU_GRADE_RE = re.compile(r"\((J?G[I]{1,3}|Jpn[I]{1,3})\)")


def race_shutoku_class(rec):
    """记录/レース名 → 収得クラス键（重賞 / 新馬 / 未勝利 / 1勝 / 2勝 / 3勝 / オープン / 条件）。
    重赏优先用契约B 规范化的 `格` 字段，回退レース名括号；条件クラス从レース名解析
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
        if "新馬" in src:
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
    """记录 → 具体重赏格（GⅠ/GⅡ/GⅢ/JGI…）；契约B `格` 优先，回退レース名括号；非重赏返回空串。"""
    if isinstance(r, str):
        m = _SHUTOKU_GRADE_RE.search(r)
        return m.group(1) if m else ""
    grade = r.get("格") or ""
    if grade in _SHUTOKU_GRADES:
        return grade
    m = _SHUTOKU_GRADE_RE.search(r.get("レース名") or r.get("競走名") or "")
    return m.group(1) if m else ""


def compute_shutoku(recs, birth_year=None):
    """契约B 记录列表 → 収得賞金 {平地, 障害}（円）。仅中央；重赏按 JRA 表：
    - 3歳以上 重賞（含 2歳 GⅠ/GⅡ）：1/2着 = 该马着順本賞金×50%
    - 2歳 重賞 GⅢ：1着=1600万 / 2着=600万 固定（非本賞金×50%）
    非重赏 1着 按固定额表；2着 仅重赏算。重赏 1/2着 缺本賞金 → 按 0 计并记入 '缺失' 报告。"""
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
                continue  # 本賞金缺失 → 该场按 0 暂计（収得缺失报告）
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
    """地方重賞 JpnI/JpnII/JpnIII 収得（JRA 表，2026-08-26 用户定案；与中央 compute_shutoku 分开）。
    仅 Jpn 格 + 結果 1/2 着；本賞金 = 该马着順本賞金（地方ダートグレード）。规则（万円）：
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
            continue  # 本賞金缺失 → 该场按 0 暂计（収得缺失报告）
        man = honsho // 10000
        if result == 1:
            v = honsho * 0.5 if man >= 1200 else (4000000 if man >= 400 else honsho)
        else:
            v = honsho * 0.5 if man >= 480 else (1600000 if man >= 160 else honsho)
        jpn += v
    return {"Jpn": int(jpn), "缺失": missing}
