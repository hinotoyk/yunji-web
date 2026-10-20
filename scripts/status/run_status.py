#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""登录状态任务（日频独立）：JRA 抹消/去向/地方调教师 → 直写 data/basic.json。

数据链（2026-10 用户定稿，与 basic/races 两管线业务隔离，不进 run_update 编排）：
  1. NAR RaceHorseList（父名=种马，免登录，「次の50頭」翻页跟随）→ 产驹 NAR 侧快照
     - 所属場=地方 → 确认去向落库：登録状態=抹消 + 地方競馬·所属場原文（同 園田 证据等级）
     - 所属場=JRA  → 一律跳过（用户定稿：含「抹消」标的也不深挖，仅报告列出）
  2. NAR RaceHorseInfo（按需，仅地方马）→ 調教師（全角空格压缩+（所属）尾缀剥离）→ 直接覆盖
  3. keibabook 抹消馬簿 栗東/美浦（2 请求，约 2 周滚动窗口）→ 命中即落全套：
     抹消日 + 事由（地方/乗馬/繁殖/斃死 → 種別映射）+ 行き先（未定 → 場所留空）
  4. NAR-地方 但库里无抹消日（如未出走移籍）→ 馬検索补 kb_id → 近況履歴补日期
  5. 直写 basic.json 五键 + kb_id；证据明细只进报告
  6. 降级守卫（2026-10-20）：p.keibabook.co.jp 也开始封 GitHub Actions 出口 IP（同 studbook）——
     keibabook 任一请求 403/失败 → 本轮降级（后续请求短路不再发），抹消馬簿/补查跳过、报告标「降级」，
     由本机 scripts/studbook_sync.py 补跑；NAR / studbook 环节不受影响照常执行。

落库守则（用户定稿）：
  - 只有「确认去向」才写 種別/場所——推定/猜测绝不入库，不确定就只留抹消日
  - 人工表钉了 種別/場所 → 去向不碰；钉了抹消日 → 日期不碰；钉了調教師 → 調教師不碰
合并持久化：apply_overrides 抹消组逐键合并（任务值跨合并存活）；merge_races 的
登録状態 回填带空值/現役回退守卫（见 core/manual.py / races/merge_races.py）。

用法:
    python run_status.py             # 抓取 + 比对 + 落库 + 报告
    python run_status.py --dry-run   # 只出报告，不写 basic.json
"""
import argparse
import os
import re
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # 跨平台（CI ubuntu 无反斜杠）
import common
from core import constants, sire_config, text  # noqa: E402（status 只吃中立层 core，不 import basic/races 业务模块）

# masyoba 事由 → 抹消_去向種別（未收录事由 → 不落種別，仅日期；展示文案走 i18n）
JIYU_MAP = {"地方": "地方競馬", "乗馬": "乗馬", "繁殖": "繁殖", "斃死": "死亡"}
# studbook 繁殖登録列表页标题（用于区分 多结果列表页 / 单结果档案页 / 零结果搜索页）
_STB_TITLE_LIST = {"父馬別繁殖登録馬", "父馬別繁殖登録馬 産駒一覧"}
MASYO_DATE_RE = re.compile(r"(\d{4})年(\d{1,2})月(\d{1,2})日付けで中央登録を抹消")
# (?!/)：排除 sire 链接的 /sanku、马页 /kanzen 等 /db/uma/NNNNNNN/xxx 形态，只认裸马页链接
# keibabook 马页 id 实测 7 位（0954298），放宽 \d{6,8} 防位数变化
UMA_HREF_RE = re.compile(r'href="/db/uma/(\d{6,8})"(?!/)')
NAR_SKIP_BELONG = ("JRA", "中央", "退厩")                   # 所属=JRA 一律跳过（用户定稿）
MAX_PAGES = 30                                              # NAR 列表翻页保险丝（50行/页，キズナ级产量 ~10 页足够）
KB_CENTER = ("栗東", "美浦")                                # kanzen 厩舎栏的中央训练中心（=非去向）
REPORT_PATH = common.ROOT / "tests" / "status_task_report.md"


def ymd(s):
    """2026/10/3 → 2026-10-03（零段补零）；非日期串原样返回。"""
    m = re.match(r"(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})", str(s).strip())
    if not m:
        return str(s).strip()
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


# keibabook 降级守卫（2026-10-20：p.keibabook.co.jp 也开始封 GitHub Actions 出口 IP，同 studbook）：
# 首个 403/网络错误 → 本轮降级（_kb_ok=False），后续 keibabook 请求短路不再发（防对封禁主机无效轰炸）。
_kb_ok = True


def _kb_soup(url):
    """keibabook 页面请求（403 快失败 + 降级短路）。返回 None = 不可用。"""
    global _kb_ok
    if not _kb_ok:
        return None
    try:
        return common.soup_of(url, encoding="utf-8", retries=1)
    except Exception as e:
        _kb_ok = False
        print(f"  ⚠ keibabook 请求失败：{e} → 本轮降级（抹消/去向/kb_id 由本机 scripts/studbook_sync.py 补跑）")
        return None


def _kb_html(url):
    """keibabook 原文请求（403 快失败 + 降级短路）。返回 "" = 不可用。"""
    global _kb_ok
    if not _kb_ok:
        return ""
    try:
        return common.fetch(url, encoding="utf-8", retries=1)
    except Exception as e:
        _kb_ok = False
        print(f"  ⚠ keibabook 请求失败：{e} → 本轮降级")
        return ""


def kb_page(kb_id):
    """keibabook 马页（kanzen）→ (中央抹消标 bool, 厩舎地名, 調教師名)。
    抹消标 = <span class="cyuou_masyo">；厩舎栏 = trainer + 「厩舎(西脇)」——只反映中央/地方在籍
    厩舎（乗馬/繁殖马仍显示旧 JRA 厩舎，故仅在 抹消标+非中央地名 时构成地方证据）。"""
    soup = _kb_soup(common.KB + f"/db/uma/{kb_id}/kanzen")
    if soup is None:
        return False, "", ""
    erased = soup.select_one("span.cyuou_masyo") is not None
    cell = soup.select_one("table.default.uma td")          # 厩舎 = 表首格
    place = trainer = ""
    if cell:
        txt = cell.get_text(" ", strip=True)
        a = cell.select_one("a[href*='/db/kyusya/']")
        trainer = re.sub(r"\u3000+", "", a.get_text(strip=True)) if a else ""
        mp = re.search(r"厩舎[（(]([^）)]+)[）)]", txt)
        place = mp.group(1) if mp else ""
    return erased, place, trainer


def _list_url(sire, page=None):
    """NAR 竞走馬一覧 URL；page=None=第一页，之后按「次の50頭」锚里的 k_pageNum 跟随。"""
    url = (common.NAR_LIST_URL
           + f"?k_horseName=&k_horseNameCondition=start&k_fatherHorse={common.quote(sire)}"
             "&k_fatherHorseCondition=start&k_motherHorse=&k_motherHorseCondition=start"
             "&k_dataKind=*&k_birthYear=*&k_activeCode=1&k_horsebelong=*")
    return url if page is None else url + f"&k_pageNum={page}"


def _anchor_td_index(tr, a):
    """锚点所在 td 的列号（行内列序不假设固定，按锚点定位再右移取格）。"""
    return next((j for j, td in enumerate(tr.find_all("td")) if a in td), None)


def fetch_nar():
    """NAR 竞走馬一覧（翻页跟随）→ {馬名: {belong, erased, birth, code}}。
    免登录免 cookie；k_activeCode=1 实测返回「NAR 在册 + JRA 抹消」全集（响应头 登録:全て）。
    行内列序（实测）：No.|馬名|性齢|生年|所属|父名|母名，按锚点定位防列序变化。"""
    out, url, n_page = {}, _list_url(common.SIRE_NAME_JA), 0
    while True:
        soup = common.soup_of(url, encoding="utf-8")
        for a in soup.select('a[href*="RaceHorseInfo?k_lineageLoginCode="]'):
            tr = a.find_parent("tr")
            if tr is None or a.get_text(strip=True) in out:
                continue
            tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            i = _anchor_td_index(tr, a)
            if i is None or len(tds) < i + 4:
                continue
            m = re.search(r"k_lineageLoginCode=(\d+)", a.get("href", ""))
            out[a.get_text(strip=True)] = {
                "belong": tds[i + 3], "erased": "抹消" in tds[i + 1],
                "birth": tds[i + 2].strip(), "code": m.group(1) if m else "",
            }
        nxt = next((a for a in soup.select('a[href*="k_pageNum"]')
                    if "次の" in a.get_text()), None)
        n_page += 1
        if nxt is None or n_page >= MAX_PAGES:
            break
        url = common.NAR + nxt["href"]
        time.sleep(common.sleep_for(url))
    return out


def nar_trainer(code):
    """NAR 马详情页（RaceHorseInfo）→ 調教師。
    原文「長　倉　　　　功（兵庫）」→ 压名字里的全角空格、**保留（所属）尾缀** → 「長倉功（兵庫）」；
    格内无锚（未定厩舎等）→ ""。"""
    soup = common.soup_of(common.NAR_INFO_URL.format(code=code), encoding="utf-8")
    tds = soup.select("table.horse_info_table td")
    for i, td in enumerate(tds):
        if td.get_text(strip=True) == "調教師":
            raw = tds[i + 1].get_text(strip=True) if i + 1 < len(tds) else ""
            return raw.replace("\u3000", "").strip()
    return ""


def fetch_masyoba():
    """抹消馬簿 栗東(1)+美浦(2) → [{name, jiyu, ikisaki, date, kb_id}]。
    免费区即含 事由/行き先/抹消日 全套；约 2 周滚动窗口 → 任务必须日频跑才不漏。
    行内列序（实测）：馬名|生年|性別|厩舎|事由|行き先|抹消日（生年/性別/厩舎 不落库，仅列序占位）。"""
    rows = []
    for page in (1, 2):
        url = common.KB_MASYOBA_URL.format(page=page)
        soup = _kb_soup(url)
        if soup is None:
            continue
        for a in soup.select('a[href*="/db/uma/"]'):
            tr = a.find_parent("tr")
            if tr is None:
                continue
            tds = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
            i = _anchor_td_index(tr, a)
            if i is None or len(tds) < i + 6:
                continue
            m = re.search(r"/db/uma/(\d{6,8})", a.get("href", ""))
            rows.append({
                "name": a.get_text(strip=True), "jiyu": tds[i + 4],
                "ikisaki": tds[i + 5], "date": ymd(tds[i + 6]),
                "kb_id": m.group(1) if m else "",
            })
        time.sleep(common.sleep_for(url))
    return rows


def kb_id_by_search(name):
    """馬検索（父名+马名组合，纯名检索会漏；必带 masyof%5B%5D=1 否则只回現役）→ kb_id。"""
    url = (common.KB_SEARCH_URL + f"?sire={common.quote(common.SIRE_NAME_JA)}"
           f"&bamei={common.quote(name)}&masyof%5B%5D=1")
    html = _kb_html(url)
    m = UMA_HREF_RE.search(html)
    return m.group(1) if m else ""


def kinkyo_date(kb_id):
    """近況履歴 → 抹消日期（YYYY-MM-DD）；页面无该条目 → ""。"""
    html = _kb_html(common.KB_KINKYO_URL.format(kb_id=kb_id))
    m = MASYO_DATE_RE.search(html)
    if not m:
        return ""
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


# ---------------- 状态环：studbook 繁殖登録确认（2026-10 命名环定稿） ----------------
def _stb_name_key(s):
    """归一化馬名（与 basic/fetch_studbook.strip_anno 同口径：去括注 + 全半角统一 + 去空白）。"""
    s = re.sub(r"[（(][^）)]*[）)]", "", s or "")
    s = text.fw2hw(s)
    return s.replace(" ", "").replace("　", "")


def _stb_mare_key(s):
    """母名归一（studbook 侧 → basic 建档侧口径）：（ＵＳＡ）→ 去括注、Ⅱ→II。"""
    return text.norm_mare(text.fw2hw(s or ""))


def fetch_studbook_breeding():
    """父馬別繁殖登録馬 kubun=1(牡→種馬)+2(牝→繁殖) → {(馬名归一): 種馬|繁殖, (母名,生年): 種馬|繁殖}。

    服务端解析现行 hid（规避 studbook hid 重编号后的旧 hid 死链）。返回形态三态：
      - 多结果 → List2 列表页（行 = 馬名|生年|性|父名|母名）
      - 单结果 → 302 到该马档案页（<title> = 繁殖登録马名；行内是血统表，需排除 sire 行）
      - 零结果 → SearchChichiShushi 搜索页（跳过）
    403/网络/解析异常 → None（调用方降级，只留报告，不中断任务）。
    """
    try:
        import requests as _req
        sess = _req.Session()
        sess.headers.update(constants.HEADERS)
    except Exception:
        return None
    out = {}
    for kubun, label in (("1", "種馬"), ("2", "繁殖")):
        url = (common.STUD + "/users/ja/SearchChichiShushiList"
               f"?kubun={kubun}&initial={common.quote(sire_config.studbook_name())}")
        try:
            html = common.fetch(url, session=sess, retries=1)   # 403 快失败（CI 出口 IP 被拦）
        except Exception as e:
            print(f"  ⚠ studbook 繁殖登録检查（{label}）失败：{e} → 本轮降级")
            return None
        soup = common.BeautifulSoup(html, "lxml")
        title_m = re.search(r"<title>\s*(.*?)\s*公益", html)
        title = title_m.group(1).strip() if title_m else ""
        sire_key = _stb_name_key(sire_config.studbook_name())
        rows = []
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            a = tr.find("a", href=True)
            if len(tds) < 5 or not a or ("sid=" not in a["href"] and "hid=" not in a["href"]):
                continue
            n0 = tds[0].get_text(" ", strip=True)
            if not n0 or _stb_name_key(n0) == sire_key:      # 排除 sire 自身血统行
                continue
            rows.append((tds[0].get_text(" ", strip=True),
                         tds[1].get_text(" ", strip=True),
                         tds[4].get_text(" ", strip=True)))
        if rows:
            for nm, yr, mare in rows:
                out[_stb_name_key(nm)] = label
                mk, y = _stb_mare_key(mare), yr.strip()
                if mk and y:
                    out[(mk, y)] = label
        elif title and title not in _STB_TITLE_LIST:
            out[_stb_name_key(title)] = label                # 单结果：<title> = 繁殖登録马名
        time.sleep(common.sleep_for(common.STUD + "/users/ja/SearchChichiShushiList"))
    return out


def main():
    ap = argparse.ArgumentParser(description="JRA 抹消/去向/地方调教师 → 直写 basic.json")
    ap.add_argument("--dry-run", action="store_true", help="只出报告，不写 basic.json")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    by_name = {}
    for h in horses:
        nm = (h.get("馬名") or "").strip()
        if nm:
            by_name.setdefault(nm, h)

    overrides = common.load_overrides()

    def ov_of(h):
        """该马的人工表条目（无 → {}）。"""
        return overrides.get(str(h.get("id"))) or {}

    def pinned(h, *keys):
        """人工钉了任一给定键 → 任务不碰对应字段（人工优先，防合并回放后乒乓）。"""
        ov = ov_of(h)
        return any(k in ov for k in keys)

    changes = []        # (id, 馬名, 字段, 旧, 新, 来源)
    todos = []          # (id, 馬名, 待办原因)——真正需要人工决策的
    observe = []        # 观察记录（正常终态：未登录/未出走/海外等，仅留痕不催人工）
    skips_jra = []      # NAR 所属=JRA（用户定稿跳过）
    skips_pinned = []   # 人工钉跳过
    offsite = []        # NAR 命中但不在库（理论不该发生，观察用）

    def set_val(h, field, new, source):
        old = h.get(field, "")
        if str(old) == str(new):
            return
        h[field] = new
        changes.append((h.get("id"), h.get("馬名"), field, old or "∅", new, source))

    # ---- 1) NAR：所属場=地方 → 确认去向 + 調教師；JRA 一律跳过 ----
    nar = fetch_nar()
    masyo = fetch_masyoba()
    masyo_by_name = {r["name"]: r for r in masyo}
    n_local = sum(1 for r in nar.values() if r["belong"] not in NAR_SKIP_BELONG)

    for name, r in nar.items():
        h = by_name.get(name)
        if h is None:
            offsite.append(name)
            continue
        if r["belong"] in NAR_SKIP_BELONG:
            skips_jra.append(f"{name}（{r['belong']}{'·抹消' if r['erased'] else ''}）")
            continue
        if pinned(h, "抹消_去向種別", "抹消_去向場所"):
            skips_pinned.append(f"{name}（NAR·{r['belong']}）")
            continue
        if r["birth"] and h.get("生年月日", "")[:4] and r["birth"] != h["生年月日"][:4]:
            todos.append((h.get("id"), name, f"生年不一致 NAR={r['birth']} 库={h['生年月日'][:4]}，需人工核对"))
            continue
        set_val(h, "登録状態", "抹消", "NAR")
        set_val(h, "抹消_去向種別", "地方競馬", "NAR")
        set_val(h, "抹消_去向場所", r["belong"], "NAR")
        if r["code"] and not pinned(h, "調教師"):
            t = nar_trainer(r["code"])
            if t:
                # 防格式乒乓（2026-10 用户定稿）：同训马师（仅 全半角括号/所属/空格 差异）不写，
                # 保留现值；现值空或真换人 → 规范化写入。三写者统一走 text.trainer_guard。
                g = text.trainer_guard(h.get("調教師", ""), t)
                if g is not None:
                    set_val(h, "調教師", g, "NAR")
            time.sleep(common.sleep_for(common.NAR_INFO_URL))
        if not h.get("抹消日") and not pinned(h, "抹消日"):
            kb = (ov_of(h).get("kb_id") or masyo_by_name.get(name, {}).get("kb_id")
                  or h.get("kb_id") or "")
            if not kb and _kb_ok:
                kb = kb_id_by_search(name)
                time.sleep(common.sleep_for(common.KB_SEARCH_URL))
            if kb:
                if not pinned(h, "kb_id"):
                    set_val(h, "kb_id", kb, "keibabook")
                if _kb_ok:
                    time.sleep(common.sleep_for(common.KB_KINKYO_URL))
                    d = kinkyo_date(kb)
                    if d:
                        set_val(h, "抹消日", d, "keibabook")
                    else:
                        observe.append(f"{name}：近況履歴无抹消条目（kb={kb}；未出走属正常）")
            elif _kb_ok:
                observe.append(f"{name}：馬検索未命中 kb_id（海外/名义差异等）")
        elif not h.get("kb_id") and not pinned(h, "kb_id"):
            kb = masyo_by_name.get(name, {}).get("kb_id")
            if kb:
                set_val(h, "kb_id", kb, "keibabook")

    # ---- 2) 抹消馬簿：命中即落 抹消日/事由/行き先（行き先可细化 NAR 的所属場，如 兵庫→園田） ----
    for row in masyo:
        h = by_name.get(row["name"])
        if h is None:
            continue
        if pinned(h, "抹消_去向種別", "抹消_去向場所") and pinned(h, "抹消日"):
            skips_pinned.append(f"{row['name']}（抹消馬簿·{row['jiyu']}）")
            continue
        src = f"抹消馬簿·{row['jiyu']}"
        if row["date"] and not pinned(h, "抹消日"):
            set_val(h, "登録状態", "抹消", src)
            set_val(h, "抹消日", row["date"], src)
        kind = JIYU_MAP.get(row["jiyu"], "")
        if kind and not pinned(h, "抹消_去向種別"):
            set_val(h, "抹消_去向種別", kind, src)
        if row["ikisaki"] and row["ikisaki"] != "未定" and not pinned(h, "抹消_去向場所"):
            set_val(h, "抹消_去向場所", row["ikisaki"], src)
        if row["kb_id"] and not pinned(h, "kb_id"):
            set_val(h, "kb_id", row["kb_id"], "keibabook")

    # ---- 3) keibabook 补查（用户定稿触发）：抹消/空白 + 无去向 + 人工无值 → 查马页/近況履歴 ----
    # 产出：中央抹消标=确凿抹消证据（可补 登録状態/抹消日）；厩舎栏非中央地名=地方去向证据；
    #       无抹消标（未登录/未出走）→ 仅观察报告。乗馬/繁殖去向免费页无记录，靠抹消馬簿窗口。
    kb_checked = 0
    for h in horses:
        if not _kb_ok:
            break           # keibabook 降级：跳过补查（由本机 scripts/studbook_sync.py 补跑）
        nm = (h.get("馬名") or "").strip()
        if not nm or h.get("登録状態", "") not in ("抹消", ""):
            continue
        if h.get("抹消_去向種別"):
            continue
        if pinned(h, "抹消日", "抹消_去向種別", "抹消_去向場所"):
            continue
        kb = (ov_of(h).get("kb_id") or masyo_by_name.get(nm, {}).get("kb_id")
              or h.get("kb_id") or "")
        if not kb:
            kb = kb_id_by_search(nm)
            time.sleep(common.sleep_for(common.KB_SEARCH_URL))
        if not kb:
            observe.append(f"{nm}：馬検索未命中 kb_id（海外/名义差异等）")
            continue
        if not pinned(h, "kb_id"):
            set_val(h, "kb_id", kb, "keibabook")
        kb_checked += 1
        erased, place, tr = kb_page(kb)
        time.sleep(common.sleep_for(common.KB_KINKYO_URL))
        src = f"keibabook·马页"
        if erased:
            if not h.get("抹消日"):
                d = kinkyo_date(kb)
                if d:
                    set_val(h, "登録状態", "抹消", src)
                    set_val(h, "抹消日", d, src)
                else:
                    set_val(h, "登録状態", "抹消", src)   # 抹消标已构成确凿证据
                    observe.append(f"{nm}：kinkyo 无抹消条目（未出走抹消属少见，可复核 kb={kb}）")
            if place and place not in KB_CENTER and not h.get("抹消_去向場所"):
                set_val(h, "抹消_去向種別", "地方競馬", src)
                set_val(h, "抹消_去向場所", place, src)
        elif not h.get("登録状態"):
            observe.append(f"{nm}：keibabook 无中央登録记录（未登录/未出走属正常）")

    # ---- 3.5) studbook 繁殖登録确认（状态环：空/抹消 + 无去向 → 确认 繁殖/種馬；CI 403 降级） ----
    stb = fetch_studbook_breeding()
    if stb is None:
        observe.append("studbook 繁殖登録检查不可用（403/网络/解析；CI 出口 IP 被拦属正常，"
                       "本机可补跑 python scripts/studbook_sync.py）")
    else:
        for h in horses:
            if pinned(h, "抹消_去向種別"):
                continue
            nm = (h.get("馬名") or "").strip()
            label = stb.get(_stb_name_key(nm))
            if label is None:
                mk, yr = _stb_mare_key(h.get("母名", "")), str(h.get("生年", "") or "").strip()
                if mk and yr:
                    label = stb.get((mk, yr))
            if label is None:
                continue
            st = h.get("登録状態", "")
            if st not in ("抹消", ""):
                # 现役/其他 却已繁殖登録 → 库内状态疑似滞后，仅报告待人工核（不擅自改 登録状態）
                todos.append((h.get("id"), nm,
                              f"studbook 已繁殖登録({label}) 但库内登録状態={st or '空'}，需人工核（应已退役）"))
                continue
            cur = h.get("抹消_去向種別", "")
            if cur and cur != label:
                todos.append((h.get("id"), nm,
                              f"去向冲突：库内={cur} vs studbook 繁殖登録={label}，需人工核对"))
                continue
            if cur == label:
                observe.append(f"{nm}：studbook 繁殖登録确认（{label}），去向已一致")
                continue
            if st == "":
                set_val(h, "登録状態", "抹消", "studbook繁殖登録")   # 空登録 → 繁殖登録即退役证据
            set_val(h, "抹消_去向種別", label, "studbook繁殖登録")
            observe.append(f"{nm}：studbook 繁殖登録确认 → 抹消_去向種別={label}")

    # ---- 4) 报告 + 落库 ----
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# 登録状态任务报告",
        f"- 运行：{stamp}{'（DRY-RUN，未落库）' if args.dry_run else ''}",
        f"- NAR 快照：{len(nar)} 匹（地方 {n_local} / JRA 跳过 {len(skips_jra)} / 库外 {len(offsite)}）",
        f"- 抹消馬簿：栗東+美浦 {len(masyo)} 行",
        f"- keibabook 补查（抹消/空白·无去向）：{kb_checked} 匹",
        f"- keibabook 可用性：{'可用' if _kb_ok else '降级（403/不可达，抹消/去向/kb_id 需本机补跑）'}",
        f"- studbook 繁殖登録：{'可用' if stb is not None else '降级（403/不可达）'}",
        f"- 变更 {len(changes)} 项 / 人工钉跳过 {len(skips_pinned)} / 待办 {len(todos)}",
        "",
        "## 变更明细",
    ]
    if changes:
        lines += ["| id | 馬名 | 字段 | 旧 → 新 | 来源 |", "|---|---|---|---|---|"]
        lines += [f"| {i} | {n} | {f} | {o} → {v} | {s} |" for i, n, f, o, v, s in changes]
    else:
        lines += ["（无变更）"]
    lines += ["", "## 跳过 · NAR 所属=JRA（用户定稿：不深挖）",
              "、".join(skips_jra) if skips_jra else "（无）",
              "", "## 跳过 · 人工钉",
              "、".join(skips_pinned) if skips_pinned else "（无）",
              "", "## 观察（正常终态，仅留痕）",
              "\n".join(f"- {o}" for o in observe) if observe else "（无）",
              "", "## 待办（需人工）"]
    lines += [f"- {i} {n}：{w}" for i, n, w in todos] or ["（无）"]
    if offsite:
        lines += ["", "## NAR 命中但库外", "、".join(offsite)]
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"✔ NAR {len(nar)} 匹（地方 {n_local} / JRA跳过 {len(skips_jra)}）｜抹消馬簿 {len(masyo)} 行"
          f"｜keibabook {'可用' if _kb_ok else '降级'}｜studbook {'可用' if stb is not None else '降级'}")
    print(f"✔ 变更 {len(changes)} 项｜人工钉跳过 {len(skips_pinned)}｜待办 {len(todos)}")
    print(f"✔ 报告：{REPORT_PATH}")
    if args.dry_run:
        print("✔ DRY-RUN：未写 basic.json")
        return
    common.save_basic(data)
    print("✔ 已写回 basic.json（跑 merge/build 后进 dist）")


if __name__ == "__main__":
    main()
