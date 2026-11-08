#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""serve.py —— 本地预览服务：服务 dist/ 并打开首页（端口单点 = 项目根 serve.config.json）

    python serve.py             # 起服务并按 serve.config.json 打开首页（本仓端口见该 JSON）
    python serve.py --no-open   # 只起服务，不弹浏览器（自动化/无头验证用）

★ 四兄弟站端口约定（各仓 serve.config.json 是唯一出处，不许散落硬编码）：
    yunji-web 9090 / kzn-web 9091 / jbis-sire-rank-history 9092 / racing-calendar 9093

为什么不再手写 `python -m http.server <port>`：
  1. 端口写在命令行里 → 四处漂移（历史遗留 8090/8091/9090/9091 并存，两站同端口会共用
     同一份 localStorage = PAT/草稿串站），撞号后 http.server 直接失败或静默换端口；
  2. http.server 不带 no-cache：改了 front/ 重新 build 后浏览器仍吃旧 JS/CSS（「看不到新功能」）；
  3. http.server 不带 CORS 头：兄弟站 embed/*.js 跨站 fetch 本站数据会被浏览器拦。

端口被占用时**直接报错退出，不自动顺延**——端口是约定不是偏好：entries.html 硬编码了
racing-calendar 的 9093，顺延即静默失配。换端口只改 serve.config.json。
"""
import argparse
import json
import os
import socket
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONF_PATH = os.path.join(BASE_DIR, "serve.config.json")

IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff2", ".woff", ".ttf"}


class Handler(SimpleHTTPRequestHandler):
    """静态文件 + no-cache（非图片）/ 小时缓存（图片/字体）+ CORS *"""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".woff2": "font/woff2",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # 与线上 GitHub Pages 对齐（全站 ACAO *）：兄弟站 embed 组件在宿主页跨站 fetch 本站产物
        self.send_header("Access-Control-Allow-Origin", "*")
        ext = os.path.splitext(self.path.split("?")[0])[1].lower()
        if ext in IMG_EXT:
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def die(msg):
    sys.stderr.write("[serve] " + msg + "\n")
    sys.exit(1)


def load_conf():
    if not os.path.isfile(CONF_PATH):
        die("缺少 %s（端口/根目录的唯一配置出处）" % CONF_PATH)
    with open(CONF_PATH, "r", encoding="utf-8") as f:
        conf = json.load(f)
    for k in ("port", "root"):
        if k not in conf:
            die("serve.config.json 缺字段：%s" % k)
    return conf


def port_busy(host, port):
    """真·占用检测：SO_REUSEADDR 会让 TIME_WAIT 也能 bind，故先 connect 探一下"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex((host, port)) == 0


def main():
    ap = argparse.ArgumentParser(description="本地预览（端口来自 serve.config.json，占用即失败）")
    ap.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    args = ap.parse_args()

    conf = load_conf()
    host = conf.get("host", "127.0.0.1")
    port = int(conf["port"])
    name = conf.get("name", os.path.basename(BASE_DIR))
    root = os.path.join(BASE_DIR, conf["root"])
    entry = conf.get("open", "index.html")

    if not os.path.isdir(root):
        die("目录不存在：%s\n        产物没建出来，先执行：cd front && npm run build" % root)
    if entry and not os.path.isfile(os.path.join(root, entry)):
        die("入口不存在：%s\n        产物不完整，先执行：cd front && npm run build"
            % os.path.join(root, entry))

    if port_busy(host, port):
        die("端口 %d 已被占用（%s 的约定端口）。\n"
            "        要么先停掉占用进程：netstat -ano | findstr :%d → taskkill /PID <pid> /F\n"
            "        要么改 serve.config.json 的 port（连带核对兄弟站/宿主站的跨站引用）。"
            % (port, name, port))

    try:
        httpd = ThreadingHTTPServer((host, port), partial(Handler, directory=root))
    except OSError as e:
        die("无法监听 %s:%d —— %s" % (host, port, e))

    url = "http://%s:%d/%s" % (host, port, entry)
    print("[serve] %s" % name)
    print("[serve] root = %s" % root)
    print("[serve] open = %s" % url)
    print("[serve] Ctrl+C 停止（端口由 serve.config.json 固定，占用即报错不换号）")

    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] stopped")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
