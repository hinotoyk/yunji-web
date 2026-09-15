#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探针：枚举 SP 比赛结果页「弯道方向 / コース表记」的真实取值（一次性诊断，不进流水线）。

用法:
    python tests/_probe-course.py [race_id ...]    # 默认跑内置 15 场抽样

每个 race_id 抓 SP 页（race.netkeiba.com/race/result.html?race_id=…，utf-8），
从 RaceData01 提取：场地(芝/ダ) + 距離 + 「(方向 コース区分)」token，另取発走时刻交叉验证。
场地名从整页计数推断（页面头部/元信息里必有场地名）。
"""
import io
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "races"))
import common  # noqa: E402

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT = [
    "202602010806",  # 用户样例（京都? 芝2000m 右A）
    "202501010405", "202501020205", "202503020605",
    "202504020404", "202504020701",
    "202505040305", "202505040506", "202505040705", "202505040802", "202505040905",
    "202506040903", "202506050711",
    "202507030203", "202508030102", "202508031105",
]
VENUES = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"]


def norm_token(s):
    """"(右&nbsp;A)" → "右 A"；去全半角空格/括号噪音。"""
    return re.sub(r"[&nbsp;\s]", " ", s).strip()


def extract(html):
    out = {}
    m = re.search(r'class="RaceData01">\s*(.*?)</div>', html, re.S)
    if not m:
        out["raw"] = "(未找到 RaceData01)"
        return out
    block = m.group(1)
    text = re.sub(r"<[^>]+>", " ", block)
    text = re.sub(r"[ \t]+", " ", text).strip()
    out["raw"] = text[:120]
    mm = re.search(r"(\d{1,2}:\d{2})\s*発走", text)
    out["発走"] = mm.group(1) if mm else "?"
    mc = re.search(r"(芝|ダート?|障)\s*([\d０-９,]+)m?([^/]*?\([^)]*\))?", text)
    if mc:
        out["surface"] = mc.group(1)
        out["dist"] = mc.group(2)
        dir_tok = re.search(r"\(([^)]+)\)", text)
        out["dir"] = norm_token(dir_tok.group(1)) if dir_tok else "?"
    else:
        out["surface"], out["dist"], out["dir"] = "?", "?", "?"
    vc = Counter()
    for v in VENUES:
        vc[v] = len(re.findall(v, html))
    out["venue"] = vc.most_common(1)[0][0] if vc else "?"
    return out


rids = sys.argv[1:] or DEFAULT
print(f"共 {len(rids)} 场：")
print(f"{'race_id':<14} {'场地':<4} {'距(m)':<7} {'方向/コース':<10} {'発走':<6} 原始行")
for rid in rids:
    url = common.RACE_SP_URL.format(race_id=rid)
    try:
        html = common.fetch(url, encoding="utf-8")
        r = extract(html)
        print(f"{rid:<14} {r['venue']:<4} {r['dist']:<7} {r['dir']:<10} {r['発走']:<6} {r['raw']}")
    except Exception as e:
        print(f"{rid:<14} ✗ {e}")
    common.time.sleep(common.sleep_for(url))

print("\n══ 探针结束")
