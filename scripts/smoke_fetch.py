#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取冒烟体测：4 个真实请求，30 秒内回答「今天这套抓取还能不能用」。

为什么需要它：`data/` 是入库存量、CI 只跑增量，**冷启动全量只有 clone / 换种马的人才会跑**。
上游一改（编码、跳转、页面结构），本站永远看不见 —— 克隆者第一次跑 `--init` 就是全库乱码。
本脚本把「上游还认不认我们」压成 4 条断言，跑 `--init` 之前先跑它，30 秒出结论。

体测项（都能用数据里现成的 id 定位，不写死任何马）：
  1. 马详情页（db.netkeiba.com/horse/{nk_id}/）：解码无乱码特征 + 馬名出现在页面里
  2. 成绩页（race/nar 的 result.html）：解码无乱码特征 + 有「着順」/「単勝」表
  3. JBIS 血统页（/horse/{jbis_id}/pedigree/）：解码无乱码特征 + 有「血統」
  4. studbook 馬名検索 → hid：能取到 hid（唯一命中时服务端会 302 直跳档案页，这条同时验证 302 兜底）

⚠ **只体检，不动任何数据**：默认永远 exit 0（`--strict` 才按结果返回非 0，供人工/本地用）；
   不被任何流水线调用，不影响抓取、部署、提交。

用法:
    python scripts/smoke_fetch.py             # 只看报告（永远 exit 0）
    python scripts/smoke_fetch.py --strict    # 有失败项时 exit 1（给人工/脚本判断用）
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))   # scripts/ → 引导 core/（纯 stdlib）
from core import constants, net, runtime, sire_config  # noqa: E402

runtime.install_utf8_stdout()

DATA = constants.DATA_DIR
_MOJI = ("\ufffd", "縺", "繝", "ã", "Ã")     # 解码失败的三类典型字形（见 check_data.health_checks）
SLEEP = 2.0                                   # 体测请求之间的间隔（4 个请求，别把它变成风控问题）


def _basic():
    p = DATA / "basic.json"
    if not p.exists():
        return []
    try:
        return (json.loads(p.read_text(encoding="utf-8")) or {}).get("horses") or []
    except Exception:
        return []


def _sample_nk_id(horses):
    """挑一匹有 nk_id 的马（优先有成绩记录的，顺带覆盖成绩页）；没有就用配置里的种马 id。"""
    for h in horses:
        if h.get("nk_id"):
            return str(h["nk_id"]), (h.get("馬名") or "")
    return str(sire_config.netkeiba_id() or ""), ""


def _sample_races(horses):
    """中央 / 地方各挑一条带 race_id 的记录。

    为什么分两个域测：SP 页的可用性按域独立（实测 2026-11-13：`race.netkeiba.com` 连首页都回 400，
    而 `nar.netkeiba.com` 正常）—— 分开测才知道是「某个域被边缘拒绝」还是「我们的解析坏了」。"""
    out = {}
    for h in horses:
        p = DATA / "races" / f"{h.get('id')}.json"
        if not p.exists():
            continue
        try:
            recs = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for r in recs:
            rid = str(r.get("race_id") or "").strip()
            if rid:
                out.setdefault("地方" if (r.get("venue_type") or "").strip() == "地方" else "中央", rid)
        if len(out) >= 2:
            break
    return out


def _check_moji(label, html, fails):
    hit = [t for t in _MOJI if t in html]
    if hit:
        fails.append(f"{label}：出现乱码特征 {hit} → 解码没跟随响应头 charset（或抓取通道变了）")
        return False
    return True


def main():
    ap = argparse.ArgumentParser(description="抓取冒烟体测（只报告，不动数据）")
    ap.add_argument("--strict", action="store_true", help="有失败项时返回 exit 1（默认永远 exit 0）")
    args = ap.parse_args()

    horses = _basic()
    nk_id, nk_name = _sample_nk_id(horses)
    races = _sample_races(horses)

    rows, fails = [], []
    print(f"══ 抓取冒烟 {time.strftime('%Y-%m-%d %H:%M')} · 库内 {len(horses)} 匹 ══", flush=True)

    # 1) 马详情页
    if nk_id:
        url = constants.NK_HORSE_URL.format(nk_id=nk_id)
        try:
            html = net.fetch(url, retries=2)
            ok = _check_moji("马详情页", html, fails)
            if ok and nk_name and nk_name not in html:
                fails.append(f"马详情页：页面里找不到馬名「{nk_name}」→ 结构变了（或抓到的是错误页）")
                ok = False
            rows.append((ok, f"马详情 {nk_id}", "解码正常 · 馬名命中" if ok else "见下方失败项"))
        except Exception as e:
            fails.append(f"马详情页：请求失败 {e}")
            rows.append((False, f"马详情 {nk_id}", str(e)[:60]))
        time.sleep(SLEEP)

    # 2) 成绩页（SP 域，中央/地方分别测）
    for vt, race_id in races.items():
        tpl = constants.RACE_SP_URL_NAR if vt == "地方" else constants.RACE_SP_URL
        url = tpl.format(race_id=race_id)
        try:
            html = net.fetch(url, retries=2)
            ok = _check_moji(f"成绩页({vt})", html, fails) and ("着順" in html or "単勝" in html)
            if not ok and not any(f"成绩页({vt})" in f for f in fails):
                fails.append(f"成绩页({vt})：页面里找不到「着順 / 単勝」→ 结果页结构变了")
            rows.append((ok, f"成绩页({vt}) {race_id}", "解码正常 · 着順表在" if ok else "见下方失败项"))
        except Exception as e:
            code = "".join(ch for ch in str(e)[:3] if ch.isdigit())
            edge = ("（400/403 且响应体为空 = 边缘/WAF 拒绝，不是解析问题；"
                    "换出口 IP 或看 GitHub runner 是否同样，才能判断是不是整域封）"
                    if code in ("400", "403") else "")
            fails.append(f"成绩页({vt})：请求失败 {e}{edge}")
            rows.append((False, f"成绩页({vt}) {race_id}", str(e)[:60]))
        time.sleep(SLEEP)
    if not races:
        rows.append((True, "成绩页", "跳过（库内还没有带 race_id 的记录）"))

    # 3) JBIS 血统页
    jbis_id = str(sire_config.jbis_id() or "")
    if jbis_id:
        url = constants.JBIS_PEDIGREE_URL.format(jbis_id=jbis_id)
        try:
            html = net.fetch(url, retries=2)
            ok = _check_moji("JBIS 血统页", html, fails) and ("血統" in html)
            if not ok and not any("JBIS" in f for f in fails):
                fails.append("JBIS 血统页：页面里找不到「血統」→ 结构变了")
            rows.append((ok, "JBIS 血统页", "解码正常 · 血統表在" if ok else "见下方失败项"))
        except Exception as e:
            fails.append(f"JBIS 血统页：请求失败 {e}（该站单页可慢到几分钟，属已知；但 2 次重试都失败仍要查）")
            rows.append((False, "JBIS 血统页", str(e)[:60]))
        time.sleep(SLEEP)
    else:
        rows.append((True, "JBIS 血统页", "跳过（config/sire.json 未配 sire.jbis_id）"))

    # 4) studbook 搜索 → hid（同时验证「唯一命中 302 直跳档案页」的兜底）
    try:
        sys.path.insert(0, str(constants.ROOT / "scripts" / "basic"))
        import fetch_studbook as fs          # noqa: E402  （模块内 argparse 有 __main__ 守卫，import 安全）
        hid = fs.get_hid()
        ok = bool(hid)
        if not ok:
            fails.append("studbook：取不到 hid → 搜索页结构变了，或馬名/父馬与 config 不符")
        rows.append((ok, "studbook hid", f"hid={hid}" if hid else "取不到（见失败项）"))
    except Exception as e:
        fails.append(f"studbook：请求失败 {e}（该站对机房 IP 常返回 403，CI 上失败属已知）")
        rows.append((False, "studbook hid", str(e)[:60]))

    for ok, name, detail in rows:
        print(f"  {'✓' if ok else '✗'} {name:22} {detail}", flush=True)
    n_ok = sum(1 for ok, _, _ in rows if ok)
    print(f"\n结论：{len(rows)} 项中 {n_ok} 通过" + ("（全部正常，可以跑 --init）" if not fails else
          "（有失败项，先修再跑 --init；细节见上）"), flush=True)
    for f in fails:
        print(f"  · {f}", flush=True)
    # 只体检：默认不影响任何流程的退出码
    sys.exit(1 if (args.strict and fails) else 0)


if __name__ == "__main__":
    main()
