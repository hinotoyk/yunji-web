#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计总览数据预计算：读 data/basic.json + data/races/*.json → data/stats.json

口径约定与产物字段契约见 data/SCHEMA.md（6a 搬家）。
"""
import datetime
import io
import json
import re
import sys
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

# 重赏判定（同 races.html「重赏」筛选 / timeline.py GRADED 口径；L/OP 不计入）
TROPHY_GRADES = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII"}
DIM_KEYS = ["surf", "dist", "cond", "turn", "grade", "ninki", "sex", "track", "trainer", "jockey", "mps",
            "weight_m", "weight_f", "breeder", "owner"]   # 后四为 2026-09 增补：体重按性别拆两维（m=牡含セン / f=牝，当日馬体重档）；breeder/owner=basic 现值
VENUE_KEYS = ["中央", "地方", "海外"]


def norm_prize(v):
    """該马该场 賞金 → 円 int；空/非数 → 0（同 build_datechart.py）。"""
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


def dist_bucket(d):
    """距离四档（同 races.html distBucket）。"""
    try:
        d = int(d)
    except (TypeError, ValueError):
        return ""
    if d <= 1400:
        return "短距离"
    if d <= 1800:
        return "英里"
    if d <= 2400:
        return "中距离"
    return "长距离"


def turn_key(course):
    c = str(course or "")
    if c.startswith("右"):
        return "右"
    if c.startswith("左"):
        return "左"
    return ""


def ninki_key(n):
    """人气逐一（1-18，同 races.html ninkiBucket）；空/非数/越界不入桶。"""
    if n is None or n == "":
        return ""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    return str(n) if 1 <= n <= 18 else ""


def grade_key(g):
    """比赛级别细分：桶键即中文标签（同 stats.html TAB_ORDER.grade 展示序）。"""
    g = str(g or "").strip()
    if g == "新馬":
        return "新马"
    if g == "未勝利":
        return "未胜利"
    if g == "1勝クラス":
        return "一胜级"
    if g == "2勝クラス":
        return "二胜级"
    if g == "3勝クラス":
        return "三胜级"
    if g == "GI":
        return "G1"
    if g == "GII":
        return "G2"
    if g == "GIII":
        return "G3"
    if g == "JpnI":
        return "Jpn1"
    if g == "JpnII":
        return "Jpn2"
    if g == "JpnIII":
        return "Jpn3"
    if g in ("L", "OP"):
        return g                      # L / OP 拆开（同 races.html grade:L / grade:OP）
    return "其他"


def sex_key(s):
    s = str(s or "").strip()
    return "セン" if s == "セ" else s


# 产驹分布（马属性，全库口径，不进场地/年份切面）：体重 400-550 每 10kg 一档 + <400 / >550（550 归 540-550）
WEIGHT_LO, WEIGHT_HI = 400, 550
WEIGHT_BINS = ["<400"] + [f"{lo}-{lo + 10}" for lo in range(WEIGHT_LO, WEIGHT_HI, 10)] + [">550"]


def weight_bin(w):
    """馬体重 → 档位键；空/非数不入桶（档位标签即展示文案）。"""
    if isinstance(w, bool):
        return ""
    try:
        w = int(w)
    except (TypeError, ValueError):
        return ""
    if w < WEIGHT_LO:
        return "<400"
    if w > WEIGHT_HI:
        return ">550"
    lo = (w // 10) * 10
    if lo >= WEIGHT_HI:
        lo = WEIGHT_HI - 10
    return f"{lo}-{lo + 10}"


_BIRTH_RE = re.compile(r"(\d{4})年(\d{1,2})月(\d{1,2})日")


def parse_birth(b):
    """"2023年2月5日" → (y, m, d)；解析失败 → None。"""
    m = _BIRTH_RE.match(str(b or "").strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def age_month(date_str, birth):
    """比赛日 − 生日（月）；日不足则 −1。"""
    y, m, d = birth
    try:
        dt = datetime.date.fromisoformat(str(date_str).strip())
    except ValueError:
        return None
    age = (dt.year - y) * 12 + (dt.month - m)
    if dt.day < d:
        age -= 1
    return age


class Bucket:
    """累计桶：n 全部记录 / dnf 未完赛(中止·失格) / exc 未出走(取消·除外) / w·p2·p3 着别。"""

    __slots__ = ("n", "dnf", "exc", "w", "p2", "p3")

    def __init__(self):
        self.n = self.dnf = self.exc = self.w = self.p2 = self.p3 = 0

    def add(self, res):
        self.n += 1
        if res == "中止" or res == "失格":
            self.dnf += 1
        elif res == "取消" or res == "除外":
            self.exc += 1
        elif res == 1:
            self.w += 1
        elif res == 2:
            self.p2 += 1
        elif res == 3:
            self.p3 += 1


def bucket_dict(b):
    return {"n": b.n, "dnf": b.dnf, "exc": b.exc, "w": b.w, "p2": b.p2, "p3": b.p3}


class Scope:
    """一个统计切面：base + 十五维分桶 + 月龄曲线 + 重赏明细（all / yYYYY / gYYYY 共用）。"""

    __slots__ = ("base", "prize", "dims", "curve", "trophies")

    def __init__(self):
        self.base = Bucket()
        self.prize = 0
        self.dims = {k: {} for k in DIM_KEYS}
        self.curve = {}
        self.trophies = []

    def feed(self, res, prize, dims, curve_key, trophy):
        """一条记录入切面；curve_key=(gen, 月龄桶) 或 None；trophy=明细 dict 或 None。"""
        self.base.add(res)
        self.prize += prize
        for k, v in dims.items():
            if v:
                self.dims[k].setdefault(v, Bucket()).add(res)
        if curve_key:
            self.curve.setdefault(curve_key, Bucket()).add(res)
        if trophy:
            self.trophies.append(trophy)

    def out(self):
        dims_out = {}
        for k in DIM_KEYS:
            rows = [{"k": key, **bucket_dict(b)} for key, b in self.dims[k].items()]
            rows.sort(key=lambda x: -x["n"])
            dims_out[k] = rows
        curve = [{"gen": g, "a": a, **bucket_dict(b)} for (g, a), b in self.curve.items()]
        curve.sort(key=lambda x: (x["gen"], x["a"]))
        return {"base": {"n": self.base.n, "dnf": self.base.dnf, "exc": self.base.exc,
                         "w": self.base.w, "p2": self.base.p2, "p3": self.base.p3,
                         "pr": self.prize},
                "dims": dims_out, "curve": curve,
                "trophies": sorted(self.trophies, key=lambda x: x["d"])}


def main():
    basic = json.loads((DATA / "basic.json").read_text(encoding="utf-8"))
    horses = basic.get("horses", [])
    by_id = {h.get("id"): h for h in horses}

    scopes = {vt: {"all": Scope()} for vt in VENUE_KEYS}
    stats = {"runs": 0, "finished": 0, "dnf": 0, "exc": 0, "horses": 0,
             "wins": 0, "trophy_wins": 0, "prize_total": 0}
    dates = []
    horses_seen = set()

    for h in horses:
        rf = h.get("races_file")
        if not rf:
            continue
        f = ROOT / rf
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except FileNotFoundError:
            continue
        arr = data if isinstance(data, list) else (data.get("races") or [])
        birth = parse_birth(h.get("生年月日"))
        gen = str(h.get("生年") or "").strip()
        gkey = "g" + gen if re.fullmatch(r"\d{4}", gen) else None   # 生产年切面
        sex = sex_key(h.get("性別_当前") or h.get("性別"))   # 当前性别（官方 性別 仅登录值）

        for r in arr:
            d = str(r.get("日付") or "")
            if not d:
                continue
            vt = str(r.get("venue_type") or "")
            if vt not in scopes:
                continue
            res = r.get("結果")
            prize = norm_prize(r.get("賞金"))
            ykey = None                                                 # 自然年切面
            ym = re.match(r"^(\d{4})", d)
            if ym:
                ykey = "y" + ym.group(1)

            # ── 全库 meta ──
            stats["runs"] += 1
            if isinstance(res, int) and not isinstance(res, bool):
                stats["finished"] += 1
            elif res in ("中止", "失格"):
                stats["dnf"] += 1
            elif res in ("取消", "除外"):
                stats["exc"] += 1
            if res == 1:
                stats["wins"] += 1
                if str(r.get("格") or "") in TROPHY_GRADES:
                    stats["trophy_wins"] += 1
            stats["prize_total"] += prize
            dates.append(d)
            horses_seen.add(h.get("id"))

            # ── 十五维分桶（切面共用同一份桶键；空值不入桶）──
            wb = weight_bin(r.get("馬体重"))   # 当日 馬体重 档（400-550 每 10kg 一档 + <400 / >550）
            dims = {
                "surf": str(r.get("芝ダ") or ""),
                "dist": dist_bucket(r.get("距離")),
                "cond": str(r.get("馬場") or ""),
                "turn": turn_key(r.get("コース")),
                "grade": grade_key(r.get("格")),
                "ninki": ninki_key(r.get("人気")),
                "sex": sex,
                "track": str(r.get("場名") or ""),
                "trainer": str(r.get("調教師") or ""),
                "jockey": str(r.get("騎手") or ""),
                "mps": str(h.get("母父") or ""),   # 母父 = 血统图「母亲的父亲」（basic.json 母父字段，merge_basic.py 从 pedigree.母[1][0] derive）
                # 体重按性别拆两维（2026-09 用户定稿：牡页签含セン；空体重/空性别不入桶）
                "weight_m": wb if sex in ("牡", "セン") else "",
                "weight_f": wb if sex == "牝" else "",
                "breeder": str(h.get("生産牧場") or "").strip(),   # 生产牧场（basic 现值，马属性）
                "owner": str(h.get("馬主") or "").strip(),         # 马主（basic 现值，马属性）
            }

            # ── 月龄曲线键（生产年 × 逐月） ──
            curve_key = None
            if gen and birth:
                am = age_month(d, birth)
                if am is not None:
                    curve_key = (gen, am)

            # ── 重赏一着明细 ──
            trophy = None
            if res == 1 and str(r.get("格") or "") in TROPHY_GRADES:
                trophy = {
                    "d": d, "id": h.get("id"),
                    "h": h.get("馬名") or r.get("出走馬名") or h.get("欧字馬名") or "",
                    "r": str(r.get("レース名") or ""), "g": str(r.get("格") or ""),
                    "v": str(r.get("場名") or ""),
                    "R": r.get("R") if r.get("R") not in (None, "") else "",
                    "jk": str(r.get("騎手") or ""), "tr": str(r.get("調教師") or ""),
                }

            # ── 入切面：all 必入；自然年/生产年按记录归属 ──
            targets = [scopes[vt]["all"]]
            if ykey:
                targets.append(scopes[vt].setdefault(ykey, Scope()))
            if gkey:
                targets.append(scopes[vt].setdefault(gkey, Scope()))
            for scp in targets:
                scp.feed(res, prize, dims, curve_key, trophy)

    stats["horses"] = len(horses_seen)
    stats["first_date"] = min(dates, default="")
    stats["last_date"] = max(dates, default="")

    by_venue = {vt: {"scopes": {key: scp.out() for key, scp in sorted(blocks.items())}}
                for vt, blocks in scopes.items()}

    payload = {
        "meta": {
            "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "source": "basic.json + races/*.json",
            "stats": stats,
        },
        "by_venue": by_venue,
    }
    out = DATA / "stats.json"

    # 内容无变化时跳过写入：generated_at 每次运行都不同，若照写会使 --ci 每轮都产生空 diff 提交
    def content_signature(d):
        m = dict(d.get("meta") or {})
        m.pop("generated_at", None)
        return json.dumps({"meta": m, "by_venue": d.get("by_venue")}, ensure_ascii=False, sort_keys=True)

    if out.exists():
        try:
            if content_signature(json.loads(out.read_text(encoding="utf-8"))) == content_signature(payload):
                print("统计总览数据预计算: 内容无变化，跳过写入")
                return
        except (json.JSONDecodeError, OSError):
            pass
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"统计总览数据预计算完成: {stats['runs']} 条记录 / 完赛 {stats['finished']} / "
          f"一着 {stats['wins']}（🏆 {stats['trophy_wins']}）/ 赏金 {stats['prize_total']:,} 円 "
          f"（{stats['first_date']} ~ {stats['last_date']}）→ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
