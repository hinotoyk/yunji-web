#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合并并发缓存 → basic.json，合并后删除缓存。

各并发脚本（fetch_pedigree / fetch_nk_id / fetch_studbook / fetch_detail）
都只写自己独立的 `data/_tmp/<name>.json` 缓存，**不直接碰 basic.json**，
因此它们可以真正并行跑、互不覆盖。本脚本在最后统一把缓存合并进 basic.json。

缓存格式（key 均为 str(id)）：
  _tmp/pedigree.json  {id: "data/pedigree/{id}.json"}
  _tmp/nk_id.json     {id: nk_id}
  _tmp/studbook.json  {id: 馬名意味}
  _tmp/detail.json    {id: {登録状態, 性別, ..., 欧字馬名, ...}}

用法:
    python merge_basic.py            # 合并全部缓存并删除
    python merge_basic.py --keep     # 合并但保留缓存（调试用）
"""
import argparse
import sys

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common

# 缓存名 → 写入 basic.json 的字段映射
PEDIGREE_FIELD = "pedigree_file"


def main():
    ap = argparse.ArgumentParser(description="合并并发缓存 → basic.json")
    ap.add_argument("--keep", action="store_true", help="合并后保留缓存（默认删除）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    by_id = {str(h["id"]): h for h in horses}

    ped = common.read_cache("pedigree")     # {id: pedigree_file}
    nk = common.read_cache("nk_id")         # {id: nk_id}
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

    # 按标准字段顺序重排（模板见 build_registry.BASIC_TEMPLATE，此处固定顺序）
    ORDER = ["id", "nk_id", "jbis_id", "馬名", "欧字馬名", "香港馬名", "自译馬名", "母名", "生年", "馬名意味",
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
    print(f"   - 馬名意味:      {n_stud}")
    print(f"   - 総賞金:        {n_total}")
    print(f"   - 详情字段:      {n_det}")

    if not args.keep:
        common.clean_cache_all()
        print("✔ 已删除 _tmp 缓存")


if __name__ == "__main__":
    main()
