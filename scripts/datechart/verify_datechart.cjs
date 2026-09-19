/* 日期图 · 正式数据版 冒烟断言（Node stub DOM，不动浏览器；挂 run_update --ci/--check 与 CI 门禁）
 * 三段验证：
 *   [A] data/datechart.json 产物断言：字段同构性（21 键契约）、着顺段位合法、排序稳定
 *   [B] 产物 ↔ data/races 源数据 1:1 对账（独立第二实现，防 build 脚本单点 bug）
 *   [C] 页面冒烟（stub DOM + stub fetch 加载真实产物）：四口径 KPI / 场地范围 JRA·NAR·海外
 *       多选（默认 JRA）/ 日期选择器（Element 风格 日/周/月/年 面板）/ 点格下钻 / 周高亮（含跨月周
 *       补真实邻月日：邻月格灰显 M/D、不套 win/run 底色但数据照出）/
 *       年月卡 / 内嵌比赛表同款明细（PC 14 列 = 基准字段子集 + mb 软分行卡片），期望值全部从源数据独立重算
 * 用法: node scripts/datechart/verify_datechart.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "front", "pages", "datechart.html"), "utf8");
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok  " + msg); }
  else { fails++; console.log("  FAIL " + msg); }
}
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, ">");

/* ═══════════ [A] 产物断言 ═══════════ */
const product = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "datechart.json"), "utf8"));
const RUNS = product.runs || [];
const EXPECTED_KEYS = ["d", "id", "h", "hc", "r", "g", "v", "R", "hs", "dist", "s", "p", "pr", "vt", "bk", "ki", "nk", "tm", "bw", "dz", "jk", "tr"];
const DNF_SET = new Set(["中止", "取消", "除外", "失格"]);
const SURF_SET = new Set(["芝", "ダ", "障害", "AW"]);
const VT_SET = new Set(["中央", "地方", "海外"]);
const TROPHY_G = new Set(["GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII"]);   /* 重赏口径同 races.html（L/OP 不算） */

console.log("[A] data/datechart.json 产物断言");
{
  const st = (product.meta && product.meta.stats) || {};
  ok(RUNS.length > 0 && st.runs === RUNS.length, "meta.stats.runs = " + st.runs + " 与 runs[] 长度一致");
  ok(st.horses === new Set(RUNS.map(r => r.id)).size, "meta.stats.horses = " + st.horses);
  ok(st.wins === RUNS.filter(r => r.p === 1).length, "meta.stats.wins = " + st.wins);
  ok(st.trophy_wins === RUNS.filter(r => r.p === 1 && TROPHY_G.has(r.g)).length, "meta.stats.trophy_wins = " + st.trophy_wins + "（🏆 口径）");
  ok(st.prize_total === RUNS.reduce((a, r) => a + r.pr, 0), "meta.stats.prize_total = " + st.prize_total.toLocaleString() + " 円");
  ok(st.first_date === RUNS[0].d && st.last_date === RUNS[RUNS.length - 1].d, "first/last_date = " + st.first_date + " ~ " + st.last_date);
}
let badKeys = 0, badField = 0, badSort = 0;
const rawOk = v => v === "" || typeof v === "number" || typeof v === "string";   // ki/nk/bw 原样透传（斤量可 55.5/"121lb"）
for (let i = 0; i < RUNS.length; i++) {
  const r = RUNS[i];
  const keys = Object.keys(r);
  if (keys.length !== EXPECTED_KEYS.length || !EXPECTED_KEYS.every(k => keys.includes(k))) badKeys++;
  if (!(typeof r.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.d))) badField++;
  if (!Number.isInteger(r.id)) badField++;
  if (!(typeof r.h === "string" && r.h)) badField++;
  if (!(typeof r.r === "string" && typeof r.g === "string" && typeof r.v === "string")) badField++;
  if (!(Number.isInteger(r.R) || typeof r.R === "string")) badField++;
  if (!(Number.isInteger(r.dist) || r.dist === "")) badField++;
  if (!SURF_SET.has(r.s)) badField++;
  if (!(Number.isInteger(r.p) ? (r.p >= 1 && r.p <= 18) : (typeof r.p === "string" && DNF_SET.has(r.p)))) badField++;
  if (!(Number.isInteger(r.pr) && r.pr >= 0)) badField++;
  if (!VT_SET.has(r.vt)) badField++;
  if (!(typeof r.bk === "string" && typeof r.tm === "string" && typeof r.dz === "string" && typeof r.hs === "string")) badField++;
  if (!(typeof r.jk === "string" && typeof r.tr === "string")) badField++;
  if (!(rawOk(r.ki) && rawOk(r.nk) && rawOk(r.bw))) badField++;
  if (!(typeof r.hc === "string")) badField++;      /* hc = 中文名（切换马名用；无=空串） */
  if (i && (RUNS[i - 1].d > r.d || (RUNS[i - 1].d === r.d && String(RUNS[i - 1].id) > String(r.id)))) badSort++;
}
ok(badKeys === 0, "字段同构：全部 " + RUNS.length + " 条恰为 " + EXPECTED_KEYS.length + " 键");
ok(badField === 0, "字段类型：d 格式 / id int / h 非空 / s∈芝·ダ·障害·AW / p 着顺段位 / vt∈中央·地方·海外 / 明细字段齐全");
ok(badSort === 0, "排序：按 d → id → R 升序");

/* ═══════════ [B] 产物 ↔ 源数据 1:1 对账（独立第二实现） ═══════════ */
const basic = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "basic.json"), "utf8"));
const raw = v => (v == null ? "" : v);
const src = [];   // 直接从 data/races 重算的期望记录
for (const h of basic.horses) {
  if (!h.races_file) continue;
  let arr = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, h.races_file), "utf8"));
    arr = Array.isArray(d) ? d : (d.races || []);
  } catch (e) { continue; }
  for (const r of arr) {
    const d = String(r["日付"] || "");
    if (!d) continue;
    const res = r["結果"];
    const p = typeof res === "number" ? res
      : (/^\d+$/.test(String(res || "").trim()) ? parseInt(res, 10) : String(res || "").trim());
    const pr = typeof r["賞金"] === "number" ? r["賞金"]
      : (String(r["賞金"] || "").trim() && !isNaN(Number(r["賞金"])) ? Math.round(Number(r["賞金"])) : 0);
    src.push({
      d,
      id: h.id,
      h: h["馬名"] || r["出走馬名"] || h["欧字馬名"] || "",
      hc: h["香港馬名"] || h["自译馬名"] || "",
      r: String(r["レース名"] || ""),
      g: String(r["格"] || ""),
      v: String(r["場名"] || ""),
      R: r["R"] == null || r["R"] === "" ? "" : r["R"],
      hs: String(r["発走"] || ""),
      dist: typeof r["距離"] === "number" ? r["距離"] : "",
      s: String(r["芝ダ"] || ""),
      p,
      pr,
      vt: String(r["venue_type"] || ""),
      bk: String(r["馬場"] || ""),
      ki: raw(r["斤量"]),
      nk: raw(r["人気"]),
      tm: String(r["タイム"] || ""),
      bw: raw(r["馬体重"]),
      dz: String(r["増減"] || ""),
      jk: String(r["騎手"] || ""),
      tr: String(r["調教師"] || ""),
    });
  }
}
src.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : String(a.R) < String(b.R) ? -1 : 1);

console.log("[B] 产物 ↔ data/races 源数据 1:1 对账");
ok(src.length === RUNS.length, "总条数：产物 " + RUNS.length + " = 源 " + src.length);
let diffCnt = 0, diffSample = "";
const n = Math.min(src.length, RUNS.length);
for (let i = 0; i < n; i++) {
  for (const k of EXPECTED_KEYS) {
    if (String(src[i][k]) !== String(RUNS[i][k])) {
      diffCnt++;
      if (!diffSample) diffSample = "#" + i + " " + k + ": 产物=" + JSON.stringify(RUNS[i][k]) + " 源=" + JSON.stringify(src[i][k]);
    }
  }
}
ok(diffCnt === 0, "逐条 " + EXPECTED_KEYS.length + " 字段全等" + (diffSample ? "（首例差异: " + diffSample + "）" : ""));
ok(src.reduce((a, r) => a + r.pr, 0) === RUNS.reduce((a, r) => a + r.pr, 0), "赏金合计一致（円）");
ok(src.filter(r => r.p === 1).length === RUNS.filter(r => r.p === 1).length, "一着数一致");
ok(src.filter(r => r.p === 1 && TROPHY_G.has(r.g)).length === RUNS.filter(r => r.p === 1 && TROPHY_G.has(r.g)).length, "🏆 重赏徽章胜数一致");
ok(src.filter(r => typeof r.p === "string").length === RUNS.filter(r => typeof r.p === "string").length, "未完走（字符串着顺）条数一致 = " + RUNS.filter(r => typeof r.p === "string").length);

/* ═══════════ [C] 页面冒烟（stub DOM + 真实产物；期望值从源数据独立重算） ═══════════ */
/* ---- 最小 DOM stub ---- */
const els = {};
function el(id) {
  return {
    id, _html: "", text: "", attrs: {}, handlers: {}, value: "", style: {},
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    set textContent(v) { this.text = String(v); }, get textContent() { return this.text; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    closest() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; },
  };
}
global.document = {
  _handlers: {},
  getElementById(id) { return els[id] || (els[id] = el(id)); },
  querySelectorAll() { return []; },
  addEventListener(t, f) { (this._handlers[t] = this._handlers[t] || []).push(f); },
};
global.window = global;
global.YJ = { i18n: {
  t(k) { return ({ "日付":"日期", "馬名":"马名", "レース名":"赛事", "場名":"场地", "距離":"距离", "芝ダ":"跑道", "着順":"着顺", "賞金":"赏金", "馬場":"马场", "斤量":"负磅", "人気":"人气", "タイム":"时间", "馬体重":"马体重", "騎手":"骑手", "調教師":"调教师" })[k] || k; },
  e(k, v) { return ({ 芝:"草地", ダ:"泥地", 障害:"障碍", AW:"全天候" })[v] || v; },
} };
global.YJ_DATA = { url(p) { return "data/" + p; } };
/* 页面已把「比赛行/徽章渲染」下沉到共享模块 front/public/race-rows.js（与比赛页同一份代码，
 * 见 UI优化记录 §42）；§48 后页面还依赖 yj-util.js 的 YJ.util.esc（页内薄别名）。
 * 浏览器里它们先于页面脚本加载，stub 环境须保持同样顺序（yj-util → race-rows），
 * 否则页面脚本取不到 YJ.raceRows / YJ.util。 */
eval(fs.readFileSync(path.join(ROOT, "front", "public", "yj-util.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "front", "public", "race-rows.js"), "utf8"));
global.fetch = function (url) {
  const txt = fs.readFileSync(path.join(ROOT, String(url)), "utf8");
  return Promise.resolve({ ok: true, json() { return Promise.resolve(JSON.parse(txt)); } });
};

eval(code);   /* 执行页面脚本（strict eval 作用域隔离，仅驱动 stub DOM） */

/* 源数据独立聚合工具（全部从 src 算，不读产物；VT 镜像页面 st.vts 场地范围） */
let VT = new Set(["中央"]);                       // 页面默认只统计 JRA（中央）
const scope = arr => arr.filter(r => VT.has(r.vt));
const pad2 = x => (x < 10 ? "0" + x : "" + x);
const sMonth = ym => scope(src.filter(r => r.d.slice(0, 7) === ym));
const sYear = y => scope(src.filter(r => r.d.slice(0, 4) === String(y)));
const sDay = ds => scope(src.filter(r => r.d === ds));
function isoWeek(ds) {   /* 与页面同法的独立实现 */
  const dt = new Date(ds + "T00:00:00");
  let d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const isoY = d.getUTCFullYear();
  let f = new Date(Date.UTC(isoY, 0, 4));
  f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7) + 3);
  return { y: isoY, w: 1 + Math.round((d - f) / 604800000) };
}
const sWeek = (y, w) => scope(src.filter(r => { const q = isoWeek(r.d); return q.y === y && q.w === w; }));
const man = pr => {                                     /* 同页面 manYen：≥1亿 转「x亿x万」 */
  if (!pr) return "";
  if (pr >= 1e8){
    const oku = Math.floor(pr / 1e8), m = Math.floor((pr % 1e8) / 10000);
    return oku + "亿" + (m ? m.toLocaleString() + "万" : "");
  }
  return Math.round(pr / 10000).toLocaleString() + "万";
};
const kpiOf = (label, khtml) => {
  const m = String(khtml).match(new RegExp('k">' + label + '</div><div class="v(?: hi| dim)?">([\\s\\S]*?)</div>'));
  return m ? m[1] : null;
};
/* 未出走（取消/除外）＝未出闸：不计出走、不进通算战绩 4 段、不计赏金/胜场
 * （与 datechart.html statsOf、stats.html starts()、races.html 模块 34 同口径） */
const NR_SET = new Set(["取消", "除外"]);
const starts = arr => arr.filter(r => !NR_SET.has(String(r.p)));
const slot4 = p => (typeof p === "number" ? (p >= 1 && p <= 3 ? p - 1 : 3) : 3);
const br4 = arr => { const b = [0, 0, 0, 0]; starts(arr).forEach(r => b[slot4(r.p)]++); return b; };
const winsOf = arr => starts(arr).filter(r => r.p === 1).length;
const trophyOf = arr => starts(arr).filter(r => r.p === 1 && TROPHY_G.has(r.g)).length;
const prizeOf = arr => starts(arr).reduce((a, r) => a + r.pr, 0);
const seg = ev => els["seg"].handlers.click[0].call(els["seg"], { target: { closest: () => ({ getAttribute: () => ev }) } });
const vseg = ev => els["vseg"].handlers.click[0].call(els["vseg"], { target: { closest: () => ({ getAttribute: () => ev, setAttribute: (k, v) => {} }) } });
const dpTrigger = () => els["dpTrigger"].handlers.click[0].call(els["dpTrigger"]);
const dpClick = attr => els["dpPanel"].handlers.click[0].call(els["dpPanel"], { target: { closest: sel => sel === "[" + attr.name + "]" ? { getAttribute: () => attr.v } : null } });
const calClick = attr => els["cal"].handlers.click[0].call(els["cal"], {
  target: { closest: sel => sel === "[" + attr.name + "]" ? { getAttribute: () => attr.v } : null }
});
const weekdayCn = ds => "日一二三四五六"[new Date(ds + "T00:00:00").getDay()];

setTimeout(function () {   /* 等 fetch promise 链走完 */
  console.log("[C1] 初始加载（锚点 = 最新一着日 → 月口径 · 默认只统计 JRA）");
  const lastWin = scope(src.filter(r => r.p === 1)).reduce((a, r) => (!a || r.d > a.d ? r : a), null);
  const ay = +lastWin.d.slice(0, 4), am = +lastWin.d.slice(5, 7);
  const ym = ay + "-" + pad2(am);
  const sm = sMonth(ym);
  ok(els["winLabel"].textContent === ay + "年" + am + "月", "窗口标签 → " + els["winLabel"].textContent + "（即选择器触发标签）");
  ok(kpiOf("出走", els["kpis"]._html) === String(starts(sm).length), "KPI 出走 " + starts(sm).length + "（仅 JRA，剔除未出走，与源数据一致）");
  ok(String(kpiOf("总赏金", els["kpis"]._html)) === man(prizeOf(sm)), "KPI 总赏金 " + man(prizeOf(sm)));
  ok(String(kpiOf("重赏胜利", els["kpis"]._html)) === '<span class="trophy">🏆</span>' + trophyOf(sm), "KPI 重赏胜利 🏆" + trophyOf(sm));
  ok(String(kpiOf("通算战绩", els["kpis"]._html) || "").replace(/<[^>]+>/g, "") === "[" + br4(sm).join("-") + "]",
    "KPI 通算战绩 4 段 [" + br4(sm).join("-") + "]（标签剥离后逐段比对：格式保留 - 连字符）");
  const brkHtml = String(kpiOf("通算战绩", els["kpis"]._html) || "");
  ok(brkHtml.includes("#FEED88") && brkHtml.includes("#CCDFFD") && brkHtml.includes("#ECC6A2") && brkHtml.includes("#ececec")
    && /<i[^>]*>-<\/i>/.test(brkHtml) && brkHtml.includes("linear-gradient") && !brkHtml.includes("#0aa7a0"),
    "通算战绩 = [1-1-1-1] 格式（含 - 连字符）+ 1/2/3 浅色做底（#FEED88/#CCDFFD/#ECC6A2）+ 着外浅灰，连字符带渐变接缝使底色连成一整条");
  ok(man(1150345000) === "11亿5,034万" && man(1e8) === "1亿" && man(25140000) === "2,514万" && man(99990000) === "9,999万" && man(0) === "",
    "manYen 亿转换：11亿5,034万 / 1亿 / 2,514万 / 9,999万 / 空");
  const winDays = new Set(sm.filter(r => r.p === 1).map(r => r.d)).size;
  const runDays = new Set(starts(sm).map(r => r.d)).size;
  ok((String(els["cal"]._html).match(/class="dc-cell win/g) || []).length === winDays, "日历有胜格 " + winDays);
  ok((String(els["cal"]._html).match(/class="dc-cell run/g) || []).length === runDays - winDays, "日历有出走无胜格 " + (runDays - winDays));
  ok(els["navPrev"] && !els["navPrev"].disabled && els["navNext"].disabled, "锚点月=数据末月：‹ 可用 › 禁用");
  ok(/明细 · \d{4}年\d+月 · \d+ 条/.test(els["dTitle"]._html), "明细标题带记录条数（单位「条」，与 KPI 出走区分）");

  console.log("[C2] 内嵌比赛表同款明细（PC 14 列 = 基准字段子集，列序随基准 + mb 软分行卡片）");
  const pcHtml = String(els["dBody"]._html).split('md:hidden')[0] || "";
  /* 字段基准（§53.5）= 比赛记录页跨马主表 21 列；明细 = 隐藏 天候/枠番/馬番/頭数/着差/上り/賠率 后的 14 列，
   * 且列序必须与基准一致（馬名首列、跑道并入距离、马体重在赏金前） */
  const ths = (pcHtml.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [])
    .map(h => h.replace(/<[^>]+>/g, "").replace(/⇄/g, "").trim());   /* 馬名列头含 ⇄ 切换按钮 → 取纯文案 */
  /* 期望列序用 stub 自己的 i18n 生成（断言的是**顺序与字段集**，不重复断言翻译文案本身） */
  const EXPECT_TH = ["馬名", "日付", "場名", "レース名", "距離", "馬場", "斤量", "人気", "着順", "タイム", "馬体重", "賞金", "騎手", "調教師"]
    .map(k => k === "賞金" ? YJ.i18n.t(k) + "(万円)" : YJ.i18n.t(k));
  ok(ths.length === 14, "PC 表头 14 列（基准 21 列 − 隐藏 7 列）");
  ok(JSON.stringify(ths) === JSON.stringify(EXPECT_TH), "列序随基准：" + ths.join("|"));
  ok(ths.indexOf("跑道") < 0 && /(草|泥|障|AW)\d{3,4}/.test(pcHtml), "跑道并入距离列（无独立跑道列，值如 草1800）");
  ok(pcHtml.includes(">日期<") && pcHtml.includes(">调教师<") && pcHtml.includes("赏金(万元)") === false && pcHtml.includes("赏金(万円)"), "表头走 i18n（日期/调教师/賞金(万円)；马名列表头是切换按钮，见下）");
  ok(pcHtml.includes("hjump") && pcHtml.includes("profile.html?horse="), "出走马列跳档案链接");
  /* 明细走共享模块 race-rows.js：人气 1/2/3 必须是「与着顺同款徽章」（yj-no yj-nk*），
   * 与比赛页内嵌表同源；窗口内无 1/2/3 人气时不假通过，而是断言确实没有彩色徽章 */
  const nkChipCnt = (pcHtml.match(/yj-no yj-nk[123]/g) || []).length;
  const nk123InWin = sMonth(ym).filter(r => r.nk === 1 || r.nk === 2 || r.nk === 3).length;
  ok(nk123InWin > 0 ? nkChipCnt > 0 : nkChipCnt === 0,
    "人气 1/2/3 = 与着顺同款徽章（yj-no yj-nk*）：徽章 " + nkChipCnt + " 处 / 窗口内 1-3 人气 " + nk123InWin + " 匹次");
  ok(els["dBody"]._html.includes("yj-mb") && els["dBody"]._html.includes("yj-mb-line"), "mb 软分行卡片（yj-mb*）");
  ok(els["dBody"]._html.includes("騎手") === false && els["dBody"]._html.includes("骑手："), "mb 卡 label：value 中文标签（骑手：）");
  ok(/\d+\(\+\d+\)|\d+\(-\d+\)/.test(String(els["dBody"]._html)), "马体重合并 500(+2) 格式存在");

  /* 马名语言切换（§53.7）：PC 列头是 .yj-name-toggle 按钮；点击后「马名」列文本在
   * 日文名（h）↔ 中文名（hc）之间切换；无中文名的马回退日文名（不显示 #id） */
  const horseCol = r => {
    const m = String(r).match(/<a class="hjump"[^>]*>([^<]*)<\/a>/);
    return m ? m[1] : null;
  };
  const withHc = sMonth(ym).filter(r => (RUNS.find(x => x.d === r.d && x.id === r.id) || {}).hc);
  const hcRow = withHc[0];
  const hcName = hcRow ? RUNS.find(x => x.d === hcRow.d && x.id === hcRow.id).hc : "";
  const jpName = hcRow ? RUNS.find(x => x.d === hcRow.d && x.id === hcRow.id).h : "";

  /* [C2.1] 切换**前**：馬名列显示日文名 */
  ok(hcRow && String(els["dBody"]._html).includes(">" + esc(jpName) + "</a>"), "切换前馬名列 = 日文名（" + jpName + "）");
  ok(String(els["dBody"]._html).includes("yj-name-toggle"), "PC 列头/明细标题存在马名切换按钮（yj-name-toggle）");
  ok(/<th[^>]*><button type="button" class="yj-name-toggle"/.test(pcHtml), "PC「马名」列头即切换按钮");
  /* [C2.2] 点击切换 → 明细重渲染，馬名列变中文名 */
  const tgl = document._handlers.click.find(f => String(f).indexOf("yj-name-toggle") >= 0);
  ok(!!tgl, "页面挂了 .yj-name-toggle 的点击委托");
  if (tgl) {
    tgl.call(document, { target: { closest: sel => sel === ".yj-name-toggle" ? {} : null } });
    const pcAfter = String(els["dBody"]._html).split('md:hidden')[0] || "";
    ok(hcName && pcAfter.includes(">" + esc(hcName) + "</a>"), "切换后馬名列 = 中文名（" + hcName + "）");
    ok(!pcAfter.includes(">" + esc(jpName) + "</a>"), "切换后不再显示原日文名");
    /* [C2.3] 再点一次切回日文名（幂等往返） */
    tgl.call(document, { target: { closest: sel => sel === ".yj-name-toggle" ? {} : null } });
    const pcBack = String(els["dBody"]._html).split('md:hidden')[0] || "";
    ok(pcBack.includes(">" + esc(jpName) + "</a>"), "再点一次切回日文名");
    /* [C2.4] 无中文名的马：回退日文名，不出现 #id */
    ok(!/#\d+<\/a>/.test(pcBack), "无中文名的马回退日文名（不显示 #id）");
  }

  console.log("[C3] 场地范围 JRA/NAR/海外（多选，默认 JRA；最后一个不关）");
  const kpiRuns = () => kpiOf("出走", els["kpis"]._html);
  const baseRuns = +kpiRuns();
  ok(baseRuns === starts(sm).length, "初始 KPI 出走 = JRA 场数 " + baseRuns);
  const nar = starts(src.filter(r => r.vt === "地方" && r.d.slice(0, 7) === ym)).length;
  const ovs = starts(src.filter(r => r.vt === "海外" && r.d.slice(0, 7) === ym)).length;
  vseg("中央");   /* 只剩中央时点关 → 不生效 */
  ok(+kpiRuns() === baseRuns && VT.has("中央"), "唯一启用项不可关闭（JRA 保持）");
  vseg("地方"); VT.add("地方");
  ok(+kpiRuns() === starts(sm).length + nar, "+NAR → 出走 " + (starts(sm).length + nar) + "（中央+地方）");
  vseg("海外"); VT.add("海外");
  ok(+kpiRuns() === starts(sm).length + nar + ovs, "+海外 → 出走 " + (starts(sm).length + nar + ovs) + "（全部场地）");
  ok(nar > 0 && ovs >= 0, "锚点月地方场 " + nar + " 条 / 海外 " + ovs + " 条（数据形态核对）");
  vseg("海外"); VT.delete("海外");
  vseg("地方"); VT.delete("地方");
  ok(+kpiRuns() === baseRuns, "回退默认 JRA → 出走 " + baseRuns);

  console.log("[C4] 日期选择器（Element 风格，随口径出 日/周/月/年 面板）");
  /* 月口径 → 月面板 */
  dpTrigger();
  ok(els["dpPanel"].hidden === false, "打开面板（月口径 → 12 月格）");
  ok((String(els["dpPanel"]._html).match(/data-mi=/g) || []).length === 12, "面板 12 个月格");
  ok(String(els["dpPanel"]._html).includes("dc-dp-cell dis"), "范围外月份禁用（dis）");
  dpClick({ name: "data-mi", v: "8" });
  ok(els["winLabel"].textContent === "2026年8月", "点「8月」→ " + els["winLabel"].textContent);
  ok(els["dpPanel"].hidden === true, "选中后面板关闭");
  /* 天口径 → 日历面板 */
  seg("day");
  dpTrigger();
  ok((String(els["dpPanel"]._html).match(/data-d=/g) || []).length === 31, "日面板出 2026-08 网格（31 天）");
  dpClick({ name: "data-nav", v: "nm" });
  const lastD = RUNS[RUNS.length - 1].d;   // 数据末日从产物推导（此前硬编码 9/12，数据更新到 9/13 即过期）
  const nextD = new Date(Date.parse(lastD) + 86400000).toISOString().slice(0, 10);
  // 类顺序无关匹配：末日次日若恰为「今天」会是 class="dc-dp-cell today dis"（2026-09-16 实测踩坑），不能硬编码子串
  const disRe = new RegExp('class="dc-dp-cell[^"]*\\bdis\\b[^"]*"[^>]*data-d="' + nextD + '"');
  ok(disRe.test(String(els["dpPanel"]._html)), "数据末日（" + lastD.slice(5) + "）之后禁用");
  dpClick({ name: "data-nav", v: "pm" });
  dpClick({ name: "data-d", v: "2026-08-09" });
  ok(els["winLabel"].textContent === "2026/08/09（" + weekdayCn("2026-08-09") + "）", "点 8/9 → " + els["winLabel"].textContent);
  const sd = sDay("2026-08-09");
  ok(+kpiRuns() === starts(sd).length, "天 KPI 出走 " + starts(sd).length + "（J·GIII 胜日）");
  ok(String(kpiOf("重赏胜利", els["kpis"]._html)) === '<span class="trophy">🏆</span>' + trophyOf(sd), "天 KPI 重赏胜利 🏆" + trophyOf(sd) + "（G1-3/Jpn1-3 口径）");
  /* 周口径 → 带周号日历面板 */
  seg("week");
  dpTrigger();
  ok((String(els["dpPanel"]._html).match(/data-w=/g) || []).length >= 5, "周面板出周号列");
  ok(String(els["dpPanel"]._html).includes("dc-dp-wrow hl"), "当前周行高亮 hl");
  dpClick({ name: "data-w", v: "2026-08-06" });
  const iw831 = isoWeek("2026-08-06");
  const sw831 = sWeek(iw831.y, iw831.w);
  ok(els["winLabel"].textContent === iw831.y + "年 第" + iw831.w + "週（8/3–8/9）", "点第 " + iw831.w + " 周行 → " + els["winLabel"].textContent);
  ok(+kpiRuns() === starts(sw831).length, "周 KPI 出走 " + starts(sw831).length + "（与源一致）");
  /* 周面板翻周：‹ › = ±7 天（跨月连续翻），« » = 翻月；翻页只改浏览态、面板保持打开 */
  dpTrigger();
  dpClick({ name: "data-nav", v: "nw" });
  ok(els["dpPanel"].hidden === false, "周面板翻页后面板保持打开（修复 innerHTML detachment 误关闭）");
  dpClick({ name: "data-nav", v: "nw" });
  dpClick({ name: "data-nav", v: "nw" });
  ok(String(els["dpPanel"]._html).includes("2026年 8月"), "‹› 翻 3 周到 8/27 仍在 8月");
  dpClick({ name: "data-nav", v: "nw" });
  ok(String(els["dpPanel"]._html).includes("2026年 9月"), "翻第 4 周（9/3）跨月 → 2026年 9月 网格");
  ok(els["winLabel"].textContent === iw831.y + "年 第" + iw831.w + "週（8/3–8/9）", "翻周只改浏览态，锚点不动");
  dpClick({ name: "data-nav", v: "pw" });
  dpClick({ name: "data-nav", v: "pw" });
  dpClick({ name: "data-nav", v: "pw" });
  dpClick({ name: "data-nav", v: "pw" });
  ok(String(els["dpPanel"]._html).includes("2026年 8月"), "‹ 翻回 8月");
  dpClick({ name: "data-w", v: "2026-08-13" });
  const iw810 = isoWeek("2026-08-13");
  const sw810 = sWeek(iw810.y, iw810.w);
  ok(els["winLabel"].textContent === iw810.y + "年 第" + iw810.w + "週（8/10–8/16）", "选翻到的周 → " + els["winLabel"].textContent);
  ok(+kpiRuns() === starts(sw810).length, "W" + iw810.w + " KPI 出走 " + starts(sw810).length + "（与源一致）");
  /* 年口径 → 十年面板 */
  seg("year");
  dpTrigger();
  ok((String(els["dpPanel"]._html).match(/data-y=/g) || []).length === 10, "年面板 10 个年份");
  ok(String(els["dpPanel"]._html).includes("dc-dp-cell dis"), "范围外年份禁用（2024 及以前 dis）");
  dpClick({ name: "data-y", v: "2025" });
  ok(els["winLabel"].textContent === "2025年", "点 2025 → " + els["winLabel"].textContent);
  const sy25 = sYear(2025);
  ok(+kpiRuns() === starts(sy25).length, "2025 年 KPI 出走 " + starts(sy25).length + "（JRA）");
  /* 面板浏览不改锚点 + 选中落锚 + 回最新 */
  seg("month");
  dpTrigger();
  ok(String(els["dpPanel"]._html).includes("2025年"), "面板浏览态 = 2025年（锚点年）");
  ok(els["winLabel"].textContent === "2025年1月", "打开面板不改锚点（窗口仍 2025年1月）");
  dpClick({ name: "data-mi", v: "7" });
  ok(els["winLabel"].textContent === "2025年7月", "选 2025年7月 → " + els["winLabel"].textContent);
  dpTrigger();
  dpClick({ name: "data-latest", v: "1" });
  ok(els["winLabel"].textContent === "2026年9月", "「回最新」→ " + els["winLabel"].textContent + "（数据末月）");

  console.log("[C5] 点格下钻 + ‹ › 步进（含空日归零）");
  const dayInCur = [...new Set(sMonth("2026-09").map(r => r.d))].sort()[0];
  calClick({ name: "data-d", v: dayInCur });
  ok(els["winLabel"].textContent === dayInCur.replace(/-/g, "/") + "（" + weekdayCn(dayInCur) + "）", "点格 → " + els["winLabel"].textContent);
  els["navPrev"].handlers.click[0]();
  const prevDs = els["winLabel"].textContent.slice(0, 10).replace(/\//g, "-");
  ok(+kpiRuns() === sDay(prevDs).length, "‹ 步进日 KPI 与源一致（" + prevDs + (sDay(prevDs).length ? "" : " 空日") + "）");
  if (sDay(prevDs).length === 0) ok(els["kpis"]._html.includes(">—<"), "空日 KPI 赏金 —");
  els["navNext"].handlers.click[0]();
  ok(els["winLabel"].textContent === dayInCur.replace(/-/g, "/") + "（" + weekdayCn(dayInCur) + "）", "› 回到原日");

  console.log("[C6] 周口径（ISO 週 + 行高亮 + 跨月周补真实邻月日）");
  seg("week");
  const iw = isoWeek(dayInCur);
  const sw = sWeek(iw.y, iw.w);
  ok(/第\d+週（\d+\/\d+–\d+\/\d+）/.test(els["winLabel"].textContent), "窗口标签 → " + els["winLabel"].textContent);
  ok((String(els["cal"]._html).match(/dc-wrow hl/g) || []).length === 1, "所在周行高亮 ×1");
  ok(+kpiRuns() === starts(sw).length, "周 KPI 出走 " + starts(sw).length + "（与源 ISO 週聚合一致）");
  /* 高亮行提取：行内只有 button/span（无嵌套 div）→ 首个 </div> 即行尾 */
  const rowOf = tag => { const h = String(els["cal"]._html), i = h.indexOf(tag); return i < 0 ? "" : h.slice(i + tag.length).split("</div>")[0]; };
  const rowDs = h => [...String(h).matchAll(/data-d="(\d{4}-\d{2}-\d{2})"/g)].map(x => x[1]);
  const cellOf = (h, ds) => (String(h).match(new RegExp('<button[^>]*data-d="' + ds + '"[\\s\\S]*?</button>')) || [""])[0];
  ok(!/"dc-cell dc-out"/.test(String(els["cal"]._html)), "空白补位格（dc-out）已废除，网格每格都是可点的真实日期");
  const mon = new Date(dayInCur + "T00:00:00");
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));                 /* 独立回推到周一 */
  const wantDs = [];
  for (let k = 0; k < 7; k++){ const t = new Date(mon); t.setDate(mon.getDate() + k);
    wantDs.push(t.getFullYear() + "-" + pad2(t.getMonth() + 1) + "-" + pad2(t.getDate())); }
  ok(JSON.stringify(rowDs(rowOf('class="dc-wrow hl">'))) === JSON.stringify(wantDs),
    "高亮行 = 该 ISO 周完整 7 日（含跨月日 " + wantDs.filter(x => x.slice(0, 7) !== dayInCur.slice(0, 7)).join(",") + "）");
  /* 复现用户报回场景：同一周把锚点放回 7 月 → 补位落在行尾，8/1·8/2 必须出数据
   * （2026-W31 JRA 出走 18 场全在这两天，补位若是空格则高亮行整行空白） */
  dpTrigger(); dpClick({ name: "data-nav", v: "pm" }); dpClick({ name: "data-nav", v: "pm" });
  dpClick({ name: "data-d", v: "2026-07-30" });
  ok(els["winLabel"].textContent === "2026年 第31週（7/27–8/2）", "锚点回 7 月同一周 → " + els["winLabel"].textContent);
  const r31 = rowOf('class="dc-wrow hl">');
  ok(JSON.stringify(rowDs(r31)) === JSON.stringify(["2026-07-27","2026-07-28","2026-07-29","2026-07-30","2026-07-31","2026-08-01","2026-08-02"]),
    "行尾补出 8/1·8/2（跨月周 7 日齐全）");
  const c801 = cellOf(r31, "2026-08-01"), c802 = cellOf(r31, "2026-08-02");
  ok(c801.startsWith('<button type="button" class="dc-cell dc-outm"'), "邻月格不套 win/run 底色（class 恰为 dc-cell dc-outm）");
  ok(c801.includes(">8/1<") && c802.includes(">8/2<"), "邻月格日期写成 M/D 以区分月份");
  ok(c801.replace(/<[^>]+>/g, "").includes("[" + br4(sDay("2026-08-01")).join("-") + "]") && c801.includes("dc-prz"),
    "邻月格带数据：8/1 进板数 [" + br4(sDay("2026-08-01")).join("-") + "] + 赏金 " + man(prizeOf(sDay("2026-08-01"))));
  ok(c802.replace(/<[^>]+>/g, "").includes("[" + br4(sDay("2026-08-02")).join("-") + "]"),
    "邻月格带数据：8/2 进板数 [" + br4(sDay("2026-08-02")).join("-") + "]");
  ok(+kpiRuns() === starts(sWeek(2026, 31)).length && starts(sWeek(2026, 31)).length ===
     starts(sDay("2026-08-01")).length + starts(sDay("2026-08-02")).length,
    "KPI 出走 " + starts(sWeek(2026, 31)).length + " 全部来自补位格（修复前高亮行整行无数据）");

  console.log("[C7] 年口径（12 月卡 + 下钻）与未完走降灰");
  seg("year");
  const sy = sYear(ay);
  ok(els["winLabel"].textContent === ay + "年", "窗口标签 → " + els["winLabel"].textContent);
  ok((String(els["cal"]._html).match(/class="dc-ym( zero)?"/g) || []).length === 12, "12 个月卡");
  ok(+kpiRuns() === starts(sy).length, "年 KPI 出走 " + starts(sy).length);
  ok(String(kpiOf("通算战绩", els["kpis"]._html) || "").replace(/<[^>]+>/g, "") === "[" + br4(sy).join("-") + "]", "年通算战绩 4 段 [" + br4(sy).join("-") + "]（格式保留 - 连字符）");
  ok(br4(sy).reduce((a, b) => a + b, 0) === starts(sy).length,
    "未出走(取消/除外)不计通算：4 段之和 " + starts(sy).length + " == 出走（剔除未出走）" + starts(sy).length);
  const dnfAll = src.filter(r => typeof r.p === "string");
  const nrAll = src.filter(r => NR_SET.has(String(r.p)));
  ok(dnfAll.length > 0, "源数据含未完走/未出走 " + dnfAll.length + " 条（中止/失格 " + (dnfAll.length - nrAll.length) + " · 取消/除外 " + nrAll.length + "）");
  const dnf = dnfAll.find(r => +r.d.slice(0, 4) === ay) || dnfAll[0];
  calClick({ name: "data-m", v: String(+dnf.d.slice(5, 7)) });
  ok(els["winLabel"].textContent === dnf.d.slice(0, 4) + "年" + (+dnf.d.slice(5, 7)) + "月", "年卡下钻 → " + els["winLabel"].textContent);
  const sdm = sMonth(dnf.d.slice(0, 7));
  ok(+kpiRuns() === starts(sdm).length, "月 KPI 出走 " + starts(sdm).length + "（" + dnf.d.slice(0, 7) + "）");
  ok(String(els["dBody"]._html).includes("yj-mb dnf") || String(els["dBody"]._html).includes("text-muted-foreground"), "未完走降灰（mb 卡 dnf / PC 行 muted）（" + dnf.d + " " + dnf.p + "）");
  ok(String(els["dBody"]._html).includes(">" + esc(dnf.p) + "<"), "未完走着顺灰字展示（" + dnf.p + "）");

  console.log("[C8] 马名口径收口（§64）· 生产国尾缀不展示 + 无登録名兜底「母名の生年」");
  const SUF_RE = /[（(](JPN|USA|GB|IRE|NZ|AUS|AU|FR|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK|SGP|UAE|NZL)[）)]$/;
  const sufH = basic.horses.filter(h => SUF_RE.test(String(h["馬名"] || "")));
  ok(sufH.length > 0 && sufH.every(h => !SUF_RE.test(YJ.util.mainName(h))),
    "单一出处 YJ.util.mainName：全库带生产国尾缀 " + sufH.length + " 匹（" +
    sufH.map(h => h.id + " " + h["馬名"] + " → " + YJ.util.mainName(h)).join("、") + "）全部剥净");
  const nlH = basic.horses.filter(h => !h["馬名"] && !h["欧字馬名"]);
  ok(nlH.length > 0 && nlH.every(h => YJ.util.fallbackName(h) === h["母名"] + "の" + h["生年"]),
    "无 馬名/欧字名 " + nlH.length + " 匹兜底 =「母名の生年」（" +
    nlH.slice(0, 2).map(h => h.id + "=" + YJ.util.fallbackName(h)).join("、") + " 等），不再降级成 #id");
  ok(YJ.util.fallbackName({ id: 999 }) === "#999", "母名也缺才退化 #id（兜底的兜底）");
  /* 页面接线：明细马名列取自产物 runs[].h（= 后端直取的基本信息 馬名 原值，130 带尾缀） */
  VT.add("海外"); vseg("海外");
  dpTrigger(); dpClick({ name: "data-mi", v: "8" });
  const gwHtml = String(els["dBody"]._html);
  ok(gwHtml.includes(">Grand Warrior<") && !gwHtml.includes("Grand Warrior(JPN)"),
    "日期统计明细 2026年8月（含海外）马名列 = Grand Warrior（尾缀已剥）");
  VT.delete("海外"); vseg("海外");

  console.log((fails ? "FAILED: " + fails : "ALL PASS") + "（" + (passes + fails) + " assertions）");
  process.exit(fails ? 1 : 0);
}, 30);

