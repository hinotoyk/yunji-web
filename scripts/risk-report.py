# -*- coding: utf-8 -*-
"""风控分析：读取 data/raw/fetch_log.csv 输出统计"""
import csv
import datetime
from collections import Counter

rows = list(csv.DictReader(open("data/raw/fetch_log.csv", encoding="utf-8")))


def parse(ts):
    return datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")


print("===== 全量请求日志分析 =====")
print("总请求:", len(rows))
print("脚本分布:", dict(Counter(r["script"] for r in rows)))
print("状态分布:", dict(Counter(r["status"] for r in rows)))
print("重试>1:", sum(1 for r in rows if int(r["retries"]) > 1))
durs = sorted(float(r["dur_s"]) for r in rows)
print("耗时: avg=%.2fs p50=%.2fs p95=%.2fs max=%.2fs" % (
    sum(durs) / len(durs), durs[len(durs) // 2], durs[int(len(durs) * 0.95)], max(durs)))


def seg_stats(rows, label):
    if not rows:
        print(label, "无数据")
        return
    t0, t1 = parse(rows[0]["ts"]), parse(rows[-1]["ts"])
    span = (t1 - t0).total_seconds()
    print("%s: %d 请求 / %.1f min / 平均间隔 %.2fs / 状态 %s" % (
        label, len(rows), span / 60, span / max(len(rows) - 1, 1), dict(Counter(r["status"] for r in rows))))


cut = datetime.datetime(2026, 8, 17, 22, 53)  # 修复后重跑起点
seg_broken = [r for r in rows if parse(r["ts"]) < cut]
seg_ok = [r for r in rows if parse(r["ts"]) >= cut]
seg_stats(seg_broken, "[失控段 22:39-22:52]")
seg_stats(seg_ok, "[规范段 22:53-结束]")
if len(seg_ok) > 1:
    ts = [parse(r["ts"]) for r in seg_ok]
    gaps = sorted((ts[i + 1] - ts[i]).total_seconds() for i in range(len(ts) - 1))
    print("规范段间隔: min=%.1fs p50=%.1fs p95=%.1fs max=%.1fs" % (
        gaps[0], gaps[len(gaps) // 2], gaps[int(len(gaps) * 0.95)], gaps[-1]))
    print("规范段间隔<15s 占比: %.1f%%" % (100 * sum(1 for g in gaps if g < 15) / len(gaps)))
bad = [r for r in rows if r["status"] != "200"]
print("异常(非200):", bad[:10] if bad else "无")
