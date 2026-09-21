# -*- coding: utf-8 -*-
"""构建期字体子集化（方案 b · 2026-09-20 定稿）——由 front/scripts/gen-font.mjs 调用。

做法：读入源可变字体 + 语料码点 → 子集化（保留布局表）→ 把 wght 轴限到 [300,700]
      → 按 woff2 > woff > ttf 顺序试写（缺 brotli 时自动降级，见 FLAVOR 输出）
      → 断言「源字体里有的码点必须全部进子集 cmap」（漏字 = 构建失败）。

输出契约（stdout，KEY=VALUE，全部 ASCII，供 node 解析后写 noto-sc.css）：
    FONT=noto-sc-subset.woff2   产出的文件名（含实际扩展名）
    BYTES=512345                产出体积
    FLAVOR=woff2|woff|truetype
    GLYPHS=2585                 子集字形数
    CODES=1902                  语料码点数
    IN_SRC=1898                 源字体 cmap 命中的码点数
    OUT_CMAP=1898               产出字体 cmap 覆盖的语料码点数
    MISS_SRC=U+200D,U+FE0F      源字体本身没有的码点（截断到 12 个）
    COVERAGE=OK|FAIL            漏字断言（IN_SRC 是否全部进产物 cmap）
    VERIFY=OK|FAIL|SKIP         产物回读断言（重新 load 并核对 cmap）
退出码：0 正常 / 2 参数或环境错 / 3 覆盖断言失败 / 4 回读断言失败
"""

import argparse
import sys
from pathlib import Path


def fail(code, msg):
    sys.stderr.write("[subset_font] ERROR: %s\n" % msg)
    raise SystemExit(code)


def parse_args():
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--src", required=True)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--stem", default="noto-sc-subset")
    p.add_argument("--codes", required=True)
    p.add_argument("--wght", default="300-700")
    p.add_argument("--no-verify", action="store_true")
    return p.parse_args()


def main():
    try:
        from fontTools.subset import Options, Subsetter
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError as e:
        fail(2, "fontTools unavailable: %s" % e)

    args = parse_args()
    src = Path(args.src)
    if not src.is_file():
        fail(2, "source font not found: %s" % src)

    # 语料：一个 UTF-8 文本文件，内容为字符全集本体（不是转义）
    raw = Path(args.codes).read_text(encoding="utf-8")
    codes = {ord(c) for c in raw if c not in "\r\n\x00\t"}
    if not codes:
        fail(2, "empty corpus")

    try:
        lo, hi = (int(x) for x in args.wght.split("-"))
    except ValueError:
        fail(2, "bad --wght %r" % args.wght)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    font = TTFont(str(src), lazy=False)
    src_cmap = set(font.getBestCmap().keys())
    in_src = codes & src_cmap
    miss_src = sorted(codes - src_cmap)

    opt = Options()
    opt.layout_features = ["*"]   # 保留 GSUB/GPOS：换字形形态的观感风险不值那点字节（见 ANALYSIS §3 表）
    opt.name_IDs = ["*"]
    opt.notdef_outline = True
    opt.hinting = False
    opt.recalc_bounds = False
    opt.ignore_missing_glyphs = True  # 源字体没有的码点不报错（它们本来就得走系统回退）

    sub = Subsetter(options=opt)
    sub.populate(unicodes=sorted(codes))
    sub.subset(font)

    instantiateVariableFont(font, {"wght": (lo, hi)}, inplace=True)

    # 注意：maxp.numGlyphs 要到表重编译后才更新，子集后的真实字形数看 glyphOrder
    glyphs = len(font.getGlyphOrder())
    out_cmap = set(font.getBestCmap().keys())
    covered = in_src & out_cmap
    coverage_ok = len(covered) == len(in_src)

    # 容器格式：woff2 需要 brotli（官方包或 PYTHONPATH 上的 ctypes 替身），缺就降级。
    # 容器格式在 fontTools 里是 TTFont.flavor（save 只认它），故试写完必须清回去。
    flavor, ext = "truetype", ".ttf"
    for cand_flavor, cand_ext in (("woff2", ".woff2"), ("woff", ".woff")):
        probe = out_dir / (args.stem + ".probe" + cand_ext)
        font.flavor = cand_flavor
        try:
            font.save(str(probe))
            flavor, ext = cand_flavor, cand_ext
            break
        except Exception as e:  # ImportError(No module named brotli) 等
            sys.stderr.write("[subset_font] %s unavailable (%s: %s)\n"
                             % (cand_flavor, type(e).__name__, e))
        finally:
            font.flavor = None
            probe.unlink(missing_ok=True)

    font.flavor = flavor if flavor != "truetype" else None
    target = out_dir / (args.stem + ext)
    font.save(str(target))
    font.flavor = None
    size = target.stat().st_size

    verify = "SKIP"
    if not args.no_verify:
        try:
            back = TTFont(str(target), lazy=False)
            bcmap = set(back.getBestCmap().keys())
            bad = in_src - bcmap
            if bad:
                fail(3, "re-read font misses %d codepoints" % len(bad))
            if back["maxp"].numGlyphs != glyphs:
                fail(3, "re-read glyph count differs: %s vs %s"
                     % (back["maxp"].numGlyphs, glyphs))
            verify = "OK"
        except SystemExit:
            raise
        except Exception as e:
            print("VERIFY=FAIL")
            fail(4, "cannot re-read produced font: %s: %s" % (type(e).__name__, e))

    print("FONT=%s" % target.name)
    print("BYTES=%d" % size)
    print("FLAVOR=%s" % flavor)
    print("GLYPHS=%d" % glyphs)
    print("CODES=%d" % len(codes))
    print("IN_SRC=%d" % len(in_src))
    print("OUT_CMAP=%d" % len(covered))
    print("MISS_SRC=%s" % ",".join("U+%04X" % c for c in miss_src[:12]))
    print("COVERAGE=%s" % ("OK" if coverage_ok else "FAIL"))
    print("VERIFY=%s" % verify)
    if not coverage_ok:
        miss = sorted(in_src - out_cmap)
        sys.stderr.write("[subset_font] missing from subset cmap: %s\n"
                         % ",".join("U+%04X" % c for c in miss[:20]))
        raise SystemExit(3)


if __name__ == "__main__":
    main()
