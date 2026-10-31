/* ============================================================
 * 云迹 · 照片灯箱（YJ.lightbox）—— 全屏放大查看
 * ------------------------------------------------------------
 * API：YJ.lightbox.open(photos, index)
 *   photos: 图片 URL 数组（字符串）；index: 初始下标（默认 0）
 * 交互：‹ › 玻璃圆钮 / 键盘 ← → 切换 · Esc / 点空白关闭 · 触摸滑动翻页
 * 视觉：bg-black/85 全屏暗场 + 暗色玻璃浮层（与相册浮层同语言，§149）；
 *   交叉淡入换图，相邻一张预加载。
 * 放置：外壳 index.html 顶层渲染（遮罩全屏含侧栏，§149.2）；
 *   内容页直开（无外壳）时也可自行引入本文件本地兜底。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.lightbox = (function () {
  "use strict";

  var ov = null, imgs = [null, null], front = 0, photos = [], idx = 0, prevOverflow = "";
  var seen = {};                                   /* 预加载去重 */

  var CHEV = function (rot) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + rot + 'deg)"><path d="M9 5l7 7-7 7"/></svg>';
  };
  var X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* 玻璃圆钮（与相册浮层同款语言：黑玻璃 + 细白描边） */
  var btnCls = 'flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white/90 ring-1 ring-white/25 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-black/55 hover:text-white active:scale-95 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

  function layer(front) {
    return '<img alt="" aria-hidden="' + (front ? "false" : "true") + '" decoding="async" class="lb-img absolute inset-0 m-auto max-h-[92vh] max-w-[94vw] object-contain select-none ' +
      (front ? "opacity-100" : "opacity-0") + '" style="transition:opacity .25s ease">';
  }

  function preload(n) {
    var src = photos[((n % photos.length) + photos.length) % photos.length];
    if (!src || seen[src]) return;
    seen[src] = 1;
    var im = new Image(); im.decoding = "async"; im.src = src;
  }

  /* 把 src 写进备用层 → onload / 缓存命中后翻透明度（与相册双层淡入同策略，无白闪） */
  function show(n) {
    idx = (n + photos.length) % photos.length;
    var back = 1 - front, im = imgs[back];
    im.onload = function () { im.onload = im.onerror = null; flip(back); };
    im.onerror = function () { im.onload = im.onerror = null; flip(back); };
    im.src = photos[idx];
    if (im.complete) flip(back);
    var cnt = ov.querySelector(".lb-count");
    if (cnt) cnt.textContent = (idx + 1) + " / " + photos.length;
    preload(idx + 1); preload(idx - 1);
  }
  function flip(back) {
    imgs[front].classList.remove("opacity-100");
    imgs[front].classList.add("opacity-0");
    imgs[front].setAttribute("aria-hidden", "true");
    imgs[back].classList.remove("opacity-0");
    imgs[back].classList.add("opacity-100");
    imgs[back].setAttribute("aria-hidden", "false");
    front = back;
  }

  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(idx - 1);
    else if (e.key === "ArrowRight") show(idx + 1);
  }

  function close() {
    if (!ov) return;
    document.removeEventListener("keydown", onKey, true);
    document.body.style.overflow = prevOverflow;
    var el = ov; ov = null; imgs = [null, null];
    el.remove();
  }

  function open(list, start) {
    photos = (Array.isArray(list) ? list : [list]).filter(Boolean);
    if (!photos.length) return;
    idx = Math.min(Math.max(0, start | 0), photos.length - 1);
    seen = {}; preload(idx + 1); preload(idx - 1); seen[photos[idx]] = 1;

    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    ov = document.createElement("div");
    ov.className = "lb-overlay fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 max-md:p-2";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "照片查看器（左右方向键切换，Esc 关闭）");
    ov.innerHTML =
      layer(true) + layer(false) +
      '<button type="button" aria-label="关闭" class="lb-close absolute top-3.5 right-3.5 z-10 ' + btnCls + ' h-10 w-10">' + X + '</button>' +
      (photos.length > 1
        ? '<button type="button" aria-label="上一张" class="lb-nav lb-prev absolute top-1/2 left-3 z-10 -translate-y-1/2 ' + btnCls + '">' + CHEV(180) + '</button>' +
          '<button type="button" aria-label="下一张" class="lb-nav lb-next absolute top-1/2 right-3 z-10 -translate-y-1/2 ' + btnCls + '">' + CHEV(0) + '</button>' +
          '<div class="lb-count absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold tabular-nums text-white/85 ring-1 ring-white/15 backdrop-blur-sm">' + (idx + 1) + ' / ' + photos.length + '</div>'
        : "");
    imgs = [ov.querySelector(".lb-img"), ov.querySelectorAll(".lb-img")[1]];
    document.body.appendChild(ov);

    imgs[front].src = photos[idx];                   /* 首图直接进前层 */

    ov.querySelector(".lb-close").addEventListener("click", close);
    var prev = ov.querySelector(".lb-prev"), next = ov.querySelector(".lb-next");
    if (prev) prev.addEventListener("click", function (e) { e.stopPropagation(); show(idx - 1); });
    if (next) next.addEventListener("click", function (e) { e.stopPropagation(); show(idx + 1); });
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey, true);

    /* 触摸滑动（>40px 判翻页），与相册同一阈值 */
    var tx = null;
    ov.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener("touchend", function (e) {
      if (tx == null) return;
      var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  return { open: open };
})();
