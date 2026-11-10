#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""视频回放 · 离线匹配：视频标题 → 比赛键 → data/video-map.json（+ data/video_report.md）。

匹配哲学：**构建期做掉，前端只查表**——正则不带进浏览器。
  1) 读 data/basic.json 的 races_file → 遍历 data/races/*.json 建「(日付, 場名, R) → 比赛键」索引
     （比赛键口径 = racelib.race_key：race:<race_id>；无 race_id 的海外场 slot:<日付>|<場名>|<R>；
     同一场多驹三元组相同 → 同键，同场全部产驹行共享同一视频，天然正确）
  2) 读 data/_tmp/video/videos.json（fetch_video.py 产物或 --videos 指定），按 config/video-sources.json
     的正则从标题抽 日期/场地/R 三信号（日期三形态：2025-11-09 / 2025年4月17日 / 10月26日——
     无年份形态用视频 pubdate 年份兜底；场地名经 venue_alias 归一到 場名 日文值）
  3) 三信号齐 → 三元组查索引命中即落库；任一信号缺失（跨日合集/直播回放类标题）→ 不落库，进报告待人工
  4) data/video_manual.json 人工值**永远优先**（覆盖自动条目或新增，B 站链接自动解析 BV 号，其他链接
     记 source=other 由前端降级为外链打开）
  5) subtitle 二态（用户定稿 2026-11）：标题含 subtitle_hint.yes 关键词 → true，否则 false；
     人工表可覆盖。前端角标只标 true。

产物契约见 docs/SCHEMA.md §10。用法:
    python build_video_map.py                # 用 _tmp 缓存匹配（先跑 fetch_video.py）
    python build_video_map.py --videos x.json
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

BILI_URL_RE = re.compile(r"bilibili\.com/video/(BV[0-9A-Za-z]{8,})", re.I)


def race_key_of(rec):
    """比赛键（与 scripts/races/racelib.py::race_key 同构——改键两处同步，见 common.py 文件头）。"""
    rid = str(rec.get("race_id") or "").strip()
    if rid:
        return "race:" + rid
    return "slot:{}|{}|{}".format(rec.get("日付") or "", rec.get("場名") or "", rec.get("R") or "")


def build_race_index():
    """遍历 data/races/*.json → 三重索引 + 键元信息。

    idx[(日付, 場名, R)]        → 比赛键          （标题带年份时精确查）
    md [(月日, 場名, R)]        → [比赛键…]        （标题只有「11月8日」时跨年候选）
    info[比赛键] = {horses, 日付, 場名, R}         （马名校验 / 报告可读）
    **为什么要 md**：无年份标题若只按 pubdate 推年份，遇到「年初补发去年 12 月比赛」或
    「跨年上传」就会错配到同年另一场；用库内真实候选反查，候选唯一即锁定，不依赖推断。
    """
    basic = json.loads((common.ROOT / "data" / "basic.json").read_text(encoding="utf-8"))
    idx, md, info, conflicts = {}, {}, {}, []
    n = 0
    for h in basic.get("horses") or []:
        rf = h.get("races_file")
        if not rf:
            continue
        p = common.ROOT / rf
        if not p.exists():
            continue
        for rec in json.loads(p.read_text(encoding="utf-8")):
            n += 1
            key = race_key_of(rec)
            date = str(rec.get("日付") or "").strip()
            venue = str(rec.get("場名") or "").strip()
            try:
                rno = int(str(rec.get("R") or "").strip())
            except ValueError:
                continue
            if len(date) < 10:
                continue
            trip = (date, venue, rno)
            if trip in idx and idx[trip] != key:
                conflicts.append(f"{trip}: {idx[trip]} vs {key}")
                continue
            idx[trip] = key
            lst = md.setdefault((date[5:], venue, rno), [])
            if key not in lst:
                lst.append(key)
            e = info.setdefault(key, {"horses": set(), "日付": date, "場名": venue, "R": rno})
            nm = str(rec.get("出走馬名") or "").strip()
            if nm:
                e["horses"].add(nm)
    return idx, md, info, n, conflicts


def parse_signals(title, pubdate, m):
    """标题 → 三信号 dict；不齐的键缺省 None。

    日期三形态（2026-11 实测该 UP 主全量 192 条只用到后两种）：
      2025/8/3 · 2025-11-08 · 2025年4月17日       → 年份自带
      11月8日 / 10月31日                           → 年份取 pubdate，**跨年要校正**
    """
    out = {"date": None, "md": None, "venue": None, "r": None, "year_guess": False}
    for pk in ("date_full", "date_ymd_ja"):
        hit = re.search(m.get(pk) or r"(?!)", title)
        if hit:
            g = hit.groupdict()
            out["date"] = "{:04d}-{:02d}-{:02d}".format(int(g["y"]), int(g["m"]), int(g["d"]))
            out["md"] = "{:02d}-{:02d}".format(int(g["m"]), int(g["d"]))
            break
    if not out["date"]:
        hit = re.search(m.get("date_md_ja") or r"(?!)", title)
        if hit:
            g = hit.groupdict()
            mo, dy = int(g["m"]), int(g["d"])
            out["md"] = "{:02d}-{:02d}".format(mo, dy)
            if pubdate:
                d = datetime.fromtimestamp(pubdate)
                year = d.year
                # 跨年校正：1~2 月发布的「11/12 月」比赛属上一年；11~12 月发布的「1/2 月」比赛属下一年
                if d.month <= 2 and mo >= 10:
                    year -= 1
                elif d.month >= 11 and mo <= 2:
                    year += 1
                out["date"] = "{:04d}-{:02d}-{:02d}".format(year, mo, dy)
                out["year_guess"] = True
    hit = re.search(m.get("venue") or r"(?!)", title)
    if hit:
        out["venue"] = (m.get("venue_alias") or {}).get(hit.group("v"), hit.group("v"))
    hit = re.search(m.get("race_no") or r"(?!)", title)
    if hit:
        try:
            out["r"] = int(hit.group("r"))
        except ValueError:
            pass
    return out


KATA_RE = re.compile(r"[ァ-ヴー・]{3,}")
# 片假名里的非马名词（校验时排除，避免「クラス」这类赛事术语误报马名不符）
KATA_STOP = {"クラス", "ステークス", "オープン", "ダート", "メンバー", "ハンデ", "マイル",
             "ダービー", "オークス", "スプリント", "カップ", "チャレンジ", "サラブレッド",
             "ステップ", "トライアル", "プレミア", "アタック", "ゴールド", "ジュニア"}


def horse_verified(title, horses):
    """标题里的片假名马名是否出现在该场出走马里：返回 (命中名, 是否有可校验名)。"""
    names = [n for n in KATA_RE.findall(title) if n not in KATA_STOP]
    for n in names:
        for h in horses:
            if n and (n in h or h in n):
                return n, True
    return "", bool(names)


def resolve(sig, idx, md, info):
    """三信号 → (比赛键, 命中方式)。

    带年份 → 精确查；无年份（「11月8日」）→ 先按 pubdate 推断年精确查，
    **不命中就判未收录，绝不跨年硬配**。

    为什么不做「同月日唯一就锁定」：实测踩过——「11月8日 京都3R ゴールデンプロミス」
    （2026-11-08，当天中央赛还没入库）会被唯一候选抢到 **2025-11-08 京都3R**
    （シティプロスパー/ネッタイヤライ），把 2026 的比赛挂到 2025 的场次上。
    同月日跨年只在「发布时间与比赛月日差半年以上」（补发）时才可能，这种情况宁可留人工。
    """
    venue, rno = sig["venue"], sig["r"]
    key = idx.get((sig["date"], venue, rno))
    if key:
        return key, "精确"
    if not sig["year_guess"]:
        return None, ""
    # 推断年没查到：同月日在别的年份有 → 报告里点名，方便人工确认（不采用）
    others = [k for k in (md.get((sig["md"], venue, rno)) or [])
              if str(info.get(k, {}).get("日付") or "")[:4] != (sig["date"] or "")[:4]]
    return None, ("跨年候选 " + others[0] if others else "")


def main():
    ap = argparse.ArgumentParser(description="视频清单 → 比赛键匹配 → data/video-map.json")
    ap.add_argument("--videos", help="视频清单 JSON（默认 data/video_raw.json，缺则 data/_tmp/video/videos.json）")
    args = ap.parse_args()

    cfg = common.load_config()
    m = cfg.get("match") or {}
    sub_hint = (cfg.get("subtitle_hint") or {}).get("yes") or []

    # 输入优先级：--videos 指定 > data/video_raw.json（入库，CI 基线）> data/_tmp/video/videos.json（本地缓存）
    if args.videos:
        src = Path(args.videos)
    elif common.RAW_JSON.exists():
        src = common.RAW_JSON
    else:
        src = common.TMP_VIDEOS_JSON
    if not src.exists():
        raise SystemExit(f"视频清单不存在: {src}（先跑 fetch_video.py 或 --videos 指定）")
    videos = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(videos, list):
        videos = videos.get("videos") or []

    idx, md, info, n_runs, conflicts = build_race_index()
    print(f"比赛索引：{len(idx)} 场（来自 {n_runs} 条记录）")

    out, unmatched, matched = {}, [], 0
    multi_p, suspicious, hows = 0, 0, {}
    for v in videos:
        whole = str(v.get("title") or "")
        # 候选 = 整条标题（单场投稿）；有多 P 时再加每个分 P 的标题（「8/24-8/25 比赛合集」的真实场次在里面）
        cands = [(whole, 1)]
        for p in (v.get("pages") or []):
            part = str(p.get("part") or "")
            if part and part != whole:
                cands.append((part, int(p.get("page") or 1)))
        hit_any = False
        for ctitle, cpage in cands:
            sig = parse_signals(ctitle, int(v.get("pubdate") or 0), m)
            why = []
            if not sig["date"]:
                why.append("无日期")
            if not sig["venue"]:
                why.append("无场地")
            if not sig["r"]:
                why.append("无R")
            if why:
                if len(cands) == 1:              # 多 P 的 P1 常常是整场标题，缺信号属正常，不刷报告
                    unmatched.append(f"{v.get('bvid')} · {ctitle} · 缺[{'/'.join(why)}]")
                continue
            key, how = resolve(sig, idx, md, info)
            if not key:
                extra = f" · {how}（未采用，人工确认）" if how else ""
                unmatched.append(f"{v.get('bvid')} · {ctitle} · 三信号 "
                                 f"({sig['date']}, {sig['venue']}, {sig['r']}R) 不在库内（该场未收录）{extra}")
                continue
            # 马名校验：标题写了马名但该场没有这只马 → 大概率是匹配错了，宁可不落库
            hit_name, checkable = horse_verified(ctitle, info.get(key, {}).get("horses") or set())
            if checkable and not hit_name:
                suspicious += 1
                unmatched.append(f"⚠马名不符 {v.get('bvid')} · {ctitle} · 命中 {key}"
                                 f"（{info[key]['日付']} {info[key]['場名']}{info[key]['R']}R "
                                 f"马：{'/'.join(sorted(info[key]['horses']))}）→ 不落库，请人工确认")
                continue
            if key in out:
                first = out[key][0] if out[key] else {}
                unmatched.append(f"{v.get('bvid')} · {ctitle} · 与 {first.get('bvid')}"
                                 f"（P{first.get('page')}）同键 {key}（保留首条，人工裁决请用 video_manual.json）")
                continue
            out[key] = [{
                "source": "bilibili",
                "bvid": v.get("bvid"),
                "url": f"https://www.bilibili.com/video/{v.get('bvid')}/",
                "title": ctitle,
                "video_title": whole if ctitle != whole else "",
                "page": cpage,
                "subtitle": any(k in (whole + ctitle) for k in sub_hint),
                "match": "auto",
            }]
            matched += 1
            hit_any = True
            hows[how] = hows.get(how, 0) + 1
            if cpage > 1:
                multi_p += 1
        if len(cands) > 1 and not hit_any:
            unmatched.append(f"{v.get('bvid')} · {whole} · 多 P {len(cands) - 1} 段全部未命中")

    # ---- 人工覆写（永远优先；`_` 前缀键忽略）----
    # 多源（§186）：值可为 {"sources":[{url,title,page,subtitle},...]} / 单对象（旧契约兼容） / 直接数组。
    # 默认 **replace**（人工配置 = 该场最终源列表）；`append:true` 才追加到自动源之后。
    # 显式 {"sources":[],"clear":true} = 清空该场自动视频。
    manual_n = 0
    if common.VIDEO_MANUAL_JSON.exists():
        manual = json.loads(common.VIDEO_MANUAL_JSON.read_text(encoding="utf-8"))
        for k, mv in manual.items():
            if k.startswith("_"):
                continue
            raws, append, explicit_empty = [], False, False
            if isinstance(mv, list):
                raws = mv
            elif isinstance(mv, dict):
                append = bool(mv.get("append"))
                if isinstance(mv.get("sources"), list):
                    raws = mv["sources"]
                    explicit_empty = not raws and bool(mv.get("clear"))
                elif mv.get("url"):
                    raws = [mv]
            srcs = []
            for s in raws:
                if not isinstance(s, dict):
                    continue
                url = str(s.get("url") or "").strip()
                if not url:
                    continue
                hit = BILI_URL_RE.search(url)
                srcs.append({
                    "source": "bilibili" if hit else "other",
                    "bvid": hit.group(1) if hit else "",
                    "url": url,
                    "title": str(s.get("title") or (mv.get("title") if isinstance(mv, dict) else "") or ""),
                    "page": int(s.get("page") or (mv.get("page") if isinstance(mv, dict) else 1) or 1) or 1,
                    "subtitle": bool(s.get("subtitle", mv.get("subtitle") if isinstance(mv, dict) else False)),
                    "match": "manual",
                })
            if not srcs and not explicit_empty:
                continue
            if append and out.get(k) and out[k][0].get("match") == "auto":
                out[k] = out[k] + srcs
            else:
                out[k] = srcs
            manual_n += 1

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    doc = {
        "_meta": {
            "schema": "video-map/v2",
            "updated": now,
            "mid": cfg.get("mid"),
            "auto": matched,
            "manual": manual_n,
            "unmatched": len(unmatched),
            "multi_p": multi_p,
            "suspect": suspicious,
            "match_how": hows,
        },
        "videos": dict(sorted(out.items())),
    }
    common.DATA_DIR.mkdir(parents=True, exist_ok=True)
    common.VIDEO_MAP_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✔ 已写 {common.VIDEO_MAP_JSON}：自动 {matched} · 人工 {manual_n} · 未匹配 {len(unmatched)}"
          f"（多 P {multi_p} · 马名不符 {suspicious}）")
    print("  命中方式：" + " · ".join(f"{k} {v}" for k, v in sorted(hows.items(), key=lambda x: -x[1])))

    # ---- 报告（copy-data 跳过 *.md → 不进 dist） ----
    lines = [
        "# 视频回放匹配报告",
        "",
        f"- 生成：{now} · 视频清单：{len(videos)} 条 · 比赛索引：{len(idx)} 场",
        f"- 落库：自动 {matched} + 人工 {manual_n}；未匹配 {len(unmatched)} 条（人工处理请写 data/video_manual.json）",
        f"- 其中多 P 分场命中 {multi_p} 条；马名不符被拦截 {suspicious} 条（宁可不落库）",
        "- 命中方式：" + " · ".join(f"{k} {v}" for k, v in sorted(hows.items(), key=lambda x: -x[1])),
    ]
    if conflicts:
        lines.append(f"- ⚠ 三元组撞键 {len(conflicts)} 处（防御性记录）：")
        lines += ["  - " + c for c in conflicts[:10]]
    if unmatched:
        lines += ["", "## 未匹配清单", ""]
        lines += ["- " + u for u in unmatched]
    common.VIDEO_REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"✔ 已写 {common.VIDEO_REPORT_MD}")

    # ---- 全量清单（人看：视频名 + URL + 匹配结果；放 _tmp 不进库不进 dist） ----
    key_of_bvid = {}
    for k, srcs in doc["videos"].items():            # v2：每场 = 源数组（自动 1 个 / 人工多个）
        for e in srcs:
            if e.get("bvid"):
                key_of_bvid.setdefault((e["bvid"], int(e.get("page") or 1)), k)
    cl = ["# 视频清单（全量 " + str(len(videos)) + " 条）", "",
          "| # | 发布 | 标题 | 分P | URL | 匹配 |", "|---|---|---|---|---|---|"]
    for i, v in enumerate(sorted(videos, key=lambda x: -(x.get("pubdate") or 0)), 1):
        bv = v.get("bvid") or ""
        pages = v.get("pages") or []
        hit_pages = [p["page"] for p in pages if (bv, int(p["page"])) in key_of_bvid]
        if (bv, 1) in key_of_bvid:
            hit_pages = [1] + hit_pages
        if hit_pages:
            mk = "·".join(key_of_bvid[(bv, p)].split(":")[-1] for p in sorted(set(hit_pages)))
            status = "✔ " + mk
        else:
            status = "—"
        pub = datetime.fromtimestamp(v["pubdate"]).strftime("%Y-%m-%d") if v.get("pubdate") else ""
        cl.append(f"| {i} | {pub} | {v.get('title')} | {len(pages) or 1} | "
                  f"https://www.bilibili.com/video/{bv}/ | {status} |")
    (common.TMP_DIR / "videos.md").write_text("\n".join(cl) + "\n", encoding="utf-8")
    print(f"✔ 已写 {common.TMP_DIR / 'videos.md'}（人看清单）")


if __name__ == "__main__":
    main()
