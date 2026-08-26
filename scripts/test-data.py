#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据测试：小样本抽样验证（每类 2-3 匹），不做全量。
测试原则：全量抓取由人工跑（Actions 按钮 / 命令行），测试只做抽样冒烟。
用法:
    python scripts/test-data.py                # 本地数据校验（raw + basic.json，每类抽样）
    python scripts/test-data.py --smoke        # 网络冒烟：每类抽 2-3 匹实际抓取验证
"""
import argparse
import csv
import io
import json
import os
import random
import re
import sys
import time
from pathlib import Path

_ORIG_STDOUT = sys.stdout               # 防 GC：包装后原对象仍被引用
sys.stdout = io.TextIOWrapper(_ORIG_STDOUT.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SAMPLE = 3                      # 每类抽样匹数（测试用，勿改大全量）

sys.path.insert(0, str(ROOT / "scripts"))
import racelib  # noqa: E402

# 分类规则：命名 netkeiba / 未命名仔 / JBIS 兜底 / 台账建档
def is_unnamed(name):
    return racelib.is_unnamed_name(name)

def classify(h):
    if not h.get("nk_id") and not h.get("jbis_id") and h.get("races"):
        return "ledger_created"
    if not h.get("nk_id"):
        return "jbis_only"
    if is_unnamed(h.get("馬名")):
        return "unnamed"
    return "named"

def sample_of(records, cls, n=SAMPLE):
    pool = [h for h in records if classify(h) == cls]
    rng = random.Random(42)
    rng.shuffle(pool)
    return pool[:n]


def load_basic():
    """读 data/basic.json（{_meta, horses}），并为每匹从拆分文件回填 races/pedigree。
    兼容 v1 裸数组（无 _meta，历史快照）。返回 (horses, meta)。"""
    d = json.loads((ROOT / "data" / "basic.json").read_text(encoding="utf-8"))
    if isinstance(d, dict) and "_meta" in d:
        horses = d["horses"]
        meta = d["_meta"]
        for h in horses:
            rf = h.get("races_file") or ""
            if rf:
                p = ROOT / rf
                if p.exists():
                    h["races"] = (json.loads(p.read_text(encoding="utf-8")) or {}).get("races") or []
            pf = h.get("pedigree_file") or ""
            if pf:
                p = ROOT / pf
                if p.exists():
                    pd = json.loads(p.read_text(encoding="utf-8")) or {}
                    h["pedigree"] = pd.get("pedigree") or {}
                    h["fno"] = pd.get("fno") or h.get("fno") or ""
                    h["cross"] = pd.get("cross") or h.get("cross") or ""
        return horses, meta
    return d, {"schema": "v1"}

def check_ledger_horse(h, out):
    """台账建档马：只要求有履历（血统/基本信息本来就没有）"""
    ok = True
    if not h.get("races"):
        out.append(f"  ✗ {h.get('馬名', '?')}: 台账建档马无履历")
        ok = False
    return ok

def check_horse(h, out):
    name = h.get("馬名", "?")
    ok = True
    p = h.get("pedigree") or {}
    if not p.get("父"):
        out.append(f"  ✗ {name}: 无血统")
        return False
    for side in ("父", "母"):
        for d, row in enumerate(p.get(side) or []):
            if len(row) != 2 ** d:
                ok = False
                out.append(f"  ✗ {name} {side} G{d+1}: {len(row)} 格 ≠ {2**d}")
    if not h.get("生年"):
        ok = False
        out.append(f"  ✗ {name}: 缺生年")
    return ok

def local_check():
    out = []
    basic, meta = load_basic()
    nk = json.loads((RAW / "netkeiba.json").read_text(encoding="utf-8"))
    jb = json.loads((RAW / "jbis.json").read_text(encoding="utf-8"))
    out.append(f"✔ 数据量: netkeiba {len(nk)} / jbis 兜底 {len(jb)} / basic {len(basic)} (schema={meta.get('schema','?')})")
    classes = {"named": [], "unnamed": [], "jbis_only": [], "ledger_created": []}
    for h in basic:
        classes[classify(h)].append(h)
    for cls, label in (("named", "命名马(netkeiba源)"), ("unnamed", "未命名仔"),
                       ("jbis_only", "JBIS兜底"), ("ledger_created", "台账建档")):
        pool = classes[cls]
        out.append(f"✔ {label}: {len(pool)} 匹 → 抽样 {min(SAMPLE, len(pool))} 匹")
        ok_all = True
        checker = check_ledger_horse if cls == "ledger_created" else check_horse
        for h in sample_of(pool, cls):
            ok_all = checker(h, out) and ok_all
        if ok_all:
            out.append(f"  ✓ {label} 抽样全部通过")
    with_ped = sum(1 for h in basic if h.get("pedigree", {}).get("父"))
    out.append(f"✔ 血统覆盖: {with_ped}/{len(basic)}")
    return out

def smoke(netkeiba_sleep=1.0, jbis_sleep=1.5):
    """网络冒烟：每类抽 2-3 匹实抓验证（不写库，仅解析验证）"""
    sys.path.insert(0, str(ROOT / "scripts"))
    out = []
    spec_import = __import__("importlib.util").util
    def load(name):
        spec = spec_import.spec_from_file_location(name, str(ROOT / "scripts" / f"{name}.py"))
        mod = spec_import.module_from_spec(spec)
        sys.modules[name] = mod
        spec.loader.exec_module(mod)      # 脚本 stdout 包装已幂等（utf-8 时跳过）
        return mod

    nk = json.loads((RAW / "netkeiba.json").read_text(encoding="utf-8"))
    jb = json.loads((RAW / "jbis.json").read_text(encoding="utf-8"))
    basic = json.loads((ROOT / "data" / "basic.json").read_text(encoding="utf-8"))
    if isinstance(basic, dict) and "horses" in basic:
        basic = basic["horses"]   # basic/v1 {_meta, horses} 兼容

    snk = load("scrape_netkeiba")
    out.append("── netkeiba 血统冒烟（抽 3 匹）──")
    for h in sample_of(basic, "named") + sample_of(basic, "unnamed")[:1]:
        try:
            html = snk.fetch(snk.PEDIGREE_URL.format(id=h["nk_id"]))
            r = snk.parse_pedigree(html)
            n = sum(len(x) for x in (r["pedigree"].get("父", []) + r["pedigree"].get("母", [])))
            ok = "✓" if n >= 60 else "⚠"
            out.append(f"  {ok} {h['馬名']}: {n} 格 fno={r['fno'] or '-'}")
        except Exception as e:
            out.append(f"  ✗ {h['馬名']}: {e}")
        time.sleep(netkeiba_sleep)

    sjb = load("scrape_jbis")
    out.append("── JBIS 兜底冒烟（抽 2 匹）──")
    for h in sample_of(basic, "jbis_only")[:2]:
        try:
            html = sjb.fetch(sjb.HORSE_URL.format(id=h["jbis_id"]))
            d = sjb.parse_detail(html)
            ped = sjb.parse_pedigree(sjb.fetch(sjb.PEDIGREE_URL.format(id=h["jbis_id"])))
            n = sum(len(x) for x in (ped["pedigree"].get("父", []) + ped["pedigree"].get("母", [])))
            out.append(f"  ✓ {h['馬名']}: 详情={d['生年月日'] or '-'} ped={n}格 fno={ped['fno'] or '-'}")
        except Exception as e:
            out.append(f"  ✗ {h['馬名']}: {e}")
        time.sleep(jbis_sleep)
    return out

def contract_check():
    """契约B/契约C 全量断言（见 docs/data-contracts.md）——数据源换格式立刻报错，不静默"""
    out = []
    sys.path.insert(0, str(ROOT / "scripts"))
    import racelib

    # ── 契约B：google_ledger.csv 全量校验 ──
    ledger_path = ROOT / "data" / "races" / "google_ledger.csv"
    if ledger_path.exists():
        issues = []
        with open(ledger_path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        recs = []
        for row in rows:
            rec = racelib.coerce_record(row, issues)
            if rec:
                recs.append(rec)
        for it in issues:
            out.append(f"  ✗ 契约B ledger 校验: **{it['type']}**: {it}")
        for r in recs:
            if r["venue_type"] not in ("中央", "地方", "海外"):
                out.append(f"  ✗ 契约B venue_type 异常: {r['出走馬名']} {r['日付']} → {r['venue_type']}")
            if r["格"] not in ("", *racelib.ALL_GRADES):
                out.append(f"  ✗ 契约B 格 异常: {r['出走馬名']} {r['日付']} → {r['格']}")
            if r["芝ダ"] not in ("芝", "ダ", "障", "AW", ""):
                out.append(f"  ✗ 契约B 芝ダ 异常: {r['出走馬名']} {r['日付']} → {r['芝ダ']}")
            if not r["レース名"]:
                out.append(f"  ✗ 契约B レース名 缺失: {r['出走馬名']} {r['日付']}")
            if not (isinstance(r["結果"], int) or r["結果"] in racelib.RESULT_DNF):
                out.append(f"  ✗ 契约B 結果 异常: {r['出走馬名']} {r['日付']} → {r['結果']}")
            if not (r["賞金"] == "" or (isinstance(r["賞金"], int) and r["賞金"] >= 0)):
                out.append(f"  ✗ 契约B 賞金 异常: {r['出走馬名']} {r['日付']} → {r['賞金']!r}")
        if not issues and recs:
            out.append(f"✔ 契约B google_ledger.csv 通过（{len(recs)} 条 / {len(set(r['出走馬名'] for r in recs))} 匹，0 异常）")
    else:
        out.append("⚠ 无 data/races/google_ledger.csv，跳过契约B（先跑 python scripts/pull_races.py）")

    # ── 契约C：basic.json 基本信息 + 拆分文件引用（逐匹） ──
    # races/stats 已不在 basic.json（详情经 races_file / pedigree_file 拆分文件按需加载），
    # 此处校验基本字段存在性与拆分文件引用可解析。
    basic, _ = load_basic()
    bad = 0
    for h in basic:
        for k in ("id", "馬名", "生年"):
            if k not in h:
                bad += 1
                out.append(f"  ✗ 契约C {h.get('馬名', '?')}: 缺字段 {k}")
        for k in ("races_file", "pedigree_file"):
            p = h.get(k) or ""
            if p and not (ROOT / p).exists():
                bad += 1
                out.append(f"  ✗ 契约C {h.get('馬名', '?')}: {k} 指向文件不存在 {p}")
    if bad == 0:
        out.append(f"✔ 契约C basic.json 基本字段完整 · 拆分文件引用可解析（{len(basic)} 匹）")
    return out


def identity_check():
    """M1 身份一致性断言：id 全库唯一、registry↔basic 互认、占位名规则、改名当前名=names[-1]。"""
    out = []
    basic, _ = load_basic()
    reg_path = ROOT / "data" / "registry.json"
    if not reg_path.exists():
        out.append("  ✗ 身份层: 无 data/registry.json（先跑 scripts/tools/build_registry.py）")
        return out
    reg = json.loads(reg_path.read_text(encoding="utf-8"))
    horses = reg.get("horses", [])
    ids = [h.get("id") for h in basic]
    dup = len(ids) != len(set(ids))
    missing_id = any(h.get("id") is None for h in basic)
    if dup or missing_id:
        out.append("  ✗ 身份层: basic id 缺失/重复")
    # registry↔basic 互认
    by_id = {h["id"]: h for h in horses}
    mismatch = 0
    for h in basic:
        e = by_id.get(h.get("id"))
        if e is None:
            mismatch += 1
            continue
        cur_name = (e.get("names") or [""])[-1]
        if cur_name != h.get("馬名"):
            mismatch += 1
            out.append(f"  ✗ 身份层 {h.get('馬名')}: registry 当前名 {cur_name} ≠ basic 馬名")
        if e.get("keys", {}).get("nk_id") != h.get("nk_id"):
            mismatch += 1
            out.append(f"  ✗ 身份层 {h.get('馬名')}: nk_id 不一致")
    # 占位名断言：有 races 的马不允许带未命名标记；无重复 馬名（normalized）
    unnamed_with_races = [h.get("馬名") for h in basic
                          if is_unnamed(h.get("馬名")) and h.get("races")]
    dup_names = {}
    for h in basic:
        k = re.sub(r"[ 　()（）\[\]【】]", "", h.get("馬名") or "")
        dup_names.setdefault(k, []).append(h.get("馬名"))
    dup_any = {k: v for k, v in dup_names.items() if len(v) > 1}
    if not dup and not missing_id and mismatch == 0 and not unnamed_with_races and not dup_any:
        out.append(f"✔ 身份一致性: registry {len(horses)} 条 / basic {len(basic)} 匹，id 唯一且互认、占位名规则成立")
    else:
        for n in unnamed_with_races[:5]:
            out.append(f"  ✗ 身份层: 出过赛却带未命名标记 {n}")
        for k, v in list(dup_any.items())[:5]:
            out.append(f"  ✗ 身份层: 重复馬名 {v}")
    return out


def uniqueness_check():
    """W1/D1 唯一性断言（见 docs/PROJECT.md §5.2）：
    - 去国家后缀后「同名同生年」全库唯一（registry 当前名）
    - 同「(母名, 生年)」全库唯一（basic.json）
    - nk_id 全库唯一（registry keys）"""
    out = []
    reg_path = ROOT / "data" / "registry.json"
    if not reg_path.exists():
        out.append("  ✗ 唯一性: 无 data/registry.json")
        return out
    reg = json.loads(reg_path.read_text(encoding="utf-8"))
    horses = reg.get("horses", [])

    def norm_n(n):
        return re.sub(r"[ 　()（）\[\]【】]", "", racelib.strip_country_suffix(n) or "").strip()

    # 1) 去后缀名 + 生年 唯一
    keyed, dups1 = {}, []
    for h in horses:
        nm = norm_n((h.get("names") or [""])[-1])
        k = (nm, str(h.get("生年", "")))
        if k[0]:
            if k in keyed:
                dups1.append((keyed[k], h.get("id"), k[0], k[1]))
            else:
                keyed[k] = h.get("id")
    # 2) nk_id 唯一
    nk_seen, dups_nk = {}, []
    for h in horses:
        nk_ = (h.get("keys") or {}).get("nk_id") or ""
        if nk_:
            if nk_ in nk_seen:
                dups_nk.append((nk_seen[nk_], h.get("id"), nk_))
            else:
                nk_seen[nk_] = h.get("id")
    # 3) (母名, 生年) 唯一（basic.json）
    basic, _ = load_basic()
    mother_seen, dups_m = {}, []
    for h in basic:
        m = h.get("母名") or ""
        if m:
            k = (norm_n(m), str(h.get("生年", "")))
            if k in mother_seen:
                dups_m.append((mother_seen[k], h.get("id"), k[0]))
            else:
                mother_seen[k] = h.get("id")
    if not dups1 and not dups_nk and not dups_m:
        out.append(f"✔ 唯一性: 去国家后缀同名同生年 {len(keyed)} · (母名,生年) {len(mother_seen)} · nk_id 全库唯一")
    else:
        for it in dups1[:10]:
            out.append(f"  ✗ 唯一性: 去后缀同名同生年重复 {it}")
        for it in dups_nk[:10]:
            out.append(f"  ✗ 唯一性: nk_id 重复 {it}")
        for it in dups_m[:10]:
            out.append(f"  ✗ 唯一性: (母名,生年) 重复 {it}")
    return out


def races_check():
    """M2 比赛主源断言：netkeiba 主 + 台账海外补漏。
    - 每条带 來源 ∈ {netkeiba, ledger}；单马 (日付, 場名, R) 无重复
    - 骑手全名：netkeiba 记录有 jockey_id → 騎手 = jockeys.json 全名（无截断残留）
    - 重赏 且 本方 1/2着 → 必须带本賞金（M2.4 前置，収得依赖）
    - 海外场次：netkeiba 有该场 → 來源=netkeiba 优先；netkeiba 无 → 來源=ledger
    """
    out = []
    basic, _ = load_basic()
    jockeys = {}
    jk_path = ROOT / "data" / "jockeys.json"
    if jk_path.exists():
        jockeys = json.loads(jk_path.read_text(encoding="utf-8"))
    netkeiba_db = {}
    nk_path = ROOT / "data" / "raw" / "netkeiba_races.json"
    if nk_path.exists():
        netkeiba_db = json.loads(nk_path.read_text(encoding="utf-8"))

    total, dup, bad_src = 0, 0, 0
    prefix_conflict, missing_honsho, overseas_bad = [], [], []
    graded_set = {"GI", "GII", "GIII", "JGI", "JGII", "JGIII", "JpnI", "JpnII", "JpnIII"}  # 重赏才需要本賞金（L 用固定额）
    for h in basic:
        keys = set()
        nk_id = str(h.get("nk_id") or "")
        nk_loose = set()
        if nk_id and nk_id in netkeiba_db:
            nk_loose = {(str(r.get("日付", "")), str(r.get("場名", ""))) for r in netkeiba_db[nk_id]}
        for r in h.get("races") or []:
            total += 1
            src = r.get("來源")
            if src not in ("netkeiba", "ledger"):
                bad_src += 1
                out.append(f"  ✗ 契约C {h.get('馬名')}: 來源 异常 {src!r}")
            k = (r.get("日付"), r.get("場名"), str(r.get("R", "")))
            if k in keys:
                dup += 1
                out.append(f"  ✗ 契约C {h.get('馬名')}: 重复场次 {k}")
            keys.add(k)

            if r.get("venue_type") == "海外":
                has_nk = (str(r.get("日付", "")), str(r.get("場名", ""))) in nk_loose
                if has_nk and src != "netkeiba":
                    overseas_bad.append((h.get("馬名"), r.get("日付"), r.get("レース名") or r.get("競走名"),
                                         f"netkeiba 有该场但來源={src}"))
                elif not has_nk and src != "ledger":
                    overseas_bad.append((h.get("馬名"), r.get("日付"), r.get("レース名") or r.get("競走名"),
                                         f"netkeiba 无该场但來源={src}"))

            if src == "netkeiba":
                jid = str(r.get("jockey_id") or "")
                name = (r.get("騎手") or "").strip()
                if jid and jid in jockeys:
                    if name != jockeys[jid]:
                        prefix_conflict.append((h.get("馬名"), name, jockeys[jid]))
                elif jid and jid not in jockeys:
                    out.append(f"  ✗ 契约C {h.get('馬名')}: jockey_id {jid} 未收录于 jockeys.json")
                elif not jid:
                    for full in jockeys.values():
                        if len(full) > len(name) and full.startswith(name):
                            prefix_conflict.append((h.get("馬名"), name, full))
                            break

            if r.get("格") in graded_set and r.get("結果") in (1, 2) and not r.get("本賞金"):
                missing_honsho.append((h.get("馬名"), r.get("日付"), r.get("レース名") or r.get("競走名")))

    if dup == 0 and bad_src == 0 and not prefix_conflict and not missing_honsho and not overseas_bad:
        out.append(f"✔ 契约C 比赛主源: {total} 条 · 無重复/來源正确/骑手全名 0 截断/重赏 1/2着 全带本賞金/海外策略正确")
    else:
        for it in prefix_conflict[:20]:
            out.append(f"  ✗ 骑手截断残留: {it[0]} 骑手「{it[1]}」应为「{it[2]}」")
        for it in missing_honsho[:20]:
            out.append(f"  ✗ 重赏缺本賞金: {it}")
        for it in overseas_bad[:20]:
            out.append(f"  ✗ 海外场次来源违背策略: {it}")
    return out


def basic_check():
    """M5 basic.json 结构断言：_meta.schema / built 时间格式 / count 与 horses 一致（无 index）。"""
    out = []
    d = json.loads((ROOT / "data" / "basic.json").read_text(encoding="utf-8"))
    if not (isinstance(d, dict) and d.get("_meta", {}).get("schema") == "basic/v1"):
        out.append("  ✗ basic 结构: basic.json 非 {_meta, horses}（schema 非 basic/v1）")
        return out
    horses, meta = d["horses"], d["_meta"]
    if "index" in d:
        out.append("  ✗ basic 结构: basic.json 不应包含 index（检索索引已移除）")
    if "manifest" in meta:
        out.append("  ✗ basic 结构: _meta 不应包含 manifest（快照引用已解耦，快照由 data/manifest.json 登记）")
    if meta.get("count") != len(horses):
        out.append(f"  ✗ basic 结构: _meta.count {meta.get('count')} ≠ horses {len(horses)}")
    if not re.match(r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$", str(meta.get("built") or "")):
        out.append(f"  ✗ basic 结构: _meta.built 非 yyyy-MM-dd HH:mm:ss: {meta.get('built')}")
    if not out:
        out.append(f"✔ basic.json: schema={meta['schema']} · {len(horses)} 匹 · 无 index · built 格式正确")
    return out


def main():
    ap = argparse.ArgumentParser(description="小样本数据测试（每类 2-3 匹，非全量）")
    ap.add_argument("--smoke", action="store_true", help="网络冒烟测试（实抓验证，勿全量）")
    args = ap.parse_args()
    out = local_check()
    out.extend(contract_check())
    out.extend(identity_check())
    out.extend(uniqueness_check())
    out.extend(races_check())
    out.extend(basic_check())
    if args.smoke:
        out.extend(smoke())
    print("\n".join(out))
    fail = [l for l in out if l.lstrip().startswith("✗")]
    if fail:
        sys.exit(f"❌ {len(fail)} 项失败")
    print("✔ 测试通过（抽样 + 契约校验）")

if __name__ == "__main__":
    main()
