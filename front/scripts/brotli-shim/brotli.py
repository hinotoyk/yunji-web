# -*- coding: utf-8 -*-
"""brotli 的最小实现（ctypes 直调系统 libbrotlienc/libbrotlidec）——**不是**第三方包。

为什么存在
    本机 Python 只有 fontTools（4.61.1），没有 `brotli` / `brotlicffi`，
    而 `fontTools.ttLib.woff2` 在写 woff2 时硬性 `import brotli`
    （只用到 compress(data, mode=MODE_FONT) / decompress / MODE_* 常量）。
    项目约定不许 pip install 改环境，于是这里用 ctypes 包一层 Git for Windows
    自带的 libbrotlienc.dll（MSYS2 mingw64 发行物），**只在子进程的 PYTHONPATH 上出现**，
    不装进 site-packages、不影响任何其它脚本。

优先级
    front/scripts/gen-font.mjs 先探测真 `brotli`/`brotlicffi`；存在就不挂本目录，
    因此装了官方包后本文件自动失效（可删）。

用法约束
    仅供构建期字体子集化使用；API 面只覆盖 fontTools 实际调用到的那几个符号。
"""

import ctypes
import os
import shutil

MODE_GENERIC = 0
MODE_TEXT = 1
MODE_FONT = 2

DEFAULT_QUALITY = 11
DEFAULT_LGWIN = 22
DEFAULT_LGBLOCK = 0
DEFAULT_MODE = MODE_GENERIC

_MAX_LGWIN_MIN, _MAX_LGWIN_MAX = 10, 24
_MIN_QUALITY, _MAX_QUALITY = 0, 11


def _candidate_dirs():
    env = os.environ.get("YJ_BROTLI_DLL_DIR")
    if env:
        yield env
    git = shutil.which("git")
    if git:  # <GIT>/cmd/git.exe -> <GIT>/mingw64/bin
        yield os.path.join(os.path.dirname(os.path.dirname(git)), "mingw64", "bin")
    for root in (
        r"C:\Program Files\Git",
        r"C:\Program Files (x86)\Git",
        r"D:\Tools\Git\Git",
        r"C:\msys64",
        r"D:\msys64",
    ):
        yield os.path.join(root, "mingw64", "bin")


def _load(name):
    tried = []
    for d in _candidate_dirs():
        p = os.path.join(d, name)
        tried.append(p)
        if not os.path.isfile(p):
            continue
        try:  # 让同目录依赖 DLL（libbrotlicommon / libwinpthread / libgcc）可解析
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(d)
        except OSError:
            pass
        try:
            return ctypes.CDLL(p)
        except OSError:
            continue
    raise ImportError("libbrotli not found; tried: " + "; ".join(tried))


_ENC = None
_DEC = None


def _enc():
    global _ENC
    if _ENC is None:
        lib = _load("libbrotlienc.dll")
        lib.BrotliEncoderMaxCompressedSize.argtypes = [ctypes.c_size_t]
        lib.BrotliEncoderMaxCompressedSize.restype = ctypes.c_size_t
        lib.BrotliEncoderCompress.argtypes = [
            ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_size_t, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_size_t), ctypes.c_char_p,
        ]
        lib.BrotliEncoderCompress.restype = ctypes.c_int
        _ENC = lib
    return _ENC


def _dec():
    global _DEC
    if _DEC is None:
        lib = _load("libbrotlidec.dll")
        lib.BrotliDecoderDecompress.argtypes = [
            ctypes.c_size_t, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_size_t), ctypes.c_char_p,
        ]
        lib.BrotliDecoderDecompress.restype = ctypes.c_int
        _DEC = lib
    return _DEC


def compress(string, mode=DEFAULT_MODE, quality=DEFAULT_QUALITY,
             lgwin=DEFAULT_LGWIN, dictionary=None, lgblock=DEFAULT_LGBLOCK):
    """官方 brotli.compress 的同名替身（dictionary / lgblock 接收但忽略：
    fontTools 不传，且解码端与参数无关）。"""
    if quality < _MIN_QUALITY or quality > _MAX_QUALITY:
        raise ValueError("quality must be in [%d, %d]" % (_MIN_QUALITY, _MAX_QUALITY))
    if lgwin < _MAX_LGWIN_MIN or lgwin > _MAX_LGWIN_MAX:
        raise ValueError("lgwin must be in [%d, %d]" % (_MAX_LGWIN_MIN, _MAX_LGWIN_MAX))
    if dictionary is not None:
        raise NotImplementedError("custom dictionary not supported by the ctypes shim")
    data = bytes(string)
    if not data:
        return b""
    lib = _enc()
    cap = lib.BrotliEncoderMaxCompressedSize(len(data))
    if not cap:
        cap = len(data) + 64
    buf = ctypes.create_string_buffer(cap)
    size = ctypes.c_size_t(cap)
    ok = lib.BrotliEncoderCompress(
        int(quality), int(lgwin), int(mode), len(data), data, ctypes.byref(size), buf
    )
    if not ok:
        raise MemoryError("BrotliEncoderCompress failed")
    return buf.raw[: size.value]


def decompress(string):
    data = bytes(string)
    lib = _dec()
    cap = max(64, len(data) * 24)  # 字体反压比可达 ~20x，留出余量
    while True:
        buf = ctypes.create_string_buffer(cap)
        size = ctypes.c_size_t(cap)
        r = lib.BrotliDecoderDecompress(len(data), data, ctypes.byref(size), buf)
        if r == 1:
            return buf.raw[: size.value]
        if r == 0 and size.value == cap:  # 输出缓冲不够：翻倍再来
            cap *= 4
            continue
        raise ValueError("BrotliDecoderDecompress failed (code=%s)" % r)
