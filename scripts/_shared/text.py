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
