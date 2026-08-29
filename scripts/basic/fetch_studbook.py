#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""并发3：studbook.jp 意味・由来 → basic.json 的「馬名意味」字段。

链路（复用探针验证过的完整链路）：
  Step2: SearchBameiList 搜コントレイル → 选出 父=ディープインパクト 的那匹 → hid
  Step1: SearchChichiKettouList2?hid=..&birthYear=.. 各年产駒列表（翻页）→ 每匹 sid + 馬名
  Step3: Honba?sid=.. → 读取 意味・由来

匹配：studbook 无母名，只能按「馬名」关联 basic.json。
  归一化：去（ＪＰＮ）等括注 + 全半角统一 + 去空白，匹配 basic.json 的馬名。
  匹配不上（馬名未登録/未命名仔/名字差异）→ 留空，记入报告。

独立链路，尽力而为：抓不到某匹不影响其他。--force 强制重抓。

用法:
    python fetch_studbook.py [--sleep 0.5] [--force] [--limit N]
"""
import argparse
import re
import sys
import time
from urllib.parse import quote

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

STUD = common.STUD
S = common.requests.Session()
S.headers.update(common.HEADERS)


def fetch(url):
    """走 common.fetch（带重试 + 风控日志 + host 记录），复用会话保持 cookies。"""
    return common.fetch(url, session=S)


def full2half(s):
    """全角 → 半角（字母数字标点）。"""
    out = []
    for ch in s or "":
        code = ord(ch)
        if code == 0x3000:
            code = 32
        elif 0xFF01 <= code <= 0xFF5E:
            code -= 0xFEE0
        out.append(chr(code))
    return "".join(out)


def strip_anno(name):
    """去括注及内容 + 全半角统一 + 去空白 → 归一化馬名。"""
    s = re.sub(r"[（(][^）)]*[）)]", "", name or "")
    s = full2half(s)
    return s.replace(" ", "").replace("　", "")


def get_hid(name="コントレイル", father="ディープインパクト"):
    url = (STUD + "/users/ja/SearchBameiList"
           f"?initial_forward={quote(name)}&submit=馬名検索")
    html = fetch(url)
    soup = common.BeautifulSoup(html, "lxml")
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        father_cell = tds[3].get_text(" ", strip=True) if len(tds) > 3 else ""
        a = tr.find("a", href=True)
        if father and father not in father_cell:
            continue
        if a and "hid=" in a["href"]:
            m = re.search(r"hid=(\d+)", a["href"])
            if m:
                return m.group(1)
    return None


def get_progeny_paged(hid, birth_year, sleep=0.4):
    """该年全部产驹 → {sid: (馬名, 性別)}（翻页）。"""
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
            if len(tds) < 4 or not a or "sid=" not in a["href"]:
                continue
            m = re.search(r"sid=(\d+)", a["href"])
            if not m:
                continue
            out[m.group(1)] = (tds[0].get_text(" ", strip=True),
                               tds[2].get_text(" ", strip=True))
            got += 1
        has_more = f"page={page + 1}" in html
        print(f"  {birth_year} page {page}: +{got} (累计 {len(out)})")
        if not has_more or got == 0:
            break
        time.sleep(common.sleep_for(url))   # 按域名限速
    return out


def get_honba_meaning(sid):
    """Honba?sid=.. → 意味・由来文本。"""
    url = STUD + f"/users/ja/Honba?sid={sid}"
    html = fetch(url)
    soup = common.BeautifulSoup(html, "lxml")
    for th in soup.find_all("th"):
        if "意味" in th.get_text() and "由来" in th.get_text():
            td = th.find_next("td")
            if td:
                return td.get_text(" ", strip=True)
    return ""


def main():
    ap = argparse.ArgumentParser(description="studbook 意味・由来 → 馬名意味")
    ap.add_argument("--year", default="2023,2024", help="生年数组")
    ap.add_argument("--sleep", type=float, default=0.5)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    years = [y.strip() for y in args.year.split(",") if y.strip()]

    data = common.load_basic()
    horses = data["horses"]
    # 待抓：无 馬名意味 或 --force
    todo = [h for h in horses if args.force or not h.get("馬名意味")]
    if args.limit:
        todo = todo[:args.limit]
    by_name = {}
    for h in todo:
        n = strip_anno(h.get("馬名", ""))
        if n and not n.startswith("＿"):
            by_name.setdefault(n, []).append(h)
    print(f"✔ 待抓 馬名意味 {len(todo)} 匹（可匹配 {len(by_name)} 匹已登録名）")

    hid = get_hid()
    if not hid:
        sys.exit("❌ studbook 未找到コントレイル")
    print(f"✔ studbook hid = {hid}")

    fetched = 0
    empty = []
    cache = {}                          # {id: 馬名意味} 写独立缓存，不碰 basic.json
    for y in years:
        prog = get_progeny_paged(hid, y, args.sleep)
        print(f"  {y} studbook 产驹 {len(prog)} 匹")
        for sid, (name, sex) in prog.items():
            sn = strip_anno(name)
            hits = by_name.get(sn)
            if not hits:
                continue
            try:
                meaning = get_honba_meaning(sid)
            except Exception as e:
                print(f"    ❌ {name}: {e}")
                time.sleep(common.sleep_for(STUD + f"/users/ja/Honba?sid={sid}"))
                continue
            for h in hits:
                cache[str(h["id"])] = meaning
            fetched += 1
            if meaning:
                print(f"  ✔ {name} → {meaning[:30]}")
            else:
                empty.append((name, sid))
            time.sleep(common.sleep_for(STUD + f"/users/ja/Honba?sid={sid}"))
            if args.limit and fetched >= args.limit:
                break
        if args.limit and fetched >= args.limit:
            break

    common.write_cache("studbook", cache)
    print(f"\n✔ 完成：写入意味・由来 {fetched} 匹，空值 {len(empty)} 匹（缓存 _tmp/studbook.json）")
    if empty:
        rep = common.DATA_DIR / "studbook_report.md"
        rep.write_text("\n".join(
            ["# studbook 意味・由来 报告", "",
             f"- 写入 {fetched}", f"- 空值 {len(empty)}", "",
             "| sid | 馬名 |", "|---|---|"] +
            [f"| {sid} | {name} |" for name, sid in empty]
        ), encoding="utf-8")
        print(f"  详见 {rep}")


if __name__ == "__main__":
    main()
