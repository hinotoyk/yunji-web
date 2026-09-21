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
  /* 主名链 = 日文 → 英文 → 「母名の生年」兜底(母名也缺才退化 #id)；dbl=true 时主名后追加 港译(无则自译)，与主名相同/为空则跳过。双格式契约见 front/UI优化记录.md §64 */
  function nameHTML(h, dbl) {
    var names = [];
    /* 色块语言按内容判定（YJ.util.nameKind），与 profile 名字四格同口径：
     * 海外登録马的 馬名 是拉丁名（如 "Grand Warrior(JPN)"），不能再一律渲成日文配色 */
    if (h.馬名)            names.push({ key: YJ.util.nameKind(h.馬名), v: YJ.util.splitName(h.馬名).name });
    else if (h.欧字馬名)   names.push({ key: 'en', v: h.欧字馬名 });
    else {
      var fb = YJ.util.fallbackName(h);
      names.push({ key: String(fb).charAt(0) === '#' ? 'id' : 'miss', v: fb });
    }
    if (dbl) {
      var sub = h.香港馬名 || h.自译馬名;
      if (sub && sub !== names[0].v) names.push({ key: h.香港馬名 ? 'hk' : 'zh', v: sub });
    }
    var chips = names.map(function (n) {
      return '<span class="nblock ' + n.key + ' inline-block max-w-full truncate rounded-md px-2 py-0.5 text-[12.5px] leading-[1.7] max-md:px-1.5 max-md:text-[12px] font-semibold ' + NB[n.key] + '">' + esc(n.v) + '</span>';
    }).join("");
    return '<span class="names flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-[3px]">' + chips + '</span>';
  }

  let horsesCache = null;
  let cachePromise = null;
  let selFn = null; /* 当前 init 实例的 select（左栏目录联动用） */
  /* 点击外部关闭下拉：多实例（筛选条 出走马+人气+母父+骑手+调教师 共 5 个）共用一个
   * document 监听，实例注册表每次 init 时剔除已脱离 DOM 的旧实例，防泄漏 */
  let dropInstances = [];
  let docClickInstalled = false;

  /* ============ 路 D · basic.json 跨上下文共享缓存（OPTIMIZATION_PLAN §5.2） ============
   * 动机：profile 页 + 其内嵌 races / pedigree iframe 各自 fetch 一次 328KB 的 basic.json，
   *   同 tab 内最多 3~5 份重复请求（线上还要各付一个 must-revalidate 条件请求）。
   * 两级：① 内存 horsesCache（同一 JS 上下文，零成本）
   *       ② sessionStorage 原文（同一标签页的 iframe 之间同源共享 → 省掉后续 fetch）
   *   ⚠ sessionStorage 判定/降级沿用 bus.js:11-17 的踩坑结论：隐私模式或被站点禁用时
   *     访问属性就会抛，setItem 还可能 QuotaExceeded —— 探测一次，失败即整模块退回纯内存。
   * 失效：键名带版本号（字段口径变化 +1，旧条目自然作废）+ 写入超 1h（BASIC_TTL）作废重取 + 解析失败即删键；
   *       编辑台 init 与保存成功回调都会调 clearBasicCache() 立即清（editor.js 的 init()/save()；
   *       跨标签页的缓存各自隔离，只能等 1h TTL 或刷新——sessionStorage 载体选择的既定边界）。
   * 收益口径：这是「跨页/跨 iframe」优化，不是首屏优化（探针 §6 结论：单页只省 34~49ms）。 */
  const BASIC_V = "v1";
  const BASIC_MAX = 4 * 1024 * 1024;   /* 超过 4MB 的产物不进 sessionStorage（避免挤爆配额） */
  const BASIC_TTL = 60 * 60 * 1000;    /* 共享缓存寿命 1h（用户 2026-09-21 定）：同标签页长挂也能等到 CI 新数据 */
  const SS = (function () {
    try {
      const s = window.sessionStorage;
      const probe = "yj:probe";
      s.setItem(probe, "1");
      const ok = s.getItem(probe) === "1";
      s.removeItem(probe);
      return ok ? s : null;
    } catch (e) { return null; }         /* 不可用 → null，本模块全程只走内存 */
  })();

  function absUrl(url) {
    try { return new URL(String(url), document.baseURI || location.href).href; }
    catch (e) { return String(url); }
  }
  function basicKey(url) { return "yj:basic:" + BASIC_V + ":" + absUrl(url); }
  function readStore(url) {
    if (!SS) return null;
    const key = basicKey(url);
    try {
      const raw = SS.getItem(key);
      if (!raw) return null;
      const nl = raw.indexOf("\n");                 /* 存储格式 = 写入时间戳 + \n + 原文；无之前缀=旧格式一并作废 */
      const t = nl > 0 ? Number(raw.slice(0, nl)) : NaN;
      if (!isFinite(t) || Date.now() - t > BASIC_TTL) { SS.removeItem(key); return null; }
      const horses = parseHorses(raw.slice(nl + 1));
      if (!horses) SS.removeItem(key);   /* 结构不合法（截断/旧格式）→ 作废重取 */
      return horses;
    } catch (e) {
      try { SS.removeItem(key); } catch (e2) {}
      return null;
    }
  }
  function writeStore(url, text) {
    if (!SS || !text || text.length > BASIC_MAX) return;
    try { SS.setItem(basicKey(url), Date.now() + "\n" + text); } catch (e) { /* 配额满：静默降级为内存缓存 */ }
  }
  function horsesOf(d) {
    const horses = Array.isArray(d) ? d : (d && d.horses) || null;
    return Array.isArray(horses) ? horses : null;
  }
  function parseHorses(text) { return horsesOf(JSON.parse(text)) }

  async function loadHorses(base) {
    if (horsesCache) return horsesCache;      /* ① 本上下文内存命中 */
    if (cachePromise) return cachePromise;
    const url = base || YJ_DATA.url('basic.json');
    const shared = readStore(url);            /* ② 同标签页其它 iframe 已取过 → 直接用，不发请求 */
    if (shared) { horsesCache = shared; return shared; }
    cachePromise = (async function () {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      /* 取原文而非直接 .json()：原文才能塞进 sessionStorage；
       * 无 text() 的响应（测试替身等）退回 .json()，只是不写共享缓存。 */
      let horses, text = null;
      if (r && typeof r.text === "function") {
        text = await r.text();
        horses = parseHorses(text);
      } else {
        horses = horsesOf(await r.json());
      }
      if (!horses) throw new Error("basic.json 解析失败");
      horsesCache = horses;
      writeStore(url, text);
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

  /* 兜底显示名「母名の生年」与主名链统一取 YJ.util（§64 收口，原页内 fallbackName 已等值搬走）；
   * displayName 对外导出不变，现在多剥一层生产国尾缀 → 130 得 "Grand Warrior" 而非 "Grand Warrior(JPN)" */
  function displayName(h) {
    return YJ.util.mainName(h);
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
    /* items: 通用选项模式（筛选条维度下拉）：[{v,l,n}] 传入后不加载马匹数据，
     * 下拉行 = 色块名 + 场数，搜索/键盘/多选添加/排除已选等交互与选马器完全同款 */
    const items = opts.items || null;
    /* doubleName: 双格式马名（基本信息 PC 常驻列表 + mb 下拉用）——
     * 主名=日文(无则英文) + 副名=港译(无则自译)；其余实例不传即保持单格式 */
    const doubleName = !!opts.doubleName;
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
      if (h) input.value = displayName(h);   /* 主名链同源：剥尾缀 + 母名の生年兜底，不直取原始 馬名 */
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
      list = items
        ? items.filter(function (it) { return (!excluded || !excluded(it)) && (!q || String(it.l).toLowerCase().indexOf(q) >= 0); })
        : horses.filter(function (h) { return (!excluded || !excluded(h)) && (!q || matches(h, q)); });
      if (cnt) {
        cnt.textContent = q ? list.length : (items ? items.length : horses.length);
        cnt.classList.toggle("on", !!q);
        if (q) { cnt.classList.add("text-primary","bg-accent"); } else { cnt.classList.remove("text-primary","bg-accent"); }
      }
      hl = -1;
      /* 与正式版 testpage 一致：聚焦即展开全部列表（即使未输入） */
      if (!list.length) {
        drop.innerHTML = '<div class="empty px-3.5 py-4 text-center text-[12.5px] text-muted-foreground">' + (items ? '未找到匹配选项' : '未找到匹配的马匹') + '</div>';
        if (!persistent) drop.classList.remove("hidden");
        return;
      }
      /* items 模式行：与马匹行同款 .row 容器，名字用 jp 色块、右侧计数「n场」 */
      const rows = items
        ? list.map(function (it, i) {
            return '<div class="row relative cursor-pointer border-b border-border px-3.5 py-[9px] transition-colors duration-100 last:border-b-0 hover:bg-muted/50 max-md:px-2.5 max-md:py-2" data-i="' + i + '">' +
              '<div class="top flex items-center gap-2 min-w-0"><span class="nblock jp inline-block max-w-full truncate rounded-md px-2 py-0.5 text-[12.5px] leading-[1.7] max-md:px-1.5 max-md:text-[12px] font-semibold ' + NB.jp + '">' + esc(it.l) + '</span>' +
              '<span class="mt ml-auto flex flex-none items-center gap-1.25 whitespace-nowrap text-[11px] text-muted-foreground max-md:text-[10.5px]">' + (it.n != null ? it.n + '场' : '') + '</span></div></div>';
          }).join("")
        : list.map(function (h, i) {
          const m = q ? matchInfo(h, q) : null;
          const chip = (m && m.fromExtra) ? '<span class="chip mt-px flex-none rounded-full bg-accent px-[7px] py-[1.5px] text-[9.5px] font-semibold tracking-[.3px] text-accent-foreground">' + esc(m.label) + '</span>' : '';
          const sub = (m && m.fromExtra && m.key !== 'id') ? '<div class="sub mt-0.5 text-[11px] text-muted-foreground max-md:text-[10.5px]">' + esc(EXTRA_LABEL[m.key] || m.label) + '：' + esc(h[m.key]) + '</div>' : '';
          /* 性别左侧色条：淡蓝=牡、淡粉=牝，上下顶满整行、贴左；骟马/未知不渲染色条。
           * 当前性别走 YJ.util.sexOf 单一出处（与 profile 性别行、统计页同口径） */
          const sx = YJ.util.sexOf(h);
          const sxBar = sx === '牡' ? 'bg-[#C9EFFE]' : (sx === '牝' ? 'bg-[#FFDBD5]' : '');
          return '<div class="row relative cursor-pointer border-b border-border px-3.5 py-[9px] transition-colors duration-100 last:border-b-0 hover:bg-muted/50 max-md:px-2.5 max-md:py-2" data-i="' + i + '">' +
            (sxBar ? '<span class="sxbar absolute inset-y-0 left-0 w-2 ' + sxBar + '"></span>' : '') +
            '<div class="top flex items-start gap-2 min-w-0">' + nameHTML(h, doubleName) + chip + '<span class="mt ml-auto flex flex-none items-center gap-1.25 whitespace-nowrap text-[11px] text-muted-foreground max-md:text-[10.5px]">' + metaHTML(h) + '</span></div>' + sub + '</div>';
        }).join("");
      drop.innerHTML = '<div class="dhead border-b border-border bg-muted/35 px-3.5 pb-1.25 pt-[7px] text-[10.5px] tracking-[.5px] text-muted-foreground">' + (q ? '匹配 <b class="font-bold text-primary">' + list.length + '</b> ' + (items ? '项' : '匹') : (items ? '共 <b class="font-bold text-primary">' + items.length + '</b> 项' : '共 <b class="font-bold text-primary">' + horses.length + '</b> 匹')) + '</div>' + rows;
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
    /* 点击外部关闭：只注册到本模块唯一监听；persistent 常驻列表不注册 */
    if (!persistent) {
      dropInstances = dropInstances.filter(function (m) { return document.body.contains(m.el); });
      dropInstances.push({ el: el, close: function (e) {
        if (!wrap.contains(e.target)) drop.classList.add("hidden");
      } });
      if (!docClickInstalled) {
        docClickInstalled = true;
        document.addEventListener("click", function (e) {
          dropInstances.forEach(function (m) { m.close(e); });
        });
      }
    }

    /* items 模式：数据已在手，不加载马匹；compact 无 cnt 元素，需判空 */
    if (items) {
      if (cnt) cnt.textContent = items.length;
      if (persistent) render("");
      return Promise.resolve(items);
    }
    return loadHorses(base).then(function (hs) {
      horses = hs;
      horsesCache = hs;
      if (cnt) cnt.textContent = hs.length;
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

  /* 手动失效（数据更新后 / 排障用）：内存 + sessionStorage 一起清，下次 loadHorses 重新 fetch */
  function clearBasicCache() {
    horsesCache = null;
    cachePromise = null;
    if (!SS) return;
    const pre = "yj:basic:" + BASIC_V + ":";
    try {
      for (let i = SS.length - 1; i >= 0; i--) {
        const k = SS.key(i);
        if (k && k.indexOf(pre) === 0) SS.removeItem(k);
      }
    } catch (e) { /* 忽略：探测已确认可用，遍历期被清空属极端情形 */ }
  }

  return { init, loadHorses, displayName, matches, getHorses, select, selectById, clearBasicCache };
})();
