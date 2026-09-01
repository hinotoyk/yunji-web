/* 云迹 · 共享选马器（搜索 + 下拉列表）
 * 用法（单马页复用）：
 *   <div id="selector"></div>
 *   <script src="i18n.js"></script>
 *   <script src="selector.js"></script>
 *   YJ.selector.init({
 *     el: document.getElementById("selector"),
 *     base: "../data/basic.json",   // 相对当前页
 *     onSelect: function(horse){ ... }
 *   });
 * 说明：首次 init 会 fetch basic.json 一次并缓存（window.YJ._horses），
 *       之后所有页面共享同一份马匹列表。渲染由本文件注入样式，
 *       页面无需重复定义。手机（≤768px）自动适配。
 */
window.YJ = window.YJ || {};
YJ.selector = (function () {
  "use strict";

  /* 注入组件样式（与 theme.css 变量一致） */
  const css = `
.sel-wrap{position:relative;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.sel-search{flex:1;min-width:200px;height:38px;padding:0 12px;border-radius:8px;border:1px solid hsl(var(--input));background:hsl(var(--background));color:hsl(var(--foreground));font-size:13.5px;outline:none}
.sel-search:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--ring)/.18)}
.sel-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:50;max-height:320px;overflow-y:auto;background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.12);display:none}
.sel-drop.show{display:block}
.sel-item{padding:9px 13px;cursor:pointer;border-bottom:1px solid hsl(var(--border));display:flex;align-items:center;gap:10px;justify-content:space-between}
.sel-item:last-child{border-bottom:none}
.sel-item:hover,.sel-item.hl{background:hsl(var(--muted)/.4)}
.sel-item .nm{font-size:13.5px}
.sel-item .meta{font-size:11.5px;color:hsl(var(--muted-foreground));white-space:nowrap}
.sel-empty{padding:16px 13px;font-size:12.5px;color:hsl(var(--muted-foreground));text-align:center}
.sel-count{font-size:11px;color:hsl(var(--muted-foreground));white-space:nowrap}
.sel-count b{color:hsl(var(--primary))}
`;

  function injectCss() {
    if (document.getElementById("yj-sel-css")) return;
    const st = document.createElement("style");
    st.id = "yj-sel-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  let horsesCache = null;
  let cachePromise = null;

  async function loadHorses(base) {
    if (horsesCache) return horsesCache;
    if (cachePromise) return cachePromise;
    cachePromise = (async function () {
      const r = await fetch(base || "../../data/basic.json");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const horses = Array.isArray(d) ? d : (d.horses || []);
      horsesCache = horses;
      return horses;
    })();
    try {
      return await cachePromise;
    } catch (e) {
      cachePromise = null;
      throw e;
    }
  }

  /* 候选匹配：日文名 / 欧字 / 自译 / 香港名 / id */
  function matches(h, q) {
    if (!q) return true;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const fields = ["馬名", "欧字馬名", "自译馬名", "香港馬名"];
    for (let i = 0; i < fields.length; i++) {
      const v = h[fields[i]];
      if (v && String(v).toLowerCase().indexOf(s) >= 0) return true;
    }
    return String(h.id || "").indexOf(s) >= 0;
  }

  /* 展示名：优先自译/欧字，其次日文 */
  function displayName(h) {
    return h.自译馬名 || h.欧字馬名 || h.馬名 || ("#" + h.id);
  }

  function init(opts) {
    injectCss();
    const el = opts.el;
    if (!el) throw new Error("selector: el required");
    const base = opts.base;
    const onSelect = opts.onSelect || function () {};

    el.innerHTML =
      '<div class="sel-wrap">' +
        '<input class="sel-search" type="text" placeholder="搜索马名 / 欧字名 / 编号…" autocomplete="off">' +
        '<span class="sel-count"></span>' +
        '<div class="sel-drop"></div>' +
      '</div>';

    const input = el.querySelector(".sel-search");
    const count = el.querySelector(".sel-count");
    const drop = el.querySelector(".sel-drop");

    let horses = [];
    let list = [];
    let hl = -1;

    function render(q) {
      list = horses.filter(function (h) { return matches(h, q); });
      hl = -1;
      if (!list.length) {
        drop.innerHTML = '<div class="sel-empty">未找到匹配的马匹</div>';
        drop.classList.add("show");
        return;
      }
      drop.innerHTML = list.map(function (h, i) {
        const meta = [h.性別 ? YJ.i18n.g(h, "性別") : "", h.生年].filter(Boolean).join(" · ");
        return '<div class="sel-item" data-i="' + i + '">' +
          '<span class="nm">' + esc(displayName(h)) + '</span>' +
          (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') +
        '</div>';
      }).join("");
      drop.classList.add("show");
      markHl();
    }

    function markHl() {
      drop.querySelectorAll(".sel-item").forEach(function (it, i) {
        it.classList.toggle("hl", i === hl);
      });
    }

    function choose(i) {
      const h = list[i];
      if (!h) return;
      drop.classList.remove("show");
      input.value = displayName(h);
      onSelect(h);
    }

    input.addEventListener("focus", function () { render(input.value); });
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (e) {
      if (!list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); hl = (hl + 1) % list.length; markHl(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hl = (hl - 1 + list.length) % list.length; markHl(); }
      else if (e.key === "Enter") { e.preventDefault(); if (hl >= 0) choose(hl); }
      else if (e.key === "Escape") { drop.classList.remove("show"); }
    });
    drop.addEventListener("mousedown", function (e) {
      const it = e.target.closest ? e.target.closest(".sel-item") : null;
      if (it) choose(parseInt(it.dataset.i, 10));
    });
    document.addEventListener("click", function (e) {
      if (!el.contains(e.target)) drop.classList.remove("show");
    });

    return loadHorses(base).then(function (hs) {
      horses = hs;
      horsesCache = hs;
      count.innerHTML = '共 <b>' + hs.length + '</b> 匹';
      return hs;
    });
  }

  /* 已加载的马匹列表（供页面取马名等） */
  function getHorses() {
    return horsesCache || [];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return { init, loadHorses, displayName, matches, getHorses };
})();
