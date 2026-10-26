/* ============================================================
 * 云迹 · 页面级小工具（YJ.util）—— 单一出处
 * ------------------------------------------------------------
 * esc()：HTML 文本转义。原本在 6 个页面里各复制了一份
 *   （其中 timeline/datechart 的副本已漂移成 `>` 无操作），现收敛于此。
 *
 * 用法：页面在 data-config.js 之后引入本文件，
 *   页内脚本顶部薄别名：var esc = YJ.util.esc;
 *
 * 注：race-rows.js 内部另有一份自包含 esc（该模块保持零依赖、可独立单测），
 *   两处语义保持一致，改转义规则时两份同步。
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.util = (function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ── 馬名脚本判定 ─────────────────────────────────────────────
   * 海外出赛马的 馬名 字段本身就是拉丁字母名（JBIS 建档值，如 "Grand Warrior(JPN)"），
   * 且这类马多无 JRA 登録名 → netkeiba 只写「母名+生年」占位、欧字馬名 抓为空。
   * 所以「日文 / 英文」槽位与色块不能按字段名硬分，必须按内容判定 + 剥生产国尾缀。
   * 国家码表与后端 scripts/races/racelib.py 的 _COUNTRY_SUFFIX_RE 保持一致。 */
  var COUNTRY_SUFFIX = /[（(]\s*(JPN|USA|GB|IRE|NZ|AUS|AU|FR|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK|SGP|UAE|NZL|BR|CL|PE|MX|KOR|TWN)\s*[）)]\s*$/;
  var JP_CHARS = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｱ-ﾝ]/;   /* 平/片假名 + 汉字 + 半角片假名 */

  /* "Grand Warrior(JPN)" → { name:"Grand Warrior", code:"JPN" }；无尾缀 → code:"" */
  function splitName(v) {
    var s = String(v == null ? "" : v).trim(), code = "", m;
    while ((m = s.match(COUNTRY_SUFFIX))) {
      code = m[1].toUpperCase();
      s = s.slice(0, m.index).trim();
    }
    return { name: s, code: code };
  }

  /* → "jp"（含假名/汉字）| "en"（拉丁字母名）。无字母时回退 jp，维持旧行为 */
  function nameKind(v) {
    var s = splitName(v).name;
    if (JP_CHARS.test(s)) return "jp";
    return /[A-Za-zＡ-Ｚａ-ｚ]/.test(s) ? "en" : "jp";
  }

  /* 无任何马名时的兜底显示名「母名の生年」（如 ダイシンステルラの2023）——从未做 JRA 馬名登録的
   * 马，netkeiba 详情页标题就是这个占位值，比 #id 可读；母名也缺才逐级退到 生年 → #id。
   * 原为 selector.js 页内私有函数，§64 等值搬来此处做全站单一出处（profile 名字四格等同步跟）。 */
  function fallbackName(h) {
    h = h || {};
    var dam = h.母名, yr = h.生年;
    if (dam && yr) return dam + "の" + yr;
    if (dam) return dam;
    if (yr) return String(yr);
    return "#" + (h.id == null ? "" : h.id);
  }

  /* 主名（全站统一兜底链）：馬名（剥生产国尾缀）→ 欧字馬名 → 母名の生年 → #id。
   * 尾缀 (JPN)/(USA)… 一律不展示（语义未证实，见 §57），但数据侧 basic.json 保留 JBIS 原值不动。 */
  function mainName(h) {
    h = h || {};
    return splitName(h.馬名).name || splitName(h.欧字馬名).name || fallbackName(h);
  }

  /* 当前性别（全站按性别统计/筛选的单一出处）：
   * 官方 性別 是「登录性别」，无 JRA 登录的海外马去势后 netkeiba/JBIS 都不回写；
   * 后端 性別_当前 由最近一场的逐场 性 派生（见 scripts/races/merge_races.py 3b），
   * 与后端 scripts/stats/build_stats.py 的 sex_key 取值口径保持一致。 */
  function sexOf(h) {
    h = h || {};
    return h.性別_当前 || h.性別 || "";
  }

  /* URL query 参数取值（匹配 + decode 统一，2026-xx 收口各页手写 match/URLSearchParams）：
   * ?horse=1 → "1"；缺省/空值 → ""。与旧 `/[?&]name=([^&]+)/` + decodeURIComponent、
   * `new URLSearchParams(...).get(name)===…` 两种写法在取值上等值（+ 不作空格转换，与旧 horse 用法一致）。 */
  function qs(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  /* URL 绝对化：与 yj-cache.js 内部同名 helper 语义一致（该模块保持自包含，见其注释）；
   * selector.js 等已依赖 YJ.util 的消费方统一走这里（B2 收口）。 */
  function absUrl(url) {
    try { return new URL(String(url), document.baseURI || location.href).href; }
    catch (e) { return String(url); }
  }

  /* 赏金格式化（万円/亿）：>0 → "x,xxx万" / "x亿x万"（万段为 0 只留亿）；空/非数 → empty（缺省 ""）。
   * 原 stats（空返 "0万"）/datechart（空返 ""）两份同构实现，2026-xx 参数化收口 —— 空值策略属页面
   * 语义，由调用页显式传参（如 stats: YJ.util.manYen(pr, "0万")）。 */
  function manYen(pr, empty) {
    if (!pr) return empty === undefined ? "" : empty;
    if (pr >= 1e8) {
      var oku = Math.floor(pr / 1e8), man = Math.floor((pr % 1e8) / 10000);
      return oku + "亿" + (man ? man.toLocaleString() + "万" : "");
    }
    return Math.round(pr / 10000).toLocaleString() + "万";
  }

  /* JRA 登录状态箭头链（2026-10 去向调查 · 用户定稿）：登録状態 + 抹消组三键 → 徽章串。
   * §48 收口单一出处：profile.html 行内 + 编辑台实时预览共用，禁止第三份拷贝。
   * 落库规则：只有「确认去向」才写 種別/場所（推定/猜测绝不落库，不确定只留抹消日）
   * → 有去向徽章必是确认済，一律实线；无去向只显 [抹消 日期]，无箭头。
   * 配色 = theme.css .yj-stb*；文案走 i18n 枚举（抹消_去向種別），未收录回退原值。 */
  function statusChain(h) {
    if (!h) return '<span class="text-muted-foreground">—</span>';
    var st = h.登録状態 || "", dest = h.抹消_去向種別 || "";
    if (!st && !dest) return '<span class="text-muted-foreground">—</span>';
    var b = function (cls, txt, sub) {
      return '<span class="yj-stb ' + cls + '"><span class="yj-stb-t">' + esc(txt) + "</span>" +
        (sub ? '<span class="yj-stb-d">' + esc(sub) + "</span>" : "") + "</span>";
    };
    var out = '<span class="yj-stb-chain">';
    if (st === "現役") out += b("yj-stb--live", "现役");
    else if (st) out += b("yj-stb--erased", "抹消", h.抹消日 || "");
    /* 去向徽章：登録状態=抹消 或 为空（未登録/空值）且有确认去向时显示（2026-xx：空状态马也可记录去向，如 死亡）；
     * 空状态无前置状态徽章 → 不带箭头，单显去向。 */
    if ((st === "抹消" || st === "") && dest) {
      var place = h.抹消_去向場所 || "";
      var i18n = (window.YJ && YJ.i18n && YJ.i18n.e) ? YJ.i18n.e : null;
      var word = i18n ? (i18n("抹消_去向種別", dest) || dest) : dest;
      if (place) word += "·" + place;        /* 紧凑 ·：窄列（档案页三列值区 ~88px）尺寸预算内 */
      var cls = { "地方競馬": "yj-stb--local", "繁殖": "yj-stb--breed", "乗馬": "yj-stb--ride",
        "種馬": "yj-stb--sire", "死亡": "yj-stb--dead", "海外": "yj-stb--overseas" }[dest];
      if (cls) out += (st ? '<span class="yj-stb-arr">→</span>' : "") + b(cls, word);
    }
    return out + "</span>";
  }

  /* ---------------- 站点命名空间（2026-10-26 §105 双仓同改） ----------------
   * 动因：localStorage/Cache API/IndexedDB 全按 origin（协议+域名+端口，路径无关）隔离，而两仓
   * （kzn/yunji）编辑台键名相同 → 本地同端口（如 127.0.0.1:8090）先后服务两站 = 同源共用一份存储，
   * PAT/草稿/数据缓存互相串（实测：kzn 编辑台回显出贴在 yunji 侧的 PAT）。定稿：站点级键全部加
   * 站点 id 前缀，单源 = site-config 的 YJ_SITE.id（config/sire.json site.id）；缺省回退 "yj"（旧无
   * 前缀键，站点配置缺失时的兜底）。
   * ⚠ 必须调用时求值：yj-util 在 stats/datechart/races 页先于 site-config.js 执行，加载期读
   * YJ_SITE 恒 undefined → 一律走 siteId()/storeKey() 函数，禁止模块加载期算好存 const。 */
  function siteId() { return (window.YJ_SITE && YJ_SITE.id) || "yj"; }
  function storeKey(k) { return siteId() + "." + k; }

  /* 编辑台草稿箱 localStorage 键（schema 版本号）：profile.html（只读叠加渲染）与 editor.js（读写）共用，
   * 2026-xx 收口单一出处 —— 升级草稿 schema 只改这一处，防双处字符串漂移。
   * defineProperty getter 惰性求值（理由见上），保持 YJ.util.DRAFT_KEY 属性形态 → 调用点零改动。 */
  var api = { esc: esc, qs: qs, absUrl: absUrl, manYen: manYen,
    siteId: siteId, storeKey: storeKey,
    splitName: splitName, nameKind: nameKind, fallbackName: fallbackName,
    mainName: mainName, sexOf: sexOf, statusChain: statusChain };
  Object.defineProperty(api, "DRAFT_KEY", { get: function () { return storeKey("edit.drafts.v1"); } });
  return api;
})();
