# -*- coding: utf-8 -*-
"""阶段2 删改脚本：对 $BASE 的构建产物随机删改，并写 MUTATE-LOG.md。

用法: python mutate_test.py <BASE>
"""
import io
import json
import os
import sys

BASE = sys.argv[1]
LOG = []

def add(row):
    LOG.append(row)

def rel(path):
    return os.path.relpath(path, BASE)

# ---------- 读文件辅助 ----------
def read_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def write_json(p, obj):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")

basic_p = os.path.join(BASE, "data", "basic.json")
reg_p   = os.path.join(BASE, "data", "registry.json")
hist_p  = os.path.join(BASE, "history", "20260826_1619.json")
ped7_p  = os.path.join(BASE, "data", "pedigree", "7.json")

basic = read_json(basic_p)
reg   = read_json(reg_p)
hist  = read_json(hist_p)

def horse_by_id(arr, hid):
    return next((h for h in arr if h.get("id") == hid), None)

# ================= M1: basic.json id=4 馬名 =================
h4 = horse_by_id(basic["horses"], 4)
add(["M1", rel(basic_p), f"id=4 馬名", h4["馬名"], "测试马"])
h4["馬名"] = "测试马"

# ================= M3: basic.json id=12 毛色 =================
h12 = horse_by_id(basic["horses"], 12)
add(["M3", rel(basic_p), f"id=12 毛色", h12["毛色"], "青毛"])
h12["毛色"] = "青毛"

# ================= M7: basic.json id=21 獲得賞金 =================
h21 = horse_by_id(basic["horses"], 21)
add(["M7", rel(basic_p), f"id=21 獲得賞金", h21["獲得賞金"], "999万円"])
h21["獲得賞金"] = "999万円"

# ================= M10a: basic.json id=30 id 改 =================
h30 = horse_by_id(basic["horses"], 30)
add(["M10a", rel(basic_p), f"id=30 id", h30["id"], 999])
h30["id"] = 999

# ================= M4: registry.json 删除 id=20 整条 =================
r20 = horse_by_id(reg["horses"], 20)
reg["horses"] = [h for h in reg["horses"] if h.get("id") != 20]
add(["M4", rel(reg_p), f"id=20 整条删除 (レッドラージャ)", json.dumps(r20, ensure_ascii=False), "(删除)"])

# ================= M5: registry.json id=7 names 改 =================
r7 = horse_by_id(reg["horses"], 7)
add(["M5", rel(reg_p), f"id=7 names[0]", r7["names"][0], "サガルマータ改"])
r7["names"][0] = "サガルマータ改"

# ================= M10b: registry.json id=40 keys.nk_id 改 =================
r40 = horse_by_id(reg["horses"], 40)
add(["M10b", rel(reg_p), f"id=40 keys.nk_id", r40["keys"]["nk_id"], "0000000000"])
r40["keys"]["nk_id"] = "0000000000"

# ================= M6: 删除 pedigree/7.json =================
os.remove(ped7_p)
add(["M6", rel(ped7_p), "文件删除", "(存在)", "(已删除)"])

# ================= M9: 篡改 history 快照 id=1 獲得賞金 =================
h1h = horse_by_id(hist, 1)
add(["M9", rel(hist_p), f"id=1 獲得賞金", h1h["獲得賞金"], "1万円"])
h1h["獲得賞金"] = "1万円"

# ================= 写回 =================
write_json(basic_p, basic)
write_json(reg_p, reg)
write_json(hist_p, hist)

# ================= 写 MUTATE-LOG.md =================
lines = [
    "# 删改清单 (MUTATE-LOG)",
    "",
    f"- 基线目录: `{BASE}`",
    "- 时间: 阶段2 删改",
    "- 说明: M2/M8（racefiles）无对象（from-0 limit-50 基线 racefiles/ 为空），故未测；",
    "  M10 拆分为 M10a(basic.id) 与 M10b(registry.nk_id) 两类身份改动。",
    "",
    "| 删改编号 | 位置 | 目标 | 删改前 | 删改后 |",
    "|---|---|---|---|---|",
]
for row in LOG:
    rid, loc, target, before, after = row
    lines.append(f"| {rid} | `{loc}` | {target} | `{before}` | `{after}` |")

with open(os.path.join(BASE, "MUTATE-LOG.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print("=== MUTATE-LOG 完成 ===")
for row in LOG:
    print(" | ".join(str(x) for x in row))
