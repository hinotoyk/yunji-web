/* ============================================================
 * 云迹 · 视频回放（YJ.video）—— 比赛记录「回放」列：数据加载 + 按钮渲染 + 播放浮层
 * ------------------------------------------------------------
 * 数据：data/video-map.json（自动匹配产物，scripts/video/build_video_map.py 生成）
 *   + data/video_manual.json（人工覆写表，值永远优先）；两者均经 YJ.cache.fetch
 *   （注册名 videoMap / videoManual，12h 统一缓存）。
 *   键 = 比赛键（与 scripts/video/common.py::race_key_of 同构，改键两处同步）：
 *     有 race_id → 'race:<race_id>'；无（海外台账场）→ 'slot:<日付>|<場名>|<R>'
 * 渲染：race-rows.js 的 video 列调 YJ.video.cellHTML(r) 输出按钮
 *   （本模块未加载 / 数据未就绪 / 该场无视频 → ""，整列空态干净）；
 *   交互（点击开浮层）走 document 级事件委托，本文件加载即绑定，页面零接线。
 * 播放：B 站源 → 16:9 iframe（player.bilibili.com；点击才注入 src、关闭即清空——
 *   几十行表格绝不并发拉播放器）；其他源（人工填的任意 http(s) 链接）→ 新标签页打开。
 * 字幕：二态（用户定稿 2026-11）：subtitle=true 右上角「字」角标，false 无角标。
 * 放置：races.html / datechart.html 在 race-rows.js **之前**引入本文件
 *   （依赖 yj-cache.js / yj-util.js / i18n.js，同 data-config.js 一族）。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.video = (function () {
  "use strict";

  var MAP = null;            /* race_key → 条目（manual 已合并） */
  var loadPromise = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- 图标（B 站小电视 = 简化自绘，品牌粉 #FB7299 单一出处见 theme.css .yj-vid*） ---- */
  var ICO_BILI = '<svg width="21" height="18" viewBox="0 0 28 24" aria-hidden="true">' +
    '<path d="M7 1.5 L10.5 5 M21 1.5 L17.5 5" stroke="#FB7299" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    '<rect x="1.5" y="5" width="25" height="17.5" rx="5" fill="#FB7299"/>' +
    '<rect x="4.5" y="8" width="19" height="11.5" rx="3" fill="#fff"/>' +
    '<path d="M9.5 12v2.2 M18.5 12v2.2" stroke="#FB7299" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ICO_OTHER = '<svg width="21" height="18" viewBox="0 0 28 24" aria-hidden="true">' +
    '<rect x="2" y="5" width="24" height="16" rx="4" fill="none" stroke="#0f8fd6" stroke-width="2"/>' +
    '<path d="M12 9.5 L18.5 13 L12 16.5 Z" fill="#0f8fd6"/></svg>';
  var ICO_X = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var BILI_URL_RE = /bilibili\.com\/video\/(BV[0-9A-Za-z]{8,})/i;

  function raceKey(r) {
    var rid = String((r && r.race_id) || "").trim();
    if (rid) return "race:" + rid;
    return "slot:" + String(r.日付 || "") + "|" + String(r.場名 || "") + "|" + String(r.R || "");
  }

  /* ---- 数据加载（幂等；失败静默空表——回放列整体退场，不阻塞页面） ---- */
  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      YJ.cache.fetch("videoMap").catch(function () { return null; }),
      YJ.cache.fetch("videoManual").catch(function () { return null; })
    ]).then(function (rs) {
      var out = {};
      var auto = ((rs[0] || {}).videos) || {};
      for (var k in auto) out[k] = auto[k];
      var manual = rs[1] || {};
      for (var m in manual) {                     /* 人工覆写：`_` 前缀键是说明/示例，忽略 */
        if (m.indexOf("_") === 0) continue;
        var mv = manual[m];
        if (!mv || !mv.url) continue;
        var hit = BILI_URL_RE.exec(String(mv.url));
        out[m] = {
          source: hit ? "bilibili" : "other",
          bvid: hit ? hit[1] : "",
          url: String(mv.url),
          title: String(mv.title || ""),
          page: parseInt(mv.page, 10) || 1,
          subtitle: !!mv.subtitle,
          match: "manual"
        };
      }
      MAP = out;
      try { document.dispatchEvent(new CustomEvent("yj-video-ready")); } catch (e) { /* 旧浏览器无碍 */ }
      return MAP;
    });
    return loadPromise;
  }
  function ready() { return !!MAP; }
  function lookup(r) { return MAP ? (MAP[raceKey(r)] || null) : null; }

  /* ---- 列单元格按钮（race-rows.js video 列的 pc/mbItem 共用） ---- */
  function cellHTML(r) {
    if (!MAP) return "";
    var v = lookup(r);
    if (!v) return "";
    var other = v.source !== "bilibili";
    return '<button type="button" class="yj-vid' + (other ? " yj-vid--other" : "") + '"' +
      ' data-yj-vid="' + esc(raceKey(r)) + '"' +
      ' title="' + esc(v.title || "观看视频回放") + '">' +
      (other ? ICO_OTHER : ICO_BILI) + '<span>回放</span>' +
      (v.subtitle ? '<i class="yj-vid-sub" aria-label="带字幕">字</i>' : "") +
      '</button>';
  }

  /* ---- 播放浮层（B 站站内 iframe；Esc / 点遮罩 / × 关闭，关闭即清 src 停播） ---- */
  var ov = null, prevOverflow = "";
  function onKey(e) { if (e.key === "Escape") close(); }
  function close() {
    if (!ov) return;
    document.removeEventListener("keydown", onKey, true);
    document.body.style.overflow = prevOverflow;
    var fr = ov.querySelector("iframe");
    if (fr) fr.src = "about:blank";               /* 卸载播放器（不可见的 iframe 不会继续播） */
    ov.remove();
    ov = null;
  }
  function open(key) {
    var v = MAP && MAP[key];
    if (!v || !v.url) return;
    if (v.source !== "bilibili" || !v.bvid) {     /* 人工换的其他源：降级新标签页打开 */
      window.open(v.url, "_blank", "noopener");
      return;
    }
    close();
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    var src = "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(v.bvid) +
      "&page=" + (parseInt(v.page, 10) || 1) +
      "&high_quality=1&danmaku=0&autoplay=1&no_related=1";
    ov = document.createElement("div");
    ov.className = "yj-vm-mask";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "视频回放播放器（Esc 关闭）");
    ov.innerHTML =
      '<div class="yj-vm">' +
        '<div class="yj-vm-head">' +
          '<span class="yj-vm-title">' + esc(v.title || "视频回放") + '</span>' +
          '<button type="button" class="yj-vm-x" aria-label="关闭">' + ICO_X + '</button>' +
        '</div>' +
        '<div class="yj-vm-frame"><iframe src="' + esc(src) + '" title="视频回放" scrolling="no" allowfullscreen="true" allow="fullscreen; autoplay; encrypted-media; picture-in-picture"></iframe></div>' +
        '<div class="yj-vm-foot">' +
          (v.subtitle ? '<span class="yj-vm-chip yj-vm-chip--sub">带字幕</span>' : "") +
          '<span class="yj-vm-chip">B 站源</span>' +
          '<a class="yj-vm-link" href="' + esc(v.url) + '" target="_blank" rel="noopener">在 B 站打开 ↗</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector(".yj-vm-x").addEventListener("click", close);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey, true);
  }

  /* ---- 交互接线：document 级事件委托（页面渲染 [data-yj-vid] 按钮即可点） ---- */
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-yj-vid]") : null;
    if (!b) return;
    e.preventDefault();
    open(b.getAttribute("data-yj-vid"));
  });

  return { load: load, ready: ready, lookup: lookup, raceKey: raceKey, cellHTML: cellHTML, open: open };
})();
