/* 云迹 · 跨 iframe 共享选中马（bus）
 * 目标：profile 页内嵌 races 页时，选中马自动联动，不重载 iframe。
 * 机制：
 *   - broadcast(id)   : 写入 sessionStorage + postMessage 广播给父/子
 *   - onChange(cb)    : 监听 message + storage，去重后回调 cb(id)
 * 约定消息：{type:"yj:horse", id}
 * 用法：
 *   YJ.bus.broadcast(3);
 *   YJ.bus.onChange(function(id){ ... });   // 返回取消函数
 *
 * ⚠ 载体必须是 sessionStorage 而非 localStorage（后者同源全局共享，会在别的标签页触发 storage 事件把内嵌比赛记录串掉）：完整根因与实测见 `front/UI优化记录.md` §62。
 */
window.YJ = window.YJ || {};
YJ.bus = (function () {
  "use strict";

  const KEY = "yj:currentHorse";
  let last = null;

  function store() {
    try { return window.sessionStorage; } catch (e) { return null; }   /* 隐私模式/禁用存储 → 降级为仅 postMessage */
  }

  function readLocal() {
    const s = store();
    return s ? s.getItem(KEY) : null;
  }

  /* 广播选中马 id */
  function broadcast(id) {
    last = String(id);
    const s = store();
    if (s) { try { s.setItem(KEY, last); } catch (e) {} }
    try {
      window.postMessage({ type: "yj:horse", id: Number(id) }, "*");
    } catch (e) {}
  }

  /* 订阅变化；返回取消函数 */
  function onChange(cb) {
    function handle(id) {
      const s = String(id == null ? "" : id);
      if (s === last) return;
      last = s;
      cb(id == null ? null : Number(id));
    }
    function onMsg(e) {
      const d = e && e.data;
      if (d && d.type === "yj:horse") handle(d.id);
    }
    function onStorage(e) {
      if (e.key === KEY) handle(e.newValue);
    }
    window.addEventListener("message", onMsg);
    window.addEventListener("storage", onStorage);
    // 初始：若已有选中，回放一次
    const init = readLocal();
    if (init != null && init !== "" && String(init) !== String(last)) {
      last = String(init);
      cb(Number(init));
    }
    return function cancel() {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("storage", onStorage);
    };
  }

  return { broadcast, onChange, readLocal };
})();
