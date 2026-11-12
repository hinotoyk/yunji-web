#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层配置加载：读 config/sire.json（全站唯一事实源：种马 + 品牌 + 台账，字段契约见该文件内注释）。

定位与 constants.py 同级：纯 stdlib（json + pathlib），不 import 任何管线，管线 import 它。
- 文件缺失/损坏 → sys.exit 显式报错（新项目漏配置第一时间暴露，不让管线静默跑错）；
- 字段最小校验（降级规则见 §1.1）：sire.name_cn / sire.name_ja 为空 → warning + sire.wins
  视为空数组（父子制覇徽章不启用，避免半成品配置拼出「飞机云同胜：」这类孤悬冒号）；
- 访问器对「缺了会坏功能」的字段（ID / studbook 检索参）返回安全默认并打一次 warning；
  对「空值 = 合法关闭态」的字段（sire.wins 可空数组、ledger.url 空 = 不启用）静默返回默认，
  依据 §1.1 契约，这些空值是文档化的正常状态而非配置错误。
"""
import json
import sys
from datetime import date

from core import constants

CONFIG_PATH = constants.ROOT / "config" / "sire.json"

_cache = None            # load() 结果（模块级缓存，进程内只读一次）
_warned = set()          # 已警告过的键（同一条警告只打一次，防刷屏）


def _warn(key, msg):
    if key not in _warned:
        _warned.add(key)
        print(f"⚠ sire_config: {msg}")


def load():
    """读 config/sire.json → dict（缓存后进程内只读一次）。"""
    global _cache
    if _cache is not None:
        return _cache
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))   # utf-8-sig: 兼容带 BOM
    except FileNotFoundError:
        sys.exit(f"❌ 配置缺失: {CONFIG_PATH}"
                 f"（新项目请先按 README「配置即站点身份」创建 config/sire.json）")
    except (OSError, ValueError) as e:          # json.JSONDecodeError ⊂ ValueError
        sys.exit(f"❌ 配置文件损坏/不可读: {CONFIG_PATH}: {e}")
    if not isinstance(raw, dict):
        sys.exit(f"❌ 配置格式错误（顶层应为对象）: {CONFIG_PATH}")
    sire = raw.get("sire")
    if sire is not None and not isinstance(sire, dict):
        _warn("sire", "config/sire.json 的 sire 段不是对象 → 忽略该段")
        sire = None
    sire = dict(sire) if isinstance(sire, dict) else {}
    # 复核 c：种马名缺失 → wins 整体视为空（父子制覇徽章不启用）
    if not (str(sire.get("name_cn") or "").strip() and str(sire.get("name_ja") or "").strip()):
        _warn("sire.name", "sire.name_cn / sire.name_ja 为空 → sire.wins 视为空数组"
                           "（父子制覇徽章不启用）")
        sire["wins"] = []
    raw["sire"] = sire
    _cache = raw
    return _cache


def _lookup(sec, key, default=""):
    """load()[sec][key]；缺段/缺字段 → default + 打一次 warning（面向「缺了会坏功能」的字段）。"""
    section = load().get(sec)
    if not isinstance(section, dict):
        _warn(sec, f"config/sire.json 缺 {sec} 段 → {sec}.{key} 按空值处理")
        return default
    v = section.get(key)
    if v in (None, ""):
        _warn(f"{sec}.{key}", f"config/sire.json 缺 {sec}.{key} → 按空值处理")
        return default
    return str(v)   # ID / 检索参一律字符串化（netkeiba_id 若写成 JSON 数字，防 int 化拼错 URL）


def jbis_id():
    """sire.jbis_id —— S1，JBIS 産駒一覧 ID。"""
    return _lookup("sire", "jbis_id")


def netkeiba_id():
    """sire.netkeiba_id —— S2，netkeiba 産駒列表 ID。"""
    return _lookup("sire", "netkeiba_id")


def _sire():
    """sire 段（load() 已归一，恒为 dict）。"""
    return load()["sire"]


def _studbook():
    sb = _sire().get("studbook")
    if not isinstance(sb, dict):
        _warn("sire.studbook", "config/sire.json 缺 sire.studbook → studbook 检索参数按空值处理")
        return {}
    return sb


def studbook_name():
    """sire.studbook.name —— S3，studbook.jp 馬名検索参。"""
    return _studbook().get("name") or ""


def studbook_father():
    """sire.studbook.father —— S3，studbook.jp 父馬过滤参。"""
    return _studbook().get("father") or ""


def sire_wins():
    """sire.wins —— S4，父子制覇（種馬生涯重赏一着）。

    空数组/缺省 = 关闭父子制覇徽章（合法状态，静默）；非数组 = 配置错误，warn 后按空处理。
    消费语义：匹配键 = name（norm_race 后与 races 记录レース名比对）；cn = tip 文案；grade 仅留档。
    """
    wins = _sire().get("wins")
    if wins is None:
        return []
    if not isinstance(wins, list):
        _warn("sire.wins", "config/sire.json 的 sire.wins 不是数组 → 按空数组处理"
                           "（父子制覇徽章不启用）")
        return []
    return wins


def sire_name_cn():
    """sire.name_cn —— S6，父子制覇 tip 前缀。空值已在 load() 处统一 warn + wins 置空。"""
    return str(_sire().get("name_cn") or "")


def sire_name_ja():
    """sire.name_ja —— S3 报错文案/日志。空值已在 load() 处统一 warn + wins 置空。"""
    return str(_sire().get("name_ja") or "")


def ledger_url():
    """ledger.url —— S5/S7，台账 Google Sheets CSV 导出 URL。

    空/缺段 = 台账不启用（§4.1 合法关闭态，静默返回空串，由调用方跳过环节）。
    空白串（如 "  "）归一为空串同样视为未启用，防误走下载后崩。"""
    section = load().get("ledger")
    if isinstance(section, dict):
        return str(section.get("url") or "").strip()
    return ""


def progeny_years():
    """sire.progeny_years —— S8，建档/回写要处理的产驹生年（P0-4，2026-11-12）。

    语义 = **只抓列出的生年**：未出生 / 未登记 / 尚无产驹的年份不写进来即可，天然满足
    「没到时间不拉」。返回升序字符串数组（管线 URL 拼装与 CLI `--year` 同口径）。

    校验（不静默降级——年份写错的表现是「建档 0 匹 / 漏整代」且不报错，属最难查的一类坑）：
      缺字段 / 空数组          → sys.exit（新克隆仓库漏配立刻暴露）
      非整数 / 非数字字符串    → sys.exit
      年份 < 1980              → sys.exit（显眼的手滑值）
      年份 > 当前年            → warning + 跳过该年（防手滑写 2027 白跑整轮），其余年份照跑
      全部被跳过               → sys.exit
    """
    v = _sire().get("progeny_years")
    where = "config/sire.json 的 sire.progeny_years"
    if v is None:
        sys.exit(f"❌ 缺少 {where}（例：\"progeny_years\": [2023, 2024]）。"
                 f"语义 = 只抓这些生年；字段说明见 config/sire.json 内注释与 README「配置即站点身份」")
    if not isinstance(v, list) or not v:
        sys.exit(f"❌ {where} 必须是非空数组（例：[2023, 2024]），当前：{v!r}")
    now = date.today().year
    out, seen, skipped = [], set(), []
    for item in v:
        if isinstance(item, bool):      # bool ⊂ int，先挡掉，防 true 被当成 1 年
            sys.exit(f"❌ {where} 含非整数项 {item!r}（应写四位数年份，如 2023）")
        if isinstance(item, int):
            y = item
        elif isinstance(item, str) and item.strip().isdigit():
            y = int(item.strip())
        else:
            sys.exit(f"❌ {where} 含非整数项 {item!r}（应写四位数年份，如 2023）")
        if y < 1980:
            sys.exit(f"❌ {where} 含明显不合理的年份 {y}（< 1980）。请检查是否手滑。")
        if y > now:
            _warn(f"progeny_years.{y}", f"{where} 含未来年份 {y}（当前 {now}）→ 已跳过该年")
            skipped.append(y)
            continue
        if y not in seen:
            seen.add(y)
            out.append(str(y))
    if not out:
        sys.exit(f"❌ {where} 的年份全部无效（{skipped} 均晚于当前年 {now}）→ 无从建档。"
                 f"请只写已出生/已登记的生年。")
    return sorted(out)
