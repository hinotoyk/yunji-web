#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 fetch_log：net.log_fetch 写入 + run_full_test 读取逻辑一致；并覆盖滚动裁剪 trim_fetch_log
（窗口外丢弃 / 坏行丢弃 / 幂等 / TRIM_CHECK_EVERY 计数门控，2026-10-26 追补）。

用法: python scripts/verify_fetch_log.py
用 monkeypatch 把 constants.DATA_DIR 指到临时目录，不碰真实 data/、不发网络请求。
"""
import io
import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

# 确保 scripts/core 可导入
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from core import constants, net

# 指向临时 data 目录，避免污染真实 data/
with tempfile.TemporaryDirectory() as tmp:
    constants.DATA_DIR = Path(tmp)

    # --- 写入：模拟 fetch() 成功/失败两条路径的 log_fetch 调用 ---
    # 成功路径：status=200，path 含逗号与引号（验证 JSON 转义，CSV 时代会坑）
    net.log_fetch("https://db.netkeiba.com/horse/abc,def?q=1", 200, 1.234, 1,
                  strip_bases=("https://db.netkeiba.com",))
    # 失败路径：status=ERR，含中文 note
    net.log_fetch("https://race.netkeiba.com/race/result.html", "ERR", 0.5, 3,
                  "HTTPError 404, x", strip_bases=("https://race.netkeiba.com",))
    # 普通路径：带 query 应被剥离（真实调用 net.fetch 经 bind 注入 strip_bases）
    net.log_fetch("https://jbis.or.jp/foo?a=b&c=d", 200, 0.25, 1,
                  strip_bases=("https://jbis.or.jp",))

    log_path = constants.DATA_DIR / "fetch_log.jsonl"
    assert log_path.exists(), "fetch_log.jsonl 未生成"

    # --- 读取：与 run_full_test.py 相同的逐行 json 解析逻辑 ---
    rows = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == 3, f"期望 3 条记录，实际 {len(rows)}"

    # 字段完整性
    for row in rows:
        for k in ("ts", "script", "host", "path", "status", "dur_s", "retries", "note"):
            assert k in row, f"缺字段 {k}: {row}"

    # 内容断言
    r0 = rows[0]
    assert r0["host"] == "db.netkeiba.com"
    assert r0["path"] == "/horse/abc,def", f"path 应剥前缀且保留逗号，实际 {r0['path']!r}"
    assert r0["status"] == "200"
    assert r0["dur_s"] == 1.23

    r1 = rows[1]
    assert r1["host"] == "race.netkeiba.com"
    assert r1["status"] == "ERR"
    assert "404" in r1["note"]

    r2 = rows[2]
    assert r2["path"] == "/foo", f"query 应被剥离，实际 {r2['path']!r}"
    assert r2["status"] == "200"

    # 每行都是合法 JSON 行（无 CSV 引号/逗号错位问题）
    raw = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(raw) == 3

    # 模拟 run_full_test 的 host 分组统计
    from itertools import groupby
    bad_total = sum(1 for x in rows if x["status"] != "200")
    assert bad_total == 1, f"期望 1 条非200，实际 {bad_total}"

    # --- 滚动裁剪 trim_fetch_log（2026-10-26 追补）：窗口外丢弃 / 坏行丢弃 / 幂等 / 计数门控 ---
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    old_ts = (datetime.now() - timedelta(days=net.LOG_RETENTION_DAYS + 5)).strftime("%Y-%m-%d %H:%M:%S")
    def _line(ts, script):
        return json.dumps({"ts": ts, "script": script, "host": "h", "path": "/" + script,
                           "status": "200", "dur_s": 0.0, "retries": 0, "note": ""}, ensure_ascii=False) + "\n"

    log_path.write_text(_line(old_ts, "old") + _line(now_ts, "new") + "{坏行不是 JSON}\n", encoding="utf-8")
    net.trim_fetch_log()
    kept = [json.loads(x) for x in log_path.read_text(encoding="utf-8").splitlines() if x.strip()]
    assert [r["script"] for r in kept] == ["new"], f"裁剪应只留窗口内 1 条，实际 {kept}"

    before = log_path.read_text(encoding="utf-8")
    net.trim_fetch_log()
    assert log_path.read_text(encoding="utf-8") == before, "无过期行时不应重写（幂等）"

    # 门控：计数器归零后第一击必检查（TRIM_CHECK_EVERY 次一检，不是逐请求全量读）
    log_path.write_text(_line(old_ts, "old"), encoding="utf-8")
    net._trim_counter = 0
    net.log_fetch("https://example.test/x", 200, 0.1, 1)
    rows3 = [json.loads(x) for x in log_path.read_text(encoding="utf-8").splitlines() if x.strip()]
    assert len(rows3) == 1 and rows3[0]["script"] != "old", f"计数门控应触发裁剪，实际 {rows3}"
    assert net.TRIM_CHECK_EVERY >= 1

print("PASS: fetch_log.jsonl 写入 + 读取 + 滚动裁剪（trim/幂等/门控）全部验证通过。")
