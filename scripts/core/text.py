#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层文本归一：名字/键去噪音、母名归一。"""
import re

# 全角罗马数字 → 拉丁（统一用 I/II/III...）
ROMAN_FULL = {"Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V",
              "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X"}


def norm(s):
    """去 全半角空格/括号 等噪音（用于名字/键归一）。"""
    return re.sub(r"[ 　()（）\[\]【】]", "", s or "").strip()


def norm_mare(s):
    """母名归一化：去产地括注 + 去空白 + 罗马数字统一拉丁。netkeiba/JBIS 两侧一致。"""
    s = re.sub(r"[（(][A-Za-z]+[）)]", "", s or "")
    s = s.replace(" ", "").replace("　", "")
    for k, v in ROMAN_FULL.items():
        s = s.replace(k, v)
    return s


# ── 全角 → 半角：双作用域（docs/REFACTOR.md §5.1 R7，v2.4 定案 R7-α/β/γ） ──
# 必须走 str.maketrans（translate 只认 ordinal 键，直接给字符键会静默不生效）。
# 全量版表：0x3000（全角空格）→ 空格；FF01-FF5E → ASCII 0x21-0x7E（94 字母数字标点）。
_FW_TABLE = str.maketrans({0x3000: 0x20, **{0xFF01 + i: 0x21 + i for i in range(94)}})
# 窄版表：仅 ０-９（）→ 0-9()（racelib _fold_fullwidth 系口径；全角字母等不折叠，防 3歳Ａ→3歳A 行为变化）。
_FW_NARROW_TABLE = str.maketrans("０１２３４５６７８９（）", "0123456789()")


def fw2hw(s):
    """全角 → 半角（全量版）：0x3000→空格、FF01-FF5E→对应半角（字母数字标点），
    其余字符原样。与原 studbook 管线本地「逐字循环全角→半角」逐字等价。

    ⚠ 作用域（R7）：本函数只给 studbook 检索参 / normalize_grade 这类「全量折叠」用；
    _fold_fullwidth 系必须走 fw2hw_narrow（窄版），别把全角字母也折叠了（防 3歳Ａ→3歳A 行为变化）。"""
    return (s or "").translate(_FW_TABLE)


def fw2hw_narrow(s):
    """全角 → 半角（窄版）：只折叠 ０-９ 与 （）→ 0-9 与 ()；全角字母（ＡＺ 等）不折叠。
    与原 racelib 窄版「全角数字/括号」translate 表逐字等价。

    ⚠ 作用域（R7）：本函数是 racelib._fold_fullwidth 系（名字/键折叠）唯一正确版本，
    勿拿全量版 fw2hw 替换它。"""
    return (s or "").translate(_FW_NARROW_TABLE)
