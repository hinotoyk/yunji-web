#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""netkeiba 主数据源抓取：コントレイル全部子嗣 + 每匹基础信息 + 5代血统。
用法:
    python scripts/scrape_netkeiba.py --all          # 全量更新（列表 + 每匹详情 + 血统）
    python scripts/scrape_netkeiba.py --ped          # 只补血统（读现有 netkeiba.json 的 nk_id）
    python scripts/scrape_netkeiba.py --horse 2024103491   # 单匹更新（netkeiba id）
    python scripts/scrape_netkeiba.py --name アオイハルカ   # 单匹更新（按马名）
选项: --output <json> --sleep <秒> --limit <n> --force
"""
import argparse
import csv
import io
import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

SIRE_ID = "2017101835"                      # コントレイル netkeiba id
LIST_URL = "https://db.netkeiba.com/horse/list.html?sire_id={sid}&range=all&page={page}"
HORSE_URL = "https://db.netkeiba.com/horse/{id}/"
PEDIGREE_URL = "https://db.netkeiba.com/horse/ped/{id}/"
RESULT_URL = "https://db.netkeiba.com/horse/result/{id}/"    # 成績（戦績tab）契约D 校验用
COLORS = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "netkeiba.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
def fetch(url, retries=3, encoding="euc-jp"):
    """GET 并按 encoding 解码（db.netkeiba.com 默认 EUC-JP；race.netkeiba.com SP 页须传 encoding="utf-8"）"""
    t0 = time.time()
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.encoding = encoding
            r.raise_for_status()
            log_fetch(url, r.status_code, time.time() - t0, attempt + 1)
            return r.text
        except Exception as e:
            if attempt == retries - 1:
                log_fetch(url, "ERR", time.time() - t0, attempt + 1, str(e)[:80])
                raise
            time.sleep(2)


def log_fetch(url, status, dur, retries, note=""):
    """风控观测：记录最小必要请求信息，失败不影响抓取"""
    try:
        FETCH_LOG = Path(__file__).resolve().parent.parent / "data" / "raw" / "fetch_log.csv"
        path = url.split("?")[0].replace("https://db.netkeiba.com", "")
        new = not FETCH_LOG.exists()
        with open(FETCH_LOG, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts", "script", "path", "status", "dur_s", "retries", "note"])
            w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), Path(__file__).name, path,
                        status, round(dur, 2), retries, note])
    except Exception:
        pass


def jitter(base):
    """netkeiba 请求间隔：base×(0.8~1.2)。默认 base=6.5 → 5.2~7.8s。"""
    return base * random.uniform(0.8, 1.2)

def soup_of(url):
    return BeautifulSoup(fetch(url), "lxml")

def parse_txt01(txt):
    """'現役　牝3歳　青鹿毛' / '抹消　牡　青鹿毛' → {status, sex, color, age}"""
    sex_m = re.search(r"(牡|牝|セン)", txt)
    status_m = re.search(r"(現役|抹消|引退|繁殖|功労馬|登録)", txt)
    age_m = re.search(r"(\d+)歳", txt)
    colors = ("青鹿毛", "黒鹿毛", "鹿毛", "芦毛", "栗毛", "白毛", "青毛", "粕毛", "栃栗毛", "鹿栗毛", "月毛", "河原毛")
    color = next((c for c in colors if c in txt), "")
    return {
        "status": status_m.group(1) if status_m else "",
        "sex": sex_m.group(1) if sex_m else "",
        "color": color,
        "age": age_m.group(1) + "歳" if age_m else "",
    }

def clean_cell(s):
    return re.sub(r"\[[^\]]*\]", "", s).strip()

def parse_detail(html, nk_id):
    soup = BeautifulSoup(html, "lxml")
    title = soup.select_one("p.txt_01")
    t = parse_txt01(title.get_text(" ", strip=True)) if title else {}
    prof = {}
    tbl = soup.select_one("table.db_prof_table")
    if tbl:
        for tr in tbl.find_all("tr"):
            th = tr.find("th")
            td = tr.find("td")
            if th and td:
                prof[th.get_text(strip=True)] = td.get_text(" ", strip=True)
    def g(*keys):
        for k in keys:
            if k in prof:
                return prof[k]
        return ""
    # W4/D4：英文名 = 马名下方 p.eng_name；セリ取引価格 = 详情表行（无拍卖记录为 '-'）
    eng = soup.select_one("p.eng_name")
    return {
        "nk_id": nk_id,
        "登録状態": t.get("status", ""),
        "性別": t.get("sex", ""),
        "毛色": t.get("color", ""),
        "馬齢": t.get("age", ""),
        "生年月日": g("生年月日"),
        "産地": g("産地"),
        "馬主": g("馬主"),
        "調教師": g("調教師"),
        "生産牧場": g("生産者"),
        "通算成績": g("通算成績"),
        "獲得賞金": g("獲得賞金 (中央)", "獲得賞金(中央)"),
        "主な勝鞍": g("主な勝鞍"),
        "英文名": eng.get_text(" ", strip=True) if eng else "",
        "セリ取引価格": g("セリ取引価格"),
        "_raw_title": title.get_text(" ", strip=True) if title else "",
    }

def parse_pedigree(html):
    """netkeiba 5代血統表 → {pedigree, fno}。
    netkeiba 血統表为 DFS 先序（父优先）对角级联表：rowspan = 子树占行数
    （根 16 → 每层减半 → 叶子 1），同一行内右邻为父系、下行为母系。
    解法：按文档序 DFS 重建二叉树（左=父系牡/右=母系牝）→ BFS 分层。
    输出同 JBIS 格式：{父:[[G1],[G2],[G3],[G4],[G5]], 母:[...]}，节点 {name,sex,year,color,id}。"""
    soup = BeautifulSoup(html, "lxml")
    table = soup.select_one("table.blood_table")
    fno = ""
    m = re.search(r"FNo\.?\s*\[?([0-9A-Za-z\-\.]+)", html)
    if m:
        v = m.group(1).strip("[]")
        fno = v if v.startswith("F") else "F" + v
    if not table:
        return {"pedigree": {"父": [], "母": []}, "fno": fno}

    # 文档序 cell 列表：(rowspan, node)
    cells = []
    for tr in table.find_all("tr", recursive=False):
        for td in tr.find_all("td", recursive=False):
            a = td.find("a", href=True)
            if not a:
                continue
            m = re.search(r"/horse/(\w+)/", a["href"])
            if not m:
                continue
            raw_name = a.get_text("\n", strip=True).splitlines()
            raw_name = [s.strip() for s in raw_name if s.strip()]
            name = raw_name[0] if len(raw_name) > 1 else " ".join(raw_name)
            text = td.get_text(" ", strip=True)
            ym = re.search(r"\b(19|20)\d{2}\b", text)
            node = {"name": name, "id": m.group(1)}
            if ym:
                node["year"] = ym.group(0)
            color = next((c for c in COLORS if c in text), "")
            if color:
                node["color"] = color
            cells.append((int(td.get("rowspan", "1") or 1), node))

    def dfs(part, idx, rows):
        """DFS 重建：先父系后母系，行数对半切"""
        rs, node = part[idx]
        idx += 1
        if rs > 1:
            idx, sire = dfs(part, idx, rows // 2)
            idx, dam = dfs(part, idx, rows // 2)
            node["_children"] = [sire, dam]
        return idx, node

    def mark_sex(node, sex):
        node["_sex"] = sex
        if "_children" in node:
            mark_sex(node["_children"][0], "牡")
            mark_sex(node["_children"][1], "牝")

    max_rs = max(c[0] for c in cells)
    cut = next(i for i, (rs, _) in enumerate(cells) if i > 0 and rs == max_rs)

    pedigree = {"父": [], "母": []}
    for label, part in (("父", cells[:cut]), ("母", cells[cut:])):
        if not part:
            pedigree[label] = []
            continue
        _, root = dfs(part, 0, part[0][0])
        mark_sex(root, "牡" if label == "父" else "牝")
        queue = [root]
        while queue:
            nxt = []
            row = []
            for node in queue:
                row.append({"name": node["name"], "sex": node["_sex"], "id": node["id"],
                            **({"year": node["year"]} if "year" in node else {}),
                            **({"color": node["color"]} if "color" in node else {})})
                if "_children" in node:
                    nxt.extend(node["_children"])
            pedigree[label].append(row)
            queue = nxt
    # W4/D4：netkeiba クロス → JBIS 风格（如「Halo ：S4×M4」，与 jbis 对齐）。
    # div.blood_cross 隐藏字段 input[name] = F/M 路径：每字符 = 从本马往回一代，F=父系、M=母系；
    # 首字符定侧（F→S、M→M），长度 = 世代数（如 FFF→S3、MFFF→M4、FMFMF→S5、MMMFF→M5）。
    # 表格的「N x N」不编码侧向（如 Danzig "5 x 5" 实际两次都在母侧 → M5×M5），必须用隐藏字段。
    # 转换：按祖先分组路径 → (侧, 世代) → 按 (世代升序, S<M) 排序 → × 连接；多祖先空格分隔。
    # 无隐藏字段 → 无クロス（"なし"）→ 空串（与 jbis 无 cross 一致）。
    cross = ""
    bc = soup.select_one("div.blood_cross")
    if bc:
        paths = {}
        for inp in bc.find_all("input"):
            n = inp.get("name") or ""
            v = (inp.get("value") or "").strip()
            if n in ("pid", "ped") or not v or not re.fullmatch(r"[FM]+", n):
                continue
            paths.setdefault(v, []).append(n)
        if paths:
            entries = []
            for anc, plist in paths.items():
                segs = [(("S" if p[0] == "F" else "M"), len(p)) for p in plist]
                segs.sort(key=lambda t: (t[1], 0 if t[0] == "S" else 1))
                entries.append("%s ：%s" % (anc, "×".join("%s%d" % (s, g) for s, g in segs)))
            cross = " ".join(entries)
    return {"pedigree": pedigree, "fno": fno, "cross": cross}


def parse_list_row(tr):
    cells = tr.find_all("td")
    if len(cells) < 12:
        return None
    a = cells[1].select_one('a[href*="/horse/"]')
    if not a:
        return None
    m = re.search(r"/horse/(\d+)/", a["href"])
    if not m:
        return None
    return {
        "nk_id": m.group(1),
        "馬名": a.get_text(" ", strip=True),
        "性別": cells[2].get_text(" ", strip=True),
        "生年": cells[3].get_text(" ", strip=True),
        "調教師": clean_cell(cells[5].get_text(" ", strip=True)),
        "母名": clean_cell(cells[7].get_text(" ", strip=True)),
        "母父名": clean_cell(cells[8].get_text(" ", strip=True)),
        "馬主": clean_cell(cells[9].get_text(" ", strip=True)),
        "生産牧場": clean_cell(cells[10].get_text(" ", strip=True)),
        "総賞金": cells[11].get_text(" ", strip=True),
    }


def parse_races(html):
    """netkeiba 成績页（戦績tab /horse/result/{id}/）→ 契约D 场记录列表（规范化，仅需求字段）。
    列结构：日付/開催/天気/R/レース名/映像/頭数/枠番/馬番/オッズ/人気/着順/騎手/斤量/距離/水分量/
    馬場(状态)/馬場指数/タイム/着差/…/通過/ペース/上り/馬体重/厩舎ｺﾒﾝﾄ/備考/勝ち馬/賞金"""
    from racelib import JRA_VENUES, NAR_VENUES, OVERSEAS_VENUES
    soup = BeautifulSoup(html, "lxml")
    tbl = soup.find("table", class_=re.compile("db_h_race_results"))
    if not tbl:
        return []
    ths = [th.get_text(" ", strip=True).replace(" ", "") for th in tbl.find_all("th")]
    idx = {n: i for i, n in enumerate(ths)}
    need = ["日付", "開催", "天気", "R", "レース名", "頭数", "枠番", "馬番", "オッズ", "人気",
            "着順", "騎手", "斤量", "距離", "馬場", "タイム", "着差", "通過", "ペース", "上り",
            "馬体重", "賞金"]
    if any(n not in idx for n in need):
        return []  # 结构变化 → 交由调用方标记
    venues = JRA_VENUES | NAR_VENUES | OVERSEAS_VENUES

    def num(v):
        try:
            return int(v)
        except (ValueError, TypeError):
            try:
                return float(v)
            except (ValueError, TypeError):
                return v or ""

    def link_id(td, pattern):
        """从单元格 <a href> 提取稳定 id（文字截断免疫：链接 id 完整）"""
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
            # M2.1：稳定 id（截断免疫）。レース名 → race_id；騎手 → jockey_id
            "race_id": link_id(tds[idx["レース名"]], r"/race/(\d+)/"),
            "jockey_id": link_id(tds[idx["騎手"]], r"/jockey/result/(?:recent/)?(\d+)/"),
        })
    out.sort(key=lambda r: r["日付"], reverse=True)
    return out

def fetch_list_all(limit=None, sleep=1.0):
    """扫描全部分页 → 列表记录列表"""
    horses = {}
    page = 1
    while True:
        soup = soup_of(LIST_URL.format(sid=SIRE_ID, page=page))
        rows = [parse_list_row(tr) for tr in soup.select("table.horse_list_table tr")]
        rows = [r for r in rows if r]
        if not rows:
            break
        for r in rows:
            horses[r["nk_id"]] = r
        pager = soup.select_one("div.pager")
        m = re.search(r"(\d+)\s*件中", pager.get_text(" ", strip=True)) if pager else None
        total = int(m.group(1)) if m else 0
        print(f"  page {page}: {len(rows)} 匹 (累计 {len(horses)}/{total})")
        if limit and len(horses) >= limit:
            break
        if page * 20 >= total:
            break
        page += 1
        time.sleep(sleep)
    return horses

def resolve_by_name(name, sleep=1.0):
    """全列表扫描找马名 → nk_id"""
    name = name.strip()
    page = 1
    while True:
        soup = soup_of(LIST_URL.format(sid=SIRE_ID, page=page))
        for tr in soup.select("table.horse_list_table tr"):
            r = parse_list_row(tr)
            if r and r["馬名"] == name:
                return r
        pager = soup.select_one("div.pager")
        m = re.search(r"(\d+)\s*件中", pager.get_text(" ", strip=True)) if pager else None
        total = int(m.group(1)) if m else 0
        if page * 20 >= total:
            break
        page += 1
        time.sleep(sleep)
    return None

def run_races(args):
    """契约D：抓取 netkeiba 成绩页（/horse/result/{id}/），落 data/raw/netkeiba_races.json。
    增量：只抓 已出赛且有 nk_id 的马；已有记录且 最新日付>=台账最新日付 且 条数>=台账条数 → 跳过。"""
    import json as _json
    races_path = DEFAULT_OUT.parent / "netkeiba_races.json"
    races_db = {}
    if races_path.exists():
        races_db = _json.loads(races_path.read_text(encoding="utf-8"))
    crops_path = DEFAULT_OUT.parent.parent / "crops.json"
    crops = _json.loads(crops_path.read_text(encoding="utf-8"))

    raced_nk = [(h.get("nk_id"), h.get("馬名", ""), h.get("races") or [])
                for h in crops if h.get("nk_id") and h.get("races")]
    todo = []
    for nk, name, recs in raced_nk:
        ledger_max = max(r["日付"] for r in recs)
        exist = races_db.get(nk, [])
        if not args.force and exist:
            e_max = max(r["日付"] for r in exist)
            if e_max >= ledger_max and len(exist) >= len(recs):
                continue
        todo.append((nk, name, len(recs)))
    if args.limit:
        todo = todo[:args.limit]
    print(f"✔ 已出赛且有 nk_id: {len(raced_nk)} 匹 → 需抓取 {len(todo)} 匹（增量跳过 {len(raced_nk) - len(todo)}）")

    for i, (nk, name, n_led) in enumerate(todo, 1):
        try:
            html = fetch(RESULT_URL.format(id=nk))
            recs = parse_races(html)
            if not recs:
                print(f"  [{i}/{len(todo)}] ⚠ {name}({nk}): 成绩页无记录或结构异常")
            else:
                races_db[nk] = recs
                print(f"  [{i}/{len(todo)}] {name} 成绩 {len(recs)} 场（台账 {n_led}）")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {name}({nk}): {e}")
        time.sleep(jitter(args.sleep))

    races_path.write_text(_json.dumps(races_db, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 已写 {races_path}（{len(races_db)} 匹）")


def run_new(args):
    """M3.1 --new 对账：扫描列表页，与 data/raw/netkeiba.json diff，三态处理。
    - 新 nk_id → 抓详情 → 追加 netkeiba.json（血统留待周 --ped）
    - nk_id 同、馬名不同 → 更新 netkeiba.json 馬名（registry 改名簿记由 build-data 的
      resolve_identity 统一处理：names 追加曾用名、id 不变）
    - nk_id 消失 → 忽略（已拍板）
    增量：只对新增/改名马发请求，其余零请求。输出 data/new-horses-report.md。
    """
    import json as _json
    raw_path = DEFAULT_OUT
    existing = {}
    if raw_path.exists():
        existing = {h.get("nk_id"): h for h in _json.loads(raw_path.read_text(encoding="utf-8"))}

    hits = fetch_list_all(args.limit, args.sleep)
    new_rows = [row for nk, row in hits.items() if nk not in existing]
    renamed = [(nk, existing[nk]["馬名"], row["馬名"], existing[nk])
               for nk, row in hits.items() if nk in existing and existing[nk].get("馬名") != row["馬名"]]
    print(f"✔ 对账: 列表 {len(hits)} 匹 · 新马 {len(new_rows)} · 改名 {len(renamed)} · 消失忽略")

    added = []
    todo = new_rows if not args.limit else new_rows[:args.limit]
    for i, row in enumerate(todo, 1):
        nk = row["nk_id"]
        try:
            detail = parse_detail(fetch(HORSE_URL.format(id=nk)), nk)
            existing[nk] = {**row, **detail}
            added.append((nk, row["馬名"]))
            print(f"  [{i}/{len(todo)}] ➕ 新马 {row['馬名']} ({nk}) 建档")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{len(todo)}] ❌ {row['馬名']} ({nk}): {e}")
        time.sleep(jitter(args.sleep))

    for nk, old_name, new_name, old in renamed:
        old["馬名"] = new_name
        print(f"  ✏ 改名: {old_name} → {new_name} ({nk})")

    if not new_rows and not renamed:
        print("✔ 列表与现有一致：无新增/改名")

    records = sorted(existing.values(), key=lambda h: (h.get("生年", ""), h.get("馬名", "")), reverse=True)
    raw_path.write_text(_json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 已写 {raw_path}（{len(records)} 匹）")

    report_path = DEFAULT_OUT.parent.parent / "new-horses-report.md"
    lines = ["# 新马对账报告（scrape_netkeiba.py --new）", "",
             f"- 生成时间: {time.strftime('%Y-%m-%d %H:%M')}",
             f"- 列表 {len(hits)} 匹 · 新增 {len(added)} · 改名 {len(renamed)}", ""]
    lines.append("## 新增马匹")
    lines.append("| nk_id | 馬名 |")
    lines.append("|---|---|")
    for nk, name in added:
        lines.append(f"| {nk} | {name} |")
    lines.append("")
    lines.append("## 改名马匹")
    lines.append("| nk_id | 旧名 | 新名 |")
    lines.append("|---|---|---|")
    for nk, old_name, new_name, _old in renamed:
        lines.append(f"| {nk} | {old_name} | {new_name} |")
    lines.append("")
    lines.append("> 提示：改名/新增的 registry 簿记由 build-data（resolve_identity）完成；血统留待 `--ped`。")
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✔ 已写: data/new-horses-report.md")


def main():
    ap = argparse.ArgumentParser(description="netkeiba 抓取")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="全量更新（列表+详情+血统）")
    g.add_argument("--ped", action="store_true", help="只补血统（读现有 netkeiba.json）")
    g.add_argument("--races", action="store_true", help="只抓比赛记录（契约D，校验台账用，不展示）")
    g.add_argument("--new", action="store_true", help="M3.1 对账：列表 diff 新马/改名，新马建档（零请求增量）")
    g.add_argument("--horse", help="netkeiba 马 id")
    g.add_argument("--name", help="马名")
    ap.add_argument("--output", default=str(DEFAULT_OUT))
    ap.add_argument("--sleep", type=float, default=6.5, help="请求间隔秒数（抖动 0.8~1.2 倍）")
    ap.add_argument("--limit", type=int, help="调试：只抓前 n 匹")
    ap.add_argument("--force", action="store_true", help="重抓已存在马匹")
    args = ap.parse_args()

    if args.races:
        run_races(args)
        return
    if args.new:
        run_new(args)
        return

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    merged = {}
    if out.exists():
        merged = {h["nk_id"]: h for h in json.loads(out.read_text(encoding="utf-8"))}

    if args.ped:
        ids = [h["nk_id"] for h in merged.values()]
        if args.limit:
            ids = ids[:args.limit]
        list_hits = {}
        print(f"✔ 补血统模式：{len(ids)} 匹")
    elif args.horse:
        ids = [args.horse]
        list_hits = {}
    elif args.name:
        hit = resolve_by_name(args.name, args.sleep)
        if not hit:
            sys.exit(f"❌ 列表未找到马名: {args.name}")
        ids = [hit["nk_id"]]
        list_hits = {hit["nk_id"]: hit}
        print(f"✔ 找到 {hit['馬名']} ({hit['nk_id']})")
    else:
        list_hits = fetch_list_all(args.limit, args.sleep)
        ids = list(list_hits.keys())
        print(f"✔ 列表共 {len(ids)} 匹")

    todo = [i for i in ids if args.force or i not in merged or args.ped and not merged[i].get("pedigree")]
    if not todo:
        print("✔ 无待更新马匹（--force 强制）")
    for i, nk_id in enumerate(todo, 1):
        try:
            row = list_hits.get(nk_id, merged.get(nk_id, {}))
            if not args.ped:
                html = fetch(HORSE_URL.format(id=nk_id))
                merged[nk_id] = {**row, **parse_detail(html, nk_id)}
            else:
                merged[nk_id] = dict(row)
            ped = parse_pedigree(fetch(PEDIGREE_URL.format(id=nk_id)))
            merged[nk_id]["pedigree"] = ped["pedigree"]
            merged[nk_id]["fno"] = ped["fno"]
            merged[nk_id]["cross"] = ped["cross"]  # W4/D4：netkeiba クロス
            n_cells = sum(len(r) for r in (ped["pedigree"].get("父", []) + ped["pedigree"].get("母", [])))
            print(f"  [{i}/{len(todo)}] {row.get('馬名', nk_id)} ped=OK({n_cells}格) fno={ped['fno'] or '-'}")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] ❌ {nk_id}: {e}")
        time.sleep(args.sleep)

    records = sorted(merged.values(), key=lambda h: (h.get("生年", ""), h.get("馬名", "")), reverse=True)
    out.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ {out} 共 {len(records)} 匹")

if __name__ == "__main__":
    main()
