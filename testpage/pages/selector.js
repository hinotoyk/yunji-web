/* 云迹 · 共享选马器（方案 A 智能单框，UI 优化记录 §3 落地版）
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
 *       之后所有页面共享同一份马匹列表。渲染由本文件注入样式，页面无需重复定义。
 * 检索：四种名字（日/英/港/译）+ 母名/马主/调教师/生产牧场 + id。
 * 视觉：彩色色块名字、性别徽章（牡/牝/セン）、实时计数、选中回填主名。
 */
window.YJ = window.YJ || {};
YJ.selector = (function () {
  "use strict";

  /* 名字槽位：日/英/港/译 固定顺序（class 用于色块配色） */
  var NAME_SLOTS = [["馬名", "jp"], ["欧字馬名", "en"], ["香港馬名", "hk"], ["自译馬名", "zh"]];
  var NAME_FIELDS = ["馬名", "欧字馬名", "自译馬名", "香港馬名"];
  var EXTRA_FIELDS = [["母名", "母名"], ["馬主", "马主"], ["調教師", "调教师"], ["生産牧場", "牧场"]];
  var EXTRA_LABEL = { "母名": "母名", "馬主": "马主", "調教師": "调教师", "生産牧場": "牧场" };
  /* 字段中文标签（统一术语：日文名/英文名/港译名/自译名） */
  var LABEL = { "馬名": "日文名", "欧字馬名": "英文名", "香港馬名": "港译名", "自译馬名": "自译名",
    "母名": "母名", "馬主": "马主", "調教師": "调教师", "生産牧場": "生产牧场" };

  var ICON = '<span class="ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>';

  /* 注入组件样式（与 theme.css 变量一致；色块/性别色值为定稿值） */
  var css = `
.yj-sel{position:relative;margin-bottom:6px}
.yj-sel .box{display:flex;align-items:center;gap:10px;height:46px;padding:0 14px;border:1px solid hsl(var(--input));border-radius:10px;background:hsl(var(--card));transition:border-color .15s,box-shadow .15s}
.yj-sel .box:hover{border-color:hsl(var(--border)/.6)}
.yj-sel .box:focus-within{border-color:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--ring)/.16),0 2px 8px rgba(0,0,0,.04)}
.yj-sel .box .ic{color:hsl(var(--muted-foreground));flex:none;display:flex}
.yj-sel .box input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:hsl(var(--foreground));font-size:13.5px}
.yj-sel .box input::placeholder{color:hsl(var(--muted-foreground)/.65);font-size:12.5px}
.yj-sel .box .cnt{flex:none;font-size:11px;font-weight:600;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.6);padding:2px 8px;border-radius:99px;font-variant-numeric:tabular-nums;transition:color .12s,background .12s}
.yj-sel .box .cnt.on{color:hsl(var(--primary));background:hsl(var(--accent))}
.yj-sel .box .clear{flex:none;width:22px;height:22px;border:none;border-radius:6px;background:hsl(var(--muted));color:hsl(var(--muted-foreground));cursor:pointer;font-size:12px;line-height:1;display:none}
.yj-sel .box .clear.on{display:block}
.yj-sel .box .clear:hover{background:hsl(var(--muted)/.8);color:hsl(var(--foreground))}
.yj-sel .drop{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:50;max-height:360px;overflow-y:auto;background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.05);display:none}
.yj-sel .drop.show{display:block;animation:yjDropIn .15s ease}
.yj-sel .drop::-webkit-scrollbar{width:8px}
.yj-sel .drop::-webkit-scrollbar-thumb{background:hsl(var(--border));border-radius:99px;border:2px solid hsl(var(--card))}
.yj-sel .drop::-webkit-scrollbar-thumb:hover{background:hsl(var(--muted-foreground)/.5)}
.yj-sel .drop::-webkit-scrollbar-track{background:transparent}
@keyframes yjDropIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.yj-sel .drop.show{animation:none}}
.yj-sel .row{padding:9px 14px;border-bottom:1px solid hsl(var(--border));cursor:pointer;transition:background .1s}
.yj-sel .row:last-child{border-bottom:none}
.yj-sel .row:hover,.yj-sel .row.hl{background:hsl(var(--muted)/.5)}
.yj-sel .row.hl{box-shadow:inset 2px 0 0 hsl(var(--primary))}
.yj-sel .row .top{display:flex;align-items:flex-start;gap:8px;min-width:0}
.yj-sel .row .names{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 6px}
.nblock{display:inline-block;padding:1px 8px;border-radius:6px;font-size:12.5px;line-height:1.7;white-space:nowrap}
.nblock.main{font-weight:600}
.nblock.jp{background:#E0F5F4;color:#0B6B64}
.nblock.en{background:#E4F0FC;color:#0F7FD0}
.nblock.hk{background:#FFF0E0;color:#B25E10}
.nblock.zh{background:#EFEAFB;color:#6D4FC4}
.nblock.miss{background:#F1F1F1;color:#B0B0B0}
.nblock.id{background:hsl(var(--muted));color:hsl(var(--muted-foreground))}
.sx{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;padding:1px 9px;border-radius:99px;line-height:1.7}
.sx.colt{background:#C9EFFE;color:#0B5A8C}
.sx.filly{background:#FFDBD5;color:#B03A30}
.sx.geld{background:#EFEFEF;color:#5A5A5A}
.yj-sel .row .chip{flex:none;font-size:10.5px;padding:1.5px 8px;border-radius:99px;background:hsl(var(--accent));color:hsl(var(--accent-foreground));letter-spacing:.3px;font-weight:600;margin-top:1px}
.yj-sel .row .mt{margin-left:auto;flex:none;font-size:12px;color:hsl(var(--secondary-foreground));white-space:nowrap;display:flex;align-items:center;gap:5px}
.yj-sel .row .sub{font-size:12px;color:hsl(var(--secondary-foreground));margin-top:2px}
.yj-sel .empty{padding:16px 14px;font-size:13px;color:hsl(var(--muted-foreground));text-align:center}
.yj-sel .dhead{font-size:12px;color:hsl(var(--secondary-foreground));padding:8px 14px 5px;letter-spacing:.5px;border-bottom:1px solid hsl(var(--border));background:hsl(var(--muted)/.35)}
.yj-sel .dhead b{color:hsl(var(--primary))}
@media (max-width:768px){
  .yj-sel .row{padding:8px 10px}
  .yj-sel .box{height:42px;padding:0 12px}
  .yj-sel .box input{font-size:13px}
  .nblock{font-size:12px;padding:0 6px}
  .yj-sel .row .mt{font-size:11px}
  .yj-sel .row .sub{font-size:11px}
}
`;

  function injectCss() {
    if (document.getElementById("yj-sel-css")) return;
    var st = document.createElement("style");
    st.id = "yj-sel-css";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function sexHTML(v) {
    if (!v) return '';
    if (v === '牡') return '<span class="sx colt">♂ 牡</span>';
    if (v === '牝') return '<span class="sx filly">♀ 牝</span>';
    if (v === 'セ') return '<span class="sx geld">⚲ セン</span>';
    return '<span class="sx geld">' + esc(v) + '</span>';
  }
  function metaHTML(h) {
    return [sexHTML(h.性別), h.生年].filter(Boolean).join('');
  }
  function nameHTML(h) {
    var vals = NAME_SLOTS.map(function (s) { return h[s[0]]; });
    var firstIdx = -1, lastIdx = -1;
    for (var i = 0; i < vals.length; i++) { if (vals[i]) { if (firstIdx < 0) firstIdx = i; lastIdx = i; } }
    if (firstIdx < 0) return '<span class="names"><span class="nblock id">#' + esc(h.id) + '</span></span>';
    var html = '';
    for (var i = 0; i <= lastIdx; i++) {
      if (vals[i]) {
        var cls = 'nblock ' + NAME_SLOTS[i][1] + (i === firstIdx ? ' main' : '');
        html += '<span class="' + cls + '">' + esc(vals[i]) + '</span>';
      } else {
        html += '<span class="nblock miss">—</span>';
      }
    }
    return '<span class="names">' + html + '</span>';
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

  /* 全字段匹配：四种名字 + 母名/马主/调教师/牧场 + id */
  function matches(h, q) {
    if (!q) return true;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    for (let i = 0; i < NAME_FIELDS.length; i++) {
      const v = h[NAME_FIELDS[i]];
      if (v && String(v).toLowerCase().indexOf(s) >= 0) return true;
    }
    for (let j = 0; j < EXTRA_FIELDS.length; j++) {
      const v = h[EXTRA_FIELDS[j][0]];
      if (v && String(v).toLowerCase().indexOf(s) >= 0) return true;
    }
    return String(h.id || "").indexOf(s) >= 0;
  }

  /* 命中字段信息（用于下拉行的字段胶囊 + 命中值副行） */
  function matchInfo(h, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return null;
    for (let i = 0; i < NAME_FIELDS.length; i++) {
      const v = h[NAME_FIELDS[i]];
      if (v && String(v).toLowerCase().indexOf(s) >= 0) return { label: '名字', fromExtra: false };
    }
    for (let j = 0; j < EXTRA_FIELDS.length; j++) {
      const v = h[EXTRA_FIELDS[j][0]];
      if (v && String(v).toLowerCase().indexOf(s) >= 0) return { label: EXTRA_FIELDS[j][1], fromExtra: true, key: EXTRA_FIELDS[j][0] };
    }
    if (String(h.id || "").indexOf(s) >= 0) return { label: 'ID', fromExtra: true, key: 'id' };
    return null;
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
      '<div class="yj-sel">' +
        '<div class="box">' + ICON +
          '<input type="text" placeholder="日文名 · 英文名 · 港译名 · 自译名 · 母名 · 马主 · 调教师 · 生产牧场" autocomplete="off">' +
          '<span class="cnt">—</span>' +
          '<button class="clear" type="button" aria-label="清空">✕</button>' +
        '</div>' +
        '<div class="drop"></div>' +
      '</div>';

    const wrap = el.querySelector(".yj-sel");
    const box = wrap.querySelector(".box");
    const input = wrap.querySelector("input");
    const cnt = wrap.querySelector(".cnt");
    const clear = wrap.querySelector(".clear");
    const drop = wrap.querySelector(".drop");

    let horses = [];
    let list = [];
    let hl = -1;
    let selected = false; // 已选中一匹马（仅用于再次点击时清空重搜）

    function setSel(h) {
      selected = !!h;
      if (h) input.value = h.馬名 || displayName(h);
      cnt.textContent = horses.length;
      cnt.classList.remove("on");
    }

    function render(q) {
      q = (q == null ? "" : q).trim().toLowerCase();
      clear.classList.toggle("on", !!q);
      list = q ? horses.filter(function (h) { return matches(h, q); }) : horses.slice();
      cnt.textContent = q ? list.length : horses.length;
      cnt.classList.toggle("on", !!q);
      hl = -1;
      if (!list.length) {
        drop.innerHTML = '<div class="empty">未找到匹配的马匹</div>';
        drop.classList.add("show");
        return;
      }
      drop.innerHTML = '<div class="dhead">' + (q ? '匹配 <b>' + list.length + '</b> 匹' : '共 <b>' + horses.length + '</b> 匹') + '</div>' +
        list.map(function (h, i) {
          const m = q ? matchInfo(h, q) : null;
          const chip = (m && m.fromExtra) ? '<span class="chip">' + esc(m.label) + '</span>' : '';
          const sub = (m && m.fromExtra && m.key !== 'id') ? '<div class="sub">' + esc(EXTRA_LABEL[m.key] || m.label) + '：' + esc(h[m.key]) + '</div>' : '';
          return '<div class="row" data-i="' + i + '"><div class="top">' + nameHTML(h) + chip + '<span class="mt">' + metaHTML(h) + '</span></div>' + sub + '</div>';
        }).join("");
      drop.classList.add("show");
    }

    function markHl() {
      drop.querySelectorAll(".row").forEach(function (it, i) {
        it.classList.toggle("hl", i === hl);
      });
    }

    function choose(i) {
      const h = list[i];
      if (!h) return;
      drop.classList.remove("show");
      setSel(h);
      onSelect(h);
    }

    input.addEventListener("focus", function () {
      // 已选状态下再次点击 = 重新搜索
      if (selected) { selected = false; input.value = ""; }
      render(input.value);
    });
    input.addEventListener("input", function () { selected = false; render(input.value); });
    clear.addEventListener("click", function () { input.value = ""; selected = false; render(""); input.focus(); });
    input.addEventListener("keydown", function (e) {
      if (!drop.classList.contains("show") || !list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); hl = (hl + 1) % list.length; markHl(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hl = (hl - 1 + list.length) % list.length; markHl(); }
      else if (e.key === "Enter") { e.preventDefault(); if (hl >= 0) choose(hl); }
      else if (e.key === "Escape") { drop.classList.remove("show"); input.blur(); }
    });
    drop.addEventListener("mousedown", function (e) {
      const it = e.target.closest ? e.target.closest(".row") : null;
      if (it) choose(parseInt(it.dataset.i, 10));
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) drop.classList.remove("show");
    });

    return loadHorses(base).then(function (hs) {
      horses = hs;
      horsesCache = hs;
      cnt.textContent = hs.length;
      return hs;
    });
  }

  /* 已加载的马匹列表（供页面取马名等） */
  function getHorses() {
    return horsesCache || [];
  }

  return { init, loadHorses, displayName, matches, getHorses };
})();
