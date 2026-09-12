/* 云迹 · 共享选马器（Tailwind 版）
 * 与原版逻辑完全一致；视觉全部用 Tailwind utility 类实现。
 * 用法与 selector.js 原版相同：
 *   YJ.selector.init({ el, base, onSelect })
 */
window.YJ = window.YJ || {};
YJ.selector = (function () {
  "use strict";

  var NAME_FIELDS = ["馬名", "欧字馬名", "自译馬名", "香港馬名"];
  var EXTRA_FIELDS = [["母名", "母名"], ["馬主", "马主"], ["調教師", "调教师"], ["生産牧場", "牧场"]];
  var EXTRA_LABEL = { "母名": "母名", "馬主": "马主", "調教師": "调教师", "生産牧場": "牧场" };
  var LABEL = { "馬名": "日文名", "欧字馬名": "英文名", "香港馬名": "港译名", "自译馬名": "自译名",
    "母名": "母名", "馬主": "马主", "調教師": "调教师", "生産牧場": "生产牧场" };

  var ICON = '<span class="ic flex flex-none text-muted-foreground"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>';

  /* 色块配色（定稿值） */
  var NB = {
    jp:  'bg-[#E0F5F4] text-[#0B6B64]',
    en:  'bg-[#E4F0FC] text-[#0F7FD0]',
    hk:  'bg-[#FFF0E0] text-[#B25E10]',
    zh:  'bg-[#EFEAFB] text-[#6D4FC4]',
    miss:'bg-[#F1F1F1] text-[#B0B0B0]',
    id:  'bg-muted text-muted-foreground'
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  /* 右列仅保留出生年；性别交给主名前的小色点表达（见 nameHTML） */
  function metaHTML(h) {
    return h.生年 || '';
  }
  /* 主名单选：日文 → 英文 → 兜底「母名の生年」（母名也没有才退化 #id）。
   * 不再把日/英/港/译四个名字槽全堆在下拉行里，pc 常驻列表与 mb 弹层通用。 */
  function nameHTML(h) {
    var key, v;
    if (h.馬名)            { key = 'jp'; v = h.馬名; }
    else if (h.欧字馬名)   { key = 'en'; v = h.欧字馬名; }
    else {
      v = fallbackName(h);
      key = String(v).charAt(0) === '#' ? 'id' : 'miss';
    }
    var cls = 'nblock ' + key + ' inline-block max-w-full truncate rounded-md px-2 py-0.5 text-[12.5px] leading-[1.7] max-md:px-1.5 max-md:text-[12px] font-semibold ' + NB[key];
    return '<span class="names flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-[3px]">' +
      '<span class="' + cls + '">' + esc(v) + '</span></span>';
  }

  let horsesCache = null;
  let cachePromise = null;
  let selFn = null; /* 当前 init 实例的 select（左栏目录联动用） */
  let docClickHandler = null; /* document 关闭监听去重：多次 init 只保留最新一个（多实例/重建场景） */

  async function loadHorses(base) {
    if (horsesCache) return horsesCache;
    if (cachePromise) return cachePromise;
    cachePromise = (async function () {
      const r = await fetch(base || YJ_DATA.url('basic.json'));
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

  /* 无任何名字时的兜底显示名：「母名の生年」（如 ダイシンステルラの2023），母名也没有才退化 #id */
  function fallbackName(h) {
    var dam = h.母名, yr = h.生年;
    if (dam && yr) return dam + 'の' + yr;
    if (dam) return dam;
    if (yr) return yr;
    return '#' + h.id;
  }

  function displayName(h) {
    return h.馬名 || h.欧字馬名 || fallbackName(h);
  }

  function init(opts) {
    const el = opts.el;
    if (!el) throw new Error("selector: el required");
    const base = opts.base;
    const onSelect = opts.onSelect || function () {};
    /* persistent: 常驻列表模式（pc 端用）——下拉改为始终可见的纵向列表，
     * 随父容器高度伸缩；默认模式（弹层）行为完全不变 */
    const persistent = !!opts.persistent;
    /* multi: 多选添加模式（筛选条用）——选完不占位、清空输入、保持下拉展开，可连续添加多匹 */
    const multi = !!opts.multi;
    /* excluded: h → bool，render 时从候选排除（已选马，multi 用） */
    const excluded = opts.excluded || null;
    /* compact: 紧凑样式（筛选条内嵌用）：h-26px、去图标/计数/清空按钮 */
    const compact = !!opts.compact;
    const placeholder = opts.placeholder || "日文名 · 英文名 · 港译名 · 自译名 · 母名 · 马主 · 调教师 · 生产牧场";

    el.innerHTML =
      '<div class="yj-sel ' + (persistent ? 'flex h-full min-h-0 flex-col max-md:h-auto' : 'relative mb-1.5') + '">' +
        '<div class="box flex items-center gap-2.5 rounded-[10px] border border-input bg-card transition-[border-color,box-shadow] duration-150 hover:border-border/60 focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(10,167,160,.16),0_2px_8px_rgba(0,0,0,.04)] ' +
          (compact ? 'h-[26px] px-2' : 'h-[46px] px-3.5 max-md:h-[42px] max-md:px-3') + '">' +
          (compact ? '' : ICON) +
          '<input type="text" placeholder="' + placeholder + '" autocomplete="off" class="min-w-0 flex-1 border-none bg-transparent text-foreground outline-none ' +
            (compact ? 'text-[12px] placeholder:text-[11.5px] placeholder:text-muted-foreground/65' : 'text-[13.5px] placeholder:text-[12.5px] placeholder:text-muted-foreground/65 max-md:text-[13px]') + '">' +
          (compact ? '' : '<span class="cnt flex-none rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground transition-colors duration-100 max-md:px-2"></span>') +
          (compact ? '' : '<button class="clear hidden w-[22px] h-[22px] flex-none cursor-pointer rounded-md border-none bg-muted text-[12px] leading-none text-muted-foreground hover:bg-muted/80 hover:text-foreground" type="button" aria-label="清空">✕</button>') +
        '</div>' +
        '<div class="drop yj-drop yj-drop-scroll ' + (persistent
            ? 'mt-1.5 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card shadow-sm max-md:max-h-[45vh]'
            : 'absolute left-0 right-0 top-[calc(100%+6px)] z-50 hidden ' + (compact ? 'max-h-[250px]' : 'max-h-[360px]') + ' overflow-y-auto rounded-xl border border-border bg-card shadow-[0_16px_40px_rgba(0,0,0,.12),0_4px_12px_rgba(0,0,0,.05)]')
          + '"></div>' +
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
    let selected = false;

    function setSel(h) {
      selected = !!h;
      if (h) input.value = h.馬名 || displayName(h);
      if (cnt) {
        cnt.textContent = horses.length;
        cnt.classList.remove("on");
      }
    }

    function render(q) {
      q = (q == null ? "" : q).trim().toLowerCase();
      if (clear) {
        clear.classList.toggle("on", !!q);
        clear.classList.toggle("hidden", !q);
      }
      /* multi + excluded：空输入也排除已选马，其余行为与原版一致 */
      list = horses.filter(function (h) { return (!excluded || !excluded(h)) && (!q || matches(h, q)); });
      if (cnt) {
        cnt.textContent = q ? list.length : horses.length;
        cnt.classList.toggle("on", !!q);
        if (q) { cnt.classList.add("text-primary","bg-accent"); } else { cnt.classList.remove("text-primary","bg-accent"); }
      }
      hl = -1;
      /* 与正式版 testpage 一致：聚焦即展开全部列表（即使未输入） */
      if (!list.length) {
        drop.innerHTML = '<div class="empty px-3.5 py-4 text-center text-[12.5px] text-muted-foreground">未找到匹配的马匹</div>';
        if (!persistent) drop.classList.remove("hidden");
        return;
      }
      drop.innerHTML = '<div class="dhead border-b border-border bg-muted/35 px-3.5 pb-1.25 pt-[7px] text-[10.5px] tracking-[.5px] text-muted-foreground">' + (q ? '匹配 <b class="font-bold text-primary">' + list.length + '</b> 匹' : '共 <b class="font-bold text-primary">' + horses.length + '</b> 匹') + '</div>' +
        list.map(function (h, i) {
          const m = q ? matchInfo(h, q) : null;
          const chip = (m && m.fromExtra) ? '<span class="chip mt-px flex-none rounded-full bg-accent px-[7px] py-[1.5px] text-[9.5px] font-semibold tracking-[.3px] text-accent-foreground">' + esc(m.label) + '</span>' : '';
          const sub = (m && m.fromExtra && m.key !== 'id') ? '<div class="sub mt-0.5 text-[11px] text-muted-foreground max-md:text-[10.5px]">' + esc(EXTRA_LABEL[m.key] || m.label) + '：' + esc(h[m.key]) + '</div>' : '';
          /* 性别左侧色条：淡蓝=牡、淡粉=牝，上下顶满整行、贴左；骟马/未知不渲染色条 */
          const sxBar = h.性別 === '牡' ? 'bg-[#C9EFFE]' : (h.性別 === '牝' ? 'bg-[#FFDBD5]' : '');
          return '<div class="row relative cursor-pointer border-b border-border px-3.5 py-[9px] transition-colors duration-100 last:border-b-0 hover:bg-muted/50 max-md:px-2.5 max-md:py-2" data-i="' + i + '">' +
            (sxBar ? '<span class="sxbar absolute inset-y-0 left-0 w-2 ' + sxBar + '"></span>' : '') +
            '<div class="top flex items-start gap-2 min-w-0">' + nameHTML(h) + chip + '<span class="mt ml-auto flex flex-none items-center gap-1.25 whitespace-nowrap text-[11px] text-muted-foreground max-md:text-[10.5px]">' + metaHTML(h) + '</span></div>' + sub + '</div>';
        }).join("");
      if (!persistent) drop.classList.remove("hidden");
    }

    function markHl() {
      drop.querySelectorAll(".row").forEach(function (it, i) {
        it.classList.toggle("hl", i === hl);
        if (i === hl) {
          it.classList.add("bg-muted/50");
          it.style.boxShadow = "inset 2px 0 0 #0aa7a0";
        } else {
          it.classList.remove("bg-muted/50");
          it.style.boxShadow = "";
        }
      });
    }

    function choose(i) {
      const h = list[i];
      if (!h) return;
      if (!persistent && !multi) drop.classList.add("hidden");
      onSelect(h);
      if (multi) {
        /* 多选添加：不占位、清空输入、保持展开，可连续添加；已选马由 excluded 排除 */
        input.value = "";
        selected = false;
        render("");
        input.focus();
      } else {
        setSel(h);
      }
    }

    /* 外部选中（左栏目录联动）：按对象或 id 选中，刷新 input 并触发 onSelect */
    function select(h) {
      if (h == null) return;
      if (typeof h !== "object") {
        const hs = horsesCache || [];
        const target = String(h);
        for (let i = 0; i < hs.length; i++) {
          if (String(hs[i].id) === target) { h = hs[i]; break; }
        }
      }
      if (h == null || typeof h !== "object") return;
      setSel(h);
      onSelect(h);
    }
    selFn = select;
    /* 对外刷新钩子：外部（如筛选条 tag 变化）重渲染下拉（排除已选），不重建实例、保留焦点 */
    el.__selRefresh = render;

    input.addEventListener("focus", function () {
      if (selected) { selected = false; input.value = ""; }
      render(input.value);
    });
    input.addEventListener("input", function () { selected = false; render(input.value); });
    if (clear) clear.addEventListener("click", function () { input.value = ""; selected = false; render(""); input.focus(); });
    input.addEventListener("keydown", function (e) {
      if (drop.classList.contains("hidden") || !list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); hl = (hl + 1) % list.length; markHl(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hl = (hl - 1 + list.length) % list.length; markHl(); }
      else if (e.key === "Enter") { e.preventDefault(); if (hl >= 0) choose(hl); }
      else if (e.key === "Escape") { if (!persistent) drop.classList.add("hidden"); input.blur(); }
    });
    drop.addEventListener("mousedown", function (e) {
      const it = e.target.closest ? e.target.closest(".row") : null;
      if (it) choose(parseInt(it.dataset.i, 10));
    });
    /* document 关闭监听去重：多次 init 只保留最新一个，避免累积（筛选条重建场景） */
    if (docClickHandler) document.removeEventListener("click", docClickHandler);
    docClickHandler = function (e) {
      if (!persistent && !wrap.contains(e.target)) drop.classList.add("hidden");
    };
    document.addEventListener("click", docClickHandler);

    return loadHorses(base).then(function (hs) {
      horses = hs;
      horsesCache = hs;
      cnt.textContent = hs.length;
      if (persistent) render(""); /* 常驻模式：加载后直接展示全部列表 */
      return hs;
    });
  }

  function getHorses() {
    return horsesCache || [];
  }

  /* 外部选中入口：转发给最近一次 init 的实例 */
  function select(h) {
    if (selFn) selFn(h);
  }
  function selectById(id) {
    select(id);
  }

  return { init, loadHorses, displayName, matches, getHorses, select, selectById };
})();
