/* 日期图 · 日历布局稿 冒烟断言（Node stub DOM，不动浏览器）
 * 用法: node tests/_verify-datechart.cjs */
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "front", "pages", "datechart.html"), "utf8");
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");

/* ---- 最小 DOM stub ---- */
const els = {};
function el(id) {
  return {
    id, _html: "", text: "", attrs: {}, handlers: {},
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    set textContent(v) { this.text = String(v); }, get textContent() { return this.text; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    closest() { return null; },
    querySelectorAll() { return []; },
  };
}
global.document = { getElementById(id) { return els[id] || (els[id] = el(id)); }, querySelectorAll() { return []; } };
global.window = global;
global.YJ = { i18n: { t(k) { return ({ "日付":"日期", "馬名":"马名", "レース名":"赛事", "場名":"场地", "距離":"距离", "芝ダ":"跑道", "着順":"着顺", "賞金":"赏金" })[k] || k; } } };

let fails = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ok  " + msg); }
  else { fails++; console.log("  FAIL " + msg); }
}
const count = (s, re) => (String(s).match(re) || []).length;

eval(code);   /* 泄漏 st/RUNS/render/scopeRuns/statsOf/setMode 到本作用域 */

const seg = ev => els["seg"].handlers.click[0].call(els["seg"], { target: { closest: () => ({ getAttribute: () => ev }) } });
const calClick = attr => els["cal"].handlers.click[0].call(els["cal"], {
  target: { closest: sel => sel === "[" + attr.name + "]" ? { getAttribute: () => attr.v } : null }
});

console.log("[1] 初始（月口径 · 2026-09）");
ok(els["winLabel"].textContent === "2026年9月", "窗口标签 → " + els["winLabel"].textContent);
ok(/k">出走<\/div><div class="v">29<\/div>/.test(els["kpis"]._html), "KPI 出走 29");
ok(/k">胜<\/div><div class="v hi">2</.test(els["kpis"]._html), "KPI 胜 2（hi）");
ok(els["kpis"]._html.includes("总赏金") && els["kpis"]._html.includes("2,610万"), "KPI 总赏金 2,610万");
ok(/k">重赏胜<\/div><div class="v dim"><span class="trophy">🏆<\/span>0</.test(els["kpis"]._html), "KPI 重赏胜 0（dim）");
ok(count(els["cal"]._html, /class="dc-cell win/g) === 2, "有胜日格 2（9/5、9/6）");
ok(count(els["cal"]._html, /class="dc-cell run/g) === 6, "有出走无胜日格 6");
ok(count(els["cal"]._html, /class="dc-cell dc-out/g) === 5, "补位空格 5");
ok(els["cal"]._html.includes("[1-0-3-2-0-5]"), "9/5 格含进板数 [1-0-3-2-0-5]");
ok(count(els["cal"]._html, /🏆/g) === 0, "9 月无重赏胜 → 格内无 🏆");
ok(/明细 · 2026年9月 · 29 场/.test(els["dTitle"]._html), "明细标题");
ok(!els["navPrev"].disabled && els["navNext"].disabled, "9 月=数据末月：‹ 可用 › 禁用");

console.log("[2] 点格下钻 → 天口径 2026-09-05");
calClick({ name: "data-d", v: "2026-09-05" });
ok(els["winLabel"].textContent === "2026/09/05（六）", "窗口标签 → " + els["winLabel"].textContent);
ok(/<div class="v">11<\/div>/.test(els["kpis"]._html), "KPI 出走 11");
ok(els["dBody"]._html.includes("ヴェトロテンペスタ"), "9/5 明细含马名");
ok(els["cal"]._html.includes("dc-sel"), "日历选中高亮 dc-sel");

console.log("[2b] 切到 8/9（GIII 胜日）→ 🏆 标识");
calClick({ name: "data-d", v: "2026-08-09" });
ok(els["winLabel"].textContent === "2026/08/09（日）", "同口径点格直接切 → " + els["winLabel"].textContent);
ok(/<div class="v">12<\/div>/.test(els["kpis"]._html), "KPI 出走 12");
ok(/<div class="v hi">4<\/div>/.test(els["kpis"]._html), "KPI 胜 4");
ok(/v hi"><span class="trophy">🏆<\/span>1</.test(els["kpis"]._html), "KPI 重赏胜 🏆1（hi）");
ok(els["dBody"]._html.includes("レパードS") && els["dBody"]._html.includes("🏆") && els["dBody"]._html.includes("yj-g3") && els["dBody"]._html.includes(">G3<"), "明细：🏆+G3 徽章");
ok(els["dBody"]._html.includes("dc-grow"), "重赏胜行浅青底");
const lep = RUNS.find(r => r.r.includes("レパードS"));
ok(lep && els["dBody"]._html.includes(manYen(lep.pr)), "明细赏金 " + manYen(lep.pr));
calClick({ name: "data-d", v: "2026-09-05" });   /* 切回 9/5，后续步骤从 9/5 起步 */
ok(els["winLabel"].textContent === "2026/09/05（六）", "切回 9/5");

console.log("[3] 天口径 ‹ › 步进（含空日）");
els["navPrev"].handlers.click[0]();
ok(els["winLabel"].textContent === "2026/09/04（五）", "‹ → 9/4");
ok(/<div class="v dim">0<\/div>/.test(els["kpis"]._html) && els["kpis"]._html.includes("—"), "空日 KPI 归零 + 赏金 —");
els["navNext"].handlers.click[0]();
ok(els["winLabel"].textContent === "2026/09/05（六）", "› 回 9/5");
els["navNext"].handlers.click[0]();
ok(els["winLabel"].textContent === "2026/09/06（日）", "› → 9/6（2 着日）");
ok(/<div class="v">10<\/div>/.test(els["kpis"]._html), "9/6 出走 10");

console.log("[4] 周口径（ISO 週 + 行高亮）");
els["navPrev"].handlers.click[0]();   /* 9/6 → 9/5，回到 W36 锚点 */
seg("week");
ok(els["winLabel"].textContent === "2026年 第36週（8/31–9/6）", "窗口标签 → " + els["winLabel"].textContent);
ok(count(els["cal"]._html, /dc-wrow hl/g) === 1, "所在周行高亮");
ok(/k">出走<\/div><div class="v">25<\/div>/.test(els["kpis"]._html), "周 KPI 出走 25（8/31–9/6）");
ok(els["kpis"]._html.includes("2,552万"), "周 KPI 总赏金 2,552万");
ok(/明细 · 2026年 第36週（8\/31–9\/6） · 25 场/.test(els["dTitle"]._html), "周明细标题");

console.log("[5] 年口径（12 月卡）");
seg("year");
ok(els["winLabel"].textContent === "2026年", "窗口标签 → " + els["winLabel"].textContent);
ok(count(els["cal"]._html, /class="dc-ym( zero)?"/g) === 12, "12 个月卡");
ok(/k">出走<\/div><div class="v">165<\/div>/.test(els["kpis"]._html), "年 KPI 出走 165");
ok(/k">胜<\/div><div class="v hi">24</.test(els["kpis"]._html), "年 KPI 胜 24");
ok(/v hi"><span class="trophy">🏆<\/span>3</.test(els["kpis"]._html), "年 KPI 重赏胜 🏆3");
const s8 = statsOf(scopeRuns("month", "2026-08"));
const m8 = els["cal"]._html.split('data-m="8"')[1] || "";
ok(m8.includes("🏆1") && m8.includes(manYen(s8.pr)), "8月卡 🏆1 + " + manYen(s8.pr));
const s4 = statsOf(scopeRuns("month", "2026-04"));
const m4 = els["cal"]._html.split('data-m="4"')[1]?.split("data-m=")[0] || "";
ok(m4.includes(manYen(s4.pr)), "4月卡 " + manYen(s4.pr) + "（青葉賞 GII）");
ok(els["cal"]._html.includes("dc-ym zero"), "无出走月份置灰");

console.log("[6] 年卡点格下钻 → 月口径；未完走行");
calClick({ name: "data-m", v: "9" });
ok(els["winLabel"].textContent === "2026年9月" && count(els["cal"]._html, /class="dc-cell win/g) === 2, "下钻回 2026-09");
const dnf = RUNS.filter(r => typeof r.p === "string");
ok(dnf.length === 2, "样本含 2 条未完走");
if (dnf.length){
  const p = dnf[0].d.split("-");
  st.y = +p[0]; st.m = +p[1]; st.d = 1; st.mode = "month"; render();
  ok(els["dBody"]._html.includes("dc-dnf"), "未完走行降灰（" + dnf[0].d + "）");
  ok(dnf.every(r => els["dBody"]._html.includes(esc ? esc(r.p) : r.p)) || els["dBody"]._html.includes(String(dnf[0].p)), "未完走着顺为灰字");
}

console.log(fails ? ("FAILED: " + fails) : "ALL PASS");
process.exit(fails ? 1 : 0);
