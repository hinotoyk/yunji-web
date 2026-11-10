/* ============================================================
 * 云迹 · 视频回放（YJ.video）—— 比赛记录「回放」列：多源数据 + 图标按钮 + 播放浮层
 * ------------------------------------------------------------
 * 数据（契约 docs/SCHEMA.md §10，v2 = 每场一个**源数组**）：
 *   data/video-map.json      自动匹配产物（scripts/video/build_video_map.py）
 *   data/video_manual.json   人工覆写表（sources 数组 / 单对象 / 直接数组，默认 replace）
 *   两者均经 YJ.cache.fetch（videoMap / videoManual，12h 统一缓存）。
 *   键 = 比赛键：有 race_id → 'race:<race_id>'；无 → 'slot:<日付>|<場名>|<R>'。
 *
 * ★ §187 定稿：**编辑统一放编辑台「比赛记录批量编辑」**（草稿箱 + PAT 提交 video_manual.json）。
 *   本模块只读不写，也不再持有 localStorage 本机表——否则本机值会盖掉编辑台提交的全站值。
 *   人工表前端直读且优先 → 提交后无需后端重算，CI 发布完即生效。
 *
 * 渲染：race-rows.js 的 video 列调 YJ.video.cellHTML(r)（只显示图标，无文字）；
 *   有视频 = 小电视按钮（多源数字角标 / 带字幕「字」角标），无视频 = 空态。
 *   交互走 document 级事件委托，本文件加载即绑定，页面零接线。
 *
 * 浮层（§186/§187）：**挂在 window.top.document** —— 内容页都在外壳 iframe 里，页内 fixed 只能
 *   盖到内容区（基本信息页弹窗会偏在右下角）。同源 iframe 可直接操作顶层文档，外壳 index.html
 *   引了同一份 theme.css → 样式天然可用。直开子页（无外壳）自动退回本 document。
 *   播放：B 站源 → 16:9 iframe（点击才注入 src、关闭即清空）；其他源 → 外链卡片。
 *   遮罩完全透明（用户定稿），只靠弹窗自身阴影/描边分层；点空白 / Esc / × 关闭。
 *
 * 依赖：yj-util.js（esc）、yj-cache.js、data-config.js。
 * 放置：races.html / datechart.html 在 race-rows.js **之前**引入本文件。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.video = (function () {
  "use strict";

  var MAP = null;            /* race_key → [source, ...]（人工表已合并） */
  var LABELS = {};           /* race_key → 比赛描述（浮层副标题用，cellHTML 时缓存） */
  var loadPromise = null;
  var ov = null, prevOverflow = "";

  function esc(s) { return YJ.util.esc(s); }        /* 薄别名（单一出处 yj-util.js，§48） */

  /* ---- 顶层文档：外壳 iframe 内 → 浮层挂 top 才是整页居中；跨域/直开 → 本页 ---- */
  function hostDoc() {
    try { var t = window.top; if (t && t !== window && t.document) return t.document; } catch (e) {}
    return document;
  }
  function hostWin() {
    try { var t = window.top; if (t && t !== window) return t; } catch (e) {}
    return window;
  }

  /* ---- 图标 ---- */
  var ICO_BILI = '<svg width="19" height="17" viewBox="0 0 28 24" aria-hidden="true">' +
    '<path d="M7 1.5 L10.5 5 M21 1.5 L17.5 5" stroke="#FB7299" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    '<rect x="1.5" y="5" width="25" height="17.5" rx="5" fill="#FB7299"/>' +
    '<rect x="4.5" y="8" width="19" height="11.5" rx="3" fill="#fff"/>' +
    '<path d="M9.5 12v2.2 M18.5 12v2.2" stroke="#FB7299" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ICO_OTHER = '<svg width="19" height="17" viewBox="0 0 28 24" aria-hidden="true">' +
    '<rect x="2" y="5" width="24" height="16" rx="4" fill="none" stroke="#0f8fd6" stroke-width="2"/>' +
    '<path d="M12 9.5 L18.5 13 L12 16.5 Z" fill="#0f8fd6"/></svg>';
  var ICO_X = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  var BILI_URL_RE = /bilibili\.com\/video\/(BV[0-9A-Za-z]{8,})/i;

  function raceKey(r) {
    var rid = String((r && r.race_id) || "").trim();
    if (rid) return "race:" + rid;
    return "slot:" + String(r.日付 || "") + "|" + String(r.場名 || "") + "|" + String(r.R || "");
  }
  function raceLabel(r) {
    return [r.日付, String(r.場名 || "") + String(r.R || "") + "R", r.レース名, r.出走馬名]
      .filter(Boolean).join(" · ").slice(0, 70);
  }

  /* ---- 归一化：v2 源数组（兼容旧版单对象） ---- */
  function normSource(s, match) {
    if (!s || typeof s !== "object") return null;
    var url = String(s.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return null;      /* 只收 http(s)，防 javascript: 注入 */
    var hit = BILI_URL_RE.exec(url);
    return {
      source: hit ? "bilibili" : "other",
      bvid: hit ? hit[1] : "",
      url: url,
      title: String(s.title || ""),
      page: parseInt(s.page, 10) || 1,
      subtitle: !!s.subtitle,
      match: s.match || match || "manual"
    };
  }
  function normList(x, match) {
    var arr = [];
    if (Array.isArray(x)) arr = x;
    else if (x && typeof x === "object") {
      if (Array.isArray(x.sources)) arr = x.sources;
      else if (x.url) arr = [x];                     /* 旧版单源对象 */
    }
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var s = normSource(arr[i], match);
      if (s) out.push(s);
    }
    return out;
  }

  /* ---- 数据加载（幂等；失败静默空表——回放列整体退场，不阻塞页面） ---- */
  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      YJ.cache.fetch("videoMap").catch(function () { return null; }),
      YJ.cache.fetch("videoManual").catch(function () { return null; })
    ]).then(function (rs) {
      var out = {}, auto = ((rs[0] || {}).videos) || {};
      for (var k in auto) out[k] = normList(auto[k], "auto");
      var manual = rs[1] || {};
      for (var m in manual) {
        if (m.indexOf("_") === 0) continue;         /* _readme / _examples 忽略 */
        var def = manual[m], list = normList(def, "manual");
        if (!list.length && !(def && def.clear)) continue;
        var append = def && !Array.isArray(def) && !!def.append;
        out[m] = (append && out[m]) ? out[m].concat(list) : list;
      }
      MAP = out;
      try { document.dispatchEvent(new CustomEvent("yj-video-ready")); } catch (e) {}
      return MAP;
    });
    return loadPromise;
  }
  function ready() { return !!MAP; }
  function lookup(r) { return MAP ? (MAP[raceKey(r)] || []) : []; }
  function sources(key) { return (MAP && MAP[key]) || []; }

  /* ---- 单元格：只显示图标（用户定稿 §186.1），无视频整格空态 ---- */
  function cellHTML(r) {
    if (!MAP) return "";
    var list = lookup(r);
    if (!list.length) return "";
    LABELS[raceKey(r)] = raceLabel(r);
    var first = list[0], other = first.source !== "bilibili";
    var tip = first.title || "观看视频回放";
    if (first.subtitle) tip += " · 带字幕";      /* 角标字很小（§187.1），tooltip 补足可读性 */
    return '<button type="button" class="yj-vid' + (other ? " yj-vid--other" : "") + '"' +
      ' data-yj-vid="' + esc(raceKey(r)) + '" title="' + esc(tip) + '">' +
      (other ? ICO_OTHER : ICO_BILI) +
      (list.length > 1 ? '<i class="yj-vid-n">' + list.length + "</i>" : "") +
      (first.subtitle ? '<i class="yj-vid-sub" aria-label="带字幕">字</i>' : "") +
      "</button>";
  }

  /* ---- 浮层骨架：挂顶层文档、透明遮罩、Esc/点空白/× 关闭 ---- */
  function onKey(e) { if (e.key === "Escape") close(); }
  function close() {
    if (!ov) return;
    var d = hostDoc(), w = hostWin();
    w.removeEventListener("keydown", onKey, true);
    document.removeEventListener("keydown", onKey, true);
    d.body.style.overflow = prevOverflow;
    var fr = ov.querySelector("iframe");
    if (fr) fr.src = "about:blank";                 /* 卸载播放器 */
    ov.remove();
    ov = null;
  }
  function mount(html) {
    var d = hostDoc(), w = hostWin();
    if (!ov) {
      prevOverflow = d.body.style.overflow;
      d.body.style.overflow = "hidden";
      ov = d.createElement("div");
      ov.className = "yj-vm-mask";
      ov.setAttribute("role", "dialog");
      d.body.appendChild(ov);
      w.addEventListener("keydown", onKey, true);
      document.addEventListener("keydown", onKey, true);
    } else {
      var old = ov.querySelector("iframe");
      if (old) old.src = "about:blank";
    }
    ov.innerHTML = html;
    ov.setAttribute("aria-label", "视频回放（Esc 关闭）");
    ov.onmousedown = function (e) { if (e.target === ov) close(); };
    var x = ov.querySelector(".yj-vm-x");
    if (x) x.onclick = close;
    try { if (w !== window) { window.blur(); w.focus(); } } catch (e) {}
    return ov;
  }
  function head(title, sub) {
    return '<div class="yj-vm-head"><span class="yj-vm-title">' + esc(title) +
      (sub ? '<small class="yj-vm-sub">' + esc(sub) + "</small>" : "") +
      '</span><button type="button" class="yj-vm-x" aria-label="关闭">' + ICO_X + "</button></div>";
  }

  /* ---- 播放浮层（多源 = 顶部源切换条；单源 other 源保持新标签页直开） ---- */
  /* 编辑台链接用绝对路径：浮层 DOM 挂在顶层文档（外壳在站点根），而按钮所在页面在 pages/ 下，
   * 直接写相对路径会在两种 base URL 里对错一个 → 从 iframe 自身 pathname 拼，两边都正确。 */
  function editHref() {
    var p = "";
    try { p = (window.location && window.location.pathname) || ""; } catch (e) {}
    return p.replace(/[^/]*$/, "") + "edit-table.html?sheet=races";
  }
  function playerHTML(key, list, idx) {
    var v = list[idx];
    var tabs = "";
    if (list.length > 1) {
      tabs = '<div class="yj-vm-tabs">' + list.map(function (s, i) {
        return '<button type="button" class="yj-vm-tab' + (i === idx ? " is-on" : "") +
          '" data-yj-vtab="' + i + '">' + (i + 1) + " · " +
          esc((s.title || (s.source === "bilibili" ? "B 站" : "其他链接")).slice(0, 22)) +
          (s.subtitle ? " · 字" : "") + "</button>";
      }).join("") + "</div>";
    }
    var frame = (v.source === "bilibili" && v.bvid)
      ? '<div class="yj-vm-frame"><iframe src="' + esc(
          "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(v.bvid) +
          "&page=" + v.page + "&high_quality=1&danmaku=0&autoplay=1&no_related=1") +
        '" title="视频回放" scrolling="no" allowfullscreen="true" allow="fullscreen; autoplay; encrypted-media; picture-in-picture"></iframe></div>'
      : '<div class="yj-vm-frame yj-vm-ext"><p>此源不是 B 站视频，站外无法内嵌播放</p>' +
        '<a href="' + esc(v.url) + '" target="_blank" rel="noopener" class="yj-vm-open">打开视频 ↗</a></div>';
    return '<div class="yj-vm">' + head(v.title || "视频回放", LABELS[key] || "") + tabs + frame +
      '<div class="yj-vm-foot">' +
        (v.subtitle ? '<span class="yj-vm-chip yj-vm-chip--sub">带字幕</span>' : "") +
        '<span class="yj-vm-chip">' + (v.source === "bilibili" ? "B 站源" : "其他链接") + "</span>" +
        '<a class="yj-vm-cfg" href="' + esc(editHref()) + '" target="_blank" rel="noopener" title="在比赛记录批量编辑里配置视频源">配置视频源 ↗</a>' +
        '<a class="yj-vm-link" href="' + esc(v.url) + '" target="_blank" rel="noopener">在源站打开 ↗</a>' +
      "</div></div>";
  }
  function renderPlayer(key, list, idx) {
    var box = mount(playerHTML(key, list, idx));
    var tabs = box.querySelectorAll("[data-yj-vtab]");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = (function (n) {
        return function () { renderPlayer(key, list, n); };
      })(parseInt(tabs[i].getAttribute("data-yj-vtab"), 10));
    }
  }
  function open(key, idx) {
    var list = sources(key);
    if (!list.length) return;
    var v = list[idx || 0];
    if (list.length === 1 && (v.source !== "bilibili" || !v.bvid)) {   /* 单源外链：直开新标签页 */
      window.open(v.url, "_blank", "noopener");
      return;
    }
    renderPlayer(key, list, idx || 0);
  }

  /* ---- 交互接线：document 级事件委托（页面渲染按钮即可点） ---- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var b = t && t.closest ? t.closest("[data-yj-vid]") : null;
    if (b) { e.preventDefault(); open(b.getAttribute("data-yj-vid")); }
  });

  return {
    load: load, ready: ready, lookup: lookup, sources: sources, raceKey: raceKey,
    cellHTML: cellHTML, open: open
  };
})();
