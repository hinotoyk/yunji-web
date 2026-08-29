#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证：studbook 马名与现有 registry/basic.json 名字能否对上（归一化后）。"""
import io
import json
import re
import sys
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import probe_studbook as p

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass


def norm(name):
    # 去 （ＪＰＮ） 等括注 + 全半角空格
    return re.sub(r"[（(][^）)]*[）)]", "", name or "").replace("　", "").replace(" ", "")


def norm_reg(name):
    # registry 名字形如 馬名+生年（如 グランドウォリアー2025）→ 去掉末尾年份
    n = norm(name)
    return re.sub(r"\d{4}$", "", n)


reg = json.load(open("data/registry.json", encoding="utf-8"))
reg_names = {norm_reg(n) for h in reg["horses"] for n in h["names"]}
reg_names_raw = {norm(n) for h in reg["horses"] for n in h["names"]}
print("registry 归一化名字数(去年份):", len(reg_names))

hid = p.step2_get_hid()
print("hid =", hid)

total = 0
matched = 0
matched_raw = 0
unmatched = []
for y in ("2023", "2024", "2025"):
    rows = p.step1_progeny_paged(hid, y)
    for sid, (name, sex) in rows.items():
        total += 1
        nn = norm(name)
        if norm_reg(name) in reg_names:
            matched += 1
        if nn in reg_names_raw:
            matched_raw += 1
        if norm_reg(name) not in reg_names:
            unmatched.append((y, name))
    print(f"  {y}: 本轮共{len(rows)}匹")

print(f"\n匹配(去registry年份): {matched}/{total}")
print(f"匹配(raw含年份): {matched_raw}/{total}")
unmatched_named = [(y, n) for y, n in unmatched if "馬名未登録" not in n and "未登録" not in n]
print(f"\n未匹配(排除未命名, 共{len(unmatched_named)}):")
for y, n in unmatched_named[:20]:
    print(f"  [{y}] {n}")
