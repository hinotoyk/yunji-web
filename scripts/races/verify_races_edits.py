#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""races_edits 套用（merge_races.apply_race_edits / entry_match_keys）隔离单测：纯函数、不碰 data/、不联网。

覆盖（10 例）：台账行 del（race_id 空，条目只有 馬名——2026-10-26 键名归一的回归点）/ 台账行 mod /
带 race_id 的 del / mod 走 horse 双键 / add 与已有去重 / add 与同表 add 去重 / add 缺省（來源·本賞金）/
mod 值 null = 删键 / 空表 no-op / 条目 馬名 归一后 origin 条目不被污染 + 自带 出走馬名 优先。

用法: python scripts/races/verify_races_edits.py
"""
import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "races"))

import common as C          # noqa: E402
import merge_races as M     # noqa: E402

PASS = 0


def ok(cond, msg):
    global PASS
    assert cond, "FAIL: " + msg
    PASS += 1
    print("  ok  " + msg)


# 三条记录：① 现代赛（有 race_id）② 台账行（无 race_id，同马同日）③ 另一匹马（有 race_id）
RECS = [
    {"race_id": "2023-1-1", "日付": "2023-01-05", "出走馬名": "テストホース", "レース名": "A", "着順": "1"},
    {"日付": "2024-02-02", "出走馬名": "テストホース", "レース名": "B", "着順": "2"},
    {"race_id": "2025-3-3", "日付": "2025-03-03", "出走馬名": "別ホース", "レース名": "C", "着順": "3"},
]


def recs():
    return copy.deepcopy(RECS)


def run(ed):
    return M.apply_race_edits(recs(), ed)


# 0) 台账行：旧口径（只读 出走馬名）键集为空 → 静默无效；归一后必须命中
entry_ledger = {"id": "42", "race_id": "", "日付": "2024-02-02", "馬名": "テストホース"}
ok(C.record_keys(entry_ledger) == set(), "旧口径：台账条目（只有 馬名）键集为空 → del/mod 会静默失效（复现原 bug）")
ok(M.entry_match_keys(entry_ledger) == {"horse:テストホース|2024-02-02"}, "归一后：台账条目得到 horse:馬名|日付 键")

# 1) 台账行 del
out, st = run({"del": [entry_ledger]})
ok(st == {"del": 1, "mod": 0, "add": 0} and len(out) == 2
   and all(r["レース名"] != "B" for r in out), "台账行 del 命中（只删那一条，其余不动）")

# 2) 台账行 mod
out, st = run({"mod": [{"race_id": "", "日付": "2024-02-02", "馬名": "テストホース", "set": {"着順": "5"}}]})
ok(st["mod"] == 1 and [r["着順"] for r in out] == ["1", "5", "3"], "台账行 mod 命中（只改目标行）")

# 3) 带 race_id 的 del
out, st = run({"del": [{"id": "1", "race_id": "2023-1-1", "日付": "2023-01-05", "馬名": "テストホース"}]})
ok(st["del"] == 1 and len(out) == 2 and all(r["レース名"] != "A" for r in out), "带 race_id 的 del 命中 race 键")

# 4) mod 走 horse 键（条目不带 race_id，靠 馬名+日付）
out, st = run({"mod": [{"race_id": "", "日付": "2023-01-05", "馬名": "テストホース", "set": {"着順": "9"}}]})
ok(st["mod"] == 1 and out[0]["着順"] == "9", "mod 走 horse:{馬名}|{日付} 键")

# 5) add 与已有记录重复 → 跳过
out, st = run({"add": [{"race_id": "2025-3-3", "日付": "2025-03-03", "出走馬名": "別ホース"}]})
ok(st["add"] == 0 and len(out) == 3, "add 与已有记录双键重复 → 跳过")

# 6) add 与同表 add 重复 → 只入一条
dup = {"race_id": "2027-9-9", "日付": "2027-09-09", "出走馬名": "新ホース", "レース名": "D"}
out, st = run({"add": [dup, dict(dup)]})
ok(st["add"] == 1 and len(out) == 4, "同表 add 双键去重（只入 1 条）")

# 7) add 缺省补 來源/本賞金，且剥掉 id
out, st = run({"add": [dict(dup, id="99")]})
new = out[-1]
ok(st["add"] == 1 and new.get("來源") == "人工" and new.get("本賞金") == 0 and "id" not in new,
   "add 缺省（來源=人工 / 本賞金=0）+ 落库剥 id")

# 8) mod 值 null = 删键
out, st = run({"mod": [{"race_id": "2025-3-3", "日付": "2025-03-03", "馬名": "別ホース", "set": {"レース名": None}}]})
ok(st["mod"] == 1 and "レース名" not in out[2], "mod 值 null → 删键（恢复未抓取状态）")

# 9) 空表 no-op（记录原样返回）
out, st = run({})
ok(st == {"del": 0, "mod": 0, "add": 0} and out == RECS, "空表 no-op")

# 10) 条目不被污染 + 自带 出走馬名 优先
e = {"race_id": "", "日付": "2025-03-03", "馬名": "ニセ", "出走馬名": "別ホース"}
snapshot = copy.deepcopy(e)
M.entry_match_keys(e)
ok(e == snapshot, "entry_match_keys 不污染调用方条目（复制后归一）")
out, st = run({"del": [e]})
ok(st["del"] == 1 and len(out) == 2 and all(r["レース名"] != "C" for r in out), "条目自带 出走馬名 优先于 馬名")

print("PASS: races_edits 套用 %d 项断言全部通过（含台账行键名归一）。" % PASS)
