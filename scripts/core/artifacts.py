#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层派生产物 IO：三个 build_*.py 共用的「读 basic / 归一记录 / 内容签名跳过写入」骨架。

收口 build_timeline / build_datechart / build_stats 的逐字重复块
（2026-xx 用户决策，docs/重复代码审计.md B1-B4）：
- load_basic_horses()：读 data/basic.json → horses 列表
- records_of(data)：races 文件内容归一（list 原样 / {"races": [...]} 取 races）
- norm_prize(v)：賞金 → 円 int（datechart 与 stats 同口径，逐字同一份）
- write_if_changed(out, payload, signature_keys, label)：内容无变化时跳过写入——
  generated_at 每次运行都不同，照写会让 --ci 每轮产生空 diff 提交（三个脚本原先各自实现同一块）
纯 stdlib（json + pathlib），遵守离线脚本零第三方依赖红线。
"""
import json

from . import constants


def load_basic_horses():
    """读 data/basic.json → horses 列表（文件缺失/损坏 → 空表，与各脚本原先行为一致）。"""
    try:
        data = json.loads(constants.BASIC_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return data.get("horses", []) if isinstance(data, dict) else []


def records_of(data):
    """races 文件内容 → 记录列表：list 原样；{"races": [...]} 取 races；其余空表。"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        arr = data.get("races")
        return arr if isinstance(arr, list) else []
    return []


def norm_prize(v):
    """該马该场的 賞金 → 円 int；空串/非数 → 0（build_datechart 与 build_stats 同口径）。"""
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v or "").strip().replace(",", "")
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def write_if_changed(out, payload, signature_keys, label):
    """内容无变化时跳过写入；返回是否写入（True=已写，False=跳过）。

    signature_keys：payload 里参与签名的键（meta.generated_at 一律剔除），
    如 timeline 传 ("meta", "events")、datechart ("meta", "runs")、stats ("meta", "by_venue")。
    与原实现逐字等价：meta 键用「剥除 generated_at 后的副本」替换后参与签名
    （`{"meta": m, ...}`，m = meta 剥 generated_at）——否则 generated_at 每次运行都不同，
    签名必不等 → 「内容无变化跳过写入」永久失效。"""
    def signature(d):
        meta = dict(d.get("meta") or {})
        meta.pop("generated_at", None)
        return json.dumps({k: (meta if k == "meta" else d.get(k)) for k in signature_keys},
                          ensure_ascii=False, sort_keys=True)

    if out.exists():
        try:
            if signature(json.loads(out.read_text(encoding="utf-8"))) == signature(payload):
                print(f"{label}: 内容无变化，跳过写入")
                return False
        except (json.JSONDecodeError, OSError):
            pass   # 旧文件损坏/不可读 → 走全量重写
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return True
