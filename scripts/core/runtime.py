#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""中立层运行时收口：UTF-8 stdout 包装 + PEP 562 惰性导入工厂（docs/REFACTOR.md §5.1 R1）。

收口依据 = 逐字重复防漂移（§9 D7）：9 处调用点（两个 common.py + 7 个入口脚本）原先各持一份
相同的 UTF-8 包装块 / 惰性 __getattr__，统一收进本模块后改为 1 行调用，行为逐字等价。
纯 stdlib（io + sys），遵守离线脚本零第三方依赖红线。
"""
import io
import sys


def install_utf8_stdout():
    """非 UTF-8 控制台（如 Windows GBK）下把 sys.stdout 重包为 UTF-8（errors=replace）。

    已是 UTF-8 或包装失败（无 buffer 等）时静默原样不动——与各脚本原先内联的逐字块等价。"""
    if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass


def make_lazy_getattr(mapping):
    """PEP 562 模块级 __getattr__ 工厂：mapping = {属性名: 惰性加载 callable}（返回被重导出的对象）。

    用法：`__getattr__ = make_lazy_getattr({"requests": lambda: __import__("requests")})`。
    命中映射即调用加载器返回；未命中按模块属性访问惯例 raise AttributeError，
    文案取调用方模块名（与手写 `f"module {__name__!r} has no attribute {name!r}"` 逐字一致）。"""
    try:
        module_name = sys._getframe(1).f_globals.get("__name__", "")   # 工厂在调用方模块顶层求值
    except (AttributeError, ValueError):   # 非 CPython / 栈深异常 → 退化为空名（仅影响报错文案）
        module_name = ""

    def __getattr__(name):
        loader = mapping.get(name)
        if loader is not None:
            return loader()
        raise AttributeError(f"module {module_name!r} has no attribute {name!r}")

    return __getattr__


def install_lazy_http():
    """把 requests / bs4 惰性重导出装成模块级 __getattr__（PEP 562），在调用方模块顶层执行一次：

        __getattr__ = runtime.install_lazy_http()

    收口 basic/common.py 与 races/common.py 相同的惰性映射块（2026-xx 用户决策）：
    import common 本身不触发第三方依赖，离线/CI 场景不被 runner 预装包变化连坐。
    模块名取调用方（install_lazy_http 的调用帧），与直接手写 make_lazy_getattr 等价。"""
    try:
        module_name = sys._getframe(1).f_globals.get("__name__", "")
    except (AttributeError, ValueError):   # 非 CPython / 栈深异常 → 退化为空名（仅影响报错文案）
        module_name = ""

    def __getattr__(name):
        if name == "requests":
            return __import__("requests")
        if name == "BeautifulSoup":
            return __import__("bs4", fromlist=["BeautifulSoup"]).BeautifulSoup
        raise AttributeError(f"module {module_name!r} has no attribute {name!r}")

    return __getattr__
