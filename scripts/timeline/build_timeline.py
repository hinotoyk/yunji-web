#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""时间线事件预计算：读 data/basic.json + data/races/*.json → data/timeline.json

规则（自 front/pages/timeline.html 旧 JS 引擎逐条移植，事件语义不变；2026-09-18 标签文案统一「首胜」措辞）：
  1.  级别首胜       —— OP/L/G3/G2/G1/Jpn1/Jpn2/Jpn3 每个级别的产驹史首胜，全局只出现一次
                        （2026-09 确认：级别首胜为全局口径，不再按马；标签「G2首胜」等）
  1b. 世代新马首胜 —— 每个世代（=生年/届）最早的新马战一着，一代只此一条（标签「XXXX年产新马首胜」）
  2.  重赏胜利       —— 所有重赏一着都记录；序数为产驹史全局口径（跨马按日期累计，2026-09 确认）：
                        「重赏首胜 / 重赏第N胜」+ 该级别「G2第N胜」（第1胜=级别首胜，不重复挂）+ 海外全局「海外重赏首胜 / 海外重赏第N胜」；
                        马内不再记同级别序数（G2首胜 等级别首胜仍按马）
  3.  世代重赏首胜   —— 每届产驹在 JRA 中央的首场重赏胜利，一代只此一条（标签「XXXX年产重赏首胜」）
  4.  父子制覇       —— 产驹赢下コントレイル（飞机云）赢过的重赏（常量内置，
                        レース名去格级括号尾缀后精确匹配）
  5.  受赏           —— basic.json 受賞歴（预留字段，兼容对象/字符串）
一场比赛 = 一条事件（绝不按标签拆行），该场触发的所有里程碑以标签并列；节点类别取
最高优先级标签（sire > gen > first > graded > award）。

事件按日期升序输出；同日按発走升序（缺失视为最大），同日同発走按着順降序
（= 前端倒序展示后：最新在顶、同日发走晚者在顶、同场 1着 在上未完走殿后，同 races.html 模块 33）。
前端 front/pages/timeline.html 只做渲染，不再实时计算。

═══ data/timeline.json 字段模板（产物，前端只读；人工节点编辑 data/timeline_manual.json）═══
{
  "meta": {
    "generated_at": "产物生成时间(ISO)，仅标识新鲜度；内容无变化时连文件都不重写",
    "source":       "数据来源说明",
    "stats": {
      "events":      总事件数（含人工节点），
      "horses":      覆盖产驹数（不含人工节点——它们不挂马），
      "graded_wins": 重赏一着事件数，
      "sire_wins":   父子制覇事件数
    }
  },
  "events": [   // 按日期升序；同日按発走升序（缺失视为最大）→ 前端倒序后同日发走晚者在顶；
                // 同日同発走（同场两产驹均触发）按着順降序（1着显示在上）；受赏/人工节点按発走缺失处理（同日置顶）
    {
      "date":  "YYYY-MM-DD —— 排序与年份分组依据（缺失排最后）",
      "type":  "race（比赛胜利）| award（受赏）| manual（人工节点）",
      "node":  "轴上圆点颜色类别：sire红 / gen橙 / first青绿 / graded深蓝 / award金 / manual灰；"
               "自动事件 = 本事件最高优先级标签的类别（sire>gen>first>graded>award），manual 固定 manual",
      "horse": { "id": 产驹id（profile 跳转用）, "name": 馬名, "cn": 〈港译/自译〉 },
               // race/award 才有；manual 无此键
      "photo": "图源 URL/路径：race.photo 优先 → 回退马照片；manual 可自带；空串=浅灰占位",
      "tags":  [ { "cat": "标签类别色（同 node 取值）", "label": "徽章文字", "tip": "可选：悬停提示",
                   "crown": true —— 可选：首胜标签（label 以「首胜」结尾）前端在右上角画斜置小皇冠 } ],

      // ── type=race 专属 ──
      "race": {
        "name":   "赛事名（含格级尾缀，如 テレビ東京杯青葉賞(GII)）",
        "grade":  "原始格（GII/JpnI/L/OP…，新马战为 新馬）",
        "glabel": "徽章显示字（G2/G3/L…，无徽章格为空）",
        "gbadge": "徽章 css 类（g1/g2/g3/gl/gop）",
        "meta":   "「東京11R · 芝2400m · 良」场地一行",
        "time":   "タイム（缺失=—）",
        "agari":  "上り（缺失=—）",
        "pop":    "人気（如 4番；缺失=—）",
        "team":   "「騎手 武豊 · 57kg ｜ 調教師 大久保龍志」单串（前端按 ｜ 拆为一人一行；缺失整行不渲染）"
      },

      // ── type=award 专属 ──
      "award": { "賞名": 奖项名, "cn": "可选中文名", "備考": "可选备注" },

      // ── type=manual 专属（来自 data/timeline_manual.json，重算永不覆盖，只参与排序）──
      "title":  "节点标题（必填）",
      "cn":     "可选：中文副题",
      "note":   "可选：一行补充说明",
      "link":   "可选：点击标题跳转的 URL",
      "manual": true
    }
  ]
}

用法:  python scripts/timeline/build_timeline.py
"""
import datetime
import json
import re
import sys
import io
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data"

# ---- 常量（口径与前端/races.html 一致） ----
GLBL = {"GI": "G1", "GII": "G2", "GIII": "G3", "L": "L", "OP": "OP",
        "JpnI": "Jpn1", "JpnII": "Jpn2", "JpnIII": "Jpn3"}
GBADGE = {"GI": "g1", "GII": "g2", "GIII": "g3", "L": "gl", "OP": "gop",
          "JpnI": "g1", "JpnII": "g2", "JpnIII": "g3"}
GRADED = {"GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII"}          # 重赏判定
NODE_PRIO = {"sire": 0, "gen": 1, "first": 2, "graded": 3, "award": 4}  # 节点取色优先级（小者优先）

# ---- 父子制覇常量：コントレイル（飞机云）生涯重赏一着 ----
# 来源：https://db.netkeiba.com/horse/result/2017101835/（成绩页，EUC-JP）
# 抓取脚本：tests/_trash/fetch_contrail_wins.py（コントレイル已退役，成绩固定，仅抓一次）
# 全部 1着 共 8 场，另 1 场为 2歳新馬（2019-09-15 阪神），非重赏不入表。
SIRE_WINS = [
    {"date": "2019-11-16", "name": "東京スポーツ杯2歳S", "grade": "G3", "cn": "东京体育杯2岁S"},
    {"date": "2019-12-28", "name": "ホープフルS",        "grade": "G1", "cn": "希望锦标"},
    {"date": "2020-04-19", "name": "皐月賞",             "grade": "G1", "cn": "皋月赏"},
    {"date": "2020-05-31", "name": "東京優駿",           "grade": "G1", "cn": "东京优骏"},
    {"date": "2020-09-27", "name": "神戸新聞杯",         "grade": "G2", "cn": "神户新闻杯"},
    {"date": "2020-10-25", "name": "菊花賞",             "grade": "G1", "cn": "菊花赏"},
    {"date": "2021-11-28", "name": "ジャパンC",          "grade": "G1", "cn": "日本杯"},
]


def norm_race(s):
    """レース名去格级括号尾缀（如 東京優駿(GI) → 東京優駿）并去空格，用于父子制覇匹配。"""
    s = "" if s is None else str(s)
    m = re.search(r"[（(]([^()（）]*)[)）]\s*$", s)
    if m:
        s = s[: m.start()]
    return s.replace(" ", "").replace("　", "").strip()


def race_key(r):
    rid = str((r or {}).get("race_id") or "").strip()
    if rid:
        return "race:" + rid
    return "slot:" + str(r.get("日付") or "") + "|" + str(r.get("場名") or "") + "|" + str(r.get("R") or "")


def first_photo(p):
    """photo 兼容 数组/字符串（同 profile 头像约定），取首图路径/URL；无则空串。"""
    if isinstance(p, list):
        return p[0] if p and p[0] else ""
    if isinstance(p, str):
        return p
    return ""


def posttime_key(r):
    """発走升序分量：缺失（空/None，海外场）视为最大（升序排最后 → 倒序后同日显示在最上）；
    "HH:MM" 为零填充字符串可直接比较。同 races.html 模块 33 口径。"""
    hk = str((r or {}).get("発走") or "")
    return (1, "") if not hk else (0, hk)


def place_desc_key(rk):
    """着順降序分量（用于升序键的末位）：数字着順取负（着順越大越靠前 → 倒序后同场 1着
    显示在最上）；未完走（中止/取消/除外/失格等非数字）取 -inf（升序最前 → 倒序后殿后）。"""
    try:
        return -float(str(rk))
    except (TypeError, ValueError):
        return float("-inf")


def event_sort_key(date, r):
    """事件升序排序键（前端倒序后 = 最新在顶）：① 日期升序；② 同日按発走升序（缺失视为最大）；
    ③ 同日同発走按着順降序。受赏/人工节点无比赛记录（r=None）→ 発走/着順均按缺失（同日置顶）。"""
    return (str(date or "") or "9999-99-99",
            posttime_key(r),
            place_desc_key((r or {}).get("結果")) if r else float("-inf"))


def build_events(horses, races_by_id):
    # 先扫一遍：每个世代（生年）的两条「首个」，一代各只有一条、之后不再标记：
    #   genBest   —— 该届产驹在 JRA 中央的首场重赏胜利
    #   genShinba —— 该届产驹最早的新马战胜利
    gen_best, gen_shinba = {}, {}
    for h in horses:
        if not h.get("生年"):
            continue
        g_best = g_shin = None
        for r in races_by_id.get(h["id"], []):
            if str(r.get("結果")) != "1":
                continue
            cand = {"date": str(r.get("日付") or ""), "key": race_key(r), "pt": posttime_key(r)}
            if g_shin is None and r.get("格") == "新馬":
                g_shin = cand
            if g_best is None and r.get("格") in GRADED and r.get("venue_type") == "中央":
                g_best = cand
        # 「最早」比较 = (日付, 発走) 元组：同日两场新馬/重赏一着时按発走分先后
        # （如 2026-08-09 中京2R 10:20 先于 中京3R 10:50；発走缺失视为最大），同 races.html 模块 33
        if g_best is not None:
            cur = gen_best.get(h["生年"])
            if cur is None or (g_best["date"], g_best["pt"]) < (cur["date"], cur["pt"]):
                gen_best[h["生年"]] = g_best
        if g_shin is not None:
            cur_s = gen_shinba.get(h["生年"])
            if cur_s is None or (g_shin["date"], g_shin["pt"]) < (cur_s["date"], cur_s["pt"]):
                gen_shinba[h["生年"]] = g_shin

    # 全局预扫（单一遍历，跨马按日期累计；同日按発走升序（缺失视为最大）+ race_key + horse id 稳定排序，
    # 与最终展示顺序同口径）：
    #   grade_first  —— 每个级别的产驹史首胜（全局只挂一次；2026-09 确认级别首胜为全局口径）
    #   global_index —— 重赏全局序 / 该级别全局序 / 海外重赏全局序（2026-09 确认：全局替代马内序数）
    all_wins = []
    for h in horses:
        for r in races_by_id.get(h["id"], []):
            if str(r.get("結果")) == "1" and r.get("格") in GLBL:
                all_wins.append((str(r.get("日付") or ""), race_key(r), str(h.get("id")), h, r))
    all_wins.sort(key=lambda x: (x[0], posttime_key(x[4]), x[1], x[2]))
    grade_first, global_index, g_seq, grade_cnt, ovs_cnt = {}, {}, 0, {}, 0
    for _d, _key, hid, h, r in all_wins:
        g = r["格"]
        if g not in grade_first:
            grade_first[g] = (hid, _key)
        if g not in GRADED:
            continue
        g_seq += 1
        grade_cnt[g] = grade_cnt.get(g, 0) + 1
        ovs = None
        if r.get("venue_type") == "海外":
            ovs_cnt += 1
            ovs = ovs_cnt
        global_index[(hid, _key)] = (g_seq, grade_cnt[g], ovs)

    sire_set = {norm_race(w["name"]): w for w in SIRE_WINS}
    out = []
    for h in horses:
        for r in races_by_id.get(h["id"], []):
            if str(r.get("結果")) != "1":
                continue                # 只有一着构成事件
            g = r.get("格")
            tags = []
            if g in GLBL and grade_first.get(g) == (str(h["id"]), race_key(r)):
                tags.append({"cat": "first", "label": GLBL[g] + "首胜"})   # 1. 级别首胜：全局口径，每级别全站仅一次
            if g in GRADED:                                  # 2. 全局重赏序数（产驹史上第 N 个，跨马累计）
                seq, grade_seq, ovs_seq = global_index[(str(h["id"]), race_key(r))]
                tags.append({"cat": "graded", "label": "重赏首胜" if seq == 1 else "重赏第" + str(seq) + "胜"})
                if grade_seq > 1:   # 该级别第1胜 =「级别首胜」，不重复挂（§45.5 用户反馈）
                    tags.append({"cat": "graded", "label": GLBL[g] + "第" + str(grade_seq) + "胜"})
                if ovs_seq:
                    tags.append({"cat": "graded", "label": "海外重赏首胜" if ovs_seq == 1 else "海外重赏第" + str(ovs_seq) + "胜"})
                if r.get("venue_type") == "中央" and h.get("生年") \
                        and h["生年"] in gen_best and gen_best[h["生年"]]["key"] == race_key(r):
                    tags.append({"cat": "gen", "label": str(h["生年"]) + "年产重赏首胜"})   # 3. 世代重赏首胜（中央）
            if g == "新馬" and h.get("生年") \
                    and h["生年"] in gen_shinba and gen_shinba[h["生年"]]["key"] == race_key(r):
                tags.append({"cat": "gen", "label": str(h["生年"]) + "年产新马首胜"})     # 1b. 世代新马首胜
            sw = sire_set.get(norm_race(r.get("レース名")))
            if sw:
                tags.append({"cat": "sire", "label": "父子制覇",
                             "tip": "飞机云同胜：" + (sw.get("cn") or sw["name"])})        # 4. 父子制覇
            for t in tags:
                if t["label"].endswith("首胜"):
                    t["crown"] = True   # 首胜标签右上角小皇冠（§45.6；to_render_event 会省略假值键）
            if tags:
                out.append({"date": str(r.get("日付") or ""), "h": h, "r": r, "tags": tags})
        # 5. 受赏（非比赛事件；受賞歴 为后端预留字段，兼容对象/字符串）
        awards = h.get("受賞歴") or []
        if isinstance(awards, str):
            awards = [awards]
        for a in awards:
            if isinstance(a, str):
                a = {"賞名": a}
            out.append({"date": str(a.get("日付") or a.get("date") or ""), "h": h, "a": a,
                        "tags": [{"cat": "award", "label": "受赏"}]})

    out.sort(key=lambda e: e["date"] or "9999-99-99")
    return out


def to_render_event(e):
    """内部事件 → 渲染就绪事件（前端拿到即画，不再做任何计算）。"""
    h, tags = e["h"], e["tags"]
    ev = {
        "date": e["date"],
        "type": "award" if "a" in e else "race",
        "node": min(tags, key=lambda t: NODE_PRIO[t["cat"]])["cat"],
        "horse": {
            "id": h.get("id"),
            "name": h.get("馬名") or "",
            "cn": h.get("香港馬名") or h.get("自译馬名") or "",
        },
        "photo": "",
        "tags": [{k: v for k, v in t.items() if v} for t in tags],   # 无 tip 时省略键
    }
    if "a" in e:
        a = e["a"]
        award = {"賞名": a.get("賞名") or a.get("名") or ""}
        if a.get("cn"):
            award["cn"] = a["cn"]
        if a.get("備考"):
            award["備考"] = a["備考"]
        ev["award"] = award
        return ev
    r = e["r"]
    place = str(r.get("場名") or "") + (str(r["R"]) + "R" if r.get("R") not in (None, "") else "")
    surf = str(r.get("芝ダ") or "") + (str(r["距離"]) + "m" if r.get("距離") not in (None, "") else "")
    meta = " · ".join(x for x in (place, surf, r.get("馬場")) if x not in (None, ""))
    jockey = " · ".join(x for x in (r.get("騎手") or "",
                                    str(r["斤量"]) + "kg" if r.get("斤量") not in (None, "") else "")
                        if x not in (None, ""))
    team = " ｜ ".join(x for x in (("騎手 " + jockey) if jockey else "",
                                   ("調教師 " + str(r["調教師"])) if r.get("調教師") else "") if x)
    race = {
        "name": str(r.get("レース名") or ""),
        "grade": r.get("格") or "",
        "glabel": GLBL.get(r.get("格"), ""),
        "gbadge": GBADGE.get(r.get("格"), ""),
        "meta": meta,
        "time": r.get("タイム") or "—",
        "agari": r.get("上り") or "—",
        "pop": (str(r["人気"]) + "番") if r.get("人気") not in (None, "") else "—",
        "team": team,
    }
    ev["photo"] = first_photo(r.get("photo")) or first_photo(h.get("photo"))
    ev["race"] = race
    return ev


def to_manual_event(e):
    """人工节点（data/timeline_manual.json）→ 渲染事件。
    用户字段（date/title/cn/note/link/photo/tags.label）原样保留，仅补 type/node/manual 标记；
    重算永不覆盖 timeline_manual.json 本身，本产物只负责把人工节点合并进合适的时间位置。"""
    tags = [{"cat": "manual", "label": str(t["label"])} for t in (e.get("tags") or [])
            if isinstance(t, dict) and t.get("label")]
    ev = {
        "date": str(e.get("date") or ""),
        "type": "manual",
        "node": "manual",
        "photo": first_photo(e.get("photo")),
        "tags": tags,
        "title": str(e.get("title") or ""),
        "manual": True,
    }
    if e.get("cn"):
        ev["cn"] = str(e["cn"])
    if e.get("note"):
        ev["note"] = str(e["note"])
    if e.get("link"):
        ev["link"] = str(e["link"])
    return ev


def main():
    basic = json.loads((DATA / "basic.json").read_text(encoding="utf-8"))
    horses = basic.get("horses", [])
    races_by_id = {}
    for h in horses:
        if not h.get("races_file"):          # 与前端旧逻辑一致：无成绩文件（未出道等）跳过
            races_by_id[h["id"]] = []
            continue
        f = DATA.parent / h["races_file"]
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except FileNotFoundError:
            data = []
        arr = data if isinstance(data, list) else (data.get("races") or [])
        arr = sorted(arr, key=lambda x: str(x.get("日付") or ""))   # 与前端旧逻辑一致：先按日付升序再算「首个」
        races_by_id[h["id"]] = arr

    # 自动事件：转渲染事件的同时生成排序键（build_events 内部 out.sort 只保证「首个」判定的
    # 稳定输入顺序；最终顺序以这里为准）
    items = [(event_sort_key(e["date"], e.get("r")), to_render_event(e))
             for e in build_events(horses, races_by_id)]

    # 人工节点：data/timeline_manual.json（用户自维护）。重算永不覆盖该文件，
    # 仅把其中节点合并进产物并按日期排到合适位置；缺 date/title 的条目跳过并告警。
    manual_path = DATA / "timeline_manual.json"
    manual = []
    if manual_path.exists():
        try:
            raw = json.loads(manual_path.read_text(encoding="utf-8-sig"))   # utf-8-sig: 兼容带 BOM（Windows 记事本等）
            for e in ((raw.get("events") if isinstance(raw, dict) else raw) or []):
                if not isinstance(e, dict):
                    continue
                if not e.get("date") or not e.get("title"):
                    print(f"  ⚠ 人工节点缺 date/title，已跳过: {str(e)[:100]}")
                    continue
                manual.append(to_manual_event(e))
        except (json.JSONDecodeError, OSError) as ex:
            print(f"  ⚠ timeline_manual.json 读取失败，本次不含人工节点: {ex}")
    items += [(event_sort_key(e.get("date"), None), e) for e in manual]   # 人工节点：発走/着順按缺失
    items.sort(key=lambda kv: kv[0])   # 升序（同日按発走，见 event_sort_key）；前端倒序 = 最新在顶
    events = [ev for _, ev in items]

    stats = {
        "events": len(events),
        "horses": len({e["horse"]["id"] for e in events if e.get("horse")}),   # 人工节点不挂马，不计入
        "graded_wins": sum(1 for e in events if e["type"] == "race" and e["race"]["grade"] in GRADED),
        "sire_wins": sum(1 for e in events if any(t["cat"] == "sire" for t in e["tags"])),
    }
    payload = {
        "meta": {
            "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "source": "basic.json + races/*.json",
            "stats": stats,
        },
        "events": events,
    }
    out = DATA / "timeline.json"

    # 内容无变化时跳过写入：generated_at 每次运行都不同，若照写会使 --ci 每轮都产生空 diff 提交
    def content_signature(d):
        m = dict(d.get("meta") or {})
        m.pop("generated_at", None)
        return json.dumps({"meta": m, "events": d.get("events")}, ensure_ascii=False, sort_keys=True)

    if out.exists():
        try:
            if content_signature(json.loads(out.read_text(encoding="utf-8"))) == content_signature(payload):
                print("时间线事件预计算: 内容无变化，跳过写入")
                return
        except (json.JSONDecodeError, OSError):
            pass   # 旧文件损坏/不可读 → 走全量重写
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"时间线事件预计算完成: {stats['events']} 条事件 / 覆盖 {stats['horses']} 匹产驹 / "
          f"重赏胜利 {stats['graded_wins']} 场 / 父子制覇 {stats['sire_wins']} 次 → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
