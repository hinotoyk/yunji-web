/* ============================================================
 * 页面能力门禁（L2 可选挂载 · 2026-11-12 试点）
 * ------------------------------------------------------------
 * 背景：config/features.json 可以把某个页面能力关掉（`{ "entries": false }`）。
 *   外壳那边直接把侧栏入口从 DOM 移除（index.html 的 applyCaps），但页面文件仍在
 *   dist 里 —— 直连 URL（收藏、分享链接、旧书签、外站引用）照样能打开整张表格。
 *   本脚本把这种「已关闭但仍被直接打开」的页面换成一张说明卡片：不是白屏、不是 404、
 *   不是让人以为站挂了。
 *
 * 用法：页面在 yj-util.js 之后引入本脚本（同步执行即可，和 yj-edit-gate.js 同款做法）：
 *   <script src="../yj-util.js"></script>
 *   <script src="../yj-cap.js"></script>
 *   ⚠ 编辑页不引本脚本：那边由 yj-edit-gate.js 统一处理（它是 PAT 门禁 + 编辑台关闭，
 *     两个门 AND，避免两个脚本抢着替换 body）。
 *
 * 数据来源（都由 gen-site-config.mjs 构建期注入，不要在页面里手写页面表）：
 *   window.YJ_CAP = { pageCap: { "entries": "entries", "edit-table": "editor", … },
 *                     labels:  { "entries": "出走马表", … } }   ← 源 = front/scripts/features.cjs
 *   window.YJ_SITE.features = { "entries": false, … }           ← 源 = config/features.json
 *
 * ⚠ 定位：与 yj-edit-gate 一样，这是**前台可见性/可用性门禁，不是安全边界**——
 *   页面是公开静态文件，改 JS 即可绕过。它约束的是「正常访客不会误入一个本不该出现的
 *   功能」，不是「防人看数据」。
 * ============================================================ */
(function () {
  "use strict";
  var U = window.YJ && YJ.util;
  var SITE = window.YJ_SITE || {};
  var F = SITE.features;
  var META = window.YJ_CAP || {};
  if (!F || typeof F !== "object" || !META.pageCap) return;   /* 未注入（老站/直开模板）：放行，零成本 */

  /* 当前页 → 能力 id（按文件名，不依赖部署路径深度；CF Pages 剥 .html 也照样命中） */
  var file = (location.pathname.split("/").pop() || "").replace(/\.html$/i, "");
  var cap = META.pageCap[file];
  if (!cap || F[cap] !== false) return;                       /* 未登记的页面 / 能力已启用：放行 */

  var label = (META.labels && META.labels[cap]) || cap;
  try { document.documentElement.setAttribute("data-cap-off", cap); } catch (e) {}

  /* ① 先锁可见性：body 仍在解析中，用 html 属性 + 内联样式（不依赖 Tailwind 是否已编译到） */
  var st = document.createElement("style");
  st.textContent = "html[data-cap-off] body{visibility:hidden!important}" +
    "html[data-cap-off] body #yj-cap-gate{visibility:visible!important}" +
    "html[data-cap-off] body{overflow:hidden!important}";
  (document.head || document.documentElement).appendChild(st);

  /* ② DOM 就绪后整页换成说明卡片（页面 UI 不再呈现） */
  function render() {
    var box = document.createElement("div");
    box.id = "yj-cap-gate";
    box.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-background p-4";
    box.innerHTML =
      '<div class="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">' +
        '<div class="mb-1 text-[15px] font-semibold">本站未启用 · ' + U.esc(label) + "</div>" +
        '<p class="mb-4 text-[12.5px] leading-relaxed text-muted-foreground">' +
          "该功能在本站的 <code>config/features.json</code> 里被关闭（<code>&quot;" + U.esc(cap) + "&quot;: false</code>）。" +
          "如需开启，把它改成 <code>true</code> 后重新构建即可，页面本身不用改。" +
        "</p>" +
        '<div class="flex items-center justify-end">' +
          '<a href="../index.html" class="rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90">返回站点</a>' +
        "</div>" +
      "</div>";
    var body = document.body;
    while (body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(box);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
