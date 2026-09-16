/* 统计总览 · 正式数据版 冒烟断言（Node stub DOM，不动浏览器；挂 run_update --ci/--check 与 CI 门禁）
 * 三段验证：
 *   [A] data/stats.json 产物断言：meta 一致性 / by_venue×scopes（all+自然年y+生产年g）/ 十维分桶 / 月龄桶 / 重赏明细
 *   [B] 产物 ↔ data/basic.json + data/races 源数据 1:1 对账（独立第二实现，逐切面对账）
 *   [C] 页面冒烟（stub DOM + stub fetch 加载真实产物）：KPI 带 / 成熟曲线 / 倾向矩阵 /
 *       场地范围组合（JRA·NAR·海外 多选，默认 JRA）/ 自然年·生产年切面切换 / 下钻 URL 生成
 * 口径：比率分母=出走（完赛+未完赛；取消/除外不计），同 races.html 模块 34。
 * 用法: node tests/_verify-stats.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok  " + msg); }
  else { fails++; console.log("  FAIL " + msg); }
}

/* ═══════════ [A] 产物断言 ═══════════ */
const product = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "stats.json"), "utf8"));
const VTS = ["中央", "地方", "海外"];
const DIMS = ["surf", "dist", "cond", "turn", "grade", "ninki", "sex", "track", "trainer", "jockey"];
const BKEYS = ["n", "dnf", "exc", "w", "p2", "p3"];
const TROPHY_G = new Set(["GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII"]);
const SCOPE_RE = /^(all|y\d{4}|g\d{4})$/;

console.log("[A] data/stats.json 产物断言");
{
  const st = (product.meta && product.meta.stats) || {};
  const byv = product.by_venue || {};
  ok(Object.keys(byv).sort().join(",") === VTS.join(","), "by_venue 三分：中央/地方/海外");
  let tot = { n: 0, dnf: 0, exc: 0, w: 0, p2: 0, p3: 0 };
  let totPr = 0;
  for (const vt of VTS) {
    const scopes = (byv[vt] || {}).scopes || {};
    const b = (scopes.all || {}).base || {};
    for (const k of BKEYS) tot[k] += b[k] || 0;
    totPr += b.pr || 0;
  }
  ok(st.runs === tot.n, "meta.stats.runs = " + st.runs + " = 三分 all 切面 base.n 之和");
  ok(st.dnf === tot.dnf && st.exc === tot.exc, "meta.stats.dnf/exc = " + st.dnf + "/" + st.exc);
  ok(st.finished === tot.n - tot.dnf - tot.exc, "meta.stats.finished = " + st.finished + " = runs - dnf - exc");
  ok(st.wins === tot.w, "meta.stats.wins = " + st.wins + " = 三分 all 切面 w 之和");
  ok(st.horses > 0 && Number.isInteger(st.horses), "meta.stats.horses = " + st.horses);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(st.first_date) && /^\d{4}-\d{2}-\d{2}$/.test(st.last_date) &&
    st.first_date <= st.last_date, "集計期間 " + st.first_date + " ~ " + st.last_date);

  for (const vt of VTS) {
    const scopes = byv[vt].scopes || {};
    const keys = Object.keys(scopes);
    ok(keys.includes("all") && keys.every(k => SCOPE_RE.test(k)),
      "[" + vt + "] scopes 键合法（all" + keys.filter(k => k !== "all").map(k => "/" + k).join("") + "）");
    let ySum = 0, gSum = 0;
    keys.forEach(k => { if (k[0] === "y") ySum += scopes[k].base.n; if (k[0] === "g") gSum += scopes[k].base.n; });
    ok(ySum === scopes.all.base.n, "[" + vt + "] 自然年切面合计 " + ySum + " = all.n " + scopes.all.base.n);
    ok(gSum === scopes.all.base.n, "[" + vt + "] 生产年切面合计 " + gSum + " = all.n " + scopes.all.base.n);

    for (const sk of keys) {
      const blk = scopes[sk];
      const base = blk.base || {};
      const tag = "[" + vt + "/" + sk + "]";
      let bad = [];
      for (const k of BKEYS) if (!(Number.isInteger(base[k]) && base[k] >= 0)) bad.push(k);
      if (!(Number.isInteger(base.pr) && base.pr >= 0)) bad.push("pr");
      ok(bad.length === 0, tag + " base 计数非负整数（n=" + base.n + " pr=" + base.pr + "）" + (bad.length ? " 坏字段:" + bad.join("/") : ""));

      let dimBad = 0, dimSum = {}, rowBad = 0;
      for (const d of DIMS) {
        const rows = blk.dims[d] || [];
        if (!Array.isArray(rows)) { dimBad++; continue; }
        let s = 0;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          s += r.n;
          if (!(typeof r.k === "string" && r.k)) rowBad++;
          for (const k of BKEYS) if (!Number.isInteger(r[k]) || r[k] < 0) rowBad++;
          if (i && rows[i - 1].n < r.n) rowBad++;          /* 按 n 降序 */
          if (!(r.dnf + r.exc + (r.w || 0) + (r.p2 || 0) + (r.p3 || 0) <= r.n)) rowBad++;  /* 着别+未完走 ≤ n */
        }
        dimSum[d] = s;
      }
      ok(dimBad === 0, tag + " dims 十维齐全");
      ok(rowBad === 0, tag + " 分桶行契约：k 非空 / 计数非负 / n 降序 / 着别闭合");
      ok(dimSum.grade === base.n && dimSum.surf === base.n && dimSum.sex === base.n &&
         dimSum.trainer === base.n && dimSum.jockey === base.n && dimSum.track === base.n,
        tag + " grade/surf/sex/trainer/jockey/track 桶合计 = base.n = " + base.n);
      ok(dimSum.dist <= base.n && dimSum.cond <= base.n && dimSum.ninki <= base.n && dimSum.turn <= base.n,
        tag + " dist/cond/ninki/turn 桶合计 ≤ base.n（空值不入桶）");
      let curveBad = 0, curveTot = 0;
      for (let i = 0; i < blk.curve.length; i++) {
        const c = blk.curve[i];
        if (!(typeof c.gen === "string" && /^\d{4}$/.test(c.gen))) curveBad++;
        if (!(Number.isInteger(c.a) && c.a >= 0)) curveBad++;
        for (const k of BKEYS) if (!Number.isInteger(c[k]) || c[k] < 0) curveBad++;
        curveTot += c.n;
        if (i && (blk.curve[i - 1].gen > c.gen || (blk.curve[i - 1].gen === c.gen && blk.curve[i - 1].a >= c.a))) curveBad++;
      }
      ok(curveBad === 0, tag + " curve：gen 格式 / a 为月龄非负整数 / 计数非负 / (gen,a) 严格升序");
      ok(curveTot <= base.n, tag + " curve 合计 " + curveTot + " ≤ base.n " + base.n);
      let trBad = 0;
      for (let i = 0; i < blk.trophies.length; i++) {
        const t = blk.trophies[i];
        if (!TROPHY_G.has(t.g) || !/^\d{4}-\d{2}-\d{2}$/.test(t.d)) trBad++;
        if (!(Number.isInteger(t.id) && t.h && t.r && t.v)) trBad++;
        if (i && blk.trophies[i - 1].d > t.d) trBad++;
      }
      ok(trBad === 0, tag + " trophies：g∈重赏 / 字段齐全 / 按日期升序（" + blk.trophies.length + " 场）");
    }
  }
  ok(st.prize_total === totPr, "meta.stats.prize_total = 三分 all 切面 base.pr 之和 = " + totPr);
  const allTrophy = VTS.reduce((a, vt) => a + byv[vt].scopes.all.trophies.length, 0);
  ok(st.trophy_wins === allTrophy, "meta.stats.trophy_wins = " + st.trophy_wins + " = 三分 all 切面 trophies 合计");
}

/* ═══════════ [B] 产物 ↔ 源数据 1:1 对账（独立第二实现，逐切面） ═══════════ */
console.log("[B] 产物 ↔ data/basic.json + data/races 源数据 1:1 对账");
const basic = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "basic.json"), "utf8"));

/* ---- 独立实现的桶规则（镜像 build_stats.py 口径，写法故意不同以互证） ---- */
const distOf = d => {
  d = Number(d);
  if (!isFinite(d) || !d) return "";
  return d <= 1400 ? "短距离" : d <= 1800 ? "英里" : d <= 2400 ? "中距离" : "长距离";
};
const turnOf = c => String(c || "").startsWith("右") ? "右" : String(c || "").startsWith("左") ? "左" : "";
const ninkiOf = n => {
  if (n === "" || n == null) return "";
  n = Number(n);
  if (!isFinite(n) || n < 1 || n > 18) return "";
  return String(n);                    /* 人气逐一 1-18（同 races.html ninkiBucket） */
};
const gradeOf = g => {
  g = String(g || "").trim();
  if (g === "新馬") return "新馬";
  if (g === "未勝利") return "未勝利";
  if (g === "1勝クラス" || g === "2勝クラス" || g === "3勝クラス") return "班赛";
  if (TROPHY_G.has(g)) return "重赏";
  if (g === "L") return "L";
  if (g === "OP") return "OP";
  return "其他";
};
const sexOf = s => (String(s || "").trim() === "セ" ? "セン" : String(s || "").trim());
const birthOf = b => {
  const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(String(b || "").trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const ageOf = (ds, bd) => {
  const dt = new Date(ds + "T00:00:00Z");   /* 显式 UTC：避免本地时区把日退回前一天 */
  if (isNaN(dt)) return null;
  let age = (dt.getUTCFullYear() - bd.y) * 12 + (dt.getUTCMonth() + 1 - bd.m);
  if (dt.getUTCDate() < bd.d) age--;
  return age;
};
const cat = r => {   /* 三态分类：0=完赛 1=未完赛(中止/失格) 2=未出走(取消/除外) 3=未知串 */
  const p = r["結果"];
  if (typeof p === "number") return 0;
  const s = String(p || "").trim();
  if (s === "中止" || s === "失格") return 1;
  if (s === "取消" || s === "除外") return 2;
  return 3;
};
const nk = r => r["人気"] === "" || r["人気"] == null ? "" : Number(r["人気"]);

/* ---- 从源数据独立重算（按 场地 × 切面） ---- */
const exp = {};
const newBlk = () => ({ base: { n: 0, dnf: 0, exc: 0, w: 0, p2: 0, p3: 0, pr: 0 },
                        dims: Object.fromEntries(DIMS.map(d => [d, {}])), curve: {}, trophies: [] });
for (const vt of VTS) exp[vt] = { scopes: { all: newBlk() } };
const srcMeta = { runs: 0, finished: 0, dnf: 0, exc: 0, horses: new Set(), wins: 0, trophy_wins: 0,
                  prize_total: 0, dates: [], badStr: [] };
for (const h of basic.horses) {
  if (!h.races_file) continue;
  let arr = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, h.races_file), "utf8"));
    arr = Array.isArray(d) ? d : (d.races || []);
  } catch (e) { continue; }
  const birth = birthOf(h["生年月日"]);
  const gen = String(h["生年"] || "").trim();
  const gkey = /^\d{4}$/.test(gen) ? "g" + gen : null;
  const sex = sexOf(h["性別"]);
  for (const r of arr) {
    const ds = String(r["日付"] || "");
    if (!ds) continue;
    const vt = String(r["venue_type"] || "");
    if (!exp[vt]) continue;
    const c = cat(r);
    if (c === 3) { srcMeta.badStr.push(String(r["結果"])); continue; }
    const ym = /^(\d{4})/.exec(ds);
    const ykey = ym ? "y" + ym[1] : null;
    const pr = (() => {
      const v = r["賞金"];
      if (typeof v === "number") return v;
      const s = String(v || "").replace(/,/g, "").trim();
      return s && !isNaN(Number(s)) ? Math.round(Number(s)) : 0;
    })();
    srcMeta.runs++; srcMeta.horses.add(h.id); srcMeta.dates.push(ds);
    srcMeta.prize_total += pr;
    if (c === 1) srcMeta.dnf++;
    else if (c === 2) srcMeta.exc++;
    else {
      srcMeta.finished++;
      if (r["結果"] === 1) { srcMeta.wins++; if (TROPHY_G.has(String(r["格"] || ""))) srcMeta.trophy_wins++; }
    }
    const dims = { surf: String(r["芝ダ"] || ""), dist: distOf(r["距離"]), cond: String(r["馬場"] || ""),
                   turn: turnOf(r["コース"]), grade: gradeOf(r["格"]), ninki: ninkiOf(nk(r)),
                   sex, track: String(r["場名"] || ""), trainer: String(r["調教師"] || ""),
                   jockey: String(r["騎手"] || "") };
    let curveKey = null;
    if (gen && birth) {
      const am = ageOf(ds, birth);
      if (am !== null) curveKey = gen + "/" + am;   /* 逐月一桶（同 build_stats.py） */
    }
    const trophy = (r["結果"] === 1 && TROPHY_G.has(String(r["格"] || ""))) ? {
      d: ds, id: h.id, h: h["馬名"] || r["出走馬名"] || h["欧字馬名"] || "",
      r: String(r["レース名"] || ""), g: String(r["格"] || ""), v: String(r["場名"] || ""),
      R: r["R"] == null || r["R"] === "" ? "" : r["R"], jk: String(r["騎手"] || ""), tr: String(r["調教師"] || "")
    } : null;
    const targets = [exp[vt].scopes.all];
    if (ykey) { const b = exp[vt].scopes[ykey] || (exp[vt].scopes[ykey] = newBlk()); targets.push(b); }
    if (gkey) { const b = exp[vt].scopes[gkey] || (exp[vt].scopes[gkey] = newBlk()); targets.push(b); }
    for (const blk of targets) {
      const b = blk.base;
      b.n++; b.pr += pr;
      if (c === 1) b.dnf++;
      else if (c === 2) b.exc++;
      else if (r["結果"] === 1) b.w++;
      else if (r["結果"] === 2) b.p2++;
      else if (r["結果"] === 3) b.p3++;
      for (const k of DIMS) {
        if (!dims[k]) continue;
        const row = blk.dims[k][dims[k]] || (blk.dims[k][dims[k]] = { n: 0, dnf: 0, exc: 0, w: 0, p2: 0, p3: 0 });
        row.n++;
        if (c === 1) row.dnf++;
        else if (c === 2) row.exc++;
        else if (r["結果"] === 1) row.w++;
        else if (r["結果"] === 2) row.p2++;
        else if (r["結果"] === 3) row.p3++;
      }
      if (curveKey) {
        const row = blk.curve[curveKey] || (blk.curve[curveKey] = { n: 0, dnf: 0, exc: 0, w: 0, p2: 0, p3: 0 });
        row.n++;
        if (c === 1) row.dnf++;
        else if (c === 2) row.exc++;
        else if (r["結果"] === 1) row.w++;
        else if (r["結果"] === 2) row.p2++;
        else if (r["結果"] === 3) row.p3++;
      }
      if (trophy) blk.trophies.push(trophy);
    }
  }
}

ok(srcMeta.badStr.length === 0, "結果 字符串值均在白名单（中止/失格/取消/除外）内" +
  (srcMeta.badStr.length ? "，出现未知值: " + srcMeta.badStr.join("|") : ""));

/* ---- 逐切面比较 ---- */
const st = product.meta.stats;
ok(st.runs === srcMeta.runs && st.finished === srcMeta.finished && st.dnf === srcMeta.dnf && st.exc === srcMeta.exc,
  "meta.runs/finished/dnf/exc 与源一致（" + st.runs + "/" + st.finished + "/" + st.dnf + "/" + st.exc + "）");
ok(st.horses === srcMeta.horses.size && st.wins === srcMeta.wins && st.trophy_wins === srcMeta.trophy_wins,
  "meta.horses/wins/trophy_wins 与源一致（" + st.horses + "/" + st.wins + "/" + st.trophy_wins + "）");
ok(st.prize_total === srcMeta.prize_total, "meta.prize_total 与源一致 = " + st.prize_total.toLocaleString() + " 円");
ok(st.first_date === srcMeta.dates.sort()[0] && st.last_date === srcMeta.dates[srcMeta.dates.length - 1],
  "first/last_date 与源一致（" + st.first_date + " ~ " + st.last_date + "）");

const eqB = (a, b, where) => {
  for (const k of BKEYS) {
    if (a[k] !== b[k]) {
      ok(false, where + " 字段 " + k + " 不一致: 产物=" + a[k] + " 源=" + b[k]);
      return false;
    }
  }
  return true;
};
let diffCnt = 0, scopeCnt = 0;
for (const vt of VTS) {
  const pscopes = product.by_venue[vt].scopes, escopes = exp[vt].scopes;
  const keys = new Set([...Object.keys(pscopes), ...Object.keys(escopes)]);
  for (const sk of keys) {
    scopeCnt++;
    const pv = pscopes[sk], ev = escopes[sk];
    const tag = "[" + vt + "/" + sk + "]";
    if (!pv || !ev) { ok(false, tag + " 切面只存在于一边"); diffCnt++; continue; }
    if (!eqB(pv.base, ev.base, tag + " base")) diffCnt++;
    if (pv.base.pr !== ev.base.pr) { ok(false, tag + " base.pr 不一致: 产物=" + pv.base.pr + " 源=" + ev.base.pr); diffCnt++; }
    for (const d of DIMS) {
      const prow = Object.fromEntries((pv.dims[d] || []).map(x => [x.k, x]));
      const erow = ev.dims[d];
      const bkeys = new Set([...Object.keys(prow), ...Object.keys(erow)]);
      for (const k of bkeys) {
        if (!prow[k] || !erow[k]) { ok(false, tag + " dims." + d + " 桶「" + k + "」只存在于一边"); diffCnt++; continue; }
        if (!eqB(prow[k], erow[k], tag + " dims." + d + "「" + k + "」")) diffCnt++;
      }
    }
    const pcur = Object.fromEntries(pv.curve.map(c => [c.gen + "/" + c.a, c]));
    const ckeys = new Set([...Object.keys(pcur), ...Object.keys(ev.curve)]);
    for (const k of ckeys) {
      if (!pcur[k] || !ev.curve[k]) { ok(false, tag + " curve 点「" + k + "」只存在于一边"); diffCnt++; continue; }
      if (!eqB(pcur[k], ev.curve[k], tag + " curve「" + k + "」")) diffCnt++;
    }
    exp[vt].scopes[sk].trophies.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);   /* 产物按日期升序，期望先排序再比 */
    const pt = JSON.stringify(pv.trophies.map(x => ({ d: x.d, id: x.id, g: x.g, h: x.h, r: x.r, v: x.v, R: String(x.R), jk: x.jk, tr: x.tr })));
    const et = JSON.stringify(ev.trophies.map(x => ({ d: x.d, id: x.id, g: x.g, h: x.h, r: x.r, v: x.v, R: String(x.R), jk: x.jk, tr: x.tr })));
    if (pt !== et) { ok(false, tag + " trophies 明细不一致"); diffCnt++; }
  }
}
ok(diffCnt === 0, "逐切面 1:1 对账通过（" + scopeCnt + " 个切面 × base + 十维 + curve + trophies）");

/* ═══════════ [C] 页面冒烟（stub DOM + 真实产物；期望值从产物独立重算） ═══════════ */
console.log("[C] stats.html 页面冒烟");
const html = fs.readFileSync(path.join(ROOT, "front", "pages", "stats.html"), "utf8");
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
ok(code.includes('YJ_DATA.url("stats.json")'), "页面引用 stats.json");

/* ---- 最小 DOM stub ---- */
const els = {};
function el(id) {
  return {
    id, _html: "", text: "", attrs: {}, handlers: {}, value: "", style: {}, clientWidth: 800,
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    set textContent(v) { this.text = String(v); }, get textContent() { return this.text; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    closest() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, right: 0, width: 800, height: 200 }; },
  };
}
global.document = {
  _handlers: {},
  getElementById(id) { return els[id] || (els[id] = el(id)); },
  querySelectorAll() { return []; },
  addEventListener(t, f) { (this._handlers[t] = this._handlers[t] || []).push(f); },
};
global.window = global;
global.addEventListener = function () {};
global.location = { href: "" };
global.YJ = { i18n: { t: k => k, e: (f, v) => v } };
global.YJ_DATA = { url(p) { return "data/" + p; } };
global.fetch = function (url) {
  const txt = fs.readFileSync(path.join(ROOT, String(url)), "utf8");
  return Promise.resolve({ ok: true, json() { return Promise.resolve(JSON.parse(txt)); } });
};
eval(code);

/* ---- 期望值工具（全部从产物独立重算；比率分母=出走） ---- */
const byv = product.by_venue;
const scopeBlk = (vt, sk) => byv[vt].scopes[sk] || null;
const sumB = (vts, sk) => {
  const t = { n: 0, dnf: 0, exc: 0, w: 0, p2: 0, p3: 0, pr: 0 };
  vts.forEach(v => { const blk = scopeBlk(v, sk); if (!blk) return; const b = blk.base;
    t.n += b.n; t.dnf += b.dnf; t.exc += b.exc; t.w += b.w; t.p2 += b.p2; t.p3 += b.p3; t.pr += b.pr || 0; });
  return t;
};
const startsOf = b => b.n - b.exc;                       /* 出走 = 比率分母 */
const pctOf = x => (x * 100).toFixed(1) + "%";
const ratesOf = b => { const f = startsOf(b); return { f, win: f ? b.w / f : 0, ren: f ? (b.w + b.p2) / f : 0, fuku: f ? (b.w + b.p2 + b.p3) / f : 0 }; };
const manYenOf = pr => {
  if (!pr) return "0万";
  if (pr >= 1e8) { const o = Math.floor(pr / 1e8), m = Math.floor((pr % 1e8) / 1e4); return o + "亿" + (m ? m.toLocaleString() + "万" : ""); }
  return Math.round(pr / 1e4).toLocaleString() + "万";
};
const click = (id, attr) => {
  const h = els[id].handlers.click;
  if (!h || !h.length) return;
  h[h.length - 1].call(els[id], { target: { closest: sel => /button\[data-(v|g|tab|m|y)\]/.test(sel)
    ? { getAttribute: () => attr, setAttribute: (k, v) => {} } : null } });
};
const kpiV = label => {
  const m = String(els["kpis"]._html).match(new RegExp('class="k">' + label + '</div><div class="v(?: hi| dim)?">([\\s\\S]*?)</div>'));
  return m ? m[1] : null;
};

setTimeout(function () {
  console.log("[C1] 初始加载（默认 JRA + 全部切面）");
  const b0 = sumB(["中央"], "all");
  const r0 = ratesOf(b0);
  ok(kpiV("出走") === String(startsOf(b0)), "KPI 出走 = " + startsOf(b0) + "（仅 JRA）");
  ok(kpiV("总赏金") === manYenOf(b0.pr), "KPI 总赏金 " + manYenOf(b0.pr));
  ok(kpiV("重赏胜利") === '<span class="st-trophy">🏆</span>' + byv["中央"].scopes.all.trophies.length, "KPI 重赏 🏆" + byv["中央"].scopes.all.trophies.length);
  ok(String(kpiV("通算战绩") || "").replace(/<[^>]+>/g, "") === "[" + b0.w + "-" + b0.p2 + "-" + b0.p3 + "-" + (b0.n - b0.dnf - b0.exc - b0.w - b0.p2 - b0.p3) + "]",
    "KPI 通算战绩 4 段（着别=完赛口径）");
  const bar = String(els["distBar"]._html);
  ok(bar.includes("st-bar") && bar.includes("#e2cc38") && bar.includes("完赛 " + (b0.n - b0.dnf - b0.exc) + " 场"), "着顺分布条（着别=完赛口径）");
  const rb = String(els["rateBand"]._html);
  ok(rb.includes(pctOf(r0.win)) && rb.includes(pctOf(r0.ren)) && rb.includes(pctOf(r0.fuku)),
    "比率带（分母=出走）胜率/连对/复胜 = " + pctOf(r0.win) + " / " + pctOf(r0.ren) + " / " + pctOf(r0.fuku));
  ok(els["periodLabel"].text.includes(product.meta.stats.first_date), "periodLabel 集計期間");
  /* 顶部切面控件 */
  const modeHtml = String(els["ymodeSeg"]._html);
  ok(modeHtml.includes("生产年") && modeHtml.includes("自然年"), "切面模式：生产年/自然年");
  const yHtml = String(els["yseg"]._html);
  ok(yHtml.includes("全部") && yHtml.includes("2023年产") && yHtml.includes("2024年产"), "默认生产年值：全部/2023年产/2024年产");

  console.log("[C2] 成熟曲线（SVG 双线 + 世代切换 + 明细表）");
  const segHtml = String(els["genSeg"]._html);
  ok(segHtml.includes("全部") && segHtml.includes("2023年产") && segHtml.includes("2024年产"), "世代切换：全部/2023年产/2024年产（届 已弃用）");
  const curveHtml = String(els["curve"]._html);
  ok(curveHtml.includes("<svg") && (curveHtml.match(/<path/g) || []).length === 4, "SVG 4 条折线（2023+2024 × 连对/胜率）");
  const cys = [...curveHtml.matchAll(/cy="([\d.]+)"/g)].map(m => +m[1]);
  ok(cys.length >= 4 && Math.max(...cys) - Math.min(...cys) > 40,
    "曲线点位随比率起伏（最高-最低 cy 差 " + (Math.max(...cys) - Math.min(...cys)).toFixed(0) + "px，防贴底回归）");
  ok((curveHtml.match(/<circle/g) || []).length >= 4, "曲线点标记（含 <title> tooltip）");
  ok(String(els["curveLegend"]._html).includes("2023年产·连对") && String(els["curveLegend"]._html).includes("样本少"), "图例（年产措辞）+ 样本少说明");
  ok(String(els["curveTable"]._html).includes("<table") && String(els["curveTable"]._html).includes("生产年"), "月龄明细表（生产年列）");
  click("genSeg", "2024");
  ok((String(els["curve"]._html).match(/<path/g) || []).length === 2, "切换 2024年产 → 2 条折线");
  click("genSeg", "全部");

  console.log("[C3] 倾向矩阵（10 页签 + 库内基准 + 下钻 URL）");
  ok((String(els["matTabs"]._html).match(/data-tab=/g) || []).length === 10, "矩阵 10 页签");
  const mt = String(els["matTable"]._html);
  ok(mt.includes("总体平均") && mt.includes(pctOf(r0.win)), "基准顶行 = 总体平均胜率 " + pctOf(r0.win) + "（分母=出走）");
  const daRow = byv["中央"].scopes.all.dims.surf.find(x => x.k === "ダ");
  ok(mt.includes(">ダ<") && mt.includes(String(startsOf(daRow))), "跑道页签：泥地行 出走 " + startsOf(daRow));
  ok(mt.includes('data-href="races.html?f=' + encodeURIComponent("surface:ダ,venue:中央") + '"'), "泥地行下钻 = surface:ダ,venue:中央");
  const daR = ratesOf(daRow), daDiff = (daR.win - r0.win) * 100;
  ok(Math.abs(daDiff) < 1.0 ? true : mt.includes((daDiff > 0 ? "▲" : "▼") + Math.abs(daDiff).toFixed(1)),
    "泥地胜率相对基准差" + (Math.abs(daDiff) < 1.0 ? " <1.0pt 不标（符合规则）" : " 标注 ▲▼"));
  click("matTabs", "sex");
  const mtSex = String(els["matTable"]._html);
  const osuRow = byv["中央"].scopes.all.dims.sex.find(x => x.k === "牡");
  ok(mtSex.includes(">牡<") && mtSex.includes(String(startsOf(osuRow))), "性别页签：牡 出走 " + startsOf(osuRow));
  const oR = ratesOf(osuRow), oDiff = (oR.win - r0.win) * 100;
  ok(oDiff >= 1.0 && mtSex.includes("▲" + Math.abs(oDiff).toFixed(1)), "牡胜率相对基准 ▲" + Math.abs(oDiff).toFixed(1) + "pt");
  click("matTabs", "grade");
  const mtGr = String(els["matTable"]._html);
  ok(mtGr.includes(">重赏<") && mtGr.includes(">3<"), "级别页签：重赏 3 胜");
  ok(mtGr.includes('data-href="races.html?f=' + encodeURIComponent("grade:重赏,venue:中央") + '"'), "重赏行下钻 = grade:重赏");
  click("matTabs", "trainer");
  const trRows = byv["中央"].scopes.all.dims.trainer;
  ok((String(els["matTable"]._html).match(/<tr/g) || []).length === 2 + trRows.length,
    "调教师全部展示（" + (2 + trRows.length) + " 行 = 表头+基准+全部" + trRows.length + "）");
  ok(String(els["matNote"]._html).includes("全部列出") && !String(els["matNote"]._html).includes("展开全部"), "无展开按钮（全展示）");
  click("matTabs", "ninki");
  const nkRows = byv["中央"].scopes.all.dims.ninki;
  ok((String(els["matTable"]._html).match(/<tr/g) || []).length === 2 + nkRows.length && nkRows.every(x => /^\d+$/.test(x.k)),
    "人气逐一展示（" + nkRows.length + " 个桶，键=1-18 数字）");
  click("matTabs", "grade");

  console.log("[C4] 切面切换（生产年 2023年产 → 自然年 2026年）");
  click("yseg", "2023");
  const bG23 = sumB(["中央"], "g2023");
  ok(kpiV("出走") === String(startsOf(bG23)), "生产年 2023年产 → 出走 " + startsOf(bG23) + "（g2023 切面）");
  ok(String(els["matTable"]._html).includes('data-href="races.html?f=' + encodeURIComponent("grade:重赏,venue:中央,byear:2023") + '"'),
    "生产年切面下钻附带 byear:2023");
  click("ymodeSeg", "year");
  const yHtml2 = String(els["yseg"]._html);
  ok(yHtml2.includes("2025年") && yHtml2.includes("2026年") && !yHtml2.includes("年产"), "切自然年 → 值变 2025年/2026年");
  click("yseg", "2026");
  const bY26 = sumB(["中央"], "y2026");
  ok(kpiV("出走") === String(startsOf(bY26)), "自然年 2026年 → 出走 " + startsOf(bY26) + "（y2026 切面）");
  ok(String(els["matTable"]._html).includes('data-href="races.html?f=' + encodeURIComponent("grade:重赏,venue:中央,year:2026") + '"'),
    "自然年切面下钻附带 year:2026");
  click("yseg", "all");
  ok(kpiV("出走") === String(startsOf(sumB(["中央"], "all"))), "切面回全部 → 出走 " + startsOf(sumB(["中央"], "all")));
  click("ymodeSeg", "gen");

  console.log("[C5] 场地范围组合（JRA + NAR；唯一项不可关）");
  click("vseg", "地方");
  const b01 = sumB(["中央", "地方"], "all");
  const r01 = ratesOf(b01);
  ok(kpiV("出走") === String(startsOf(b01)), "加勾 NAR → 出走 " + startsOf(b01));
  ok(String(els["matTable"]._html).includes(pctOf(r01.win)), "矩阵基准联动 = " + pctOf(r01.win));
  ok(String(els["matTable"]._html).includes('data-href="races.html?f=' + encodeURIComponent("grade:重赏,venue:中央,venue:地方") + '"'),
    "组合下钻 URL 带双 venue（grade:重赏,venue:中央,venue:地方）");
  click("vseg", "中央");                     /* 2 项时允许关中央 → 只剩地方 */
  const bL = sumB(["地方"], "all");
  ok(kpiV("出走") === String(startsOf(bL)), "关中央 → 只剩 NAR，出走 " + startsOf(bL));
  click("vseg", "地方");                     /* 唯一项 → 不可关 */
  ok(kpiV("出走") === String(startsOf(bL)), "唯一项不可关（仍为 NAR " + startsOf(bL) + "）");
  click("vseg", "中央");                     /* 恢复 */
  click("vseg", "地方");
  ok(kpiV("出走") === String(startsOf(sumB(["中央"], "all"))), "取消地方 → 回纯 JRA " + startsOf(sumB(["中央"], "all")));
  const mtGr2 = String(els["matTable"]._html);
  ok(mtGr2.includes('data-href="races.html?f=' + encodeURIComponent("grade:重赏,venue:中央") + '"'), "回 JRA 后 重赏下钻仅 venue:中央");

  console.log("[C6] 重赏之路 + 补充");
  ok(String(els["gradedProg"]._html).includes("重赏") && String(els["gradedProg"]._html).includes("新马"), "级别胜利进度条");
  const gl = String(els["gradedList"]._html);
  ok((gl.match(/yj-gd/g) || []).length === byv["中央"].scopes.all.trophies.length, "重赏明细行数 = " + byv["中央"].scopes.all.trophies.length);
  ok(gl.includes("profile.html?horse=" + byv["中央"].scopes.all.trophies[0].id), "重赏明细跳档案链接");
  const ab = String(els["aboutNote"]._html);
  ok(ab.includes("三态口径") && ab.includes("样本少") && ab.includes("分母 = 出走"), "口径说明（分母=出走）");
  ok(ab.includes("自然年") && ab.includes("生产年"), "口径说明含切面解释");
  ok(!ab.includes("场地类型") && !ab.includes("build_stats.py"), "说明区已去掉 场地类型对比 与数据来源句");
}, 0);

/* 汇总 */
setTimeout(function () {
  console.log("\n═══ 统计总览断言汇总 ═══ 通过 " + passes + " · 失败 " + fails);
  if (fails) process.exit(1);
}, 300);
