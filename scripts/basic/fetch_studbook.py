#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""并发3（命名环）：studbook.jp → 馬名意味 / 欧字馬名 / 空名回填 → basic.json。

链路（复用探针验证过的完整链路）：
  Step2: SearchBameiList 搜コントレイル → 选出 父=ディープインパクト 的那匹 → 现行 hid
         （服务端解析当前 hid；studbook 做过 hid 重编号，血统页内嵌旧 hid 会 404，勿硬编码）
  Step1a: SearchChichiKettouList2?hid=..&birthYear=.. 各年产駒列表（翻页）→ 每匹 sid + 馬名/生年/性/母名
          （列位：馬名|生年|性|父名|母名，5 列）—— 覆盖「非繁殖登録」的仔（赛马/未命名）
  Step1b: SearchChichiShushiList2?hid=..&kubun=1/2 父馬別繁殖登録馬 —— 覆盖「已繁殖登録」的仔
          （studbook 数据模型：马要么在血統登録列表、要么在繁殖登録列表，不在两个列表都出现，
           只扫血統登録会漏掉如 ゲンパチミスティ 这种已入繁殖的仔）
  Step3: 意味・由来 + 欧字馬名：多结果行抓 Honba?sid|hid=..；繁殖登録单结果页本身内联档案（含意味）

匹配（2026-10 命名环定稿，用户口径「只自动 空→有；非空不一致只进报告」）：
  - 主键1 = 馬名（strip_anno 归一化：去括注 + 全半角统一 + 去空白）
  - 主键2 = (母名归一, 生年)：母名归一 = text.norm_mare(text.fw2hw())，与 build_registry.clean_mare
    建档口径一致（（ＵＳＡ）→ 去括注、Ⅱ→II）；性別作交叉校验（两侧都已知且冲突 → 跳过进报告，不猜）。
    空名马（basic 馬名=""）只能靠主键2命中。
  - 空名回填：basic 馬名为空 + studbook 有真名（非「馬名未登録」占位）→ 写 _tmp/studbook_name.json，
    merge_basic 只在「空→有」时写入、不覆盖已有真名。
  - 命名冲突：basic 已有真名 ≠ studbook 马名（如出口马 英文名 vs studbook 日文名）→ 只进报告，不覆盖。
  - 库外産駒 / 库内但 studbook 未见：本期只进报告提示（新马候选 / 未登録或流产候选），不自动建档。

独立链路，尽力而为：抓不到某匹不影响其他。--force 强制重抓。

⚠ 403（CI 出口 IP 被 studbook 拦，2026-09 起）：优雅退出（exit=1，不写缓存），
  不再抛裸 traceback；本机直连正常时可本地补抓：python scripts/studbook_sync.py。

用法:
    python fetch_studbook.py [--year 2023,2024] [--sleep 0.5] [--force] [--limit N]
"""
import argparse
import re
import sys
import time
from urllib.parse import quote

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402  （common 已把 scripts/ 置入 sys.path）
from core import sire_config, text  # noqa: E402

STUD = common.STUD
S = common.requests.Session()
S.headers.update(common.HEADERS)

_STB_UNNAMED = {"馬名未登録"}
_STB_TITLE_LIST = {"父馬別繁殖登録馬", "父馬別繁殖登録馬 産駒一覧"}


def fetch(url):
    """走 common.fetch（带重试 + 风控日志 + host 记录），复用会话保持 cookies。"""
    return common.fetch(url, session=S)


def strip_anno(name):
    """去括注及内容 + 全半角统一 + 去空白 → 归一化馬名。"""
    s = re.sub(r"[（(][^）)]*[）)]", "", name or "")
    s = text.fw2hw(s)   # 全量版全角→半角（原本地逐字循环转换等价收进 core/text，R7）
    return s.replace(" ", "").replace("　", "")


def db_name(name):
    """studbook 馬名 → 落库口径：去（ＪＰＮ）括注，保留全角字母（与 build_registry 建档口径一致）。"""
    return re.sub(r"[（(][^）)]*[）)]", "", name or "").strip()


def is_stb_unnamed(name):
    """studbook 未命名占位判定：空 / 馬名未登録 / 全角下划线。"""
    s = (name or "").replace("＿", "").replace("_", "").strip()
    return s == "" or s in _STB_UNNAMED


def sex_code(s):
    """性別 → M/F：牡/♂/セ(骟)=M，牝/♀=F；未知="". """
    s = (s or "").strip()
    if s in ("牡", "♂", "セ", "セン"):
        return "M"
    if s in ("牝", "♀"):
        return "F"
    return ""


def norm_eu(name):
    """欧字馬名归一化：去（ＪＰＮ）等括注 + 全半角统一 + 空白压单空格。
    例：Ｊｅｗｅｌｒｙ　Ｌｅｗｉｓ（ＪＰＮ） → Jewelry Lewis"""
    s = re.sub(r"[（(][^）)]*[）)]", "", name or "")
    s = text.fw2hw(s)
    return re.sub(r"\s+", " ", s).strip()


def mare_key(mare):
    """母名归一（studbook 侧）：先全角→半角（（ＵＳＡ）→(USA)），再 norm_mare 去括注 + 罗马数字统一。
    与 build_registry.clean_mare（basic 建档侧）产出同口径，供 (母名,生年) 匹配。"""
    return text.norm_mare(text.fw2hw(mare or ""))


def get_hid(name=None, father=None):
    """搜馬名 → 现行 hid。name/father 缺省读 config/sire.json 的 sire.studbook（S3 配置化）；
    显式传值（含空串）时按原行为透传（father 为空 = 不按父馬过滤）。

    ⚠ 只认「馬名=种马名」的结果行（防单结果页内嵌血统表里的旧/其它 hid 被误抓）。"""
    if name is None:
        name = sire_config.studbook_name()
    if father is None:
        father = sire_config.studbook_father()
    url = (STUD + "/users/ja/SearchBameiList"
           f"?initial_forward={quote(name)}&submit=馬名検索")
    html = fetch(url)
    soup = common.BeautifulSoup(html, "lxml")
    want = strip_anno(name)
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        cell0 = tds[0].get_text(" ", strip=True)
        if want and strip_anno(cell0) != want:      # 只认结果行（馬名=种马名）
            continue
        father_cell = tds[3].get_text(" ", strip=True)
        a = tr.find("a", href=True)
        if father and father not in father_cell:
            continue
        if a and "hid=" in a["href"]:
            m = re.search(r"hid=(\d+)", a["href"])
            if m:
                return m.group(1)
    return None


def get_progeny_paged(hid, birth_year, sleep=0.4):
    """该年全部产驹 → {sid: (馬名, 生年, 性, 母名)}（翻页）。
    列位实测：馬名|生年|性|父名|母名（5 列），sid 在行内链接。
    注：已繁殖登録的仔不在此列表（在 get_breeding_offspring 补）。"""
    out = {}
    page = 0
    while True:
        page += 1
        url = (STUD + "/users/ja/SearchChichiKettouList2"
               f"?hid={hid}&kid=&birthYear={birth_year}&page={page}")
        html = fetch(url)
        soup = common.BeautifulSoup(html, "lxml")
        got = 0
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            a = tr.find("a", href=True)
            if len(tds) < 5 or not a or "sid=" not in a["href"]:
                continue
            m = re.search(r"sid=(\d+)", a["href"])
            if not m:
                continue
            out[m.group(1)] = (tds[0].get_text(" ", strip=True),
                               tds[1].get_text(" ", strip=True),
                               tds[2].get_text(" ", strip=True),
                               tds[4].get_text(" ", strip=True))
            got += 1
        has_more = f"page={page + 1}" in html
        print(f"  {birth_year} page {page}: +{got} (累计 {len(out)})")
        if not has_more or got == 0:
            break
        time.sleep(common.sleep_for(url))   # 按域名限速
    return out


def get_breeding_offspring(hid):
    """父馬別繁殖登録馬 kubun=1(牡)+2(牝) → 条目列表（血統登録列表缺的已繁殖仔在此补）。

    多结果 → 列表行（馬名|生年|性|父名|母名，链接 Honba?sid|hid=..），条目带 honba_path 待抓；
    单结果 → SearchChichiShushiList2 直接重定向到该马档案页，意味/欧字 内联在响应里，条目自带；
    零结果 → 跳过。返回 [{"name","year","sex","mare","meaning","eu","honba_path"}]。"""
    out = []
    for kubun in ("1", "2"):
        url = (STUD + "/users/ja/SearchChichiShushiList2"
               f"?hid={hid}&kid=&kubun={kubun}")
        html = fetch(url)
        soup = common.BeautifulSoup(html, "lxml")
        title_m = re.search(r"<title>\s*(.*?)\s*公益", html)
        title = title_m.group(1).strip() if title_m else ""
        sire_key = strip_anno(sire_config.studbook_name())
        rows = []
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            a = tr.find("a", href=True)
            if len(tds) < 5 or not a or ("sid=" not in a["href"] and "hid=" not in a["href"]):
                continue
            n0 = tds[0].get_text(" ", strip=True)
            if not n0 or strip_anno(n0) == sire_key:      # 排除 sire 自身血统行
                continue
            href = a["href"].split("?", 1)[-1]
            rows.append({"name": n0, "year": tds[1].get_text(" ", strip=True),
                         "sex": tds[2].get_text(" ", strip=True),
                         "mare": tds[4].get_text(" ", strip=True),
                         "meaning": "", "eu": "", "honba_path": "/users/ja/Honba?" + href})
        if rows:
            out.extend(rows)
        elif title and title not in _STB_TITLE_LIST and strip_anno(title) != sire_key:
            meaning, eu = parse_honba_html(html)          # 单结果：页面即档案（含意味/欧字）
            out.append({"name": title, "year": "", "sex": "", "mare": "",
                        "meaning": meaning, "eu": eu, "honba_path": ""})
        time.sleep(common.sleep_for(STUD + "/users/ja/SearchChichiShushiList2"))
    return out


def parse_honba_html(html):
    """Honba 档案页 HTML → (意味・由来, 归一化欧字馬名)。"""
    soup = common.BeautifulSoup(html, "lxml")
    meaning, eu_raw = "", ""
    for th in soup.find_all("th"):
        t = th.get_text(" ", strip=True)
        if "意味" in t and "由来" in t:
            td = th.find_next("td")
            if td:
                meaning = td.get_text(" ", strip=True)
        elif t == "欧字馬名":
            td = th.find_next("td")
            if td:
                eu_raw = td.get_text(" ", strip=True)
    return meaning, norm_eu(eu_raw) if eu_raw else ""


def get_honba_fields(path):
    """Honba 页 path（?sid=.. 或 ?hid=..）→ (意味・由来, 归一化欧字馬名)。"""
    return parse_honba_html(fetch(STUD + path))


def main():
    ap = argparse.ArgumentParser(description="studbook 命名环：意味・由来 / 欧字馬名 / 空名回填")
    ap.add_argument("--year", default="2023,2024", help="生年数组")
    ap.add_argument("--sleep", type=float, default=0.5)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    years = [y.strip() for y in args.year.split(",") if y.strip()]

    data = common.load_basic()
    horses = data["horses"]
    # 待抓：无 馬名意味 或 --force（只有这批才写 意味/欧字 缓存）
    todo = [h for h in horses if args.force or not h.get("馬名意味")]
    if args.limit:
        todo = todo[:args.limit]
    todo_ids = {str(h["id"]) for h in todo}

    # 索引覆盖全部马（匹配/报告用）：by_name + by_dam(母名,生年)
    by_name, by_dam = {}, {}
    for h in horses:
        n = strip_anno(h.get("馬名", ""))
        if n:
            by_name.setdefault(n, []).append(h)
        mk = mare_key(h.get("母名", ""))
        yr = str(h.get("生年", "") or "").strip()
        if mk and yr:
            by_dam.setdefault((mk, yr), []).append(h)
    print(f"✔ 待抓 馬名意味 {len(todo)} 匹（索引：按名 {len(by_name)} 匹 / (母名,生年) {len(by_dam)} 匹）")

    fetched = 0
    empty = []               # (sid/名, 馬名) 抓了 Honba 但意味空
    backfilled = []          # (id, 旧, 新) 空名回填
    conflicts = []           # (id, 库内馬名, studbook 馬名) 已有真名 ≠ studbook → 只报告
    still_unnamed = []       # (id, 母名) 库内空名马，studbook 仍馬名未登録
    off_db = []              # (生年, 馬名, 母名) studbook 有而 basic 无（新马候选）
    cache = {}               # {id: 馬名意味}
    cache_eu = {}            # {id: 欧字馬名}
    cache_name = {}          # {id: 馬名}（空名回填，merge 只在空→有写入）
    matched_ids = set()      # 命中过産駒的库内马 id（反向审计「库内但 studbook 未见」）

    def process_entry(name, year, sex, mare, meaning, eu, honba_path):
        """处理一条 studbook 産駒/繁殖登録条目：匹配 → 回填/冲突/抓意味。返回 True=已处理。"""
        nonlocal fetched
        sn = strip_anno(name)
        hits = list(by_name.get(sn) or [])
        mk, yr = mare_key(mare), (year or "").strip()
        if mk and yr:
            for h in by_dam.get((mk, yr), []):
                if h not in hits:
                    hits.append(h)
        if not hits:
            off_db.append((year, db_name(name), mare))
            return True
        matched_ids.update(str(h["id"]) for h in hits)

        # 性別交叉校验（两侧都已知且冲突 → 跳过进报告，不猜）
        stb_sex = sex_code(sex)
        hits_ok = []
        for h in hits:
            db_sex = sex_code(h.get("性別", ""))
            if db_sex and stb_sex and db_sex != stb_sex:
                conflicts.append((h["id"], h.get("馬名", ""),
                                  f"性冲突 {h.get('性別','')} vs studbook {sex}"))
                continue
            hits_ok.append(h)
        if not hits_ok:
            return True

        # 库内空名 → 回填 studbook 馬名（占位不写；仅在待抓集内落库）
        named_stb = not is_stb_unnamed(name)
        for h in hits_ok:
            if not h.get("馬名"):
                if named_stb and str(h["id"]) in todo_ids:
                    cache_name[str(h["id"])] = db_name(name)
                    backfilled.append((h["id"], "∅", db_name(name)))
                else:
                    still_unnamed.append((h["id"], h.get("母名", "")))
            elif named_stb and sn != strip_anno(h.get("馬名", "")):
                conflicts.append((h["id"], h.get("馬名", ""), db_name(name)))

        # 抓意味/欧字：仅待抓集内；studbook 占位名（馬名未登録）意味必空 → 跳过
        need = [h for h in hits_ok if str(h["id"]) in todo_ids and named_stb]
        if not need:
            return True
        if meaning is None and honba_path:
            try:
                meaning, eu = get_honba_fields(honba_path)
            except Exception as e:
                print(f"    ❌ {name}: {e}")
                time.sleep(common.sleep_for(STUD + honba_path))
                return True
        for h in need:
            cache[str(h["id"])] = meaning
            if eu:
                cache_eu[str(h["id"])] = eu
        fetched += 1
        if meaning:
            print(f"  ✔ {name} → {meaning[:30]}")
        else:
            empty.append((name, honba_path or "inline"))
        if honba_path:
            time.sleep(common.sleep_for(STUD + honba_path))
        return True

    try:
        hid = get_hid()
        if not hid:
            sys.exit(f"❌ studbook 未找到{sire_config.studbook_name()}")
        print(f"✔ studbook hid = {hid}")

        # 1b) 繁殖登録列表（血統登録列表缺的已繁殖仔）：单次，不按年
        breeding = get_breeding_offspring(hid)
        print(f"✔ 繁殖登録产驹 {len(breeding)} 匹（血統登録列表缺的在此补）")
        for e in breeding:
            process_entry(e["name"], e["year"], e["sex"], e["mare"],
                          e["meaning"] or None, e["eu"], e["honba_path"])

        # 1a) 血統登録産駒一覧：按年翻页
        for y in years:
            prog = get_progeny_paged(hid, y, args.sleep)
            print(f"  {y} studbook 产驹 {len(prog)} 匹")
            for sid, (name, year, sex, mare) in prog.items():
                process_entry(name, year, sex, mare, None, "",
                              f"/users/ja/Honba?sid={sid}")
                if args.limit and fetched >= args.limit:
                    break
            if args.limit and fetched >= args.limit:
                break
    except common.requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 403:
            # CI 出口 IP 被 studbook 拦（2026-09 起每天如此）：明确退出，不写半截缓存
            print(f"❌ studbook.jp 拒绝访问（HTTP 403，疑似出口 IP 被拦）→ 已停止，未写缓存。")
            print(f"   {e}")
            print("   本机直连正常时可本地补抓：python scripts/studbook_sync.py")
            sys.exit(1)
        raise

    common.write_cache("studbook", cache)
    common.write_cache("studbook_eu", cache_eu)
    common.write_cache("studbook_name", cache_name)
    print(f"\n✔ 完成：意味・由来 {fetched} 匹，空值 {len(empty)} 匹；欧字兜底 {len(cache_eu)} 匹；"
          f"空名回填 {len(cache_name)} 匹")

    # 反向审计：库内空名马没被任何条目命中 → 库内但 studbook 未见（未登録/流产/出口 候选）
    db_no_stb = [(h["id"], h.get("母名", "")) for h in horses
                 if not h.get("馬名") and str(h["id"]) not in matched_ids]

    rep = common.DATA_DIR / "studbook_report.md"
    lines = [
        "# studbook 命名环报告",
        f"- 写入意味 {fetched} · 空值 {len(empty)} · 欧字兜底 {len(cache_eu)}",
        f"- 空名回填 {len(backfilled)} · 命名冲突 {len(conflicts)} · 库外産駒 {len(off_db)}"
        f" · studbook仍未登録 {len(still_unnamed)} · 库内但studbook未见 {len(db_no_stb)}",
        "",
        "## 空名回填（空→有）",
    ]
    lines += (["| id | 旧 | 新 |", "|---|---|---|"] +
              [f"| {i} | {o} | {n} |" for i, o, n in backfilled]) if backfilled else ["（无）"]
    lines += ["", "## 命名冲突（已有真名 ≠ studbook，只报告不覆盖）"]
    lines += (["| id | 库内馬名 | studbook 馬名 |", "|---|---|---|"] +
              [f"| {i} | {n} | {s} |" for i, n, s in conflicts]) if conflicts else ["（无）"]
    lines += ["", "## 库内空名但 studbook 仍未登録"]
    lines += (["| id | 母名 |", "|---|---|"] +
              [f"| {i} | {m} |" for i, m in still_unnamed]) if still_unnamed else ["（无）"]
    lines += ["", "## 库外産駒（studbook 有 · basic 无 —— 新马候选，本期不建档）"]
    lines += (["| 生年 | 馬名 | 母名 |", "|---|---|---|"] +
              [f"| {y} | {n} | {m} |" for y, n, m in off_db]) if off_db else ["（无）"]
    lines += ["", "## 库内但 studbook 未见（未登録/流产/出口 候选，本期不处理）"]
    lines += (["| id | 母名 |", "|---|---|"] +
              [f"| {i} | {m} |" for i, m in db_no_stb]) if db_no_stb else ["（无）"]
    lines += ["", "## 意味空值"]
    lines += (["| sid | 馬名 |", "|---|---|"] +
              [f"| {sid} | {name} |" for name, sid in empty]) if empty else ["（无）"]
    rep.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  详见 {rep}")


if __name__ == "__main__":
    main()
