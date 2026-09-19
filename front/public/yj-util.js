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

  return { esc: esc, splitName: splitName, nameKind: nameKind, fallbackName: fallbackName,
    mainName: mainName, sexOf: sexOf };
})();
