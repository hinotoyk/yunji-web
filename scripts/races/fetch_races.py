#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""成绩页增量抓取（竞赛流水线第 2 环）。

目标马（满足任一即抓）：
  - 判变马（_tmp/changed.json，通算成績 有变化）
  - 尚无 races 文件的马（首次初始化，全量补齐；含上次抓取失败没建文件的）
  - 数据缺失的马（已有文件，但 中央+地方 实际出赛数 < 通算成績 应有战数 → 补拉）
  - --force 时全部有 nk_id 的马
只对目标马抓 netkeiba 成绩页（db.netkeiba.com/horse/result/{nk_id}/，EUC-JP），
解析逐场记录 → 与已有 races 文件按比赛键去重 → 只把**新增记录**写缓存：
  - _tmp/races.json      {id: [新增记录...]}（首次运行时即全部记录）
  - _tmp/failures.json   {id: 错误信息}（追加）

说明：
  - 已有记录一律不动（增量只增不覆盖）；比赛键 = race_id，无 race_id 用 (日付,場名,R)。
  - 「数据缺失」判变是核心兜底：即使通算成績 字符串没变化，只要文件出赛数对不上
    通算战数（如上次抓取失败落了空文件、或只并入了台账海外记录），也会自动补拉，
    不会出现「永远拉不到成绩」。
  - 未出赛/结构异常 → 空列表缓存，不阻塞后续环节；下轮按完整性再校验。
  - 详情字段（通算成績 等）由 merge_races 统一回填 basic.json。

用法:
    python fetch_races.py [--limit N] [--force]
"""
import argparse
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402

# netkeiba 状态简写 → 全称（馬場列）
STATE_MAP = {"稍": "稍重", "不": "不良"}

# 通算成績 如 '5戦1勝 [ 1-0-0-4 ]'，战数 = 主口径(中央+地方)出赛数
START_RE = re.compile(r"(\d+)戦")


def expected_starts(h):
    """通算成績 → 应有出赛数（netkeiba 通算 = 成绩页全部场次，含海外）。"""
    m = START_RE.search(h.get("通算成績") or "")
    return int(m.group(1)) if m else 0


def actual_starts(recs):
    """races 文件里的实际出赛数：結果为名次(int)/中止/失格 都算出赛，
    取消/除外 不出走；全部场地都算（与 netkeiba 通算口径一致）。
    兼容历史单字 DNF（中/失），新数据已归一为全称（中止/失格）。"""
    n = 0
    for r in recs:
        res = r.get("結果")
        if isinstance(res, int) or res in ("中止", "失格", "中", "失"):
            n += 1
    return n


def parse_races(html):
    """netkeiba 成绩页（/horse/result/{id}/）→ 逐场原始记录（含稳定 race_id/jockey_id）。
    列：日付/開催/天気/R/レース名/映像/頭数/枠番/馬番/オッズ/人気/着順/騎手/斤量/距離/
    馬場(芝ダ)/状態/タイム/着差/通過/ペース/上り/馬体重/賞金。"""
    soup = common.BeautifulSoup(html, "lxml")
    tbl = soup.find("table", class_=re.compile("db_h_race_results"))
    if not tbl:
        return []
    ths = [th.get_text(" ", strip=True).replace(" ", "") for th in tbl.find_all("th")]
    idx = {n: i for i, n in enumerate(ths)}
    need = ["日付", "開催", "天気", "R", "レース名", "頭数", "枠番", "馬番", "オッズ", "人気",
            "着順", "騎手", "斤量", "距離", "馬場", "タイム", "着差", "通過", "ペース", "上り",
            "馬体重", "賞金"]
    if any(n not in idx for n in need):
        return []  # 页面结构变化 → 视为无记录，交由调用方告警
    venues = racelib.JRA_VENUES | racelib.NAR_VENUES | racelib.OVERSEAS_VENUES

    def num(v):
        try:
            return int(v)
        except (ValueError, TypeError):
            try:
                return float(v)
            except (ValueError, TypeError):
                return v or ""

    def link_id(td, pattern):
        a = td.find("a", href=True)
        if not a:
            return ""
        m = re.search(pattern, a["href"])
        return m.group(1) if m else ""

    out = []
    for tr in tbl.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) <= max(idx.values()):
            continue
        c = lambda n: tds[idx[n]].get_text(" ", strip=True)  # noqa: E731
        m = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})$", c("日付"))
        if not m:
            continue
        date_n = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        kai = c("開催")
        venue = next((v for v in venues if v in kai), "")
        m2 = re.match(r"^(芝|ダ|障)(\d+)$", c("距離"))
        if m2:
            surf = {"芝": "芝", "ダ": "ダート", "障": "障害"}[m2.group(1)]
            dist = int(m2.group(2))
        else:
            surf, dist = "", c("距離")
        r_raw = c("着順")
        try:
            result = int(r_raw)
        except ValueError:
            result = r_raw  # 中止/取消/除外/失格
        bw_m = re.search(r"(\d+)(\(([+-]?\d+)\))?", c("馬体重"))
        bw_v, bw_d = "", ""
        if bw_m:
            bw_v = int(bw_m.group(1))
            bw_d = bw_m.group(3) or ""
        out.append({
            "日付": date_n, "開催": kai, "場名": venue, "天気": c("天気"), "R": num(c("R")),
            "レース名": c("レース名"), "頭数": num(c("頭数")), "枠番": num(c("枠番")),
            "馬番": num(c("馬番")), "オッズ": num(c("オッズ")), "人気": num(c("人気")),
            "着順": result, "騎手": c("騎手"), "斤量": num(c("斤量")),
            "距離": dist, "馬場": surf, "状態": c("馬場"),
            "タイム": c("タイム"), "着差": c("着差"), "通過": c("通過"),
            "ペース": c("ペース"), "上り": c("上り"),
            "馬体重": bw_v, "増減": bw_d, "賞金": num(c("賞金")),
            "race_id": link_id(tds[idx["レース名"]], r"/race/([0-9A-Za-z]+)/"),
            "jockey_id": link_id(tds[idx["騎手"]], r"/jockey/result/(?:recent/)?(\d+)/"),
        })
    out.sort(key=lambda r: r["日付"], reverse=True)
    return out


def to_contract_b(rec, horse_name):
    """成绩页原始记录 → 规范记录（赏金 万円→円；着順 文本→int/DNF；附 格/条件/venue_type/race_id）。"""
    grade, cond = racelib.race_meta_from_name(rec.get("レース名", ""))
    state = STATE_MAP.get((rec.get("状態") or "").strip(), (rec.get("状態") or "").strip())
    result = racelib.normalize_result(rec.get("着順", ""))
    prize_raw = rec.get("賞金")
    if prize_raw in ("", None):
        prize_yen = ""
    else:
        try:
            prize_yen = int(float(str(prize_raw).replace(",", "")) * 10000)
        except (ValueError, TypeError):
            prize_yen = ""
    return {
        "日付": rec.get("日付", ""), "開催": rec.get("開催", ""), "場名": rec.get("場名", ""),
        "R": rec.get("R", ""), "レース名": rec.get("レース名", ""), "格": grade, "条件": cond,
        "距離": rec.get("距離", ""), "芝ダ": racelib._normalize_surface(rec.get("馬場", "")),
        "馬場": state, "天候": rec.get("天気", ""), "出走馬名": horse_name,
        "騎手": rec.get("騎手", ""), "斤量": rec.get("斤量", ""), "頭数": rec.get("頭数", ""),
        "人気": rec.get("人気", ""), "単勝": rec.get("オッズ", ""), "結果": result,
        "タイム": rec.get("タイム", ""), "上り": rec.get("上り", ""), "着差": rec.get("着差", ""),
        "通過": rec.get("通過", ""), "ペース": rec.get("ペース", ""),
        "馬体重": rec.get("馬体重", ""), "増減": rec.get("増減", ""), "賞金": prize_yen,
        "venue_type": racelib.venue_type(rec.get("場名", "")),
        "race_id": rec.get("race_id", ""), "jockey_id": rec.get("jockey_id", ""),
        "本賞金": 0, "來源": "netkeiba",
    }


def enrich_grade_cond(cb):
    """按场地抓 SP 比赛页，回填 格（图标优先，无图标名字解析）+ 条件（RaceData02）。
    抓取失败/无 race_id → 用名字解析兜底，不阻塞入库。"""
    rid = str(cb.get("race_id") or "").strip()
    name = cb.get("レース名", "")
    venue = cb.get("venue_type", "")

    def fallback():
        cb["格"] = racelib.race_grade_resolve(None, name, venue)
        cb["条件"] = racelib.race_meta_from_name(name)[1]

    if not rid:
        fallback()
        return
    is_local = (venue or "").strip() == "地方"
    url = (common.RACE_SP_URL_NAR if is_local else common.RACE_SP_URL).format(race_id=rid)
    try:
        html = common.fetch(url, encoding="utf-8")
    except Exception:
        fallback()
        return
    icon_m = re.search(r"Icon_GradeType(\d+)", html)
    icon = icon_m.group(1) if icon_m else None
    soup = common.BeautifulSoup(html, "lxml")
    d02 = soup.find("div", class_="RaceData02")
    d02_text = d02.get_text(" ", strip=True) if d02 else ""
    cb["格"] = racelib.race_grade_resolve(icon, name, venue)
    cb["条件"] = racelib.cond_from_racedata02(d02_text) or racelib.race_meta_from_name(name)[1]


def main():
    ap = argparse.ArgumentParser(description="成绩页增量抓取")
    ap.add_argument("--limit", type=int, default=0, help="调试：只处理前 n 匹")
    ap.add_argument("--force", action="store_true", help="重抓全部有 nk_id 的马（全量回填）")
    ap.add_argument("--id", help="定向：逗号分隔的指定 id（与判变/缺失/无文件取并集）")
    ap.add_argument("--since", type=int, default=0,
                    help="时段：只处理 races 文件最新日付在最近 N 天内的马 + 无文件马（轻量模式，不依赖判变）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    by_id = {str(h["id"]): h for h in horses}

    want_ids = None
    if args.id:
        want_ids = {str(x) for x in args.id.split(",") if x.strip()}

    if args.since:
        from datetime import date, timedelta
        cutoff = date.today() - timedelta(days=args.since)
        # 轻量模式：不依赖判变缓存，直接按「最近 N 天出赛 + 无文件」驱动
        recent, no_file = [], []
        for h in horses:
            if not h.get("nk_id"):
                continue
            if want_ids is not None and str(h["id"]) not in want_ids:
                continue
            p = common.RACES_DATA_DIR / f"{h['id']}.json"
            if not p.exists():
                no_file.append(h)
                continue
            import json
            recs = json.loads(p.read_text(encoding="utf-8"))
            if recs and (recs[0].get("日付") or "") >= str(cutoff):   # 文件按日付倒序，首条即最新
                recent.append(h)
        targets = {str(h["id"]): h for h in no_file + recent}
        if args.limit:
            targets = dict(list(targets.items())[:args.limit])
        print(f"✔ 成绩页目标 {len(targets)} 匹"
              f"（时段 {args.since} 天内出赛 {len(recent)} · 无文件 {len(no_file)}）")
        return _fetch(targets)

    changed = common.read_cache("changed") or {}      # {id: {"旧","新"}}
    no_file, incomplete = [], []
    for h in horses:
        if not h.get("nk_id"):
            continue
        if want_ids is not None and str(h["id"]) not in want_ids:
            continue
        p = common.RACES_DATA_DIR / f"{h['id']}.json"
        if not p.exists():
            no_file.append(h)                          # 首次初始化（含上次抓取失败没建文件的）
        else:
            import json
            recs = json.loads(p.read_text(encoding="utf-8"))
            if actual_starts(recs) < expected_starts(h):
                incomplete.append(h)                   # 已有文件但出赛记录不足 → 数据缺失补拉
    incomplete_ids = {str(x["id"]) for x in incomplete}
    no_file_ids = {str(x["id"]) for x in no_file}
    targets = {}
    for h in horses:
        if not h.get("nk_id"):
            continue
        id_s = str(h["id"])
        if want_ids is not None and id_s not in want_ids:
            continue
        if args.force or id_s in changed or id_s in no_file_ids or id_s in incomplete_ids:
            targets[id_s] = h
    if args.limit:
        targets = dict(list(targets.items())[:args.limit])

    print(f"✔ 成绩页目标 {len(targets)} 匹"
          f"（判变 {len(changed)} · 无文件 {len(no_file)} · 数据缺失 {len(incomplete)} · force={args.force}）")
    return _fetch(targets)


def _fetch(targets):

    races = {}
    failures = common.read_cache("failures") or {}
    for i, (id_s, h) in enumerate(targets.items(), 1):
        nk = h["nk_id"]
        url = common.NK_RESULT_URL.format(nk_id=nk)
        try:
            raw = parse_races(common.fetch(url, encoding="euc-jp"))
            exist_keys = set()
            p = common.RACES_DATA_DIR / f"{id_s}.json"
            if p.exists():
                import json
                for r in json.loads(p.read_text(encoding="utf-8")):
                    exist_keys |= common.record_keys(r)
            # 双键去重（race_id OR 馬名+日付）：netkeiba 同源按 race_id，跨源（台账先入库的海外场）按馬名+日付
            new = []
            for r in raw:
                cb = to_contract_b(r, h.get("馬名", ""))
                if common.record_keys(cb) & exist_keys:
                    continue
                enrich_grade_cond(cb)          # 抓 SP 页回填 格/条件
                time.sleep(common.sleep_for(common.RACE_SP_URL))
                new.append(cb)
            if raw:
                races[id_s] = new
                print(f"  [{i}/{len(targets)}] {h['id']} {h.get('馬名','')} "
                      f"页 {len(raw)} 场 · 新增 {len(new)} 场")
            else:
                races[id_s] = []   # 未出赛 / 结构异常 → 空，标记已检查（下轮按完整性再校验）
                exp = expected_starts(h)
                print(f"  [{i}/{len(targets)}] {h['id']} {h.get('馬名','')} ⚠ 页面 0 场"
                      f"（通算应 {exp} 战 → {'下次仍会补拉' if exp > 0 else '未出赛'}）")
        except Exception as e:
            failures[id_s] = f"races: {e}"
            print(f"  [{i}/{len(targets)}] ❌ {h['id']} {h.get('馬名','')}: {e}")
        time.sleep(common.sleep_for(url))

    common.write_cache("races", races)
    common.write_cache("failures", failures)
    total_new = sum(len(v) for v in races.values())
    print(f"✔ 成绩缓存 {len(races)} 匹 · 新增记录 {total_new} 条")


if __name__ == "__main__":
    main()
