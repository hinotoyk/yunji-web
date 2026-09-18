#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并并发缓存 → basic.json，合并后删除缓存。

各并发脚本（fetch_pedigree / fetch_nk_id / fetch_studbook / fetch_detail）
都只写自己独立的 `data/_tmp/<name>.json` 缓存，**不直接碰 basic.json**，
因此它们可以真正并行跑、互不覆盖。本脚本在最后统一把缓存合并进 basic.json。

缓存格式（key 均为 str(id)）：
  _tmp/pedigree.json  {id: "data/pedigree/{id}.json"}
  _tmp/nk_id.json     {id: nk_id}
  _tmp/馬名.json      {id: 馬名}（列表页；未命名=空，空值不覆盖已有名）
  _tmp/studbook.json  {id: 馬名意味}
  _tmp/detail.json    {id: {登録状態, 性別, ..., 欧字馬名, ...}}

用法:
    python merge_basic.py            # 合并全部缓存并删除
    python merge_basic.py --keep     # 合并但保留缓存（调试用）
"""
import argparse
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

# 缓存名 → 写入 basic.json 的字段映射
PEDIGREE_FIELD = "pedigree_file"

# netkeiba 未登録名占位：母名のYYYY（如 サウンドバリアーの2023）
_UNNAMED_RE = re.compile(r"^.+の\d{4}$")


def is_unnamed(name):
    """未命名占位判定：全角下划线 ＿＿＿ 或 netkeiba「母名のYYYY」。空值/占位→True。"""
    s = (name or "").replace("＿", "").replace("_", "").strip()
    if s == "":
        return True
    return bool(_UNNAMED_RE.match(s))


def damsire_of(h):
    """母父 = 血统图「母亲的父亲」格：pedigree.母[1][0].name
    （母系第 1 代 = [母]；第 2 代 = [母父, 母母]，取第 1 格，同 front/public/pedigree.js
    simpleHTML/fullHTML 的母线取格逻辑）。文件缺失/结构不全/无名字 → None（保留旧值）。"""
    pf = str(h.get("pedigree_file") or "")
    if not pf:
        return None
    try:
        ped = json.loads((common.ROOT / pf).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    m = ((ped.get("pedigree") or {}).get("母") or [])
    if len(m) < 2 or not m[1] or not isinstance(m[1][0], dict):
        return None
    return str(m[1][0].get("name") or "").strip() or None


def main():
    ap = argparse.ArgumentParser(description="合并并发缓存 → basic.json")
    ap.add_argument("--keep", action="store_true", help="合并后保留缓存（默认删除）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    by_id = {str(h["id"]): h for h in horses}

    ped = common.read_cache("pedigree")     # {id: pedigree_file}
    nk = common.read_cache("nk_id")         # {id: nk_id}
    names = common.read_cache("馬名")       # {id: 馬名}（列表页，未命名=空）
    stud = common.read_cache("studbook")    # {id: 馬名意味}
    total = common.read_cache("总赏金")     # {id: 総賞金(万円)}（列表页）
    det = common.read_cache("detail")       # {id: {详情字段}}

    def apply(cache, field, is_dict=False):
        n = 0
        for id_s, val in (cache or {}).items():
            h = by_id.get(id_s)
            if not h:
                continue
            if is_dict:
                for k, v in (val or {}).items():
                    if v:
                        h[k] = v
            else:
                if val:
                    h[field] = val
            n += 1
        return n

    n_ped = apply(ped, PEDIGREE_FIELD)
    n_nk = apply(nk, "nk_id")
    # 馬名：只补缺，绝不覆盖已有真名（含 netkeiba 占位「母名のYYYY」/下划线 → 不入库）
    n_name = 0
    for id_s, val in (names or {}).items():
        h = by_id.get(id_s)
        if not h:
            continue
        if not val or is_unnamed(val):
            continue                     # 空/占位 → 不写入
        if not is_unnamed(h.get("馬名", "")):
            continue                     # 已有真名 → 不覆盖（防 netkeiba 占位名冲掉 JBIS 真名）
        h["馬名"] = val
        n_name += 1
    n_stud = apply(stud, "馬名意味")
    # 総賞金：0 也需写入（不能走 apply 的真值过滤），单独处理
    n_total = 0
    for id_s, val in (total or {}).items():
        h = by_id.get(id_s)
        if not h:
            continue
        if val is not None:
            h["総賞金"] = val
        n_total += 1
    n_det = apply(det, None, is_dict=True)

    # 母父：每次合并全量重 derive（血统文件世代加深后自动跟上）；derive 失败保留旧值不抹
    n_mps = 0
    for h in horses:
        v = damsire_of(h)
        if v is not None:
            h["母父"] = v
            n_mps += 1

    # 按标准字段顺序重排（模板见 build_registry.BASIC_TEMPLATE，此处固定顺序）
    ORDER = ["id", "nk_id", "jbis_id", "馬名", "欧字馬名", "香港馬名", "自译馬名", "母名", "母父", "生年", "馬名意味",
             "登録状態", "性別", "毛色", "馬齢", "生年月日", "産地", "馬主", "調教師",
             "生産牧場", "通算成績", "獲得賞金 (中央)", "獲得賞金 (地方)", "総賞金", "収得賞金", "セリ取引価格", "photo", "races_file",
             "pedigree_file"]
    LEGACY_DROP = {"獲得賞金", "獲得賞金地方"}   # 旧字段名（已改名为 獲得賞金 (中央)/(地方)），丢弃
    for h in horses:
        extra = {k: v for k, v in h.items() if k not in ORDER and k not in LEGACY_DROP}
        reordered = {k: h.get(k, "") for k in ORDER}
        reordered.update(extra)          # 模板外的新字段（如后续竞赛字段）保留在末尾
        h.clear()
        h.update(reordered)

    common.save_basic(data)
    print(f"✔ 已合并写回 basic.json：")
    print(f"   - pedigree_file: {n_ped}")
    print(f"   - nk_id:         {n_nk}")
    print(f"   - 馬名:          {n_name}")
    print(f"   - 馬名意味:      {n_stud}")
    print(f"   - 総賞金:        {n_total}")
    print(f"   - 详情字段:      {n_det}")
    print(f"   - 母父(血统图):  {n_mps}")

    if not args.keep:
        common.clean_cache_all()
        print("✔ 已删除 _tmp 缓存")


if __name__ == "__main__":
    main()
