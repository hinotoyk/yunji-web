/* ============================================================
 * 云迹 · 比赛记录「行/徽章」渲染共享模块（单一出处）
 * ------------------------------------------------------------
 * 为什么存在：比赛页（races.html）与日期图（datechart.html）的明细表
 *   原本各自复制了一份徽章函数 + 表格/mb 卡片标记，样式与列改动只改一处时
 *   另一处不会跟着变（明细与比赛页脱节）。
 *   → 把「等级徽章 / 着顺徽章 / 人气徽章 / 数值格式化 / 内嵌比赛表与 mb 卡片行」
 *     收敛到本文件：两页都调这里，改一次两处同步。
 *
 * 用法（非 module，页面用 <script src="../race-rows.js"></script> 引入，
 *   须在 i18n.js 之后）：
 *     YJ.raceRows.rowEmbedHTML(r)            // 内嵌式 PC 行（14 列）
 *     YJ.raceRows.rowEmbedHTML(r,{horse:h})  // 加「馬名」列（日期图明细：跨马场景）
 *     YJ.raceRows.embedTableHTML(rows)       // 表头 + 表壳（全列居中）
 *     YJ.raceRows.rowEmbedMbHTML(r), .mbListHTML(rowsHTML)
 *
 * 记录字段用比赛数据原始日文键（日付/場名/R/レース名/距離/芝ダ/馬場/斤量/人気/
 *   結果/タイム/賞金/馬体重/増減/騎手/調教師/格）。数据键不同的页面（如日期图
 *   的预计算短键产物）请先在页面侧适配成该形状，再调本模块。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.raceRows = (function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function num(v) { return (v == null || v === "") ? "" : esc(String(v)); }

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
   * (1勝クラス)/(3歳)/(C4) 等无徽章尾缀必须保留，否则丢信息。 */
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

  /* ---- 马名跳转（跨马场景）---- */
  function horseLink(h) {
    if (!h) return "";
    return '<a class="hjump" href="profile.html?horse=' + encodeURIComponent(h.id) + '">' + esc(h.name) + '</a>';
  }

  /* opts 容错：调用方可能直接 map(rowEmbedHTML) 传入 index 之类，非对象一律当空 */
  function opt(o) { return (o && typeof o === "object") ? o : {}; }

  /* ================= 内嵌式比赛表（PC） =================
   * 14 列：日付 場名(京都5R) レース名 距離 芝ダ 馬場 斤量 人気 着順 タイム 賞金(万円) 馬体重 騎手 調教師
   * opts.horse={id,name} → 在「日付」后插入「馬名」列（日期图明细跨马场景） */
  function embedTableHTML(rows, o) {
    o = opt(o);
    var t = YJ.i18n.t;
    var th = function (label) {
      return '<th class="px-1 py-2 text-center text-[11.5px] font-semibold whitespace-nowrap tracking-[.5px]">' + label + '</th>';
    };
    return '<div class="overflow-x-auto rounded-[10px] border border-border bg-card' + (o.cls ? " " + o.cls : "") + '">' +
      '<table class="w-full border-collapse text-[12.5px]">' +
      '<thead><tr class="border-b border-border bg-muted/40">' +
        th(t("日付")) + (o.horse ? th(t("馬名")) : "") + th(t("場名")) + th(t("レース名")) + th(t("距離")) +
        th(t("芝ダ")) + th(t("馬場")) + th(t("斤量")) + th(t("人気")) + th(t("着順")) + th(t("タイム")) +
        th(t("賞金") + '(万円)') + th(t("馬体重")) + th(t("騎手")) + th(t("調教師")) +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function rowEmbedHTML(r, o) {
    o = opt(o);
    var dnf = typeof r.結果 === "string";            /* 未完走（中止/失格/取消/除外）整行淡化 */
    var prize = (r.賞金 ? Math.round(r.賞金 / 10000).toLocaleString() : "");   /* 万円 */
    var rowClass = 'border-b border-border last:border-b-0' + (dnf ? ' text-muted-foreground' : '');
    var tc = function (v) { return '<td class="px-1 py-1.5 text-center tabular-nums whitespace-nowrap">' + v + '</td>'; };
    return '<tr class="' + rowClass + '">' +
      tc(esc(r.日付)) +
      (o.horse ? '<td class="px-1 py-1.5 text-center whitespace-nowrap">' + horseLink(o.horse) + '</td>' : "") +
      tc(esc(venueR(r))) +
      '<td class="px-1 py-1.5 text-center min-w-[80px] whitespace-normal">' + esc(raceNameText(r)) + gradeBadge(r.格) + '</td>' +
      tc(num(r.距離)) +
      tc(esc(YJ.i18n.e("芝ダ", r.芝ダ))) +
      tc(esc(r.馬場 || "")) +
      tc(num(r.斤量)) +
      tc(ninkiBadge(r.人気)) +
      tc(placeBadge(r.結果)) +
      tc(dnf ? '—' : num(r.タイム)) +
      tc(prize) +
      tc(esc(weightOf(r))) +
      tc(esc(r.騎手 || "")) +
      tc(esc(r.調教師 || "")) +
    '</tr>';
  }

  /* ================= mb 软分行卡片（≤768px） =================
   * 草地2000m 馬場：x タイム：x 賞金：x（opts.horse 时马名链接居首）
   * 斤量：x 人気：x 馬体重：x
   * 騎手：x 調教師：x */
  function mbListHTML(rows, o) {
    o = opt(o);
    return '<div id="yj-mb-list" class="rounded-[10px] border border-border bg-card' + (o.cls ? " " + o.cls : "") + '">' + rows + '</div>';
  }

  function rowEmbedMbHTML(r, o) {
    o = opt(o);
    var t = YJ.i18n.t;
    var dnf = typeof r.結果 === "string";
    var prize = (r.賞金 ? Math.round(r.賞金 / 10000).toLocaleString() + '万' : '—');
    var top = '<div class="yj-mb-top">' +
      '<span class="yj-mb-date">' + esc(r.日付) + ' ' + esc(venueR(r)) + '</span>' +
      '<span class="yj-mb-race">' + esc(raceNameText(r)) + gradeBadge(r.格) + '</span>' +
      '<span class="yj-mb-place">' + placeBadge(r.結果) + '</span>' +
    '</div>';
    var dist = (r.芝ダ ? esc(YJ.i18n.e("芝ダ", r.芝ダ)) : '') + (r.距離 ? num(r.距離) + 'm' : '');
    var horseItem = o.horse ? '<span class="yj-mb-item">' + horseLink(o.horse) + '</span>' : null;
    var distItem = dist ? '<span class="yj-mb-item yj-mb-dist"><b>' + dist + '</b></span>' : null;
    var item = function (label, v, vcls) {
      if (v == null || v === "") return null;
      return '<span class="yj-mb-item">' + (label ? '<i>' + esc(label) + '：</i>' : '') + '<b' + (vcls ? ' class="' + vcls + '"' : '') + '>' + v + '</b></span>';
    };
    var line = function (items) {
      items = items.filter(Boolean);
      return items.length ? '<div class="yj-mb-line">' + items.join("") + '</div>' : '';
    };
    var l1 = line([horseItem, distItem,
      item(t("馬場"), esc(r.馬場 || "")),
      item(t("タイム"), dnf ? '—' : num(r.タイム), "tm"),
      item(t("賞金"), prize)]);
    var l2 = line([item(t("斤量"), num(r.斤量)),
      item(t("人気"), num(r.人気), ninkiMbCls(r.人気)),
      item(t("馬体重"), esc(weightOf(r)))]);
    var l3 = line([item(t("騎手"), esc(r.騎手 || "")), item(t("調教師"), esc(r.調教師 || ""))]);
    return '<div class="yj-mb' + (dnf ? ' dnf' : '') + '">' + top + l1 + l2 + l3 + '</div>';
  }

  return {
    esc: esc, G: G, GLABEL: GLABEL, PLACE_BG: PLACE_BG,
    gradeBadge: gradeBadge, placeBadge: placeBadge,
    ninkiBadge: ninkiBadge, ninkiMbCls: ninkiMbCls,
    raceNameText: raceNameText, venueR: venueR,
    weight: weight, weightOf: weightOf, horseLink: horseLink,
    embedTableHTML: embedTableHTML, rowEmbedHTML: rowEmbedHTML,
    mbListHTML: mbListHTML, rowEmbedMbHTML: rowEmbedMbHTML
  };
})();
