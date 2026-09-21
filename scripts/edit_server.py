#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地编辑服务（D13 单端口）：静态服务项目根 + POST /file 白名单写人工表 + POST /photo 收已压图片 + 保存即生效管道（写源表 → merge → 同步 dist/data）。"""
import argparse
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if not (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf-8"):
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = None            # main() 里按 --root 定稿，之后全站路径都由它派生
DATA_DIR = None
DIST_DATA = None
BACKUP_DIR = None
PHOTO_DIR = None       # DATA_DIR / "photos"（M2b）

WHITELIST = ("data/manual_overrides.json", "data/timeline_manual.json")
# 人工表 → 保存后自动重算的管线（时间线按 §4.5 不自动重算）
MERGE_SCRIPT = {"data/manual_overrides.json": "scripts/basic/merge_basic.py"}
MAX_BODY = 2 * 1024 * 1024
MAX_PHOTO = 5 * 1024 * 1024            # /photo 单图上限（浏览器端已压到 ≤100KB，留足冗余）
PHOTO_SUBDIR = "photos"
PHOTO_TL_OWNER = "timeline"            # 时间线人工节点图的归属前缀（无马 id）
SKIP_SYNC_SUFFIX = (".md", ".csv", ".tmp-edit", ".bak")
_DRIVE_RE = re.compile(r"^[a-zA-Z]:")
# /photo 的 owner（文件名前缀）：只允许安全字符，杜绝 ../ 与路径分隔符
_OWNER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# tags[].cat 取值 = timeline.html 的 .tl-node/.tl-tag 类名（六色，D9）
TL_CATS = ("sire", "gen", "first", "graded", "award", "manual")
_BAD_SCHEME = re.compile(r"^\s*(javascript|data|vbscript)\s*:", re.I)
# 安全边界：只服务本机。Host 校验防 DNS rebinding（绑 127.0.0.1 只挡局域网，挡不住浏览器当跳板）；
# CORS 只对本机 Origin 回显——编辑页与静态站同源，正常使用根本不需要 CORS，`*` 纯属给公网网页开门。
_LOCAL_HOST_RE = re.compile(r"^(127\.0\.0\.1|localhost)(:\d+)?$", re.I)
_LOCAL_ORIGIN_RE = re.compile(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$", re.I)


def _bad_scheme(v):
    """link/photo 会被 timeline.html 原样塞进 href/src → 伪协议一律拒（相对路径与 http(s) 放行）。"""
    vals = v if isinstance(v, list) else [v]
    for x in vals:
        s = str(x or "")
        if _BAD_SCHEME.match(s) or "<" in s:
            return True
    return False


# ---------------- 路径 ----------------
def norm_rel(p):
    """请求里的路径 → 规范化仓库相对路径；绝对路径/盘符/../ 逃逸 → None。"""
    if not isinstance(p, str) or not p:
        return None
    s = p.replace("\\", "/").strip()
    if _DRIVE_RE.match(s) or s.startswith("/"):
        return None
    s = posixpath.normpath(s)
    if s.startswith("../") or s == ".." or posixpath.isabs(s):
        return None
    return s


def abs_of(rel):
    return ROOT / rel


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def dump_json(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def atomic_write(path, text):
    tmp = path.with_name(path.name + ".tmp-edit")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def backup(rel):
    """写前备份。落 data/_tmp/（vite copy-data 与 CI 都不进 dist/公网），不污染 data/ 本身。"""
    src = abs_of(rel)
    if not src.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dst = BACKUP_DIR / f"{src.name}.{datetime.now():%Y%m%d-%H%M%S.%f}.bak"
    shutil.copy2(src, dst)
    try:
        return dst.relative_to(ROOT).as_posix()
    except ValueError:
        return str(dst)


# ---------------- 图片上传（M2b / D8）----------------
def sniff_image(data):
    """按**魔数**判真实格式 → (ext, mime)；不认识（含 SVG / 改扩展名的任意文件）→ (None, None)。

    只认位图：SVG 是脚本载体（上传后同域可读到 edit_server 全部可写文件），一律拒。"""
    if data[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", "image/gif"
    return None, None


def parse_multipart(body, boundary):
    """极简 multipart/form-data 拆包（纯 stdlib；cgi 模块 3.13 已删，不用）。

    → (fields: {name: str}, files: [{name, filename, type, data}])
    帧边界规则：每个 part 前一个 CRLF 属于框架，故只剥**恰好** 2 字节的首尾 CRLF。"""
    delim = b"--" + boundary
    fields, files = {}, []
    for seg in body.split(delim)[1:]:
        if seg[:2] == b"--":                       # 结束帧 --boundary--
            break
        if seg[:2] == b"\r\n":
            seg = seg[2:]
        if seg[-2:] == b"\r\n":
            seg = seg[:-2]
        head, sep, payload = seg.partition(b"\r\n\r\n")
        if not sep:
            continue
        disp, ctype = "", ""
        for line in head.decode("latin-1").split("\r\n"):
            k, _, v = line.partition(":")
            kl = k.strip().lower()
            if kl == "content-disposition":
                disp = v
            elif kl == "content-type":
                ctype = v.strip()
        mname = re.search(r'name="([^"]*)"', disp)
        mfile = re.search(r'filename="([^"]*)"', disp)
        name = mname.group(1) if mname else ""
        if mfile is None:
            fields[name] = payload.decode("utf-8", "replace").strip()
        else:
            files.append({"name": name, "filename": mfile.group(1), "type": ctype, "data": payload})
    return fields, files


def next_photo_name(owner, ext):
    """文件名服务端生成 = <owner>-<n>.<ext>，n = 该 owner 已用过的最大号 +1（跨扩展位统一编号，
    免得 142-1.jpg 与 142-1.webp 并存看不懂）。客户端 filename 完全不参与。"""
    used = set()
    if PHOTO_DIR.is_dir():
        pat = re.compile(rf"^{re.escape(owner)}-(\d+)\.[A-Za-z0-9]+$")
        for p in PHOTO_DIR.iterdir():
            m = pat.match(p.name)
            if m:
                used.add(int(m.group(1)))
    n = 1
    while n in used:
        n += 1
    return f"{owner}-{n}.{ext}"


def store_photo(data, name):
    """落 data/photos/<name> 并同步 dist/data/photos/<name>（与 D5 管道同源，避免等下一次 build）。"""
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    dst = DIST_DATA / PHOTO_SUBDIR / name
    atomic_write_bytes(PHOTO_DIR / name, data)
    ok_dist = True
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(dst, data)
    except OSError:
        ok_dist = False              # dist 不在（如纯源树沙箱）不算失败：下次 build/copy-data 会补
    return ok_dist


def atomic_write_bytes(path, blob):
    tmp = path.with_name(path.name + ".tmp-edit")
    tmp.write_bytes(blob)
    os.replace(tmp, path)


# ---------------- 时间线人工节点表整备（M2c）----------------
def prepare_timeline(payload):
    """校验并整备 timeline_manual.json：events 必须是数组，每条按 build_timeline.py 契约（date/title/cn/note/link/photo/tags[].label/cat）重建。
    → (payload, errors)。不自动重算产物（§4.5），故这里挡住「重算会静默跳过 / 前端渲染出事」的脏数据。"""
    errs = []
    if not isinstance(payload.get("events"), list):
        errs.append("events 必须是数组（可空 []）")
        return payload, errs
    allowed = ("cn", "note", "link", "photo")
    clean = []
    for i, ev in enumerate(payload["events"]):
        if not isinstance(ev, dict):
            errs.append(f"events[{i}]: 必须是对象")
            continue
        for k in ev:
            if k not in ("date", "title", "tags") + allowed:
                errs.append(f"events[{i}]: 契约外键 {k!r} 已丢弃（可用键 date/title/cn/note/link/photo/tags）")
        out = {"date": str(ev.get("date") or "").strip(), "title": str(ev.get("title") or "").strip()}
        if not _DATE_RE.match(out["date"]):
            errs.append(f"events[{i}]: date 必填且需 YYYY-MM-DD（现值 {out['date']!r}）")
        if not out["title"]:
            errs.append(f"events[{i}]: title 必填")
        for k in allowed:
            v = ev.get(k)
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            if k in ("link", "photo") and _bad_scheme(v):
                errs.append(f"events[{i}]: {k} 只允许 http(s)/站内相对路径（现值 {str(v)[:60]!r}）")
                continue
            out[k] = v.strip() if isinstance(v, str) else v
        tags = ev.get("tags")
        if tags is None:
            tags = []
        if not isinstance(tags, list):
            errs.append(f"events[{i}]: tags 必须是数组")
            tags = []
        new_tags = []
        for j, t in enumerate(tags):
            if not isinstance(t, dict):
                errs.append(f"events[{i}].tags[{j}]: 必须是对象 {{label, cat}}")
                continue
            label = str(t.get("label") or "").strip()
            cat = str(t.get("cat") or "manual").strip()
            if not label:
                errs.append(f"events[{i}].tags[{j}]: label 必填（build_timeline 会丢空标签）")
                continue
            if cat not in TL_CATS:
                errs.append(f"events[{i}].tags[{j}]: cat 需取 {'/'.join(TL_CATS)}（现值 {cat!r}，已按 manual 处理）")
                cat = "manual"
            tg = {"cat": cat, "label": label}
            if str(t.get("tip") or "").strip():
                tg["tip"] = str(t["tip"]).strip()
            new_tags.append(tg)
        if new_tags:
            out["tags"] = new_tags
        clean.append(out)
    payload["events"] = clean
    return payload, errs


# ---------------- 人工表整备（D7 _orig 快照 / _note 强制 / 解除即删键）----------------
def prepare_overrides(payload):
    """校验并整备 manual_overrides.json：补首次钉住的 _orig 快照、清解除留下的孤儿快照。
    → (整备后的对象, 错误列表)；有错则不落盘。
    快照/理由以**盘上现表**为准做并集（盘上胜），客户端漏带 _orig 也不会把已钉值当成官方原值。"""
    by_id = {str(h.get("id")): h for h in load_json(DATA_DIR / "basic.json", {}).get("horses", [])}
    disk = load_json(DATA_DIR / "manual_overrides.json", {})
    errs = []
    for id_s, entry in list(payload.items()):
        if id_s.startswith("_"):
            continue
        if not isinstance(entry, dict):
            errs.append(f"{id_s}: 值必须是对象")
            continue
        old = disk.get(id_s) if isinstance(disk.get(id_s), dict) else {}
        for k in [k for k in entry if not k.startswith("_") and entry[k] in (None, "")]:
            del entry[k]                      # 空值钉住等于没钉 → 按解除处理（apply_overrides 同口径）
        if "photo" in entry:                  # M2b：photo 是数组（[] = 人工判定「确无图片」，apply_overrides 不跳空数组）
            pv = entry["photo"]
            if not isinstance(pv, list) or any(not isinstance(x, str) or _bad_scheme(x) for x in pv):
                errs.append(f"{id_s}: photo 必须是字符串数组（站内 data/photos/… 或 http(s) URL；[] = 确无图片）")
                continue
            entry["photo"] = [x.strip() for x in pv if str(x).strip()]
        fields = [k for k in entry if not k.startswith("_")]
        if not fields:
            del payload[id_s]                 # 全解除 → 连 _note/_orig 一起删，不留空壳
            continue
        if id_s not in by_id:
            errs.append(f"{id_s}: basic.json 里没有这匹马")
            continue
        orig = entry.get("_orig")
        orig = orig if isinstance(orig, dict) else {}
        if isinstance(old.get("_orig"), dict):
            for k, v in old["_orig"].items():
                orig.setdefault(k, v)         # 盘上快照不可被覆盖
        for k in fields:
            if k not in orig:                 # 只记首次：未钉过的字段其 basic 值就是官方抓取值
                orig[k] = by_id[id_s].get(k, "")
        for k in [k for k in orig if k not in fields]:
            del orig[k]                       # 解除后不留孤儿快照
        entry["_orig"] = orig
        if not str(entry.get("_note") or "").strip():
            entry["_note"] = str(old.get("_note") or "").strip()
        if not str(entry.get("_note") or "").strip():
            errs.append(f"{id_s}: 缺 _note（钉住必须写一句理由）")
    return payload, errs


# ---------------- 保存即生效管道（D5）----------------
def step_write(rel, obj):
    t0 = time.time()
    bak = backup(rel)
    atomic_write(abs_of(rel), dump_json(obj))
    return {"ok": True, "seconds": rnd(time.time() - t0), "bytes": abs_of(rel).stat().st_size, "backup": bak}


def step_merge(rel):
    script_rel = MERGE_SCRIPT.get(rel)
    t0 = time.time()
    if not script_rel:
        return {"ok": True, "skipped": True, "seconds": 0.0, "detail": "该表不自动重算，需手动跑对应管线"}
    script = ROOT / script_rel
    if not script.exists():
        return {"ok": False, "seconds": rnd(time.time() - t0), "detail": f"找不到 {script_rel}（沙箱根需一并拷 scripts/）"}
    try:
        r = subprocess.run([sys.executable, str(script), "--keep"], cwd=str(ROOT),
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
    except subprocess.TimeoutExpired:
        return {"ok": False, "seconds": rnd(time.time() - t0), "detail": "merge 超时（>600s）"}
    out = (r.stdout or "").strip().splitlines()
    err = (r.stderr or "").strip().splitlines()
    detail = " | ".join(out[-4:]) if r.returncode == 0 else " | ".join((err or out)[-4:])
    return {"ok": r.returncode == 0, "seconds": rnd(time.time() - t0), "script": script_rel,
            "detail": detail[-400:]}


def differs(a, b):
    if not b.exists():
        return True
    if a.stat().st_size != b.stat().st_size:
        return True
    return a.read_bytes() != b.read_bytes()


def step_sync(since):
    """把 since 之后真被改动的 data/ 产物镜像进 dist/data/（口径同 vite copy-data：跳 _tmp 与 *.md/*.csv）。"""
    t0 = time.time()
    copied = []
    for dirpath, dirnames, files in os.walk(DATA_DIR):
        rel_dir = os.path.relpath(dirpath, DATA_DIR).replace("\\", "/")
        if rel_dir.split("/")[0] == "_tmp":
            dirnames[:] = []
            continue
        for fn in files:
            if fn.endswith(SKIP_SYNC_SUFFIX):
                continue
            src = os.path.join(dirpath, fn)
            if os.path.getmtime(src) < since:
                continue
            rel = os.path.normpath(os.path.join("data", rel_dir, fn)).replace("\\", "/")
            dst = DIST_DATA / os.path.relpath(src, DATA_DIR)
            if not differs(Path(src), dst):
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            if fn.lower().endswith(".json"):
                # 与 vite copy-data 同口径：dist 侧 json 一律 minify（编辑保存后 dist 体积不回退到 pretty 格式）
                try:
                    txt = Path(src).read_text(encoding="utf-8").lstrip("\ufeff")
                    dst.write_text(json.dumps(json.loads(txt), ensure_ascii=False, separators=(",", ":")),
                                   encoding="utf-8", newline="\n")
                except (OSError, ValueError):          # 非标准 JSON → 原样拷贝兜底（同 copy-data）
                    shutil.copy2(src, dst)
            else:
                shutil.copy2(src, dst)
            copied.append(rel)
    return {"ok": True, "seconds": rnd(time.time() - t0), "files": copied}


def rnd(x, n=2):
    return round(x, n)


# ---------------- HTTP ----------------
class Handler(SimpleHTTPRequestHandler):
    def _cors(self):
        o = self.headers.get("Origin") or ""
        if _LOCAL_ORIGIN_RE.match(o):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def _local_only(self):
        """非本机 Host 一律 403（防 DNS rebinding：恶意域名解析到 127.0.0.1 时 Host 会暴露真实来源）。"""
        host = self.headers.get("Host") or ""
        if _LOCAL_HOST_RE.match(host):
            return True
        self._json(403, {"ok": False, "error": f"Host 非本机，已拒绝（防 DNS rebinding）：{host!r}"})
        return False

    def _json(self, code, obj):
        body = dump_json(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def route(self):
        return self.path.split("?", 1)[0]

    def do_GET(self):
        if not self._local_only():
            return
        if self.route() == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "2")
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(b"ok")
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def do_OPTIONS(self):
        if not self._local_only():
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not self._local_only():
            return
        path = self.route()
        if path == "/photo":
            self.handle_photo()
            return
        if path != "/file":
            self._json(404, {"ok": False, "error": f"未知接口 {path}"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            self._json(400, {"ok": False, "error": f"请求体大小非法（0<{n}<={MAX_BODY}）"})
            return
        try:
            req = json.loads(self.rfile.read(n).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            self._json(400, {"ok": False, "error": f"请求体不是合法 JSON：{e}"})
            return
        self.handle_file(req)

    def handle_photo(self):
        """POST /photo（multipart）：只收浏览器端已压缩的图（D8），文件名服务端生成，落 data/photos/ 并同步 dist/。"""
        t0 = time.time()
        ctype = self.headers.get("Content-Type") or ""
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if "multipart/form-data" not in ctype.lower():
            self._json(400, {"ok": False, "error": "需要 multipart/form-data（编辑器用 FormData 提交）"})
            return
        if n <= 0 or n > MAX_PHOTO + 64 * 1024:
            self._json(413, {"ok": False, "error": f"图片过大或为空（上限 {MAX_PHOTO // 1024 // 1024}MB，收到 {n}B）"})
            return
        mb = re.search(r"boundary=([^;]+)", ctype)
        if not mb:
            self._json(400, {"ok": False, "error": "Content-Type 缺 boundary"})
            return
        boundary = mb.group(1).strip().strip('"')
        try:
            fields, files = parse_multipart(self.rfile.read(n), boundary.encode("latin-1"))
        except (OSError, MemoryError) as e:
            self._json(400, {"ok": False, "error": f"读取请求体失败：{e}"})
            return
        part = next((f for f in files if f["data"] and f["name"] == "file"), None) \
            or next((f for f in files if f["data"]), None)
        if not part:
            self._json(400, {"ok": False, "error": "没有文件字段 file（或内容为空）"})
            return
        declared = (part["type"] or "").lower()
        if declared and not declared.startswith("image/"):
            self._json(415, {"ok": False, "error": f"只收 image/*（声明 {declared or '未知'}）"})
            return
        data = part["data"]
        if len(data) > MAX_PHOTO:
            self._json(413, {"ok": False, "error": f"图片 {len(data)}B 超上限 {MAX_PHOTO}B"})
            return
        ext, mime = sniff_image(data)
        if not ext:
            self._json(400, {"ok": False, "error": "内容不是位图（只收 PNG/JPEG/WebP/GIF，按魔数判；"
                                                   f"声明 {declared or '未知'}，SVG/改扩展名一律拒）"})
            return
        owner = (fields.get("id") or fields.get("owner") or "").strip() or "misc"
        if not _OWNER_RE.match(owner):
            self._json(400, {"ok": False, "error": f"id 只允许字母/数字/-/_ 且 ≤24 字符（现值 {owner!r}）"})
            return
        name = next_photo_name(owner, ext)                    # ← 客户端 filename 完全不参与
        try:
            ok_dist = store_photo(data, name)
        except OSError as e:
            self._json(500, {"ok": False, "error": f"落盘失败：{e}", "path": f"{PHOTO_SUBDIR}/{name}"})
            return
        rel = f"data/{PHOTO_SUBDIR}/{name}"
        self._json(200, {
            "ok": True, "path": rel, "bytes": len(data), "mime": mime, "ext": ext,
            "id": owner, "dist_synced": ok_dist, "client_filename_ignored": part["filename"],
            "seconds": rnd(time.time() - t0),
            "note": "profile 侧经 YJ_DATA.url() 解析（data/ 前缀约定）",
        })

    def handle_file(self, req):
        rel = norm_rel(req.get("path"))
        if rel not in WHITELIST:
            self._json(403, {"ok": False, "error": f"不在白名单：{req.get('path')!r}"})
            return
        obj = req.get("json")
        if not isinstance(obj, dict):
            self._json(400, {"ok": False, "error": "json 必须是对象（整表）"})
            return
        since = time.time()
        check = prepare_overrides if rel == WHITELIST[0] else (prepare_timeline if rel == WHITELIST[1] else None)
        if check:
            obj, errs = check(obj)
            if errs:
                self._json(400, {"ok": False, "error": f"{rel} 校验失败", "problems": errs})
                return
        try:
            steps = {"write": step_write(rel, obj)}
            steps["merge"] = step_merge(rel)
            steps["sync"] = step_sync(since) if steps["merge"]["ok"] else {"ok": False, "skipped": True, "detail": "merge 失败，未同步 dist"}
        except OSError as e:
            self._json(500, {"ok": False, "error": f"写入失败：{e}", "path": rel})
            return
        ok = steps["write"]["ok"] and steps["merge"]["ok"]
        self._json(200 if ok else 500, {"ok": ok, "path": rel, "total_seconds": rnd(time.time() - since), "steps": steps})

    def log_message(self, fmt, *args):
        sys.stderr.write("[edit] %s\n" % (fmt % args))


def main():
    global ROOT, DATA_DIR, DIST_DATA, BACKUP_DIR, PHOTO_DIR
    ap = argparse.ArgumentParser(description="本地编辑服务：静态服务 + 人工表写入 + merge 管道 + 图片落盘")
    ap.add_argument("--port", type=int, default=8090, help="监听端口（默认 8090，与静态预览合一进程）")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent),
                    help="服务的树根（沙箱测试可指向副本目录，需含 data/ 与 scripts/）")
    args = ap.parse_args()
    ROOT = Path(args.root).resolve()
    DATA_DIR = ROOT / "data"
    DIST_DATA = ROOT / "dist" / "data"
    BACKUP_DIR = DATA_DIR / "_tmp" / "edit_backups"
    PHOTO_DIR = DATA_DIR / PHOTO_SUBDIR
    if not DATA_DIR.is_dir():
        sys.exit(f"✘ data/ 不存在：{DATA_DIR}")
    srv = ThreadingHTTPServer(("127.0.0.1", args.port),
                              partial(Handler, directory=str(ROOT)))
    print(f"✔ edit_server http://127.0.0.1:{args.port}/  root={ROOT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
