# -*- coding: utf-8 -*-
"""适配器：netkeiba 比赛记录（主源，M2）。

netkeiba 成绩页 /horse/result/{id}/ 天然聚合 中央+地方+海外，一条 nk_id、一种格式 →
契约B 记录（主）。Google Sheets 台账仅补海外漏（见 sheets_ledger.py）。

本賞金（M2.4，収得前置）：主源 = SP 域 /race/result.html?race_id={id} 直接读 `本賞金:…万円`
（付加賞-free，2026-08-19 实测 13/13 重赏/非重赏均含）；回退 = db 域 4/5着 反推。

增量（2026-08-19 用户拍板，双轨制）：
- Track A 台账辅助检测（快）：用 ledger.csv 全量行（中央/地方/海外）驱动检测——台账有
  netkeiba 尚缺的场次 → 该马加入今日抓取；窗口 = 中央/地方 7 天、海外 30 天（台账快于
  netkeiba 的追赶期，状态可重入：窗口内天天自动重抓直到 netkeiba 补上）。
- Track B 轮换兜底（慢但全）：循环队列 data/raw/rotation_queue.json，每天取 head 起 50 匹
  抓全量成绩页，head 前进 50（模长）；队列 = 全部有 nk_id 的马（约 406 匹 → 约 8 天一轮），
  新马自动追加尾部；兜住台账没记的新场次与 netkeiba 侧修正。
- 两趟去重（同一马一天只抓一次），之后统一 backfill_honsho。

职责：
- update():  双轨制抓取成绩页（Track A 台账检测 + Track B 轮换 + 本賞金第二趟）→ 写 data/raw/netkeiba_races.json
- fetch():   适配器契约：netkeiba_races.json → 契约B 记录列表（本地转换，供 pull_races.py / build-data）
- CLI:       python scripts/adapters/netkeiba_races.py [--force] [--limit N] [--sleep S]
"""
import csv
import datetime
import io
import json
import re
import sys
import time
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import racelib  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402
from scrape_netkeiba import fetch as nk_fetch, jitter, parse_races, RESULT_URL  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
RACES_DB = ROOT / "data" / "raw" / "netkeiba_races.json"
CROPS_PATH = ROOT / "data" / "crops.json"
JOCKEYS_PATH = ROOT / "data" / "jockeys.json"
LEDGER_PATH = ROOT / "data" / "races" / "ledger.csv"          # 台账全量（Track A 检测源）
ROTATION_PATH = ROOT / "data" / "raw" / "rotation_queue.json"  # 轮换循环队列（Track B）
RACE_URL = "https://db.netkeiba.com/race/{id}/"                              # db 域（EUC-JP，回退用）
RACE_SP_URL = "https://race.netkeiba.com/race/result.html?race_id={id}"      # SP 域（UTF-8，本賞金主源）

# 重赏（含障害 JG*）1/2着 → 需要本賞金
GRADED_RE = re.compile(r"\((J?G[I]{1,3})\)")
# 状态简写：netkeiba 马场列 稍→稍重 / 不→不良
STATE_MAP = {"稍": "稍重", "不": "不良"}
# SP 接口本賞金：`<span>本賞金:4100,1600,1000,620,410万円</span>` = 1着~5着本賞金（付加賞-free）
HONSHO_RE = re.compile(r"本賞金:([\d,]+(?:,[\d,]+)*)万円")

# ── 双轨制（2026-08-19 用户拍板）──
# Track A 台账检测窗口（天，从比赛日起算）：台账有 netkeiba 尚缺的场次 → 窗口内天天重抓，
# 直到 netkeiba 补上。中央/地方 7 天（台账快于 netkeiba 的追赶期，netkeiba 通常 1-2 天补上）；
# 海外 30 天（netkeiba 海外更新慢）。超窗口 → 停止快通道；Track B 轮换仍按周期兜底检查。
LEDGER_WINDOW = {"中央": 7, "地方": 7, "海外": 30}
OVERSEAS_RETRY_DAYS = 30  # 兼容旧常量名（= 海外窗口）
# Track B 轮换：每天抓取匹数（循环队列）
ROTATION_BATCH = 50


def _race_key(r):
    return (str(r.get("日付", "")), str(r.get("場名", "")), str(r.get("R", "")))


def _load_ledger():
    """读 data/races/ledger.csv（台账全量，pull_races 产出）→ 行字典列表。缺失/损坏 → []（容错）。"""
    if not LEDGER_PATH.exists():
        return []
    try:
        with open(LEDGER_PATH, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except (OSError, csv.Error, UnicodeDecodeError):
        return []


def _ledger_covered(nk_db, nk, r):
    """台账行是否已被 netkeiba 成绩页覆盖。海外 R 常空 → 松散 (日付,場名)；中央/地方 → 严格 (日付,場名,R)。"""
    exist = nk_db.get(nk, [])
    if not exist:
        return False
    if (r.get("venue_type") or "").strip() == "海外":
        key = (str(r.get("日付", "")), str(r.get("場名", "")))
        return any((str(x.get("日付", "")), str(x.get("場名", ""))) == key for x in exist)
    key = (str(r.get("日付", "")), str(r.get("場名", "")), str(r.get("R", "")))
    return key in {_race_key(x) for x in exist}


def _ledger_detection(crops, ledger_rows, nk_db, today=None):
    """Track A 台账辅助检测：台账有 netkeiba 尚缺的场次、且比赛日在窗口内（中央/地方 7 天、
    海外 30 天）→ 该马加入今日抓取。返回 [(nk_id, 馬名)]。状态可重入：台账行还在、netkeiba
    未补上 → 明天自动再抓，直到窗口到期。"""
    today = today or datetime.date.today()
    name_to_nk = {}
    for h in crops:
        nk = h.get("nk_id")
        if nk and h.get("馬名"):
            name_to_nk.setdefault(h["馬名"], nk)
    out = {}
    for r in ledger_rows:
        name = (r.get("出走馬名") or "").strip()
        nk = name_to_nk.get(name)
        if not nk:
            continue  # 非本家马 / 马名对不上
        if _ledger_covered(nk_db, nk, r):
            continue
        window = LEDGER_WINDOW.get((r.get("venue_type") or "").strip(), 7)
        d = str(r.get("日付", ""))
        try:
            days = (today - datetime.date.fromisoformat(d)).days
        except ValueError:
            days = 0  # 日期异常 → 视为需抓
        if days <= window:
            out.setdefault(nk, name)
    return list(out.items())


def _load_queue(crops):
    """加载/初始化轮换循环队列 {"head": int, "order": [nk_id…]}。对照 crops 自动补新马到尾部。
    队列 = 全部有 nk_id 的马（含未出赛，轮换负责兜"首战没记台账"）。"""
    nk_ids = [h["nk_id"] for h in crops if h.get("nk_id")]
    queue = {"head": 0, "order": []}
    if ROTATION_PATH.exists():
        try:
            queue = json.loads(ROTATION_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, TypeError, KeyError):
            queue = {"head": 0, "order": []}
    queue.setdefault("order", [])
    queue.setdefault("head", 0)
    seen = set(queue["order"])
    for nk in nk_ids:
        if nk not in seen:
            queue["order"].append(nk)
            seen.add(nk)
    if not queue["order"]:
        queue["order"] = nk_ids  # 首次初始化
    return queue


def _next_batch(queue, n):
    """从 head 起循环取 n 个 nk_id（不足 n 则取全部）。"""
    order = queue["order"]
    if not order:
        return []
    head = queue["head"] % len(order)
    return (order[head:] + order[:head])[:n]


def _advance(queue, n):
    """head 前进 n（模长）。"""
    if queue["order"]:
        queue["head"] = (queue["head"] + n) % len(queue["order"])


def load_races_db():
    """读 data/raw/netkeiba_races.json → {nk_id: [契约D记录]}（本地）"""
    if RACES_DB.exists():
        return json.loads(RACES_DB.read_text(encoding="utf-8"))
    return {}


def load_jockeys():
    if JOCKEYS_PATH.exists():
        return json.loads(JOCKEYS_PATH.read_text(encoding="utf-8"))
    return {}


def parse_race_page(html):
    """比赛页 race_table_01 → 行列表（键=去空格表头），含 着順/馬名/賞金(万円)"""
    soup = BeautifulSoup(html, "lxml")
    tbl = soup.find("table", class_=re.compile("race_table_01"))
    if not tbl:
        return []
    ths = [re.sub(r"\s+", "", th.get_text(" ", strip=True)) for th in tbl.find_all("th")]
    rows = []
    for tr in tbl.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < len(ths):
            continue
        rows.append({ths[i]: tds[i].get_text(" ", strip=True) for i in range(len(ths))})
    return rows


def convert_to_contract_b(rec, horse_name, jockeys=None):
    """netkeiba 成绩页记录 → 契约B 记录（适配器输出，供 build-data 直接消费）。
    - 賞金：万円 → 円（×10000）；海外/缺失 → 0
    - 着順/状態：netkeiba 单字缩写 → 契约B 标准值
    - 騎手：jockeys.json[jockey_id] 全名（截断免疫）；无 id 用原值
    - 附：race_id / jockey_id / 本賞金 / 來源
    """
    jockeys = jockeys or {}
    grade, cond = racelib.race_meta_from_name(rec.get("レース名", ""))
    jockey_id = (rec.get("jockey_id") or "").strip()
    jockey_name = jockeys.get(jockey_id) or rec.get("騎手", "")
    state = STATE_MAP.get((rec.get("状態") or "").strip(), (rec.get("状態") or "").strip())
    result = racelib.normalize_result(rec.get("着順", ""))
    prize_raw = rec.get("賞金") or 0
    try:
        prize_yen = int(float(str(prize_raw).replace(",", "")) * 10000)
    except (ValueError, TypeError):
        prize_yen = 0
    return {
        "日付": rec.get("日付", ""),
        "場名": rec.get("場名", ""),
        "R": rec.get("R", ""),
        "競走名": rec.get("レース名", ""),
        "条件": cond,
        "格": grade,
        "距離": rec.get("距離", ""),
        "馬場": rec.get("馬場", ""),
        "状態": state,
        "天候": rec.get("天気", ""),
        "出走馬名": horse_name,
        "騎手": jockey_name,
        "性齢": "",
        "斤量": rec.get("斤量", ""),
        "頭数": rec.get("頭数", ""),
        "人気": rec.get("人気", ""),
        "単勝": rec.get("オッズ", ""),
        "結果": result,
        "タイム": rec.get("タイム", ""),
        "上り": rec.get("上り", ""),
        "着差": rec.get("着差", ""),
        "馬体重": rec.get("馬体重", ""),
        "増減": rec.get("増減", ""),
        "賞金": prize_yen,
        "Rt": "",
        "管理調教師": "",
        "母父名": "",
        "venue_type": racelib.venue_type(rec.get("場名", "")),
        "race_class": racelib.race_class(grade, cond),
        "race_id": rec.get("race_id", ""),
        "jockey_id": jockey_id,
        "本賞金": rec.get("本賞金", 0) or 0,
        "來源": "netkeiba",
    }


def fetch(name_by_nk=None):
    """适配器契约：netkeiba_races.json → 契约B 记录列表（本地转换，不抓网络）。
    供 pull_races.py --adapter netkeiba_races 使用/验证；build-data 也复用它。
    无参调用（pull_races 契约）→ 自动从 crops.json 取 nk_id→馬名。"""
    if not RACES_DB.exists():
        return []
    db = json.loads(RACES_DB.read_text(encoding="utf-8"))
    if name_by_nk is None:
        name_by_nk = {}
        if CROPS_PATH.exists():
            for h in json.loads(CROPS_PATH.read_text(encoding="utf-8")):
                if h.get("nk_id"):
                    name_by_nk[h["nk_id"]] = h.get("馬名", "")
    jockeys = load_jockeys()
    out = []
    for nk, recs in db.items():
        name = name_by_nk.get(nk, "")
        for r in recs:
            out.append(convert_to_contract_b(r, name, jockeys))
    return out


def parse_sp_honsho(html):
    """race.netkeiba.com 比赛结果页 → 1着本賞金（円）。
    页内 `<span>本賞金:4100,1600,1000,620,410万円</span>` = 1着~5着本賞金（付加賞-free，2026-08-19 实测 13/13）。
    返回首个值（1着本賞金）×10000；找不到返回 None。"""
    m = HONSHO_RE.search(html or "")
    if not m:
        return None
    first = m.group(1).split(",")[0]
    try:
        return int(first.replace(",", "")) * 10000
    except (ValueError, IndexError):
        return None


def _needs_honsho(rec):
    """重赏（含 JG*）且本方 1/2着 → 需要本賞金（force 只覆盖'已回填'，不覆盖此门槛）"""
    m = GRADED_RE.search(rec.get("レース名", ""))
    if not m:
        return False
    return rec.get("着順") in (1, 2)


def backfill_honsho(nk_db, force=False, sleep=1.0, limit=None):
    """M2.4 第二趟：对 重赏 1/2着 场次抓 SP 比赛页，直接读本賞金（円）写入记录。
    主源：race.netkeiba.com/race/result.html 的 `本賞金:…万円`（付加賞-free，1着本賞金）。
    回退：SP 解析失败 → db 域 race_table_01 的 4着/5着 反推（compute_honsho_prize，旧法）。"""
    todo = []
    for nk, recs in nk_db.items():
        for r in recs:
            if _needs_honsho(r) and (force or not r.get("本賞金")) and r.get("race_id"):
                todo.append((nk, r))
    if limit:
        todo = todo[:limit]
    print(f"✔ 本賞金回填(SP 接口): 需处理 {len(todo)} 场（重赏 1/2着）")
    ok, missing = 0, []
    for i, (nk, r) in enumerate(todo, 1):
        rid = r.get("race_id")
        try:
            honsho = None
            try:
                honsho = parse_sp_honsho(nk_fetch(RACE_SP_URL.format(id=rid), encoding="utf-8"))
            except Exception:  # noqa: BLE001
                honsho = None
            if not honsho:
                # 回退：db 域 4/5着 反推（付加賞不派给 4/5着）
                rows = parse_race_page(nk_fetch(RACE_URL.format(id=rid)))
                honsho = racelib.compute_honsho_prize(rows)
            if honsho:
                r["本賞金"] = honsho
                ok += 1
                print(f"  [{i}/{len(todo)}] {nk} {r['日付']} {r['レース名']} 本賞金={honsho/10000:,.0f}万")
            else:
                r["本賞金"] = 0
                missing.append((nk, rid, r["レース名"]))
                print(f"  [{i}/{len(todo)}] ⚠ {nk} {r['レース名']}: 本賞金解析失败")
        except Exception as e:  # noqa: BLE001
            missing.append((nk, rid, str(e)))
            print(f"  [{i}/{len(todo)}] ❌ {nk} {r['レース名']}: {e}")
        time.sleep(jitter(sleep))
    print(f"✔ 本賞金: 成功 {ok} · 缺失 {len(missing)}")
    return missing


def update(force=False, limit=None, sleep=6.5, fetch_pages=True):
    """双轨制抓取成绩页 + 本賞金回填 → 写 data/raw/netkeiba_races.json

    Track A 台账辅助检测（快）：台账有 netkeiba 尚缺的场次（窗口内）→ 抓该马。
    Track B 轮换兜底（慢但全）：循环队列每天抓 50 匹全量，队列含全部有 nk_id 的马。
    两趟去重（同一马一天只抓一次）；之后统一 backfill_honsho。"""
    nk_db = load_races_db()
    if not CROPS_PATH.exists():
        raise SystemExit("❌ 无 data/crops.json（需先构建）")
    crops = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    nk_names = {h.get("nk_id"): h.get("馬名", "") for h in crops if h.get("nk_id")}

    def fetch_one(nk, name, tag, i, total):
        """抓单马成绩页 → 写回 nk_db；未出赛记录空（轮换确认过）；页面异常保留旧数据。返回是否成功"""
        try:
            recs = parse_races(nk_fetch(RESULT_URL.format(id=nk)))
            if recs:
                nk_db[nk] = recs
                print(f"  [{i}/{total}] {tag} {name}({nk}) 成绩 {len(recs)} 场")
            else:
                if nk not in nk_db:
                    nk_db[nk] = []  # 未出赛 → 记录空
                print(f"  [{i}/{total}] {tag} {name}({nk}): 无成绩记录（未出赛或结构异常）")
            return bool(recs)
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{total}] {tag} ❌ {name}({nk}): {e}")
            return False

    targets = {}  # nk -> (name, tag)
    if fetch_pages:
        # ── Track A：台账辅助检测（快）──
        for nk, name in _ledger_detection(crops, _load_ledger(), nk_db):
            targets.setdefault(nk, (name or nk_names.get(nk, nk), "台账"))
        print(f"✔ Track A 台账检测: 台账有 netkeiba 尚缺场次 {len(targets)} 匹（窗口内）")

        # ── Track B：轮换兜底（慢但全）──
        queue = _load_queue(crops)
        if force:
            batch = list(queue["order"])
            print(f"✔ Track B 轮换: --force 全量 {len(batch)} 匹（队列不推进）")
        else:
            batch = _next_batch(queue, ROTATION_BATCH)
            print(f"✔ Track B 轮换: 队列 {len(queue['order'])} 匹 · 今日取 {len(batch)} 匹（head={queue['head']}）")
        for nk in batch:
            if nk not in targets:
                targets.setdefault(nk, (nk_names.get(nk, nk), "轮换"))

        # ── 抓取（去重后）──
        items = list(targets.items())
        if limit:
            items = items[:limit]
        for i, (nk, (name, tag)) in enumerate(items, 1):
            fetch_one(nk, name, tag, i, len(items))
            time.sleep(jitter(sleep))

        # ── 队列推进放抓取完成后（中途崩溃不丢轮换位）；--limit 调试不推进 ──
        if not force and limit is None:
            _advance(queue, ROTATION_BATCH)
        if not force:
            ROTATION_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        print("✔ 成绩页: 跳过（--no-fetch），只做本賞金回填")

    # 2) 本賞金第二趟
    backfill_honsho(nk_db, force=force, sleep=max(sleep * 0.2, 1.0), limit=limit)

    RACES_DB.write_text(json.dumps(nk_db, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 已写 {RACES_DB}（{len(nk_db)} 匹）")


def main():
    import argparse
    ap = argparse.ArgumentParser(description="netkeiba 比赛记录适配器（M2 主源）")
    ap.add_argument("--force", action="store_true", help="重抓已存在记录（含本賞金）")
    ap.add_argument("--limit", type=int, help="调试：只处理前 n")
    ap.add_argument("--sleep", type=float, default=6.5, help="成绩页请求间隔秒数")
    ap.add_argument("--no-fetch", action="store_true", help="只做本賞金回填，不抓成绩页")
    args = ap.parse_args()
    update(force=args.force, limit=args.limit, sleep=args.sleep, fetch_pages=not args.no_fetch)


if __name__ == "__main__":
    main()
