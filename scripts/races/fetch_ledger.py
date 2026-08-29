#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""台账海外场增量拉取（竞赛流水线第 4 环）。

下载 Google Sheets 比赛台账 CSV（唯一知道台账细节的代码：URL / 列名映射），
规范化成记录后**只保留海外场**（venue_type=海外），按 出走馬名 匹配 basic.json
的马 → 与已有 races 文件按比赛键去重 → 只把**新增海外记录**写缓存：
  - _tmp/ledger.json    {id: [新增海外记录...]}
  - _tmp/failures.json  {id: 错误信息}（追加）

说明：
  - 海外场不参与収得（収得只算中央 + 地方 Jpn），也不进 netkeiba 通算成績口径；
    这里只是把「netkeiba 成绩页可能收录不全的海外场」补进逐场履历。
  - 台账赏金列为 万円 → 统一转 円（与 netkeiba 记录口径一致）。
  - 马名对不上（未建档/未命名仔）→ 跳过并记入报告输出。

用法:
    python fetch_ledger.py
"""
import argparse
import csv
import io
import re
import ssl
import sys
import urllib.request

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
import common  # noqa: E402
import racelib  # noqa: E402

DEFAULT_URL = ("https://docs.google.com/spreadsheets/d/1PPasJnqqBQy_cbhXLDJ0V11CTUDJs6UBtRwe-nsCNfc"
               "/export?format=csv&gid=1454271910")

# 国家后缀（台账/basic 两侧记法可能不一致）：`Grand Warrior(JPN)` 与 `Grand Warrior` 是同一匹
_COUNTRY_SUFFIX_RE = re.compile(
    r"\((?:(?:JPN|USA|GB|IRE|NZ|FR|AU|AUS|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK))\)$")


def _name_key(s):
    """馬名匹配键：去国家后缀（链式）+ 去空白。两侧统一后再比较。"""
    s = (s or "").strip()
    prev = None
    while prev != s:
        prev = s
        s = _COUNTRY_SUFFIX_RE.sub("", s).strip()
    return s.replace(" ", "").replace("　", "")

# 台账列名 → 记录字段名（台账列名变了只改这里）
COLUMN_MAP = {
    "日付": "日付", "場名": "場名", "R": "R", "競走名": "レース名", "格": "格",
    "距離": "距離", "馬場": "芝ダ", "状態": "馬場", "天候": "天候",
    "出走馬名": "出走馬名", "騎手": "騎手", "性齢": "性齢", "斤量": "斤量",
    "頭数": "頭数", "人気": "人気", "単勝": "単勝", "結果": "結果", "タイム": "タイム",
    "上り": "上り", "着差": "着差", "通過": "通過", "ペース": "ペース",
    "馬体重": "馬体重", "増減": "増減", "賞金": "賞金", "Rt": "Rt", "管理調教師": "調教師",
}

REQUIRED = ["日付", "場名", "競走名", "出走馬名", "結果"]


def _download(url, timeout=60):
    """下载 CSV（先标准 TLS，失败降级为不校验证书）。"""
    err = None
    for ctx in (None, _unverified_ctx()):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "yunji-web/0.2"})
            if ctx is None:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return r.read()
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            err = e
    raise SystemExit(f"❌ 拉取台账失败: {err}")


def _unverified_ctx():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _normalize_date(s):
    """YYYY/M/D → YYYY-MM-DD；无法解析原样返回（契约层会校验并报告）。"""
    s = (s or "").strip()
    for sep in ("/", "-", "."):
        parts = s.split(sep)
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            return f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
    return s


def fetch_rows(url=DEFAULT_URL, timeout=60):
    """拉取台账 → 字符串行字典列表（日付已规范化）。"""
    raw = _download(url, timeout)
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig", "replace"))))
    if not rows:
        raise SystemExit("❌ 台账为空")
    header = rows[0]
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        raise SystemExit(f"❌ 台账缺必需列: {missing}（可用列: {header}）")
    out = []
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        rec = {}
        for src, dst in COLUMN_MAP.items():
            if src in header:
                i = header.index(src)
                rec[dst] = row[i].strip() if i < len(row) else ""
        rec["日付"] = _normalize_date(rec.get("日付", ""))
        out.append(rec)
    return out


def main():
    ap = argparse.ArgumentParser(description="台账海外场增量拉取")
    ap.add_argument("--url", default=DEFAULT_URL, help="台账 CSV 导出 URL（默认内置）")
    args = ap.parse_args()

    data = common.load_basic()
    horses = data["horses"]
    name_to_h = {}
    for h in horses:
        if h.get("馬名"):
            name_to_h.setdefault(_name_key(h["馬名"]), h)

    rows = fetch_rows(args.url)
    issues = []
    ledger = {}
    unmatched = []
    for row in rows:
        rec = racelib.coerce_record(row, issues)
        if rec is None:
            continue
        if rec.get("venue_type") != "海外":
            continue                      # 只保留海外场
        if rec.get("賞金") is not None:
            rec["賞金"] = rec["賞金"] * 10000 if isinstance(rec["賞金"], int) else ""
        rec["來源"] = "台账"
        rec["本賞金"] = 0
        rec["race_id"] = ""
        rec["jockey_id"] = ""
        h = name_to_h.get(_name_key(rec.get("出走馬名") or ""))
        if not h:
            unmatched.append(rec.get("出走馬名", ""))
            continue
        # 与已有 races 文件去重 → 只留新增。
        # 海外场用 (日付, 場名) 宽松键：netkeiba 海外记录 R 常空/不一致，避免同场被两个来源各存一条。
        id_s = str(h["id"])
        p = common.RACES_DATA_DIR / f"{id_s}.json"
        import json
        exist_keys = set()
        if p.exists():
            exist_keys = {
                "ov:{}|{}".format(x.get("日付", ""), x.get("場名", ""))
                for x in json.loads(p.read_text(encoding="utf-8"))
            }
        if "ov:{}|{}".format(rec["日付"], rec["場名"]) in exist_keys:
            continue
        ledger.setdefault(id_s, []).append(rec)

    n = sum(len(v) for v in ledger.values())
    print(f"✔ 台账海外场: 新增 {n} 条 / {len(ledger)} 匹 · 匹配不上馬名 {len(set(unmatched))} 个")
    for u in sorted(set(unmatched)):
        print(f"   ⚠ 未匹配馬名: {u}")
    for it in issues[:10]:
        print(f"   ⚠ 台账行异常: {it}")

    common.write_cache("ledger", ledger)
    print(f"✔ 已写缓存 _tmp/ledger.json")


if __name__ == "__main__":
    main()
