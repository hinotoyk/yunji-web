/* ============================================================
 * 云迹 · 比赛记录「表格 / 行 / 徽章」渲染共享模块（单一出处）
 * ------------------------------------------------------------
 * 为什么存在：比赛记录表格全站有 3 个落点——① 比赛记录页跨马主表（视图 lib）、
 *   ② 内嵌表（races.html?embed=1，profile 下段）、③ 日期统计页明细（视图 embed + 馬名列）。
 *   历史上 ①② 各写一套行渲染 + 各自一份列定义：改列/改徽章只改一处，另一处不知道（明细与比赛页脱节）。
 *   → 收敛为「一份字段基准 + 一台渲染器」：列序/表头 / PC 单元格 / mb 卡片项 / 列宽最小宽 全部由
 *     BASE_COLS + COL 派生，视图只声明**隐藏哪些字段**（见 §字段基准），加列改列只改这里。
 *
 * 用法（非 module，页面用 <script src="../race-rows.js"></script> 引入，须在 i18n.js 之后）：
 *     YJ.raceRows.rowHTML("lib", en, {nameText:fn})       // 跨马主表 PC 行（en={h,r}）
 *     YJ.raceRows.mbCardHTML("lib", en, {nameText:fn})    // 跨马主表 mb 卡片
 *     YJ.raceRows.theadHTML("lib", {nameToggle:true})     // 跨马主表表头（nameToggle=出走马列头切换按钮）
 *     YJ.raceRows.cols("lib")                             // 列定义数组（页面列宽算法/量宽用）
 *     YJ.raceRows.embedTableHTML(rows, {horse:h})         // 内嵌表壳+表头（日期统计明细同款）
 *     YJ.raceRows.rowEmbedHTML(r, {horse:h})              // 内嵌表 PC 行（+馬名列）
 *     YJ.raceRows.rowEmbedMbHTML(r, {horse:h})            // 内嵌表 mb 卡片
 *     YJ.raceRows.mbListHTML(rows, {cls})                 // mb 卡片容器
 *
 * 记录字段用比赛数据原始日文键（日付/場名/R/レース名/距離/芝ダ/馬場/斤量/人気/結果/タイム/賞金/
 *   馬体重/増減/騎手/調教師/格）。数据键不同的页面（如日期统计的预计算短键产物）请先在页面侧
 *   适配成该形状（datechart.html 的 toRow()），再调本模块。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.raceRows = (function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function num(v) { return (v == null || v === "") ? "" : esc(String(v)); }
  function opt(o) { return (o && typeof o === "object") ? o : {}; }
  function T(k) { return YJ.i18n.t(k); }

  /* ---- 着顺浅色三件套（1/2/3着 + 着外）：数据语义色 JS 侧单一出处 ----
   * CSS 侧同源处：theme.css .yj-nkm1/2/3（人气 mb 浅底）——两处改色需同步。
   * 使用方：本模块徽章、datechart 进板数（BR_COLORS）、stats 通算战绩/着别分布条（BR）。 */
  var PLACE_BG = ["#FEED88", "#CCDFFD", "#ECC6A2", "#ececec"];

  /* ---- 等级徽章（JBIS 配色：实心胶囊 + 白字；OP 浅青绿）
   * ★ 取值必须与 .yj-g* 类名完全同大小写（全小写），否则徽章无底色、白字不可见 */
  var G = { "GI": "g1", "GII": "g2", "GIII": "g3", "L": "gl", "OP": "gop",
            "JpnI": "g1", "JpnII": "g2", "JpnIII": "g3" };
  var GLABEL = { "GI": "G1", "GII": "G2", "GIII": "G3", "L": "L", "OP": "OP",
                 "JpnI": "Jpn1", "JpnII": "Jpn2", "JpnIII": "Jpn3" };
  function gradeBadge(g) {
    var k = g && G[g];
    return k ? '<span class="yj-grade yj-' + k + '">' + esc(GLABEL[g]) + '</span>' : "";
  }

  /* ---- 着顺徽章：仅 1/2/3 有浅底彩边（无字重/阴影/光晕），其余纯数字 ---- */
  function placeBadge(n) {
    if (n === 1) return '<span class="yj-no yj-no1">1</span>';
    if (n === 2) return '<span class="yj-no yj-no2">2</span>';
    if (n === 3) return '<span class="yj-no yj-no3">3</span>';
    return esc(n);
  }

  /* ---- 人气徽章：与着顺徽章完全同款（yj-no 底座 + 同色 1/2/3 浅底彩边黑字），4+ 纯数字 ---- */
  function ninkiBadge(n) {
    if (n == 1) return '<span class="yj-no yj-nk1">1</span>';
    if (n == 2) return '<span class="yj-no yj-nk2">2</span>';
    if (n == 3) return '<span class="yj-no yj-nk3">3</span>';
    return esc(n);
  }

  /* ---- 人气（mb 纯数字版）灰色类：1/2/3 浅色做底 + 深色数字，4+ 返回 null（默认前景色） ---- */
  function ninkiMbCls(n) {
    if (n == 1) return "yj-nkm1";
    if (n == 2) return "yj-nkm2";
    if (n == 3) return "yj-nkm3";
    return null;
  }

  /* ---- 赛事名去冗余尾缀 ----
   * 数据里重赏/L/OP 的赛事名自带等级尾缀：「東京優駿(GI)」「野路菊S(OP)」。
   * 已用等级徽章表达同一信息 → 尾缀重复占宽，渲染前去掉；
   * 仅在「该场确实会渲染徽章」时去（尾缀与 格 相等且级别在 G 表内），
   * (1勝クラス)/(3歳)/(C4) 等无徽章尾缀必须保留，否则丢信息。
   * 后端同口径实现：scripts/timeline/build_timeline.py 的 strip_grade_suffix（时间线产物侧）。 */
  function raceNameText(r) {
    var s = String((r && r.レース名) || "");
    var m = s.match(/[（(]([^()（）]*)[)）]\s*$/);
    if (m && G[m[1]] && r.格 === m[1]) return s.slice(0, m.index).replace(/\s+$/, "");
    return s;
  }

  /* ---- 场地+R 组合文案：阪神9R / 京都5R / 东京1R ---- */
  function venueR(r) {
    var s = (r && r.場名) || "";
    if (r && r.R != null && r.R !== "") s += String(r.R) + "R";
    return s;
  }

  /* ---- 马体重（含增减，两段式半角括号）：500(+20)；无增减只显示马体重 ---- */
  function weight(w, d) {
    var ws = (w == null || w === "") ? "" : String(w);
    var ds = (d == null || d === "") ? "" : "(" + String(d) + ")";
    return ws + ds;
  }
  function weightOf(r) { return weight(r && r.馬体重, r && r.増減); }

  /* ---- 跑道简称（跨马表「距离」列：草1200 / 泥1200 / 障1000 / AW1000） ---- */
  var SURF_SHORT = { "芝": "草", "ダ": "泥", "障害": "障", "AW": "AW" };
  function surfaceShort(v) { return SURF_SHORT[v] || ""; }

  /* ---- 马名 ----
   * 跨马场景页面可传 opts.nameText(en) 覆盖（比赛记录页的马名语言切换 NAME_VIEW：量尺与渲染必须同源）；
   * 缺省 = 日文名 → 欧字名 → #id；内嵌/明细场景传 opts.horse={id,name}（name 由后端产物给出）。 */
  function horseName(en, o) {
    if (typeof o.nameText === "function") return o.nameText(en);
    var h = (en && en.h) || {};
    return h.馬名 || h.欧字馬名 || ("#" + h.id);
  }
  function horseLink(id, name) {
    if (id == null || id === "") return esc(name);
    return '<a class="hjump" href="profile.html?horse=' + encodeURIComponent(id) + '">' + esc(name) + '</a>';
  }
  /* 本行（或本表）的馬名跳转：内嵌/明细走 opts.horse，跨马走 en.h */
  function rowHorse(en, o) {
    if (en && en.h) return horseLink(en.h.id, horseName(en, o));
    var h = o.horse;
    return h ? horseLink(h.id, h.name) : "";
  }
  function hasHorse(en, o) { return !!(en && en.h) || !!(o && o.horse); }

  /* ---- 单元格类名（PC）：embed 与 lib 两套 padding；数字列加 tabular-nums ---- */
  var TC = "px-1 py-1.5 text-center tabular-nums whitespace-nowrap";
  var TT = "px-1 py-1.5 text-center whitespace-nowrap";
  var TCL = "px-[2px] py-1.5 text-center tabular-nums whitespace-nowrap";
  var TTL = "px-[2px] py-1.5 text-center whitespace-nowrap";

  /* ================= 列定义（全站比赛记录表格的唯一字段口径） =================
   * k      列键（BASE_COLS 基准列序按它引用；mb 行分组也用）
   * th     表头文案（i18n key，经 T() 翻译）；视图 th 表可给**字面量短标签**覆盖（如 lib 的「马场/体重/赔率」）
   * flex   跨马表列宽注水时的「弹性文本列」标记（其余为数字/定长列）
   * cls    embed 表单元格类名；clsLib = lib 表单元格类名
   * pc(r,en,o)         → PC 单元格内 HTML（不含 <td> 包裹）
   * mbItem(r,en,o,lb)  → mb 卡片项 HTML（"" = 该项不出现；lb = 已解析的 mb 标签）
   * mbTop(r,en,o)      → mb 卡片顶部槽内 HTML（仅 date/race/horse/place 四列有）
   * mbLabel            mb 标签（i18n key；视图 mbLabel 表可给字面量覆盖）
   * min(ctx)           该列最小宽 px（仅 lib 列宽算法用；ctx = {fmt,page,txt,curFS,curTH,o}）
   * ======================================================================== */
  function mbi(label, val, o) {
    o = opt(o);
    if (val == null || val === "") return "";   /* 空值整项不出现（与老独立表 item() 同口径） */
    var wrap = o.wrap || "yj-mb-item";
    var inner = o.raw ? val
      : (label ? '<i>' + esc(label) + '：</i>' : '') +
        '<b' + (o.cls ? ' class="' + o.cls + '"' : '') + '>' + val + '</b>' + (o.after || "");
    return '<span class="' + wrap + '">' + inner + '</span>';
  }
  /* 该行是否未完走（无着顺行 → 整行淡化 / 时间着差显示「—」） */
  function isDnf(r) { return typeof r.結果 === "string"; }
  /* 跑道+距离合并文案：草2200 / 泥1500 / 障1000 / AW1000 —— PC 表与 mb 卡片同一文案（用户定稿 §53.5） */
  function distText(r) { return surfaceShort(r.芝ダ) + num(r.距離); }

  var COL = {
    horse: {
      th: "馬名", flex: true, cls: TT, clsLib: TTL,
      mbLabel: "馬名",
      pc: function (r, en, o) { return rowHorse(en, o); },
      mbItem: function (r, en, o, lb) { return mbi(lb, rowHorse(en, o), { raw: true }); },
      mbTop: function (r, en, o) { return rowHorse(en, o); },
      min: function (ctx) { return ctx.page(function (en) { return horseName(en, ctx.o); }); }
    },
    date: {
      th: "日付", cls: TC, clsLib: TCL,
      pc: function (r) { return esc(r.日付); },
      mbTop: function (r) { return esc(r.日付) + " " + esc(venueR(r)); },
      min: function (ctx) { return ctx.fmt("2026-08-30"); }
    },
    venue: {
      th: "場名", flex: true, cls: TC, clsLib: TTL,
      pc: function (r) { return esc(venueR(r)); },
      min: function (ctx) { return ctx.page(function (en) { return venueR(en.r); }); }
    },
    race: {
      th: "レース名", flex: true,
      cls: "px-1 py-1.5 text-center min-w-[80px] whitespace-normal", clsLib: TTL,
      pc: function (r) { return esc(raceNameText(r)) + gradeBadge(r.格); },
      mbItem: function (r, en, o, lb) {
        var g = gradeBadge(r.格), n = raceNameText(r);
        if (!n) return g ? mbi(null, g, { raw: true }) : "";
        return mbi(null, esc(n), { cls: "yj-race", after: g });
      },
      mbTop: function (r) { return esc(raceNameText(r)) + gradeBadge(r.格); },
      min: function (ctx) { return ctx.page(function (en) { return raceMeasure(en, ctx); }); }
    },
    distMerged: {   /* 唯一的「距离」列：跑道+距离合并（草2200 / 泥1500 / 障1000 / AW1000）
                     * 用户定稿（§53.5）：不拆列，PC 表与 mb 卡片**同一文案**，不再有单独的「跑道」列 */
      th: "距離", flex: true, cls: TTL, clsLib: TTL,
      pc: function (r) { return distText(r); },
      mbItem: function (r) { var s = distText(r); return s ? mbi(null, s, { wrap: "yj-mb-item yj-mb-dist" }) : ""; },
      min: function (ctx) { return ctx.fmt("AW1200"); }
    },
    tenki: {
      th: "天候", flex: true, cls: TT, clsLib: TTL,
      mbLabel: "天候",
      pc: function (r) { return esc(r.天候 || ""); },
      mbItem: function (r, en, o, lb) { return r.天候 ? mbi(lb, esc(r.天候)) : ""; },
      min: function (ctx) { return ctx.page(function (en) { return en.r.天候; }); }
    },
    baba: {
      th: "馬場", flex: true, cls: TC, clsLib: TTL,
      mbLabel: "馬場",
      pc: function (r) { return esc(r.馬場 || ""); },
      mbItem: function (r, en, o, lb) { return r.馬場 ? mbi(lb, esc(r.馬場)) : ""; },
      min: function (ctx) { return ctx.page(function (en) { return en.r.馬場; }); }
    },
    waku: {
      th: "枠番", cls: TC, clsLib: TCL, mbLabel: "枠番",
      pc: function (r) { return num(r.枠番); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.枠番)); },
      min: function (ctx) { return ctx.fmt("18"); }
    },
    umaban: {
      th: "馬番", cls: TC, clsLib: TCL, mbLabel: "馬番",
      pc: function (r) { return num(r.馬番); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.馬番)); },
      min: function (ctx) { return ctx.fmt("18"); }
    },
    tosu: {
      th: "頭数", cls: TC, clsLib: TCL, mbLabel: "頭数",
      pc: function (r) { return num(r.頭数); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.頭数)); },
      min: function (ctx) { return ctx.fmt("18"); }
    },
    kinryo: {
      th: "斤量", cls: TC, clsLib: TCL, mbLabel: "斤量",
      pc: function (r) { return num(r.斤量); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.斤量)); },
      min: function (ctx) { return ctx.fmt("60.0"); }
    },
    ninki: {
      th: "人気", cls: TC, clsLib: TTL, mbLabel: "人気",
      pc: function (r) { return ninkiBadge(r.人気); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.人気), { cls: ninkiMbCls(r.人気) }); },
      min: function (ctx) { return ctx.fmt("18"); }
    },
    place: {
      th: "着順", cls: TC, clsLib: TTL,
      pc: function (r) { return placeBadge(r.結果); },
      mbTop: function (r) { return placeBadge(r.結果); },
      min: function (ctx) { return ctx.fmt("18"); }
    },
    time: {
      th: "タイム", cls: TC, clsLib: TCL, mbLabel: "タイム",
      pc: function (r) { return isDnf(r) ? "—" : num(r.タイム); },
      mbItem: function (r, en, o, lb) { return mbi(lb, isDnf(r) ? "—" : num(r.タイム), { cls: "tm" }); },
      min: function (ctx) { return ctx.fmt("12:34.5"); }
    },
    chakusa: {
      th: "着差", cls: TT, clsLib: TTL, mbLabel: "着差",
      pc: function (r) { return isDnf(r) ? "—" : num(r.着差); },
      mbItem: function (r, en, o, lb) { return isDnf(r) ? "" : mbi(lb, num(r.着差), { cls: "diff" }); },
      min: function (ctx) { return ctx.fmt("±1.1"); }
    },
    agari: {
      th: "上り", cls: TC, clsLib: TCL, mbLabel: "上り",
      pc: function (r) { return num(r.上り); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.上り)); },
      min: function (ctx) { return ctx.fmt("36.3"); }
    },
    bw: {
      th: "馬体重", cls: TC, clsLib: TCL, mbLabel: "馬体重",
      pc: function (r) { return esc(weightOf(r)); },
      mbItem: function (r, en, o, lb) { return mbi(lb, esc(weightOf(r))); },
      min: function (ctx) { return ctx.fmt("500(+20)"); }
    },
    odds: {
      th: "単勝", cls: TC, clsLib: TCL, mbLabel: "単勝",
      pc: function (r) { return num(r.単勝); },
      mbItem: function (r, en, o, lb) { return mbi(lb, num(r.単勝)); },
      min: function (ctx) { return ctx.fmt("100.11"); }
    },
    prize: {
      th: "賞金", cls: TC, clsLib: TCL, thSuffix: "(万円)", mbLabel: "賞金",
      pc: function (r) { return r.賞金 ? Math.round(r.賞金 / 10000).toLocaleString() : ""; },
      mbItem: function (r, en, o, lb) {
        return mbi(lb, r.賞金 ? Math.round(r.賞金 / 10000).toLocaleString() + "万" : "—");
      },
      min: function (ctx) { return ctx.fmt("90000"); }
    },
    jockey: {
      th: "騎手", flex: true, cls: TC, clsLib: TTL, mbLabel: "騎手",
      pc: function (r) { return esc(r.騎手 || ""); },
      mbItem: function (r, en, o, lb) { return r.騎手 ? mbi(lb, esc(r.騎手)) : ""; },
      min: function (ctx) { return ctx.page(function (en) { return en.r.騎手; }); }
    },
    trainer: {
      th: "調教師", flex: true, cls: TC, clsLib: TTL, mbLabel: "調教師",
      pc: function (r) { return esc(r.調教師 || ""); },
      mbItem: function (r, en, o, lb) { return r.調教師 ? mbi(lb, esc(r.調教師)) : ""; },
      min: function (ctx) { return ctx.page(function (en) { return en.r.調教師; }); }
    }
  };

  /* ================= 字段基准（全站比赛记录表格的唯一字段与列序） =================
   * ★ 基准 = 比赛记录页（races.html）跨马主表 / mb 卡片 的字段与顺序（用户定稿，§53.5）。
   *   内嵌表（profile 下段）与日期统计明细 = 基准的**子集**：只通过 `hide` 清单隐藏字段，
   *   列序恒随基准（各视图**不再各写一份列清单**）→ 加列 / 调序 / 改列只改基准，各视图自动跟随。
   *   lib   = 基准全量（21 列）
   *   embed = 隐藏 天候/枠番/馬番/頭数/着差/上り/賠率 → 14 列（opts.horse 时含馬名，否则 13 列）
   * 视图差异只允许三处：① hide 隐藏清单 ② th/mbLabel 短标签覆盖 ③ mbLines mb 卡片分组
   *   （mb 分组：lib = 基准 5 行；embed = 自己的 3 行紧凑分组，但**字段顺序同样随基准**） */
  var BASE_TOP = ["date", "name", "place"];   /* mb 顶部三槽；"name" = 名称槽，见 mbCardHTML */
  var BASE_LINES = [
    ["race", "distMerged", "tenki", { k: "baba", label: "马场" }],
    ["time", "chakusa", "agari"],
    ["waku", "umaban", "tosu", "kinryo", "ninki"],
    [{ k: "bw", label: "体重" }, "odds", "prize"],
    ["jockey", "trainer"]
  ];
  /* 基准列序（21 列）：馬名 → 日付 → 場名 → レース名 → 距離 → 天候 → 馬場 → 枠番 → 馬番 → 頭数 →
     斤量 → 人気 → 着順 → タイム → 着差 → 上り → 体重 → 賠率 → 賞金 → 騎手 → 調教師 */
  var BASE_COLS = ["horse", "date", "venue", "race", "distMerged", "tenki", "baba", "waku", "umaban", "tosu",
                   "kinryo", "ninki", "place", "time", "chakusa", "agari", "bw", "odds", "prize", "jockey", "trainer"];

  var VIEWS = {
    embed: {
      thCls: "px-1 py-2 text-center text-[11.5px] font-semibold whitespace-nowrap tracking-[.5px]",
      hide: ["tenki", "waku", "umaban", "tosu", "chakusa", "agari", "odds"],
      onlyIfHorse: ["horse"],              /* 无馬名上下文（profile 下段单马）时整列不出现 */
      th: {}, mbLabel: {},
      mbLines: [
        ["race", "distMerged", "baba", "time", "prize"],
        ["kinryo", "ninki", "bw"],
        ["jockey", "trainer"]
      ]
    },
    lib: {
      thCls: "px-[2px] py-2 text-center text-[10px] font-semibold whitespace-nowrap tracking-[.5px]",
      hide: [], onlyIfHorse: [],
      th: { horse: "出走马 ⇄", baba: "马场", bw: "体重", odds: "赔率" },
      mbLabel: { baba: "马场", bw: "体重", odds: "赔率" },
      mbLines: BASE_LINES
    }
  };

  /* 解析视图 → 已就绪的列项数组：基准列序 − hide 清单（− 无馬名上下文时的馬名列）。
   * 表头/标签覆盖来自视图；列本身的行为/量宽来自 COL（字段口径单一出处）。 */
  function cols(viewName, o) {
    var V = VIEWS[viewName];
    if (!V) throw new Error("race-rows: 未知视图 " + viewName);
    o = opt(o);
    var out = [];
    BASE_COLS.forEach(function (k) {
      if (V.hide.indexOf(k) >= 0) return;
      if (V.onlyIfHorse.indexOf(k) >= 0 && !hasHorse(null, o)) return;
      var c = COL[k];
      if (!c) throw new Error("race-rows: 未知列 " + k);
      var th = V.th[k] != null ? V.th[k] : (c.thSuffix ? T(c.th) + c.thSuffix : T(c.th));
      out.push({
        k: k, def: c, th: th, thm: th, flex: !!c.flex,
        cls: viewName === "lib" ? (c.clsLib || c.cls) : c.cls,
        mbLabel: V.mbLabel[k] != null ? V.mbLabel[k] : (c.mbLabel ? T(c.mbLabel) : ""),
        pc: c.pc, mbItem: c.mbItem, mbTop: c.mbTop, min: c.min
      });
    });
    return out;
  }
  function viewLines(viewName) { return VIEWS[viewName].mbLines; }

  /* 跨马表量宽：赛事名文本 + 级徽章额外宽（margin-left 6 + 徽章左右 padding；随档位放大）
   * 文本走 raceNameText（去冗余等级尾缀）——量尺与渲染必须共用同一来源，否则列宽失真。
   * ctx（由页面提供）= { fmt:固定列宽函数, page:页内最长内容宽函数, txt:DOM 精量, curFS, curTH, o } */
  function raceMeasure(en, ctx) {
    var r = (en && en.r) || en || {};
    var gk = r.格 && G[r.格];
    var pad = (ctx.curFS >= 13.5) ? 8 : 7;
    return { t: raceNameText(r), x: gk ? (ctx.txt(GLABEL[r.格], ctx.curTH + 1) + 6 + pad * 2) : 0 };
  }

  /* ================= 渲染器（表头 / 行 / mb 卡片，三态共用） ================= */
  function theadHTML(setName, o) {
    o = opt(o);
    var S = VIEWS[setName];
    var cells = cols(setName, o).map(function (e) {
      var label = e.th;
      if (o.nameToggle && e.k === "horse") {   /* 出走马列头 = 马名语言切换按钮（比赛记录页专属交互） */
        label = '<button type="button" class="yj-name-toggle"' + (o.nameTip ? ' data-tip="' + esc(o.nameTip) + '"' : '') + '>' +
                esc(e.th.replace(/\s*⇄\s*$/, "")) + ' <span class="yj-name-ico">⇄</span></button>';
      } else {
        label = esc(label);
      }
      return '<th class="' + S.thCls + '">' + label + '</th>';
    }).join("");
    return '<thead><tr class="border-b border-border bg-muted/40">' + cells + '</tr></thead>';
  }

  function rowHTML(setName, r, en, o) {
    o = opt(o);
    var dnf = isDnf(r);
    var cells = cols(setName, o).map(function (e) {
      return '<td class="' + e.cls + '">' + (e.pc ? e.pc(r, en, o) : "") + '</td>';
    }).join("");
    return '<tr class="border-b border-border last:border-b-0' + (dnf ? " text-muted-foreground" : "") + '">' + cells + '</tr>';
  }

  /* mb 卡片：顶部三槽（日期+场地 / 名称槽 / 着顺）+ 分组行；未完走整卡淡化。
   * 名称槽（BASE_TOP 的 "name"）= 馬名（基准首列）；当前视图没有馬名列时（profile 下段单马）
   * 退回赛事名，且该列在分组行里自动跳过（同一信息不重复出现）。
   * 分组行按列键取列定义：本视图 PC 列里没有的列键（如 embed 把距离并入后的 distMerged）
   * 直接回落 COL 表 → mb 分组与 PC 列集彼此独立，不要求一一对应。 */
  var MB_SLOT = { date: "yj-mb-date", race: "yj-mb-race", horse: "yj-mb-race", place: "yj-mb-place" };
  function mbCardHTML(setName, r, en, o) {
    o = opt(o);
    var byKey = {};
    cols(setName, o).forEach(function (e) { byKey[e.k] = e; });
    var pick = function (k) {
      if (byKey[k]) return byKey[k];
      var c = COL[k];
      if (!c) return null;
      return (byKey[k] = { k: k, def: c, thm: "", mbLabel: c.mbLabel ? T(c.mbLabel) : "", mbItem: c.mbItem, mbTop: c.mbTop });
    };
    var consumed = null;   /* 被名称槽用掉的列键 → 分组行里跳过 */
    var top = BASE_TOP.map(function (k) {
      var e;
      if (k === "name") {
        e = byKey.horse || byKey.race;         /* 馬名优先（基准首列）；无馬名上下文退回赛事名 */
        consumed = e ? e.k : null;
      } else {
        e = pick(k);
      }
      if (!e || !e.mbTop) return "";
      return '<span class="' + (MB_SLOT[e.k] || "yj-mb-race") + '">' + e.mbTop(r, en, o) + '</span>';
    }).join("");
    var lines = viewLines(setName).map(function (group) {
      var items = group.map(function (spec) {
        var k = (typeof spec === "string") ? spec : spec.k;
        if (k === consumed) return "";
        var e = pick(k);
        if (!e || !e.mbItem) return "";
        var lb = (typeof spec === "object" && spec.label != null) ? spec.label : e.mbLabel;   /* 行内标签覆盖（lib 的 体重/马场/赔率） */
        return e.mbItem(r, en, o, lb) || "";
      }).join("");
      return items ? '<div class="yj-mb-line">' + items + '</div>' : "";
    }).join("");
    return '<div class="yj-mb' + (isDnf(r) ? " dnf" : "") + '">' +
      '<div class="yj-mb-top">' + top + '</div>' + lines + '</div>';
  }

  function mbListHTML(rows, o) {
    o = opt(o);
    return '<div id="yj-mb-list" class="rounded-[10px] border border-border bg-card' + (o.cls ? " " + o.cls : "") + '">' + rows + '</div>';
  }

  /* 内嵌表壳（表头 + 表体）：比赛记录页内嵌 / profile 下段 / 日期统计明细 同一份 */
  function embedTableHTML(rows, o) {
    o = opt(o);
    return '<div class="overflow-x-auto rounded-[10px] border border-border bg-card' + (o.cls ? " " + o.cls : "") + '">' +
      '<table class="w-full border-collapse text-[12.5px]">' +
      theadHTML("embed", o) +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  /* 兼容别名（历史调用点语义不变） */
  function rowEmbedHTML(r, o) { return rowHTML("embed", r, null, o); }
  function rowEmbedMbHTML(r, o) { return mbCardHTML("embed", r, null, o); }
  function rowLibHTML(en, o) { return rowHTML("lib", en.r, en, o); }
  function rowLibMbHTML(en, o) { return mbCardHTML("lib", en.r, en, o); }
  function libTheadHTML(o) { return theadHTML("lib", o); }

  return {
    esc: esc, G: G, GLABEL: GLABEL, PLACE_BG: PLACE_BG,
    gradeBadge: gradeBadge, placeBadge: placeBadge,
    ninkiBadge: ninkiBadge, ninkiMbCls: ninkiMbCls,
    raceNameText: raceNameText, venueR: venueR, surfaceShort: surfaceShort,
    weight: weight, weightOf: weightOf, horseLink: horseLink,
    cols: cols, raceMeasure: raceMeasure,
    theadHTML: theadHTML, rowHTML: rowHTML, mbCardHTML: mbCardHTML, mbListHTML: mbListHTML,
    embedTableHTML: embedTableHTML,
    rowEmbedHTML: rowEmbedHTML, rowEmbedMbHTML: rowEmbedMbHTML,
    rowLibHTML: rowLibHTML, rowLibMbHTML: rowLibMbHTML, libTheadHTML: libTheadHTML
  };
})();
