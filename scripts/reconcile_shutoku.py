#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""収得賞金 reconcile 闸门（M4.2，2026-08-19 修订：只对库内样本，阈值 10%）。

设计（data-funnel-v2.md §4.1 / exec M4.2）：
- 13 匹真值 = 用户提供的 JRA 页面収得（拟合期数据）。
- 本脚本只对【库内】样本马对答案：直接从 crops.json 读比赛记录（含本賞金），
  用 racelib.compute_shutoku 复算 → 与真值对比。库外 8 匹不拉取（拟合期已完成，
  规则已定，不再做一次性验证网络抓取）。
- 单匹偏差 >10% → exit 1 并指出怀疑字段（付加賞/本賞金/クラス推导）。

用法:
    python scripts/reconcile_shutoku.py
"""
import io
import json
import sys
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import racelib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CROPS_PATH = ROOT / "data" / "crops.json"

# 阈值：>10% 报错（2026-08-19 用户拍板，从 5% 放宽到 10%）
TOLERANCE = 0.10

# 13 匹 JRA 真值（用户 2026-08-18 提供；单位 = 円；障害=None 表示纯平地马）
# 来源 = JRA 马页「収得賞金」显示值（拟合期记录，含口径说明见设计文档 §4.1）
FIXTURES = [
    {"馬名": "コンジェスタス", "平地": 36000000, "障害": None},
    {"馬名": "ゴーイントゥスカイ", "平地": 31000000, "障害": None},
    {"馬名": "チェリヴェント", "平地": 27500000, "障害": None},
    {"馬名": "ジーネキング", "平地": 10000000, "障害": None},
    {"馬名": "テルヒコウ", "平地": 9000000, "障害": None},
    {"馬名": "パントルナイーフ", "平地": 83000000, "障害": None},
    {"馬名": "フォルテアンジェロ", "平地": 18000000, "障害": None},
    {"馬名": "ヨヒーン", "平地": 24000000, "障害": None},
    {"馬名": "アスクエジンバラ", "平地": 27000000, "障害": None},
    {"馬名": "リアライズシリウス", "平地": 80500000, "障害": None},
    {"馬名": "フウセツ", "平地": 15000000, "障害": None},
    {"馬名": "ローディアマント", "平地": 0, "障害": 34000000},
    {"馬名": "ディナースタ", "平地": 24000000, "障害": 58500000},
]


def main():
    if not CROPS_PATH.exists():
        sys.exit(f"❌ 无 {CROPS_PATH}（需先 build-data）")
    crops = json.loads(CROPS_PATH.read_text(encoding="utf-8"))
    by_name = {h.get("馬名", ""): h for h in crops}

    print(f"✔ 収得 reconcile 闸门（阈值 {TOLERANCE:.0%}，仅库内样本）")
    print(f"{'馬名':<16}{'真值(万)':>10}{'复算(万)':>10}{'偏差':>8}  判定")
    ok, fail = 0, 0
    for fx in FIXTURES:
        name = fx["馬名"]
        h = by_name.get(name)
        if h is None:
            print(f"{name:<16}{'—':>10}{'—':>10}{'—':>8}  跳过（库外，拟合期已验）")
            continue
        recs = h.get("races") or []
        got = racelib.compute_shutoku(recs)
        if got["缺失"]:
            print(f"  ⚠ {name}: 本賞金缺失 {len(got['缺失'])} 场 → {got['缺失']}")
        for key, want in (("平地", fx["平地"]), ("障害", fx["障害"] or 0)):
            got_v = got[key]
            diff = abs(got_v - want) / want if want else (0 if got_v == want else float("inf"))
            verdict = "✓" if diff <= TOLERANCE else "✗"
            if verdict == "✓":
                ok += 1
            else:
                fail += 1
            print(f"{name:<16}{want / 10000:>10,.0f}{got_v / 10000:>10,.0f}{diff:>7.1%}  {verdict} ({key})")
    print(f"\n✔ 通过 {ok} · 失败 {fail}")
    if fail:
        sys.exit("❌ reconcile 未通过：>10% 偏差，检查 付加賞/本賞金/クラス推导 后重跑")
    print("✔ reconcile 通过：规则表与 JRA 真值一致（≤10%）")


if __name__ == "__main__":
    main()