# -*- coding: utf-8 -*-
"""适配器：Google Sheets 比赛台账。

本文件是唯一知道 Google Sheets 细节的代码（URL、CSV 导出、列名映射、日期格式）。
输出契约B比赛记录（键为契约B字段名，值为字符串，日付已规范化为 YYYY-MM-DD）。
后续台账改列名/换平台/换 API：只改本文件（或新增适配器），下游零改动。
"""
import csv
import io
import ssl
import urllib.request

DEFAULT_URL = ("https://docs.google.com/spreadsheets/d/1PPasJnqqBQy_cbhXLDJ0V11CTUDJs6UBtRwe-nsCNfc"
               "/export?format=csv&gid=1454271910")

# 台账列名 → 契约B字段名（W3/D3：競走名→レース名、馬場→芝ダ、状態→馬場、管理調教師→調教師；
# 条件/母父名 舍弃；性齢 保留给 coerce 提取 性；台账列名变了只改这里）
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
    """下载 CSV（先标准 TLS，失败降级为不校验证书）"""
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
    """YYYY/M/D → YYYY-MM-DD；无法解析原样返回（契约层会校验并报告）"""
    s = (s or "").strip()
    for sep in ("/", "-", "."):
        parts = s.split(sep)
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            return f"{int(parts[0]):04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
    return s


def fetch(url=DEFAULT_URL, timeout=60):
    """拉取台账 → 契约B记录（字符串值，日付已规范化）"""
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
        if src_name := rec.get("出走馬名"):
            rec["日付"] = _normalize_date(rec.get("日付", ""))
            out.append(rec)
        elif rec.get("日付") or rec.get("レース名"):
            # 有内容但缺马名：交给契约层报"缺馬名"
            out.append(rec)
    return out
