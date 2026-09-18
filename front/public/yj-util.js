/* ============================================================
 * 云迹 · 页面级小工具（YJ.util）—— 单一出处
 * ------------------------------------------------------------
 * esc()：HTML 文本转义。原本在 6 个页面里各复制了一份
 *   （其中 timeline/datechart 的副本已漂移成 `>` 无操作），现收敛于此。
 *
 * 用法：页面在 data-config.js 之后引入本文件，
 *   页内脚本顶部薄别名：var esc = YJ.util.esc;
 *
 * 注：race-rows.js 内部另有一份自包含 esc（该模块保持零依赖、可独立单测），
 *   两处语义保持一致，改转义规则时两份同步。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.util = (function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return { esc: esc };
})();
