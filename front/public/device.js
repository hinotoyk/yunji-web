/* 云迹 · 设备判定统一入口（device）
 * 目标：全站只此一处判断 PC / MB（移动端），后续功能一律
 *       用 YJ.device.isMb() / YJ.device.isPc() 分支，不再散落 innerWidth。
 * 断点：768px，与 Tailwind md:/max-md: 完全一致（AGENTS.md：统一 max-md 单断点），
 *       基于 matchMedia 实现，随 CSS 实时响应，JS 与样式层永不脱节。
 * 用法：
 *   YJ.device.isMb()       -> boolean  移动端（视口 < 768px）
 *   YJ.device.isPc()       -> boolean  桌面端（!isMb()）
 *   YJ.device.mode()       -> 'pc' | 'mb'
 *   YJ.device.onChange(cb) -> 跨过 768px 断点时回调 cb({isMb,isPc,mode})；返回取消函数
 */
window.YJ = window.YJ || {};
YJ.device = (function () {
  "use strict";

  const BREAKPOINT = 768;   // 设备断点（与 Tailwind md: 一致）

  // 与 CSS max-md: 同源的媒体查询；不支持 matchMedia 时退回 innerWidth
  const mql = window.matchMedia
    ? window.matchMedia("(max-width:" + (BREAKPOINT - 1) + "px)")
    : null;

  function isMb() {
    if (mql) return mql.matches;
    return (window.innerWidth || document.documentElement.clientWidth) < BREAKPOINT;
  }
  function isPc() { return !isMb(); }
  function mode() { return isMb() ? "mb" : "pc"; }

  const cbs = [];
  function onChange(fn) {
    cbs.push(fn);
    return function cancel() {
      const i = cbs.indexOf(fn);
      if (i >= 0) cbs.splice(i, 1);
    };
  }

  /* 断点翻转时通知订阅者（含降级：老 Safari 用 addListener） */
  function fire() {
    const info = { isMb: isMb(), isPc: isPc(), mode: mode() };
    cbs.forEach(function (fn) { try { fn(info); } catch (e) {} });
  }
  if (mql) {
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", fire);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(fire);
    }
  }

  return { isMb: isMb, isPc: isPc, mode: mode, onChange: onChange, BREAKPOINT: BREAKPOINT };
})();
