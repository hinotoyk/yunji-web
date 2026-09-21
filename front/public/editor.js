/* 云迹 · 编辑链路（YJ.editor）：M2a 五字段 + M2b 图片 + M2c 时间线人工节点；表单 + 校验 + 草稿 + 调 writer，纯前端、只被 edit.html 加载（D6）。
 * 写入落点只有两张人工表 data/manual_overrides.json / data/timeline_manual.json（官方抓取值永不手改）；
 * 生效靠 edit_server 的 merge 管道（D5），时间线不自动重算（§4.5）。
 * 图片（D8）：压缩全部在浏览器 canvas 里做完再 POST /photo —— 外链也先在浏览器里拉下来重压，服务端从不访问外网。
 * 出处：OPTIMIZATION_PLAN.md §4.2 / §4.3 / §4.4（图片段）/ §4.5（时间线段）。 */
window.YJ = window.YJ || {};
YJ.editor = (function () {
  "use strict";

  var esc = YJ.util.esc;
  var TABLE_PATH = "data/manual_overrides.json";   /* 白名单 1：字段 + photo */
  var TL_PATH = "data/timeline_manual.json";       /* 白名单 2：时间线人工节点（M2c） */
  var PHOTO_API = "/photo";                        /* M2b：multipart，服务端生成文件名 */
  var PHOTO_OWNER_TL = "timeline";                 /* 时间线节点图的文件名前缀（落盘 timeline-<n>.webp） */
  var DEFAULT_PORT = 8090;                          /* D13：单端口，静态服务同进程 */
  var PROBE_MS = 1800;

  /* D8 压缩口径：最大边缩进 1280px（profile 头像大图位 / 时间线图位都够清晰），目标 ≤100KB。
   * 质量先用两档扫描（0.93 高清档 / 0.72 常见分界）命中，未命中再在区间内二分，最多 7 次编码；
   * 仍超标则整幅再缩 82% 重来（最多 6 轮）。webp 优先，浏览器编不出 webp 才回 jpeg。 */
  var IMG_MAX_EDGE = 1280, IMG_TARGET = 100 * 1024;
  var IMG_Q_HI = 0.93, IMG_Q_LO = 0.30, IMG_Q_MID = 0.72, IMG_PROBES = 7;
  var IMG_SHRINK = 0.82, IMG_MAX_ROUNDS = 6;
  var KB = 1024;

  /* tags[].cat 六色（D9）：颜色值取自 front/pages/timeline.html 的 .tl-node / .tl-tag（那页只读参考，改色需同步）；
   * 本站不新增 CSS 类，故这里以 inline style 上色。顺序 = 常用在前。 */
  var TL_CATS = [
    { cat: "manual", cn: "人工节点（中性灰）", node: "#8a9096", bg: "rgba(138,144,150,.14)", fg: "#5c636a" },
    { cat: "first", cn: "级别首胜（青绿）", node: "#0aa7a0", bg: "rgba(10,167,160,.12)", fg: "#0b6b64" },
    { cat: "graded", cn: "重赏（深蓝）", node: "#0a3b7e", bg: "rgba(10,59,126,.09)", fg: "#0a3b7e" },
    { cat: "award", cn: "受赏（金）", node: "#dca026", bg: "rgba(220,160,38,.16)", fg: "#8f6408" },
    { cat: "gen", cn: "世代（橙）", node: "#e8742a", bg: "rgba(232,116,42,.13)", fg: "#b4530c" },
    { cat: "sire", cn: "父子制覇（红）", node: "#d5302a", bg: "rgba(213,48,42,.1)", fg: "#b02a25" }
  ];

  /* 五个可编辑字段（§4.4）：select 的枚举与 text 的 datalist 都从 basic.json 现值去重生成。
   * labels 只改显示不改存库值（存库「セ」，表单按 races 口径显示「セン」）。
   * 行序 = 台账定稿（2026-09-21 改案）的顺序：状态 → 马主 → 调教师 →（毛色 → 性別）；
   * 枚举控件的瓦片/下拉配置不变（tiles=true 的登録状態 用瓦片，其余下拉/datalist）。 */
  var FIELDS = [
    { key: "登録状態", kind: "select", tiles: true },
    { key: "馬主", kind: "text", list: true },
    { key: "調教師", kind: "text", list: true },
    { key: "毛色", kind: "select" },
    { key: "性別", kind: "select", labels: { "セ": "セン" } }
  ];

  /* ?tab= 直达：段名 → 页面里 [data-sechead] / #sec-<段名> 的锚点（fields 段含照片位） */
  var SECS = ["fields", "timeline"];

  /* 外观类名一律指到 theme.css 的 .yj-ed-* 组件（§2：可复用组件类进 @layer，JS 串里只留类名）。
   * 只有纯一次性排布才在串内直接写 utility。 */
  var BTN = "yj-ed-op";
  var BTN_DIS = "yj-ed-op";
  var BTN_PRIMARY = "yj-ed-op yj-ed-op--primary";
  var BTN_DANGER = "yj-ed-op yj-ed-op--danger";
  var BTN_GHOST = "yj-ed-op yj-ed-op--ghost";
  var INPUT = "yj-ed-in";
  var BADGE_PIN = "yj-ed-state yj-ed-state--pin";
  var BADGE_DIRTY = "yj-ed-state yj-ed-state--dry";
  var BADGE_WARN = "yj-ed-state yj-ed-state--dry";
  var TIP = "text-[11px] text-muted-foreground";
  /* 台账形态（profile 式）：一行一字段 + 照片位；类名一律完整字面量（content 扫得到 → @layer 不裁） */
  var VBADGE = "yj-ed-vbadge";
  var ROWEDIT_FOOT = "mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/40 px-3 py-2";

  var state = {
    online: false, port: DEFAULT_PORT,
    horses: [], byId: {}, table: {},
    horse: null, draft: {}, note: "", saving: false, report: null, err: "",
    /* 台账渲染态：editing = 正在行内编辑的字段键（同时只开一行，备注输入因此只有一份 #noteInput） */
    editing: "",
    /* M2b 图片草稿：mode "" = 未改 / set = 写成 list / remove = 恢复官方值（删键）；open = 入库面板展开 */
    photos: { mode: "", open: false, draft: [], busy: false, meta: {}, log: [], err: "", drag: -1, url: "" },
    /* M2c 时间线：table = 源表快照（保留 _readme 等顶层键），events = 工作副本，edit = 正在新增/编辑的节点 */
    tl: { table: {}, events: [], loaded: false, dirty: false, busy: false, edit: null,
      err: "", report: null, del: -1, log: [] }
  };

  /* ---------------- writer 抽象（§4.2）：日后加 githubWriter 只需换这一个对象 ---------------- */
  function origin() { return "http://127.0.0.1:" + state.port; }

  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : null;
    }, function () { return null; });
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: { ok: false, error: "响应不是 JSON（HTTP " + r.status + "）" } }; });
    }, function () {
      return { status: 0, body: { ok: false, error: "连不上 edit_server" } };
    });
  }

  var localWriter = {
    name: "local",
    saveJSON: function (relPath, obj) { return postJSON(origin() + "/file", { path: relPath, json: obj }); },
    /* §4.2 writer.savePhoto(file)：一期 multipart（二期 githubWriter 换 base64，签名不变）。
     * 只提交**浏览器端已压缩**的 blob；filename 纯给人看，真名由服务端按魔数生成 <id>-<n>.<ext>。 */
    savePhoto: function (blob, owner) {
      var fd = new FormData();
      fd.append("id", String(owner || "misc"));
      fd.append("file", blob, "compressed." + extOf(blob && blob.type));
      return fetch(origin() + PHOTO_API, { method: "POST", body: fd }).then(function (r) {
        return r.json().then(function (j) { return { status: r.status, body: j }; },
          function () { return { status: r.status, body: { ok: false, error: "图片响应不是 JSON（HTTP " + r.status + "）" } }; });
      }, function () {
        return { status: 0, body: { ok: false, error: "连不上 edit_server，图片未入库" } };
      });
    }
  };
  var writer = localWriter;

  /* 端口可配：?port= > localStorage['yj.edit.port'] > 8090 */
  function resolvePort() {
    var q = new URLSearchParams(location.search).get("port");
    var ls = null;
    try { ls = localStorage.getItem("yj.edit.port"); } catch (e) { /* 禁 storage 时忽略 */ }
    var p = q || ls;
    return (p && /^\d{2,5}$/.test(p)) ? p : DEFAULT_PORT;
  }

  function probe() {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, PROBE_MS) : null;
    return fetch(origin() + "/healthz", { cache: "no-store", signal: ctl && ctl.signal }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.ok ? r.text() : "";
    }, function () { if (timer) clearTimeout(timer); return ""; }).then(function (t) {
      state.online = (String(t).trim() === "ok");
      return state.online;
    });
  }

  /* 读人工表：在线读源表（最新），离线退回 dist 副本（只读展示） */
  function loadTable() {
    var url = (state.online ? origin() + "/" + TABLE_PATH : YJ_DATA.url("manual_overrides.json")) + "?ts=" + Date.now();
    return getJSON(url).then(function (o) { return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; });
  }

  /* ---------------- 枚举 / datalist：现值去重，按出现次数降序，空值殿后 ---------------- */
  function distinct(key, dropEmpty) {
    var c = {};
    state.horses.forEach(function (h) {
      var v = h[key];
      v = (v === null || v === undefined) ? "" : String(v);
      if (!v && dropEmpty) return;
      c[v] = (c[v] || 0) + 1;
    });
    return Object.keys(c).sort(function (a, b) {
      if (!a) return 1; if (!b) return -1;
      return c[b] - c[a] || (a < b ? -1 : 1);
    });
  }

  function optLabel(f, v) {
    if (!v) return "（空）";
    var shown = (f.labels && f.labels[v]) || v;
    var cn = YJ.i18n.e(f.key, v);
    return cn && cn !== shown ? shown + "（" + cn + "）" : shown;
  }

  function fieldOf(key) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) return FIELDS[i];
    return null;
  }

  /* ---------------- 人工保存模型：overrides[id][字段]=人工值；_orig=首次保存时官方值；恢复官方值=删键 ---------------- */
  function entryOf(id) { var e = state.table[String(id)]; return (e && typeof e === "object") ? e : null; }
  function pinned(id, key) {
    var e = entryOf(id);
    return e && Object.prototype.hasOwnProperty.call(e, key) && String(key)[0] !== "_" ? e[key] : undefined;
  }
  function origOf(id, key) {
    var e = entryOf(id), o = e && e._orig;
    return (o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key)) ? o[key] : undefined;
  }
  function valOf(horse, key) {
    var v = horse ? horse[key] : "";
    return (v === null || v === undefined) ? "" : String(v);
  }
  /* 表单值 = 草稿 ?? 人工保存值 ?? 生效值（basic.json 合并后值） */
  function currentValue(f) {
    var key = f.key;
    if (Object.prototype.hasOwnProperty.call(state.draft, key)) {
      var d = state.draft[key];
      return d === null ? "" : String(d);
    }
    var p = pinned(state.horse.id, key);
    if (p !== undefined) return String(p);
    return valOf(state.horse, key);
  }
  function isDirty(f) { return Object.prototype.hasOwnProperty.call(state.draft, f.key); }
  function hasDraft() { return Object.keys(state.draft).length > 0; }
  function hasChanges() { return hasDraft() || photoDirty(); }
  /* 不含草稿的「已生效值」：人工保存值优先，否则官方抓取值（变更摘要与状态条的唯一口径） */
  function savedVal(key) {
    var p = pinned(state.horse.id, key);
    return p !== undefined ? String(p) : valOf(state.horse, key);
  }
  /* 一个字段（或整页）当前处于哪一档：saved（已存人工值）/ pending（待保存）/ idle（与官方一致） */
  function fieldState(key) {
    var f = fieldOf(key);
    if (isDirty(f)) return "pending";
    return pinned(state.horse.id, key) !== undefined ? "saved" : "idle";
  }
  var STATE_WORD = { saved: "已保存", pending: "待保存", idle: "与官方一致" };
  /* 保存清单里 photo 的显示（数组直接 String() 会糊成一长串路径） */
  function pinValueText(k, v) {
    if (k !== "photo") return (v === "" || v === null || v === undefined) ? "（空）" : String(v);
    var l = normList(v);
    return l.length ? l.length + " 张（" + photoName(l[0]) + (l.length > 1 ? "…" : "") + "）" : "确无图片";
  }
  function noteOf(id) { var e = entryOf(id); return e && e._note ? String(e._note) : ""; }
  function noteChanged() { return !!state.note && state.note !== noteOf(state.horse && state.horse.id); }

  function controlHTML(f) {
    var v = currentValue(f);
    if (f.kind === "select" && f.tiles) {
      /* cand3 签名：枚举做瓦片。点一下 = 把该值写进 state.draft，与下拉选中同一套语义、零分支差异 */
      return '<div class="flex flex-wrap gap-2" role="group" aria-label="' + esc(YJ.i18n.t(f.key)) + '">' +
        distinct(f.key, false).map(function (x) {
          var cn = YJ.i18n.e(f.key, x);
          return '<button type="button" class="yj-ed-tile min-w-[88px] flex-1" data-f="' + esc(f.key) + '" data-v="' + esc(x) +
            '" aria-pressed="' + (x === v) + '"><b class="block text-[13.5px] font-semibold leading-tight">' + esc(optLabel(f, x)) + "</b>" +
            '<span class="mt-1 block text-[10px] tracking-[.4px] text-muted-foreground">' +
              esc(x === "" ? "该栏留空" : (cn && cn !== x ? cn : "存库原值")) + "</span></button>";
        }).join("") + "</div>";
    }
    if (f.kind === "select") {
      return '<select data-f="' + esc(f.key) + '" class="' + INPUT + ' font-normal">' +
        distinct(f.key, false).map(function (x) {
          return '<option value="' + esc(x) + '"' + (x === v ? " selected" : "") + ">" + esc(optLabel(f, x)) + "</option>";
        }).join("") + "</select>";
    }
    var opts = distinct(f.key, true);
    var html = '<input data-f="' + esc(f.key) + '" list="dl-' + esc(f.key) + '" value="' + esc(v) +
      '" class="' + INPUT + '" autocomplete="off" placeholder="留空 = 官方值/无">';
    if (f.list) {
      html += '<datalist id="dl-' + esc(f.key) + '">' + opts.map(function (x) {
        return '<option value="' + esc(x) + '"></option>';
      }).join("") + "</datalist>" +
        '<div class="mt-1 text-[10.5px] text-muted-foreground">补全表 ' + opts.length + " 项（现值去重），也可直接填新值或留空</div>";
    }
    return html;
  }

  /* 值位徽章（台账只读形态）：色值单一出处 = pages/profile.html 的 stBadge / sexBadge
   * （§48：全站仅两处使用，不做第三份抽离，改色两处同步）。不引入新色值，只复用既有指定色块。 */
  function badgeHTML(f, v) {
    if (!v) return '<span class="text-muted-foreground/60">（空）</span>';
    var shown = (f.labels && f.labels[v]) || v;
    if (f.key === "登録状態") {
      return v === "現役" ? '<span class="' + VBADGE + ' bg-accent text-accent-foreground">现役</span>'
        : '<span class="' + VBADGE + ' bg-muted font-medium text-muted-foreground">' + esc(YJ.i18n.e("登録状態", v)) + "</span>";
    }
    if (f.key === "性別") {
      if (v === "牡") return '<span class="' + VBADGE + ' bg-[#C9EFFE] text-[#0B5A8C]">♂ 牡</span>';
      if (v === "牝") return '<span class="' + VBADGE + ' bg-[#FFDBD5] text-[#B03A30]">♀ 牝</span>';
      if (v === "セ" || v === "セン") return '<span class="' + VBADGE + ' bg-[#EFEFEF] text-[#5A5A5A]">⚲ ' + esc(shown) + "</span>";
    }
    return esc(shown);
  }

  /* 编辑备注（_note）：整匹马一条，故「同时只开一行」的台账里最多出现一个 #noteInput */
  function noteInputHTML() {
    var note = state.note !== "" ? state.note : noteOf(String(state.horse.id));
    return '<input id="noteInput" value="' + esc(note) + '" class="' + INPUT + ' font-normal" autocomplete="off" ' +
      'placeholder="为什么不信官方抓取值？（例：netkeiba 滞后，2026-05 起已去势）· 有人工值时必填">';
  }
  /* 备注行：没有字段处于行内编辑态时常显（只改图片也要能写备注） */
  function noteRowHTML() {
    if (state.editing) return "";
    return '<div class="yj-ed-row" data-row="_note">' +
      '<span class="yj-ed-row-k">编辑备注<code class="yj-ed-lbl mt-0.5 block">_note</code></span>' +
      '<span class="min-w-0 flex-1">' + noteInputHTML() + "</span></div>";
  }

  /* 官方值对照的 <b>：已存人工值 → _orig 快照（划线，表示「已被人工值替代」）；
   * 待恢复官方值 → 不划线（即将回到它）；从未人工保存 → 官方抓取值本身 */
  function officialHTML(key) {
    var pin = pinned(state.horse.id, key), orig = origOf(state.horse.id, key);
    if (pin === undefined) return "<b>" + (valOf(state.horse, key) === "" ? "（空）" : esc(valOf(state.horse, key))) + "</b>";
    if (!orig) return "<b>无快照（早期人工值）</b>";
    var undo = state.draft[key] === null;
    return '<b class="' + (undo ? "" : "yj-ed-struck") + '">' + (orig === "" ? "（空）" : esc(orig)) + "</b>";
  }

  /* 台账的一行（照 profile 的基本资料表）：label 左灰 + 值右黑 + 发丝分隔 + 行尾徽章与操作；
   * 点「编辑」→ 值位就地换成控件，下一行给备注与「按此值保存」（数据侧仍写 state.draft，与卡堆时期同一套） */
  function rowHTML(f) {
    var id = state.horse.id, key = f.key;
    var pin = pinned(id, key);
    var st = fieldState(key), open = state.editing === key;
    var eff = valOf(state.horse, key);
    var undo = st === "pending" && state.draft[key] === null;
    var pill = st === "saved" ? '<span class="' + BADGE_PIN + '">已保存</span>'
      : st === "pending" ? '<span class="' + BADGE_DIRTY + '">' + (undo ? "待恢复官方值" : "待保存") + "</span>"
        : '<span class="yj-ed-state">与官方一致</span>';
    /* 灰字对照：已存人工值 → 保存前官方值；待保存 → 当前官方抓取值；与官方一致 → 不占位 */
    var cmp = pin !== undefined
      ? '<span class="yj-ed-row-orig">保存前 ' + officialHTML(key) + "</span>"
      : st === "pending"
        ? '<span class="yj-ed-row-orig">官方 ' + (eff === "" ? "（空）" : esc(eff)) + "</span>"
        : "";
    var value = '<span class="yj-ed-row-v">' + (undo
      ? '<span class="text-muted-foreground">保存后不再强制人工值</span>' : badgeHTML(f, currentValue(f))) + "</span>";
    /* 只读态右侧：恢复官方值（已存人工值时）+ 编辑入口 */
    var acts = '<span class="yj-ed-row-acts">' +
      (pin !== undefined ? '<button data-unpin="' + esc(key) + '" class="' + BTN + ' yj-ed-op--danger" type="button">恢复官方值</button>' : "") +
      '<button data-editrow="' + esc(key) + '" class="' + BTN + '" type="button">编辑</button></span>';
    var head = '<span class="yj-ed-row-k">' + esc(key) +
      '<span class="yj-ed-lbl mt-0.5 block">' + esc(YJ.i18n.t(key)) + "</span></span>";
    var body = open
      ? '<span class="min-w-0 flex-1">' + controlHTML(f) + "</span>" + pill +
        '<span class="yj-ed-rowedit">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span class="yj-ed-lbl flex-none">编辑备注 · _note</span>' +
            '<span class="min-w-[180px] flex-1">' + noteInputHTML() + "</span></div>" +
          '<div class="' + ROWEDIT_FOOT + '">' +
            '<div class="yj-ed-official"><span class="yj-ed-lbl mr-1">生效值</span><b>' + (eff ? esc(eff) : "（空）") + "</b>" +
              '<span class="mx-2 opacity-40">·</span><span class="yj-ed-lbl mr-1">' +
              (pin !== undefined ? "保存前官方值" : "官方抓取值") + "</span>" + officialHTML(key) + "</div>" +
            '<div class="flex flex-none items-center gap-1.5">' +
              '<button data-lock="' + esc(key) + '" class="' + BTN_PRIMARY + '" type="button">按此值保存</button>' +
              (pin !== undefined ? '<button data-unpin="' + esc(key) + '" class="' + BTN + ' yj-ed-op--danger" type="button">恢复官方值</button>' : "") +
              '<button data-canceledit="1" class="' + BTN + '" type="button">取消</button></div>' +
          "</div></span>"
      : value + cmp + pill + acts;
    return '<div class="yj-ed-row' + (st === "saved" ? " yj-ed-row--pin" : st === "pending" ? " yj-ed-row--dry" : "") +
      '" data-row="' + esc(key) + '">' + head + body + "</div>";
  }

  function formHTML() {
    if (!state.horse) return '<div class="hint-empty">先选匹马再编辑。</div>';
    var id = String(state.horse.id), e = entryOf(id);
    var others = e ? Object.keys(e).filter(function (k) { return k[0] !== "_" && k !== "photo" && !fieldOf(k); }) : [];
    var othersHTML = others.length ? '<div class="yj-ed-row-orig mt-2 rounded-lg border border-border bg-card px-3 py-2">' +
      "本马另有非本表单字段 " + others.map(function (k) { return "<b>" + esc(k) + "</b>=" + esc(String(e[k])); }).join("、") +
      "（保存会原样保留）</div>" : "";
    return '<div class="yj-ed-ledger">' + FIELDS.map(rowHTML).join("") + noteRowHTML() + "</div>" + othersHTML;
  }

  /* 报头（一马一屏）：马名 + 别名 + ID + 上一匹/下一匹 + 5 段状态条 + 副信息 */
  function mastHTML() {
    if (!state.horse) {
      return '<div class="flex items-baseline gap-2.5"><span class="yj-ed-mk">雲</span>' +
        '<span class="text-[19px] font-bold">云迹编辑台</span>' +
        '<span class="yj-ed-lbl">从左侧列表选匹马，或直接搜索马名 / 马主 / 调教师 / NK-ID</span></div>';
    }
    var h = state.horse;
    var alias = h.自译馬名 || h.香港馬名 || "";
    return '<div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.5px] text-muted-foreground">' +
        '<i class="h-1.5 w-1.5 flex-none rounded-full ' + (state.online ? "bg-primary" : "bg-muted-foreground") + '"></i>' +
        (state.online ? "edit_server 在线 · 写入 data/manual_overrides.json" : "edit_server 离线 · 只有 dist 只读副本") +
      "</div>" +
      '<div class="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">' +
        '<h1 class="text-[26px] font-bold leading-tight tracking-[-.5px] max-md:text-[21px]">' + esc(YJ.util.mainName(h)) + "</h1>" +
        (alias || h.欧字馬名 ? '<div class="min-w-0 pb-1">' +
          (alias ? '<b class="block truncate text-[13.5px] font-semibold text-accent-foreground">' +
            '<span class="mr-1.5 inline-block h-[2px] w-4 flex-none rounded bg-primary align-middle"></span>' + esc(alias) + "</b>" : "") +
          (h.欧字馬名 ? '<span class="mt-0.5 block truncate text-[10.5px] uppercase tracking-[1px] text-muted-foreground">' + esc(h.欧字馬名) + "</span>" : "") +
          "</div>" : "") +
        '<span class="pb-1.5 text-[11px] text-muted-foreground">NK-ID <b class="font-semibold text-secondary-foreground">' + esc(h.nk_id || "—") +
          "</b> · 台账 <b class=\"font-semibold text-secondary-foreground\">#" + esc(String(h.id).padStart(3, "0")) + "</b></span>" +
        '<div class="ml-auto flex flex-none items-center gap-1.5 pb-0.5">' +
          '<a class="' + BTN + '" href="profile.html?horse=' + esc(String(h.id)) + '" target="_blank">在资料页核对 ↗</a>' +
          '<button data-nav="-1" class="yj-ed-nav" type="button" aria-label="上一匹">‹</button>' +
          '<button data-nav="1" class="yj-ed-nav" type="button" aria-label="下一匹">›</button>' +
        "</div>" +
      "</div>" +
      '<div class="mt-3 flex gap-1">' + FIELDS.map(function (f) {
        var st = fieldState(f.key);
        return '<div class="yj-ed-seg5' + (st === "saved" ? " yj-ed-seg5--pin" : st === "pending" ? " yj-ed-seg5--dry" : "") + '">' +
          '<span class="block truncate text-[10px] font-bold tracking-[.6px] ' +
            (st === "saved" ? "text-accent-foreground" : st === "pending" ? "text-chart3" : "text-muted-foreground") + '">' +
            esc(YJ.i18n.t(f.key)) + "</span>" +
          '<span class="mt-0.5 block text-[9.5px] tracking-[.3px] text-muted-foreground max-md:hidden">' + STATE_WORD[st] + "</span></div>";
      }).join("") + "</div>" +
      '<div class="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">' +
        "<span>母名 <b class=\"font-semibold text-secondary-foreground\">" + esc(h.母名 || "—") + "</b></span>" +
        "<span>母父 <b class=\"font-semibold text-secondary-foreground\">" + esc(h.母父 || "—") + "</b></span>" +
        "<span>出生 <b class=\"font-semibold text-secondary-foreground\">" + esc(h.生年月日 || "—") + "</b></span>" +
        "<span>" + esc(h.産地 || "—") + "</span>" +
        "<span>牧场 <b class=\"font-semibold text-secondary-foreground\">" + esc(h.生産牧場 || "—") + "</b></span>" +
        "<span>成绩 <b class=\"font-semibold text-secondary-foreground\">" + esc(h.通算成績 || "—") + "</b></span>" +
      "</div>";
  }

  /* 变更摘要（右栏 / MB 吸底条）：本匹待保存项 + 图片 + 备注，全部只读派生 */
  function summaryHTML() {
    if (!state.horse) return '<div class="yj-ed-lbl">变更摘要 · 本匹</div><div class="mt-1 text-[11.5px] text-muted-foreground">未选马。</div>';
    var rows = [];
    FIELDS.forEach(function (f) {
      if (!isDirty(f)) return;
      var to = state.draft[f.key];
      rows.push(to === null
        ? '<div class="yj-ed-diff"><b class="flex-none text-destructive">' + esc(YJ.i18n.t(f.key)) + "</b>" +
          '<span class="min-w-0 truncate text-muted-foreground">恢复官方值（不再强制人工值）</span></div>'
        : '<div class="yj-ed-diff"><b class="flex-none text-chart3">' + esc(YJ.i18n.t(f.key)) + "</b>" +
          '<span class="min-w-0 truncate text-muted-foreground">' + (savedVal(f.key) ? esc(savedVal(f.key)) : "（空）") +
          ' → </span><span class="min-w-0 truncate font-semibold text-secondary-foreground">' + (to === "" ? "（空）" : esc(String(to))) + "</span></div>");
    });
    if (photoMode() === "set") {
      var n = workingPhotos().length;
      rows.push('<div class="yj-ed-diff"><b class="flex-none text-chart3">图片</b><span class="min-w-0 truncate font-semibold text-secondary-foreground">' +
        (n ? "保存 " + n + " 张" : "确无图片（photo: []）") + "</span></div>");
    } else if (photoMode() === "remove") {
      rows.push('<div class="yj-ed-diff"><b class="flex-none text-destructive">图片</b><span class="min-w-0 truncate text-muted-foreground">恢复官方值</span></div>');
    }
    if (noteChanged()) {
      rows.push('<div class="yj-ed-diff"><b class="flex-none text-chart3">备注</b><span class="min-w-0 truncate font-semibold text-secondary-foreground">' +
        (esc(state.note) || "（空）") + "</span></div>");
    }
    return '<div class="yj-ed-lbl">变更摘要 · 本匹<span class="ml-1.5 font-normal normal-case tracking-normal">' +
      (rows.length ? rows.length + " 处待保存" : "无改动") + "</span></div>" +
      (rows.length ? '<div class="mt-1.5 space-y-1">' + rows.join("") + "</div>"
        : '<div class="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">五个字段与图片都跟官方值一致，改一行台账或照片位才会进这里。</div>');
  }

  /* 右栏「生效预览」：把「保存后资料页到底显示什么」就地给出（与 currentValue 同源，只读派生） */
  function previewHTML() {
    if (!state.horse) return "";
    return '<div class="yj-ed-lbl">生效预览 · 资料页读数</div>' +
      '<div class="mt-2 space-y-1">' + FIELDS.map(function (f) {
        var v = currentValue(f);
        var manual = pinned(state.horse.id, f.key) !== undefined || isDirty(f);
        var shown = YJ.i18n.e(f.key, v) || v;
        return '<div class="flex items-baseline gap-2 text-[11.5px]"><span class="w-[68px] flex-none truncate text-muted-foreground">' +
          esc(YJ.i18n.t(f.key)) + '</span><span class="min-w-0 flex-1 truncate font-semibold ' +
          (v ? (manual ? "text-accent-foreground" : "text-secondary-foreground") : "text-muted-foreground/60") + '">' +
          esc(shown || "（空）") + '</span><span class="flex-none rounded px-1 py-px text-[9.5px] font-bold ' +
          (manual ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground") + '">' +
          (manual ? "人工" : "官方") + "</span></div>";
      }).join("") + "</div>" +
      '<div class="' + TIP + ' mt-1.5 leading-[1.5]">「人工」= 走 manual_overrides，「官方」= 走抓取值；改完保存即以此刷新。</div>';
  }

  function pinIds() {
    return Object.keys(state.table).filter(function (k) {
      var e = state.table[k];
      return k[0] !== "_" && e && typeof e === "object" && Object.keys(e).some(function (x) { return x[0] !== "_"; });
    });
  }

  /* 右栏「保存清单」：跨马列已写入人工表的条目（只读 + 点击定位；恢复官方值在字段卡里做） */
  function pinsHTML() {
    var ids = pinIds();
    if (!ids.length) return '<div class="hint-empty">还没有人工保存值。<br>在左边改一格，卡片底部就会出现「按此值保存」。</div>';
    return ids.map(function (id) {
      var e = state.table[id], h = state.byId[id];
      var keys = Object.keys(e).filter(function (k) { return k[0] !== "_"; });
      var chips = keys.map(function (k) {
        return '<span class="yj-ed-kv">' + esc(YJ.i18n.t(k)) + "=" + esc(pinValueText(k, e[k])) + "</span>";
      }).join("");
      var orig = (e._orig && typeof e._orig === "object") ? Object.keys(e._orig).map(function (k) {
        return esc(YJ.i18n.t(k)) + "→" + esc(pinValueText(k, e._orig[k]));
      }).join("、") : "";
      var cur = String(state.horse && state.horse.id) === String(id);
      return '<div class="yj-ed-entry' + (cur ? " bg-accent/45" : "") + '">' +
        '<div class="flex items-baseline gap-2 min-w-0">' +
        '<button data-goto="' + esc(id) + '" class="min-w-0 truncate text-left text-[12.5px] font-bold text-accent-foreground" type="button">' +
          esc(h ? YJ.util.mainName(h) : "#" + id) + "</button>" +
        '<span class="flex-none text-[9.5px] font-bold tracking-[.5px] text-muted-foreground">#' + esc(String(id).padStart(3, "0")) + "</span>" +
        '<span class="ml-auto flex-none text-[10px] font-semibold tabular-nums text-muted-foreground">' + keys.length + " 项</span></div>" +
        '<div class="mt-1.5 flex flex-wrap gap-y-1">' + chips + "</div>" +
        (e._note ? '<div class="mt-1.5 text-[11px] leading-[1.5] text-muted-foreground"><b class="yj-ed-lbl mr-1">备注</b>' + esc(String(e._note)) + "</div>" : "") +
        (orig ? '<div class="mt-0.5 text-[11px] leading-[1.5] text-muted-foreground/80"><b class="yj-ed-lbl mr-1">原值</b>' + orig + "</div>" : "") +
        "</div>";
    }).join("");
  }

  function stepLine(name, st) {
    if (!st) return "";
    var detail = st.detail || (st.files && st.files.length ? st.files.join("、") : "") ||
      (st.backup ? "备份 " + st.backup : "") || (st.bytes ? st.bytes + " B" : "");
    return '<div class="flex items-start gap-2 text-[11.5px]">' +
      '<span class="flex-none font-semibold ' + (st.ok ? "text-primary" : "text-destructive") + '">' + (st.ok ? "✔" : "✘") + " " + name + "</span>" +
      '<span class="flex-none tabular-nums text-muted-foreground">' + (st.seconds || 0).toFixed(2) + "s</span>" +
      '<span class="min-w-0 break-all text-muted-foreground">' + esc(detail) + "</span></div>";
  }

  function reportHTML() {
    if (state.err) return '<div class="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">' + esc(state.err) + "</div>";
    var r = state.report;
    if (!r) return '<div class="text-[11.5px] text-muted-foreground">保存 = ① 写源表 → ② 跑 merge_basic → ③ 同步 dist/data（约 1~3s）。</div>';
    var s = r.steps || {};
    return stepLine("① 写源表", s.write) + stepLine("② merge", s.merge) + stepLine("③ 同步 dist", s.sync) +
      (r.ok ? '<div class="mt-1 text-[11.5px] text-primary">已生效（共 ' + (r.total_seconds || 0).toFixed(2) + "s）。</div>"
        : '<div class="mt-1 text-[11.5px] text-destructive">管道未全绿：' + esc(r.error || "") + "</div>");
  }

  /* ================= M2b · 图片（D8：canvas 重压 → POST /photo → overrides[id].photo） ================= */

  function extOf(mime) {
    return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  }
  function kb(n) {
    if (n === null || n === undefined || isNaN(n)) return "?";
    return n >= 10 * KB ? Math.round(n / KB) + " KB" : (n >= KB ? (n / KB).toFixed(1) + " KB" : n + " B");
  }
  function mimeShort(t) { return String(t || "").replace(/^image\//, "").toUpperCase(); }

  /* 站内图（data/ 前缀）经 YJ_DATA.url 解析 —— 与 profile 头像同一口径（AGENTS §3 数据访问） */
  function photoSrc(p) {
    var s = String(p || "");
    return s.indexOf("data/") === 0 ? YJ_DATA.url(s) : s;
  }
  function photoName(p) { var s = String(p || ""); return s.slice(s.lastIndexOf("/") + 1); }

  /* photo 契约：数组（[] = 人工判定「确无图片」）；后端兼容字符串（apply_overrides 只跳 None/""） */
  function normList(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x; }).map(String);
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  }

  /* ---------------- canvas 压缩（零依赖） ---------------- */
  var _webpOK = null;
  function webpEncodable() {
    if (_webpOK === null) {
      try {
        var c = document.createElement("canvas");
        c.width = c.height = 1;
        _webpOK = (c.toDataURL("image/webp") || "").indexOf("data:image/webp") === 0;
      } catch (e) { _webpOK = false; }
    }
    return _webpOK;
  }

  function canvasBlob(cvs, type, q) {
    return new Promise(function (resolve) {
      if (!cvs || !cvs.toBlob) { resolve(null); return; }
      cvs.toBlob(function (b) {
        if (!b) { resolve(null); return; }
        /* 浏览器不支持 webp 编码时会静默回吐 png → 视为不可用，让上层换 jpeg */
        if (type === "image/webp" && b.type !== "image/webp") { resolve(null); return; }
        resolve(b);
      }, type, q);
    });
  }

  function decodeImage(src) {
    var isBlob = typeof src !== "string";
    var url = isBlob ? URL.createObjectURL(src) : src;
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () {
        if (isBlob) URL.revokeObjectURL(url);
        reject(new Error("解码失败：浏览器读不出这张图（格式不支持或文件损坏）"));
      };
      im.decoding = "async";
      im.src = url;
    }).then(function (im) {
      im._objUrl = isBlob ? url : "";
      return im;
    });
  }
  function releaseImage(im) { if (im && im._objUrl) { try { URL.revokeObjectURL(im._objUrl); } catch (e) { /* ignore */ } } }

  /* 缩放绘制：>2× 的大比例缩放逐级折半（一步抽采会起锯齿/摩尔纹），JPEG 先铺白底（无 alpha，别烧成黑块） */
  function paint(img, w, h, flatten) {
    var cw = img.naturalWidth || img.width, ch = img.naturalHeight || img.height;
    var src = img;
    while (cw / 2 >= w && ch / 2 >= h && cw > 2 && ch > 2) {
      var half = document.createElement("canvas");
      half.width = Math.max(1, Math.round(cw / 2));
      half.height = Math.max(1, Math.round(ch / 2));
      var hx = half.getContext("2d");
      hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = "high";
      hx.drawImage(src, 0, 0, half.width, half.height);
      src = half; cw = half.width; ch = half.height;
    }
    var cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    var ctx = cvs.getContext("2d");
    if (flatten) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return cvs;
  }

  /* 清晰度优先：两档扫描（0.93 / 0.72）常一步命中，未命中再二分；留下最小的一张当兜底 */
  function encodeSearch(cvs, type, target) {
    var lo = IMG_Q_LO, hi = IMG_Q_HI, best = null, bestQ = 0, smallest = null, tried = 0;
    function nextQ() {
      if (tried === 0) return hi;
      if (tried === 1) return IMG_Q_MID;
      return Math.round((lo + hi) / 2 * 100) / 100;
    }
    function step() {
      if (tried >= IMG_PROBES || hi - lo < 0.02) {
        return Promise.resolve({ best: best, q: bestQ, smallest: smallest, unsupported: false });
      }
      var q = nextQ(); tried++;
      return canvasBlob(cvs, type, q).then(function (b) {
        if (tried === 1 && !b) return { best: null, q: 0, smallest: null, unsupported: true };
        if (b) {
          if (!smallest || b.size < smallest.size) smallest = b;
          if (b.size <= target) {
            if (!best || b.size > best.size) { best = b; bestQ = q; }
            lo = Math.max(lo, q);
          } else hi = Math.min(hi, q);
        } else hi = Math.min(hi, q);
        return step();
      });
    }
    return step();
  }

  /* src: Blob | File | dataURL/URL 字符串 → { blob, type, w, h, quality, rounds, over, fromBytes, toBytes } */
  function compressImage(src, opts) {
    opts = opts || {};
    var maxEdge = opts.maxEdge || IMG_MAX_EDGE, target = opts.target || IMG_TARGET;
    var fromBytes = (src && typeof src === "object" && src.size) ? src.size : 0;
    return decodeImage(src).then(function (im) {
      var w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
      if (!w0 || !h0) { releaseImage(im); throw new Error("图片尺寸为 0"); }
      var types = webpEncodable() ? ["image/webp", "image/jpeg"] : ["image/jpeg"];
      var scale = Math.min(1, maxEdge / Math.max(w0, h0));
      var round = 0, fallback = null;

      function attempt() {
        var w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
        function tryType(i) {
          var type = types[i];
          if (!type) return Promise.resolve(null);
          return encodeSearch(paint(im, w, h, type === "image/jpeg"), type, target).then(function (r) {
            if (r.unsupported) return tryType(i + 1);
            if (r.best) return { blob: r.best, type: type, w: w, h: h, quality: r.q, rounds: round, over: false };
            if (r.smallest && (!fallback || r.smallest.size < fallback.blob.size)) {
              fallback = { blob: r.smallest, type: type, w: w, h: h, quality: r.q || IMG_Q_LO, rounds: round, over: true };
            }
            round++;
            if (round >= IMG_MAX_ROUNDS) return null;
            scale *= IMG_SHRINK;
            return attempt();
          });
        }
        return tryType(0);
      }

      return attempt().then(function (r) {
        releaseImage(im);
        r = r || fallback;
        if (!r) throw new Error("canvas 导出失败（浏览器不支持图片编码）");
        r.fromBytes = fromBytes; r.toBytes = r.blob.size; r.origW = w0; r.origH = h0;
        if (!r.over && fromBytes && r.toBytes >= fromBytes && scale >= 1 && src && src.type) {
          r.blob = src; r.type = src.type; r.kept = true; r.toBytes = fromBytes;   /* 原图本就不大 → 别做负功 */
        }
        return r;
      });
    });
  }

  /* 外链本地化第一步：浏览器里把图拉下来（可能被防盗链/CORS 拒 → 明确报错，**不降级存外链**，D8） */
  function fetchRemote(raw) {
    var url = String(raw || "").trim();
    if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("只支持 http(s) 外链"));
    return fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var ct = r.headers.get("Content-Type") || "";
      if (ct && ct.indexOf("image/") !== 0) throw new Error("不是图片（Content-Type " + ct + "）");
      return r.blob();
    }, function () { throw new Error("被拒"); }).then(function (blob) {
      if (!blob || !blob.size) throw new Error("空响应");
      return blob;
    }).catch(function (e) {
      throw new Error("拉不下来（" + e.message + "）——多为防盗链 / CORS 限制，服务端也从不抓外网（D8）。" +
        "本站强制本地化，不降级存外链：请把图「另存为」到本地后用「上传本地文件」。");
    });
  }

  /* ---------------- photo 草稿模型：mode "" 未改 / "set" 设为 draft / "remove" 恢复官方值 ---------------- */
  function photoPinned(id) {
    var e = entryOf(id);
    return (e && Object.prototype.hasOwnProperty.call(e, "photo")) ? e.photo : undefined;
  }
  function photoBase() {                     /* 盘上生效值（不含草稿）：人工值优先，否则 basic.json 值（可能已含旧人工值） */
    if (!state.horse) return [];
    var p = photoPinned(state.horse.id);
    return normList(p === undefined ? state.horse.photo : p);
  }
  function photoOfficial() {                 /* 官方抓取原值：_orig 快照优先，未存过人工值时就是当前值 */
    if (!state.horse) return [];
    var e = entryOf(state.horse.id), o = e && e._orig && e._orig.photo;
    return o === undefined ? normList(state.horse.photo) : normList(o);
  }
  function workingPhotos() { return photoMode() === "set" ? state.photos.draft.slice() : photoBase(); }
  function photoMode() { return state.photos.mode; }
  function photoDirty() { return state.photos.mode !== ""; }
  function ensureDraft() {
    if (state.photos.mode !== "set") { state.photos.draft = photoBase().slice(); state.photos.mode = "set"; }
    return state.photos.draft;
  }
  function setDraft(list) { state.photos.draft = list.slice(); state.photos.mode = "set"; }
  function addPhoto(path) {
    var d = ensureDraft();
    if (d.indexOf(path) < 0) d.push(path);
    setDraft(d);
  }
  function delPhoto(i) { var d = workingPhotos(); d.splice(i, 1); setDraft(d); }
  function markNoPhoto() { state.photos.draft = []; state.photos.mode = "set"; }
  function unpinPhoto() { state.photos.mode = "remove"; state.photos.draft = []; }
  function movePhoto(from, to) {
    var list = workingPhotos();
    if (from < 0 || from >= list.length || from === to) return;
    var it = list.splice(from, 1)[0];
    if (to > list.length) to = list.length;
    list.splice(to, 0, it);      /* 右拖=落在目标之后，左拖=落在目标之前（移除后同一下标即该语义） */
    setDraft(list);
  }

  function photoLog(msg, kind) {
    state.photos.log.push({ t: msg, k: kind || "" });
    if (state.photos.log.length > 6) state.photos.log.shift();
    renderPhotos();
  }
  function photoBusy(on, msg) {
    state.photos.busy = on;
    if (msg) photoLog(msg, "busy");
  }

  /* 压缩 + 上传一张（File | Blob），成功后把服务端返回的站内路径推进草稿 */
  function uploadOne(file, owner) {
    var name = file.name || "（无名文件）";
    return compressImage(file).then(function (r) {
      return writer.savePhoto(r.blob, owner).then(function (res) {
        var b = res.body || {};
        if (!b.ok) throw new Error((b.error || "入库失败") + "（HTTP " + res.status + "）");
        state.photos.meta[b.path] = {
          bytes: b.bytes, to: r.toBytes, from: r.fromBytes, w: r.w, h: r.h,
          type: b.mime, q: r.quality, over: r.over, kept: r.kept, name: name
        };
        addPhoto(b.path);
        photoLog(name + "：" + kb(r.fromBytes) + " → " + kb(r.toBytes) + "　" + r.w + "×" + r.h +
          " " + mimeShort(b.mime) + (r.kept ? "（原图已够小，未重压）" : r.over ? "（已尽力，仍超 100KB）" : "　q" + r.quality) +
          " → " + b.path, "ok");
        return r;
      });
    });
  }
  function uploadQueue(files, owner) {
    var arr = [].slice.call(files || []);
    if (!arr.length) return Promise.resolve();
    if (!state.online) { photoLog("edit_server 未在线，不能入库", "err"); return Promise.resolve(); }
    photoBusy(true, "处理 " + arr.length + " 张…");
    var bad = 0;
    return arr.reduce(function (p, f) {
      return p.then(function () {
        return uploadOne(f, owner).catch(function (e) {
          bad++;
          state.photos.log.push({ t: (f.name || "文件") + "：" + e.message, k: "err" });
          renderPhotos();
        });
      });
    }, Promise.resolve()).then(function () {
      photoBusy(false);
      if (!bad) state.photos.err = "";
      render();
    });
  }
  function uploadURL(url) {
    if (!state.online) { photoLog("edit_server 未在线，不能入库", "err"); return; }
    photoBusy(true, "外链本地化中…");
    fetchRemote(url).then(function (blob) {
      blob.name = photoName(url);
      return uploadOne(blob, state.horse.id);
    }).catch(function (e) {
      photoLog("外链：" + e.message, "err");
    }).then(function () {
      photoBusy(false);
      state.photos.url = "";
      render();
    });
  }

  /* ---------------- 图片区 UI ---------------- */
  function photoBadgeHTML() {
    if (photoMode() === "remove") return '<span class="' + BADGE_DIRTY + '">待恢复官方值</span>';
    if (photoDirty()) {
      return '<span class="' + BADGE_DIRTY + '">' + (workingPhotos().length ? "待保存：" + workingPhotos().length + " 张" : "待保存：确无图片") + "</span>";
    }
    return photoPinned(state.horse.id) !== undefined ? '<span class="' + BADGE_PIN + '">已保存</span>'
      : '<span class="' + TIP + '">未保存（显示 basic.json 生效值）</span>';
  }
  function thumbHTML(p, i) {
    var m = state.photos.meta[p] || {};
    return '<li draggable="true" data-pi="' + i + '" class="yj-ed-thumb group">' +
      '<img src="' + esc(photoSrc(p)) + '" alt="" draggable="false" loading="lazy" decoding="async" class="h-[80px] w-full object-contain">' +
      '<span class="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold tabular-nums text-white">' + (i + 1) + "</span>" +
      '<button data-pdel="' + i + '" type="button" class="' + BTN_DANGER + ' absolute right-1 top-1 hidden h-6 px-1.5 group-hover:inline-flex" title="移出列表（盘上文件保留）">✕</button>' +
      '<span class="block truncate border-t border-border bg-card px-1.5 py-1 text-[10px] text-muted-foreground" title="' + esc(p) + '">' +
        esc(photoName(p)) + (m.bytes ? " · " + kb(m.bytes) : "") + "</span>" +
      "</li>";
  }
  /* 台账左列 = 照片位（有图显示首图 / 无图占位 🐎）+ 其下缩略图行；点图位展开入库面板（上传或粘外链）。
   * 压缩 · 上传 · 拖拽 · 草稿 mode 全部沿用原实现，这里只换排布。 */
  function photosHTML() {
    if (!state.horse) return '<div class="hint-empty">先选匹马再管理图片。</div>';
    var id = state.horse.id;
    var list = workingPhotos();
    var off = photoOfficial();
    var dis = (!state.online || state.photos.busy || state.saving) ? " disabled" : "";
    var slot = '<button type="button" data-pslot="1" class="yj-ed-slot" title="' +
        esc("点图位：上传本地文件 或 粘贴外链 → 浏览器内压缩后入库") + '">' +
      (list.length
        ? '<img src="' + esc(photoSrc(list[0])) + '" alt="" draggable="false" loading="lazy" decoding="async" class="yj-ed-slotimg">'
        : '<span class="text-[54px] text-muted-foreground opacity-50">🐎</span>') +
      '<span class="yj-ed-lbl absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-background/85 px-1.5 py-px">' +
        (list.length ? "1/" + list.length + " · 改图" : "无图 · 改图") + "</span></button>";
    var badgeRow = '<div class="mt-2 flex flex-wrap items-center gap-1.5">' + photoBadgeHTML() +
      (state.photos.busy ? '<span class="' + BADGE_WARN + '">压缩/上传中…</span>' : "") +
      (state.photos.open ? "" : '<button data-pslot="1" class="' + BTN + ' ml-auto" type="button">上传/外链</button>') + "</div>";
    var panel = state.photos.open
      ? '<div class="mt-2 rounded-lg border border-border bg-card p-2.5">' +
          '<label class="' + BTN + ' cursor-pointer select-none' + (dis ? " opacity-40" : "") + '">上传本地文件' +
            '<input id="photoFile" type="file" accept="image/*" multiple class="hidden"' + dis + "></label>" +
          '<div class="mt-2 flex flex-wrap items-center gap-2">' +
            '<input id="photoURL" value="' + esc(state.photos.url || "") + '" class="' + INPUT + ' h-8 min-w-0 flex-1 font-normal"' +
              ' placeholder="粘贴外链图片 URL → 本地化（不存外链）" autocomplete="off">' +
            '<button id="photoURLBtn" class="' + BTN_DIS + '" type="button"' + dis + ">本地化</button></div>" +
          '<div class="mt-2 flex items-center gap-2"><button data-pclose="1" class="' + BTN + '" type="button">收起</button>' +
            '<span class="' + TIP + '">服务端只收浏览器压好的图，从不访问外网（D8）</span></div>' +
          "</div>"
      : "";
    var strip = list.length
      ? '<ul class="mt-2 flex list-none flex-wrap gap-2 p-0">' + list.map(function (p, i) { return thumbHTML(p, i); }).join("") + "</ul>"
      : '<div class="mt-2 rounded-md border border-dashed border-input px-3 py-4 text-center text-[12px] leading-[1.6] text-muted-foreground">' +
        (photoDirty() ? "确无图片（photo: []）——保存后资料页显示占位图，不再回落到官方抓取值。" : "当前无图片：点上方图位上传或粘外链。") + "</div>";
    var acts = '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
      (list.length ? '<button data-pnone="' + id + '" class="' + BTN_DIS + '" type="button"' + dis + ">清空为确无图片</button>" : "") +
      (photoPinned(id) !== undefined && !photoDirty() ? '<button data-punpin="' + id + '" class="' + BTN + ' yj-ed-op--danger" type="button"' + dis + ">恢复官方值</button>" : "") +
      '<span class="' + TIP + '">拖拽缩略图排序 · 删除=移出数组</span></div>';
    return slot + badgeRow + panel + strip + acts +
      (off.length ? '<div class="mt-2 ' + TIP + '">保存前官方值：' + off.map(function (p) { return "<b>" + esc(String(p).slice(0, 90)) + "</b>"; }).join("、") + "</div>"
        : '<div class="mt-2 ' + TIP + '">保存前官方值：无图</div>') +
      (state.photos.log.length ? '<div id="photoStatus" class="mt-2 space-y-0.5">' + state.photos.log.map(function (l) {
        return '<div class="text-[11.5px] ' + (l.k === "err" ? "text-destructive" : l.k === "busy" ? "text-muted-foreground" : "text-primary") + '">' + esc(l.t) + "</div>";
      }).join("") + "</div>" : '<div id="photoStatus"></div>') +
      (state.photos.err ? '<div class="mt-2 text-[11.5px] text-destructive">' + esc(state.photos.err) + "</div>" : "");
  }
  function renderPhotos() { if (els.photos) els.photos.innerHTML = photosHTML(); }

  /* ---------------- 拖拽排序（原生 HTML5 DnD，不引库） ---------------- */
  function dragItem(ev) { return ev.target && ev.target.closest ? ev.target.closest("[data-pi]") : null; }
  function onDragStart(ev) {
    var it = dragItem(ev);
    if (!it || !state.online) { return; }
    state.photos.drag = Number(it.dataset.pi);
    state.photos.err = "";
    if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = "move"; try { ev.dataTransfer.setData("text/plain", it.dataset.pi); } catch (e) { /* IE 无妨 */ } }
  }
  function onDragOver(ev) {
    if (state.photos.drag < 0) return;
    var it = dragItem(ev);
    if (!it) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    clearDragRing();
    it.style.outline = "2px dashed #0aa7a0";
    it.style.outlineOffset = "1px";
  }
  function clearDragRing() {
    [].forEach.call(els.photos.querySelectorAll("[data-pi]"), function (n) { n.style.outline = ""; n.style.outlineOffset = ""; });
  }
  function onDrop(ev) {
    if (state.photos.drag < 0) return;
    var it = dragItem(ev);
    ev.preventDefault();
    clearDragRing();
    var from = state.photos.drag;
    state.photos.drag = -1;
    if (!it) { renderPhotos(); return; }
    movePhoto(from, Number(it.dataset.pi));
    render();
  }
  function onDragEnd() { state.photos.drag = -1; clearDragRing(); }

  /* ================= M2c · 时间线人工节点（data/timeline_manual.json，保存不自动重算 §4.5） ================= */

  function catOf(c) {
    for (var i = 0; i < TL_CATS.length; i++) if (TL_CATS[i].cat === c) return TL_CATS[i];
    return TL_CATS[0];
  }
  function catChipStyle(c) { var k = catOf(c); return "background-color:" + k.bg + ";color:" + k.fg + ";"; }
  function catDotStyle(c) { return "background-color:" + catOf(c).node + ";"; }
  function catOptions(cur) {
    return TL_CATS.map(function (k) {
      return '<option value="' + k.cat + '"' + (k.cat === (cur || "manual") ? " selected" : "") + ">" + esc(k.cn) + "</option>";
    }).join("");
  }
  function tagChip(t, key) {
    return '<span data-tl-chip="' + key + '" class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-bold" ' +
      'style="' + catChipStyle(t.cat) + '"><i class="h-[7px] w-[7px] flex-none rounded-full" style="' + catDotStyle(t.cat) + '"></i>' +
      esc(t.label || "（空标签）") + "</span>";
  }

  function cloneEvent(e) {
    e = e || {};
    return {
      date: String(e.date || ""), title: String(e.title || ""),
      cn: String(e.cn || ""), note: String(e.note || ""), link: String(e.link || ""),
      photo: Array.isArray(e.photo) ? e.photo.join(" ") : String(e.photo || ""),
      tags: (Array.isArray(e.tags) ? e.tags : []).map(function (t) {
        t = t || {};
        return { label: String(t.label || ""), cat: String(t.cat || "manual"), tip: String(t.tip || "") };
      })
    };
  }
  function tlToStore(ev) {                     /* 编辑对象 → 落表形状（空字段不写，契约里 photo 可为串或数组） */
    var o = { date: String(ev.date || "").trim(), title: String(ev.title || "").trim() };
    ["cn", "note", "link"].forEach(function (k) { if (String(ev[k] || "").trim()) o[k] = String(ev[k]).trim(); });
    var ph = String(ev.photo || "").trim();
    if (ph) o.photo = ph.indexOf(",") >= 0 ? ph.split(/\s*,\s*/) : ph;
    var tags = (ev.tags || []).map(function (t) {
      var x = { cat: catOf(t.cat).cat, label: String(t.label || "").trim() };
      if (String(t.tip || "").trim()) x.tip = String(t.tip).trim();
      return x;
    }).filter(function (x) { return x.label; });
    if (tags.length) o.tags = tags;
    return o;
  }
  function tlValidate(ev) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ev.date || "").trim())) return "date 需 YYYY-MM-DD";
    if (!String(ev.title || "").trim()) return "title 必填";
    if (String(ev.link || "").trim() && !/^(https?:\/\/|\.\/|\.\.\/|#)/i.test(String(ev.link).trim())) return "link 只允许 http(s) 或站内相对路径";
    return "";
  }
  function tlUrl() { return (state.online ? origin() + "/" + TL_PATH : YJ_DATA.url("timeline_manual.json")); }
  function loadTimeline() {
    return getJSON(tlUrl() + "?ts=" + Date.now()).then(function (o) {
      o = (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
      state.tl.table = o;
      if (!state.tl.dirty) state.tl.events = (Array.isArray(o.events) ? o.events : []).map(cloneEvent);
      state.tl.loaded = true;
      return state.tl.events;
    });
  }
  function tlPayload() {
    var t = {};
    Object.keys(state.tl.table || {}).forEach(function (k) { if (k !== "events") t[k] = state.tl.table[k]; });
    t.events = state.tl.events.map(tlToStore);
    return t;
  }
  function openTLEdit(idx) {
    state.tl.edit = { idx: idx, ev: cloneEvent(idx < 0 ? {} : state.tl.events[idx]) };
    state.tl.err = "";
    renderTL();
    var f = els.tl.querySelector('[data-tf="date"]');
    if (f) f.focus();
  }
  function tlAddTag() { var e = editEV(); e.tags.push({ label: "", cat: "manual", tip: "" }); renderTL(); }
  function editEV() {
    if (!state.tl.edit) state.tl.edit = { idx: -1, ev: cloneEvent({}) };
    return state.tl.edit.ev;
  }
  function tlApplyEdit() {
    var e = editEV(), store = tlToStore(e), msg = tlValidate(store);
    if (msg) { state.tl.err = msg; renderTL(); return; }
    if (state.tl.edit.idx < 0) state.tl.events.push(store);
    else state.tl.events[state.tl.edit.idx] = store;
    state.tl.events.sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0; });
    state.tl.dirty = true; state.tl.edit = null; state.tl.err = "";
    renderTL();
  }
  function tlDelete(i) {
    if (state.tl.del !== i) { state.tl.del = i; renderTL(); return; }   /* 两次点击确认，不用 window.confirm（headless 会卡） */
    state.tl.events.splice(i, 1);
    state.tl.del = -1; state.tl.dirty = true;
    if (state.tl.edit && state.tl.edit.idx === i) state.tl.edit = null;
    renderTL();
  }
  function tlPhotoUpload(files) {
    var arr = [].slice.call(files || []);
    if (!arr.length || !state.online) return;
    state.tl.busy = true; state.tl.log = ["上传中…"];
    renderTL();
    compressImage(arr[0]).then(function (r) {
      return writer.savePhoto(r.blob, PHOTO_OWNER_TL).then(function (res) {
        var b = res.body || {};
        if (!b.ok) throw new Error((b.error || "入库失败") + "（HTTP " + res.status + "）");
        editEV().photo = "../" + b.path;    /* 时间线页按 dist/pages 相对直读 ev.photo（不经 YJ_DATA） */
        state.tl.log = [arr[0].name + "：" + kb(r.fromBytes) + " → " + kb(r.toBytes) + "　" + r.w + "×" + r.h + " " + mimeShort(b.mime) + " → " + b.path];
      });
    }).catch(function (e) { state.tl.log = ["图片失败：" + e.message]; }).then(function () {
      state.tl.busy = false;
      renderTL();
    });
  }

  function tlEventHTML(ev, i) {
    var store = tlToStore(ev);
    var ph = Array.isArray(store.photo) ? store.photo[0] : store.photo;
    return '<div class="border-b border-border px-4 py-2.5 last:border-b-0">' +
      '<div class="flex flex-wrap items-baseline gap-2">' +
        '<span class="flex-none font-semibold tabular-nums text-primary">' + esc(store.date || "（无日期）") + "</span>" +
        '<span class="min-w-0 flex-1 truncate text-[13px] font-semibold">' +
          (store.link ? '<a class="hjump" href="' + esc(store.link) + '" target="_blank" rel="noopener">' + esc(store.title) + "</a>" : esc(store.title)) +
          (store.cn ? '<span class="ml-1 text-[11.5px] font-normal text-muted-foreground">〈' + esc(store.cn) + "〉</span>" : "") + "</span>" +
        '<span class="flex-none">' + tagChipsHTML(store.tags, "l" + i) + "</span>" +
        '<span class="ml-auto flex flex-none gap-1">' +
          '<button data-tledit="' + i + '" class="' + BTN + '" type="button">编辑</button>' +
          '<button data-tldel="' + i + '" class="' + (state.tl.del === i ? BTN_DANGER + " bg-destructive/10" : BTN_DANGER) + '" type="button">' +
            (state.tl.del === i ? "确认删除？" : "删除") + "</button>" +
        "</span></div>" +
      (store.note ? '<div class="mt-1 text-[11.5px] text-muted-foreground">' + esc(store.note) + "</div>" : "") +
      (ph ? '<div class="mt-1 ' + TIP + '">图 <a href="' + esc(photoSrc(ph)) + '" target="_blank">' + esc(String(ph).slice(-40)) + "</a></div>" : "") +
      "</div>";
  }
  function tagChipsHTML(tags, key) {
    return (tags || []).map(function (t, j) { return tagChip(t, key + "-" + j); }).join(" ");
  }
  function tlFormHTML() {
    var ed = state.tl.edit;
    if (!ed) return "";
    var ev = ed.ev;
    var dis = (!state.online || state.tl.busy) ? " disabled" : "";
    function row(lab, key, ph, type) {
      return '<div class="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-1.5 text-[12.5px] font-semibold text-secondary-foreground">' + lab + '</div>' +
        '<div class="min-w-0"><input data-tf="' + key + '" type="' + (type || "text") + '" value="' + esc(ev[key] || "") +
          '" class="' + INPUT + '" autocomplete="off" placeholder="' + esc(ph || "") + '"' + dis + "></div></div>";
    }
    return '<div class="border-y border-border bg-muted/20 px-4 py-3">' +
      '<div class="flex flex-wrap items-baseline gap-2 text-[13px] font-bold">' + (ed.idx < 0 ? "新增人工节点" : "编辑 events[" + ed.idx + "]") +
        '<span class="' + TIP + ' font-normal">契约：date/title 必填，cn/note/link/photo/tags 可选（build_timeline.py 文件头）</span></div>' +
      row("日期 date *", "date", "YYYY-MM-DD", "date") +
      row("标题 title *", "title", "节点标题（必填）") +
      row("副题 cn", "cn", "可选中文副题") +
      row("说明 note", "note", "可选一行补充") +
      row("链接 link", "link", "可选：http(s) 或站内相对路径") +
      row("图片 photo", "photo", "站内 ../data/photos/xxx.webp 或 http(s)；留空=无图") +
      '<div class="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-1.5 text-[12.5px] font-semibold text-secondary-foreground">图片上传</div>' +
        '<div class="min-w-0 flex flex-wrap items-center gap-2">' +
          '<label class="' + BTN + ' cursor-pointer select-none' + (dis ? " opacity-40" : "") + '">压缩并上传' +
            '<input id="tlPhotoFile" type="file" accept="image/*" class="hidden"' + dis + "></label>" +
          '<span class="' + TIP + '">同 M2b 通道：canvas 压到 ≤100KB 后入库，文件名服务端生成（timeline-<n>.webp）</span></div></div>' +
      '<div class="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-1.5 text-[12.5px] font-semibold text-secondary-foreground">标签 tags</div>' +
        '<div class="min-w-0">' +
          (ev.tags.length ? ev.tags.map(function (t, i) {
            return '<div class="mb-1.5 flex flex-wrap items-center gap-2">' +
              '<input data-tl-label="' + i + '" value="' + esc(t.label) + '" class="' + INPUT + ' min-w-[150px] max-w-[220px] flex-1" placeholder="徽章文字 label"' + dis + ">" +
              '<select data-tl-cat="' + i + '" class="w-[190px] max-w-full flex-none"' + dis + ">" + catOptions(t.cat) + "</select>" +
              '<input data-tl-tip="' + i + '" value="' + esc(t.tip || "") + '" class="' + INPUT + ' min-w-[120px] max-w-[180px] flex-1" placeholder="悬停 tip（可空）"' + dis + ">" +
              tagChip(t, "e" + i) +
              '<button data-tl-dtag="' + i + '" class="' + BTN_DANGER + '" type="button">✕</button></div>';
          }).join("") : '<div class="' + TIP + '">暂无标签</div>') +
          '<button data-tl-atag="1" class="' + BTN_DIS + ' mt-1" type="button"' + dis + ">＋ 加一个标签</button>" +
          '<div class="mt-1 text-[11px] leading-[1.7] text-muted-foreground">类别六色取自时间线页现有 tag 配色（D9）。</div>' +
        "</div></div>" +
      '<div class="mt-1 flex flex-wrap items-center gap-2">' +
        '<button data-tlapply="1" class="' + BTN_PRIMARY + '" type="button"' + dis + ">" +
          (ed.idx < 0 ? "加入节点表" : "更新该节点") + "</button>" +
        '<button data-tlcancel="1" class="' + BTN + '" type="button">取消</button>' +
        '<span class="' + TIP + '">只改本页草稿，仍需「保存时间线表」落盘</span></div>' +
      (state.tl.log && state.tl.log.length ? '<div class="mt-1 text-[11.5px] text-primary">' + esc(state.tl.log.join("；")) + "</div>" : "") +
      "</div>";
  }
  function tlReportHTML() {
    var r = state.tl.report;
    if (!r) return "";
    var s = r.steps || {};
    return '<div class="mt-2 space-y-0.5">' + stepLine("① 写源表", s.write) +
      (s.merge && s.merge.skipped ? '<div class="flex items-start gap-2 text-[11.5px]"><span class="flex-none font-semibold text-chart3">⊘ ② merge 跳过</span>' +
        '<span class="min-w-0 break-all text-muted-foreground">' + esc(s.merge.detail || "时间线不自动重算") + "</span></div>" : stepLine("② merge", s.merge)) +
      stepLine("③ 同步 dist", s.sync) +
      '<div class="mt-1 rounded-md bg-chart3/10 px-2.5 py-1.5 text-[11.5px] text-chart3">未重算：跑 ' +
        '<code class="rounded bg-muted px-1.5 py-0.5 text-foreground">python scripts/timeline/build_timeline.py</code> 后节点才出现在时间线页（§4.5 不自动重算）。</div>' +
      "</div>";
  }
  function tlHTML() {
    if (!state.tl.loaded) return '<div class="hint-empty">时间线表加载中…</div>';
    var evs = state.tl.events;
    var dis = (!state.online || state.tl.busy) ? " disabled" : "";
    return '<div class="px-4 py-3">' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<button data-tlnew="1" class="' + BTN_DIS + '" type="button"' + dis + ">＋ 新增人工节点</button>" +
        '<button id="tlSave" class="' + BTN_PRIMARY + ' font-semibold" type="button"' +
          (state.online && state.tl.dirty && !state.tl.busy ? "" : " disabled") + ">" + (state.tl.busy ? "写入中…" : "保存时间线表（不重算）") + "</button>" +
        '<button data-tlreset="1" class="' + BTN_DIS + '" type="button"' + dis + ">放弃修改</button>" +
        (state.tl.dirty ? '<span class="' + BADGE_DIRTY + '">有未保存的节点改动</span>' : "") +
        '<span class="' + TIP + ' ml-auto">现 ' + evs.length + " 条人工节点 · 表 " + esc(TL_PATH) + "</span>" +
      "</div>" +
      (state.tl.err ? '<div class="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">' + esc(state.tl.err) + "</div>" : "") +
      tlFormHTML() +
      (evs.length ? evs.map(tlEventHTML).join("") : '<div class="mt-2 rounded-md border border-dashed border-input px-4 py-5 text-center text-[12.5px] text-muted-foreground">还没有人工节点：点「＋ 新增人工节点」。</div>') +
      tlReportHTML() +
      "</div>";
  }
  function renderTL() { if (els.tl) els.tl.innerHTML = tlHTML(); }
  function saveTimeline() {
    if (!state.online || state.tl.busy || !state.tl.dirty) return;
    var bad = [];
    state.tl.events.forEach(function (e, i) {
      var m = tlValidate(tlToStore(e));
      if (m) bad.push("events[" + i + "]：" + m);
    });
    if (bad.length) { state.tl.err = bad.join("；"); renderTL(); return; }
    state.tl.busy = true; state.tl.err = ""; state.tl.report = null; renderTL();
    writer.saveJSON(TL_PATH, tlPayload()).then(function (res) {
      var b = res.body || {};
      state.tl.busy = false;
      if (!b.ok) {
        state.tl.err = (b.error || "保存失败") + (b.problems ? "：" + b.problems.join("；") : "") + "（HTTP " + res.status + "）";
        renderTL();
        return;
      }
      state.tl.report = b; state.tl.dirty = false; state.tl.edit = null;
      loadTimeline().then(renderTL);
    });
  }

  /* ---------------- 渲染 & 事件 ---------------- */
  var els = {};

  function bannerHTML() {
    return "未启动 edit_server（探测 " + esc(origin()) + "/healthz 失败）。<br>" +
      '在项目根跑 <code class="rounded bg-muted px-1.5 py-0.5">python scripts/edit_server.py</code> 后点重试；' +
      "现在是 dist/data 只读副本，不能保存。" +
      '<button id="retryBtn" class="' + BTN_GHOST + ' ml-2" type="button">重试探测</button>';
  }

  /* ---------------- 分段折叠 + ?tab= 直达（§4.6 改案：fields = 字段+图片段 / timeline = 人工节点段） ----------------
   * 段的静态骨架在 pages/edit.html（#sec-<段名> + [data-sechead] + .yj-ed-caret）；
   * 收起态由 theme.css 的 .yj-ed-sec[data-open="false"] > .yj-ed-secbody 表达，JS 只换属性与箭头字符。 */
  function openSec(name, on) {
    var sec = document.getElementById("sec-" + name);
    if (!sec) return null;
    sec.dataset.open = on ? "true" : "false";
    var c = sec.querySelector(".yj-ed-caret");
    if (c) c.textContent = on ? "▾" : "▸";
    return sec;
  }
  function bindSections() {
    [].forEach.call(document.querySelectorAll("[data-sechead]"), function (h) {
      h.addEventListener("click", function () {
        var sec = document.getElementById("sec-" + h.dataset.sechead);
        if (sec) openSec(h.dataset.sechead, sec.dataset.open !== "true");
      });
    });
  }
  function applyTab() {
    var tab = (new URLSearchParams(location.search).get("tab") || "").toLowerCase();
    if (SECS.indexOf(tab) < 0) {                        /* 无 tab / 未知 tab = 现状全展开 */
      SECS.forEach(function (n) { openSec(n, true); });
      return;
    }
    var sec = null;
    SECS.forEach(function (n) { sec = openSec(n, n === tab) || sec; });
    if (sec) sec.scrollIntoView({ block: "start" });
  }

  function renderMast() { if (els.mast) els.mast.innerHTML = mastHTML(); }
  function renderSummary() {
    if (!els.summary) return;
    els.summary.innerHTML = summaryHTML();
  }
  function renderPreview() {
    if (els.preview) els.preview.innerHTML = previewHTML();
  }

  function render() {
    renderMast();
    els.form.innerHTML = formHTML();
    els.pins.innerHTML = pinsHTML();
    els.report.innerHTML = reportHTML();
    renderSummary();
    renderPreview();
    renderPhotos();
    renderTL();
    var n = pinIds().length;
    els.count.textContent = n ? n + " 匹有人工值" : "暂无人工值";
    var canSave = state.online && !state.saving && (hasChanges() || noteChanged());
    els.save.disabled = !canSave;
    els.save.textContent = state.saving ? "管道执行中…" : "保存并跑管道";
    els.dirtyTip.textContent = state.saving ? "" : (hasChanges() || noteChanged() ? "有未保存的修改" : "");
    if (state.online) {
      els.banner.className = "hidden";
      els.banner.innerHTML = "";
    } else {
      els.banner.className = "flex-none border-b border-destructive/30 bg-destructive/5 px-6 py-3 text-[12.5px] text-destructive max-md:px-3.5";
      els.banner.innerHTML = bannerHTML();
      var rb = document.getElementById("retryBtn");
      if (rb) rb.addEventListener("click", function () { probe().then(render); });
    }
  }

  function setHorse(h) {
    state.horse = (h && state.byId[String(h.id)]) || h;
    state.draft = {};
    state.note = "";
    state.err = "";
    state.report = null;
    state.editing = "";                                   /* 台账：同时只开一行，换马即收起 */
    state.photos.draft = []; state.photos.mode = ""; state.photos.open = false;
    state.photos.log = []; state.photos.err = ""; state.photos.drag = -1;
    render();
  }

  /* 改文本时不整块重绘（会丢焦点）：只换掉台账的这一行，再还原光标；状态条与摘要同步刷新 */
  function softRefreshRow(key) {
    var f = fieldOf(key);
    if (!f) return;
    var input = els.form.querySelector('[data-f="' + esc(key) + '"]');
    if (!input) { render(); return; }
    var row = input.closest("[data-row]");
    var pos = input.selectionStart;
    if (!row) { render(); return; }
    var box = document.createElement("div");
    box.innerHTML = rowHTML(f);
    row.parentNode.replaceChild(box.firstChild, row);
    var again = els.form.querySelector('[data-f="' + esc(key) + '"]');
    if (again && again.tagName === "INPUT") {
      again.focus();
      try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }
    renderMast();
    renderSummary();
    renderPreview();
    els.save.disabled = !(state.online && !state.saving && (hasDraft() || noteChanged()));
    els.dirtyTip.textContent = hasDraft() || noteChanged() ? "有未保存的修改" : "";
  }

  /* 报头「上一匹 / 下一匹」：只换马（走 selector 的 onSelect → setHorse），草稿按马重置的既有逻辑不变 */
  function navHorse(delta) {
    var list = state.horses;
    if (!list.length) return;
    var i = -1, id = state.horse && String(state.horse.id);
    for (var k = 0; k < list.length; k++) if (String(list[k].id) === id) { i = k; break; }
    var next = i < 0 ? list[0] : list[(i + delta + list.length) % list.length];
    if (!next) return;
    if (YJ.selector && YJ.selector.select) YJ.selector.select(next);
    else setHorse(next);
    if (els.form) els.form.scrollIntoView({ block: "start" });
  }

  function bind() {
    els.form.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t.id === "noteInput") {
        state.note = t.value;
        renderSummary();   /* 只换摘要块，备注框本身不重绘 → 光标不丢 */
        els.save.disabled = !(state.online && !state.saving && (hasChanges() || noteChanged()));
        els.dirtyTip.textContent = (hasChanges() || noteChanged()) ? "有未保存的修改" : "";
        return;
      }
      if (t.tagName !== "INPUT" || !t.dataset.f) return;
      state.draft[t.dataset.f] = t.value;
      state.err = "";
      softRefreshRow(t.dataset.f);
    });
    els.form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.tagName !== "SELECT" || !t.dataset.f) return;
      state.draft[t.dataset.f] = t.value;
      state.err = "";
      render();
    });
    els.form.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest(
        "button[data-editrow],button[data-canceledit],button[data-lock],button[data-unpin],button[data-v]") : null;
      if (!b) return;
      if (b.dataset.editrow !== undefined) {              /* 台账：点「编辑」就地换控件（同时只开一行） */
        state.editing = state.editing === b.dataset.editrow ? "" : b.dataset.editrow;
        state.err = "";
        render();
        var ctl = state.editing && els.form.querySelector('[data-f="' + esc(state.editing) + '"]');
        if (ctl) ctl.focus();
        return;
      }
      if (b.dataset.canceledit !== undefined) {           /* 收起但不清 draft：文本改动本就实时进 draft */
        state.editing = "";
        render();
        return;
      }
      if (b.dataset.v !== undefined) {         /* 枚举瓦片：与下拉选中同一套 draft 语义，行保持展开 */
        state.draft[b.dataset.f] = b.dataset.v;
        state.err = "";
        render();
        return;
      }
      var key = b.dataset.lock || b.dataset.unpin;
      var f = fieldOf(key);
      state.draft[key] = b.dataset.unpin ? null : currentValue(f);
      state.err = "";
      state.editing = "";                                 /* 按此值保存 / 恢复官方值 → 行收起，行尾转「待保存」 */
      render();
    });
    if (els.mast) els.mast.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button[data-nav]") : null;
      if (b) navHorse(Number(b.dataset.nav));
    });
    els.pins.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button[data-goto]") : null;
      if (!b) return;
      var id = b.dataset.goto, h = state.byId[id];
      if (h) YJ.selector.select(h);
      else setHorse({ id: /^\d+$/.test(id) ? Number(id) : id });
      els.form.scrollIntoView({ block: "start" });
    });
    els.save.addEventListener("click", save);
    els.reset.addEventListener("click", function () {
      state.draft = {}; state.note = ""; state.err = ""; state.editing = "";
      state.photos.mode = ""; state.photos.draft = []; state.photos.open = false;
      render();
    });
    bindSections();     /* 段标题（字段 / 人工节点）点击折叠展开 */

    /* ---------------- M2b 图片区（事件全部委托在容器上，重绘不丢监听） ---------------- */
    els.photos.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.id === "photoFile" && t.files && t.files.length) {
        var files = [].slice.call(t.files);
        t.value = "";                                  /* 清掉，允许连续再选同一张 */
        uploadQueue(files, state.horse && state.horse.id);
      }
    });
    els.photos.addEventListener("input", function (ev) {
      if (ev.target.id === "photoURL") state.photos.url = ev.target.value;
    });
    els.photos.addEventListener("keydown", function (ev) {
      if (ev.target.id === "photoURL" && ev.key === "Enter") {
        ev.preventDefault();
        var u = (state.photos.url || "").trim();
        if (u) uploadURL(u);
      }
    });
    els.photos.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest(
        "button[data-pdel],button[data-pnone],button[data-punpin],button[data-pslot],button[data-pclose],#photoURLBtn") : null;
      if (!b) return;
      /* 纯 UI：照片位 / 「上传/外链」钮展开入库面板，「收起」关掉 —— 不要求服务端在线 */
      if (b.dataset.pslot !== undefined) { state.photos.open = !state.photos.open; renderPhotos(); return; }
      if (b.dataset.pclose !== undefined) { state.photos.open = false; renderPhotos(); return; }
      if (b.id === "photoURLBtn") {
        var u = (state.photos.url || "").trim();
        if (u) uploadURL(u); else photoLog("先粘贴一个图片 URL", "err");
        return;
      }
      if (!state.online || !state.horse) return;
      if (b.dataset.pdel !== undefined) delPhoto(Number(b.dataset.pdel));
      else if (b.dataset.pnone !== undefined) markNoPhoto();
      else if (b.dataset.punpin !== undefined) unpinPhoto();
      else return;
      render();
    });
    els.photos.addEventListener("dragstart", onDragStart);
    els.photos.addEventListener("dragover", onDragOver);
    els.photos.addEventListener("dragleave", function () { clearDragRing(); });
    els.photos.addEventListener("drop", onDrop);
    els.photos.addEventListener("dragend", onDragEnd);

    /* ---------------- M2c 时间线区 ---------------- */
    els.tl.addEventListener("input", function (ev) {
      var d = ev.target.dataset;
      if (d.tf !== undefined) { editEV()[d.tf] = ev.target.value; return; }
      if (d.tlLabel !== undefined) {
        var i = Number(d.tlLabel);
        editEV().tags[i].label = ev.target.value;
        var chip = els.tl.querySelector('[data-tl-chip="e' + i + '"]');
        if (chip && chip.lastChild) chip.lastChild.nodeValue = ev.target.value || "（空标签）";
        return;
      }
      if (d.tlTip !== undefined) editEV().tags[Number(d.tlTip)].tip = ev.target.value;
    });
    els.tl.addEventListener("change", function (ev) {
      var t = ev.target, d = t.dataset;
      if (d.tlCat !== undefined) { editEV().tags[Number(d.tlCat)].cat = t.value; renderTL(); return; }
      if (t.id === "tlPhotoFile" && t.files && t.files.length) {
        var files = [].slice.call(t.files);
        t.value = "";
        tlPhotoUpload(files);
      }
    });
    els.tl.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button") : null;
      if (!b) return;
      var d = b.dataset;
      if (b.id === "tlSave") saveTimeline();
      else if (d.tlnew !== undefined) openTLEdit(-1);
      else if (d.tledit !== undefined) openTLEdit(Number(d.tledit));
      else if (d.tldel !== undefined) tlDelete(Number(d.tldel));
      else if (d.tlapply !== undefined) tlApplyEdit();
      else if (d.tlcancel !== undefined) { state.tl.edit = null; state.tl.err = ""; renderTL(); }
      else if (d.tlreset !== undefined) {
        state.tl.dirty = false; state.tl.edit = null; state.tl.err = ""; state.tl.report = null; state.tl.del = -1;
        loadTimeline().then(renderTL);
      } else if (d.tlAtag !== undefined) tlAddTag();
      else if (d.tlDtag !== undefined) { editEV().tags.splice(Number(d.tlDtag), 1); renderTL(); }
    });
  }

  /* 读-改-写：在源表快照上只改这一匹马，其余条目原样带回（防覆盖别人存的人工值） */
  function buildPayload() {
    var id = String(state.horse.id);
    var table = JSON.parse(JSON.stringify(state.table));
    var ent = table[id] || (table[id] = {});
    Object.keys(state.draft).forEach(function (k) {
      if (state.draft[k] === null) delete ent[k]; else ent[k] = state.draft[k];
    });
    if (photoMode() === "set") ent.photo = workingPhotos();       /* M2b：[] 也是合法人工值（确无图片） */
    else if (photoMode() === "remove") delete ent.photo;          /* 恢复官方值 = 删键 */
    var hasPin = Object.keys(ent).some(function (k) { return k[0] !== "_"; });
    var note = (state.note || ent._note || "").trim();
    if (hasPin) { ent._note = note; } else { delete table[id]; }
    return table;
  }

  function save() {
    if (!state.online || !state.horse || state.saving) return;
    var payload = buildPayload();
    var ent = payload[String(state.horse.id)];
    if (ent && Object.keys(ent).some(function (k) { return k[0] !== "_"; }) && !String(ent._note || "").trim()) {
      state.err = "保存要写一句编辑备注：_note 不能为空（改图片同样算人工保存值）。";
      render();
      return;
    }
    state.saving = true; state.err = ""; state.report = null;
    render();
    writer.saveJSON(TABLE_PATH, payload).then(function (res) {
      var body = res.body || {};
      if (!body.ok) {
        state.saving = false;
        state.err = (body.error || "保存失败") + (body.problems ? "：" + body.problems.join("；") : "") + "（HTTP " + res.status + "）";
        render();
        return;
      }
      state.report = body;
      /* merge 已改写 basic.json：同标签页浏览页（外壳 iframe 共享的 sessionStorage）必须立即失效，
       * 否则回到资料页最长 1h 还在读保存前的抓取值（BASIC_TTL 兜底）；init 里那次清只防「保存后重进本页」。 */
      if (YJ.selector && YJ.selector.clearBasicCache) YJ.selector.clearBasicCache();
      state.draft = {};
      state.note = "";
      state.editing = "";
      state.photos.mode = ""; state.photos.draft = []; state.photos.open = false;
      return refresh(true).then(function () { state.saving = false; render(); });
    });
  }

  /* 管道跑完后源表与 basic.json（含 dist 副本）都变了：带 cache-buster 重取，本页才显新值 */
  function refresh(withTable) {
    return getJSON(YJ_DATA.url("basic.json") + "?ts=" + Date.now()).then(function (d) {
      var hs = d && (Array.isArray(d) ? d : d.horses);
      if (hs && hs.length) {
        state.horses = hs;
        state.byId = {};
        hs.forEach(function (h) { state.byId[String(h.id)] = h; });
        if (state.horse && state.byId[String(state.horse.id)]) state.horse = state.byId[String(state.horse.id)];
      }
      return withTable ? loadTable().then(function (t) { state.table = t; }) : null;
    });
  }

  function init(opts) {
    ["form", "pins", "report", "banner", "save", "reset", "count", "dirtyTip", "selector", "photos", "tl",
      "mast", "summary", "preview"].forEach(function (k) {
      els[k] = document.getElementById(opts[k]);
    });
    state.port = resolvePort();
    var qid = new URLSearchParams(location.search).get("id");
    /* 编辑台只认盘上真值：先失效路 D 的 basic.json 共享缓存（否则「保存→merge 改完源表→重进本页」
     * 仍会从同标签页的 sessionStorage 读到保存前的抓取值；保存成功回调里也会再清一次，见 save()。
     * 仍未覆盖：其它标签页的浏览页各有缓存，跨标签页要等 1h TTL——sessionStorage 按标签隔离是 bus.js 的既定取舍） */
    if (YJ.selector && YJ.selector.clearBasicCache) YJ.selector.clearBasicCache();

    return probe().then(function () {
      return Promise.all([
        new Promise(function (resolve) {
          YJ.selector.init({
            el: els.selector,
            onSelect: setHorse,
            placeholder: "日文名 · 英文名 · 母名 · 马主 · 调教师 · id",
            /* cand2 定稿：左栏 = 常驻可检索马匹列表（与资料页同一组件、同一判定；MB 面积小退回弹层） */
            persistent: !YJ.device || YJ.device.isPc(),
            doubleName: true
          }).then(function (hs) { resolve(hs || []); }, function () { resolve([]); });
        }),
        loadTable(),
        loadTimeline()
      ]);
    }).then(function (r) {
      state.horses = r[0] || [];
      state.byId = {};
      state.horses.forEach(function (h) { state.byId[String(h.id)] = h; });
      state.table = r[1] || {};
      bind();
      /* 在线 = 本地编辑工具：选择器那份 basic.json 可能命中浏览器 HTTP 缓存（同 URL 启发式复用），
       * 开机再走一次带 cache-buster 的 no-store 读取，保证行内「生效值」= 上一次保存 merge 后的真值。 */
      var ready = state.online ? refresh(false) : Promise.resolve();
      return ready.then(function () {
        if (qid && state.byId[String(qid)]) YJ.selector.select(String(qid));
        render();
        applyTab();      /* ?tab=fields|timeline 直达并只展开目标段；无参数 = 全展开（现状） */
        return state;
      });
    });
  }

  return {
    init: init, probe: probe, FIELDS: FIELDS, state: state,
    /* 台账形态：行内编辑 + 分段折叠（?tab= 直达）；渲染态就是 state.editing / state.photos.open */
    openSec: openSec, applyTab: applyTab, render: render,
    /* M2b：压缩 + 入库链路（门禁/夹具直接调这些） */
    compressImage: compressImage, fetchRemote: fetchRemote, webpEncodable: webpEncodable,
    uploadFiles: uploadQueue, uploadURL: uploadURL,
    workingPhotos: workingPhotos, photoSrc: photoSrc, renderPhotos: renderPhotos,
    /* M2c：时间线人工节点 */
    TL_CATS: TL_CATS, loadTimeline: loadTimeline, saveTimeline: saveTimeline,
    tlPayload: tlPayload, renderTL: renderTL,
    writer: writer, localWriter: localWriter, setWriter: function (w) { writer = w; return writer; }
  };
})();
