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
 * ★ 2026-10-31 用户再立项（§149）：重新提供**全局加载动画**（当年撤销的是「骨架屏/ crossfade 渲染动效」
 *   一整套，本条只恢复一个最轻的 spinner —— 数据等齐一次性渲染的口径不变）：
 *   YJ.ui.spin(o)      居中 spinner + 可选文案。o: { label, sm }（sm = 卡内紧凑档）
 *                      样式全 Tailwind utility（content globs 已含 public 目录 js，类会被编译）；
 *                      animate-spin 为核心 utility，零自写 CSS。
 *   YJ.ui.frameSpin(fr) iframe 加载遮罩：把 spinner 覆盖在 iframe 容器上，收到子页
 *                      {type:"yj:frameReady"} postMessage（主信号）或 iframe load 兜底后淡出移除。
 *
 * 样式：本文件不输出额外组件类名（页面排布一律 Tailwind utility）。
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

  /* ---------------- 全局加载动画（§149）：spinner + 可选文案 ---------------- */
  /* 环形 spinner：双圆环（浅轨道 + 1/4 圆弧），animate-spin 旋转；
   * 颜色走 primary（语义=站点主色），尺寸两档：默认 h-5 / sm h-4 */
  function spinSvg(o) {
    var sz = o.sm ? "h-4 w-4" : "h-5 w-5";
    return '<svg class="animate-spin ' + sz + ' flex-none text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
      '<path class="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"></path>' +
      '</svg>';
  }
  function spin(o) {
    o = o || {};
    var pad = o.sm ? "py-[18px]" : "py-[42px]";
    return '<div class="flex items-center justify-center gap-2.5 ' + pad + ' text-[12.5px] text-muted-foreground" role="status">' +
      spinSvg(o) + (o.label ? '<span>' + esc(o.label) + '</span>' : "") + '</div>';
  }

  /* ---------------- iframe 加载遮罩（§149）：盖住内嵌子页的白屏/文案切换期 ----------------
   * 主信号 = 子页渲染完成后 postMessage {type:"yj:frameReady"}（pedigree/races 内嵌分支已接）；
   * 兜底 = iframe load +1.2s（子页没接信号也不至于永远转圈）+ 9s 失败保险。
   * 要求：iframe 父容器 relative（profile 两处容器已带），遮罩 rounded 由调用侧容器视觉决定。 */
  function frameSpin(fr) {
    var parent = fr && fr.parentNode;
    if (!parent || parent.querySelector(".yj-frameload")) return;
    var ov = document.createElement("div");
    ov.className = "yj-frameload absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-background transition-opacity duration-300";
    ov.innerHTML = spin({ label: "加载中…", sm: true });
    parent.appendChild(ov);
    var done = false;
    function hide() {
      if (done) return; done = true;
      window.removeEventListener("message", onMsg);
      ov.classList.add("opacity-0", "pointer-events-none");
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 350);
    }
    /* 主信号：子页渲染完成 postMessage（e.source 校验=只认自己这个 frame 的消息） */
    function onMsg(e) {
      if (e.source === fr.contentWindow && e.data && e.data.type === "yj:frameReady") hide();
    }
    window.addEventListener("message", onMsg);
    /* 兜底：子页未接 ready 信号时 load+1.2s 退场（子页自身 loading 文案接管）；9s 保险防永远转圈 */
    fr.addEventListener("load", function () { setTimeout(hide, 1200); });
    setTimeout(hide, 9000);
  }

  return { img: img, spin: spin, spinSvg: spinSvg, frameSpin: frameSpin };
})();
