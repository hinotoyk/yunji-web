#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云迹数据构建：netkeiba 主数据（基础+血统）+ JBIS 兜底/血统增强 → data/basic.json + manifest + 快照。
合并规则：
- 基础信息：netkeiba 优先；netkeiba 无记录（如 Hazey Jane）→ JBIS 兜底（jbis.json）
- 血统图：netkeiba 优先（404 匹全量）；netkeiba 无记录 → JBIS（jbis.json）
- FNo/クロス：netkeiba FNo 优先，JBIS 补充（jbis.json / jbis_pedigree.json 增强）
用法:
    python scripts/build-data.py                    # 从 data/raw/*.json 重建
    python scripts/build-data.py --note "手动更新"  # 备注
    python scripts/build-data.py --no-snapshot      # 不生成新快照
"""
import argparse
import csv
import io
import json
import os
import re
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # 供 racelib 导入
import racelib  # noqa: E402
from adapters import netkeiba_races  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
HISTORY = os.path.join(ROOT, "history")
RAW = os.path.join(ROOT, "data", "raw")
RACES_DIR = os.path.join(DATA, "races")
RACEFILES_DIR = os.path.join(DATA, "racefiles")   # M5.3：比赛记录拆分（data/races 已被台账 csv 占用）
PEDIGREE_DIR = os.path.join(DATA, "pedigree")     # M5.3：血统树拆分

# basic.json 输出白名单：horses 只保留基本信息（详情经 races_file / pedigree_file 拆分文件按需加载）
BASIC_FIELDS = [
    "id", "nk_id", "jbis_id", "馬名", "性別", "生年月日", "毛色", "産地",
    "馬主", "生産牧場", "調教師", "通算成績", "獲得賞金", "総賞金",
    "母名", "母父名", "生年", "登録状態", "英文名", "セリ取引価格",
    "photo", "races_file", "pedigree_file",
]


def load_raw(name):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm(name):
    """身份键归一化：先去国家后缀（`Grand Warrior(JPN)`→`Grand Warrior`，W1/D1），再去括号/空白。"""
    return re.sub(r"[ 　()（）\[\]【】]", "", racelib.strip_country_suffix(name) or "").strip()


def load_registry():
    """读取身份映射表 data/registry.json → 索引结构（M1，见 docs/PROJECT.md §5.2）。
    不存在则报错：先跑 python scripts/tools/build_registry.py（M1.1 种子）。
    """
    path = os.path.join(DATA, "registry.json")
    if not os.path.exists(path):
        sys.exit("❌ 无 data/registry.json：先运行 python scripts/tools/build_registry.py（M1.1 种子）")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    horses = data.get("horses", [])
    by_id, by_nk, by_jbis, by_name_year = {}, {}, {}, {}
    for h in horses:
        hid = h.get("id")
        if hid is None or hid in by_id:
            sys.exit(f"❌ registry id 重复/缺失: {hid}")
        by_id[hid] = h
        keys = h.get("keys", {})
        if keys.get("nk_id"):
            by_nk.setdefault(keys["nk_id"], h)
        if keys.get("jbis_id"):
            by_jbis.setdefault(keys["jbis_id"], h)
        by_name_year.setdefault((norm((h.get("names") or [""])[-1]), str(h.get("生年", ""))), h)
    return {
        "data": data, "horses": horses, "by_id": by_id,
        "by_nk": by_nk, "by_jbis": by_jbis, "by_name_year": by_name_year,
    }


def save_registry(reg):
    reg["data"]["horses"] = reg["horses"]
    reg["data"]["updated"] = datetime.now().strftime("%Y-%m-%d")
    with open(os.path.join(DATA, "registry.json"), "w", encoding="utf-8") as f:
        json.dump(reg["data"], f, ensure_ascii=False, indent=2)


def resolve_identity(record, reg):
    """身份解析（§3.2 顺序）：nk_id → jbis_id → (馬名, 生年)。
    未命中 → 分配 max+1 并写回 registry；命中 → 处理改名（names 追加新名）/补 keys/未命名同步。
    返回 (id, entry)。
    """
    nk_id = (record.get("nk_id") or "").strip()
    jbis_id = (record.get("jbis_id") or "").strip()
    name = (record.get("馬名") or "").strip()
    birth = str(record.get("生年") or "").strip()

    entry = reg["by_nk"].get(nk_id) if nk_id else None
    if entry is None and jbis_id:
        entry = reg["by_jbis"].get(jbis_id)
    if entry is None and name:
        entry = reg["by_name_year"].get((norm(name), birth))

    if entry is None:
        new_id = max(reg["by_id"]) + 1 if reg["by_id"] else 1
        entry = {
            "id": new_id,
            "keys": {"nk_id": nk_id, "jbis_id": jbis_id},
            "names": [name],
            "生年": birth,
            "created": datetime.now().strftime("%Y-%m-%d"),
            "updated": datetime.now().strftime("%Y-%m-%d"),
            "未命名": racelib.is_unnamed_name(name),
        }
        reg["horses"].append(entry)
        reg["by_id"][new_id] = entry
        if nk_id:
            reg["by_nk"][nk_id] = entry
        if jbis_id:
            reg["by_jbis"][jbis_id] = entry
        if name:
            reg["by_name_year"][(norm(name), birth)] = entry

    # 命中但名字不同 → 改名：names 追加新名（旧名=曾用名）
    current = (entry.get("names") or [""])[-1]
    if name and current != name:
        # W1/D1 防回退：源记录为占位名、registry 当前名已是正式名（如 JBIS 兜底改名后，
        # netkeiba 源仍是占位名 `〇〇の2023`）→ 不把名字改回占位名（占位名不是权威身份名）。
        if racelib.is_unnamed_name(name) and not racelib.is_unnamed_name(current):
            pass
        else:
            entry["names"] = entry.get("names") or []
            if name not in entry["names"]:
                entry["names"].append(name)
            entry["updated"] = datetime.now().strftime("%Y-%m-%d")
            # 未命名 → 正式名：清除未命名标记
            if entry.get("未命名") and not racelib.is_unnamed_name(name):
                entry["未命名"] = False
            reg["by_name_year"][(norm(name), birth)] = entry
    # 命中且 keys 缺 nk_id（JBIS 兜底马被 netkeiba 收录）→ 补 keys
    if nk_id and not (entry.get("keys") or {}).get("nk_id"):
        entry.setdefault("keys", {})["nk_id"] = nk_id
        reg["by_nk"][nk_id] = entry
    if jbis_id and not (entry.get("keys") or {}).get("jbis_id"):
        entry.setdefault("keys", {})["jbis_id"] = jbis_id
        reg["by_jbis"][jbis_id] = entry
    return entry["id"], entry


def _build_suffix_map(*sources):
    """从血统树节点收集 基名 → 国别后缀 映射（如 'Halo' → '(USA)'）。
    JBIS 血统树节点名带后缀（Halo(USA)），netkeiba 节点名不带 → 用此映射给 netkeiba クロス 补后缀。"""
    m = {}
    for src in sources:
        for h in (src or []):
            ped = h.get("pedigree", {}) or {}
            for side in ("父", "母"):
                for row in ped.get(side, []):
                    for node in row:
                        nm = (node.get("name") or "").strip()
                        base = racelib.strip_country_suffix(nm)
                        if base and base != nm:
                            m.setdefault(base, nm[len(base):].strip())
    return m


def _fmt_cross(cross, suffix_map=None):
    """クロス → 展示格式：每行「名字(国籍) 记法 百分比%」，多条换行分隔。
    输入为规范记法（netkeiba 新格式 / JBIS）：'Fappiano(USA) ：M4×S5 Mr. Prospector(USA) ：M5×M5'。
    百分比 = Σ(1/2)^世代 ×100（netkeiba 页即此口径：M4×S5 → 9.38%；S5×M5×M5 照算），2 位小数。
    国别后缀：源自带（JBIS）保留；netkeiba 源无后缀 → 用 suffix_map（JBIS 血统树）补齐。
    空/なし → ''；无法解析（旧格式等）原样保留不丢数据。"""
    if not cross:
        return ""
    cross = str(cross).strip()
    if cross in ("なし", "-", "--"):
        return ""
    lines = []
    for m in re.finditer(r"([^：]+?)\s*：\s*((?:[SM]\d)(?:×[SM]\d)*)", cross):
        raw = m.group(1).strip()
        base = racelib.strip_country_suffix(raw)
        if base != raw:
            name = raw                      # 源自带后缀（JBIS）→ 保留
        elif suffix_map and base in suffix_map:
            name = base + suffix_map[base]  # netkeiba 无后缀 → JBIS 血统树补
        else:
            name = base                     # 无后缀信息 → 裸名
        segs = m.group(2)
        pct = sum(0.5 ** int(g) for g in re.findall(r"\d+", segs)) * 100
        lines.append("%s %s %.2f%%" % (name, segs, pct))
    return "\n".join(lines) if lines else cross


def _mother_from_pedigree(pedigree):
    """从血统树 母 G1 提取母名。JBIS parse_detail 未提取母名（business-review P5），
    (母名, 生年) 关联需从血统树取。"""
    try:
        return (pedigree or {}).get("母", [[]])[0][0].get("name", "")
    except (IndexError, KeyError, TypeError):
        return ""


def _fill_from_jbis(target, j, reg):
    """JBIS 记录并入已有 netkeiba 实体（W1/D1，不再无条件新建）：
    1. 占位名 → 正式名（registry 改名簿记：names 追加、未命名=false）
    2. 补 keys（jbis_id）
    3. 补基础字段（netkeiba 空 → JBIS）
    4. cross/fno 增强（JBIS クロス 补充，netkeiba 主源没有）"""
    jname = j.get("馬名") or ""
    # 1) 占位名 → 正式名（用去国家后缀名，如 Grand Warrior(JPN) → Grand Warrior）
    if jname and racelib.is_unnamed_name(target.get("馬名") or ""):
        hid, entry = resolve_identity({
            "nk_id": target.get("nk_id", ""), "jbis_id": j.get("jbis_id", ""),
            "馬名": racelib.strip_country_suffix(jname), "生年": target.get("生年", ""),
        }, reg)
        target["id"] = hid
        target["馬名"] = (entry.get("names") or [""])[-1]
        target["曾用名"] = list((entry.get("names") or [])[:-1])
    # 2) 补 keys（jbis_id）
    if j.get("jbis_id") and not target.get("jbis_id"):
        target["jbis_id"] = j["jbis_id"]
    # 3) 补基础字段（netkeiba 空 → JBIS）；占位档的「0戦0勝」视为默认值 → JBIS 通算成績優先
    for k in ("登録状態", "調教師", "総賞金", "毛色", "生年月日", "産地", "馬主", "生産牧場"):
        if not target.get(k) and j.get(k):
            target[k] = j[k]
    if j.get("通算成績"):
        _t = target.get("通算成績") or ""
        if (not _t) or re.match(r"^0戦0勝", _t):
            target["通算成績"] = j["通算成績"]
    # 4) cross / fno 增强
    if not target.get("cross") and j.get("cross"):
        target["cross"] = j["cross"]
    if not target.get("fno") and j.get("fno"):
        target["fno"] = j["fno"]


def merge(nk_records, jbis_records, jbis_ped_records, reg):
    """netkeiba 主 + jbis 兜底 + jbis_pedigree 增强（M1：身份经 registry 解析，输出带 id）。
    返回 [马档案]，每匹含 id（registry 分配/沿用）。"""
    jbis = {norm(h.get("馬名", "")): h for h in jbis_records}
    enrich = {norm(h.get("馬名", "")): h for h in jbis_ped_records if h.get("pedigree")}
    nk_keys = {norm(r.get("馬名", "")) for r in nk_records}
    # W4：国别后缀映射（JBIS 血统树节点名带 (USA) 等 → 给 netkeiba クロス 补后缀）
    suffix_map = _build_suffix_map(enrich.values(), jbis.values())

    def build(r, j, e):
        hid, entry = resolve_identity({
            "nk_id": r.get("nk_id", ""), "jbis_id": r.get("jbis_id", ""),
            "馬名": r.get("馬名", ""), "生年": r.get("生年", ""),
        }, reg)
        # M1：馬名跟随 registry 当前名（names[-1]）——占位名仔已正式命名时，
        # 源（netkeiba.json）可能仍为占位名，registry 是身份权威。
        cur_name = (entry.get("names") or [""])[-1] or r.get("馬名", "")
        h = {
            "id": hid,
            "nk_id": r.get("nk_id", ""),
            "jbis_id": r.get("jbis_id", "") or j.get("jbis_id", "") or e.get("jbis_id", ""),
            "馬名": cur_name,
            "曾用名": list((entry.get("names") or [])[:-1]),
            "性別": r.get("性別", ""),
            "生年月日": r.get("生年月日", ""),
            "毛色": r.get("毛色", ""),
            "産地": r.get("産地", ""),
            "馬主": r.get("馬主", ""),
            "生産牧場": r.get("生産牧場", ""),
            "調教師": r.get("調教師", ""),
            "通算成績": r.get("通算成績", ""),
            "獲得賞金": r.get("獲得賞金", ""),
            "総賞金": r.get("総賞金", ""),
            "母名": r.get("母名", ""),
            "母父名": r.get("母父名", ""),
            "生年": r.get("生年", ""),
            "登録状態": r.get("登録状態", ""),
            "英文名": r.get("英文名", ""),              # W4/D4：netkeiba 英文名
            "セリ取引価格": r.get("セリ取引価格", ""),  # W4/D4：netkeiba セリ取引価格
            "pedigree": r.get("pedigree") or j.get("pedigree", {}),
            "fno": r.get("fno") or j.get("fno", "") or e.get("fno", ""),
            "cross": _fmt_cross(r.get("cross", "") or j.get("cross", "") or e.get("cross", ""), suffix_map),  # W4：netkeiba クロス 优先
        }
        return h

    out = []
    for r in nk_records:
        key = norm(r.get("馬名", ""))
        h = build(r, jbis.get(key, {}), enrich.get(key, {}))
        if h["馬名"]:
            out.append(h)

    # 索引（W1/D1）：netkeiba 占位档（`〇〇の2023` 未命名仔）→ (母名, 生年)。
    # 仅索引占位名：未命名仔无正式名，只能靠 (母名, 生年) 定位；已命名马靠「去后缀名+生年」命中，
    # 避免 (母名, 生年) 误并不同马。
    nk_by_id = {h["id"]: h for h in out}
    out_by_nk = {h.get("nk_id", ""): h for h in out if h.get("nk_id")}
    nk_by_mother_year = {}
    for r in nk_records:
        if not racelib.is_unnamed_name(r.get("馬名") or ""):
            continue
        mother = r.get("母名", "") or _mother_from_pedigree(r.get("pedigree"))
        if mother and r.get("生年"):
            nk_by_mother_year.setdefault((norm(mother), str(r.get("生年", ""))), r)

    # JBIS 兜底：netkeiba 无记录的马（W1/D1：先去后缀名+生年、再 (母名, 生年) 并入已有
    # netkeiba 实体，不再无条件新建）
    for j in jbis_records:
        key = norm(j.get("馬名", ""))
        if key in nk_keys or not j.get("馬名"):
            continue
        target = None
        # 1) 去后缀名 + 生年 → registry（同名同生年 = 同一匹马）
        stripped = racelib.strip_country_suffix(j.get("馬名", ""))
        entry = reg["by_name_year"].get((norm(stripped), str(j.get("生年", ""))))
        if entry is not None:
            target = nk_by_id.get(entry["id"])
        # 2) (母名, 生年) → netkeiba 占位档（仅未命名仔；命中 = 同母同生年 = 同一匹马）
        if target is None:
            mother = j.get("母名", "") or _mother_from_pedigree(j.get("pedigree"))
            if mother:
                r = nk_by_mother_year.get((norm(mother), str(j.get("生年", ""))))
                if r is not None:
                    target = out_by_nk.get(r.get("nk_id", ""))
        if target is not None:
            _fill_from_jbis(target, j, reg)
            continue
        # 3) 无命中 → 新建 JBIS-only 实体
        h = build({"馬名": j.get("馬名", ""), "生年": j.get("生年", "")}, j, {})
        h.update({
            "nk_id": "",
            "jbis_id": j.get("jbis_id", ""),
            "性別": j.get("性別", ""),
            "生年月日": j.get("生年月日", ""),
            "毛色": j.get("毛色", ""),
            "産地": j.get("産地", ""),
            "馬主": j.get("馬主", ""),
            "生産牧場": j.get("生産牧場", ""),
            "調教師": j.get("調教師", ""),
            "通算成績": j.get("通算成績", ""),
            "獲得賞金": "",
            "総賞金": j.get("総賞金", ""),
            "pedigree": j.get("pedigree", {}),
            "fno": j.get("fno", ""),
            "cross": _fmt_cross(j.get("cross", ""), suffix_map),
        })
        out.append(h)

    # 输出排序 = 生年月日（缺失退生年）从小到大，与 registry id 顺序一致
    out.sort(key=lambda h: (racelib.birth_date_key(h), norm(h["馬名"] or "")))
    return out


def update_manifest(current_id, count, note="", versions=None, has_snapshot=True):
    mf_path = os.path.join(DATA, "manifest.json")
    mf = {"current": current_id, "versions": []}
    if os.path.exists(mf_path):
        with open(mf_path, encoding="utf-8") as f:
            old = json.load(f)
        mf["versions"] = old.get("versions", [])
    mf["versions"] = [v for v in mf["versions"] if v["id"] != current_id]
    if has_snapshot:
        mf["versions"].insert(0, {
            "id": current_id,
            "file": f"history/{current_id}.json",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "count": count,
            "note": note,
        })
    # 清理孤儿引用：登记的版本文件不存在（含历史遗留）→ 剔除，保证前端版本下拉可加载
    mf["versions"] = [v for v in mf["versions"] if os.path.exists(os.path.join(ROOT, v.get("file", "")))]
    mf["versions"] = mf["versions"][:30]
    # current 必须指向真实存在的快照：no-snapshot 不写新文件 → 保持旧 current（回退到最近存在的）
    if has_snapshot:
        mf["current"] = current_id
    elif mf["versions"]:
        mf["current"] = mf["versions"][0]["id"]
    with open(mf_path, "w", encoding="utf-8") as f:
        json.dump(mf, f, ensure_ascii=False, indent=2)
    return mf


def load_aliases():
    path = os.path.join(DATA, "aliases.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_ledger():
    """读取契约B快照（pull_races.py 产出）→ 类型化记录 + 校验 issues"""
    path = os.path.join(RACES_DIR, "google_ledger.csv")
    if not os.path.exists(path):
        return [], []
    issues = []
    records = []
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rec = racelib.coerce_record(row, issues)
            if rec:
                records.append(rec)
    return records, issues


def _merge_gap(base, gap, fill_fields):
    """海外场：netkeiba 为主，台账只补空缺字段"""
    out = dict(base)
    for k in fill_fields:
        if not out.get(k) and gap.get(k):
            out[k] = gap[k]
    return out


def _race_key(r):
    return (str(r.get("日付", "")), str(r.get("場名", "")), str(r.get("R", "")))


def _shutoku_of(recs):
    """収得計算（M4.3）→ 剥离缺失报告后写入 stats 的 {平地, 障害}（円）"""
    got = racelib.compute_shutoku(recs)
    if got["缺失"]:
        print(f"  ⚠ 収得缺失 {len(got['缺失'])} 场（本賞金未抓到，按 0 暂计）: {got['缺失'][:5]}")
    return {"平地": got["平地"], "障害": got["障害"]}


def _match_ledger_to_existing(g, reg, by_norm):
    """台账海外马匹配链（W1/D1）：去后缀名+生年 → registry → (母名,生年) → 已有 netkeiba 实体。
    返回 by_norm 键（可 attach）或 None。台账记录无 jbis_id，链上"JBIS"由 registry 的
    JBIS 登记名承担（by_name_year 已用去国家后缀名）。"""
    name = g["name"]
    _sex, birth = racelib.derive_basic(g["recs"])
    if not birth:
        return None
    # 1) 去后缀名 + 生年 → registry 当前名 → by_norm
    stripped = racelib.strip_country_suffix(name)
    entry = reg["by_name_year"].get((norm(stripped), birth))
    if entry is not None:
        cur = (entry.get("names") or [""])[-1]
        k = norm(cur)
        if k in by_norm:
            return k
    # 2) (母名, 生年) → 已有 netkeiba 实体（台账记录若有母名列）
    mother = g.get("母名") or ""
    if mother:
        for k, hs in by_norm.items():
            for h in hs:
                if norm(h.get("母名") or "") == norm(mother) and str(h.get("生年") or "") == birth:
                    return k
    return None


def attach_races(records, nk_recs, ledger_rows, aliases, reg):
    """契约B关联到马档案（M2.5：netkeiba 为主 + 台账海外补缺；M4.3 加収得；W1/D1 移除自动建档）。
    - nk_recs:     netkeiba 契约B 记录列表（主源，含 來源=netkeiba / race_id / 本賞金 / jockey_id）
    - ledger_rows: 台账契约B（coerce 后），只保留 venue_type=海外 参与补缺
    - 合并键 (日付,場名,R)：netkeiba 优先；海外场 netkeiba 有 → netkeiba 为主、台账补賞金空缺；
      netkeiba 无 → 台账展示（來源=ledger）
    - W1/D1：台账海外马走匹配链（去后缀名 → registry → (母名,生年) → netkeiba 实体），
      匹配不到进「待确认」；彻底不再自动建档（action=create 分支已移除）。
    返回 (matched, created_names, unmatched_names, aliases, n_with_races)
    """
    by_norm = {}
    for h in records:
        by_norm.setdefault(norm(h.get("馬名", "")), []).append(h)
    for src, entry in aliases.items():
        tgt = entry.get("target", "") if isinstance(entry, dict) else entry
        if tgt:
            by_norm.setdefault(norm(src), []).extend(by_norm.get(norm(tgt), []))

    # 台账只保留海外行（中央/地方由 netkeiba 覆盖）
    ledger_ov = [r for r in ledger_rows if r.get("venue_type") == "海外"]
    nk_by_name, ov_by_name = {}, {}
    for r in nk_recs:
        nk_by_name.setdefault(norm(r.get("出走馬名", "")), []).append(r)
    for r in ledger_ov:
        ov_by_name.setdefault(norm(r.get("出走馬名", "")), []).append(r)

    horse_recs = {}
    for key in set(nk_by_name) | set(ov_by_name):
        nk_list = nk_by_name.get(key, [])
        ov_list = ov_by_name.get(key, [])
        merged = list(nk_list)  # netkeiba 为主
        nk_dates = {(str(r.get("日付", "")), str(r.get("場名", ""))) for r in nk_list}
        for r in ov_list:
            gap_key = (str(r.get("日付", "")), str(r.get("場名", "")))
            if gap_key in nk_dates:
                # 海外场 netkeiba 有 → netkeiba 为主，台账只补空缺字段
                for base in nk_list:
                    if (str(base.get("日付", "")), str(base.get("場名", ""))) == gap_key:
                        _merge_gap(base, r, ["賞金"])
            else:
                # netkeiba 无该海外场 → 台账展示（W1：台账 CSV 无 來源 列，coerce 不产出 → 补标 ledger）
                merged.append({**r, "來源": "ledger"})
        name = (nk_list[0] if nk_list else ov_list[0]).get("出走馬名", key)
        horse_recs[key] = {"name": name, "recs": merged}

    # 分配: attach(挂到现有马) / unmatched(待确认)。W1/D1：彻底移除 action=create 自动建档；
    # 台账海外马改走匹配链（去后缀名 → registry → (母名,生年) → netkeiba 实体），匹配不到进「待确认」。
    assign = {}
    for key, g in horse_recs.items():
        if key in by_norm:
            assign[key] = ("attach", key)
            continue
        entry = aliases.get(g["name"]) or aliases.get(key) or {}
        tgt = entry.get("target") or ""
        if tgt and norm(tgt) in by_norm:
            assign[key] = ("attach", norm(tgt))
            continue
        mkey = _match_ledger_to_existing(g, reg, by_norm)
        if mkey:
            assign[key] = ("attach", mkey)
        else:
            if not entry:
                note = "海外登记名，无日文名" if g["name"].isascii() else "台账有、仓库无，待确认"
                aliases[g["name"]] = {"action": "", "target": "", "note": note}
            assign[key] = (None, None)

    matched, created, unmatched = 0, [], []
    for key, (mode, _cname) in assign.items():
        if mode == "attach":
            matched += 1
        elif mode == "create":
            created.append(key)
        else:
            unmatched.append(key)

    attach_map = {cname: key for key, (mode, cname) in assign.items() if mode == "attach"}
    n_with = 0
    for h in records:
        key = attach_map.get(norm(h.get("馬名", "")))
        if key:
            h["races"] = horse_recs[key]["recs"]
            # W3/D3：性/年齢/調教師 实时补全（性 = 档案性別；年齢 = 按生年月日+比赛日精确重算，
            # 无生年月日保留台账性齢值；調教師 = 档案级兜底，台账源自带则保留）
            for r in h["races"]:
                if not r.get("性"):
                    r["性"] = h.get("性別", "")
                if h.get("生年月日"):
                    r["年齢"] = racelib.compute_age(r.get("日付"), h.get("生年月日"))
                elif not r.get("年齢"):
                    r["年齢"] = ""
                if not r.get("調教師"):
                    r["調教師"] = h.get("調教師", "")
            h["stats"] = racelib.compute_stats(h["races"])
            h["stats"]["収得賞金"] = _shutoku_of(h["races"])  # M4.3
            n_with += 1
        else:
            h.setdefault("races", [])
            h.setdefault("stats", racelib.compute_stats([]))
            h["stats"]["収得賞金"] = _shutoku_of(h["races"])  # M4.3
        h.setdefault("photo", "")

    # W1/D1：自动建档分支已移除（台账海外马走匹配链，匹配不到进「待确认」），created 恒空。

    return matched, [horse_recs[k]["name"] for k in created], \
        [horse_recs[k]["name"] for k in unmatched], aliases, n_with


def build_merge_report(records, matched, created, unmatched, ledger_issues):
    lines = ["# 合并校验报告（build-data）", ""]
    lines.append(f"- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"- 关联成功: {matched} 匹")
    lines.append(f"- 自动建档: 0 匹（W1/D1 已停用：台账海外马走匹配链并入已有 netkeiba 实体，不再自动建档）")
    lines.append(f"- 待确认: {len(unmatched)} 匹" + (f" → {'、'.join(unmatched)}（已写入 data/aliases.json）" if unmatched else ""))
    lines.append(f"- ledger 校验异常: {len(ledger_issues)} 条")
    for it in ledger_issues[:20]:
        lines.append(f"  - **{it['type']}**: {it}")
    lines.append("")
    lines.append("## 数据覆盖情况（basic.json 有通算成績但台账缺记录的马）")
    missing = []
    for h in records:
        m = re.match(r"(\d+)戦", h.get("通算成績") or "")
        if m and int(m.group(1)) > 0 and not h.get("races"):
            missing.append(h.get("馬名", ""))
    lines.append(f"- 共 {len(missing)} 匹" + ("：" + "、".join(missing[:30]) if missing else "（无）"))
    lines.append("")
    lines.append("## 台账中央+地方 少于 netkeiba 通算成績（待校准）")
    fewer = []
    for h in records:
        m = re.match(r"(\d+)戦", h.get("通算成績") or "")
        if m and h.get("races"):
            # W2/D2：出赛口径 = 中央+地方；海外单列（台账含海外不再误报"台账>通算"）
            led = sum(1 for r in h["races"]
                      if (isinstance(r["結果"], int) or r["結果"] == "中止")
                      and r.get("venue_type") in ("中央", "地方"))
            if int(m.group(1)) > led:
                fewer.append(f"{h.get('馬名', '')}（netkeiba 通算 {int(m.group(1))}戦 / 台账中央+地方 {led}战）")
    lines.append(f"- 共 {len(fewer)} 匹" + ("：" + "、".join(fewer[:30]) if fewer else "（无）"))
    lines.append("")
    lines.append("## 说明")
    lines.append("- 自动建档马匹由台账生成，基本信息（性別/生年由性齢推导）待后续补充")
    lines.append("- 海外赛事赏金未在台账记录，赏金合计 = 中央 + 地方")
    return "\n".join(lines) + "\n"


# ── basic.json 输出：拆分文件 + {_meta, horses} ──
# 设计：docs/PROJECT.md §4。每匹 races/血统树拆到 data/racefiles/{id}.json /
# data/pedigree/{id}.json（仅建有内容的马），basic.json 只留基本信息 + 文件引用。


def write_split_files(records):
    """拆分 races / pedigree 到独立文件（仅建有内容的马）。返回 (race_count, pedigree_count)。
    basic.json 内嵌字段替换为文件引用：race_count / races_file / pedigree_file；无内容留空串。"""
    os.makedirs(RACEFILES_DIR, exist_ok=True)
    os.makedirs(PEDIGREE_DIR, exist_ok=True)
    n_race, n_ped = 0, 0
    for h in records:
        hid = h["id"]
        races = h.get("races") or []
        if races:
            with open(os.path.join(RACEFILES_DIR, f"{hid}.json"), "w", encoding="utf-8") as f:
                json.dump({"id": hid, "馬名": h.get("馬名", ""), "races": races},
                          f, ensure_ascii=False, indent=1)
            n_race += 1
        h["race_count"] = len(races)
        h["races_file"] = f"data/racefiles/{hid}.json" if races else ""
        ped = h.get("pedigree") or {}
        if ped.get("父") or ped.get("母"):
            with open(os.path.join(PEDIGREE_DIR, f"{hid}.json"), "w", encoding="utf-8") as f:
                json.dump({"id": hid, "馬名": h.get("馬名", ""), "pedigree": ped,
                           "fno": h.get("fno", ""), "cross": h.get("cross", "")},
                          f, ensure_ascii=False, indent=1)
            n_ped += 1
        h["pedigree_file"] = f"data/pedigree/{hid}.json" if (ped.get("父") or ped.get("母")) else ""
        # basic.json 内嵌字段瘦身：races 已拆文件；pedigree 保留 fno/cross 摘要、大血统树移文件
        h["races"] = []
        h["pedigree"] = {}
    return n_race, n_ped


def build_basic(records, built_iso, sources):
    """records（含 races/pedigree 内嵌）→ basic.json 输出 dict {_meta, horses}。
    - 拆分 races/pedigree 文件（M5.3）
    - horses 只保留基本信息（BASIC_FIELDS 白名单），stats/races/血统树等一律不入文件
    - _meta 与快照解耦：不写 manifest 引用（快照由 data/manifest.json 单独登记）
    - 检索索引（facet/index）已移除，待后续单独设计（2026-08 拍板）
    """
    n_race, n_ped = write_split_files(records)
    horses = [{k: h.get(k, "") for k in BASIC_FIELDS} for h in records]
    return {
        "_meta": {
            "schema": "basic/v1",
            "built": built_iso,
            "count": len(horses),
            "sources": sources,
        },
        "horses": horses,
    }, n_race, n_ped


def main():
    ap = argparse.ArgumentParser(description="云迹数据构建（netkeiba 主 + JBIS 兜底）")
    ap.add_argument("--note", default="netkeiba+JBIS 抓取更新")
    ap.add_argument("--no-snapshot", action="store_true")
    args = ap.parse_args()

    nk = load_raw("netkeiba.json")
    jb = load_raw("jbis.json")
    jb_ped = load_raw("jbis_pedigree.json")
    reg = load_registry()
    records = merge(nk, jb, jb_ped, reg)
    if not records:
        sys.exit("❌ 无数据：先跑 scrape_netkeiba.py / scrape_jbis.py")

    with_ped = sum(1 for h in records if h.get("pedigree") and h["pedigree"].get("父"))
    with_nk_ped = sum(1 for h in records if h.get("nk_id") and h.get("pedigree", {}).get("父"))
    with_jbis_only = sum(1 for h in records if not h.get("nk_id"))
    with_cross = sum(1 for h in records if h.get("cross"))
    print(f"✔ 身份层: registry {len(reg['horses'])} 条（id 由 build-registry 种子 + max+1 维护）")
    print(f"✔ netkeiba {len(nk)} 匹 + jbis 兜底 {len(jb)} 匹 → 合并 {len(records)} 匹")
    print(f"✔ 血统覆盖: {with_ped}/{len(records)}（netkeiba 源 {with_nk_ped}，JBIS 兜底 {with_jbis_only}）")
    print(f"✔ クロス增强: {with_cross} 匹")

    # ── 比赛数据（M2.5 主源：netkeiba 成绩页 + 台账仅海外补漏）──
    aliases = load_aliases()
    ledger_rows, ledger_issues = load_ledger()
    netkeiba_db = netkeiba_races.load_races_db()
    jockeys = netkeiba_races.load_jockeys()
    if netkeiba_db:
        # fetch 无参会自读 basic.json 取 nk_id→馬名；basic.json 已改 {_meta,horses}，必须显式传
        name_by_nk = {h["nk_id"]: h.get("馬名", "") for h in records if h.get("nk_id")}
        nk_recs = netkeiba_races.fetch(name_by_nk)
        matched, created, unmatched, aliases, n_with = attach_races(
            records, nk_recs, ledger_rows, aliases, reg)
        with open(os.path.join(DATA, "aliases.json"), "w", encoding="utf-8") as f:
            json.dump(aliases, f, ensure_ascii=False, indent=1)
        print(f"✔ 比赛数据: netkeiba 主源 {len(netkeiba_db)} 匹 · 台账海外关联 {matched} 匹"
              f" · 自动建档 {len(created)} 匹 · 待确认 {len(unmatched)} 匹")
        if created:
            print("✔ 自动建档:", "、".join(created))
        if unmatched:
            print("⚠ 待确认（已写入 aliases.json）:", "、".join(unmatched))
        mreport = build_merge_report(records, matched, created, unmatched, ledger_issues)
        with open(os.path.join(DATA, "merge-report.md"), "w", encoding="utf-8") as f:
            f.write(mreport)
        print(f"✔ 已写: data/merge-report.md（覆盖/待校准清单）")
    else:
        print("⚠ 无 data/raw/netkeiba_races.json，跳过比赛数据（先跑 scripts/adapters/netkeiba_races.py）")

    # ── 写回 registry（新马/改名/补 keys 已并入）──
    save_registry(reg)
    print(f"✔ 已写回: data/registry.json（{len(reg['horses'])} 条）")

    # ── 输出排序 = 生年月日（缺失退生年）从小到大，与 registry id 顺序一致 ──
    # 台账建档马由 attach_races 追加，需在最后统一重排，保证 basic.json 顺序 = id 顺序
    records.sort(key=lambda h: (racelib.birth_date_key(h), norm(h["馬名"] or "")))

    os.makedirs(HISTORY, exist_ok=True)
    cur_id = datetime.now().strftime("%Y%m%d_%H%M")

    # ── 先写快照（v1 完整形态，含 races/pedigree 内嵌，便于回滚与对比）──
    # 注意：必须在 build_v2 之前——build_v2 会清空 records 内嵌 races/pedigree（拆文件）
    if not args.no_snapshot:
        with open(os.path.join(HISTORY, f"{cur_id}.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=1)

    # ── basic.json：{_meta, horses} + races/pedigree 拆分 ──
    sources = {}
    for name in ("netkeiba", "jbis", "ledger"):
        p = os.path.join(DATA, "raw", f"{name}.json") if name != "ledger" else os.path.join(RACES_DIR, "google_ledger.csv")
        if os.path.exists(p):
            sources[name] = datetime.now().strftime("%Y-%m-%d")
    out, n_race, n_ped = build_basic(records, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                     sources)

    with open(os.path.join(DATA, "basic.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    mf = update_manifest(cur_id, len(records), args.note, has_snapshot=not args.no_snapshot)
    print(f"✔ basic.json 已更新 ({len(out['horses'])} 匹 · schema={out['_meta']['schema']})")
    print(f"✔ 拆分: data/racefiles/ ×{n_race} · data/pedigree/ ×{n_ped}（仅建有内容的马）")
    print(f"✔ 快照(v1 完整形态): history/{cur_id}.json · 版本数: {len(mf['versions'])}")


if __name__ == "__main__":
    main()
