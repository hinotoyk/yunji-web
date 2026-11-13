/* ============================================================
 * editor-table.js —— 编辑台 · 批量表格（§104 键盘电子表格流，方案定稿见 docs/DESIGN.md §104）
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
    /* §187 回放视频源：**不写 races_edits.json**（不是比赛字段），改动单独进 d.vid 草稿 →
     * 提交 data/video_manual.json。格子点击开多源弹窗，不走 input/select/applyCell 通用链。 */
    { k: "视频源", w: 132, type: "video" },
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
    vidBase: {},           /* §187 比赛键 → {sources:[…], origin:"auto"|"saved"}（video-map + video_manual 合并） */
    nameById: {},          /* §188 id → 四名 {jp,en,hk,cn,main}（馬名/欧字馬名/香港馬名/自译馬名，有效值口径） */
    nameByJp: {},          /* §188 馬名 → 四名（比赛页签 hid 空的手工行按 出走馬名 精确回退联查） */
    cur: null, editing: null,
    undoJ: [], redoJ: [],
    batch: 0, jbuf: [],     /* 复合操作（粘贴导入等）的日志合并 */
    onlyDirty: false        /* §150「只看待保存」开关（会话态，跨页签生效） */
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
    /* §152：先和「会话基线」比（已保存生效值 = 人工值 ?? 官方值）——改前改后同值（含 已保存值==官方值
     * 时回填同值）不算改动，不进草稿箱；恢复官方值意图只在与人工值确实不同时才有意义 */
    var baseline = saved != null ? saved : base;
    var nu;
    /* §154：等值判定统一走 YJ.util.effEqual（canon 序列化），标量先 String() 归一 */
    if (YJ.util.effEqual(String(val), String(baseline))) {
      nu = null;
    } else if (YJ.util.effEqual(String(val), String(base))) {
      nu = saved != null ? { v: null, base: base, saved: saved } : null;   /* 回官方但≠人工值 → 恢复官方值意图 */
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
        RACE_LAYOUT.forEach(function (c) { if (c.type !== "video") r[c.k] = rec[c.k] == null ? "" : rec[c.k]; });
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
      RACE_LAYOUT.forEach(function (c) { if (c.type !== "video" && r[c.k] == null) r[c.k] = ""; });
      r.hid = rec.id == null ? "" : String(rec.id);
      r._gid = gidOf(rec); r._gk = "new|" + r._gid + "|" + Math.random().toString(36).slice(2, 7);
      r._base = clone(rec); r._baseIdent = { race_id: "", 日付: String(rec.日付 || ""), 馬名: String(rec.出走馬名 || "") };
      r._pend = {}; r._st = "new"; r._add = rec;      /* _add = rc.add 里的原对象：直接改它 */
      rows.push(r);
    });
    S.sh.races.rows = rows;
    hydrateVid();
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
  /* ================= §187 回放视频源列（独立草稿段，绝不写进 races_edits.json） =================
   * 数据：video-map.json（v2：每场源数组，自动匹配）+ video_manual.json（人工，优先）→ S.vidBase；
   *       YJ.editor.vidGet() 的 d.vid 草稿再覆盖 → 每行 r._vid。
   * 提交：editor.js 白名单 5（VM_PATH），单原子 commit 写 data/video_manual.json；
   *       yj-video.js::load 直接读该表且人工值优先 → **不需要后端重算**，CI 发布完即生效。
   * 比赛键与 front/public/yj-video.js::raceKey 同构（改键两处同步）。 */
  function videoKey(r) {
    var rid = String(r.race_id || (r._baseIdent && r._baseIdent.race_id) || "").trim();
    if (rid) return "race:" + rid;
    return "slot:" + String(r.日付 || "") + "|" + String(r.場名 || "") + "|" + String(r.R || "");
  }
  function normSources(x) {
    var arr = Array.isArray(x) ? x
      : (x && Array.isArray(x.sources) ? x.sources : (x && x.url ? [x] : []));
    var out = [];
    arr.forEach(function (s) {
      var u = s && String(s.url || "").trim();
      if (!u || !/^https?:\/\//i.test(u)) return;
      out.push({ url: u, title: String(s.title || ""), page: parseInt(s.page, 10) || 1, subtitle: !!s.subtitle });
    });
    return out;
  }
  function loadVidBase(vm, vman) {
    var base = {}, auto = (vm && vm.videos) || {}, k;
    for (k in auto) base[k] = { sources: normSources(auto[k]), origin: "auto" };
    var man = vman || {};
    for (k in man) {
      if (k.charAt(0) === "_") continue;
      var s = normSources(man[k]);
      if (!s.length && !(man[k] && man[k].clear)) continue;
      if (man[k] && man[k].append && base[k])
        base[k] = { sources: base[k].sources.concat(s), origin: "saved" };
      else base[k] = { sources: s, origin: "saved" };
    }
    S.vidBase = base;
  }
  function hydrateVid() {
    var draft = YJ.editor.vidGet();
    S.sh.races.rows.forEach(function (r) {
      var k = videoKey(r), b = S.vidBase[k] || { sources: [], origin: "" };
      r._vid = Object.prototype.hasOwnProperty.call(draft, k)
        ? { key: k, sources: normSources(draft[k]), origin: "draft" }
        : { key: k, sources: b.sources.slice(), origin: b.origin };
    });
  }
  function resetVidUi() { hydrateVid(); rebuild(); YJ.editor.render(); }
  function hostDocument() {
    try { var t = window.top; if (t && t !== window && t.document) return t.document; } catch (e) {}
    return document;
  }
  var VID_X = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var VID_DEL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function vidRowHtml(s, i, origin) {
    return '<div class="yj-ve-row" data-vrow="' + i + '">' +
      '<div class="yj-ve-row-hd"><span class="yj-ve-no">源 ' + (i + 1) + '</span>' +
      '<span class="yj-ve-tag' + (origin === "auto" ? " yj-ve-tag--auto" : "") + '">' +
      (origin === "draft" ? "草稿" : origin === "saved" ? "人工表" : origin === "auto" ? "自动匹配" : "新增") + '</span>' +
      '<button type="button" class="yj-ve-del" data-vdel="' + i + '" aria-label="删除此源">' + VID_DEL + '</button></div>' +
      '<label class="yj-ve-f"><span>链接</span><input class="yj-ve-url" type="url" placeholder="https://www.bilibili.com/video/BV…/" value="' + esc(s.url || "") + '"></label>' +
      '<label class="yj-ve-f"><span>标题</span><input class="yj-ve-title" type="text" placeholder="选填，浮层标题" value="' + esc(s.title || "") + '"></label>' +
      '<div class="yj-ve-minor"><label class="yj-ve-f yj-ve-f--sm"><span>分 P</span><input class="yj-ve-page" type="number" min="1" max="99" value="' + (s.page || 1) + '"></label>' +
      '<label class="yj-ve-check"><input class="yj-ve-sub" type="checkbox"' + (s.subtitle ? " checked" : "") + '> 带字幕</label></div></div>';
  }
  function openVideoEditor(r) {
    var v = r._vid || { key: videoKey(r), sources: [], origin: "" };
    var title = [r.日付, r.場名, r.R ? r.R + "R" : "", r.レース名, r.出走馬名]
      .filter(Boolean).join(" · ").slice(0, 80);
    var doc = hostDocument(), ov = doc.createElement("div");
    ov.className = "yj-vm-mask";
    ov.setAttribute("role", "dialog");
    ov.innerHTML = '<div class="yj-vm yj-ve">' +
      '<div class="yj-vm-head"><span class="yj-vm-title">配置回放视频源<small class="yj-vm-sub">' + esc(title) + '</small></span>' +
      '<button type="button" class="yj-vm-x" data-vx aria-label="关闭">' + VID_X + '</button></div>' +
      '<div class="yj-ve-body">' +
      '<p class="yj-ve-tip">一场比赛可配<b>多个源</b>。保存即进<b>草稿箱</b>，点底部「提交到 GitHub」一次性写入 <code>data/video_manual.json</code>；前端直读生效，约 2 分钟 CI。B 站链接自动站内播放，其他链接走外链。</p>' +
      '<div class="yj-ve-rows" data-vrows>' + v.sources.map(function (s, i) { return vidRowHtml(s, i, v.origin); }).join("") + '</div>' +
      '<button type="button" class="yj-ve-add" data-vadd>＋ 添加源</button></div>' +
      '<div class="yj-vm-foot yj-ve-foot">' +
      '<button type="button" class="yj-ve-btn yj-ve-btn--ghost" data-vreset>恢复自动匹配</button>' +
      '<span class="yj-ve-spacer"></span>' +
      '<button type="button" class="yj-ve-btn" data-vcancel>取消</button>' +
      '<button type="button" class="yj-ve-btn yj-ve-btn--primary" data-vsave>存入草稿箱</button>' +
      '</div></div>';
    doc.body.appendChild(ov);
    var prevOverflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    function close() {
      doc.body.style.overflow = prevOverflow;
      doc.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onKey, true);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    doc.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onKey, true);
    var rows = ov.querySelector("[data-vrows]");
    function renumber() {
      $all("[data-vrow]", ov).forEach(function (row, i) {
        row.setAttribute("data-vrow", i);
        row.querySelector(".yj-ve-no").textContent = "源 " + (i + 1);
      });
    }
    function collect() {
      var arr = [];
      $all("[data-vrow]", ov).forEach(function (row) {
        var u = $(".yj-ve-url", row).value.trim();
        if (!u) return;
        arr.push({
          url: u, title: $(".yj-ve-title", row).value.trim(),
          page: parseInt($(".yj-ve-page", row).value, 10) || 1,
          subtitle: !!$(".yj-ve-sub", row).checked
        });
      });
      return arr;
    }
    ov.addEventListener("click", function (e) {
      if (e.target === ov) { close(); return; }
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      if (b.hasAttribute("data-vx") || b.hasAttribute("data-vcancel")) { close(); return; }
      if (b.hasAttribute("data-vadd")) {
        var wrap = doc.createElement("div");
        wrap.innerHTML = vidRowHtml({ url: "", title: "", page: 1, subtitle: false }, $all("[data-vrow]", ov).length, "new");
        rows.appendChild(wrap.firstChild); renumber(); return;
      }
      if (b.hasAttribute("data-vdel")) {
        var row = b.closest("[data-vrow]");
        if (row && row.parentNode) row.parentNode.removeChild(row);
        renumber(); return;
      }
      if (b.hasAttribute("data-vreset")) {
        YJ.editor.vidPut(v.key, null);
        close(); resetVidUi(); toast("已恢复自动匹配"); return;
      }
      if (b.hasAttribute("data-vsave")) {
        var arr = collect(), base = S.vidBase[v.key] || { sources: [] };
        if (!arr.length && !base.sources.length) YJ.editor.vidPut(v.key, null);
        else if (JSON.stringify(arr) === JSON.stringify(base.sources)) YJ.editor.vidPut(v.key, null);
        else YJ.editor.vidPut(v.key, { sources: arr });
        close(); resetVidUi();
        toast(arr.length ? "已存入草稿箱：" + arr.length + " 个源" : "已清空该场视频源（待提交）");
      }
    });
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
    RACE_LAYOUT.forEach(function (c) { if (c.type !== "video" && rec[c.k] == null) rec[c.k] = ""; });
    var r = {
      hid: "", _gid: "", _gk: "new|" + Math.random().toString(36).slice(2, 7),
      _base: clone(rec), _baseIdent: { race_id: "", 日付: "", 馬名: "" },
      _pend: {}, _st: "new", _add: rec
    };
    RACE_LAYOUT.forEach(function (c) { if (c.type !== "video") r[c.k] = rec[c.k]; });
    var sh0 = sh();
    jBegin();
    sh0.rows.push(r);
    syncRc();
    jEnd();
    S.filterClear = 1;
    sh0.filter = ""; if (els.search) els.search.value = "";
    invalidateCols();          /* §189：新行可能有更宽值 → 重列宽（3 行合成探针，成本可忽略） */
    rebuild();
    var td = revealRow(r);
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
        if (v === null) {
          /* §152：恢复官方值意图仅在 人工值≠官方值 时才算改动（相等 = 值不变，净零丢弃） */
          if (sv != null && !YJ.util.effEqual(String(sv), String(base))) S.pendOv[id][k] = { v: null, base: base, saved: sv };
        }
        else if (sv == null && YJ.util.effEqual(String(v), String(base))) { /* 无钉同值 → 不算待保存（2026-10-26 修：原写 saved，未声明标识符 → 带草稿重开本页 ReferenceError） */ }
        else if (sv != null && YJ.util.effEqual(String(v), String(sv))) { /* §152：有钉但回填同值 → 值不变，净零丢弃 */ }
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
    buildNameIdx();      /* §188 马名四名检索联查表（行值 = 有效值口径，两页签共用） */
  }

  /* ---------------- 视图/渲染 ---------------- */
  function rowTextBasic(r) {
    return BASIC_LAYOUT.map(function (c) { return String(r[c.k] == null ? "" : r[c.k]); }).join("\t").toLowerCase()
      + "\t" + nameTextOf(r, "all").toLowerCase();
  }
  function rowTextRaces(r) {
    return RACE_LAYOUT.map(function (c) { return String(r[c.k] == null ? "" : r[c.k]); }).join("\t").toLowerCase()
      + "\t" + nameTextOf(r, "all").toLowerCase();
  }

  /* ---------------- §188 马名四名检索（原名/英文名/港译名/中文名，两页签通用） ----------------
   * 基本信息页签：馬名/香港馬名/自译馬名 本就是表格列（全文检索天然覆盖），英文名（欧字馬名）不在列 → 补进检索文本；
   * 比赛记录页签：行上只有 出走馬名（原名），其余三名靠 r.hid → 马匹档案联查（hid 空 = 手工追加行 → 按出走馬名精确回退）。
   * 联查表 S.nameById/S.nameByJp 从基本信息行构建（有效值 = 草稿/已保存优先），页签切换时重建
   * （本会话在基本信息改过港译/自译 → 切到比赛页签检索不落旧值）。列式定向：列名可为
   * 馬名/马名（四名任一命中）、原名 / 英文名 / 港译名 / 中文名（单名专列，两页签均可用）。 */
  var NAME_COLS = { "馬名": "all", "马名": "all", "原名": "jp", "英文名": "en", "港译名": "hk", "中文名": "cn" };
  function buildNameIdx() {
    var byId = {}, byJp = {};
    (S.sh.basic.rows || []).forEach(function (r) {
      var id = String(r.id == null ? "" : r.id);
      var jp = String(r.馬名 == null ? "" : r.馬名).trim();
      var h = YJ.editor.state.byId[id] || {};
      var m = "";
      try { m = String(YJ.util.mainName(h) || "").trim(); } catch (e) { }
      var nv = {
        jp: jp,
        en: String(h.欧字馬名 == null ? "" : h.欧字馬名).trim(),
        hk: String(r.香港馬名 == null ? "" : r.香港馬名).trim(),
        cn: String(r.自译馬名 == null ? "" : r.自译馬名).trim(),
        main: m.charAt(0) === "#" ? "" : m          /* 剥生产国尾缀的主名（#id 兜底不算名） */
      };
      if (id) byId[id] = nv;
      if (jp) byJp[jp] = nv;
    });
    S.nameById = byId; S.nameByJp = byJp;
  }
  function nameIdxOf(r) {
    var hid = String(r.hid == null ? "" : r.hid);
    if (hid && S.nameById[hid]) return S.nameById[hid];
    var nm = String(r.出走馬名 == null ? "" : r.出走馬名).trim();
    return nm ? (S.nameByJp[nm] || null) : null;
  }
  /* t = all | jp | en | hk | cn → 该行马匹对应名字集合（Tab 连接，供子串匹配） */
  function nameTextOf(r, t) {
    var isB = S.sheet === "basic", nv, jp, hk = "", cn = "";
    if (isB) {
      jp = String(r.馬名 == null ? "" : r.馬名);
      hk = String(r.香港馬名 == null ? "" : r.香港馬名);
      cn = String(r.自译馬名 == null ? "" : r.自译馬名);
      nv = S.nameById[String(r.id == null ? "" : r.id)] || {};
    } else {
      jp = String(r.出走馬名 == null ? "" : r.出走馬名);
      nv = nameIdxOf(r) || {};
    }
    if (t === "en") return nv.en || "";
    if (t === "hk") return isB ? hk : (nv.hk || "");
    if (t === "cn") return isB ? cn : (nv.cn || "");
    var parts = [jp, nv.main || ""];
    if (t === "all") {
      parts.push(nv.en || "", isB ? hk : (nv.hk || ""), isB ? cn : (nv.cn || ""));
      if (!isB) parts.push(nv.jp || "");           /* 台账出走馬名与档案馬名偶有细微差异 → 双名都进检索 */
    }
    return parts.join("\t");
  }
  function computeView() {
    /* §188：全角冒号归一半角（中文 IME 输「列名：值」时原先会整串进全文检索） */
    var s = sh(), q = s.filter.trim().toLowerCase().replace("：", ":");
    /* §150 筛选增强：q 形如「列名:值」时只匹配该列（列名 = 表头中文名或字段键；认不出列名则回退全文本检索）。
     * §188 马名四名检索：列名先查 NAME_COLS（馬名/马名 = 四名任一；原名/英文名/港译名/中文名 = 单名专列，
     * 基本信息页签的 馬名 列也因此从「仅原名」升级为四名任一命中），再走常规列匹配 */
    var colQ = null, mq = q.match(/^([^\s:]+):(.*)$/);
    if (mq && mq[2] !== "") {
      var want = mq[1], val = mq[2].trim();
      var nt = NAME_COLS[want];
      if (nt) colQ = { k: null, v: val, t: nt };
      else layout().forEach(function (c) {
        if (colQ) return;
        if (c.k === want || label(c.k) === want) colQ = { k: c.k, v: val };
      });
    }
    s.view = [];
    s.rows.forEach(function (r, i) {
      if (S.onlyDirty && !rowDirty(r)) return;      /* §150「只看待保存」：只列出有本页改动的行 */
      var hit;
      if (colQ) hit = colQ.t
        ? nameTextOf(r, colQ.t).toLowerCase().indexOf(colQ.v) >= 0
        : String(r[colQ.k] == null ? "" : r[colQ.k]).toLowerCase().indexOf(colQ.v) >= 0;
      else {
        var txt = S.sheet === "basic" ? rowTextBasic(r) : rowTextRaces(r);
        hit = !q || txt.indexOf(q) >= 0;
      }
      if (hit) s.view.push({ r: r, i: i });
    });
  }
  /* §150 行级「有待保存改动」判定：基本信息 = 本页 pendOv 有该马条目；比赛 = 新增/删除/格级 _pend */
  function rowDirty(r) {
    return S.sheet === "basic" ? hasOvPend(r)
      : r._st === "new" || r._st === "del" || !!(r._pend && Object.keys(r._pend).length)
        || !!(r._vid && r._vid.origin === "draft");      /* §187 视频源草稿也算「有待保存改动」 */
  }
  function cellInner(c, r) {
    var v = r[c.k];
    if (c.k === "视频源") {                              /* §187：源数 + 来源 chip，点击开多源弹窗 */
      var q = r._vid || { sources: [], origin: "" };
      if (!q.sources.length) return '<span class="text-muted-foreground/60">＋ 添加</span>';
      var tag = q.origin === "draft" ? "草稿" : q.origin === "saved" ? "人工" : "自动";
      var cls = q.origin === "draft" ? "bg-chart3/15 text-chart3"
        : q.origin === "saved" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
      return '<span class="inline-flex items-center gap-1 rounded px-1.5 py-px text-[10px] font-semibold ' + cls +
        '">▶ ' + q.sources.length + ' 源</span><span class="ml-1 text-[9.5px] text-muted-foreground">' + tag + "</span>";
    }
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
  /* ---------------- 虚拟滚动（2026-11-02 §171 · 15 世代压测） ----------------
   * 11k+ 行全量渲染（≈45 万单元格）→ 首屏秒级阻塞、滚动整表重排。改为只渲染可视区 ± 缓冲：
   *   <tr 占位高度=start*rowH> + 真实行 [start,end) + <tr 占位高度=(total-end)*rowH>
   * 行高恒定（py-[5px] + 12px/1.5 + nowrap，实测约 29px），占位行撑住滚动条总高度，手感不变。
   * 列宽：auto 布局下宽度由「当前可见行」决定 → 滚动时列宽会跳。首次渲染用探针量出各列宽，
   *   锁进 <colgroup> + table-layout:fixed，此后列宽恒定。§189 探针 = 全表扫最宽值合成行（见
   *   lockCols 注释），列宽容纳全部行的最宽内容（表格可横滚，不出省略号）；ellipsis + title 仅作
   *   估宽排序兜底。列显隐/切页签/增删行时 invalidateCols() 重新量。 */
  var VP = { rowH: 0, start: -1, end: -1, buf: 12, cols: 0 };

  function invalidateCols() {
    VP.cols = 0;
    if (!els.grid) return;
    var cg = els.grid.querySelector("colgroup");
    if (cg && cg.parentNode) cg.parentNode.removeChild(cg);
    els.grid.style.tableLayout = "";
    els.grid.style.width = "";
  }
  /* 单行 HTML（renderBody 与探针共用，保证两处列宽测量同源） */
  function rowHtml(v, vi, isB) {
    var s = sh(), r = v.r, ri = v.i, h = [];
    var rowCls = "";
    if (r._st === "new") rowCls = "bg-accent/25";
    else if (r._st === "del") rowCls = "bg-destructive/5 opacity-60";
    h.push('<tr data-row="1" class="' + rowCls + '">');
    if (!isB) h.push('<td class="sticky left-0 z-10 w-[34px] bg-card text-center align-middle"><input type="checkbox" class="yjx-ck h-3.5 w-3.5 align-middle" data-ri="' + ri + '"' + (s.sel[ri] ? " checked" : "") + "></td>");
    var mark = r._st === "new" ? '<i class="not-italic text-primary">＋</i>'
      : r._st === "del" ? '<i class="not-italic text-destructive">✕</i>'
      : Object.keys(r._pend || {}).length ? '<i class="not-italic text-chart3">•</i>'
      : isB && hasOvPend(r) ? '<i class="not-italic text-chart3">•</i>'
      : '<i class="not-italic text-border">·</i>';
    h.push('<td class="' + (isB ? "sticky left-0 " : "sticky left-[34px] ") + 'z-10 w-[42px] bg-card text-center align-middle text-[10.5px] text-muted-foreground">' + (vi + 1) + " " + mark + "</td>");
    layout().forEach(function (c) {
      if (s.hidden[c.k]) return;
      var cls = "border-l border-border/60 px-2 py-[5px] align-middle whitespace-nowrap overflow-hidden text-ellipsis ";
      if (c.num) cls += "text-right tabular-nums ";
      if (c.ro || (c.k === "出走馬名" && r._st !== "new")) cls += "text-muted-foreground/80 ";
      if (c.stick) cls += "sticky z-10 bg-card ";
      if (isB && pendCellOv(r, c.k)) cls += "bg-chart3/10 ";
      else if (isB && savedCellOv(r, c.k)) cls += "bg-accent/40 ";
      if (!isB && r._pend && r._pend[c.k]) cls += "bg-chart3/10 ";
      var t = cellInner(c, r);
      if (r._st === "del") t = '<s class="decoration-destructive/60">' + t + "</s>";
      /* §150 原值对照悬停（橙格 = 待保存）：基本信息给 官方值/已保存 双基线，比赛给 _base 原值 */
      var tip = "";
      if (isB && pendCellOv(r, c.k)) {
        var b0 = String(baseOf(String(r.id), c.k)), s0 = savedOf(String(r.id), c.k);
        tip = ' title="官方值：' + esc(b0) + (s0 != null ? " · 已保存：" + esc(String(s0)) : "") + '"';
      } else if (!isB && r._pend && r._pend[c.k]) {
        tip = ' title="原值：' + esc(String(r._base[c.k] == null ? "" : r._base[c.k])) + '"';
      } else if (String(r[c.k] == null ? "" : r[c.k]).length > 12) {
        tip = ' title="' + esc(String(r[c.k])) + '"';   /* §189 全量列宽后仅兜底（估宽误序的极罕见值） */
      }
      /* §150 基本信息页签：马名格附「↗ 去编辑」锚点（新标签开 edit.html?id=，rehome 自动回壳） */
      if (isB && c.k === "馬名" && r._st !== "del") {
        t += ' <a data-hedit href="edit.html?id=' + encodeURIComponent(r.id) + '" target="_blank" rel="noopener"' +
          ' class="ml-1 text-[10.5px] text-primary hover:underline" title="在基本信息编辑页打开（新标签）">↗</a>';
      }
      h.push('<td class="' + cls + '"' + tip + ' style="' + (c.stick ? "left:" + (isB ? 42 : 76) + "px;" : "") +
        '" data-ri="' + ri + '" data-gk="' + esc(r._gk || String(r.id)) + '" data-c="' + esc(c.k) + '">' + t + "</td>");
    });
    h.push("</tr>");
    return h.join("");
  }
  /* 列宽探针（§189 全量改，2026-11-13）：合成「每列最宽值」行 → 量 thead 各列宽 → 锁 <colgroup> + table-layout:fixed。
   * 前身是 ≤400 行抽样（§171）：11k 行里会漏掉真最宽值 → R=10/11 截成「1…」、長賞金、來源 netkei… 等 ellipsis。
   * 既然表格横向可滚，列宽必须容纳**全部行**的最宽内容 → 先全表扫出每列最宽候选值（视觉长度估算：
   * 全角类 charCode≥0x1100 记 2、半角记 1；去重后 ≤8 个全保留，>8 个取估宽前 3——比例字体按估宽排
   * 序有细微误序，多候选兜底），再拼成 1–3 行合成行过 rowHtml/cellInner 同一渲染管线（格徽章 / 馬名
   * 的 ↗ 链接 / 視频源芯片等固有宽度一并量准）。全表扫 = 纯字符串比较（11k×21 列 <50ms），合成行
   * ≤3 行比原 400 行探针更快；cell 的 overflow-hidden text-ellipsis 保留为最后兜底（宽度量准则永不触发）。 */
  function estLen(v) {
    var s = String(v == null ? "" : v), n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) >= 0x1100 ? 2 : 1;
    return n;
  }
  function lockCols() {
    var s = sh(), view = s.view, isB = S.sheet === "basic";
    if (!view.length || !els.tbody) return;
    var cols = layout().filter(function (c) { return !s.hidden[c.k]; });
    /* 每列值收集（去重哈希，photo/視频源 不收值、只记最大张数/源数，走 cellInner 原生渲染量宽） */
    var seen = {}, maxPhoto = 0, maxVid = 0;
    view.forEach(function (v) {
      var r = v.r;
      cols.forEach(function (c) {
        var k = c.k, val = r[k];
        if (c.type === "video") {
          var n = r._vid && r._vid.sources ? r._vid.sources.length : 0;
          if (n > maxVid) maxVid = n;
          return;
        }
        if (k === "photo") {
          var p = Array.isArray(val) ? val.length : (val ? 1 : 0);
          if (p > maxPhoto) maxPhoto = p;
          return;
        }
        if (val == null || val === "") return;
        var str = String(val);
        var m = seen[k] || (seen[k] = {});
        if (!(str in m)) m[str] = estLen(str);
      });
    });
    var KEEP_ALL = 8, TOP = 3, picks = {};   /* k → [值]（估宽降序） */
    cols.forEach(function (c) {
      var m = seen[c.k], ks;
      if (!m || !(ks = Object.keys(m)).length) return;
      ks.sort(function (a, b) { return m[b] - m[a]; });
      picks[c.k] = ks.slice(0, ks.length <= KEEP_ALL ? ks.length : TOP);
    });
    /* 合成行：第 j 行取各列第 j 候选（不足回退第 0），photo/視频源 最宽形态只进第 0 行 */
    var rows = [];
    for (var j = 0; j < TOP; j++) {
      var any = false, r = { id: "__probe__" };
      cols.forEach(function (c) {
        var ps = picks[c.k];
        if (ps) { r[c.k] = ps[Math.min(j, ps.length - 1)]; any = true; }
      });
      if (!any && j > 0) break;
      if (j === 0) {
        if (maxPhoto) r.photo = new Array(maxPhoto);
        if (maxVid) r._vid = { sources: new Array(maxVid), origin: "draft" };
      }
      rows.push({ r: r, i: -1 });
    }
    var h = [];
    for (var i = 0; i < rows.length; i++) h.push(rowHtml(rows[i], -1, isB));
    els.tbody.innerHTML = h.join("");
    var ths = $all("thead th", els.grid);
    if (!ths.length) return;
    var widths = [], total = 0;
    ths.forEach(function (th) {
      var w = Math.round(th.getBoundingClientRect().width);
      widths.push(w); total += w;
    });
    if (!total) return;
    var cg = document.createElement("colgroup");
    widths.forEach(function (w) {
      var col = document.createElement("col");
      col.style.width = w + "px";
      cg.appendChild(col);
    });
    els.grid.insertBefore(cg, els.grid.firstChild);
    els.grid.style.tableLayout = "fixed";
    els.grid.style.width = total + "px";
    VP.cols = 1;
    var tr = els.tbody.querySelector("tr[data-row]");
    if (tr) VP.rowH = Math.max(24, Math.round(tr.getBoundingClientRect().height));
  }
  function renderBody(force) {
    if (force === undefined) force = true;
    var s = sh(), isB = S.sheet === "basic", view = s.view, total = view.length;
    var cs = layout().filter(function (c) { return !s.hidden[c.k]; }).length;
    var colspan = cs + 2;
    if (!total) {
      els.tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="hint-empty">无匹配行</td></tr>';
      VP.start = VP.end = 0;
      return;
    }
    if (!VP.cols) lockCols();
    var rh = VP.rowH || 29;
    var wrap = els.gridWrap;
    var vh = (wrap && wrap.clientHeight) || 520;
    var top = (wrap && wrap.scrollTop) || 0;
    var start = Math.max(0, Math.floor(top / rh) - VP.buf);
    var end = Math.min(total, Math.ceil((top + vh) / rh) + VP.buf);
    if (!force && start === VP.start && end === VP.end) return;
    VP.start = start; VP.end = end;
    var h = [];
    if (start > 0) h.push('<tr aria-hidden="true" style="height:' + (start * rh) + 'px"><td colspan="' + colspan + '" style="padding:0;border:0"></td></tr>');
    for (var vi = start; vi < end; vi++) h.push(rowHtml(view[vi], vi, isB));
    if (end < total) h.push('<tr aria-hidden="true" style="height:' + ((total - end) * rh) + 'px"><td colspan="' + colspan + '" style="padding:0;border:0"></td></tr>');
    els.tbody.innerHTML = h.join("");
    if (!VP.rowH) {
      var tr0 = els.tbody.querySelector("tr[data-row]");
      if (tr0) VP.rowH = Math.max(24, Math.round(tr0.getBoundingClientRect().height));
    }
  }
  /* 把某行滚进可视区并渲染，返回其「出走馬名」格（addRaceRow 追加行后定位用） */
  function revealRow(r) {
    var s = sh(), idx = -1;
    for (var i = 0; i < s.view.length; i++) { if (s.view[i].r === r) { idx = i; break; } }
    if (idx < 0) return null;
    var wrap = els.gridWrap, rh = VP.rowH || 29;
    if (wrap) {
      var top = idx * rh, bottom = top + rh;
      if (top < wrap.scrollTop) wrap.scrollTop = Math.max(0, top - rh * 2);
      else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = Math.max(0, bottom - wrap.clientHeight + rh * 2);
    }
    renderBody(true);
    return $('td[data-gk="' + r._gk + '"][data-c="出走馬名"]', els.grid);
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
    /* §150 页签待保存计数徽章：基本信息 = 格数；比赛记录 = 增+改+删条数（0 时藏） */
    if (els.cntBasic) {
      els.cntBasic.textContent = String(nB);
      els.cntBasic.classList.toggle("hidden", !nB);
    }
    if (els.cntRaces) {
      var nR = (rc.add ? rc.add.length : 0) + (rc.mod ? rc.mod.length : 0) + (rc.del ? rc.del.length : 0);
      els.cntRaces.textContent = String(nR);
      els.cntRaces.classList.toggle("hidden", !nR);
    }
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
    if (c.type === "video") { openVideoEditor(r); return; }   /* §187 多源弹窗，不走 input/applyCell */
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
      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
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
          if (YJ.util.effEqual(String(val), String(baseV))) delete t._pend[key];
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

  function setCursor(td) {
    $all("td.ring-2", els.grid).forEach(function (x) { x.classList.remove("ring-2", "ring-primary/60", "ring-inset"); });
    if (!td) { S.cur = null; return; }
    td.classList.add("ring-2", "ring-primary/60", "ring-inset");
    S.cur = { ri: +td.getAttribute("data-ri"), key: td.getAttribute("data-c") };
  }

  /* ---------------- 粘贴导入 / 导出 TSV ---------------- */
  function parseTsv(txt) {
    var lines = txt.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    return lines.map(function (l) { return l.split("\t"); });
  }
  /* §150 粘贴导入：先解析 → 预览确认（行数 + 前 8 行样例 + 未匹配马名警示）→ 确认才写入。
   * 静默直入版曾直接改表，TSV 列序错位/马名打错没有任何拦截就进草稿。 */
  function pasteImport() {
    if (S.sheet !== "races") { toast("粘贴导入只在比赛页签开放（基本信息不支持表格新增）"); return; }
    var read = (navigator.clipboard && navigator.clipboard.readText)
      ? navigator.clipboard.readText().catch(function () { return ""; })
      : Promise.resolve("");
    read.then(function (txt) {
      if (!txt) {
        txt = window.prompt("请 Ctrl+V 粘贴 TSV（每行一条，Tab 分列，按表格列序）：") || "";
      }
      var grid = parseTsv(txt);
      if (!grid.length) { toast("剪贴板没有可解析的内容"); return; }
      showPastePreview(grid);
    });
  }
  function showPastePreview(grid) {
    var editable = layout().filter(function (c) { return !c.ro; });
    var nameIdx = -1;
    editable.forEach(function (c, i2) { if (c.k === "出走馬名") nameIdx = i2; });
    var bad = [];
    grid.forEach(function (cells) {
      var nm = nameIdx >= 0 ? String(cells[nameIdx] || "").trim() : "";
      if (nm && !resolveHorse(nm)) bad.push(nm);
    });
    var uniqBad = bad.filter(function (x, i2) { return bad.indexOf(x) === i2; });
    var sample = grid.slice(0, 8).map(function (cells) {
      return "<tr>" + editable.slice(0, 4).map(function (c, i2) {
        return '<td class="border-b border-border/60 px-2 py-1">' + esc(cells[i2] == null ? "" : cells[i2]) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    var ov = document.createElement("div");
    ov.id = "yj-paste-ov";
    ov.className = "fixed inset-0 z-[80] flex items-center justify-center bg-black/30";
    ov.innerHTML = '<div class="w-[560px] max-w-[92vw] rounded-xl border border-border bg-card p-4 shadow-lg">' +
      '<div class="text-[13.5px] font-bold text-foreground">粘贴导入预览</div>' +
      '<div class="mt-1 text-[11.5px] text-muted-foreground">解析到 <b class="text-foreground">' + grid.length + "</b> 行，按当前可见列序写入新增行（提交「到 GitHub」后才落库）。</div>" +
      '<table class="mt-2.5 w-full border-collapse text-[11.5px]"><thead><tr>' +
        editable.slice(0, 4).map(function (c) {
          return '<th class="border-b border-border px-2 py-1 text-left text-[10.5px] font-semibold text-muted-foreground">' + esc(label(c.k)) + "</th>";
        }).join("") + "</tr></thead><tbody>" + sample + "</tbody></table>" +
      (grid.length > 8 ? '<div class="mt-1 text-[10.5px] text-muted-foreground">…仅展示前 8 行，共 ' + grid.length + " 行</div>" : "") +
      (uniqBad.length ? '<div class="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive">⚠ 未匹配到档案马名：' +
        esc(uniqBad.join("、")) + "——这些行不会提交（新增马请走抓取建档）</div>" : "") +
      '<div class="mt-3 flex justify-end gap-2">' +
        '<button id="ppCancel" class="yj-ed-op yj-ed-op--ghost h-8 px-3 text-[12px]" type="button">取消</button>' +
        '<button id="ppOk" class="yj-ed-op yj-ed-op--primary h-8 px-4 text-[12px]" type="button">确认导入</button>' +
      "</div></div>";
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector("#ppCancel").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#ppOk").addEventListener("click", function () { close(); doPasteImport(grid); });
  }
  function doPasteImport(grid) {
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
    invalidateCols();          /* §189：导入行可能有更宽值 → 重列宽 */
    rebuild(); YJ.editor.render();
    toast("粘贴导入 " + grid.length + " 行（青底=新增；馬名未匹配的行不会提交）");
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
        invalidateCols();          /* §171 列集合变了 → 列宽重新量 */
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
  /* §150「只看待保存」开关两态样式（类名字面量须留在本文件，Tailwind content 可扫到） */
  var DIRTY_OFF = "yj-ed-op yj-ed-op--ghost h-7 px-2.5 text-[11.5px]";
  var DIRTY_ON = "yj-ed-op h-7 px-2.5 text-[11.5px] border-primary bg-accent/25 text-primary";
  function syncDirtyBtn() {
    if (!els.dirtyBtn) return;
    els.dirtyBtn.className = S.onlyDirty ? DIRTY_ON : DIRTY_OFF;
    els.dirtyBtn.textContent = S.onlyDirty ? "只看待保存 ✓" : "只看待保存";
    els.dirtyBtn.title = "只列出有本页改动的行（新增/删除/待保存格）";
  }
  function switchSheetUI(sheet) {
    S.sheet = sheet;
    $all("button", els.sheets).forEach(function (x) {
      var on = x.getAttribute("data-sheet") === sheet;
      x.className = TAB_BASE + (on
        ? "bg-card text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground");
    });
    S.cur = null; S.editing = null;
    invalidateCols();          /* §171 两张表列定义不同 → 列宽重新量 */
    buildNameIdx();            /* §188：基本信息行可能本会话改过港译/自译 → 切页签重建四名联查表 */
    buildColMenu(); rebuild(); syncToolbar();
    /* 外壳侧栏跟随：页内切页签不产生 iframe load → postMessage 让外壳把高亮挪到对应编辑条目 */
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: "yj:page", page: "edit-table", sheet: sheet }, "*");
    } catch (e) { /* 跨域/独立打开 → 忽略 */ }
  }

  /* ---------------- init ---------------- */
  function init(opts) {
    ["grid", "search", "meta", "addBtn", "delBtn", "undoBtn", "redoBtn", "pasteBtn",
      "colBtn", "colMenu", "resetBtn", "summary", "sheets", "toast", "nameList", "fsBtn", "fsTarget",
      "dirtyBtn", "cntBasic", "cntRaces"].forEach(function (k) {
      els[k] = opts[k] ? document.getElementById(opts[k]) : null;
    });
    els.thead = els.grid ? els.grid.querySelector("thead") : null;
    els.tbody = els.grid ? els.grid.querySelector("tbody") : null;
    els.gridWrap = els.grid ? els.grid.parentElement : null;

    RK = YJ.raceBundle.RK; EK = YJ.raceBundle.EK;
    S.startRc = (function () { var rc = YJ.editor.rcGet(); return (rc.add.length + rc.mod.length + rc.del.length) ? clone(rc) : null; })();

    return Promise.all([
      YJ.cache.fetch("basic"),
      YJ.cache.fetch("bundle"),
      /* §187 视频源：自动匹配表 + 人工表（缺失/失败一律降级空，表格照常可用） */
      YJ.cache.fetch("videoMap").catch(function () { return null; }),
      YJ.cache.fetch("videoManual").catch(function () { return null; })
    ]).then(function (rs) {
      S.bundleBy = YJ.raceBundle.decode(rs[1]);
      loadVidBase(rs[2], rs[3]);
      hydrateBasic(); hydrateRaces();
      buildNameList();
      bind();
      syncDirtyBtn();
      buildColMenu(); rebuild();
      document.addEventListener("yj-rc-dropped", function () {
        S.startRc = null; hydrateRaces(); invalidateCols(); rebuild(); updateSummary();
      });
      /* §187 视频源草稿被放弃/提交清箱 → 重新水合视频列（表格行结构不动） */
      document.addEventListener("yj-vid-dropped", function () {
        hydrateVid(); invalidateCols(); rebuild(); updateSummary();
      });
      /* 草稿箱里放弃了一条**字段草稿**（editor.js::discardOne 的普通马匹分支）→ 重新水合基本信息表。
       * 2026-10-30 修：此前该分支只删 localStorage 不派发事件，表格页内存里的 S.pendOv 与
       * S.sh.basic.rows 仍是改过的值，表现为「点了放弃，表格没变化」。
       * hydrateBasic() 会按当前草稿重建 startOv/pendOv/rows，所以这里先清掉该马的会话痕迹，
       * 免得残留的 touchedOv 让下一次 syncOv 把旧 startOv 写回草稿箱。 */
      document.addEventListener("yj-ov-dropped", function (ev) {
        var id = ev && ev.detail ? String(ev.detail.id || "") : "";
        if (id) { delete S.touchedOv[id]; delete S.pendOv[id]; }
        if (S.editing) { S.editing = null; }      /* 正在编辑的格一并丢弃（放弃草稿语义） */
        hydrateBasic();
        invalidateCols();                          /* §189：行值回官方 → 重列宽 */
        rebuild();                                 /* 内含 syncToolbar + updateSummary */
      });
      /* 提交成功（editor.js::submitDrafts 的成功 then）→ 两张表全量重水合。
       * 2026-10-30 修（§143）：此前提交成功只对 races 派发 yj-rc-dropped，基本信息无人通知，
       * 表格继续显示已提交的旧值、摘要与草稿箱计数也不归零。
       * 提交后远端表已更新、本地草稿已清，所以：会话状态全清 + 撤销栈清空（不能再回退已提交的改动）
       * + 重新水合 = 表格回到官方值、摘要归零、草稿箱计数归零、提交按钮自动回到 disabled。 */
      document.addEventListener("yj-draft-committed", function () {
        S.touchedOv = {}; S.pendOv = {};
        S.startRc = null;
        S.undoJ = []; S.redoJ = [];
        if (S.editing) { S.editing = null; }
        hydrateBasic(); hydrateRaces();
        rebuild();                                 /* 内含 syncToolbar + updateSummary */
        /* §187：提交后 video_manual.json 已是新值（submitDrafts 已 bust 全站缓存）→ 重拉两份表，
         * 让「自动/人工」来源标记与源数立刻反映已提交结果，不必等刷新页面。 */
        Promise.all([
          YJ.cache.fetch("videoMap").catch(function () { return null; }),
          YJ.cache.fetch("videoManual").catch(function () { return null; })
        ]).then(function (vv) { loadVidBase(vv[0], vv[1]); hydrateVid(); rebuild(); });
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
      if (e.target.closest && e.target.closest("[data-hedit]")) return;   /* §150「去编辑」锚点走默认导航 */
      var td = e.target.closest("td[data-c]");
      if (td && !e.target.classList.contains("yjx-ck")) startEdit(td);
    });
    els.grid.addEventListener("change", function (e) {
      if (!e.target.classList.contains("yjx-ck")) return;
      var ri = +e.target.getAttribute("data-ri");
      if (e.target.checked) sh().sel[ri] = 1; else delete sh().sel[ri];
      syncToolbar();
    });
    /* 网格级键盘导航已移除（2026-10-30 用户定稿「不做快捷按键兼容」）：
     * 原绑定 Enter↓ / Tab→ / 方向键移动 / F2 进编辑 / Delete·Backspace 清格 / Ctrl+Z·Y 撤销重做。
     * 现交互只有「点击单元格就地编辑」，撤销/重做只走工具条按钮。
     * 保留：格内输入框的 Enter 提交、Escape 取消（编辑控件基础行为，见 startEdit）。
     * ⚠ 不要复活这段：文案已从 edit-table.html 移除，加回键盘流会造成「界面不说、键却能用」的隐藏行为。 */
    if (els.sheets) els.sheets.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sheet]");
      if (b) switchSheetUI(b.getAttribute("data-sheet"));
    });
    if (els.search) {
      var sTimer = null;
      els.search.addEventListener("input", function () {
        var v = this.value;
        clearTimeout(sTimer);
        /* §171 11k 行全表 rowText 拼接有成本 → 输入去抖 120ms（每次按键只算一次） */
        sTimer = setTimeout(function () { sh().filter = v; S.cur = null; rebuild(); }, 120);
      });
    }
    if (els.addBtn) els.addBtn.addEventListener("click", addRaceRow);
    if (els.delBtn) els.delBtn.addEventListener("click", delSelected);
    if (els.undoBtn) els.undoBtn.addEventListener("click", undo);
    if (els.redoBtn) els.redoBtn.addEventListener("click", redo);
    if (els.pasteBtn) els.pasteBtn.addEventListener("click", pasteImport);
    if (els.dirtyBtn) els.dirtyBtn.addEventListener("click", function () {
      S.onlyDirty = !S.onlyDirty;
      syncDirtyBtn();
      rebuild();
    });
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetSession);
    if (els.fsBtn) els.fsBtn.addEventListener("click", toggleFs);
    document.addEventListener("keydown", function (e) {       /* ESC 退出全屏（格内编辑中先归格编辑器处理） */
      if (e.key === "Escape" && S.fs && !S.editing) fsExit();
    });
    if (els.colBtn) els.colBtn.addEventListener("click", function (e) {
      e.stopPropagation(); buildColMenu(); els.colMenu.classList.toggle("hidden");
    });
    /* §171 虚拟滚动：滚动只重算可视窗口（rAF 合帧，窗口未变则跳过）；视口尺寸变化整窗重排 */
    if (els.gridWrap) {
      var vTick = false;
      els.gridWrap.addEventListener("scroll", function () {
        if (vTick) return;
        vTick = true;
        requestAnimationFrame(function () { vTick = false; renderBody(false); });
      }, { passive: true });
      window.addEventListener("resize", function () { renderBody(true); });
    }
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
