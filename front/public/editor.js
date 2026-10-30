/* 云迹 · 编辑链路（YJ.editor）：M2a 五字段 + M2b 图片 + M2c 时间线人工节点；表单 + 校验 + 草稿 + 调 writer。
 * 双形态（2026-09 定稿）：mode "local" = edit_server 在线，直接保存（原管道不变）；
 * mode "draft" = 其余情况（线上打开 / 本地没开服务），编辑进浏览器草稿箱（字段 localStorage + 图片 IndexedDB），
 * 攒够一次性走 GitHub API 提交（Git Data API 单原子 commit，PAT 存 localStorage）→ push main 触发 CI（deploy.yml
 * 里 merge_basic + build_timeline）约 2 分钟生效。备注 _note 可选；时间线不再依赖本地手动重算（CI 自动）。
 * 图片（D8）：压缩全部在浏览器 canvas 里做完再入库 —— 本地 POST /photo；草稿态存 IndexedDB，提交时上传。
 * §104（2026-10-24）：白名单 4 = data/races_edits.json（比赛记录人工编辑，新页 edit-table.html +
 * public/editor-table.js 写入；本文件提供草稿段 d.rc / 提交合并 mergeRaceEdits / 公共草稿 API）。 */
window.YJ = window.YJ || {};
YJ.editor = (function () {
  "use strict";

  var esc = YJ.util.esc;
  var TABLE_PATH = "data/manual_overrides.json";   /* 白名单 1：字段 + photo */
  var TL_PATH = "data/timeline_manual.json";       /* 白名单 2：时间线人工节点（M2c） */
  var RM_PATH = "data/races_manual.json";          /* 白名单 3：比赛人工配图（§82.9：race.photo 是人工配置的产物，抓取永不写它） */
  var RE_PATH = "data/races_edits.json";           /* 白名单 4：比赛记录人工编辑（§104 批量表格写入；契约 = docs/SCHEMA.md §9） */
  var PHOTO_API = "/photo";                        /* M2b：multipart，服务端生成文件名（仅 local 形态） */
  var PHOTO_OWNER_TL = "timeline";                 /* 时间线节点图的文件名前缀（落盘 timeline-<n>.webp） */
  var DEFAULT_PORT = 8090;                          /* D13：单端口，静态服务同进程 */
  var PROBE_MS = 1800;
  /* 线上一次性提交（GitHub writer）：单仓库单分支，PAT 由编辑台「连接 GitHub」面板写入 localStorage */
  var GH_REPO = "hinotoyk/yunji-web", GH_BRANCH = "main";
  var GH_API = "https://api.github.com";
  /* §105 站点前缀键：同源本地双站（kzn/yunji）不串。**一律调用时求值**——加载期读 YJ_SITE 可能还是
   * undefined（页面脚本顺序），会静默退回旧共享键；改后任何加载顺序都安全。 */
  function tokenKey() { return YJ.util.storeKey("gh.token"); }
  function blobDbName() { return YJ.util.storeKey("edit-blobs"); }
  /* 草稿箱：字段/备注/图片清单/时间线表快照 → localStorage；图片二进制 → IndexedDB（localStorage 存不了 Blob） */
  function draftKey() { return YJ.util.DRAFT_KEY; }   /* 草稿键单一出处 = YJ.util.DRAFT_KEY（2026-xx 收口，与 profile 页共用） */
  var BLOB_STORE = "blobs";

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
   * 全部下拉/输入（§82.5 用户定稿：登録状態 瓦片改回下拉，与其它字段一致）。 */
  /* §94 字段拓展（用户定稿）：核心 4 字段 + 名号 2（自译/港译）+ 赏金成绩 5。毛色（2026-10-13 第二次修正：
   * 禁止修改）与 马名含义/出生年月/产地/母名/生产牧场 等档案字段不放开；kb_id 等技术键一律不开放
   * （2026-10 用户定稿：不开放 kb_id）。 */
  var FIELDS = [
    { key: "登録状態", kind: "select" },
    /* 抹消组（2026-10 去向调查）：登録状態=抹消 或 为空（未登録/空值）时才展开（formHTML 条件渲染）+ 实时预览行；
     * 用户定稿：只有确认去向才落库 → 只收 抹消日/種別/場所（推定/猜测不写入，不确定就只留抹消日）；
     * 種別 走 static 固定枚举（controlHTML），値契约 = docs/SCHEMA.md §1/§3（basic_io.py BASIC_FIELDS 同序）。
     * 下拉（2026-10 定稿）＝ 地方競馬/繁殖/乗馬/種馬（新增 种马）；海外 移出人工下拉——预留；
     * 2026-xx 用户决策：死亡 加回人工下拉（此前移出=抹消馬簿斃死自动映射，现允许空状态马手工选）。
     * 展示枚举仍全量，现值不在下拉时 controlHTML 追加显示。 */
    { key: "抹消日", kind: "text" },
    { key: "抹消_去向種別", kind: "select", static: ["地方競馬", "繁殖", "乗馬", "種馬", "死亡"] },
    { key: "抹消_去向場所", kind: "text", list: true },
    { key: "馬主", kind: "text", list: true },
    { key: "調教師", kind: "text", list: true },
    { key: "性別", kind: "select" },
    { key: "香港馬名", kind: "text" },
    { key: "自译馬名", kind: "text" },
    { key: "通算成績", kind: "text" },
    { key: "セリ取引価格", kind: "text" },
    { key: "獲得賞金 (中央)", kind: "text" },
    { key: "獲得賞金 (地方)", kind: "text" },
    { key: "総賞金", kind: "text" }
  ];
  /* 抹消组键清单：登録状態=抹消 或 为空 时才进表单（formHTML），改动时联动刷新预览行（softRefreshRow） */
  var MASYO_SUB = ["抹消日", "抹消_去向種別", "抹消_去向場所"];

  /* ?tab= 直达（horse 页只有 fields 段；timeline 页无折叠段） */
  var SECS = ["fields"];

  /* 外观类名一律指到 theme.css 的 .yj-ed-* 组件（§2：可复用组件类进 @layer，JS 串里只留类名）。
   * 只有纯一次性排布才在串内直接写 utility。 */
  var BTN = "yj-ed-op";
  var BTN_DIS = "yj-ed-op";
  var BTN_PRIMARY = "yj-ed-op yj-ed-op--primary";
  var BTN_DANGER = "yj-ed-op yj-ed-op--danger";
  var BTN_GHOST = "yj-ed-op yj-ed-op--ghost";
  var INPUT = "yj-ed-in";
  /* 紧凑下拉 = 与 selector compact 框同规格（h-26px / 10px 圆角 / 12px 字，§82.12）：
   * utility 层在 components（.yj-ed-in）之后 → h/rounded/text 覆盖生效（同旧 h-8 覆盖机制） */
  var SEL_CMP = "yj-ed-in h-[26px] rounded-[10px] px-2 py-0 text-[12px] font-normal";
  var BADGE_PIN = "yj-ed-state yj-ed-state--pin";
  var BADGE_DIRTY = "yj-ed-state yj-ed-state--dry";
  var BADGE_WARN = "yj-ed-state yj-ed-state--dry";
  var TIP = "text-[11px] text-muted-foreground";
  /* v3 空态入口卡图标（内联 SVG，stroke=currentColor；与页首分段导航同一套线条语言） */
  var ICO_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>';
  var ICO_AWARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>';
  /* 台账形态（profile 式）：一行一字段 + 照片位；类名一律完整字面量（content 扫得到 → @layer 不裁） */
  var VBADGE = "yj-ed-vbadge";
  var ROWEDIT_FOOT = "mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-muted/40 px-3 py-2";

  var state = {
    online: false, port: DEFAULT_PORT,
    /* mode："local" = edit_server 在线直连保存；"draft" = 草稿箱模式（线上 / 本地未启动都算，表单不禁用） */
    mode: "draft",
    /* page：页面形态 —— horse = edit.html（本马五字段+图片）；timeline = edit-timeline.html（航迹线人工节点） */
    page: "horse",
    boxOpen: false, ghPanel: false,
    /* 抽屉「已保存」段（§82.20）：savedOpen = 段展开（默认折叠）/ savedQ = 马名检索词 /
     * savedExp = 条目展开表（id → 1；检索态整体接管展开，不用它） */
    savedOpen: false, savedQ: "", savedExp: {},
    horses: [], byId: {}, table: {},
    horse: null, draft: {}, note: "", saving: false, report: null, err: "",
    /* 台账渲染态：editing = 正在行内编辑的字段键（同时只开一行，备注输入因此只有一份 #noteInput） */
    editing: "",
    /* M2b 图片草稿：mode "" = 未改 / set = 写成 list / remove = 恢复官方值（删键）；open = 入库面板展开 */
    photos: { mode: "", open: false, draft: [], busy: false, meta: {}, log: [], err: "", drag: -1, url: "" },
    /* M2c 时间线：table = 源表快照（保留 _readme 等顶层键），events = 工作副本，edit = 正在新增/编辑的节点
     * （edit.kind = "race"｜"free"：新增入口二选一；race = 引用比赛自动填 date/title/link）。
     * bundle = races-bundle 解码缓存（引用比赛选赛用），bundleFor = 已解码的马 id（切马重解码，全量解码一次后全马可用） */
    tl: { table: {}, events: [], loaded: false, dirty: false, busy: false, edit: null,
      err: "", report: null, del: -1, log: [], tlPhotos: {},
      refHorse: "", refRace: "", bundle: null, bundleFor: "",
      /* 比赛人工配图（§82.9）：raceManual = 盘上 races_manual.json；racePanel/raceHorse/raceSel = 面板选择态；
       * raceLog = 压缩日志；racePhUrl = 草稿图 objectURL 缓存（race_id → url）；改动本体在草稿箱 d.racePh */
      raceManual: {}, racePanel: false, raceHorse: "", raceSel: "", raceLog: [], raceBusy: false, racePhUrl: {} },
    /* GitHub 一次性提交态：busy / err / {url, files, secs} */
    gh: null, ghBusy: false
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

  /* ================= 草稿箱（draft 形态的落点）：字段/备注/图片清单 → localStorage；图片二进制 → IndexedDB =================
   * 形状：{ v:1, ov:{id:{字段:值|null, _note}}, ph:{id:{mode:"set"|"remove", list:[串|对象]}}, tl:{table}|null }
   * list 元素：串 = 盘上已有站内图；对象 = 草稿新图 {ref,ext,name,bytes,from,to,w,h,q,over}（ref = IndexedDB 键）。
   * 提交前这些改动只活在浏览器里，页面随便关；「提交到 GitHub」一次性打包成单个原子 commit。 */
  function draftRead() {
    /* 2026-10-26 修（§108）：统一补形——批量表格页只写 ov（从未有图片草稿）时，箱里可能没有
     * ph/racePh 键；渲染/提交侧有多处 d.ph[id] 直接下标访问，缺键即 TypeError（草稿箱打不开）。
     * 读出即补默认空对象，读侧全部安全；下次 draftWrite 顺手把旧箱补成完整形态。 */
    function blank() { return { ov: {}, ph: {}, racePh: {} }; }
    try {
      var o = JSON.parse(localStorage.getItem(draftKey()) || "{}");
      if (!o || typeof o !== "object") return blank();
      if (!o.ov || typeof o.ov !== "object") o.ov = {};
      if (!o.ph || typeof o.ph !== "object") o.ph = {};
      if (!o.racePh || typeof o.racePh !== "object") o.racePh = {};
      return o;
    } catch (e) { return blank(); }
  }
  function draftWrite(d) {
    try { localStorage.setItem(draftKey(), JSON.stringify(d)); } catch (e) { /* 隐身模式等存不进就静默 */ }
  }
  function ovGet(id) {
    var d = draftRead(), e = d.ov && d.ov[String(id)];
    return (e && typeof e === "object") ? JSON.parse(JSON.stringify(e)) : null;
  }
  function ovPut(id, entry) {
    var d = draftRead(); d.ov = d.ov || {};
    var keys = Object.keys(entry || {}).filter(function (k) { return k !== "_note"; });
    /* 2026-10-26 修：只写备注（无字段改动）也是合法草稿——此前 keys.length===0 连 _note 一起删，
     * 备注永远进不了草稿箱（改完刷新即丢，还因 draftCount 不计数而无法提交）。 */
    if (keys.length || (entry && entry._note)) d.ov[String(id)] = entry; else delete d.ov[String(id)];
    draftWrite(d);
  }
  function phGet(id) {
    var d = draftRead(), e = d.ph && d.ph[String(id)];
    return (e && typeof e === "object" && Array.isArray(e.list)) ? JSON.parse(JSON.stringify(e)) : null;
  }
  function phPut(id, entry) {
    var d = draftRead(); d.ph = d.ph || {};
    if (entry && entry.mode) d.ph[String(id)] = entry; else delete d.ph[String(id)];
    draftWrite(d);
  }
  function tlGet() { var d = draftRead(); return (d.tl && d.tl.table) ? d.tl.table : null; }
  function tlPut(table) { var d = draftRead(); d.tl = { table: table }; draftWrite(d); }
  function tlDrop() { var d = draftRead(); delete d.tl; delete d.tlPhotos; draftWrite(d); }
  function tlPhotoMetaPut(ref, meta) {   /* 时间线草稿图登记：ref → {ext,name,bytes}（提交时定正式文件名） */
    var d = draftRead(); d.tlPhotos = d.tlPhotos || {}; d.tlPhotos[ref] = meta; draftWrite(d);
  }
  /* 比赛人工配图改动（§82.9）：{mode:"set",item:{ref,ext,name,bytes}} | {mode:"remove"}；entry=null = 清掉该键改动 */
  function rmGet() { var d = draftRead(); return (d.racePh && typeof d.racePh === "object") ? d.racePh : {}; }
  function rmPut(rid, entry) {
    var d = draftRead(); d.racePh = d.racePh || {};
    if (entry) d.racePh[String(rid)] = entry; else delete d.racePh[String(rid)];
    draftWrite(d);
  }
  function rmDropAll() {                 /* 全部比赛配图草稿清箱（放弃修改/提交成功后），连带 IndexedDB 二进制 */
    var d = draftRead(), rm = d.racePh || {};
    Object.keys(rm).forEach(function (rid) {
      var c = rm[rid];
      if (c && c.mode === "set" && c.item && c.item.ref) blobDel(c.item.ref);
    });
    delete d.racePh;
    draftWrite(d);
    state.tl.racePhUrl = {}; state.tl.raceLog = [];
  }
  /* 比赛记录人工编辑（§104 批量表格）：{add:[记录], mod:[{id,race_id,日付,馬名,set:{字段:值|null}}], del:[…]}
   * 提交时叠加远端 data/races_edits.json（mergeRaceEdits），merge_races 每轮 fetch 合并后、派生前套用（SCHEMA §9） */
  function rcGet() {
    var d = draftRead(), r = d.rc;
    return (r && typeof r === "object" && !Array.isArray(r)) ? r : { add: [], mod: [], del: [] };
  }
  function rcPut(rc) {
    var d = draftRead();
    var has = rc && ((rc.add && rc.add.length) || (rc.mod && rc.mod.length) || (rc.del && rc.del.length));
    if (has) d.rc = rc; else delete d.rc;
    draftWrite(d);
  }
  function rcN() {
    var r = rcGet();
    return (r.add ? r.add.length : 0) + (r.mod ? r.mod.length : 0) + (r.del ? r.del.length : 0);
  }
  function draftDropHorse(id) {
    id = String(id);
    var d = draftRead(), items = [];
    if (d.ph && d.ph[id] && Array.isArray(d.ph[id].list)) {
      d.ph[id].list.forEach(function (it) { if (it && typeof it === "object" && it.ref) items.push(it.ref); });
    }
    if (d.ov) delete d.ov[id];
    if (d.ph) delete d.ph[id];
    draftWrite(d);
    items.forEach(function (r) { blobDel(r); });
  }
  function draftCount() {
    var d = draftRead(), n = 0;
    ["ov", "ph"].forEach(function (k) { if (d[k]) n += Object.keys(d[k]).length; });
    if (d.tl && d.tl.table) n++;
    if (d.racePh) n += Object.keys(d.racePh).length;
    if (d.rc) n += rcN();
    return n;
  }
  function draftHasHorse(id) { return !!(ovGet(id) || phGet(id)); }

  /* ---------------- IndexedDB 图片草稿（localStorage 存不了 Blob） ---------------- */
  function blobDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("浏览器不支持 IndexedDB")); return; }
      var rq = indexedDB.open(blobDbName(), 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(BLOB_STORE); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error("IndexedDB 打不开")); };
    });
  }
  function blobTx(db, mode) { return db.transaction(BLOB_STORE, mode).objectStore(BLOB_STORE); }
  function blobPut(ref, blob) {
    return blobDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var rq = blobTx(db, "readwrite").put(blob, ref);
        rq.onsuccess = function () { resolve(ref); };
        rq.onerror = function () { reject(rq.error || new Error("图片草稿写入失败")); };
      });
    });
  }
  function blobGet(ref) {
    return blobDB().then(function (db) {
      return new Promise(function (resolve) {
        var rq = blobTx(db, "readonly").get(ref);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      });
    }, function () { return null; });
  }
  function blobDel(ref) {
    return blobDB().then(function (db) {
      try { blobTx(db, "readwrite").delete(ref); } catch (e) { /* ignore */ }
    }, function () { /* ignore */ });
  }

  /* ---------------- GitHub 一次性提交（Git Data API：blobs → tree → commit → update ref，单原子 commit） ---------------- */
  function ghToken() {
    try { return (localStorage.getItem(tokenKey()) || "").trim(); } catch (e) { return ""; }
  }
  function ghSaveToken(t) { try { localStorage.setItem(tokenKey(), String(t || "").trim()); } catch (e) { /* ignore */ } }
  function ghClearToken() { try { localStorage.removeItem(tokenKey()); } catch (e) { /* ignore */ } }
  /* §105 切换说明：旧版把 PAT 记在无前缀的 yj.gh.token（两站共用一份，可能存的是另一站仓库的令牌）。
   * 站点前缀上线后**不自动继承**——避免把 kzn 的 PAT 装进 yunji（推送会 403/Action 失败）；
   * 有旧值且当前站未配时，在「连接 GitHub」面板提示重贴一次。 */
  function legacyTokenNote() {
    if (ghToken()) return "";
    var old = "";
    try { old = localStorage.getItem("yj.gh.token") || ""; } catch (e) { return ""; }
    if (!old.trim()) return "";
    return '<div class="mt-1 text-[10.5px] leading-[1.5] text-muted-foreground">' +
      "检测到旧版共享键里的令牌（§105 起存储按站点隔离，未自动继承，避免把另一站仓库的 PAT 带过来）：请重新粘贴本站仓库的 PAT，旧值不再被读取。</div>";
  }
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      "Authorization": "Bearer " + ghToken(),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, opts.headers || {});
    if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
    return fetch(GH_API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { status: r.status, ok: r.ok, body: j };
      });
    }, function () { return { status: 0, ok: false, body: { message: "网络错误，连不上 api.github.com" } }; });
  }
  function ghTestToken() {
    return gh("/user").then(function (r) {
      /* network = 请求根本没到 GitHub（gh() 的 status 0 兜底）——不是 token 的错，调用方不得据此清 token */
      return r.ok ? { ok: true, login: r.body.login }
        : { ok: false, network: r.status === 0, error: (r.body && r.body.message) || "HTTP " + r.status };
    });
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).replace(/^data:[^,]*,/, "")); };
      fr.onerror = function () { reject(new Error("图片读不出来（FileReader 失败）")); };
      fr.readAsDataURL(blob);
    });
  }
  function ghContents(path) {          /* 拿远端文件 {content, sha}；404 = 还没有这个文件 */
    return gh("/repos/" + GH_REPO + "/contents/" + path + "?ref=" + GH_BRANCH).then(function (r) {
      if (r.status === 404) return { sha: null, json: null };
      if (!r.ok) throw new Error("读 " + path + " 失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
      var json = null;
      try { json = JSON.parse(decodeURIComponent(escape(atob(String(r.body.content || "").replace(/\n/g, ""))))) || {}; } catch (e) { json = {}; }
      return { sha: r.body.sha || null, json: (json && typeof json === "object" && !Array.isArray(json)) ? json : {} };
    });
  }
  /* data/photos 现有文件名 → 每个前缀的下一个序号（与本地 edit_server 的 <owner>-<n>.<ext> 同一命名法） */
  function ghPhotoSeqs() {
    return gh("/repos/" + GH_REPO + "/git/trees/" + GH_BRANCH + "?recursive=0").then(function (r) {
      var treeSha = r.ok && r.body.tree ? (r.body.tree.filter(function (t) { return t.path === "data"; })[0] || {}).sha : null;
      if (!treeSha) return { names: {}, truncated: false };
      return gh("/repos/" + GH_REPO + "/git/trees/" + treeSha).then(function (r2) {
        var ph = r2.ok && r2.body.tree ? (r2.body.tree.filter(function (t) { return t.path === "photos"; })[0] || {}).sha : null;
        if (!ph) return { names: {}, truncated: false };
        return gh("/repos/" + GH_REPO + "/git/trees/" + ph).then(function (r3) {
          var names = {}, tr = !!(r3.body && r3.body.truncated);
          (r3.ok && r3.body.tree ? r3.body.tree : []).forEach(function (t) {
            var m = /^(.+)-(\d+)\.[a-z0-9]+$/i.exec(t.path || "");
            if (m) { names[m[1]] = Math.max(names[m[1]] || 0, Number(m[2])); }
          });
          return { names: names, truncated: tr };
        });
      });
    });
  }

  /* ---------------- 草稿 ⇄ 页面状态（draft 形态下自动持久化 / 换马回填） ---------------- */
  function persistHorse() {
    if (state.mode !== "draft" || !state.horse) return;
    var id = String(state.horse.id);
    /* 2026-10-26 修（§107）：字段草稿**叠加落箱**而非整条替换——打底 = 箱里现值（可能含别的
     * 标签页新写的键），本页 state 覆盖其上。旧逻辑整条替换，双开编辑页时后写的一方会把
     * 先写方该匹的字段草稿整条抹掉（「修改信息莫名消失」的跨页形态）。 */
    var entry = {};
    var base = ovGet(id);
    if (base) Object.keys(base).forEach(function (k) { entry[k] = base[k]; });
    Object.keys(state.draft).forEach(function (k) { entry[k] = state.draft[k]; });
    var note = String(state.note || "").trim();
    if (note) entry._note = note;
    else if (base && base._note) entry._note = base._note;   /* 备注留空 = 保留旧备注（与 buildPayload 同口径） */
    ovPut(id, entry);
    persistPhotosOf(id);
  }
  /* 图片草稿单独落箱（2026-10-26 修，§107）：上传/删图后链路里只有 renderPhotos（不触发 render→
   * persistHorse），state.photos 的改动一度只活在内存——此刻切马/关页/iframe 换页 = 图片草稿凭空
   * 消失（IndexedDB 里只剩孤儿 blob）。每次图片态变更立即写；**内容没变不写**（快照去重，防别的
   * 标签页刚写进箱的新图被本页的旧镜像盖回去）。 */
  function persistPhotosOf(id) {
    if (state.mode !== "draft") return;
    if (String(state.horse && state.horse.id) !== String(id)) return;
    var ph = null;
    if (state.photos.mode === "set") ph = { mode: "set", list: state.photos.draft.slice() };
    else if (state.photos.mode === "remove") ph = { mode: "remove", list: [] };
    var snap = JSON.stringify(ph);
    if (state.photos._saved === snap) return;
    state.photos._saved = snap;
    phPut(String(id), ph);
  }
  function hydrateHorse() {
    if (state.mode !== "draft" || !state.horse) return;
    var id = String(state.horse.id);
    var e = ovGet(id);
    state.draft = {};
    if (e) Object.keys(e).forEach(function (k) { if (k !== "_note") state.draft[k] = e[k]; });
    state.note = (e && e._note) ? String(e._note) : "";
    var ph = phGet(id);
    state.photos.mode = ph ? ph.mode : "";
    state.photos.draft = (ph && ph.mode === "set") ? ph.list.slice() : [];
    state.photos.meta = {};
    state.photos._saved = JSON.stringify((ph && ph.mode) ? ph : null);   /* 落箱去重基线（§107） */
    hydratePhotoURLs();
  }
  function hydratePhotoURLs() {   /* 草稿新图 → objectURL（进 meta 内存缓存），缩略图才有 src */
    (state.photos.draft || []).forEach(function (it) {
      if (!it || typeof it !== "object" || !it.ref) return;
      var marker = "draft:" + it.ref;
      state.photos.meta[marker] = state.photos.meta[marker] || { bytes: it.bytes, draft: true };
      var m = state.photos.meta[marker];
      if (m.url) return;
      blobGet(it.ref).then(function (b) {
        if (b) { m.url = URL.createObjectURL(b); renderPhotos(); }
      });
    });
  }

  /* ---------------- 一次性提交：把草稿箱叠到远端最新表上 → 单原子 commit 推 main ----------------
   * 步骤：ref → 远端两表（contents，拿 sha）→ 图片 blob 上传（<owner>-<n>.<ext> 与本地服务同命名法）
   * → 合并草稿（首次人工补 _orig 快照）→ tree → commit → update ref（422 冲突整链重试一次）。 */
  /* 比赛编辑表合并（§104）：远端 races_edits + 草稿 rc → 提交表。
   * 规则：同组键（id + race_id/日付）草稿覆盖远端；del 连带清同键 mod；草稿 add 与远端 add 双键
   * 同键 → 草稿替换；草稿重建了远端已删的行 → 自动撤那条 del（否则后端会先把重加的行删掉）。 */
  function mergeRaceEdits(remote, rc) {
    var out = { _readme: "比赛记录人工编辑表（编辑台·批量表格写入；契约 = docs/SCHEMA.md §9；merge_races 每轮 fetch 合并后、派生前套用）", del: [], mod: [], add: [] };
    var delK = {}, modK = {}, addK = {};
    function gk(t) {
      return String(t && t.id != null ? t.id : "") + "|" + (t && t.race_id ? "r" + t.race_id : "d" + String((t && t.日付) || ""));
    }
    function rks(r) {
      var ks = [];
      if (r && r.race_id) ks.push("r:" + String(r.race_id));
      var nm = String((r && r.出走馬名) || "").trim(), dt = String((r && r.日付) || "").trim();
      if (nm && dt) ks.push("h:" + nm + "|" + dt);
      return ks;
    }
    function putDel(t) {
      var k = gk(t);
      if (!delK[k]) { delK[k] = 1; out.del.push(t); }
      if (modK[k] !== undefined) { out.mod.splice(modK[k], 1); delete modK[k]; }   /* 删连带清同键 mod */
    }
    function putMod(t) {
      var k = gk(t);
      if (delK[k]) return;
      if (modK[k] !== undefined) out.mod[modK[k]] = t;
      else { modK[k] = out.mod.length; out.mod.push(t); }
    }
    function putAdd(r) {
      var ks = rks(r), hit = -1;
      Object.keys(addK).forEach(function (k) { if (hit < 0 && ks.indexOf(k) >= 0) hit = addK[k]; });
      if (hit >= 0) { out.add[hit] = r; return; }
      addK[ks[0] || "row:" + out.add.length] = out.add.length;
      out.add.push(r);
      for (var i = out.del.length - 1; i >= 0; i--) {   /* 重建行 → 撤同键 del */
        if (rks(out.del[i]).some(function (x) { return ks.indexOf(x) >= 0; })) {
          delete delK[gk(out.del[i])];
          out.del.splice(i, 1);
        }
      }
    }
    var rem = (remote && typeof remote === "object" && !Array.isArray(remote)) ? remote : {};
    (rem.del || []).forEach(function (t) { if (t && typeof t === "object") putDel(t); });
    (rem.mod || []).forEach(function (t) { if (t && typeof t === "object" && t.set) putMod(t); });
    (rem.add || []).forEach(function (r) { if (r && typeof r === "object") putAdd(r); });
    (rc.del || []).forEach(function (t) { if (t && typeof t === "object") putDel(t); });
    (rc.mod || []).forEach(function (t) { if (t && typeof t === "object" && t.set) putMod(t); });
    (rc.add || []).forEach(function (r) { if (r && typeof r === "object") putAdd(r); });
    return out;
  }

  /* 提交成功 → 盯 CI 发布（Deploy run 跑完）→ 本页自动拉最新数据重渲染（2026-10-26，§106）。
   * 30s × 12 次（6min）封顶；页面关了即止（下次打开 init 本来就拿最新）。runs API 不可用
   * （限流等）退回看 main 是否出现新提交（CI 重算落库）。 */
  function watchCI(pushSha) {
    if (watchCI.timer) clearInterval(watchCI.timer);
    var tries = 0;
    function finish() {
      clearInterval(watchCI.timer); watchCI.timer = null;
      if (window.YJ && window.YJ.cache && YJ.cache.bust) YJ.cache.bust();   /* 此刻线上产物才真正变 */
      refresh(true).then(function () {
        if (state.gh && state.gh.ok) state.gh.ci = "CI 已发布 · 本页数据已自动刷新（全站数据缓存已失效重取）";
        render();
      });
    }
    watchCI.timer = setInterval(function () {
      if (++tries > 12 || state.ghBusy) { clearInterval(watchCI.timer); watchCI.timer = null; return; }
      gh("/repos/" + GH_REPO + "/actions/runs?per_page=5").then(function (r) {
        var runs = (r.ok && r.body && r.body.workflow_runs) || [];
        var hit = runs.filter(function (w) {
          return String(w.head_sha || "").indexOf(pushSha) === 0 && String(w.name || "").indexOf("Deploy") >= 0;
        })[0];
        if (hit && hit.status === "completed" && hit.conclusion === "success") { finish(); return; }
        if (!r.ok || r.status === 0) {   /* runs 拿不到 → 退回 commits 探测 */
          gh("/repos/" + GH_REPO + "/commits/main").then(function (r2) {
            var sha = r2.ok && r2.body && r2.body.sha;
            if (sha && sha !== pushSha) finish();
          });
        }
      });
    }, 30000);
  }

  function submitDrafts() {
    if (state.ghBusy) return Promise.resolve();
    if (!ghToken()) {
      state.gh = { err: "先在「连接 GitHub」里粘贴一个 fine-grained PAT（仅本仓库 · Contents 读写）。" };
      state.ghPanel = true; render();
      return Promise.resolve();
    }
    if (!draftCount()) { state.gh = { err: "草稿箱是空的，先改点东西。" }; render(); return Promise.resolve(); }
    state.ghBusy = true; state.gh = { busy: true, log: ["读取远端…"] }; render();
    var t0 = Date.now();
    function run(remaining) {
      var baseSha, treeSha, tableSha, tlSha, remoteTable, seqs, uploads = [], committed = {};
      var rmSha, rmRemote, rmOut = {}, rmIds = [], rmCommitted = false;   /* 比赛人工配图（§82.9） */
      var reRemote, reN = 0, reCommitted = false;                         /* 比赛人工编辑表（§104） */
      return gh("/repos/" + GH_REPO + "/git/ref/heads/" + GH_BRANCH).then(function (r) {
        if (!r.ok) throw new Error("读分支失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
        baseSha = r.body.object.sha;
        return gh("/repos/" + GH_REPO + "/git/commits/" + baseSha);
      }).then(function (r) {
        if (!r.ok) throw new Error("读提交失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
        treeSha = r.body.tree.sha;
        state.gh.log = ["读远端人工表…"]; render();
        return ghContents(TABLE_PATH);
      }).then(function (c) {
        tableSha = c.sha; remoteTable = c.json || {};
        return ghContents(TL_PATH);
      }).then(function (c) {
        tlSha = c.sha;
        return ghContents(RM_PATH);
      }).then(function (c) {
        rmSha = c.sha; rmRemote = c.json || {};
        return ghContents(RE_PATH);
      }).then(function (c) {
        reRemote = c.json || {};
        state.gh.log = ["清点图片命名…"]; render();
        return ghPhotoSeqs();
      }).then(function (s) {
        seqs = s;
        var d = draftRead();
        var jobs = Promise.resolve();
        Object.keys(d.ph || {}).forEach(function (id) {
          var ph = d.ph[id];
          if (ph.mode !== "set") return;
          var owner = String(id), next = seqs.names[owner] || 0, out = [];
          jobs = jobs.then(function () {
            return ph.list.reduce(function (p, it) {
              return p.then(function () {
                if (typeof it === "string") { out.push(it); return null; }
                next++;
                var name = owner + "-" + next + "." + (it.ext || "webp");
                return blobGet(it.ref).then(function (b) {
                  if (!b) throw new Error("草稿图读不回来（" + it.ref + "），请删掉重传");
                  return blobToBase64(b);
                }).then(function (b64) {
                  return gh("/repos/" + GH_REPO + "/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } });
                }).then(function (r) {
                  if (!r.ok) throw new Error("图片上传失败（" + name + "）：" + ((r.body && r.body.message) || "HTTP " + r.status));
                  uploads.push({ path: "data/photos/" + name, sha: r.body.sha });
                  out.push("data/photos/" + name);
                });
              });
            }, Promise.resolve()).then(function () { committed[id] = out; });
          });
        });
        /* 时间线草稿图：photo 里的 draft:tl:<ref> 标记 → timeline-<n>.<ext> */
        if (d.tl && d.tl.table && Array.isArray(d.tl.table.events)) {
          var nextTl = seqs.names[PHOTO_OWNER_TL] || 0;
          jobs = jobs.then(function () {
            return d.tl.table.events.reduce(function (p, ev) {
              return p.then(function () {
                var ph = String((ev && ev.photo) || "");
                if (ph.indexOf("draft:tl:") !== 0) return null;
                var ref = ph.slice("draft:tl:".length);
                nextTl++;
                var item = (d.tlPhotos && d.tlPhotos[ref]) || {};
                var name = PHOTO_OWNER_TL + "-" + nextTl + "." + (item.ext || "webp");
                return blobGet(ref).then(function (b) {
                  if (!b) throw new Error("时间线草稿图读不回来（" + ref + "），请删掉重传");
                  return blobToBase64(b);
                }).then(function (b64) {
                  return gh("/repos/" + GH_REPO + "/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } });
                }).then(function (r) {
                  if (!r.ok) throw new Error("时间线图片上传失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
                  uploads.push({ path: "data/photos/" + name, sha: r.body.sha });
                  ev.photo = "../data/photos/" + name;
                });
              });
            }, Promise.resolve());
          });
        }
        /* 比赛人工配图（§82.9）：草稿改动 → data/photos/<race_id>-<n>.<ext> + races_manual.json */
        var dRm = d.racePh || {};
        rmIds = Object.keys(dRm).filter(function (k) {
          var v = dRm[k];
          return v && (v.mode === "remove" || (v.mode === "set" && v.item && v.item.ref));
        });
        if (rmIds.length) {
          jobs = jobs.then(function () {
            return rmIds.reduce(function (p, rid) {
              return p.then(function () {
                var ch = dRm[rid];
                if (ch.mode === "remove") { rmOut[rid] = null; return null; }
                var it = ch.item;
                var name = rid + "-" + ((seqs.names[rid] || 0) + 1) + "." + (it.ext || "webp");
                return blobGet(it.ref).then(function (b) {
                  if (!b) throw new Error("比赛配图读不回来（" + it.ref + "），请删掉重传");
                  return blobToBase64(b);
                }).then(function (b64) {
                  return gh("/repos/" + GH_REPO + "/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } });
                }).then(function (r) {
                  if (!r.ok) throw new Error("比赛配图上传失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
                  uploads.push({ path: "data/photos/" + name, sha: r.body.sha });
                  rmOut[rid] = { photo: "../data/photos/" + name };
                });
              });
            }, Promise.resolve());
          });
        }
        return jobs;
      }).then(function () {
        state.gh.log = ["合并草稿…"]; render();
        var d = draftRead();
        var table = JSON.parse(JSON.stringify(remoteTable || {}));
        Object.keys(d.ov || {}).forEach(function (id) {
          var h = state.byId[id];
          var ent = (table[id] && typeof table[id] === "object" && !Array.isArray(table[id]))
            ? JSON.parse(JSON.stringify(table[id])) : {};
          Object.keys(d.ov[id]).forEach(function (k) {
            if (k === "_note") return;
            var v = d.ov[id][k];
            var had = Object.prototype.hasOwnProperty.call(ent, k);
            if (v === null) { delete ent[k]; return; }
            if (!had) {   /* 首次人工保存 → 补官方值快照（与 edit_server 同口径：_orig 不参与合并） */
              ent._orig = (ent._orig && typeof ent._orig === "object") ? ent._orig : {};
              if (!Object.prototype.hasOwnProperty.call(ent._orig, k)) ent._orig[k] = h ? valOf(h, k) : "";
            }
            ent[k] = v;
          });
          if (d.ov[id]._note) ent._note = d.ov[id]._note;
          var hasPin = Object.keys(ent).some(function (k) { return k[0] !== "_"; });
          /* 2026-10-26 修：纯备注草稿（无字段/图片改动）也要落表，否则提交即丢备注 */
          if (hasPin || ent._note) table[id] = ent; else delete table[id];
        });
        /* 照片（d.ph）独立于人工字段循环（2026-10-08 修）：此前嵌在 d.ov 循环里，只传照片
         * 不存任何人工字段的马 → 图片文件入库但 manual_overrides 无 photo 条目（孤儿图，
         * 乘天风/66 案例 715e836）。mode set/remove 的马无条件写/删 photo 条目，与上传通道对齐。 */
        Object.keys(d.ph || {}).forEach(function (id) {
          var mode = d.ph[id] && d.ph[id].mode;
          if (mode !== "set" && mode !== "remove") return;
          var h = state.byId[id];
          var ent = (table[id] && typeof table[id] === "object" && !Array.isArray(table[id]))
            ? JSON.parse(JSON.stringify(table[id])) : {};
          if (mode === "set") {
            if (!Object.prototype.hasOwnProperty.call(ent, "photo") && !(ent._orig && ent._orig.photo)) {
              ent._orig = (ent._orig && typeof ent._orig === "object") ? ent._orig : {};
              ent._orig.photo = h ? normList(h.photo) : [];
            }
            ent.photo = committed[id] || [];
          } else { delete ent.photo; }   /* mode === "remove"：恢复官方值 = 删键 */
          var hasPin = Object.keys(ent).some(function (k) { return k[0] !== "_"; });
          if (hasPin) table[id] = ent; else delete table[id];
        });
        var tree = [{ path: TABLE_PATH, mode: "100644", type: "blob", sha: null }];
        var jobs2 = gh("/repos/" + GH_REPO + "/git/blobs", {
          method: "POST", body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(table)))), encoding: "base64" }
        }).then(function (r) {
          if (!r.ok) throw new Error("人工表上传失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
          tree[0].sha = r.body.sha;
          function rmCommit() {   /* 比赛配图表：远端 races_manual 叠加本次改动（null = 删键），有改动才进 tree */
            /* 2026-10-26 修：恒回 promise——rmCommit().then(reCommit) 在无比赛配图草稿时对 null.then
             * 抛 TypeError（「Cannot read properties of null (reading 'then')」），纯马匹字段/图片改动
             * 的提交全炸（§104 a2dd6fb 引入；当日首提成功只因带了比赛配图 1）。做 .then 回调时
             * Promise.resolve() 与 null 行为一致，两条调用路径（665 / 671）都安全。 */
            if (!rmIds.length) return Promise.resolve();
            var rmTable = JSON.parse(JSON.stringify(rmRemote || {}));
            rmIds.forEach(function (rid) {
              if (rmOut[rid] === null) delete rmTable[rid]; else rmTable[rid] = rmOut[rid];
            });
            return gh("/repos/" + GH_REPO + "/git/blobs", {
              method: "POST", body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(rmTable)))), encoding: "base64" }
            }).then(function (r3) {
              if (!r3.ok) throw new Error("比赛配图表上传失败：" + ((r3.body && r3.message) || "HTTP " + r3.status));
              tree.push({ path: RM_PATH, mode: "100644", type: "blob", sha: r3.body.sha });
              rmCommitted = true;
            });
          }
          function reCommit() {   /* 比赛编辑表（§104）：远端 races_edits 叠加草稿 rc，有改动才进 tree */
            var dNow = draftRead();
            if (!dNow.rc) return Promise.resolve();   /* 同 rmCommit：恒回 promise，防后续被直接 .then */
            var reTable = mergeRaceEdits(reRemote, dNow.rc);
            reN = (reTable.add || []).length + (reTable.mod || []).length + (reTable.del || []).length;
            if (!reN) return null;
            return gh("/repos/" + GH_REPO + "/git/blobs", {
              method: "POST", body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(reTable)))), encoding: "base64" }
            }).then(function (r4) {
              if (!r4.ok) throw new Error("比赛编辑表上传失败：" + ((r4.body && r4.message) || "HTTP " + r4.status));
              tree.push({ path: RE_PATH, mode: "100644", type: "blob", sha: r4.body.sha });
              reCommitted = true;
            });
          }
          if (!(d.tl && d.tl.table)) return rmCommit().then(reCommit);
          return gh("/repos/" + GH_REPO + "/git/blobs", {
            method: "POST", body: { content: btoa(unescape(encodeURIComponent(JSON.stringify(d.tl.table)))), encoding: "base64" }
          }).then(function (r2) {
            if (!r2.ok) throw new Error("时间线表上传失败：" + ((r2.body && r2.message) || "HTTP " + r2.status));
            tree.push({ path: TL_PATH, mode: "100644", type: "blob", sha: r2.body.sha });
          }).then(rmCommit).then(reCommit);
        });
        return jobs2.then(function () {
          /* 照片 blob 装进 tree（2026-10-01 审计补）：此前 uploads 只进成功报告、从不进 tree，
           * 编辑台提交的照片全部成了孤儿 blob，表里引用的 data/photos/*.webp 在仓库中不存在
           *（线上实测：races_manual 引用 4-1.webp，photos 目录无此文件）。比赛图/马图两条路径同修。 */
          uploads.forEach(function (u) { tree.push({ path: u.path, mode: "100644", type: "blob", sha: u.sha }); });
          return { d: d, tree: tree };
        });
      }).then(function (pack) {
        state.gh.log = ["建 tree/commit…"]; render();
        return gh("/repos/" + GH_REPO + "/git/trees", { method: "POST", body: { base_tree: treeSha, tree: pack.tree } }).then(function (r) {
          if (!r.ok) throw new Error("建 tree 失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
          var d = pack.d;
          var nH = Object.keys(d.ov || {}).length;
          var nP = Object.keys(d.ph || {}).filter(function (k) { return d.ph[k].mode === "set"; }).length;
          var msg = "edit: 编辑台草稿一次性提交（" + nH + " 匹人工值" + (nP ? " · " + nP + " 匹图片" : "") +
            (d.tl && d.tl.table ? " · 时间线表" : "") + (rmIds.length ? " · 比赛配图 " + rmIds.length : "") +
            (reN ? " · 比赛编辑 " + reN : "") + "）";
          return gh("/repos/" + GH_REPO + "/git/commits", {
            method: "POST", body: { message: msg, tree: r.body.sha, parents: [baseSha] }
          });
        });
      }).then(function (r) {
        if (!r.ok) throw new Error("建 commit 失败：" + ((r.body && r.body.message) || "HTTP " + r.status));
        return gh("/repos/" + GH_REPO + "/git/refs/heads/" + GH_BRANCH, {
          method: "PATCH", body: { sha: r.body.sha, force: false }
        }).then(function (r2) {
          if (!r2.ok) throw Object.assign(new Error("ref-conflict"), { refConflict: true, newSha: r.body.sha });
          return r.body;
        });
      }).then(function (commit) {
        var d = draftRead();
        var hadTL = !!(d.tl && d.tl.table);
        Object.keys(d.ov || {}).concat(Object.keys(d.ph || {})).forEach(function (id) { draftDropHorse(id); });
        if (hadTL) {
          Object.keys(d.tlPhotos || {}).forEach(function (ref) { blobDel(ref); });
          tlDrop();
        }
        if (rmIds.length) rmDropAll();   /* 比赛配图草稿清箱（含 IndexedDB 二进制） */
        if (reCommitted) {               /* 比赛编辑草稿清箱（§104）+ 通知批量表格页重新水合 */
          var dRe = draftRead(); delete dRe.rc; draftWrite(dRe);
          document.dispatchEvent(new CustomEvent("yj-rc-dropped"));
        }
        /* 提交成功 → 清空本页内存草稿（2026-xx 修）：上面只删了 localStorage 里的草稿，
         * state.draft / state.note / state.photos 仍留着 → 紧接着 render() 里 persistHorse()
         * 会把当前马草稿原样写回 localStorage，草稿箱永远删不掉（commit 已推远端却还挂着）。 */
        state.draft = {}; state.note = ""; state.err = ""; state.editing = "";
        state.photos.mode = ""; state.photos.draft = []; state.photos.meta = {}; state.photos.open = false;
        state.ghBusy = false;
        state.gh = {
          ok: true, secs: (Date.now() - t0) / 1000,
          url: "https://github.com/" + GH_REPO + "/commit/" + commit.sha,
          files: uploads.map(function (u) { return u.path; })
            .concat([TABLE_PATH]).concat(hadTL ? [TL_PATH] : []).concat(rmCommitted ? [RM_PATH] : [])
            .concat(reCommitted ? [RE_PATH] : [])
        };
        state.tl.dirty = false;
        /* 2026-10-26 修（§106）：提交成功即盖全站缓存失效戳——各浏览页的数据缓存（yj-cache 12h /
         * selector 路 D 1h）立刻作废，CI 发布完刷新页面即得最新数据，不再吃最长半天的旧值。 */
        if (window.YJ && window.YJ.cache && YJ.cache.bust) YJ.cache.bust();
        watchCI(commit.sha);
        return Promise.all([loadTable(), loadTimeline()]).then(function (r) {
          state.table = r[0] || {};
          render();
          /* 2026-10-30 修（§143）：提交成功 → 通知批量表格页**全量重水合**。
           * 此前只有 reCommitted 分支派发 yj-rc-dropped；基本信息（ov）草稿虽然在上面的
           * draftDropHorse() 里已清空 localStorage，但表格页内存中的 S.pendOv / S.sh.basic.rows
           * 仍是提交前的值 → 用户看到「提交成功了，表格还显示改过的值，像没生效」；
           * 更糟的是再改一格时 syncOv() 会用旧 S.startOv 把已提交的值重新写回草稿箱。
           * 放在 loadTable() 之后派发：此时 state.table 已换成最新远端表，表格页重算 savedOf 才准。 */
          document.dispatchEvent(new CustomEvent("yj-draft-committed"));
        });
      }).catch(function (e) {
        if (e && e.refConflict && remaining > 0) {
          state.gh.log = ["分支被抢先更新，重试…"]; render();
          return run(remaining - 1);
        }
        state.ghBusy = false;
        state.gh = { err: e && e.message ? e.message : "提交失败" };
        render();
      });
    }
    return run(1);
  }

  /* 端口可配：?port= > localStorage[storeKey('edit.port')] > 8090 */
  function resolvePort() {
    var q = new URLSearchParams(location.search).get("port");
    var ls = null;
    try { ls = localStorage.getItem(YJ.util.storeKey("edit.port")); } catch (e) { /* 禁 storage 时忽略 */ }
    var p = q || ls;
    return (p && /^\d{2,5}$/.test(p)) ? p : DEFAULT_PORT;
  }

  /* 页面本身跑在本机（127.0.0.1 / localhost）才去探测 edit_server；线上页面（https://www.yunji.xyz）
   * 一律不跨源探测 —— Chrome 142+ 的本地网络限制会拦且要弹权限（2026-09 改案：线上直接走草稿箱模式） */
  function isLocalPage() {
    return /^(127\.0\.0\.1|localhost)$/.test(String(location.hostname || ""));
  }

  function probe() {
    if (!isLocalPage()) { state.online = false; return Promise.resolve(false); }
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, PROBE_MS) : null;
    return fetch(origin() + "/healthz", { cache: "no-store", signal: ctl && ctl.signal }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.ok ? r.text() : "";
    }, function () { if (timer) clearTimeout(timer); return ""; }).then(function (t) {
      state.online = (String(t).trim() === "ok");
      state.mode = state.online ? "local" : "draft";
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
    /* §94 中文单显：枚举字典命中 → 只显中文（黑鹿毛/现役/母），未收录回退原值；不再「原值（中文）」双写 */
    return YJ.i18n.e(f.key, v) || (f.labels && f.labels[v]) || v;
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
  /* 草稿写入的唯一入口（2026-10-30 修 bug）：输入框改回「原值」时必须删掉 draft 键。
   * 原实现是 `state.draft[key] = value` 无条件写入，而 isDirty 只判断「键在不在」，
   * 于是「输入 1 → 删空」后键仍在（值 ""）→ 行永远停在草稿态（浅橙底 + 草稿 chip），
   * 草稿箱里也留着一条与线上无差异的改动。基线取值链与 currentValue 同源：
   * 已存人工值 ?? 官方生效值（pinned 优先，否则 basic.json 合并值）。
   * ⚠ 命名不能叫 setDraft：本文件照片模块已有 `setDraft(list)`（第 ~1476 行，同一闭包），
   *   函数声明提升下后定义者胜出，字段输入会调进照片逻辑，把字段名当图片路径写进 ph 草稿
   *   （实测症状：localStorage 里 ph={mode:"set",list:["香港馬名"]}、ov 空、输入框值被清空）。 */
  function draftBaseline(key) {
    var p = pinned(state.horse.id, key);
    return p !== undefined ? String(p) : valOf(state.horse, key);
  }
  function putFieldDraft(key, val) {
    var v = (val === null || val === undefined) ? "" : String(val);
    if (v !== draftBaseline(key)) { state.draft[key] = v; return; }
    /* 改回基线值 = 该字段彻底没有改动：内存键 + 落箱键都要删。
     * 只删内存不够 —— hydrateHorse() 每次渲染都从 ovGet() 重灌 state.draft，
     * 箱里那条旧值会立刻复活，表现为「清空后状态看着对了，但草稿箱仍计 1 处、
     * 刷新后浅橙底和「草稿」chip 又回来了」。 */
    delete state.draft[key];
    var id = String(state.horse.id);
    var e = ovGet(id);
    if (e && Object.prototype.hasOwnProperty.call(e, key)) {
      delete e[key];
      ovPut(id, e);   /* keys 空且无 _note 时 ovPut 整条删除；有备注则只留 _note */
    }
  }
  function hasDraft() { return Object.keys(state.draft).length > 0; }
  function hasChanges() { return hasDraft() || photoDirty(); }
  /* 不含草稿的「已生效值」：人工保存值优先，否则官方抓取值（变更摘要与状态条的唯一口径） */
  function savedVal(key) {
    var p = pinned(state.horse.id, key);
    return p !== undefined ? String(p) : valOf(state.horse, key);
  }
  /* 一个字段（或整页）当前处于哪一档：saved（已存人工值）/ pending（待保存/草稿）/ idle（与官方一致） */
  function fieldState(key) {
    var f = fieldOf(key);
    if (isDirty(f)) return "pending";
    return pinned(state.horse.id, key) !== undefined ? "saved" : "idle";
  }
  function stateWord(st) {
    if (st === "saved") return "已保存";
    if (st === "pending") return state.mode === "draft" ? "草稿" : "待保存";
    return "与官方一致";
  }
  /* 保存清单里 photo 的显示（数组直接 String() 会糊成一长串路径）；§94 枚举值中文单显（毛色/性別/登録状態） */
  function pinValueText(k, v) {
    if (k === "photo") {
      var l = normList(v);
      return l.length ? l.length + " 张（" + photoName(l[0]) + (l.length > 1 ? "…" : "") + "）" : "确无图片";
    }
    var s = (v === "" || v === null || v === undefined) ? "（空）" : String(v);
    return s === "（空）" ? s : (YJ.i18n.e(k, s) || s);
  }
  function noteOf(id) { var e = entryOf(id); return e && e._note ? String(e._note) : ""; }
  function noteChanged() { return !!state.note && state.note !== noteOf(state.horse && state.horse.id); }

  function controlHTML(f) {
    var v = currentValue(f);
    if (f.kind === "select") {
      /* f.static：固定枚举（抹消组 2026-10）；否则现值去重（登録状態/性別 等既有行为不变）。
       * 现值不在固定枚举（存量 地方競馬，下拉 2026-10 收窄）→ 追加为选项，防保存误写空值。 */
      var opts = f.static ? [""].concat(f.static) : distinct(f.key, false);
      if (f.static && v && opts.indexOf(v) < 0) opts = opts.concat(v);
      return '<select data-f="' + esc(f.key) + '" class="' + INPUT + ' font-normal">' +
        opts.map(function (x) {
          return '<option value="' + esc(x) + '"' + (x === v ? " selected" : "") + ">" + esc(optLabel(f, x)) + "</option>";
        }).join("") + "</select>";
    }
    var opts = distinct(f.key, true);
    var html = '<input data-f="' + esc(f.key) + '" list="dl-' + esc(f.key) + '" value="' + esc(v) +
      '" class="' + INPUT + '" autocomplete="off" placeholder="留空 = 官方值/无">';
    if (f.list) {
      html += '<datalist id="dl-' + esc(f.key) + '">' + opts.map(function (x) {
        return '<option value="' + esc(x) + '"></option>';
      }).join("") + "</datalist>";
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
      if (v === "セ" || v === "セン") return '<span class="' + VBADGE + ' bg-[#EFEFEF] text-[#5A5A5A]">⚲ 骟</span>';
    }
    return esc(shown);
  }

  /* §93 备注简显：取「YYYY-MM-DD 短标题：」前缀（时间 + 冒号前的短语）作一行摘要，全文放 title 悬停可看。
   * 备注正文不动（提交时仍整段入库）——只是清单/抽屉里不再整段铺开；写备注时也建议一行说完。 */
  function noteBrief(note) {
    var s = String(note || "").trim();
    var m = s.match(/^(\d{4}-\d{2}-\d{2})\s*([^\n：:]{2,24})[：:]/);
    return m ? m[1] + " " + m[2] : (s.length > 42 ? s.slice(0, 42) + "…" : s);
  }

  /* 编辑备注（_note）：整匹马一条，可选（留空保留旧备注）；故「同时只开一行」的台账里最多出现一个 #noteInput */
  function noteInputHTML() {
    var note = state.note !== "" ? state.note : noteOf(String(state.horse.id));
    return '<input id="noteInput" value="' + esc(note) + '" class="' + INPUT + ' font-normal" autocomplete="off" ' +
      'placeholder="可选：一句话即可（何时引入了什么照片 / 为什么不信官方值）">';
  }
  /* 备注行：常显（只改图片也要能写备注）；故 #noteInput 全表唯一 */
  function noteRowHTML() {
    return '<div class="yj-ed-row" data-row="_note">' +
      '<span class="yj-ed-row-k">备注</span>' +
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

  /* B 稿（常开工作表）的一行：label 左灰 + 控件常开可改 + 行尾状态 chip。没有展开/收起态——
   * oninput 直接写 state.draft（数据侧与卡堆/台账时期同一套）；改动控件右上角「改」圆徽 + 青绿描边在 chip 表达 */
  function rowHTML(f) {
    var id = state.horse.id, key = f.key;
    var pin = pinned(id, key);
    var st = fieldState(key);
    var undo = st === "pending" && state.draft[key] === null;
    /* v3 状态沉默化：沉默 = 与官方一致（不亮牌）；仅「已保存 / 待保存」出 chip（§90） */
    var pill = st === "saved" ? '<span class="' + BADGE_PIN + '">已保存</span>'
      : st === "pending" ? '<span class="' + BADGE_DIRTY + '">' + (undo ? "待恢复官方值" : stateWord(st)) + "</span>"
        : "";
    /* 行标签 §94：只留中文名（日文字段键身份由 SCHEMA 承担，界面不再双写） */
    var head = '<span class="yj-ed-row-k">' + esc(YJ.i18n.t(key)) + "</span>";
    /* 「改」角标已删（§82.5 用户定稿：不清爽）——待保存状态由行尾 chip + 控件青绿描边承担 */
    var ctl = '<span class="relative block min-w-0 flex-1">' + controlHTML(f) + "</span>";
    var unpin = pin !== undefined
      ? '<button data-unpin="' + esc(key) + '" class="' + BTN + ' yj-ed-op--danger flex-none" type="button"' +
        (undo ? " hidden" : "") + ">恢复官方值</button>" : "";
    return '<div class="yj-ed-row' + (st === "saved" ? " yj-ed-row--pin" : st === "pending" ? " yj-ed-row--dry" : "") +
      '" data-row="' + esc(key) + '">' + head + ctl + pill + unpin + "</div>";
  }

  function formHTML() {
    if (!state.horse) return '<div class="hint-empty">先选匹马再编辑。</div>';
    var id = String(state.horse.id), e = entryOf(id);
    var others = e ? Object.keys(e).filter(function (k) { return k[0] !== "_" && k !== "photo" && !fieldOf(k); }) : [];
    var othersHTML = others.length ? '<div class="yj-ed-row-orig mt-2 rounded-lg border border-border bg-card px-3 py-2">' +
      "本马另有非本表单字段 " + others.map(function (k) { return "<b>" + esc(k) + "</b>=" + esc(String(e[k])); }).join("、") +
      "（保存会原样保留）</div>" : "";
    /* 抹消组（2026-10 去向调查 · 用户定稿）：登録状態=抹消 或 为空（未登録/空值）时展开抹消组子字段，
     * 预览行紧跟组尾（视觉稿位）；select 改动走 change 全量 render（bind），条件展开随之自动出现/收起 */
    var st = currentValue(fieldOf("登録状態"));
    var showMasyo = st === "抹消" || st === "";
    var rows = [];
    FIELDS.forEach(function (f) {
      if (!showMasyo && MASYO_SUB.indexOf(f.key) >= 0) return;   /* 非抹消且非空：整组隐藏 */
      rows.push(rowHTML(f));
      if (showMasyo && f.key === "抹消_去向場所") rows.push(previewRowHTML());   /* 预览行 = 组尾插入（插入点曾误绑已废弃的 確認 字段导致预览行永不渲染，2026-10 修正） */
    });
    return '<div class="yj-ed-ledger">' + rows.join("") + noteRowHTML() + "</div>" + othersHTML;
  }

  /* 抹消组实时预览（2026-10）：草稿 ?? 已存人工值 ?? 生效值 合成 → statusChain（与档案页同一渲染出处 §48） */
  function previewRowHTML() {
    var h = Object.assign({}, state.horse);
    FIELDS.forEach(function (f) { h[f.key] = currentValue(f); });
    return '<div class="yj-ed-row" data-row="_preview">' +
      '<span class="yj-ed-row-k">预览</span>' +
      '<span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">' + YJ.util.statusChain(h) + "</span></div>";
  }

  /* 报头内容（B 稿）：卡片壳在页面静态层（edit.html 壳内含 #mast + #selector 挂载点）。
   * horse 页 = 雲标 + 马名/别名 + meta + 预览/翻马（马匹检索 = races 页同款 selector 组件，挂 #selector）；
   * timeline 页 = 航标 + 标题 + 契约提示 + 回马匹编辑。模式点常驻底部保存条（草稿箱模式）。 */
  function mastHTML() {
    var _site = window.YJ_SITE || {};   /* site-config.js 万一未加载：编辑台不依赖品牌也能用，兜底空对象 */
    if (state.page === "timeline") {
      /* v3：两页互达由页首「编辑」分段导航承担（壳层静态），报头不再放「回马匹编辑」 */
      return '<span class="yj-ed-mk" style="border-radius:10px">航</span>' +
        '<div class="min-w-0">' +
          '<div class="text-[19px] font-bold leading-tight tracking-[-.3px]">航迹线 · 人工节点</div>' +
          '<div class="mt-0.5 text-[11.5px] text-muted-foreground">全站一份 <b class="font-semibold text-secondary-foreground">timeline_manual.json</b> · date/title 必填 · 提交后 CI 自动重算</div>' +
        "</div>";
    }
    if (!state.horse) {
      return '<span class="yj-ed-mk">' + esc(_site.logo || '') + '</span>' +
        '<span class="text-[17px] font-bold">' + (_site.name || '') + '编辑台</span>' +
        '<span class="yj-ed-lbl">加载马匹列表中…</span>';
    }
    var h = state.horse;
    var alias = h.自译馬名 || h.香港馬名 || "";
    var hasDraftHere = draftHasHorse(h.id);
    return '<span class="yj-ed-mk">' + esc(_site.logo || '') + '</span>' +
      '<div class="min-w-0">' +
        '<div class="text-[20px] font-bold leading-tight tracking-[-.3px]">' + esc(YJ.util.mainName(h)) + "</div>" +
        '<div class="mt-0.5 flex items-center gap-1.5 text-[11.5px]">' +
          (alias ? '<b class="font-semibold text-primary">' +
            '<span class="mr-1 inline-block h-[2px] w-3.5 flex-none rounded bg-primary align-middle"></span>' + esc(alias) + "</b>" : "") +
          (h.欧字馬名 ? '<span class="text-[10px] uppercase tracking-[1px] text-muted-foreground">' + esc(h.欧字馬名) + "</span>" : "") +
        "</div>" +
      "</div>" +
      '<div class="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">' +
        '<div class="text-right text-[11px] leading-[1.6] text-muted-foreground">' +
          'NK-ID <b class="font-semibold text-secondary-foreground">' + esc(h.nk_id || "—") +
          "</b> · 台账 <b class=\"font-semibold text-secondary-foreground\">#" + esc(String(h.id).padStart(3, "0")) + "</b><br>" +
          "母 " + esc(h.母名 || "—") + " · " + esc(h.通算成績 || "—") +
        "</div>" +
        '<div class="flex flex-none items-center gap-1.5">' +
          /* 预览 = 新标签开**外壳**（index.html?page=…）→ 带侧边栏（§82.13）；profile 自身还有回壳兜底 */
          '<a class="' + BTN + '" href="../index.html?page=' +
            encodeURIComponent("pages/profile.html?horse=" + String(h.id) + (hasDraftHere ? "&preview=1" : "")) +
            '" target="_blank">' + (hasDraftHere ? "预览草稿 ↗" : "预览 ↗") + "</a>" +
          '<button data-nav="-1" class="yj-ed-nav" type="button" aria-label="上一匹">‹</button>' +
          '<button data-nav="1" class="yj-ed-nav" type="button" aria-label="下一匹">›</button>' +
        "</div>" +
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
        : '<div class="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">各字段与图片都跟官方值一致，改一行台账或照片位才会进这里。</div>');
  }

  function pinIds() {
    return Object.keys(state.table).filter(function (k) {
      var e = state.table[k];
      return k[0] !== "_" && e && typeof e === "object" && Object.keys(e).some(function (x) { return x[0] !== "_"; });
    });
  }

  /* 抽屉「已保存」段：跨马列人工表现有条目（只读 + 点击定位；恢复官方值在台账行里做）。
   * §82.20 定稿：条目默认折叠成一行（名+#id+N 项+▸），点 ▸/▾ 展开字段/备注/原值；
   * 顶部按马名检索 —— 检索词非空时命中马直接展开详情（回答「这匹改过了什么」），
   * 清空检索回到折叠清单。检索匹配 = 主名 + 四个名字槽 + #id（大小写不敏感）。 */
  function savedHaystack(id) {
    var h = state.byId[id] || {};
    return [YJ.util.mainName(h), h.馬名, h.欧字馬名, h.香港馬名, h.自译馬名,
      "#" + String(id).padStart(3, "0"), String(id)].join("\n").toLowerCase();
  }
  function pinsHTML() {
    var ids = pinIds();
    if (!ids.length) return "";
    var q = state.savedQ.trim().toLowerCase();
    if (q) ids = ids.filter(function (id) { return savedHaystack(id).indexOf(q) >= 0; });
    if (!ids.length) return '<div class="px-1 py-2 text-[11.5px] text-muted-foreground">没有匹配「' + esc(state.savedQ.trim()) + "」的马。</div>";
    return ids.map(function (id) {
      var e = state.table[id], h = state.byId[id];
      var keys = Object.keys(e).filter(function (k) { return k[0] !== "_"; });
      var open = q ? true : !!state.savedExp[id];
      var chips = keys.map(function (k) {
        return '<span class="yj-ed-kv">' + esc(YJ.i18n.t(k)) + "=" + esc(pinValueText(k, e[k])) + "</span>";
      }).join("");
      var orig = (e._orig && typeof e._orig === "object") ? Object.keys(e._orig).map(function (k) {
        return esc(YJ.i18n.t(k)) + "→" + esc(pinValueText(k, e._orig[k]));
      }).join("、") : "";
      var cur = String(state.horse && state.horse.id) === String(id);
      /* 中文名（2026-10-30 用户要求）：已保存人工表值里只显示日文主名，翻查时对不上中文名。
       * 取值优先级 = 香港馬名（港译）→ 自译馬名，两者都空则不占位。 */
      var cnName = h ? String(h["香港馬名"] || h["自译馬名"] || "").trim() : "";
      var head = '<div class="flex items-baseline gap-2 min-w-0">' +
          '<button data-goto="' + esc(id) + '" class="min-w-0 truncate text-left text-[12.5px] font-bold text-accent-foreground" type="button">' +
            esc(h ? YJ.util.mainName(h) : "#" + id) + "</button>" +
          (cnName ? '<span class="max-w-[46%] flex-none truncate text-[11px] text-muted-foreground">' + esc(cnName) + "</span>" : "") +
          '<span class="flex-none text-[9.5px] font-bold tracking-[.5px] text-muted-foreground">#' + esc(String(id).padStart(3, "0")) + "</span>" +
          '<span class="ml-auto flex-none text-[10px] font-semibold tabular-nums text-muted-foreground">' + keys.length + " 项</span>" +
          (q ? "" : '<button data-savetoggle="' + esc(id) + '" class="flex-none w-5 text-[11px] leading-[1.5] text-muted-foreground transition hover:text-foreground" type="button" title="' + (open ? "收起" : "展开") + " " + esc(h ? YJ.util.mainName(h) : "#" + id) + '">' + (open ? "▾" : "▸") + "</button>") +
        "</div>";
      var body = open
        ? '<div class="mt-1.5 flex flex-wrap gap-y-1">' + chips + "</div>" +
          (e._note ? '<div class="mt-1.5 text-[11px] leading-[1.5] text-muted-foreground" title="' + esc(String(e._note)) + '"><b class="yj-ed-lbl mr-1">备注</b>' + esc(noteBrief(e._note)) + "</div>" : "") +
          (orig ? '<div class="mt-0.5 text-[11px] leading-[1.5] text-muted-foreground/80"><b class="yj-ed-lbl mr-1">原值</b>' + orig + "</div>" : "")
        : "";
      return '<div class="yj-ed-entry' + (cur ? " bg-accent/45" : "") + '">' + head + body + "</div>";
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
    if (state.page === "timeline") return "";   /* timeline 页的管道报告在 tlHTML 内（tlReportHTML） */
    var g = state.gh;
    if (!g) return "";
    if (g.busy) return '<div class="text-[11.5px] text-muted-foreground">' + esc((g.log || ["提交中…"]).join(" ")) + "</div>";
    if (g.err) return '<div class="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">' + esc(g.err) + "</div>";
    if (g.ok) return '<div class="rounded-md bg-primary/10 px-3 py-2 text-[12px]"><b class="text-primary">✔ 已提交</b> · ' +
      '<a class="underline underline-offset-2" href="' + esc(g.url) + '" target="_blank" rel="noopener">查看 commit ↗</a> · ' +
      "CI 构建约 2 分钟后线上生效（" + (g.files || []).length + " 个文件 · " + (g.secs || 0).toFixed(1) + "s）。</div>" +
      (g.ci ? '<div class="mt-1 rounded-md bg-primary/10 px-3 py-2 text-[12px] text-primary">↻ ' + esc(g.ci) + "</div>" : "");
    return "";
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

  /* 站内图（data/ 前缀）经 YJ_DATA.url 解析 —— 与 profile 头像同一口径（AGENTS §3 数据访问）；
   * 草稿图两种形状：对象 {ref,…}（本马）与 "draft:tl:<ref>" 串（时间线）→ 取 objectURL 内存缓存 */
  function draftRefOf(p) {
    if (p && typeof p === "object") return p.ref;
    var s = String(p || "");
    return s.indexOf("draft:") === 0 ? s.slice(6) : null;
  }
  function photoSrc(p) {
    if (p && typeof p === "object") {                    /* 本马草稿图（IndexedDB）→ objectURL 缓存，键 = "draft:<ref>" */
      var m = state.photos.meta["draft:" + p.ref];
      return (m && m.url) || "";
    }
    var s = String(p || "");
    if (s.indexOf("draft:tl:") === 0) {                  /* 时间线草稿图 → state.tl.tlPhotos[bareRef] */
      var tm = state.tl.tlPhotos[s.slice(9)];
      return (tm && tm.url) || "";
    }
    if (s.indexOf("draft:") === 0) {                     /* 其它草稿串形状 → meta[原串] */
      var hm = state.photos.meta[s];
      return (hm && hm.url) || "";
    }
    return s.indexOf("data/") === 0 ? YJ_DATA.url(s) : s;
  }
  function photoName(p) {
    if (p && typeof p === "object") return p.name || "草稿图";
    var s = String(p || "");
    if (s.indexOf("draft:") === 0) return "草稿图（未提交）";
    return s.slice(s.lastIndexOf("/") + 1);
  }

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

  /* 外链本地化第一步：浏览器里把图拉下来（**不降级存外链**，D8）。
   * 三级抓取：① Wikipedia 词条页（…#/media/File:X）与 File: 页地址自动换成 Special:FilePath 图片直链；
   * ② 直连 fetch（upload.wikimedia.org 等 CORS 友好图床）；③ 直连被 CORS/防盗链拒 → 公共图片代理
   * images.weserv.nl（服务端代抓 + 允许跨域；仅借道取字节，图照常浏览器压缩后入库）。
   * 代理也失败 → 人话提示（右键另存 → 上传本地文件）。 */
  function normalizeRemote(raw) {
    var u = String(raw || "").trim();
    var host = /^https?:\/\/([^/]+)\/wiki\//i.exec(u);
    if (!host) return u;
    var m = /#\/media\/File:([^/?#]+)/i.exec(u) || /\/wiki\/File:([^/?#]+)/i.exec(u);
    return m ? "https://" + host[1] + "/wiki/Special:FilePath/" + m[1] : u;
  }
  function fetchRemote(raw) {
    var url = normalizeRemote(raw);
    if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("只支持 http(s) 外链"));
    function pick(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var ct = r.headers.get("Content-Type") || "";
      if (ct && ct.indexOf("image/") !== 0) throw new Error("不是图片（" + ct + "）");
      return r.blob();
    }
    function direct() {
      return fetch(url, { mode: "cors", credentials: "omit", cache: "no-store" })
        .then(pick, function () { throw new Error("直连被拒（CORS/防盗链）"); })
        .then(function (b) { if (!b || !b.size) throw new Error("空响应"); return b; });
    }
    function viaProxy() {
      var p = "https://images.weserv.nl/?url=" + encodeURIComponent(url.replace(/^https?:\/\//i, ""));
      return fetch(p, { mode: "cors", credentials: "omit", cache: "no-store" })
        .then(pick, function () { throw new Error("代理也抓不到"); })
        .then(function (b) { if (!b || !b.size) throw new Error("空响应"); return b; });
    }
    return direct().catch(function (e1) {
      photoLog("直连失败（" + e1.message + "）→ 改走公共代理 images.weserv.nl…", "busy");
      return viaProxy();
    }).catch(function (e2) {
      throw new Error("拉不下来（" + e2.message + "）。把图右键「另存为」后用「上传本地文件」最稳；" +
        "或换可直接打开的图片直链。本站强制本地化，不降级存外链。");
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
  function setDraft(list) { state.photos.draft = list.slice(); state.photos.mode = "set"; if (state.horse) persistPhotosOf(state.horse.id); }
  function addPhoto(path) {
    var d = ensureDraft();
    if (d.indexOf(path) < 0) d.push(path);
    setDraft(d);
  }
  function delPhoto(i) {
    var d = workingPhotos();
    var it = d.splice(i, 1)[0];
    setDraft(d);
    var ref = draftRefOf(it);                 /* 草稿新图顺手清掉 IndexedDB 里的 blob */
    if (ref) blobDel(ref);
  }
  function markNoPhoto() { state.photos.draft = []; state.photos.mode = "set"; if (state.horse) persistPhotosOf(state.horse.id); }
  function unpinPhoto() { state.photos.mode = "remove"; state.photos.draft = []; if (state.horse) persistPhotosOf(state.horse.id); }
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

  /* 压缩 + 入库一张（File | Blob）：local 形态 POST /photo；draft 形态存 IndexedDB，提交时才上传定名 */
  function uploadOne(file, owner) {
    var name = file.name || "（无名文件）";
    return compressImage(file).then(function (r) {
      if (state.mode === "draft") {
        var ref = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36);
        return blobPut(ref, r.blob).then(function () {
          var it = { ref: ref, ext: extOf(r.type), name: name, bytes: r.toBytes, from: r.fromBytes,
            w: r.w, h: r.h, q: r.quality, over: r.over, kept: r.kept };
          state.photos.meta["draft:" + ref] = { url: URL.createObjectURL(r.blob), bytes: r.toBytes, name: name };
          if (!owner || !state.horse || String(state.horse.id) === String(owner)) {
            addPhoto(it);
          } else {
            /* 上传队列进行中切了马（2026-10-26 修，§107）：这张图直写**开始上传那匹**的草稿箱，
             * 不再错挂到当前马头上（旧路径 addPhoto 只认 state.horse，队列里剩下的图全部跟错人）。 */
            var ph = phGet(owner) || { mode: "set", list: [] };
            if (ph.mode !== "set") ph = { mode: "set", list: [] };
            ph.list.push(it);
            phPut(String(owner), ph);
            photoLog(name + "：已切到别的马，这张图记回原马（" + owner + "）的草稿", "ok");
          }
          photoLog(name + "：" + kb(r.fromBytes) + " → " + kb(r.toBytes) + "　" + r.w + "×" + r.h +
            " " + mimeShort(r.type) + (r.kept ? "（原图已够小，未重压）" : r.over ? "（已尽力，仍超 100KB）" : "　q" + r.quality) +
            " → 草稿箱", "ok");
        });
      }
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
      : '<span class="' + TIP + '">与官方一致</span>';
  }
  function thumbHTML(p, i) {
    var key = (p && typeof p === "object") ? "draft:" + p.ref : String(p);
    var m = state.photos.meta[key] || {};
    return '<li draggable="true" data-pi="' + i + '" class="yj-ed-thumb group">' +
      '<img src="' + esc(photoSrc(p)) + '" alt="" draggable="false" loading="lazy" decoding="async" class="h-[80px] w-full object-contain">' +
      '<span class="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold tabular-nums text-white">' + (i + 1) + "</span>" +
      '<button data-pdel="' + i + '" type="button" class="' + BTN_DANGER + ' absolute right-1 top-1 hidden h-6 px-1.5 group-hover:inline-flex" title="移出列表（盘上文件保留）">✕</button>' +
      '<span class="block truncate border-t border-border bg-card px-1.5 py-1 text-[10px] text-muted-foreground" title="' + esc(photoName(p)) + '">' +
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
    var dis = (state.photos.busy || state.saving) ? " disabled" : "";
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
              ' placeholder="粘贴图片直链（Wikipedia 词条页地址也认）" autocomplete="off">' +
            '<button id="photoURLBtn" class="' + BTN_DIS + '" type="button"' + dis + ">本地化</button></div>" +
          '<div class="mt-2 flex items-center gap-2"><button data-pclose="1" class="' + BTN + '" type="button">收起</button></div>' +
          "</div>"
      : "";
    var strip = list.length
      ? '<ul class="mt-2 flex list-none flex-wrap gap-2 p-0">' + list.map(function (p, i) { return thumbHTML(p, i); }).join("") + "</ul>"
      : '<div class="mt-2 rounded-md border border-dashed border-input px-3 py-4 text-center text-[12px] text-muted-foreground">' +
        (photoDirty() ? "已清空 · 待保存" : "暂无图片") + "</div>";
    var acts = '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
      (list.length ? '<button data-pnone="' + id + '" class="' + BTN_DIS + '" type="button"' + dis + ">清空为确无图片</button>" : "") +
      (photoPinned(id) !== undefined && !photoDirty() ? '<button data-punpin="' + id + '" class="' + BTN + ' yj-ed-op--danger" type="button"' + dis + ">恢复官方值</button>" : "") +
      "</div>";
    return slot + badgeRow + panel + strip + acts +
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
    if (!it) { return; }
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
  /* §92 比赛样式可选字段（引用比赛自动预填；build_timeline.to_manual_event 同名单透传，空值不写落表） */
  var RACE_KEYS = ["rank", "time", "agari", "pop", "jockey", "trainer", "grade", "meta", "hero", "hero_cn"];
  function tlToStore(ev) {                     /* 编辑对象 → 落表形状（空字段不写，契约里 photo 可为串或数组） */
    var o = { date: String(ev.date || "").trim(), title: String(ev.title || "").trim() };
    ["cn", "note", "link"].forEach(function (k) { if (String(ev[k] || "").trim()) o[k] = String(ev[k]).trim(); });
    RACE_KEYS.forEach(function (k) { if (String(ev[k] || "").trim()) o[k] = String(ev[k]).trim(); });
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
      /* draft 形态：草稿箱里有整表快照就叠加显示（dirty = 与远端有差异） */
      var draft = state.mode === "draft" ? tlGet() : null;
      state.tl.table = draft || o;
      if (!state.tl.dirty) state.tl.events = (Array.isArray(state.tl.table.events) ? state.tl.table.events : []).map(cloneEvent);
      state.tl.loaded = true;
      if (draft) { state.tl.dirty = true; hydrateTlPhotos(); }
      return state.tl.events;
    });
  }
  function persistTlDraft() {       /* draft 形态：时间线每次改动整表快照进草稿箱（表很小，整存整取） */
    if (state.mode !== "draft") return;
    tlPut(tlPayload());
    state.tl.dirty = true;
  }
  function hydrateTlPhotos() {      /* draft:tl:<ref> 标记 → objectURL 内存缓存 */
    (state.tl.events || []).forEach(function (ev) {
      var ph = String((ev && ev.photo) || "");
      if (ph.indexOf("draft:tl:") !== 0) return;
      var ref = ph.slice(9);
      if (state.tl.tlPhotos[ref]) return;
      blobGet(ref).then(function (b) {
        if (b) { state.tl.tlPhotos[ref] = { url: URL.createObjectURL(b) }; renderTL(); }
      });
    });
  }
  function tlPayload() {
    var t = {};
    Object.keys(state.tl.table || {}).forEach(function (k) { if (k !== "events") t[k] = state.tl.table[k]; });
    t.events = state.tl.events.map(tlToStore);
    return t;
  }
  function openTLEdit(idx, kind) {
    state.tl.edit = { idx: idx, kind: idx < 0 ? (kind || "free") : "", ev: cloneEvent(idx < 0 ? {} : state.tl.events[idx]) };
    if (idx < 0 && state.tl.edit.kind === "race") { state.tl.refHorse = ""; state.tl.refRace = ""; }
    state.tl.err = "";
    renderTL();
    var f = els.tl.querySelector('[data-tf="date"]');
    if (f) f.focus();
  }
  /* 引用比赛（浅引用，2026-09-29 定稿）：拉 races-bundle（构建期产物，与比赛页同一解码器），
   * 选马 → 选该马一场比赛 → 自动填 date/title + 按 §80 口径生成 netkeiba 链接；说明/标签仍手填。
   * 生成的是普通人工节点（走 timeline_manual 提交链），不改 build_timeline.py。 */
  function raceLinkOf(r) {
    var rid = String((r && r.race_id) || "").trim();
    if (!rid) return "";                                   /* 无 race_id（台账等）不出链接，可手填 */
    var vt = String((r && r.venue_type) || "");
    if (vt === "中央") return "https://race.netkeiba.com/race/result.html?race_id=" + encodeURIComponent(rid);
    if (vt === "地方") return "https://nar.netkeiba.com/race/result.html?race_id=" + encodeURIComponent(rid);
    return "https://db.netkeiba.com/race/" + encodeURIComponent(rid) + "/";
  }
  function loadRaceBundle(hid) {
    /* bundle 解码一次 = 全库马齐（decode 返回 {马id: rows}），切马/跳场不再重复拉取 */
    if (state.tl.bundle) { state.tl.bundleFor = hid; renderTL(); return; }
    state.tl.bundleFor = "";                               /* 加载中标记：选赛下拉转圈态 */
    getJSON(YJ_DATA.url("races-bundle.json")).then(function (b) {
      state.tl.bundle = (b && window.YJ.raceBundle) ? YJ.raceBundle.decode(b) : null;
      state.tl.bundleFor = hid;
      renderTL();
    });
  }
  function refRaceRows() {
    if (!state.tl.refHorse || !state.tl.bundle) return null;
    return state.tl.bundle[state.tl.refHorse] || [];
  }
  function applyRefRace(key) {
    var rows = refRaceRows(), r = rows && rows[Number(key)];
    if (!r) return;
    var ev = editEV();
    var rr = window.YJ.raceRows, h = state.byId[String(state.tl.refHorse)] || {};
    ev.date = String(r.日付 || "");
    /* §92：比赛样式字段自动预填（全部可选、可改可清）；合成口径与 build_timeline.to_render_event 同源 */
    ev.title = rr ? rr.raceNameText(r) : String(r.レース名 || "");   /* 剥「徽章代劳」的格级尾缀（同比赛卡口径） */
    ev.link = raceLinkOf(r);
    ev.rank = r.結果 == null ? "" : String(r.結果);
    ev.time = String(r.タイム || "");
    ev.agari = String(r.上り || "");
    ev.pop = (r.人気 == null || r.人気 === "") ? "" : String(r.人気) + "番";
    ev.jockey = [String(r.騎手 || ""), (r.斤量 == null || r.斤量 === "" ? "" : String(r.斤量) + "kg")].filter(Boolean).join(" · ");
    ev.trainer = String(r.調教師 || "");
    ev.grade = String(r.格 || "");
    ev.meta = [
      String(r.場名 || "") + (r.R == null || r.R === "" ? "" : String(r.R) + "R"),
      String(r.芝ダ || "") + (r.距離 == null || r.距離 === "" ? "" : String(r.距離) + "m"),
      String(r.馬場 || "")
    ].filter(Boolean).join(" · ");
    ev.hero = String(h.馬名 || "");
    ev.hero_cn = String(h.香港馬名 || h.自译馬名 || "");
    state.tl.refRace = String(key);
    state.tl.err = "";
    renderTL();
  }

  /* ---------------- 比赛人工配图（§82.9 用户定稿）：给自动比赛节点配专属图 ----------------
   * 数据 = data/races_manual.json（键 = rmKeyOf：race_id / 台账场虚拟键，抓取/重算永不覆盖）；
   * 取图优先级：人工配图 > race.photo（历史兼容，抓取已不再产生）> 马照片。图照常浏览器压缩
   * ≤1280px/≤100KB webp，提交时落 data/photos/<键>-<n>.<ext>（与马图同一命名法，ghPhotoSeqs 天然兼容）。 */
  function rmSrc(p) {                    /* races_manual 里的路径（../data/… 或 data/…）→ 可访问 URL */
    var s = String(p || "");
    if (s.indexOf("../") === 0) s = s.slice(3);
    return s.indexOf("data/") === 0 ? YJ_DATA.url(s) : s;
  }
  function rmRaceRows() {
    if (!state.tl.raceHorse || !state.tl.bundle) return null;
    return state.tl.bundle[state.tl.raceHorse] || [];
  }
  function rmCurrent(rid) {              /* 该场当前图：草稿 set 优先 → 盘上已配置 → null（未配置）。rid = race_id */
    var c = rmGet()[String(rid)];
    if (c && c.mode === "set" && c.item) return { kind: "draft", src: state.tl.racePhUrl[String(rid)] || "" };
    if (c && c.mode === "remove") return null;
    var m = state.tl.raceManual[String(rid)];
    return (m && m.photo) ? { kind: "saved", src: rmSrc(m.photo) } : null;
  }
  /* races_manual 键（§82.22 兼容台账场）：有 race_id = 原样；无 race_id 的台账场 = 虚拟键
   * "@马id@日付"（一马一天只跑一场，SCHEMA 去重键同口径；build_timeline 取图同规则生成）。
   * 日付是 ISO 格式，@/- 均文件名安全。返回 "" = 连日付都没有，无法定位场次。 */
  function rmKeyOf(r, hid) {
    var rid = String((r && r.race_id) || "").trim();
    if (rid) return rid;
    var d = String((r && r.日付) || "").trim();
    return (hid && d) ? "@" + hid + "@" + d : "";
  }
  /* race_id → {hid, r} 反查（§82.21）：草稿箱条目给可读标签 + 一键跳回配图面板用。
   * bundle 解码一次全库马齐，懒扫描一次进缓存；bundle 没加载（刷新后没开过面板）时返回 null 走 #rid 兜底 */
  var rmMetaCache = null;
  function rmMeta(rid) {
    if (!state.tl.bundle) return null;
    if (!rmMetaCache) {
      rmMetaCache = {};
      Object.keys(state.tl.bundle).forEach(function (hid) {
        (state.tl.bundle[hid] || []).forEach(function (r) {
          var id = rmKeyOf(r, hid);
          if (id && !rmMetaCache[id]) rmMetaCache[id] = { hid: hid, r: r };
        });
      });
    }
    return rmMetaCache[String(rid)] || null;
  }
  function rmLabel(rid) {                /* 草稿箱条目可读标签：日付 赛名（格）；查不到退 #race_id */
    var m = rmMeta(rid);
    if (!m) return "比赛配图 #" + rid;
    return "比赛配图 · " + String(m.r.日付 || "") + " " + String(m.r.レース名 || "") + (m.r.格 ? "（" + m.r.格 + "）" : "");
  }
  function hydrateRacePh() {             /* 刷新后恢复草稿图预览（IndexedDB → objectURL） */
    var rm = rmGet();
    Object.keys(rm).forEach(function (rid) {
      var c = rm[rid];
      if (!c || c.mode !== "set" || !c.item || !c.item.ref || state.tl.racePhUrl[rid]) return;
      state.tl.racePhUrl[rid] = "pending";
      blobGet(c.item.ref).then(function (b) {
        if (b) state.tl.racePhUrl[rid] = URL.createObjectURL(b);
        else delete state.tl.racePhUrl[rid];
        renderTL();
      });
    });
  }
  function rmLog(msg, kind) {
    state.tl.raceLog.push({ t: msg, k: kind || "" });
    if (state.tl.raceLog.length > 6) state.tl.raceLog.shift();
    renderTL();
  }
  function rmUpload(files, rid) {        /* 单图位：多选只取第一张；压缩口径与马照片一致 */
    var f = (files || [])[0];
    if (!f || !rid) return;
    state.tl.raceBusy = true;
    compressImage(f).then(function (r) {
      var ref = "r" + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36);
      return blobPut(ref, r.blob).then(function () {
        var old = rmGet()[String(rid)];
        if (old && old.mode === "set" && old.item && old.item.ref) blobDel(old.item.ref);
        state.tl.racePhUrl[String(rid)] = URL.createObjectURL(r.blob);
        rmPut(rid, { mode: "set", item: { ref: ref, ext: extOf(r.type), name: f.name || "（无名文件）", bytes: r.toBytes } });
        rmLog((f.name || "图片") + "：" + kb(r.fromBytes) + " → " + kb(r.toBytes) + "　" + r.w + "×" + r.h +
          " " + mimeShort(r.type) + (r.kept ? "（原图已够小，未重压）" : r.over ? "（已尽力，仍超 100KB）" : "　q" + r.quality) + " → 草稿箱", "ok");
      });
    }).catch(function (e) {
      rmLog((f.name || "图片") + "：" + (e && e.message ? e.message : "处理失败"), "err");
    }).then(function () {
      state.tl.raceBusy = false;
      /* 2026-10-28 修（§133）：上传落箱必须走全量 render——此前只 renderTL()，保存条的
       * 「提交到 GitHub」/「草稿箱」计数停留在打开页面时的旧状态（首个草稿=按钮一直灰着）。
       * render 内部本就调 renderTL()，状态条、草稿箱抽屉一并同步。 */
      render();
    });
  }
  function racePanelHTML() {
    if (!state.tl.racePanel) return "";
    var hid = state.tl.raceHorse;
    var sel = state.tl.raceSel;
    var rows = (hid && state.tl.bundle) ? rmRaceRows() : null;
    var loading = hid && !state.tl.bundle;
    var cur = sel ? rmCurrent(sel) : null;
    var dis = state.tl.raceBusy ? " disabled" : "";
    var pick2 = "";
    if (hid) {
      /* 选项值 = rmKeyOf(r, hid)（races_manual 键：race_id / 台账场虚拟键 "@马id@日付"，§82.22）——
       * §82.21 修：原来用 bundle 行下标当键，跨马下标相撞会静默覆盖别的草稿、盘上已配置也认不出；
       * 台账场（无 race_id）与人工荣誉节点同类，同样可配图，标「台账」区分 */
      pick2 = '<select data-rmrace class="' + SEL_CMP + ' w-[380px] max-w-full"' + (loading ? " disabled" : "") + ">" +
        '<option value="">' + (loading ? "比赛清单加载中…" : "STEP 2 · 选那场比赛…") + "</option>" +
        (rows || []).map(function (r) {
          var key = rmKeyOf(r, hid);
          var label = String(r.日付 || "") + " " + String(r.レース名 || "") + (r.格 ? "（" + r.格 + "）" : "");
          if (!key) return '<option value="" disabled>' + esc(label) + " · 无日付（无法定位场次）</option>";
          return '<option value="' + esc(key) + '"' + (key === sel ? " selected" : "") + ">" +
            esc(label + (key.charAt(0) === "@" ? " · 台账" : "")) + "</option>";
        }).join("") + "</select>";
    }
    var body = "";
    if (sel) {
      var label = cur ? (cur.kind === "draft" ? "草稿新图 · 待提交" : "已配置") : "未配置";
      body = '<div class="mt-2.5 flex flex-wrap items-start gap-3">' +
        (cur && cur.src
          ? '<img src="' + esc(cur.src) + '" alt="" class="h-[96px] w-[128px] flex-none rounded-md border border-border object-cover">'
          : '<div class="flex h-[96px] w-[128px] flex-none items-center justify-center rounded-md border border-dashed border-input px-2 text-center text-[11px] text-muted-foreground">' +
            (cur ? "草稿图预览生成中…" : "无图（节点回退马照片）") + "</div>") +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            '<label class="' + BTN + ' cursor-pointer select-none' + (state.tl.raceBusy ? " opacity-40" : "") + '">上传/替换配图' +
              '<input data-rmfile="' + esc(sel) + '" type="file" accept="image/*" class="hidden"' + dis + "></label>" +
            (cur ? '<button data-rmdel="' + esc(sel) + '" class="' + BTN_DANGER + '" type="button"' + dis + ">" +
              (cur.kind === "draft" ? "撤销本次改动" : "移除配图") + "</button>" : "") +
          "</div>" +
          '<div class="mt-1.5 ' + TIP + '">当前：<b class="font-semibold text-secondary-foreground">' + esc(label) + "</b> · 入库文件名 = race_id-序号.webp · 压缩口径与马照片相同</div>" +
        "</div>" +
      "</div>";
    }
    return '<div class="mt-2 rounded-lg border border-border bg-muted/30 p-3">' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<b class="text-[13px] font-semibold">比赛配图</b>' +
        '<span class="' + TIP + '">给自动生成的比赛节点配图 → ' + esc(RM_PATH) + '（人工表，抓取永不覆盖）</span>' +
        '<button data-rmclose="1" class="' + BTN + ' ml-auto" type="button">收起</button>' +
      "</div>" +
      '<div class="mt-2.5 flex flex-wrap items-center gap-2">' +
        '<span data-rmselmount class="inline-block w-[380px] max-w-full align-top"></span>' +
        pick2 +
      "</div>" +
      body +
      (state.tl.raceLog.length ? '<div class="mt-2 space-y-0.5">' + state.tl.raceLog.map(function (l) {
        return '<div class="text-[11.5px] ' + (l.k === "err" ? "text-destructive" : l.k === "busy" ? "text-muted-foreground" : "text-primary") + '">' + esc(l.t) + "</div>";
      }).join("") + "</div>" : "") +
      "</div>";
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
    state.tl.edit = null; state.tl.err = "";
    persistTlDraft();
    render();   /* §133：整表快照落箱 → 保存条立刻变亮（render 内含 renderTL） */
  }
  function tlDelete(i) {
    if (state.tl.del !== i) { state.tl.del = i; renderTL(); return; }   /* 两次点击确认，不用 window.confirm（headless 会卡） */
    var gone = state.tl.events.splice(i, 1)[0];
    state.tl.del = -1;
    if (state.tl.edit && state.tl.edit.idx === i) state.tl.edit = null;
    var ref = draftRefOf(gone);           /* 被删节点的草稿图顺手清掉 */
    if (ref && String(gone && gone.photo || "").indexOf("draft:tl:") === 0) blobDel(ref);
    persistTlDraft();
    render();   /* §133：落箱后同步保存条（同 tlApplyEdit） */
  }
  function tlPhotoUpload(files) {
    var arr = [].slice.call(files || []);
    if (!arr.length) return;
    state.tl.busy = true; state.tl.log = ["处理中…"];
    renderTL();
    compressImage(arr[0]).then(function (r) {
      if (state.mode === "draft") {
        var ref = "tl" + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36);
        return blobPut(ref, r.blob).then(function () {
          tlPhotoMetaPut(ref, { ext: extOf(r.type), name: arr[0].name || "", bytes: r.toBytes });
          editEV().photo = "draft:tl:" + ref;   /* 提交时定正式名 ../data/photos/timeline-<n>.<ext> */
          state.tl.tlPhotos[ref] = { url: URL.createObjectURL(r.blob) };
          state.tl.log = [arr[0].name + "：" + kb(r.fromBytes) + " → " + kb(r.toBytes) + "　" + r.w + "×" + r.h +
            " " + mimeShort(r.type) + " → 草稿箱"];
        });
      }
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
    return '<div class="border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40">' +
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
      (ph ? '<div class="mt-1 ' + TIP + '">图 <a href="' + esc(photoSrc(ph)) + '" target="_blank">' + esc(photoName(ph)) + "</a></div>" : "") +
      "</div>";
  }
  function tagChipsHTML(tags, key) {
    return (tags || []).map(function (t, j) { return tagChip(t, key + "-" + j); }).join(" ");
  }
  /* ---- 实时预览（§91）：把「将要落表」的节点（tlToStore 形状）按 timeline.html 同款结构渲染 ----
   * 标记 = timeline.html eventHTML 的人工节点分支；样式副本在 edit-timeline.html 的 .yj-pv 块
   * （★ 单一出处 = timeline.html，改卡片/六色两处同步）。节点圆点恒 manual 灰
   * （build_timeline.to_manual_event 硬编码，不受标签影响）。 */
  function rankNoCls(rank) {                   /* 着顺徽章色（数据语义色全站口径：1/2/3 三件套，其余无底色） */
    return rank === "1" ? "yj-no1" : rank === "2" ? "yj-no2" : rank === "3" ? "yj-no3" : "";
  }
  function tlCardHTML(ev) {
    var store = tlToStore(ev);
    /* 坑（§91 修复）：tlToStore 空 tags 时不写 o.tags 键 → 预览必须兜底，否则「＋ 新建」一打开就崩 */
    var tags = store.tags || [];
    var ph = Array.isArray(store.photo) ? store.photo[0] : store.photo;
    /* §92 比赛样式：有任一比赛字段 → 按真实比赛卡渲染（结构对齐 timeline.html race 分支；📌 只留给素格式）。
     * 格徽章 = window.YJ_GRADE 单一出处（经 race-rows.GRADE，与后端 GBADGE/GLBL 同源 config/grade-table.json）。 */
    var gb = store.grade && window.YJ.raceRows ? window.YJ.raceRows.GRADE[store.grade] : null;
    var rich = gb || store.rank || store.hero || store.time || store.agari || store.pop || store.jockey || store.trainer || store.meta;
    var body;
    if (rich) {
      var rttl = store.title
        ? (store.link
            ? '<a class="hjump text-[15px] font-semibold" href="' + esc(store.link) + '" target="_blank" rel="noopener">' + esc(store.title) + "</a>"
            : '<span class="text-[15px] font-semibold">' + esc(store.title) + "</span>")
        : '<span class="text-[15px] font-semibold text-muted-foreground/60">（标题未填）</span>';
      body = '<div class="tl-racename-row">' +
          (gb ? '<span class="yj-grade yj-' + esc(gb[1]) + '">' + esc(gb[0]) + "</span>" : "") +
          '<span class="tl-racename">' + rttl + "</span></div>" +
        (store.cn ? '<div class="text-[12px] text-muted-foreground">〈' + esc(store.cn) + "〉</div>" : "") +
        (store.meta ? '<div class="text-[12px] text-muted-foreground">' + esc(store.meta) + "</div>" : "") +
        (store.hero ? '<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">' +
            (store.rank ? '<span class="yj-no ' + rankNoCls(store.rank) + '">' + esc(store.rank) + "</span>" : "") +
            '<span class="text-[15px] font-semibold">' + esc(store.hero) + "</span>" +
            (store.hero_cn ? '<span class="text-[12.5px] text-muted-foreground">〈' + esc(store.hero_cn) + "〉</span>" : "") +
          "</div>" : "") +
        ((store.time || store.agari || store.pop) ? '<div class="tl-kpis">' +
            '<div class="tl-kpi"><div class="k">タイム</div><div class="v hi">' + esc(store.time || "—") + "</div></div>" +
            '<div class="tl-kpi"><div class="k">上り</div><div class="v">' + esc(store.agari || "—") + "</div></div>" +
            '<div class="tl-kpi"><div class="k">人気</div><div class="v">' + esc(store.pop || "—") + "</div></div></div>" : "") +
        ((store.jockey || store.trainer) ? '<div class="text-[12px] text-muted-foreground space-y-0.5">' +
            (store.jockey ? "<div>騎手 " + esc(store.jockey) + "</div>" : "") +
            (store.trainer ? "<div>調教師 " + esc(store.trainer) + "</div>" : "") + "</div>" : "");
    } else {
      var title = store.title
        ? (store.link
            ? '<a class="hjump text-[15px] font-semibold" href="' + esc(store.link) + '" target="_blank" rel="noopener">📌 ' + esc(store.title) + "</a>"
            : '<span class="text-[15px] font-semibold">📌 ' + esc(store.title) + "</span>")
        : '<span class="text-[15px] font-semibold text-muted-foreground/60">📌（标题未填）</span>';
      body = '<div class="flex flex-wrap items-baseline gap-x-2">' + title +
          (store.cn ? '<span class="text-[12px] text-muted-foreground">〈' + esc(store.cn) + "〉</span>" : "") + "</div>" +
        (store.note ? '<div class="text-[12px] text-muted-foreground">' + esc(store.note) + "</div>" : "");
    }
    return '<div class="tl-item">' +
        '<div class="tl-date">' + (store.date ? "<b>" + esc(store.date.slice(0, 4)) + "</b>" + esc(store.date.slice(4)) : "<b>YYYY</b>-MM-DD") + "</div>" +
        '<div class="tl-node"></div>' +
        '<div class="tl-cardwrap"><div class="tl-card card">' +
          (ph
            ? '<div class="tl-photo"><img src="' + esc(photoSrc(ph)) + '" alt="" loading="lazy" decoding="async" width="297" height="210"></div>'
            : "") +
          '<div class="tl-body">' + body +
            (tags.length ? '<div class="flex flex-wrap gap-1.5">' + tags.map(function (t) {
              return '<span class="tl-tag ' + esc(t.cat) + '"' + (t.tip ? ' title="' + esc(t.tip) + '"' : "") + ">" + esc(t.label) + "</span>";
            }).join("") + "</div>" : "") +
          "</div>" +
        "</div></div>" +
      "</div>";
  }
  /* 预览只换卡片、不重绘表单（打字不丢焦点；输入委托里逐键调） */
  function pvSync() {
    if (!els.tl || !state.tl.edit) return;
    var pv = els.tl.querySelector("[data-tlpreview]");
    if (pv) pv.innerHTML = tlCardHTML(editEV());
  }
  function tlFormHTML() {
    var ed = state.tl.edit;
    if (!ed) return "";
    var ev = ed.ev;
    var dis = state.tl.busy ? " disabled" : "";
    function row(lab, key, ph, type) {
      return '<div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-[7px] text-[12.5px] font-medium text-secondary-foreground">' + lab + '</div>' +
        '<div class="min-w-0"><input data-tf="' + key + '" type="' + (type || "text") + '" value="' + esc(ev[key] || "") +
          '" class="' + INPUT + '" autocomplete="off" placeholder="' + esc(ph || "") + '"' + dis + "></div></div>";
    }
    var isNew = ed.idx < 0, isRace = isNew && ed.kind === "race";
    var rows = isRace ? refRaceRows() : null;
    var picking = isRace && !rows;
    function refRow(lab, inner) {
      return '<div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-[7px] text-[12.5px] font-medium text-secondary-foreground">' + lab + "</div>" +
        '<div class="min-w-0">' + inner + "</div></div>";
    }
    var refBlock = "";
    if (isRace) {
      /* STEP1 选马 = 基本信息报头同款 selector 搜索组件（§82.10）：renderTL 后挂载，挂载点每次重建 → 实例无残留 */
      var horseSel = '<span data-refselmount class="inline-block w-[380px] max-w-full align-top"></span>' +
        '<div class="mt-1 ' + TIP + '">比赛清单来自 races-bundle（构建期产物，与比赛页同一解码器）。</div>';
      var raceSel;
      if (!state.tl.refHorse) raceSel = '<select class="' + SEL_CMP + ' w-[380px] max-w-full" disabled><option>先选马</option></select>';
      else if (picking) raceSel = '<select class="' + SEL_CMP + ' w-[380px] max-w-full" disabled><option>比赛清单加载中…</option></select>';
      else {
        var rs = rows || [];
        raceSel = '<select data-refrace class="' + SEL_CMP + ' w-[380px] max-w-full">' +
          '<option value="">选一场比赛（自动填日期 / 标题 / 链接）…</option>' +
          rs.map(function (r, i) {
            var one = String(r.日付 || "") + " " + String(r.レース名 || "") +
              (r.格 ? "（" + String(r.格) + "）" : "") + (r.venue_type ? " · " + String(r.venue_type) : "");
            return '<option value="' + i + '"' + (state.tl.refRace === String(i) ? " selected" : "") + ">" + esc(one) + "</option>";
          }).join("") + "</select>" +
          '<div class="mt-1 ' + TIP + '">选后可改；无 race_id 的台账场不出链接（可手填 link）。</div>';
      }
      refBlock = refRow("选马", horseSel) +
        refRow("选比赛", raceSel);
    }
    /* §92 比赛样式字段：显示条件 = 引用比赛（isRace）或编辑已含此类字段的节点（素格式老节点不受打扰） */
    var showRace = isRace || RACE_KEYS.some(function (k) { return String((ev && ev[k]) || "").trim(); });
    function cell(k, lab, ph) {
      return '<label class="block min-w-0"><span class="block text-[10.5px] font-medium text-muted-foreground">' + lab + '</span>' +
        '<input data-tf="' + k + '" type="text" value="' + esc(ev[k] || "") + '" class="' + INPUT + ' mt-1" autocomplete="off" placeholder="' + esc(ph || "") + '"' + dis + "></label>";
    }
    /* v3：编辑中的节点表单 = 青绿描边卡（本页唯一「进行中」区域，与列表的工具条在视觉上分离） */
    return '<div class="mt-3 rounded-xl border border-primary/35 bg-accent/25 px-4 py-3">' +
      '<div class="flex flex-wrap items-baseline gap-2 text-[13px] font-bold">' + (isNew
        ? (isRace ? "引用比赛" : "自填荣誉")
        : "编辑节点") +
        '<span class="' + TIP + ' font-normal">date / title 必填 · 其余可选（cn / note / link / photo / tags）</span></div>' +
      refBlock +
      row("日期 date *", "date", "YYYY-MM-DD", "date") +
      row("标题 title *", "title", "节点标题（必填）") +
      row("副题 cn", "cn", "可选中文副题") +
      row("说明 note", "note", "可选一行补充") +
      row("链接 link", "link", "可选：http(s) 或站内相对路径") +
      /* §92 比赛样式字段（全部可选）：引用比赛自动预填；仅引用比赛或编辑已含此类字段的节点时出现 */
      (showRace ? refRow("成績", '<div class="grid grid-cols-[76px_minmax(0,1fr)_76px_76px] gap-x-3 max-md:grid-cols-2">' +
            cell("rank", "着順", "1 / 2 / 中") + cell("time", "タイム", "2:23.0") + cell("agari", "上り", "33.4") + cell("pop", "人気", "4番") + "</div>") +
          refRow("陣営", '<div class="grid grid-cols-2 gap-x-3">' + cell("jockey", "騎手", "武豊 · 57kg") + cell("trainer", "調教師", "—") + "</div>") +
          refRow("赛事", '<div class="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3">' + cell("grade", "格", "GI") + cell("meta", "场次", "東京11R · 芝2400m · 良") + "</div>") +
          refRow("馬名", '<div class="grid grid-cols-2 gap-x-3">' + cell("hero", "馬名", "马名（日/英原名）") + cell("hero_cn", "副名", "中文译名") + "</div>") +
          '<div class="mt-1 ' + TIP + '">以上按比赛样式渲染（与自动比赛卡同款，可留空走素格式）。</div>'
        : "") +
      row("图片 photo", "photo", "站内 ../data/photos/xxx.webp 或 http(s)；留空 = 无图") +
      '<div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-[7px] text-[12.5px] font-medium text-secondary-foreground">图片上传</div>' +
        '<div class="min-w-0 flex flex-wrap items-center gap-2">' +
          '<label class="' + BTN + ' cursor-pointer select-none' + (dis ? " opacity-40" : "") + '">压缩并上传' +
            '<input id="tlPhotoFile" type="file" accept="image/*" class="hidden"' + dis + "></label>" +
          '<span class="' + TIP + '">浏览器内压到 ≤100KB 后入库，文件名自动生成（timeline-N.webp）</span></div></div>' +
      '<div class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 max-md:grid-cols-[84px_minmax(0,1fr)]">' +
        '<div class="pt-[7px] text-[12.5px] font-medium text-secondary-foreground">标签 tags</div>' +
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
      /* §91 实时预览：表单下方全宽（卡片按真实页 min(480px,100%) 渲染，桌面比例不失真） */
      '<div class="mt-3 rounded-lg border border-border/60 bg-card/60 p-3">' +
        '<div class="yj-ed-lbl">实时预览 · 航迹线页同款</div>' +
        '<div data-tlpreview class="yj-pv mt-2">' + tlCardHTML(ev) + "</div>" +
        '<div class="mt-1.5 text-[10.5px] leading-[1.6] text-muted-foreground">按「加入节点表」的落表形状渲染 · 图位 297:210 · 无图 = 纯文本卡 · 圆点恒人工节点灰（与航迹线页一致）</div>' +
      "</div>" +
      '<div class="mt-2 flex flex-wrap items-center gap-2">' +
        '<button data-tlapply="1" class="' + BTN_PRIMARY + '" type="button"' + dis + ">" +
          (ed.idx < 0 ? "加入节点表" : "更新该节点") + "</button>" +
        '<button data-tlcancel="1" class="' + BTN + '" type="button">取消</button>' +
        '<span class="' + TIP + '">只改本页草稿 ·「提交到 GitHub」后才落盘生效</span></div>' +
      (state.tl.log && state.tl.log.length ? '<div class="mt-1 text-[11.5px] text-primary">' + esc(state.tl.log.join("；")) + "</div>" : "") +
      "</div>";
  }
  function tlReportHTML() {
    return state.tl.dirty
      ? '<div class="mt-2 rounded-md bg-chart3/10 px-2.5 py-1.5 text-[11.5px] text-chart3">时间线改动在草稿箱 · 「提交到 GitHub」后 CI 自动 merge + 重算 build_timeline，约 2 分钟线上生效。</div>'
      : "";
  }
  function tlHTML() {
    if (!state.tl.loaded) return '<div class="hint-empty">时间线表加载中…</div>';
    var evs = state.tl.events;
    var dis = state.tl.busy ? " disabled" : "";
    var toolbar = '<div class="flex flex-wrap items-center gap-2">' +
        '<button data-tlnew="race" class="' + BTN_DIS + '" type="button"' + dis + ">＋ 引用比赛</button>" +
        '<button data-tlnew="free" class="' + BTN_DIS + '" type="button"' + dis + ">＋ 自填荣誉</button>" +
        '<button data-rmtoggle="1" class="' + BTN_DIS + '" type="button"' + dis + ">比赛配图</button>" +
        '<button data-tlreset="1" class="' + BTN_DIS + ' yj-ed-op--ghost" type="button"' + dis + ">放弃修改</button>" +
        (state.tl.dirty ? '<span class="' + BADGE_DIRTY + '">草稿 · 未提交</span>' : "") +
        '<span class="' + TIP + ' ml-auto">' + evs.length + " 个节点 · " + esc(TL_PATH) + "</span>" +
      "</div>";
    /* v3 signature：空态 = 两张入口邀请卡（图标 + 标题 + 一句说明），与页首分段导航同一分组语言；
     * 工具条保留同款入口（有节点后从这里加），空态卡只负责「第一次来就懂」 */
    var empty = evs.length ? "" :
      '<div class="mx-auto mb-2 mt-8 flex max-w-[620px] flex-col items-center gap-3">' +
        '<div class="text-[13px] font-semibold text-secondary-foreground">还没有人工节点</div>' +
        '<div class="flex w-full items-stretch gap-3">' +
          '<button data-tlnew="race" type="button" class="yj-ed-card"' + dis + ">" +
            '<span class="yj-ed-card-ico">' + ICO_FLAG + "</span>" +
            "<b>引用比赛</b>" +
            "<span>选马选场，自动填日期 / 标题 / 链接；说明与标签仍可手改</span></button>" +
          '<button data-tlnew="free" type="button" class="yj-ed-card"' + dis + ">" +
            '<span class="yj-ed-card-ico">' + ICO_AWARD + "</span>" +
            "<b>自填荣誉</b>" +
            "<span>自由登记受赏、纪念节点；date / title 必填</span></button>" +
        "</div>" +
        '<div class="' + TIP + '">节点存进 ' + esc(TL_PATH) + " · 提交后 CI 自动重算航迹线（约 2 分钟）</div>" +
      "</div>";
    return toolbar +
      (state.tl.err ? '<div class="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">' + esc(state.tl.err) + "</div>" : "") +
      racePanelHTML() +
      tlFormHTML() +
      empty +
      (evs.length ? '<div class="mt-3 overflow-hidden rounded-[10px] border border-border">' + evs.map(tlEventHTML).join("") + "</div>" : "") +
      tlReportHTML();
  }
  /* STEP1 选马统一复用基本信息（profile 左栏）同款 selector 组件：compact 搜索 + doubleName 双名
   * （主名日文 + 副名 港译→自译，§82.11）。挂载点在 renderTL 重建的动态表单里，每次渲染重新 init ——
   * selector.js 的 init 是全量重建 + 失联实例自动清退（document 监听只装一次），反复挂载安全。
   * 选中后预填中文显示名，聚焦即清空重选；onSelect → 记状态 + 拉 bundle + 重渲染（重挂载带回填）。 */
  function cnNameOf(h) { return (h && (h.香港馬名 || h.自译馬名)) || YJ.util.mainName(h); }
  function mountTlPickers() {
    if (!window.YJ.selector || !els.tl) return;
    function mount(mountSel, currentId, onPick) {
      var el = els.tl.querySelector(mountSel);
      if (!el) return;
      var cur = currentId ? state.byId[String(currentId)] : null;
      /* currentName 预填 + 已选态（§82.21）：再次聚焦自动清空展示全列表，切马不用手删名字 */
      YJ.selector.init({ el: el, compact: true, doubleName: true,
        currentName: cur ? cnNameOf(cur) : "",
        placeholder: "搜索马名 / 马主 / 调教师 / NK-ID…", onSelect: onPick });
    }
    if (state.tl.edit && state.tl.edit.idx < 0 && state.tl.edit.kind === "race") {
      mount("[data-refselmount]", state.tl.refHorse, function (h) {
        state.tl.refHorse = String(h.id); state.tl.refRace = "";
        loadRaceBundle(String(h.id));
        renderTL();
      });
    }
    if (state.tl.racePanel) {
      mount("[data-rmselmount]", state.tl.raceHorse, function (h) {
        state.tl.raceHorse = String(h.id); state.tl.raceSel = "";
        loadRaceBundle(String(h.id));
        renderTL();
      });
    }
  }
  function renderTL() {
    if (!els.tl) return;
    els.tl.innerHTML = tlHTML();
    mountTlPickers();
  }
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

  /* ---------------- 草稿箱抽屉（保存条上方弹出）：本匹/跨马草稿 + 已保存人工值 + GitHub 连接 ---------------- */
  /* §93 抽屉/查询页共用的未提交草稿条目：ov+ph 按马合并 → 时间线快照 → 比赛配图草稿 */
  function draftEntriesHTML() {
    var d = draftRead();
    var ids = {};
    Object.keys(d.ov || {}).forEach(function (k) { ids[k] = 1; });
    Object.keys(d.ph || {}).forEach(function (k) { ids[k] = 1; });
    var draftRows = Object.keys(ids).map(function (id) {
      var h = state.byId[id];
      var e = d.ov[id] || {};
      var chips = Object.keys(e).filter(function (k) { return k !== "_note"; }).map(function (k) {
        return '<span class="yj-ed-kv">' + esc(k === "photo" ? "图片" : (YJ.i18n.t(k) || k)) + "=" +
          esc(e[k] === null ? "恢复官方值" : pinValueText(k, e[k])) + "</span>";
      });
      if (d.ph[id]) {
        chips.push('<span class="yj-ed-kv">图片=' + (d.ph[id].mode === "remove" ? "恢复官方值" : "草稿 " + d.ph[id].list.length + " 张") + "</span>");
      }
      var name = h ? YJ.util.mainName(h) : "#" + id;
      return '<div class="yj-ed-entry">' +
        '<div class="flex items-baseline gap-2 min-w-0">' +
          '<button data-goto="' + esc(id) + '" class="min-w-0 truncate text-left text-[12.5px] font-bold text-accent-foreground" type="button">' + esc(name) + "</button>" +
          '<span class="flex-none rounded bg-chart3/15 px-1 py-px text-[9.5px] font-bold text-chart3">草稿</span>' +
          '<button data-discard="' + esc(id) + '" class="' + BTN_DANGER + ' ml-auto flex-none" type="button">放弃</button>' +
        "</div>" +
        (chips.length ? '<div class="mt-1.5 flex flex-wrap gap-y-1">' + chips.join("") + "</div>" : "") +
        (e._note ? '<div class="mt-1.5 text-[11px] leading-[1.5] text-muted-foreground" title="' + esc(String(e._note)) + '"><b class="yj-ed-lbl mr-1">备注</b>' + esc(noteBrief(e._note)) + "</div>" : "") +
        "</div>";
    });
    if (d.rc) {
      var rcD = d.rc;
      draftRows.unshift('<div class="yj-ed-entry">' +
        '<div class="flex items-baseline gap-2 min-w-0">' +
          '<a href="edit-table.html" class="min-w-0 truncate text-[12.5px] font-bold text-accent-foreground">比赛记录 · 批量表格</a>' +
          '<span class="flex-none rounded bg-chart3/15 px-1 py-px text-[9.5px] font-bold text-chart3">草稿</span>' +
          '<button data-discard="__rc" class="' + BTN_DANGER + ' ml-auto flex-none" type="button">放弃</button>' +
        "</div>" +
        '<div class="mt-1.5 text-[11px] text-muted-foreground">增 ' + (rcD.add || []).length +
          " 行 · 改 " + (rcD.mod || []).length + " 处 · 删 " + (rcD.del || []).length +
          " 行 → races_edits.json（CI 合并 + 派生重算）</div></div>");
    }
    if (d.tl && d.tl.table) {
      var n = (d.tl.table.events || []).length;
      draftRows.unshift('<div class="yj-ed-entry">' +
        '<div class="flex items-baseline gap-2 min-w-0">' +
          '<a href="edit-timeline.html" class="min-w-0 truncate text-[12.5px] font-bold text-accent-foreground">航迹线人工节点</a>' +
          '<span class="flex-none rounded bg-chart3/15 px-1 py-px text-[9.5px] font-bold text-chart3">草稿</span>' +
          '<button data-discard="__tl" class="' + BTN_DANGER + ' ml-auto flex-none" type="button">放弃</button>' +
        "</div>" +
        '<div class="mt-1.5 text-[11px] text-muted-foreground">整表快照 · 现含 ' + n + " 个节点 · 提交后 CI 自动重算</div></div>");
    }
    var rmDrafts = d.racePh || {};
    Object.keys(rmDrafts).forEach(function (rid) {
      var c = rmDrafts[rid];
      if (!c) return;
      var what = c.mode === "remove" ? "移除配图（节点回退马照片）"
        : "新配图 · " + ((c.item && c.item.name) || "图片") + " · " + kb(c.item && c.item.bytes);
      draftRows.unshift('<div class="yj-ed-entry">' +
        '<div class="flex items-baseline gap-2 min-w-0">' +
          '<button data-rmgoto="' + esc(rid) + '" class="min-w-0 truncate text-left text-[12.5px] font-bold text-accent-foreground" type="button" title="回到配图面板查看 / 替换">' + esc(rmLabel(rid)) + "</button>" +
          '<span class="flex-none rounded bg-chart3/15 px-1 py-px text-[9.5px] font-bold text-chart3">草稿</span>' +
          '<button data-discard="__race:' + esc(rid) + '" class="' + BTN_DANGER + ' ml-auto flex-none" type="button">放弃</button>' +
        "</div>" +
        '<div class="mt-1.5 text-[11px] text-muted-foreground">' + esc(what) + " · 提交后 build_timeline 自动重算生效</div></div>");
    });
    return draftRows;
  }
  function boxHTML() {
    var draftRows = draftEntriesHTML();
    var savedN = pinIds().length;
    var savedSec = savedN ? (
      '<div class="border-t border-border bg-muted/20 px-3 py-2">' +
        '<button data-savedsec="1" class="flex w-full items-baseline gap-2 text-left" type="button" title="' + (state.savedOpen ? "收起" : "展开") + "已保存列表\">" +
          '<span class="yj-ed-lbl">已保存（人工表现值）</span>' +
          '<span class="text-[10px] font-semibold tabular-nums text-muted-foreground">' + savedN + " 匹</span>" +
          '<span class="ml-auto text-[11px] text-muted-foreground">' + (state.savedOpen ? "▾" : "▸") + "</span>" +
        "</button>" +
      "</div>" +
      (state.savedOpen
        ? '<div class="space-y-1.5 p-2">' +
            '<input id="savedQ" type="text" value="' + esc(state.savedQ) + '" placeholder="按马名检索改了什么…" autocomplete="off" class="' + INPUT + ' h-8 w-full font-normal">' +
            pinsHTML() +
          "</div>"
        : "")
    ) : "";
    var token = ghToken();
    var ghRow =
      '<div class="mt-1 border-t border-border px-3 py-2.5">' +
        '<div class="flex items-center gap-2">' +
          '<span class="yj-ed-lbl">GitHub 提交</span>' +
          '<span class="text-[11px] ' + (token ? "text-primary" : "text-muted-foreground") + '">' +
            (token ? "PAT 已存本浏览器" : "未配置 PAT") + "</span>" +
          '<button id="ghPanelBtn" class="' + BTN + ' ml-auto" type="button">' + (state.ghPanel ? "收起" : "连接 / 设置") + "</button>" +
        "</div>" +
        (state.ghPanel
          ? '<div class="mt-2 rounded-md bg-muted/40 p-2.5">' +
              '<div class="text-[11px] leading-[1.6] text-muted-foreground">GitHub → Settings → Developer settings → Fine-grained tokens：' +
              "仅勾 <b class=" + '"text-secondary-foreground"' + ">yunji-web</b> 仓库 · Permissions 勾 <b class=" + '"text-secondary-foreground"' + ">Contents: Read and write</b>（建议 90 天有效期）。</div>" +
              '<div class="mt-1.5 flex items-center gap-1.5">' +
                '<input id="ghTokenInput" type="password" value="" placeholder="github_pat_…" autocomplete="off" class="' + INPUT + ' h-8 min-w-0 flex-1 font-normal">' +
                '<button id="ghTokenSave" class="' + BTN_PRIMARY + '" type="button">保存</button>' +
                (token ? '<button id="ghTokenClear" class="' + BTN_DANGER + '" type="button">清除</button>' : "") +
              "</div>" +
              ((state.gh && state.gh.msg) ? '<div class="mt-1 text-[11px] ' + (state.gh.msgOk ? "text-primary" : "text-destructive") + '">' + esc(state.gh.msg) + "</div>" : "") +
              '<div class="mt-1 text-[10.5px] leading-[1.5] text-muted-foreground">token 只存本浏览器 localStorage，提交动作 = 你本人在 GitHub 上的操作；提交后 push main 自动触发 CI。</div>' +
              legacyTokenNote() +
            "</div>"
          : "") +
      "</div>";
    return '<div class="absolute bottom-full right-0 z-40 mb-2 max-h-[62vh] w-[380px] max-w-[92vw] overflow-y-auto rounded-lg border border-border bg-card shadow-xl max-md:left-0 max-md:right-0 max-md:w-full">' +
        '<div class="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border bg-card px-3 py-2">' +
          '<span class="text-[12.5px] font-bold text-secondary-foreground">草稿箱</span>' +
          '<span class="text-[10.5px] tabular-nums text-muted-foreground">' +
            (draftRows.length ? draftRows.length + " 处未提交" : "暂无草稿") + "</span>" +
          '<button id="boxClose" class="' + BTN + ' ml-auto" type="button">收起</button>' +
        "</div>" +
        (draftRows.length ? '<div class="space-y-1.5 p-2">' + draftRows.join("") + "</div>" : '<div class="px-3 py-3 text-[12px] text-muted-foreground">草稿箱是空的。在页面里改字段 / 图片 / 时间线都会自动进这里，攒够一次性提交。</div>') +
        savedSec +
        ghRow +
      "</div>";
  }
  function renderBox() {
    if (!els.box) return;
    if (!state.boxOpen) { els.box.className = "hidden"; els.box.innerHTML = ""; return; }
    els.box.className = "";
    els.box.innerHTML = boxHTML();
  }

  /* ---------------- §93 草稿箱查询页（edit-drafts.html）：未提交草稿 + 已保存人工值一页通览 ----------------
   * 与抽屉共用 draftEntriesHTML / pinsHTML / state.savedQ 检索；跳转 = edit 页定位，放弃 = 共用 discardOne。 */
  function draftsHTML() {
    var entries = draftEntriesHTML();
    var pinN = pinIds().length;
    /* 卡片级状态色条（2026-10-30 UI 审查 §28）：两块原本同为白底灰边，只能靠标题文字区分
     * 「还没提交」与「已线上生效」。加 3px 左色条后与行级色系语言对齐：
     *   未提交 = chart3 橙（同 .yj-ed-state--dry / .yj-ed-row--dry）
     *   已保存 = primary 青绿（同 .yj-ed-state--pin / .yj-ed-row--pin） */
    return '<div class="rounded-[14px] border border-border border-l-[3px] border-l-chart3 bg-card p-5 shadow-sm max-md:p-4">' +
        '<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">' +
          '<span class="text-[13px] font-bold">未提交草稿</span>' +
          '<span class="' + TIP + '">各编辑页的改动都在这里攒着 · 「提交到 GitHub」一次性原子生效</span>' +
          '<span class="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">' + entries.length + " 处</span>" +
        "</div>" +
        '<div class="mt-3 space-y-1.5">' +
          (entries.length ? entries.join("")
            : '<div class="py-2 text-[12px] leading-[1.7] text-muted-foreground">草稿箱是空的。在基本信息 / 航迹线页里改字段 / 图片 / 时间线都会自动进这里，攒够一次性提交。</div>') +
        "</div>" +
      "</div>" +
      '<div class="mt-3 rounded-[14px] border border-border border-l-[3px] border-l-primary bg-card p-5 shadow-sm max-md:p-4">' +
        '<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">' +
          '<span class="text-[13px] font-bold">已保存人工表值</span>' +
          '<span class="' + TIP + '">线上生效中的人工值（已叠加本浏览器未提交草稿）</span>' +
          '<span class="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">' + pinN + " 匹</span>" +
        "</div>" +
        '<input data-draftq type="text" value="' + esc(state.savedQ) + '" placeholder="按马名 / NK-ID 检索改了什么…" autocomplete="off" class="' + INPUT + ' mt-3 w-full font-normal">' +
        '<div class="mt-2">' + (pinsHTML() || '<div class="py-2 text-[12px] text-muted-foreground">还没有已保存的人工值。</div>') + "</div>" +
      "</div>";
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
    if (state.page !== "horse") return;
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

  function render() {
    persistHorse();   /* 每次重渲染 = 草稿自动落箱（幂等小写入；mode 恒为 draft，§82.4 本机直连已下线） */
    renderMast();
    if (els.drafts) els.drafts.innerHTML = draftsHTML();   /* §93 查询页 */
    if (els.form) els.form.innerHTML = formHTML();
    if (els.photos) renderPhotos();
    if (els.tl) renderTL();
    if (els.report) els.report.innerHTML = reportHTML();
    renderSummary();
    renderBox();
    if (els.summary) els.summary.classList.toggle("hidden", !state.boxOpen);
    var draftN = draftCount();
    if (els.count) els.count.textContent = draftN ? draftN + " 处草稿" : "草稿箱空";
    if (els.boxBtn) els.boxBtn.textContent = draftN ? "草稿箱 · " + draftN : "草稿箱";
    if (els.save) {
      els.save.disabled = state.ghBusy || !draftN;
      els.save.textContent = state.ghBusy ? "提交中…" : "提交到 GitHub";
    }
  }

  function setHorse(h) {
    /* 2026-10-26 修（§107）：切走前先落箱——上传队列进行中切马，已压缩完还没等 render 的图
     * 此前会随 state.photos 重置一起消失（切马 = 唯一不经过 render 的状态清空点）。 */
    persistHorse();
    state.horse = (h && state.byId[String(h.id)]) || h;
    /* 选中马进 bus（sessionStorage currentHorse）：同标签页的 预览/资料页 跟随，重开编辑台也回到这匹 */
    try { if (window.YJ && YJ.bus && YJ.bus.broadcast && state.horse) YJ.bus.broadcast(state.horse.id); } catch (e) { /* ignore */ }
    state.draft = {};
    state.note = "";
    state.err = "";
    state.report = null;
    state.editing = "";                                   /* 台账：同时只开一行，换马即收起 */
    state.photos.draft = []; state.photos.mode = ""; state.photos.open = false;
    state.photos.log = []; state.photos.err = ""; state.photos.drag = -1;
    hydrateHorse();                                       /* draft：把草稿箱里这匹的半成品回填进表单 */
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
    /* 抹消组文本改动（抹消日/場所）→ 同步刷新预览行（select 走 change 全量 render，无需此步） */
    if (MASYO_SUB.indexOf(key) >= 0) {
      var pv = els.form.querySelector('[data-row="_preview"]');
      if (pv) {
        var bx = document.createElement("div");
        bx.innerHTML = previewRowHTML();
        pv.parentNode.replaceChild(bx.firstChild, pv);
      }
    }
    renderMast();
    renderSummary();
    persistHorse();           /* 文本实时改动也立刻落草稿箱 */
    if (els.save) els.save.disabled = state.ghBusy || !draftCount();
    if (els.count) els.count.textContent = (function () { var n = draftCount(); return n ? n + " 处草稿" : "草稿箱空"; })();
    if (els.boxBtn) els.boxBtn.textContent = (function () { var n = draftCount(); return n ? "草稿箱 · " + n : "草稿箱"; })();
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
    if (els.form) els.form.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t.id === "noteInput") {
        state.note = t.value;
        renderSummary();   /* 只换摘要块，备注框本身不重绘 → 光标不丢 */
        persistHorse();
        if (els.save) els.save.disabled = state.ghBusy || !draftCount();
        return;
      }
      if (t.tagName !== "INPUT" || !t.dataset.f) return;
      putFieldDraft(t.dataset.f, t.value);   /* 改回原值 = 自动删键（见 putFieldDraft） */
      state.err = "";
      softRefreshRow(t.dataset.f);
    });
    if (els.form) els.form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.tagName !== "SELECT" || !t.dataset.f) return;
      putFieldDraft(t.dataset.f, t.value);
      state.err = "";
      render();
    });
    if (els.form) els.form.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button[data-unpin]") : null;
      if (!b) return;
      var key = b.dataset.unpin;
      state.draft[key] = null;                  /* 恢复官方值 = 待保存的「删键」意图，落盘时生效 */
      state.err = "";
      render();
    });
    /* 报头「上一匹 / 下一匹」：走 selector 的 onSelect → setHorse，草稿按马重置的既有逻辑不变 */
    if (els.mast) els.mast.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button[data-nav]") : null;
      if (b) navHorse(Number(b.dataset.nav));
    });
    /* 草稿箱抽屉：跳转 / 放弃该条 / 收起 / 已保存段折叠·条目展开 / GitHub 连接设置 */
    if (els.box) els.box.addEventListener("input", function (ev) {
      /* 「已保存」马名检索：逐键过滤。renderBox 会重建 input，回填焦点与光标位 */
      if (ev.target && ev.target.id === "savedQ") {
        state.savedQ = ev.target.value;
        var pos = ev.target.selectionStart;
        renderBox();
        var inp = document.getElementById("savedQ");
        if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) {} }
      }
    });
    if (els.box) els.box.addEventListener("click", function (ev) {
      var b = ev.target.closest
        ? ev.target.closest("button[data-goto],button[data-discard],button[data-savetoggle],button[data-savedsec],button[data-rmgoto],#boxClose,#ghPanelBtn,#ghTokenSave,#ghTokenClear") : null;
      if (!b) return;
      if (b.dataset.rmgoto !== undefined) {                  /* 比赛配图草稿 → 跳回面板选中该场（§82.21） */
        if (state.page !== "timeline") { location.href = "edit-timeline.html"; return; }
        state.boxOpen = false; renderBox();
        if (els.summary) els.summary.classList.toggle("hidden", true);
        var rmeta = rmMeta(b.dataset.rmgoto);
        state.tl.racePanel = true;
        if (rmeta) { state.tl.raceHorse = rmeta.hid; state.tl.raceSel = String(b.dataset.rmgoto); loadRaceBundle(rmeta.hid); }
        renderTL();
        if (els.form) els.form.scrollIntoView({ block: "start" });
        return;
      }
      if (b.dataset.savedsec !== undefined) { state.savedOpen = !state.savedOpen; renderBox(); return; }
      if (b.dataset.savetoggle !== undefined) {
        var sid = b.dataset.savetoggle;
        if (state.savedExp[sid]) delete state.savedExp[sid]; else state.savedExp[sid] = 1;
        renderBox(); return;
      }
      if (b.id === "boxClose") { state.boxOpen = false; renderBox(); if (els.summary) els.summary.classList.toggle("hidden", !state.boxOpen); return; }
      if (b.id === "ghPanelBtn") { state.ghPanel = !state.ghPanel; state.gh = null; renderBox(); return; }
      if (b.id === "ghTokenSave") {
        var v = ((document.getElementById("ghTokenInput") || {}).value || "").trim();
        if (!v) { state.gh = { msg: "先粘贴 token", msgOk: false }; renderBox(); return; }
        ghSaveToken(v);
        state.gh = { msg: "校验中…" };
        renderBox();
        ghTestToken().then(function (r) {
          if (r.ok) {
            state.gh = { msg: "已连接 @" + r.login + " · token 只存本浏览器", msgOk: true };
          } else if (r.network) {
            /* 2026-10-26 修：网络层失败 ≠ token 无效，保留 token——此前一律 ghClearToken()，
             * api.github.com 抖一次就把刚贴的 PAT 静默删掉，看起来像「保存了没生效、得再贴一次」。 */
            state.gh = { msg: "GitHub 校验连不上（网络波动），token 已保留——可直接提交，或稍后重新校验", msgOk: false };
          } else {
            ghClearToken(); state.gh = { msg: "token 无效：" + r.error, msgOk: false };
          }
          renderBox(); render();
        });
        return;
      }
      if (b.id === "ghTokenClear") {
        ghClearToken();
        state.gh = { msg: "已清除本机 token", msgOk: true };
        renderBox(); render();
        return;
      }
      if (b.dataset.discard !== undefined) { discardOne(b.dataset.discard); return; }
      var id = b.dataset.goto, h = state.byId[id];
      if (state.page === "timeline") {                     /* 时间线页点马名 → 跳马匹编辑页定位 */
        location.href = "edit.html?id=" + encodeURIComponent(id);
        return;
      }
      if (h && YJ.selector && YJ.selector.select) YJ.selector.select(h);
      else setHorse({ id: /^\d+$/.test(id) ? Number(id) : id });
      if (els.form) els.form.scrollIntoView({ block: "start" });
    });
    /* §93 放弃一条草稿（抽屉 / 查询页共用）：__tl 整表快照 / __race: 配图草稿 / 其余 = 按马整条 */
    function discardOne(did) {
      if (did === "__tl") {
        tlDrop();
        state.tl.dirty = false; state.tl.err = ""; state.tl.report = null; state.tl.del = -1;
        loadTimeline().then(function () { renderTL(); render(); });
      } else if (did === "__rc") {
        rcPut(null);
        document.dispatchEvent(new CustomEvent("yj-rc-dropped"));   /* 批量表格页监听 → 重新水合表格 */
        render();
      } else if (did.indexOf("__race:") === 0) {
        var rrid = did.slice(7);
        var rc = rmGet()[rrid];
        if (rc && rc.mode === "set" && rc.item && rc.item.ref) blobDel(rc.item.ref);
        rmPut(rrid, null);
        delete state.tl.racePhUrl[rrid];
        renderTL(); render();
      } else {
        draftDropHorse(did);
        if (state.horse && String(state.horse.id) === did) {
          state.draft = {}; state.note = ""; state.editing = "";
          state.photos.mode = ""; state.photos.draft = []; state.photos.meta = {};
        }
        /* 2026-10-30 修：批量表格页（edit-table.html）把 ov 草稿水合成表格行，
         * 此前放弃一条**字段草稿**只删了 localStorage，表格页内存里 S.pendOv / rows 仍是旧值
         * → 用户看到「点了放弃，表格没变化」。与 __rc 分支的 yj-rc-dropped 对称，
         * 这里派发 yj-ov-dropped 让表格页重新水合基本信息表。
         * ⚠ 双仓共用文件（与 kzn 逐字节对齐）：此改动**待用户本人手动同步**到 kzn。
         * 2026-10-30 定稿：本仓不发起任何 kzn 侧写入，kzn 何时同步由用户决定。 */
        document.dispatchEvent(new CustomEvent("yj-ov-dropped", { detail: { id: did } }));
        render();
      }
    }
    /* §93 草稿箱查询页：检索逐键过滤（保焦点）/ 跳马编辑 / 放弃该条 / 已保存条目展开 */
    if (els.drafts) els.drafts.addEventListener("input", function (ev) {
      if (ev.target && ev.target.dataset.draftq !== undefined) {
        state.savedQ = ev.target.value;
        var pos = ev.target.selectionStart;
        render();
        var inp = els.drafts.querySelector("[data-draftq]");
        if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
      }
    });
    if (els.drafts) els.drafts.addEventListener("click", function (ev) {
      var b = ev.target.closest
        ? ev.target.closest("button[data-goto],button[data-discard],button[data-savetoggle],button[data-rmgoto]") : null;
      if (!b) return;
      if (b.dataset.rmgoto !== undefined) { location.href = "edit-timeline.html"; return; }
      if (b.dataset.savetoggle !== undefined) {
        var sd = b.dataset.savetoggle;
        if (state.savedExp[sd]) delete state.savedExp[sd]; else state.savedExp[sd] = 1;
        render(); return;
      }
      if (b.dataset.discard !== undefined) { discardOne(b.dataset.discard); return; }
      location.href = "edit.html?id=" + encodeURIComponent(b.dataset.goto);
    });
    if (els.boxBtn) els.boxBtn.addEventListener("click", function () {
      state.boxOpen = !state.boxOpen;
      renderBox();
      if (els.summary) els.summary.classList.toggle("hidden", !state.boxOpen);
    });
    if (els.save) els.save.addEventListener("click", function () {
      if (state.mode === "draft") { submitDrafts(); return; }
      if (state.page === "timeline") saveTimeline(); else save();
    });
    if (els.reset) els.reset.addEventListener("click", function () {
      if (state.mode === "draft" && state.horse) draftDropHorse(state.horse.id);
      state.draft = {}; state.note = ""; state.err = ""; state.editing = "";
      state.photos.mode = ""; state.photos.draft = []; state.photos.open = false;
      state.gh = null;
      render();
    });
    bindSections();     /* 段标题（字段）点击折叠展开 */

    /* ---------------- M2b 图片区（事件全部委托在容器上，重绘不丢监听；仅 horse 页有 #photos） ---------------- */
    if (els.photos) els.photos.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.id === "photoFile" && t.files && t.files.length) {
        var files = [].slice.call(t.files);
        t.value = "";                                  /* 清掉，允许连续再选同一张 */
        uploadQueue(files, state.horse && state.horse.id);
      }
    });
    if (els.photos) els.photos.addEventListener("input", function (ev) {
      if (ev.target.id === "photoURL") state.photos.url = ev.target.value;
    });
    if (els.photos) els.photos.addEventListener("keydown", function (ev) {
      if (ev.target.id === "photoURL" && ev.key === "Enter") {
        ev.preventDefault();
        var u = (state.photos.url || "").trim();
        if (u) uploadURL(u);
      }
    });
    if (els.photos) els.photos.addEventListener("click", function (ev) {
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
      if (!state.horse) return;      /* draft 形态同样允许改图片（改动进草稿箱） */
      if (b.dataset.pdel !== undefined) delPhoto(Number(b.dataset.pdel));
      else if (b.dataset.pnone !== undefined) markNoPhoto();
      else if (b.dataset.punpin !== undefined) unpinPhoto();
      else return;
      render();
    });
    if (els.photos) {
      els.photos.addEventListener("dragstart", onDragStart);
      els.photos.addEventListener("dragover", onDragOver);
      els.photos.addEventListener("dragleave", function () { clearDragRing(); });
      els.photos.addEventListener("drop", onDrop);
      els.photos.addEventListener("dragend", onDragEnd);
    }

    /* ---------------- M2c 时间线区（仅 timeline 页 / 或 horse 页保留段时有 #tl） ---------------- */
    if (els.tl) els.tl.addEventListener("input", function (ev) {
      var d = ev.target.dataset;
      if (d.tf !== undefined) { editEV()[d.tf] = ev.target.value; pvSync(); return; }   /* §91：预览逐键刷新（不重绘表单、不丢焦点） */
      if (d.tlLabel !== undefined) {
        var i = Number(d.tlLabel);
        editEV().tags[i].label = ev.target.value;
        var chip = els.tl.querySelector('[data-tl-chip="e' + i + '"]');
        if (chip && chip.lastChild) chip.lastChild.nodeValue = ev.target.value || "（空标签）";
        pvSync();
        return;
      }
      if (d.tlTip !== undefined) { editEV().tags[Number(d.tlTip)].tip = ev.target.value; pvSync(); }
    });
    if (els.tl) els.tl.addEventListener("change", function (ev) {
      var t = ev.target, d = t.dataset;
      if (d.refrace !== undefined) {                        /* STEP2 选赛 → 自动填 date/title/link */
        if (t.value !== "") applyRefRace(t.value);
        return;
      }
      if (d.tlCat !== undefined) { editEV().tags[Number(d.tlCat)].cat = t.value; renderTL(); return; }
      if (d.rmrace !== undefined) { state.tl.raceSel = t.value; renderTL(); return; }   /* STEP2 只影响选择态 */
      if (d.rmfile !== undefined && t.files && t.files.length) {
        var rfiles = [].slice.call(t.files);
        t.value = "";
        rmUpload(rfiles, d.rmfile);
        return;
      }
      if (t.id === "tlPhotoFile" && t.files && t.files.length) {
        var files = [].slice.call(t.files);
        t.value = "";
        tlPhotoUpload(files);
      }
    });
    if (els.tl) els.tl.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button") : null;
      if (!b) return;
      var d = b.dataset;
      if (d.tlnew !== undefined) openTLEdit(-1, d.tlnew || "free");   /* race=引用比赛 / free=自填荣誉 */
      else if (d.rmtoggle !== undefined) { state.tl.racePanel = !state.tl.racePanel; renderTL(); }
      else if (d.rmclose !== undefined) { state.tl.racePanel = false; renderTL(); }
      else if (d.rmdel !== undefined) {
        var rrid = d.rmdel, rc = rmGet()[rrid];
        if (rc && rc.mode === "set") {                          /* 撤销未提交的新图 = 清掉该键草稿改动 */
          if (rc.item && rc.item.ref) blobDel(rc.item.ref);
          delete state.tl.racePhUrl[rrid];
          rmPut(rrid, null);
        } else rmPut(rrid, { mode: "remove" });                 /* 盘上已配置 → 提交时删键 */
        /* §133：撤销草稿（1→0）/ 标记移除已配置（0→1）都改草稿数 → 全量 render 重算保存条 */
        render();
      }
      else if (d.tledit !== undefined) openTLEdit(Number(d.tledit));
      else if (d.tldel !== undefined) tlDelete(Number(d.tldel));
      else if (d.tlapply !== undefined) tlApplyEdit();
      else if (d.tlcancel !== undefined) { state.tl.edit = null; state.tl.err = ""; renderTL(); }
      else if (d.tlreset !== undefined) {
        rmDropAll();                            /* 比赛配图草稿一并清（§82.9 同属时间线页草稿） */
        if (state.mode === "draft") tlDrop();   /* draft：放弃 = 清掉草稿箱里的整表快照，回到远端表现值 */
        state.tl.dirty = false; state.tl.edit = null; state.tl.err = ""; state.tl.report = null; state.tl.del = -1;
        /* §133：清箱后草稿数 1→0 → 全量 render 让提交按钮变灰、草稿箱计数归位（此前只 renderTL，
         * 按钮停在亮态，点提交才报「草稿箱是空的」） */
        loadTimeline().then(render);
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
    /* 备注可选（2026-09 定稿④）：留空 = 保留旧备注不误删；写了才覆盖 */
    var note = String(state.note !== "" ? state.note : (ent._note || "")).trim();
    if (hasPin) { if (note) ent._note = note; } else { delete table[id]; }
    return table;
  }

  function save() {
    if (!state.online || !state.horse || state.saving) return;
    var payload = buildPayload();
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
    ["form", "report", "save", "reset", "count", "photos", "tl", "selector",
      "mast", "summary", "box", "boxBtn", "drafts"].forEach(function (k) {
      els[k] = opts[k] ? document.getElementById(opts[k]) : null;
    });
    state.page = opts.mode === "timeline" ? "timeline" : (opts.mode === "drafts" ? "drafts" : (opts.mode === "table" ? "table" : "horse"));
    var qid = state.page === "horse" ? new URLSearchParams(location.search).get("id") : null;
    /* 编辑台只认盘上真值：先失效路 D 的 basic.json 共享缓存（§82.4 起编辑台恒为草稿箱模式，
     * 不再探测/依赖 edit_server；线上提交统一走 GitHub API → CI） */
    if (YJ.selector && YJ.selector.clearBasicCache) YJ.selector.clearBasicCache();

    function loadHorses() {
      return getJSON(YJ_DATA.url("basic.json")).then(function (d) {
        var hs = d && (Array.isArray(d) ? d : d.horses);
        return hs || [];
      }, function () { return []; });
    }
    function loadRaceManual() {          /* 比赛人工配图（§82.9）：404/坏 JSON = 空表 */
      return getJSON(YJ_DATA.url("races_manual.json")).then(function (j) {
        return (j && typeof j === "object" && !Array.isArray(j)) ? j : {};
      }, function () { return {}; });
    }

    var jobs = [loadHorses(), loadTable()];
    if (state.page === "timeline") jobs.push(loadTimeline(), loadRaceManual());
    return Promise.all(jobs).then(function (r) {
      state.horses = r[0] || [];
      state.byId = {};
      state.horses.forEach(function (h) { state.byId[String(h.id)] = h; });
      state.table = r[1] || {};
      if (state.page === "timeline") { state.tl.raceManual = r[3] || {}; hydrateRacePh(); }
      bind();
      /* 马匹检索 = 基本信息（profile 左栏）同款 selector：compact 搜索 + doubleName 双名显示
       * （主名日文 + 副名 港译→自译，§82.11）；选完输入框也显示中文名，方便核对。挂报头 #selector（静态挂载点） */
      if (state.page === "horse" && els.selector && window.YJ.selector) {
        YJ.selector.init({
          el: els.selector, compact: true, doubleName: true,
          placeholder: "搜索马名 / 马主 / 调教师 / NK-ID…",
          onSelect: function (h) {
            setHorse(h);
            setTimeout(function () {              /* setSel 先写主名 → 跟一帧改成中文显示名 */
              var input = els.selector.querySelector("input");
              if (input) input.value = cnNameOf(h);
            }, 0);
          }
        }).then(function () {
          var input = els.selector.querySelector("input");
          if (input && state.horse) input.value = cnNameOf(state.horse);
        });
      }
      /* 在线 = 本地编辑工具：选择器那份 basic.json 可能命中浏览器 HTTP 缓存（同 URL 启发式复用），
       * 开机再走一次带 cache-buster 的 no-store 读取，保证行内「生效值」= 上一次保存 merge 后的真值。 */
      var ready = state.online ? refresh(false) : Promise.resolve();
      return ready.then(function () {
        /* 起始马：?id= > bus 记忆（2026-10-26 补，§107——此前每次打开都从第 1 匹开始，
         * 回到编辑台找不到刚改的那匹，也是「改了没回显」体感的一部分）> 第 1 匹 */
        var remembered = null;
        try { if (window.YJ && YJ.bus && YJ.bus.readLocal) remembered = YJ.bus.readLocal(); } catch (e) { /* ignore */ }
        var start = (qid && state.byId[String(qid)]) ||
          (remembered != null && String(remembered) !== "" && state.byId[String(remembered)]) ||
          state.horses[0] || null;
        if (state.page !== "drafts" && state.page !== "table" && start) setHorse(start);   /* 查询/批量表格页不选马（§93/§104），其余照旧 */
        render();
        if (state.page !== "drafts" && state.page !== "table") applyTab();      /* horse 页 ?tab= 兼容保留；无参数 = 现状 */
        return state;
      });
    });
  }

  return {
    init: init, probe: probe, FIELDS: FIELDS, state: state,
    /* 台账形态：行内编辑 + 分段折叠（?tab= 直达）；渲染态就是 state.editing / state.photos.open */
    openSec: openSec, applyTab: applyTab, render: render,
    /* 草稿箱公共访问（§104 批量表格页复用同一条提交链路）：ov=人工字段草稿，rc=比赛编辑草稿 */
    draftRead: draftRead, draftWrite: draftWrite,
    ovGet: ovGet, ovPut: ovPut, rcGet: rcGet, rcPut: rcPut, rcN: rcN,
    submitDrafts: submitDrafts, mergeRaceEdits: mergeRaceEdits,
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
