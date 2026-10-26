/* ============================================================
 * editor-table.js —— 编辑台 · 批量表格（§104 键盘电子表格流，方案定稿见 docs/UI优化记录.md §104）
 * ------------------------------------------------------------
 * 定稿（2026-10-24 用户拍板 A 案）：整页密表 + 单元格就地编辑 + Enter↓ / Tab→ / 方向键移动 +
 * Ctrl+Z·Ctrl+Y 撤销重做 + 行首勾选批量删除（比赛页签）。编辑链路**完全复用 editor.js**：
 *   基本信息 → 草稿箱 d.ov（manual_overrides 契约，值=钉住 / null=恢复官方值）；
 *   比赛记录 → 草稿箱 d.rc（races_edits.json 契约，docs/SCHEMA.md §9）；
 *   提交 = 「提交到 GitHub」按钮 → YJ.editor.submitDrafts()（同一原子 commit）。
 * 数据层：basic = 官方值(basic.json) ← 已保存钉(state.table) ← 本页待保存(d.ov)；
 *         races = 官方值(bundle 解码；已提交的编辑表改动已由管线烙进数据) ← 本页待保存(d.rc)。
 * 撤销/重做 = 内存操作日志逐条回滚（并同步草稿箱）；「放弃修改」按会话快照只回滚本页改动。
 * 依赖：data-config / yj-cache / race-bundle / i18n / editor.js（须先 YJ.editor.init(mode:"table")）。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.editorTable = (function () {
  "use strict";

  var esc = YJ.util.esc;
  var RK = null, EK = null;            /* race-bundle 字段表（init 时从 YJ.raceBundle 取） */

  /* ---------------- 列定义 ---------------- */
  /* basic：id/馬名/photo 只读；其余 = editor.js::FIELDS 白名单（单一出处，勿在此复制键清单） */
  var BASIC_LAYOUT = [
    { k: "id", ro: 1, num: 1, w: 48, stick: 2 },
    { k: "馬名", ro: 1, w: 150, stick: 3 },
    { k: "香港馬名", w: 108 },
    { k: "自译馬名", w: 108 },
    { k: "性別", w: 64, type: "select" },
    { k: "登録状態", w: 92, type: "select" },
    { k: "抹消日", w: 100 },
    { k: "抹消_去向種別", w: 100, type: "select" },
    { k: "抹消_去向場所", w: 110 },
    { k: "馬主", w: 130 },
    { k: "調教師", w: 150 },
    { k: "通算成績", w: 150 },
    { k: "セリ取引価格", w: 88 },
    { k: "獲得賞金 (中央)", w: 108 },
    { k: "獲得賞金 (地方)", w: 108 },
    { k: "総賞金", w: 100 },
    { k: "photo", ro: 1, w: 84 }
  ];
  var RACE_LAYOUT = [
    { k: "日付", w: 96, stick: 3 },
    { k: "出走馬名", w: 140 },
    { k: "場名", w: 60 },
    { k: "R", num: 1, w: 44 },
    { k: "レース名", w: 220 },
    { k: "格", w: 96, type: "select", opts: ["", "GI", "JpnI", "GII", "JpnII", "GIII", "JpnIII", "JGI", "JGII", "JGIII", "L", "OP", "3勝クラス", "2勝クラス", "1勝クラス", "新馬", "未勝利"] },   /* 级别枚举 = racelib.GRADE_ORDER + 障害 JG* + MAJOR_TIER 班赛（merge_races 归一同口径） */
    { k: "距離", num: 1, w: 64 },
    { k: "芝ダ", w: 64, type: "select", opts: ["芝", "ダ", "障", "AW"] },
    { k: "馬場", w: 60 },
    { k: "斤量", num: 1, w: 56 },
    { k: "人気", num: 1, w: 56 },
    { k: "結果", w: 64 },
    { k: "タイム", w: 80 },
    { k: "上り", w: 64 },
    { k: "末脚", w: 60, type: "select", opts: ["", "金", "银", "铜"] },
    { k: "騎手", w: 90 },
    { k: "賞金", num: 1, w: 108 },
    { k: "來源", w: 70 },
    { k: "race_id", ro: 1, w: 110 }
  ];

  var S = {
    sheet: "basic",
    sh: {
      basic: { rows: [], view: [], filter: "", sel: {}, hidden: {}, optSrc: {} },
      races: { rows: [], view: [], filter: "", sel: {}, hidden: {} }
    },
    pendOv: {},            /* id -> key -> {v(新值|null=恢复官方), base, saved}（本页会话的待保存层） */
    startOv: {},           /* 会话开始时各马 ov 草稿条目快照（含其它页面产生的草稿键） */
    touchedOv: {},         /* 会话中写过的马 id */
    startRc: null,         /* 会话开始时 d.rc 快照 */
    cur: null, editing: null,
    undoJ: [], redoJ: [],
    batch: 0, jbuf: []     /* 复合操作（粘贴导入等）的日志合并 */
  };
  var els = {};

  /* ---------------- 小工具 ---------------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function label(k) { try { return (YJ.i18n.t && YJ.i18n.t(k)) || k; } catch (e) { return k; } }
  function fieldOf(key) {
    for (var i = 0; i < YJ.editor.FIELDS.length; i++) if (YJ.editor.FIELDS[i].key === key) return YJ.editor.FIELDS[i];
    return null;
  }
  var toastTimer = null;
  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg; els.toast.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { els.toast.classList.add("hidden"); }, 2400);
  }
  function layout() { return S.sheet === "basic" ? BASIC_LAYOUT : RACE_LAYOUT; }
  function sh() { return S.sh[S.sheet]; }

  /* ---------------- 撤销/重做日志 ---------------- */
  function jPush(entry) {
    if (S.batch) { S.jbuf.push(entry); return; }
    _push(entry);
  }
  function _push(entry) {
    S.undoJ.push(entry);
    if (S.undoJ.length > 80) S.undoJ.shift();
    S.redoJ.length = 0;
    syncToolbar();
  }
  function jBegin() { S.batch++; S.jbuf = []; }
  function jEnd() {
    S.batch--;
    if (!S.batch && S.jbuf.length) {
      var buf = S.jbuf; S.jbuf = [];
      _push({
        undo: function () { for (var i = buf.length - 1; i >= 0; i--) buf[i].undo(); },
        redo: function () { buf.forEach(function (e) { e.redo(); }); }
      });
    }
  }
  function undo() {
    if (S.editing) commitEdit();
    var e = S.undoJ.pop();
    if (!e) { toast("没有可撤销的操作"); return; }
    S.redoJ.push(e); e.undo();
    afterHistory(); toast("已撤销");
  }
  function redo() {
    if (S.editing) commitEdit();
    var e = S.redoJ.pop();
    if (!e) { toast("没有可重做的操作"); return; }
    S.undoJ.push(e); e.redo();
    afterHistory(); toast("已重做");
  }
  function afterHistory() { rebuild(); YJ.editor.render(); }

  /* ---------------- 草稿同步：基本信息（d.ov） ---------------- */
  function baseOf(id, key) {
    var h = YJ.editor.state.byId[id];
    return h ? (h[key] == null ? "" : h[key]) : "";
  }
  function savedOf(id, key) {
    var ent = YJ.editor.state.table[String(id)];
    if (!ent || !(key in ent)) return null;
    var v = ent[key];
    return v == null ? null : v;
  }
  function effBasic(id, key) {
    var p = S.pendOv[id] && S.pendOv[id][key];
    if (p) return p.v === null ? baseOf(id, key) : p.v;
    var sv = savedOf(id, key);
    return sv != null ? sv : baseOf(id, key);
  }
  function syncOv(id) {
    if (!S.touchedOv[id]) return;
    var st = S.pendOv[id] || {};
    var entry = S.startOv[id] ? clone(S.startOv[id]) : {};
    Object.keys(st).forEach(function (k) {
      entry[k] = st[k].v;               /* null = 恢复官方值（显式删键意图）；其余 = 钉住 */
    });
    YJ.editor.ovPut(id, entry);
  }
  function setBasicCell(row, key, val, j) {
    var id = String(row.id);
    var prev = S.pendOv[id] && S.pendOv[id][key] ? clone(S.pendOv[id][key]) : null;
    var hadPend = !!(S.pendOv[id] && S.pendOv[id][key]);
    var oldEff = effBasic(id, key);
    var base = baseOf(id, key), saved = savedOf(id, key);
    var nu;
    if (String(val) === String(base)) {
      nu = saved != null ? { v: null, base: base, saved: saved } : null;   /* 回官方：有钉 → 恢复官方值意图；无钉 → 不产生条目 */
    } else {
      nu = { v: val, base: base, saved: saved };
    }
    if (!S.pendOv[id]) S.pendOv[id] = {};
    if (nu) S.pendOv[id][key] = nu; else delete S.pendOv[id][key];
    S.touchedOv[id] = 1;
    row[key] = nu ? (nu.v === null ? base : nu.v) : (saved != null ? saved : base);
    syncOv(id);
    if (j) j.push({
      undo: function () {
        var st = S.pendOv[id] || (S.pendOv[id] = {});
        if (hadPend) st[key] = prev; else delete st[key];
        row[key] = oldEff; syncOv(id);
      },
      redo: function () {
        var st = S.pendOv[id] || (S.pendOv[id] = {});
        if (nu) st[key] = clone(nu); else delete st[key];
        row[key] = nu ? (nu.v === null ? base : nu.v) : (saved != null ? saved : base); syncOv(id);
      }
    });
    return oldEff !== String(row[key]);
  }

  /* ---------------- 草稿同步：比赛记录（d.rc） ---------------- */
  function gidOf(rec) { return rec.race_id ? "r" + rec.race_id : "d" + String(rec.日付 || ""); }
  function hydrateRaces() {
    var rc = YJ.editor.rcGet();
    var rows = [];
    var bundleRows = S.bundleBy || {};
    Object.keys(bundleRows).forEach(function (hid) {
      (bundleRows[hid] || []).forEach(function (rec) {
        var r = {};
        RACE_LAYOUT.forEach(function (c) { r[c.k] = rec[c.k] == null ? "" : rec[c.k]; });
        r.hid = hid; r._gid = gidOf(rec); r._gk = hid + "|" + r._gid;
        r._base = clone(rec);
        r._baseIdent = { race_id: String(rec.race_id || ""), 日付: String(rec.日付 || ""), 馬名: String(rec.出走馬名 || "") };
        r._pend = {};
        rows.push(r);
      });
    });
    rows.sort(function (a, b) { return (a.日付 < b.日付 ? 1 : a.日付 > b.日付 ? -1 : (a._gk < b._gk ? -1 : 1)); });
    /* 水合草稿：del → 标记；mod → 值 + pend；add → 追加行（_add 原对象引用） */
    var delKeys = {};
    (rc.del || []).forEach(function (t) {
      if (!t) return;
      var hid = String(t.id == null ? "" : t.id);
      var ks = recKeysJs(t);
      rows.forEach(function (r) {
        if (String(r.hid) !== hid) return;
        if (recKeysJs(r._base).some(function (x) { return ks.indexOf(x) >= 0; })) { r._st = "del"; delKeys[r._gk] = 1; }
      });
    });
    (rc.mod || []).forEach(function (t) {
      if (!t || !t.set) return;
      var hid = String(t.id == null ? "" : t.id);
      var ks = recKeysJs(t);
      rows.forEach(function (r) {
        if (String(r.hid) !== hid || r._st === "del") return;
        if (!recKeysJs(r._base).some(function (x) { return ks.indexOf(x) >= 0; })) return;
        Object.keys(t.set).forEach(function (k) {
          r[k] = t.set[k] == null ? (r._base[k] == null ? "" : r._base[k]) : t.set[k];
          if (t.set[k] == null) delete r._pend[k]; else r._pend[k] = 1;
        });
      });
    });
    (rc.add || []).forEach(function (rec) {
      var r = clone(rec);
      RACE_LAYOUT.forEach(function (c) { if (r[c.k] == null) r[c.k] = ""; });
      r.hid = rec.id == null ? "" : String(rec.id);
      r._gid = gidOf(rec); r._gk = "new|" + r._gid + "|" + Math.random().toString(36).slice(2, 7);
      r._base = clone(rec); r._baseIdent = { race_id: "", 日付: String(rec.日付 || ""), 馬名: String(rec.出走馬名 || "") };
      r._pend = {}; r._st = "new"; r._add = rec;      /* _add = rc.add 里的原对象：直接改它 */
      rows.push(r);
    });
    S.sh.races.rows = rows;
  }
  function recKeysJs(r) {
    var ks = [];
    if (r && r.race_id) ks.push("r:" + String(r.race_id));
    var nm = String((r && r.出走馬名) || "").trim(), dt = String((r && r.日付) || "").trim();
    if (nm && dt) ks.push("h:" + nm + "|" + dt);
    return ks;
  }
  function syncRc() {
    var rc = { add: [], mod: [], del: [] };
    var modIdx = {}, delIdx = {};
    S.sh.races.rows.forEach(function (r) {
      if (r._st === "new") {
        if (r._add && r._add.id != null) rc.add.push(r._add);
        return;
      }
      if (r._st === "del") {
        if (!delIdx[r._gk]) {
          delIdx[r._gk] = 1;
          rc.del.push({ id: r.hid, race_id: r._baseIdent.race_id, 日付: r._baseIdent.日付, 馬名: r._baseIdent.馬名 });
        }
        return;
      }
      var pk = Object.keys(r._pend || {});
      if (pk.length) {
        var m = modIdx[r._gk];
        if (!m) {
          m = modIdx[r._gk] = { id: r.hid, race_id: r._baseIdent.race_id, 日付: r._baseIdent.日付, 馬名: r._baseIdent.馬名, set: {} };
          rc.mod.push(m);
        }
        pk.forEach(function (k) { m.set[k] = r[k]; });
      }
    });
    YJ.editor.rcPut(rc);
  }
  function isRaceLevel(key) { return RK.indexOf(key) >= 0; }
  function groupRows(r) {
    return S.sh.races.rows.filter(function (x) { return x._gk === r._gk; });
  }

  /* ---------------- 行/结构操作 ---------------- */
  function commitVal(v) {
    var s = String(v == null ? "" : v).trim();
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
  }
  function addRaceRow() {
    if (S.sheet !== "races") { toast("基本信息不支持表格新增（建档走抓取管线）"); return; }
    var rec = { id: null, 來源: "人工", 結果: "" };
    RACE_LAYOUT.forEach(function (c) { if (rec[c.k] == null) rec[c.k] = ""; });
    var r = {
      hid: "", _gid: "", _gk: "new|" + Math.random().toString(36).slice(2, 7),
      _base: clone(rec), _baseIdent: { race_id: "", 日付: "", 馬名: "" },
      _pend: {}, _st: "new", _add: rec
    };
    RACE_LAYOUT.forEach(function (c) { r[c.k] = rec[c.k]; });
    var sh0 = sh();
    jBegin();
    sh0.rows.push(r);
    syncRc();
    jEnd();
    S.filterClear = 1;
    sh0.filter = ""; if (els.search) els.search.value = "";
    rebuild();
    var td = $('td[data-gk="' + r._gk + '"][data-c="出走馬名"]', els.grid);
    if (td) { td.scrollIntoView({ block: "nearest" }); startEdit(td); }
    YJ.editor.render();
  }
  function resolveHorse(name) {
    var nm = String(name || "").trim();
    if (!nm) return null;
    var hs = YJ.editor.state.horses;
    for (var i = 0; i < hs.length; i++) if (String(hs[i].馬名 || "").trim() === nm) return hs[i];
    return null;
  }
  function delSelected() {
    if (S.sheet !== "races") return;
    var list = Object.keys(sh().sel).map(Number);
    if (!list.length) return;
    jBegin();
    var n = 0;
    list.forEach(function (i) {
      var r = sh().rows[i];
      if (!r || r._st === "del") return;
      if (r._st === "new") {
        var idx = sh().rows.indexOf(r);
        sh().rows.splice(idx, 1);          /* 未提交的新增行 → 直接移除 */
        jPush({
          undo: function () { sh().rows.splice(Math.min(idx, sh().rows.length), 0, r); syncRc(); },
          redo: function () { var k = sh().rows.indexOf(r); if (k >= 0) sh().rows.splice(k, 1); syncRc(); }
        });
      } else {
        groupRows(r).forEach(function (g) { g._st = "del"; });
        jPush({
          undo: function () { groupRows(r).forEach(function (g) { delete g._st; }); syncRc(); },
          redo: function () { groupRows(r).forEach(function (g) { g._st = "del"; }); syncRc(); }
        });
      }
      n++;
    });
    sh().sel = {};
    syncRc();
    jEnd();
    rebuild(); YJ.editor.render();
    toast("已标记删除 " + n + " 行（撤销可恢复）");
  }

  /* ---------------- 水合：基本信息 ---------------- */
  function hydrateBasic() {
    var d = YJ.editor.draftRead();
    S.startOv = {};
    Object.keys(d.ov || {}).forEach(function (k) { S.startOv[k] = clone(d.ov[k]); });
    S.pendOv = {};
    Object.keys(S.startOv).forEach(function (id) {
      S.pendOv[id] = {};
      var ent = S.startOv[id];
      Object.keys(ent).forEach(function (k) {
        if (k.charAt(0) === "_") return;                        /* _note 等不进表格 */
        if (!fieldOf(k)) return;                                /* photo 等非白名单键不在表格列 */
        var sv = savedOf(id, k), base = baseOf(id, k);
        var v = ent[k];
        if (v === null) S.pendOv[id][k] = { v: null, base: base, saved: sv };
        else if (sv == null && String(v) === String(base)) { /* 无钉同值 → 不算待保存（2026-10-26 修：原写 saved，未声明标识符 → 带草稿重开本页 ReferenceError） */ }
        else S.pendOv[id][k] = { v: v, base: base, saved: sv };
      });
      if (!Object.keys(S.pendOv[id]).length) delete S.pendOv[id];
    });
    var rows = [];
    (YJ.editor.state.horses || []).forEach(function (h) {
      var r = {};
      BASIC_LAYOUT.forEach(function (c) {
        r[c.k] = c.k === "photo" ? (h.photo == null ? "" : h.photo) : effBasic(String(h.id), c.k);
      });
      r.id = h.id;
      rows.push(r);
    });
    S.sh.basic.rows = rows;
  }

  /* ---------------- 视图/渲染 ---------------- */
  function rowTextBasic(r) {
    return BASIC_LAYOUT.map(function (c) { return String(r[c.k] == null ? "" : r[c.k]); }).join("\t").toLowerCase();
  }
  function rowTextRaces(r) {
    return RACE_LAYOUT.map(function (c) { return String(r[c.k] == null ? "" : r[c.k]); }).join("\t").toLowerCase();
  }
  function computeView() {
    var s = sh(), q = s.filter.trim().toLowerCase();
    s.view = [];
    s.rows.forEach(function (r, i) {
      var txt = S.sheet === "basic" ? rowTextBasic(r) : rowTextRaces(r);
      if (!q || txt.indexOf(q) >= 0) s.view.push({ r: r, i: i });
    });
  }
  function cellInner(c, r) {
    var v = r[c.k];
    if (c.k === "結果" && typeof v === "number") return '<b class="' + (v === 1 ? "text-primary" : "") + '">' + v + "</b>";
    if (c.k === "格" && v) {
      var g = (window.YJ_GRADE || {})[v];
      if (g && g[1]) return '<span class="yj-grade yj-' + g[1] + '" style="margin-left:0">' + esc(g[0] || v) + "</span>";
    }
    if (c.k === "photo") {
      if (Array.isArray(v)) return v.length ? esc(v.length + " 张") : '<span class="text-muted-foreground/60">—</span>';
      return v ? '<span class="text-muted-foreground/60">1</span>' : '<span class="text-muted-foreground/60">—</span>';
    }
    return esc(v);
  }
  function pendCellOv(r, key) { return !!(S.pendOv[String(r.id)] && S.pendOv[String(r.id)][key]); }
  function savedCellOv(r, key) {
    var sv = savedOf(String(r.id), key);
    return sv != null && !(S.pendOv[String(r.id)] && S.pendOv[String(r.id)][key]);
  }
  function renderHead() {
    var s = sh(), isB = S.sheet === "basic";
    var h = "<tr>";
    if (!isB) h += '<th class="sticky left-0 top-0 z-30 w-[34px] bg-card px-0 text-center"><input id="ckAll" type="checkbox" class="h-3.5 w-3.5 align-middle"></th>';
    h += '<th class="' + (isB ? "sticky left-0 " : "sticky left-[34px] ") + 'top-0 z-30 w-[42px] bg-card px-0 text-center text-[10.5px] font-medium text-muted-foreground">#</th>';
    var left = isB ? 42 : 76;
    layout().forEach(function (c) {
      if (s.hidden[c.k]) return;
      var st = c.stick ? ' sticky top-0 z-20" style="left:' + left + "px" : "";
      h += '<th class="border-l border-border/60 bg-card px-2 py-[7px] text-left text-[11px] font-semibold text-muted-foreground' + st + '" data-k="' + esc(c.k) + '">' +
        esc(label(c.k)) + (c.ro ? ' <span class="text-[9.5px] font-normal text-muted-foreground/60">只读</span>' : "") + "</th>";
    });
    h += "</tr>";
    els.thead.innerHTML = h;
    var ck = $("#ckAll");
    if (ck) ck.addEventListener("change", function () {
      if (ck.checked) s.view.forEach(function (v) { if (v.r._st !== "del") s.sel[v.i] = 1; });
      else s.sel = {};
      renderBody(); syncToolbar();
    });
  }
  function renderBody() {
    var s = sh(), isB = S.sheet === "basic", h = [];
    s.view.forEach(function (v, vi) {
      var r = v.r, ri = v.i;
      var rowCls = "";
      if (r._st === "new") rowCls = "bg-accent/25";
      else if (r._st === "del") rowCls = "bg-destructive/5 opacity-60";
      h.push('<tr class="' + rowCls + '">');
      if (!isB) h.push('<td class="sticky left-0 z-10 w-[34px] bg-card text-center align-middle"><input type="checkbox" class="yjx-ck h-3.5 w-3.5 align-middle" data-ri="' + ri + '"' + (s.sel[ri] ? " checked" : "") + "></td>");
      var mark = r._st === "new" ? '<i class="not-italic text-primary">＋</i>'
        : r._st === "del" ? '<i class="not-italic text-destructive">✕</i>'
        : Object.keys(r._pend || {}).length ? '<i class="not-italic text-chart3">•</i>'
        : isB && hasOvPend(r) ? '<i class="not-italic text-chart3">•</i>'
        : '<i class="not-italic text-border">·</i>';
      h.push('<td class="' + (isB ? "sticky left-0 " : "sticky left-[34px] ") + 'z-10 w-[42px] bg-card text-center align-middle text-[10.5px] text-muted-foreground">' + (vi + 1) + " " + mark + "</td>");
      layout().forEach(function (c) {
        if (s.hidden[c.k]) return;
        var cls = "border-l border-border/60 px-2 py-[5px] align-middle whitespace-nowrap ";
        if (c.num) cls += "text-right tabular-nums ";
        if (c.ro || (c.k === "出走馬名" && r._st !== "new")) cls += "text-muted-foreground/80 ";
        if (c.stick) cls += "sticky z-10 bg-card ";
        if (isB && pendCellOv(r, c.k)) cls += "bg-chart3/10 ";
        else if (isB && savedCellOv(r, c.k)) cls += "bg-accent/40 ";
        if (!isB && r._pend && r._pend[c.k]) cls += "bg-chart3/10 ";
        var t = cellInner(c, r);
        if (r._st === "del") t = '<s class="decoration-destructive/60">' + t + "</s>";
        h.push('<td class="' + cls + '" style="' + (c.stick ? "left:" + (isB ? 42 : 76) + "px;" : "") +
          '" data-ri="' + ri + '" data-gk="' + esc(r._gk || String(r.id)) + '" data-c="' + esc(c.k) + '">' + t + "</td>");
      });
      h.push("</tr>");
    });
    if (!s.view.length) {
      var cs = layout().filter(function (c) { return !s.hidden[c.k]; }).length;
      h.push('<tr><td colspan="' + (cs + 2) + '" class="hint-empty">无匹配行</td></tr>');
    }
    els.tbody.innerHTML = h.join("");
  }
  function hasOvPend(r) {
    var st = S.pendOv[String(r.id)];
    if (!st) return false;
    for (var k in st) return true;
    return false;
  }
  function rebuild() {
    computeView(); renderHead(); renderBody(); syncToolbar(); updateSummary();
    els.meta.textContent = sh().view.length + " / " + sh().rows.length + " 行";
  }
  function updateSummary() {
    if (!els.summary) return;
    var nB = 0, nRc = YJ.editor.rcN();
    Object.keys(S.pendOv).forEach(function (id) { nB += Object.keys(S.pendOv[id]).length; });
    var rc = YJ.editor.rcGet();
    var parts = [];
    if (nB) parts.push('<span class="text-chart3">基本信息 ' + nB + " 格</span>");
    if (rc.add && rc.add.length) parts.push('<span class="text-primary">比赛增 ' + rc.add.length + "</span>");
    if (rc.mod && rc.mod.length) parts.push('<span class="text-chart3">比赛改 ' + rc.mod.length + "</span>");
    if (rc.del && rc.del.length) parts.push('<span class="text-destructive">比赛删 ' + rc.del.length + "</span>");
    els.summary.innerHTML = parts.length ? "待提交：" + parts.join(" · ") : "";
  }
  function syncToolbar() {
    if (els.addBtn) els.addBtn.disabled = S.sheet !== "races";
    if (els.addBtn) els.addBtn.title = S.sheet === "races" ? "" : "基本信息建档/移除走抓取管线，不支持表格增删";
    if (els.delBtn) els.delBtn.disabled = S.sheet !== "races" || !Object.keys(sh().sel).length;
    if (els.undoBtn) els.undoBtn.disabled = !S.undoJ.length;
    if (els.redoBtn) els.redoBtn.disabled = !S.redoJ.length;
    if (els.pasteBtn) els.pasteBtn.disabled = S.sheet !== "races";
    if (els.pasteBtn) els.pasteBtn.title = S.sheet === "races" ? "" : "粘贴导入只在比赛页签开放";
  }

  /* ---------------- 单元格编辑 ---------------- */
  function rowAt(ri) {          /* data-ri = 绝对行号（rows 下标），经 view 反查（过滤后仍成立） */
    var r = null;
    sh().view.forEach(function (v) { if (v.i === ri) r = v.r; });
    return r;
  }
  function startEdit(td) {
    var ri0 = +td.getAttribute("data-ri"), key0 = td.getAttribute("data-c");
    if (S.editing) {
      if (S.editing.td === td) return;      /* 已在编辑本格（追加行自动聚焦 + 二次点击）→ 复用现有输入框 */
      commitEdit();                          /* 先提交别格；重建后按行号重新定位本格（旧 td 可能已随重建换新） */
      var td2 = locateCell(ri0, key0);
      if (!td2) return;
      td = td2;
    }
    var ri = ri0, key = key0;
    var c = null; layout().forEach(function (x) { if (x.k === key) c = x; });
    if (!c) return;
    var r = rowAt(ri);
    if (!r) return;
    setCursor(null);   /* 开编辑器前清掉光标环：提交上一格时 applyCell 会先给它画环，不清会双高亮 */
    if (c.ro) { setCursor(td); return; }
    if (c.k === "出走馬名" && r._st !== "new") { setCursor(td); return; }   /* 已有记录的马名只读 */
    var old = r[key] == null ? "" : r[key];
    /* 编辑控件绝对定位盖满本格（§104 打磨②定稿：格子多大框就多大，全屏/非全屏一致，绝不撑表）：
     * w-full 输入框在 auto 表格布局里会以固有宽度(~170px)参与列宽计算 → 窄格被撑开；
     * absolute 元素不参与表格布局 → 零影响。invisible 占位文本保住本列宽度（本格可能是
     * 该列最宽者，清空内容会缩列）。sticky 格的 position 不能动（relative 会破坏吸左）——
     * sticky 本身就是绝对定位的 containing block，无需处理。 */
    if (window.getComputedStyle(td).position === "static") td.style.position = "relative";
    td.innerHTML = '<span class="invisible whitespace-pre">' + esc(old) + "</span>";
    var inp;
    if (c.type === "select") {
      var opts = c.opts || selectOpts(c.k, r);
      inp = document.createElement("select");
      opts.forEach(function (o) {
        var op = document.createElement("option"); op.value = o; op.textContent = o === "" ? "（空）" : o; inp.appendChild(op);
      });
      var hasOld = false;
      Array.prototype.forEach.call(inp.options, function (op) { if (op.value === String(old)) hasOld = true; });
      if (!hasOld && String(old) !== "") {
        var op2 = document.createElement("option"); op2.value = old; op2.textContent = old; inp.appendChild(op2);
      }
      inp.value = String(old);
    } else {
      inp = document.createElement("input");
      inp.type = "text"; inp.value = old;
      if (c.k === "出走馬名" && r._st === "new" && els.nameList) inp.setAttribute("list", "et-name-list");
    }
    inp.className = "absolute left-0 top-0 h-full w-full min-w-0 rounded-[2px] border border-primary bg-background px-1 py-0 text-[12px] outline-none z-10" +
      (c.num ? " text-right tabular-nums" : "");
    td.appendChild(inp); inp.focus();
    if (inp.select) inp.select();
    S.editing = { td: td, ri: ri, key: key, old: old, input: inp, row: r };
    inp.addEventListener("blur", function () { commitEdit(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commitEdit(); moveCursor(1, 0, true); }
      else if (e.key === "Tab") { e.preventDefault(); commitEdit(); moveCursor(0, 1, true); }
      else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
    });
  }
  function selectOpts(key, r) {
    if (S.sheet !== "basic") return [""];
    var f = fieldOf(key);
    if (f && f.static) return [""].concat(f.static);
    var seen = {}, out = [""];
    S.sh.basic.rows.forEach(function (x) {
      var v = String(x[key] == null ? "" : x[key]);
      if (v && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out;
  }
  function commitEdit() {
    if (!S.editing) return;
    var e = S.editing; S.editing = null;
    var val = e.input.value;
    applyCell(e.row, e.key, val, true);
  }
  function cancelEdit() {
    if (!S.editing) return;
    var e = S.editing; S.editing = null;
    renderBody();
    var td = locateCell(e.ri, e.key);
    if (td) setCursor(td);
  }
  function applyCell(r, key, val, viaEdit) {
    if (S.sheet === "basic") {
      jBegin();
      setBasicCell(r, key, val, S.jbuf);
      jEnd();
      renderBody(); updateSummary(); YJ.editor.render();
    } else {
      var isRaceLv = isRaceLevel(key);
      var targets = isRaceLv ? groupRows(r) : [r];
      var j = [];
      jBegin();
      targets.forEach(function (t) {
        var old = t[key] == null ? "" : t[key];
        var hadPend = !!(t._pend && t._pend[key]);
        if (t._st === "new") {
          t._add[key] = val;
          if (key === "出走馬名") {
            var h = resolveHorse(val);
            t._add.id = h ? h.id : null;
            t.hid = h ? String(h.id) : "";
            if (!h) toast("「" + val + "」未匹配到档案马名——该行不会提交（新增马请走建档管线）");
          }
          if (key === "日付") t._baseIdent.日付 = val;
        } else {
          var baseV = t._base[key] == null ? "" : t._base[key];
          if (!t._pend) t._pend = {};
          if (String(val) === String(baseV)) delete t._pend[key];
          else t._pend[key] = 1;
        }
        t[key] = commitVal(val);
        j.push({ t: t, key: key, old: old, hadPend: hadPend });
      });
      syncRc();
      jEnd();
      renderBody(); updateSummary(); YJ.editor.render();
      if (viaEdit) {
        var td = locateCellByRow(r, key);
        if (td) setCursor(td);
      }
    }
  }
  function locateCell(ri, key) {
    var s = sh(), v = null;
    s.view.forEach(function (x) { if (x.i === ri) v = x; });
    return v ? $('td[data-ri="' + v.i + '"][data-c="' + key + '"]', els.grid) : null;
  }
  function locateCellByRow(r, key) {
    var s = sh();
    for (var i = 0; i < s.view.length; i++) {
      if (s.view[i].r === r) return $('td[data-ri="' + s.view[i].i + '"][data-c="' + key + '"]', els.grid);
    }
    return null;
  }

  /* ---------------- 光标导航 ---------------- */
  function setCursor(td) {
    $all("td.ring-2", els.grid).forEach(function (x) { x.classList.remove("ring-2", "ring-primary/60", "ring-inset"); });
    if (!td) { S.cur = null; return; }
    td.classList.add("ring-2", "ring-primary/60", "ring-inset");
    S.cur = { ri: +td.getAttribute("data-ri"), key: td.getAttribute("data-c") };
  }
  function cursorTd() {
    return S.cur ? locateCell(S.cur.ri, S.cur.key) : null;
  }
  function moveCursor(dr, dc, thenEdit) {
    if (!S.cur) return;
    var s = sh();
    var vi = -1;
    s.view.forEach(function (v, i) { if (v.i === S.cur.ri) vi = i; });
    if (vi < 0) vi = 0;
    vi = Math.max(0, Math.min(s.view.length - 1, vi + dr));
    var vis = layout().filter(function (c) { return !s.hidden[c.k]; });
    var ci = 0;
    for (var i = 0; i < vis.length; i++) if (vis[i].k === S.cur.key) { ci = i; break; }
    ci = Math.max(0, Math.min(vis.length - 1, ci + dc));
    var ri = s.view[vi].i, key = vis[ci].k;
    var td = locateCell(ri, key);
    if (!td) return;
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (thenEdit) startEdit(td); else setCursor(td);
  }

  /* ---------------- 粘贴导入 / 导出 TSV ---------------- */
  function parseTsv(txt) {
    var lines = txt.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    return lines.map(function (l) { return l.split("\t"); });
  }
  function pasteImport() {
    if (S.sheet !== "races") { toast("粘贴导入只在比赛页签开放（基本信息不支持表格新增）"); return; }
    var doImport = function (txt) {
      var grid = parseTsv(txt);
      if (!grid.length) { toast("剪贴板没有可解析的内容"); return; }
      var editable = layout().filter(function (c) { return !c.ro; });   /* 列序 = 表格可见列序（新行全部可写） */
      jBegin();
      grid.forEach(function (cells) {
        var rec = { id: null, 來源: "人工", 結果: "" };
        RACE_LAYOUT.forEach(function (c) { if (rec[c.k] == null) rec[c.k] = ""; });
        editable.forEach(function (c, i2) {
          if (cells[i2] !== undefined && cells[i2] !== "") rec[c.k] = commitVal(cells[i2]);
        });
        var h = resolveHorse(rec.出走馬名);
        rec.出走馬名 = String(rec.出走馬名 || "").trim();
        rec.id = h ? h.id : null;
        if (!h && rec.出走馬名) toast("「" + rec.出走馬名 + "」未匹配到档案马名——该行不会提交");
        var r = {
          hid: h ? String(h.id) : "", _gid: gidOf(rec), _gk: "new|" + Math.random().toString(36).slice(2, 7),
          _base: clone(rec), _baseIdent: { race_id: "", 日付: String(rec.日付 || ""), 馬名: String(rec.出走馬名 || "") },
          _pend: {}, _st: "new", _add: rec
        };
        RACE_LAYOUT.forEach(function (c) { r[c.k] = rec[c.k]; });
        sh().rows.push(r);
      });
      syncRc();
      jEnd();
      sh().filter = ""; if (els.search) els.search.value = "";
      rebuild(); YJ.editor.render();
      toast("粘贴导入 " + grid.length + " 行（青底=新增；馬名未匹配的行不会提交）");
    };
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(doImport).catch(function () {
        var t = window.prompt("剪贴板读取被拒绝——请 Ctrl+V 粘贴到这里（每行一条，Tab 分列，首列=日期、次列=馬名…按表格列序）：");
        if (t) doImport(t);
      });
    } else {
      var t = window.prompt("请 Ctrl+V 粘贴 TSV（每行一条，Tab 分列，按表格列序）：");
      if (t) doImport(t);
    }
  }

  /* ---------------- 列显隐 ---------------- */
  function buildColMenu() {
    if (!els.colMenu) return;
    var s = sh();
    els.colMenu.innerHTML = layout().map(function (c) {
      var on = !s.hidden[c.k];
      return '<label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-muted/60">' +
        '<input type="checkbox" class="yjx-col h-3.5 w-3.5" data-k="' + esc(c.k) + '"' + (on ? " checked" : "") + "> " + esc(label(c.k)) + "</label>";
    }).join("");
    $all(".yjx-col", els.colMenu).forEach(function (ck) {
      ck.addEventListener("change", function () {
        if (!ck.checked) sh().hidden[ck.getAttribute("data-k")] = 1;
        else delete sh().hidden[ck.getAttribute("data-k")];
        rebuild(); buildColMenu();
      });
    });
  }

  /* ---------------- 放弃修改（会话级，只回滚本页改动） ---------------- */
  function resetSession() {
    if (S.editing) { S.editing = null; }
    var touched = Object.keys(S.touchedOv);
    if (!touched.length && !S.undoJ.length) { toast("本页还没有改动"); return; }
    if (!window.confirm("放弃本页产生的全部改动？（其它页面的草稿不受影响）")) return;
    touched.forEach(function (id) { YJ.editor.ovPut(id, S.startOv[id] || {}); });
    YJ.editor.rcPut(S.startRc ? clone(S.startRc) : null);
    (function pruneEmpty() {          /* 空段残留清理（ovPut 会留下 ov:{}），让箱回到会话前的原样 */
      var dNow = YJ.editor.draftRead();
      ["ov", "ph", "racePh", "rc"].forEach(function (k) {
        if (dNow[k] && typeof dNow[k] === "object" && !Object.keys(dNow[k]).length) delete dNow[k];
      });
      YJ.editor.draftWrite(dNow);
    })();
    S.pendOv = {}; S.touchedOv = {};
    S.undoJ = []; S.redoJ = [];
    hydrateBasic(); hydrateRaces();
    S.sheet = "basic"; switchSheetUI("basic");
    rebuild(); YJ.editor.render();
    toast("已放弃本页改动");
  }

  /* ---------------- 页签切换 ---------------- */
  var TAB_BASE = "rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ";
  function switchSheetUI(sheet) {
    S.sheet = sheet;
    $all("button", els.sheets).forEach(function (x) {
      var on = x.getAttribute("data-sheet") === sheet;
      x.className = TAB_BASE + (on
        ? "bg-card text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground");
    });
    S.cur = null; S.editing = null;
    buildColMenu(); rebuild(); syncToolbar();
    /* 外壳侧栏跟随：页内切页签不产生 iframe load → postMessage 让外壳把高亮挪到对应编辑条目 */
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: "yj:page", page: "edit-table", sheet: sheet }, "*");
    } catch (e) { /* 跨域/独立打开 → 忽略 */ }
  }

  /* ---------------- init ---------------- */
  function init(opts) {
    ["grid", "search", "meta", "addBtn", "delBtn", "undoBtn", "redoBtn", "pasteBtn",
      "colBtn", "colMenu", "resetBtn", "summary", "sheets", "toast", "nameList", "fsBtn", "fsTarget"].forEach(function (k) {
      els[k] = opts[k] ? document.getElementById(opts[k]) : null;
    });
    els.thead = els.grid ? els.grid.querySelector("thead") : null;
    els.tbody = els.grid ? els.grid.querySelector("tbody") : null;
    els.gridWrap = els.grid ? els.grid.parentElement : null;

    RK = YJ.raceBundle.RK; EK = YJ.raceBundle.EK;
    S.startRc = (function () { var rc = YJ.editor.rcGet(); return (rc.add.length + rc.mod.length + rc.del.length) ? clone(rc) : null; })();

    return Promise.all([
      YJ.cache.fetch("basic"),
      YJ.cache.fetch("bundle")
    ]).then(function (rs) {
      S.bundleBy = YJ.raceBundle.decode(rs[1]);
      hydrateBasic(); hydrateRaces();
      buildNameList();
      bind();
      buildColMenu(); rebuild();
      document.addEventListener("yj-rc-dropped", function () {
        S.startRc = null; hydrateRaces(); rebuild(); updateSummary();
      });
      return null;
    }).catch(function (e) {
      if (els.meta) els.meta.textContent = "数据加载失败：" + e;
    }).then(function (r) {
      var q = new URLSearchParams(location.search).get("sheet");   /* ?sheet=races 直达比赛页签 */
      if (q === "races") switchSheetUI("races");
      return r;
    });
  }
  function buildNameList() {
    if (!els.nameList) return;
    els.nameList.innerHTML = (YJ.editor.state.horses || []).map(function (h) {
      return '<option value="' + esc(h.馬名 || "") + '"></option>';
    }).join("");
  }
  function bind() {
    els.grid.addEventListener("click", function (e) {
      var td = e.target.closest("td[data-c]");
      if (td && !e.target.classList.contains("yjx-ck")) startEdit(td);
    });
    els.grid.addEventListener("change", function (e) {
      if (!e.target.classList.contains("yjx-ck")) return;
      var ri = +e.target.getAttribute("data-ri");
      if (e.target.checked) sh().sel[ri] = 1; else delete sh().sel[ri];
      syncToolbar();
    });
    els.grid.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (S.editing) return;
      if (!S.cur) return;
      var map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (map[e.key]) { e.preventDefault(); moveCursor(map[e.key][0], map[e.key][1], false); }
      else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); var td = cursorTd(); if (td) startEdit(td); }
      else if (e.key === "Delete" || e.key === "Backspace") {
        var td2 = cursorTd();
        if (!td2) return;
        var key = S.cur.key;
        var c = null; layout().forEach(function (x) { if (x.k === key) c = x; });
        var rDel = rowAt(S.cur.ri);
        if (!c || c.ro || !rDel || (key === "出走馬名" && rDel._st !== "new")) return;
        if (String(rDel[key] == null ? "" : rDel[key]) !== "") applyCell(rDel, key, "");
      }
    });
    if (els.sheets) els.sheets.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sheet]");
      if (b) switchSheetUI(b.getAttribute("data-sheet"));
    });
    if (els.search) els.search.addEventListener("input", function () {
      sh().filter = this.value; S.cur = null; rebuild();
    });
    if (els.addBtn) els.addBtn.addEventListener("click", addRaceRow);
    if (els.delBtn) els.delBtn.addEventListener("click", delSelected);
    if (els.undoBtn) els.undoBtn.addEventListener("click", undo);
    if (els.redoBtn) els.redoBtn.addEventListener("click", redo);
    if (els.pasteBtn) els.pasteBtn.addEventListener("click", pasteImport);
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetSession);
    if (els.fsBtn) els.fsBtn.addEventListener("click", toggleFs);
    document.addEventListener("keydown", function (e) {       /* ESC 退出全屏（格内编辑中先归格编辑器处理） */
      if (e.key === "Escape" && S.fs && !S.editing) fsExit();
    });
    if (els.colBtn) els.colBtn.addEventListener("click", function (e) {
      e.stopPropagation(); buildColMenu(); els.colMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", function (e) {
      if (els.colMenu && !e.target.closest("#" + els.colMenu.id) && !e.target.closest("#" + els.colBtn.id)) els.colMenu.classList.add("hidden");
    });
  }

  /* ---------------- 全屏（§104 补充 2026-10-25 定稿）：CSS 伪全屏，不用 Fullscreen API ——
   * 页面常驻 iframe（外壳 / 预览面板），原生全屏受 allowfullscreen 权限链约束，
   * 内嵌环境一点就没反应。改为把表格卡 fixed inset-0 盖满视口：任何环境都生效。
   * 全屏态 = 工具条 + 表格 + 行数脚注；保存条让位（ESC / 按钮退出后提交）。 */
  var FS_ADD = ["fixed", "inset-0", "z-[70]", "mt-0", "rounded-none", "shadow-lg", "overflow-auto"];
  var FS_DEL = ["mt-3", "rounded-[14px]"];
  function fsEnter() {
    if (S.fs || !els.fsTarget) return;
    S.fs = true;
    FS_DEL.forEach(function (c) { els.fsTarget.classList.remove(c); });
    FS_ADD.forEach(function (c) { els.fsTarget.classList.add(c); });
    document.body.style.overflow = "hidden";
    if (els.gridWrap) els.gridWrap.style.maxHeight = "calc(100vh - 200px)";   /* 工具条 49 + 脚注 33 + 余量；section 自身可滚兜底 */
    if (els.fsBtn) els.fsBtn.textContent = "✕ 退出全屏";
  }
  function fsExit() {
    if (!S.fs || !els.fsTarget) return;
    S.fs = false;
    FS_ADD.forEach(function (c) { els.fsTarget.classList.remove(c); });
    FS_DEL.forEach(function (c) { els.fsTarget.classList.add(c); });
    document.body.style.overflow = "";
    if (els.gridWrap) els.gridWrap.style.maxHeight = "";
    if (els.fsBtn) els.fsBtn.textContent = "⛶ 全屏";
    rebuild();
  }
  function toggleFs() { S.fs ? fsExit() : fsEnter(); }

  return { init: init, state: S };
})();
