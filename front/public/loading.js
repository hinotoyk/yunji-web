/* 云迹 · 图片标记组件（YJ.ui）
 *
 * ★ 2026-09-21 用户拍板（任务 #18）：本文件原有的骨架屏 / spinner / 失败态（B1）、
 *   长列表分批渲染（B5）、以及阶段 5 动效的 crossfade 与数字滚动（fade / countUp）**全部撤销**，
 *   各页恢复改造前写死的「正在加载…」文案与失败分支、数据等齐后一次性渲染。
 *   现只剩下面这一个保留项 —— 它与动效无关，是纯呈现层的性能/防抖收益：
 *
 *   YJ.ui.img(o)   图片标记：loading="lazy" + decoding="async" + 写死占位尺寸（防 CLS，OPTIMIZATION_PLAN §5.3.2）
 *        o: { src, alt, cls, w, h, eager, attrs }（eager=true 用于首屏必须立刻出现的图）
 *
 * 样式：本文件不再输出任何组件类名（页面排布一律 Tailwind utility）。
 *
 * ⚠ 调用点约定：Node 冒烟门禁（scripts/…/verify_*.cjs）eval 页面内联脚本 + yj-util.js + race-rows.js；
 *   verify_stats 按浏览器加载顺序也入本文件，其余门禁不加载 → 页面对 YJ.ui 的调用一律 `YJ.ui && …`
 *   （缺组件时退化为「直接渲染数据」，不影响断言）。 */
window.YJ = window.YJ || {};
YJ.ui = (function () {
  "use strict";

  /* HTML 转义单一出处 = YJ.util.esc（yj-util.js）；本文件调用极轻，直接转发 */
  function esc(s) {
    return (window.YJ && YJ.util && YJ.util.esc) ? YJ.util.esc(s) : String(s == null ? "" : s);
  }

  /* ---------------- 图片标记（lazy + async + 占位尺寸防 CLS） ---------------- */
  function img(o) {
    o = o || {};
    return '<img src="' + esc(o.src) + '" alt="' + esc(o.alt || "") + '"' +
      (o.eager ? "" : ' loading="lazy"') + ' decoding="async"' +
      (o.w ? ' width="' + esc(o.w) + '"' : "") + (o.h ? ' height="' + esc(o.h) + '"' : "") +
      (o.cls ? ' class="' + o.cls + '"' : "") + (o.attrs ? " " + o.attrs : "") + ">";
  }

  return { img: img };
})();
