#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""探针：SP 比赛结果页能否拿到「発走」时刻？（一次性诊断脚本，不进正式流水线）

用法:
    python tests/_probe-sp-hakso.py [race_id]     # 默认 202602010806

检查点：
  1. race.netkeiba.com SP 页（utf-8）里「発走」的所有出现位置 + 上下文
  2. 全页 HH:MM 模式（看目标时刻是否存在、以什么形态存在）
  3. 正则提取尝试（12:40発走 / 発走:12:40 / 発走 12:40）
  4. BeautifulSoup 结构化定位（含「発走」的文本节点及其 tag/class）
  5. 对照组：db.netkeiba.com/race/{rid}/（EUC-JP，流水线兜底页）同项检查

请求统一走 scripts/races/common.fetch（带 UA/重试/限速/风控日志），与正式流水线同环境。
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "races"))
import common  # noqa: E402

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

RID = (sys.argv[1] if len(sys.argv) > 1 else "202602010806").strip()
TARGETS = [
    ("SP 页（中央）", common.RACE_SP_URL.format(race_id=RID), "utf-8"),
    ("db 兜底页", common.NK + f"/race/{RID}/", "euc-jp"),
]
TIME_RE = re.compile(r"\d{1,2}:\d{2}")


def ctx(html, m, before=100, after=100):
    s, e = max(0, m.start() - before), min(len(html), m.end() + after)
    return "…" + html[s:e].replace("\n", "⏎") + "…"


def probe(name, url, encoding):
    print(f"\n{'═' * 62}\n■ {name}: {url}")
    try:
        html = common.fetch(url, encoding=encoding)
    except Exception as e:
        print(f"  ✗ 抓取失败: {e}")
        return
    print(f"  ✓ {len(html):,} 字符")

    # 1) 「発走」出现位置
    hits = list(re.finditer("発走", html))
    print(f"\n[1] 「発走」出现 {len(hits)} 处")
    for m in hits[:8]:
        print(f"    @{m.start()}: {ctx(html, m)}")
    if not hits:
        print("    （页面无「発走」字样 → 找 postTime/post_time/発走時刻 等替代键）")
        for key in ("postTime", "post_time", "発走時刻", "発走時", "発走"):
            for m in list(re.finditer(key, html))[:3]:
                print(f"    [{key}] @{m.start()}: {ctx(html, m, 80, 80)}")

    # 2) 全页 HH:MM 模式
    times = list(TIME_RE.finditer(html))
    print(f"\n[2] HH:MM 模式 {len(times)} 处（前 10）")
    for m in times[:10]:
        print(f"    @{m.start()} {m.group()}: {ctx(html, m, 60, 60)}")

    # 3) 正则提取尝试
    print("\n[3] 正则提取尝试")
    for pat, label in (
        (r"(\d{1,2}:\d{2})\s*発走", "「12:40発走」（SP 页形态）"),
        (r"発走\s*[：:]\s*(\d{1,2}:\d{2})", "「発走 : 12:40」（db 页形态，冒号两侧可带空格）"),
        (r"発走\s*(\d{1,2}:\d{2})", "「発走 12:40」"),
    ):
        ms = re.findall(pat, html)
        print(f"    {label} → {ms[:5] if ms else '无'}")

    # 4) BeautifulSoup 结构化定位
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        nodes = soup.find_all(string=re.compile("発走"))
        print(f"\n[4] 含「発走」的文本节点 {len(nodes)} 个")
        for n in nodes[:8]:
            p = n.find_parent()
            desc = p.name if p is not None else "?"
            if p is not None and p.get("class"):
                desc = p.name + "." + ".".join(p["class"])
            txt = re.sub(r"\s+", " ", str(n.string or n)).strip()[:90]
            print(f"    <{desc}> → {txt}")
    except Exception as e:
        print(f"\n[4] BeautifulSoup 解析失败: {e}")


for name, url, enc in TARGETS:
    probe(name, url, enc)
    common.time.sleep(common.sleep_for(url))

print("\n══ 探针结束")
