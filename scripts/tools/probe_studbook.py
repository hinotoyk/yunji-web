#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探针：验证 studbook.jp 链路可行性（临时脚本，非生产）。
链路：
  Step2: SearchBameiList 搜 コントレイル → 选出父亲为 ディープインパクト 的那匹 → hid
  Step1: SearchChichiKettouList?hid=..&birthYear=.. 按年产駒列表 → 各马 Honba?sid=..
  Step3: Honba?sid=.. → 读取 意味・由来
"""
import io
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

STUD = "https://www.studbook.jp"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
S = requests.Session()
S.headers.update(HEADERS)


def fetch(url, **kw):
    r = S.get(url, timeout=30, **kw)
    r.encoding = "utf-8"
    print(f"  GET {url} -> {r.status_code}")
    r.raise_for_status()
    return r.text


def step2_search_bamei(name="コントレイル"):
    """SearchBameiList 检索 → 返回所有候选行的 (馬名, 父名, hid)"""
    url = (STUD + "/users/ja/SearchBameiList"
           f"?initial_forward={requests.utils.quote(name)}&submit=馬名検索")
    html = fetch(url)
    soup = BeautifulSoup(html, "lxml")
    print("\n===== Step2 检索页面 (SearchBameiList) =====")
    print(html[:1500])
    print("...")
    # 尝试找表格行
    rows = soup.find_all("tr")
    print(f"  <tr> 数量: {len(rows)}")
    for tr in rows:
        tds = tr.find_all("td")
        if not tds:
            continue
        cells = [td.get_text(" ", strip=True) for td in tds]
        links = tr.find_all("a", href=True)
        hids = [a["href"] for a in links if "hid=" in a["href"]]
        print("  ROW cells=", cells, " hids=", hids)
    return html


def step2_get_hid(name="コントレイル", father="ディープインパクト"):
    """SearchBameiList → 选出 父=father 的那匹 → 返回 hid"""
    url = (STUD + "/users/ja/SearchBameiList"
           f"?initial_forward={requests.utils.quote(name)}&submit=馬名検索")
    html = fetch(url)
    soup = BeautifulSoup(html, "lxml")
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        row_name = tds[0].get_text(" ", strip=True)
        father_cell = tds[3].get_text(" ", strip=True) if len(tds) > 3 else ""
        a = tr.find("a", href=True)
        if father and father not in father_cell:
            continue
        if a and "hid=" in a["href"]:
            m = re.search(r"hid=(\d+)", a["href"])
            print(f"  ✔ 候选: {row_name} | 父={father_cell} | hid={m.group(1) if m else a['href']}")
            if m:
                return m.group(1)
    return None


def step1_progeny(hid, birth_year="2023"):
    """SearchChichiKettouList → 该年产駒列表 → 返回 [(sid, 馬名, 性別, 生年)]"""
    url = (STUD + "/users/ja/SearchChichiKettouList2"
           f"?hid={hid}&kid=&birthYear={birth_year}")
    html = fetch(url)
    soup = BeautifulSoup(html, "lxml")
    print("\n===== Step1 産駒列表 (SearchChichiKettouList2) =====")
    print(html[:1200])
    rows = soup.find_all("tr")
    print(f"  <tr> 数量: {len(rows)}")
    out = []
    for tr in rows:
        tds = tr.find_all("td")
        if not tds:
            continue
        cells = [td.get_text(" ", strip=True) for td in tds]
        a = tr.find("a", href=True)
        sid = None
        if a and "sid=" in a["href"]:
            m = re.search(r"sid=(\d+)", a["href"])
            sid = m.group(1) if m else None
        out.append((sid, cells, a["href"] if a else ""))
        print("  ROW cells=", cells, " sid=", sid)
    return out


def step3_honba(sid, dump=False):
    """Honba?sid=.. → 读取 意味・由来（th/td 结构）"""
    url = STUD + f"/users/ja/Honba?sid={sid}"
    html = fetch(url)
    soup = BeautifulSoup(html, "lxml")
    print(f"\n===== Step3 Honba sid={sid} =====")
    meaning = ""
    for th in soup.find_all("th"):
        if "意味" in th.get_text() and "由来" in th.get_text():
            td = th.find_next("td")
            if td:
                meaning = td.get_text(" ", strip=True)
    print(f"  [意味・由来] = {meaning!r}")
    if dump:
        i = html.find("意味・由来")
        print("  --- HTML around 意味・由来 ---")
        print(html[max(0, i - 400):i + 400])
    return {"sid": sid, "意味・由来": meaning, "html": html}


def step1_progeny_paged(hid, birth_year, sleep=0.4):
    """SearchChichiKettouList2 → 该年全部产驹（处理分页）→ [(sid, name, sex)]"""
    out = {}
    page = 0
    while True:
        page += 1
        url = (STUD + "/users/ja/SearchChichiKettouList2"
               f"?hid={hid}&kid=&birthYear={birth_year}&page={page}")
        html = fetch(url)
        soup = BeautifulSoup(html, "lxml")
        got = 0
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            a = tr.find("a", href=True)
            if len(tds) < 4 or not a or "sid=" not in a["href"]:
                continue
            m = re.search(r"sid=(\d+)", a["href"])
            if not m:
                continue
            name = tds[0].get_text(" ", strip=True)
            sex = tds[2].get_text(" ", strip=True)
            out[m.group(1)] = (name, sex)
            got += 1
        # 分页判断：找页面底部
        text = soup.get_text("\n", strip=True)
        has_more = f"page={page + 1}" in html or f"page={page+1}" in html
        print(f"  {birth_year} page {page}: +{got} (累计 {len(out)}) has_more={has_more}")
        if not has_more or got == 0:
            break
        time.sleep(sleep)
    return out


def scan_years(hid, years=("2023", "2024", "2025"), sample_limit=3, sleep=0.4):
    """扫描各年产駒，抽样读取 意味・由来"""
    grand = {}
    for y in years:
        rows = step1_progeny_paged(hid, y, sleep)
        grand[y] = rows
        print(f"  ✔ {y}年 共 {len(rows)} 匹")
    print("\n===== 抽样读取 意味・由来 =====")
    with_mean = 0
    empty = []
    for y, rows in grand.items():
        for sid, (name, sex) in list(rows.items())[:sample_limit]:
            r = step3_honba(sid)
            if r["意味・由来"]:
                with_mean += 1
            else:
                empty.append((y, name))
            time.sleep(sleep)
    print(f"\n抽样: 有意味={with_mean} 空={len(empty)} {empty}")
    return grand


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "step2"
    if which == "step2":
        step2_search_bamei()
    elif which == "chain":
        hid = step2_get_hid()
        print(f"\n✔ 得到 hid = {hid}")
        rows = step1_progeny(hid, "2023")
        if rows:
            for sid, cells, href in rows:
                if sid:
                    print(f"\n✔ 取第一匹 sid={sid} {cells}")
                    step3_honba(sid)
                    break
    elif which == "scan":
        hid = step2_get_hid()
        print(f"\n✔ 得到 hid = {hid}")
        scan_years(hid)
    else:
        print("usage: probe_studbook.py step2 | chain | scan")


if __name__ == "__main__":
    main()
