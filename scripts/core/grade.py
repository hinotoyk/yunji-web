#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层等级表加载：读 config/grade-table.json（格 → 显示文案/徽章类 单一出处，docs/REFACTOR.md §12 R6）。

定位与 sire_config.py 同级：纯 stdlib（json + pathlib），不 import 任何管线，管线 import 它。
消灭原先跨 5 处手同步的本地表（timeline GRADE / datechart·stats TROPHY_GRADES /
race-rows.js GRADE / datechart.html GRADED），此处是 Python 侧唯一读取点：
- 文件缺失/损坏 → sys.exit 显式报错（删本地表后缺源文件必须第一时间暴露，不让管线静默跑错）；
- GRADED（重赏判定）由徽章类派生：徽章类 ∈ {g1, g2, g3} 即重赏（L/OP 是 listed/open 不算），
  一条派生规则同时覆盖 Python 三消费端与前端 window.YJ_GRADE 两处消费（§12.1）；
- GLBL / GBADGE 为派生别名，等值搬移原 build_timeline.py 的语义，既有调用点变量名不变。
"""
import json
import sys

from core import constants

CONFIG_PATH = constants.ROOT / "config" / "grade-table.json"

_GRADED_BADGES = {"g1", "g2", "g3"}   # 徽章类 ∈ 此集合 → 重赏（L/OP 的 listed/open 不算）

_cache = None            # load() 结果（模块级缓存，进程内只读一次）


def load_grade():
    """读 config/grade-table.json → dict（缓存后进程内只读一次）。

    返回四个键：
    - "GRADE":  {格: (显示文案, 徽章类)}（JSON 的 list 转 tuple，等值于原 build_timeline.py 本地表）
    - "GLBL":   {格: 显示文案}（派生别名，原 :33 语义）
    - "GBADGE": {格: 徽章类}（派生别名，原 :34 语义）
    - "GRADED": 重赏格集合（由徽章类 ∈ {g1,g2,g3} 派生，等值于原三处本地集合）
    """
    global _cache
    if _cache is not None:
        return _cache
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))   # utf-8-sig: 兼容带 BOM
    except FileNotFoundError:
        sys.exit(f"❌ 等级表缺失: {CONFIG_PATH}"
                 f"（格 → 显示文案/徽章类 单一出处，见 docs/REFACTOR.md §12.2）")
    except (OSError, ValueError) as e:          # json.JSONDecodeError ⊂ ValueError
        sys.exit(f"❌ 等级表损坏/不可读: {CONFIG_PATH}: {e}")
    table = raw.get("GRADE") if isinstance(raw, dict) else None
    if not isinstance(table, dict) or not table:
        sys.exit(f"❌ 等级表格式错误（顶层应含非空 GRADE 对象）: {CONFIG_PATH}")
    grade = {}
    for g, v in table.items():
        if not (isinstance(v, (list, tuple)) and len(v) == 2):
            sys.exit(f"❌ 等级表格式错误（GRADE.{g} 应为 [显示文案, 徽章类]）: {CONFIG_PATH}")
        grade[g] = (str(v[0]), str(v[1]))
    _cache = {
        "GRADE": grade,
        "GLBL": {g: t[0] for g, t in grade.items()},
        "GBADGE": {g: t[1] for g, t in grade.items()},
        "GRADED": {g for g, t in grade.items() if t[1] in _GRADED_BADGES},
    }
    return _cache
