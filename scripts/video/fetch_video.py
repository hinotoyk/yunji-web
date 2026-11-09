#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""视频回放 · 抓取 B 站 UP 主**全量**视频清单 → data/video_raw.json（入库，CI 基线）。

通道（为什么不用投稿全量接口见 common.py 文件头）：
  A) 主通道 = 站内搜索按 UP 昵称捞（search_type=video&keyword=<昵称>&order=pubdate）
     实测返回条目 author 恒为该 UP 主 → 等价于全量投稿列表（2026-11：192 条 / 10 页）。
     **合集/系列只覆盖被收录的部分**（实测只 29 条 / 全量 192 条），所以必须走搜索。
  B) 兜底通道 = 合集+系列接口（搜索失败时仍能拿到被收录的那部分，见 --via seasons）。
  分 P：多 P 视频（「8/24-8/25 比赛合集」这类）标题匹配不到单场，真正信息在分 P 标题里
     → 对疑似多 P 的条目再拉 x/web-interface/view 取 pages（--all-pages 可强制全量拉）。
兜底：--from-file <json>（浏览器控制台导出 / 手工维护的数组，字段 bvid/title/pubdate 可缺）。

CI（.github/workflows/video-task.yml）口径：`--via both --best-effort` + 默认累积合并 ——
机房 IP 被抓风控时只告警、沿用旧清单，绝不把已有映射洗空。

产物形状（数组，bvid 去重，新→旧）：
  [{"bvid":"BV...","title":"11月8日 京都3R ゴールデンプロミス 3人气1着","pubdate":1762000000,
    "duration":131,"via":"search","pages":[{"page":1,"part":"8月24日 中京3R ..."}]}]
字段契约见 docs/SCHEMA.md §10。用法:
    python fetch_video.py                     # 搜索通道全量（累积合并）
    python fetch_video.py --via seasons       # 只用合集/系列（搜索被风控时）
    python fetch_video.py --all-pages         # 每条都拉分 P 详情（慢，~1.5s/条）
    python fetch_video.py --from-file 手工.json
    python fetch_video.py --via both --best-effort   # CI 定时任务同款
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

SEARCH_REFERER = "https://search.bilibili.com/"
SEARCH_PAGE_SIZE = 20          # 搜索接口固定 20/页（不可调，调了也无效）
SEARCH_MAX_PAGES = 60          # 保护：UP 主最多 1200 条投稿
TAG_RE = re.compile(r"<[^>]+>")
DUR_RE = re.compile(r"^(?:(\d+):)?(\d{1,2}):(\d{2})$")
# 疑似多 P / 整场合集：标题里没有「N R」场次号，或明说是合集/直播/全场
MULTI_HINT = re.compile(r"合集|直播回放|全场|完整版|生放送")


def clean_title(s):
    """搜索接口标题带 <em class="keyword">高亮</em> → 去标签 + 归一空白（含制表符）。"""
    return re.sub(r"\s+", " ", TAG_RE.sub("", str(s or ""))).strip()


def dur_to_sec(d):
    """'12:34' / '1:02:03' / 131 → 秒。"""
    if isinstance(d, (int, float)):
        return int(d)
    m = DUR_RE.match(str(d or "").strip())
    if not m:
        return 0
    h, mi, se = m.groups()
    return int(h or 0) * 3600 + int(mi) * 60 + int(se)


def add_item(videos, a, via):
    """归一字段（bvid 去重；先到先得，via 并记）。"""
    bvid = str(a.get("bvid") or "").strip()
    if not bvid:
        return
    if bvid in videos:
        v = videos[bvid]
        if via and via not in v["via"]:
            v["via"] += "+" + via
        return
    videos[bvid] = {
        "bvid": bvid,
        "title": clean_title(a.get("title")),
        "pubdate": int(a.get("pubdate") or a.get("ctime") or 0),
        "duration": dur_to_sec(a.get("duration")),
        "via": via,
    }


def up_name(mid):
    """UP 主昵称（搜索关键词用）；拿不到就直接用 mid 兜底（搜索能按 mid 命中吗？不行 → 显式报错）。"""
    try:
        d = common.jget(f"{common.CARD_URL}?mid={mid}")
    except Exception as e:                          # noqa: BLE001
        print(f"⚠ 取 UP 昵称失败：{e}")
        return ""
    card = d.get("card") or {}
    n = str(card.get("name") or "").strip()
    print(f"UP 主：{n}（投稿 {d.get('archive_count')}）")
    return n


def fetch_by_search(mid, keyword):
    """主通道：站内搜索按 UP 昵称 → 全量投稿（author 逐条校验，防串入他人视频）。"""
    if not keyword:
        raise RuntimeError("搜索通道需要 UP 昵称（card 接口失败时可用 config.search.keyword 指定）")
    videos, other = {}, 0
    page, pages_total = 1, 1
    while page <= min(pages_total, SEARCH_MAX_PAGES):
        url = (f"{common.SEARCH_URL}?search_type=video&keyword={quote(keyword)}"
               f"&page={page}&order=pubdate")
        d = common.jget(url, referer=SEARCH_REFERER)
        res = [x for x in (d.get("result") or []) if x.get("type") == "video"]
        pages_total = int(d.get("numPages") or 1)
        if page == 1:
            print(f"搜索：{d.get('numResults')} 条 / {pages_total} 页（每页 20）")
        for x in res:
            if str(x.get("author") or "") != keyword:
                other += 1
                continue
            add_item(videos, x, "search")
        if len(res) < SEARCH_PAGE_SIZE:
            break
        page += 1
    if other:
        print(f"⚠ 搜索命中他人视频 {other} 条（已按 author 过滤）")
    return videos


def fetch_by_seasons(mid, list_page_size, arc_page_size):
    """兜底通道：合集 + 系列（只覆盖被 UP 主收录的部分）。"""
    videos = {}
    seasons, series = [], []
    pn = 1
    while True:
        d = common.jget(f"{common.SEASONS_LIST_URL}?mid={mid}&page_num={pn}&page_size={list_page_size}")
        il = d.get("items_lists") or {}
        total = int((il.get("page") or {}).get("total") or 0)
        got = (il.get("seasons_list") or []) + (il.get("series_list") or [])
        seasons.extend(il.get("seasons_list") or [])
        series.extend(il.get("series_list") or [])
        if not got or pn * list_page_size >= total:
            break
        pn += 1
    print(f"合集 {len(seasons)} 个 · 系列 {len(series)} 个")

    for s in seasons:
        meta = s.get("meta") or {}
        sid, name = meta.get("season_id"), meta.get("name") or ""
        for a in (s.get("archives") or []):
            add_item(videos, a, f"season:{name}")
        p = 1
        while sid:
            try:
                d = common.jget(f"{common.SEASONS_ARCHIVES_URL}?mid={mid}&season_id={sid}"
                                f"&sort_reverse=false&page_num={p}&page_size={arc_page_size}")
            except Exception as e:                  # noqa: BLE001
                print(f"⚠ 合集「{name}」第 {p} 页失败：{e}")
                break
            arc = d.get("archives") or []
            for a in arc:
                add_item(videos, a, f"season:{name}")
            if len(arc) < arc_page_size:
                break
            p += 1

    for s in series:
        meta = s.get("meta") or {}
        sid, name = meta.get("series_id"), meta.get("name") or ""
        p = 1
        while sid:
            try:
                d = common.jget(f"{common.SERIES_ARCHIVES_URL}?mid={mid}&series_id={sid}"
                                f"&pn={p}&ps={arc_page_size}")
            except Exception as e:                  # noqa: BLE001
                print(f"⚠ 系列「{name}」第 {p} 页失败：{e}")
                break
            arc = d.get("archives") or []
            for a in arc:
                add_item(videos, a, f"series:{name}")
            if len(arc) < arc_page_size:
                break
            p += 1
    return videos


def need_pages(v):
    """疑似多 P：标题无场次号，或明说合集/直播/全场。"""
    t = v.get("title") or ""
    return bool(MULTI_HINT.search(t)) or not re.search(r"\d{1,2}\s*[Rr]", t)


def fill_pages(videos, all_pages=False):
    """给多 P 视频补 pages（分 P 标题 = 真正的单场信息）。单 P 不写字段，保持产物瘦。

    熔断：连续 5 条 view 失败（机房 IP 被风控时全部 412/超时）→ 直接放弃本轮分 P 详情，
    避免 87 条 × 30s 超时把 CI job 撑爆（已抓到的清单照常保留，旧 pages 由合并逻辑续命）。
    """
    targets = [v for v in videos.values() if all_pages or need_pages(v)]
    print(f"分 P 详情：{len(targets)} / {len(videos)} 条需要拉 view")
    fails = 0
    for i, v in enumerate(targets, 1):
        try:
            d = common.jget(f"{common.VIEW_URL}?bvid={v['bvid']}")
        except Exception as e:                      # noqa: BLE001
            fails += 1
            print(f"⚠ {v['bvid']} view 失败：{e}")
            if fails >= 5:
                print(f"::warning::view 连续失败 {fails} 次（疑似风控/网络）→ 放弃剩余 {len(targets) - i} 条分 P 详情")
                break
            continue
        fails = 0
        pages = d.get("pages") or []
        v["videos"] = int(d.get("videos") or len(pages) or 1)
        if v["videos"] > 1:
            v["pages"] = [{"page": int(p.get("page") or idx), "part": clean_title(p.get("part")),
                           "cid": int(p.get("cid") or 0)} for idx, p in enumerate(pages, 1)]
            print(f"  [{i}/{len(targets)}] {v['bvid']} 多 P {v['videos']} 段："
                  + " | ".join(p["part"] for p in v["pages"][:3]))
        else:
            # 单 P：用视频详情里的完整标题/简介补信号（搜索标题可能被截断）
            if not v.get("title"):
                v["title"] = clean_title(d.get("title"))
            v["desc"] = str(d.get("desc") or "")[:400]
            print(f"  [{i}/{len(targets)}] {v['bvid']} 单 P")


def load_existing():
    """读上一次的清单（data/video_raw.json 优先，退 data/_tmp/video/videos.json）→ ({bvid: item}, 路径)。

    「抓不全不能变成数据变少」：B 站对机房 IP（GitHub runner）会返回 v_voucher 风控票、
    或只放行合集（29/192）→ 直接覆盖会把 111 场映射洗成 2 场。故默认**累积合并**。
    """
    for p in (common.RAW_JSON, common.TMP_VIDEOS_JSON):
        if not p.exists():
            continue
        try:
            arr = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:                      # noqa: BLE001
            print(f"⚠ 旧清单不可读（{p}）：{e}")
            continue
        arr = arr if isinstance(arr, list) else (arr.get("videos") or [])
        rows = {str(v.get("bvid")): v for v in arr if isinstance(v, dict) and v.get("bvid")}
        if rows:
            print(f"已有清单：{len(rows)} 条（{p.name}）→ 本次按累积合并处理")
            return rows, p
    return {}, None


def main():
    ap = argparse.ArgumentParser(description="抓取 B 站 UP 主全量视频清单")
    ap.add_argument("--via", choices=["search", "seasons", "both"], default="search",
                    help="通道：search=按昵称搜全量（默认）/ seasons=合集系列 / both=并集（CI 推荐）")
    ap.add_argument("--all-pages", action="store_true", help="每条都拉 view 分 P 详情（慢）")
    ap.add_argument("--no-pages", action="store_true", help="完全不拉 view（只要清单，最快）")
    ap.add_argument("--from-file", help="跳过网络，从手工导出 JSON 数组读（兜底）")
    ap.add_argument("--replace", action="store_true",
                    help="用本次结果覆盖已有清单（默认**累积合并**：抓不全时不清空旧数据）")
    ap.add_argument("--best-effort", action="store_true",
                    help="CI 模式：风控/网络失败只告警、沿用旧清单并 exit 0（不阻断定时任务与站点）")
    args = ap.parse_args()

    cfg = common.load_config()
    mid = cfg["mid"]
    f = cfg.get("fetch") or {}

    if args.from_file:
        src = Path(args.from_file)
        if not src.exists():
            raise SystemExit(f"--from-file 文件不存在: {src}")
        arr = json.loads(src.read_text(encoding="utf-8"))
        videos = {}
        for a in (arr if isinstance(arr, list) else arr.get("videos") or []):
            add_item(videos, a, a.get("via") or "manual")
        print(f"手工导入：{len(videos)} 条（{src}）")
    else:
        keyword = str((cfg.get("search") or {}).get("keyword") or "").strip() or up_name(mid)
        videos, errors = {}, []
        if args.via in ("search", "both"):
            try:
                videos = fetch_by_search(mid, keyword)
                print(f"搜索通道：{len(videos)} 条")
            except Exception as e:                  # noqa: BLE001
                errors.append(f"搜索通道：{e}")
                print(f"⚠ 搜索通道失败：{e}")
                if args.via == "search" and not args.best_effort:
                    raise SystemExit("搜索通道失败 → 用 --via seasons 兜底，或 --from-file 手工导入")
        if args.via in ("seasons", "both"):
            try:
                sv = fetch_by_seasons(mid, int(f.get("seasons_list_page_size") or 10),
                                      int(f.get("archives_page_size") or 30))
                print(f"合集通道：{len(sv)} 条")
                for b, v in sv.items():
                    if b in videos:
                        if v["via"] not in videos[b]["via"]:
                            videos[b]["via"] += "+" + v["via"]
                    else:
                        videos[b] = v
            except Exception as e:                  # noqa: BLE001
                errors.append(f"合集通道：{e}")
                print(f"⚠ 合集通道失败：{e}")
        if not args.no_pages:
            try:
                fill_pages(videos, all_pages=args.all_pages)
            except Exception as e:                  # noqa: BLE001
                print(f"⚠ 分 P 详情环节异常（已抓到的条目照常保留）：{e}")
        if errors and not videos:
            msg = "全部通道失败：" + " / ".join(errors)
            if args.best_effort:
                print(f"::warning::{msg} → 沿用已有清单，本次不产生新数据")
            else:
                raise SystemExit(msg)

    # ---- 累积合并：默认不覆盖（抓不全 ≠ 数据变少）----
    merged = {} if args.replace else load_existing()[0]
    before = len(merged)
    for b, v in videos.items():
        old = merged.get(b) or {}
        row = {**old, **v}
        if not v.get("pages") and old.get("pages"):
            row["pages"] = old["pages"]                     # 本次没拉到分 P → 保留旧的
        if not v.get("title") and old.get("title"):
            row["title"] = old["title"]
        merged[b] = row
    added = len(merged) - before

    common.TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = sorted(merged.values(), key=lambda v: -(v.get("pubdate") or 0))
    common.RAW_JSON.parent.mkdir(parents=True, exist_ok=True)
    blob = json.dumps(out, ensure_ascii=False, indent=1)
    common.RAW_JSON.write_text(blob, encoding="utf-8")        # 入库（CI 基线）
    common.TMP_VIDEOS_JSON.write_text(blob, encoding="utf-8")  # 本地缓存（gitignore）
    print(f"✔ 已写 {common.RAW_JSON}（清单 {len(out)} 条 · 本次新增 {added}）")
    if not out:
        raise SystemExit("视频清单为空（接口失败）→ 检查 ⚠ 或用 --from-file 兜底")


if __name__ == "__main__":
    main()
