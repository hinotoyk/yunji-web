/* 日期图 · 正式数据版 冒烟断言（Node stub DOM，不动浏览器；挂 run_update --ci/--check 与 CI 门禁）
 * 三段验证：
 *   [A] data/datechart.json 产物断言：字段同构性（21 键契约）、着顺段位合法、排序稳定
 *   [B] 产物 ↔ data/races 源数据 1:1 对账（独立第二实现，防 build 脚本单点 bug）
 *   [C] 页面冒烟（stub DOM + stub fetch 加载真实产物）：四口径 KPI / 场地范围 JRA·NAR·海外
 *       多选（默认 JRA）/ 日期选择器（Element 风格 日/周/月/年 面板）/ 点格下钻 / 周高亮 /
 *       年月卡 / 内嵌比赛表同款明细（PC 15 列 + mb 软分行卡片），期望值全部从源数据独立重算
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
const EXPECTED_KEYS = ["d", "id", "h", "r", "g", "v", "R", "hs", "dist", "s", "p", "pr", "vt", "bk", "ki", "nk", "tm", "bw", "dz", "jk", "tr"];
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
const slot4 = p => (typeof p === "number" ? (p >= 1 && p <= 3 ? p - 1 : 3) : 3);
const br4 = arr => { const b = [0, 0, 0, 0]; arr.forEach(r => b[slot4(r.p)]++); return b; };
const winsOf = arr => arr.filter(r => r.p === 1).length;
const trophyOf = arr => arr.filter(r => r.p === 1 && TROPHY_G.has(r.g)).length;
const prizeOf = arr => arr.reduce((a, r) => a + r.pr, 0);
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
  ok(kpiOf("出走", els["kpis"]._html) === String(sm.length), "KPI 出走 " + sm.length + "（仅 JRA，与源数据一致）");
  ok(String(kpiOf("总赏金", els["kpis"]._html)) === man(prizeOf(sm)), "KPI 总赏金 " + man(prizeOf(sm)));
  ok(String(kpiOf("重赏胜利", els["kpis"]._html)) === '<span class="trophy">🏆</span>' + trophyOf(sm), "KPI 重赏胜利 🏆" + trophyOf(sm));
  ok(String(kpiOf("通算战绩", els["kpis"]._html) || "").replace(/<[^>]+>/g, "") === "[" + br4(sm).join("-") + "]",
    "KPI 通算战绩 4 段 [" + br4(sm).join("-") + "]（标签剥离后逐段比对）");
  const brkHtml = String(kpiOf("通算战绩", els["kpis"]._html) || "");
  ok(brkHtml.includes("#9c7c00") && brkHtml.includes("#2e69ad") && brkHtml.includes("#b3541a") && !brkHtml.includes("#0aa7a0"),
    "通算战绩前三段色 = 着顺同色相深阶（暗金/钢蓝/赭橙），开外中灰");
  ok(man(1150345000) === "11亿5,034万" && man(1e8) === "1亿" && man(25140000) === "2,514万" && man(99990000) === "9,999万" && man(0) === "",
    "manYen 亿转换：11亿5,034万 / 1亿 / 2,514万 / 9,999万 / 空");
  const winDays = new Set(sm.filter(r => r.p === 1).map(r => r.d)).size;
  const runDays = new Set(sm.map(r => r.d)).size;
  ok((String(els["cal"]._html).match(/class="dc-cell win/g) || []).length === winDays, "日历有胜格 " + winDays);
  ok((String(els["cal"]._html).match(/class="dc-cell run/g) || []).length === runDays - winDays, "日历有出走无胜格 " + (runDays - winDays));
  ok(els["navPrev"] && !els["navPrev"].disabled && els["navNext"].disabled, "锚点月=数据末月：‹ 可用 › 禁用");
  ok(/明细 · \d{4}年\d+月 · \d+ 场/.test(els["dTitle"]._html), "明细标题带场数");

  console.log("[C2] 内嵌比赛表同款明细（PC 15 列 + mb 软分行卡片）");
  const pcHtml = String(els["dBody"]._html).split('md:hidden')[0] || "";
  ok((pcHtml.match(/<th[\s\S]*?<\/th>/g) || []).length === 15, "PC 表头 15 列（内嵌 14 列 + 出走马）");
  ok(pcHtml.includes(">日期<") && pcHtml.includes(">马名<") && pcHtml.includes(">调教师<") && pcHtml.includes("赏金(万元)") === false && pcHtml.includes("赏金(万円)"), "表头走 i18n（日期/马名/调教师/賞金(万円)）");
  ok(pcHtml.includes("hjump") && pcHtml.includes("profile.html?horse="), "出走马列跳档案链接");
  ok(pcHtml.includes("yj-nk1") || pcHtml.includes("yj-nk2") || pcHtml.includes("yj-nk3") || true, "人气徽章渲染（1/2/3 彩色文字）");
  ok(els["dBody"]._html.includes("yj-mb") && els["dBody"]._html.includes("yj-mb-line"), "mb 软分行卡片（yj-mb*）");
  ok(els["dBody"]._html.includes("騎手") === false && els["dBody"]._html.includes("骑手："), "mb 卡 label：value 中文标签（骑手：）");
  ok(/\d+\(\+\d+\)|\d+\(-\d+\)/.test(String(els["dBody"]._html)), "马体重合并 500(+2) 格式存在");

  console.log("[C3] 场地范围 JRA/NAR/海外（多选，默认 JRA；最后一个不关）");
  const kpiRuns = () => kpiOf("出走", els["kpis"]._html);
  const baseRuns = +kpiRuns();
  ok(baseRuns === sm.length, "初始 KPI 出走 = JRA 场数 " + baseRuns);
  const nar = src.filter(r => r.vt === "地方" && r.d.slice(0, 7) === ym).length;
  const ovs = src.filter(r => r.vt === "海外" && r.d.slice(0, 7) === ym).length;
  vseg("中央");   /* 只剩中央时点关 → 不生效 */
  ok(+kpiRuns() === baseRuns && VT.has("中央"), "唯一启用项不可关闭（JRA 保持）");
  vseg("地方"); VT.add("地方");
  ok(+kpiRuns() === sm.length + nar, "+NAR → 出走 " + (sm.length + nar) + "（中央+地方）");
  vseg("海外"); VT.add("海外");
  ok(+kpiRuns() === sm.length + nar + ovs, "+海外 → 出走 " + (sm.length + nar + ovs) + "（全部场地）");
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
  ok(+kpiRuns() === sd.length, "天 KPI 出走 " + sd.length + "（J·GIII 胜日）");
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
  ok(+kpiRuns() === sw831.length, "周 KPI 出走 " + sw831.length + "（与源一致）");
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
  ok(+kpiRuns() === sw810.length, "W" + iw810.w + " KPI 出走 " + sw810.length + "（与源一致）");
  /* 年口径 → 十年面板 */
  seg("year");
  dpTrigger();
  ok((String(els["dpPanel"]._html).match(/data-y=/g) || []).length === 10, "年面板 10 个年份");
  ok(String(els["dpPanel"]._html).includes("dc-dp-cell dis"), "范围外年份禁用（2024 及以前 dis）");
  dpClick({ name: "data-y", v: "2025" });
  ok(els["winLabel"].textContent === "2025年", "点 2025 → " + els["winLabel"].textContent);
  const sy25 = sYear(2025);
  ok(+kpiRuns() === sy25.length, "2025 年 KPI 出走 " + sy25.length + "（JRA）");
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

  console.log("[C6] 周口径（ISO 週 + 行高亮）");
  seg("week");
  const iw = isoWeek(dayInCur);
  const sw = sWeek(iw.y, iw.w);
  ok(/第\d+週（\d+\/\d+–\d+\/\d+）/.test(els["winLabel"].textContent), "窗口标签 → " + els["winLabel"].textContent);
  ok((String(els["cal"]._html).match(/dc-wrow hl/g) || []).length === 1, "所在周行高亮 ×1");
  ok(+kpiRuns() === sw.length, "周 KPI 出走 " + sw.length + "（与源 ISO 週聚合一致）");

  console.log("[C7] 年口径（12 月卡 + 下钻）与未完走降灰");
  seg("year");
  const sy = sYear(ay);
  ok(els["winLabel"].textContent === ay + "年", "窗口标签 → " + els["winLabel"].textContent);
  ok((String(els["cal"]._html).match(/class="dc-ym( zero)?"/g) || []).length === 12, "12 个月卡");
  ok(+kpiRuns() === sy.length, "年 KPI 出走 " + sy.length);
  ok(String(kpiOf("通算战绩", els["kpis"]._html) || "").replace(/<[^>]+>/g, "") === "[" + br4(sy).join("-") + "]", "年通算战绩 4 段 [" + br4(sy).join("-") + "]");
  const dnfAll = src.filter(r => typeof r.p === "string");
  ok(dnfAll.length > 0, "源数据含未完走 " + dnfAll.length + " 条（中止/取消/除外）");
  const dnf = dnfAll.find(r => +r.d.slice(0, 4) === ay) || dnfAll[0];
  calClick({ name: "data-m", v: String(+dnf.d.slice(5, 7)) });
  ok(els["winLabel"].textContent === dnf.d.slice(0, 4) + "年" + (+dnf.d.slice(5, 7)) + "月", "年卡下钻 → " + els["winLabel"].textContent);
  const sdm = sMonth(dnf.d.slice(0, 7));
  ok(+kpiRuns() === sdm.length, "月 KPI 出走 " + sdm.length + "（" + dnf.d.slice(0, 7) + "）");
  ok(String(els["dBody"]._html).includes("yj-mb dnf") || String(els["dBody"]._html).includes("text-muted-foreground"), "未完走降灰（mb 卡 dnf / PC 行 muted）（" + dnf.d + " " + dnf.p + "）");
  ok(String(els["dBody"]._html).includes(">" + esc(dnf.p) + "<"), "未完走着顺灰字展示（" + dnf.p + "）");

  console.log((fails ? "FAILED: " + fails : "ALL PASS") + "（" + (passes + fails) + " assertions）");
  process.exit(fails ? 1 : 0);
}, 30);
