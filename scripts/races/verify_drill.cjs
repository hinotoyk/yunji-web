/* 比赛记录页 · 下钻冒烟（统计总览矩阵行 → races.html?f=... 全链路）
 * 用间接 eval 执行真实页面脚本（非 strict → 顶层 var/function 落到 global），
 * stub DOM + fetch + YJ.*（selector/bus/device/i18n），让 initLibrary 真跑完：
 *   [A] URL_F 解析 + validFilterValue 应用（无效值丢弃）
 *   [B] FLT 预置后 matchEntry 命中数 == 源数据独立重算（口径互证，覆盖新维度）
 *   [C] renderFilters 新筛选行（赛道方向/人气/性别/调教师/骑手 select）渲染 + 页面不崩
 *   [D] 人气 select 交互（添加 + tag 删除，同调教师/骑手）
 *   [E] 马名口径收口（horseText 剥生产国尾缀 + 无登録名兜底「母名の生年」，见 docs/UI优化记录.md §64）
 * 用法: node scripts/races/verify_drill.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok  " + msg); }
  else { fails++; console.log("  FAIL " + msg); }
}

const html = fs.readFileSync(path.join(ROOT, "front", "pages", "races.html"), "utf8");
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
const basic = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "basic.json"), "utf8"));

/* ---- 丰富 DOM stub（够 renderResults 的 canvas 量宽 / txtW 探针跑通） ---- */
function mkEl(id) {
  return {
    id, _html: "", _injected: "", text: "", value: "", style: {}, dataset: {}, attrs: {}, handlers: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    set textContent(v) { this.text = String(v); }, get textContent() { return this.text; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    /* races.html refreshDimUI 用 selEl.insertAdjacentHTML("beforebegin", dimTags(key)) 把已选 tag
     * 插到下拉挂载点之前（§56 四维度改搜索下拉后新增的 DOM 写法），stub 必须支持，否则整串崩。
     * 断言因此读该元素自身的 _html（真实浏览器里它落在 #filters 内）。 */
    insertAdjacentHTML(pos, html) {
      if (pos === "beforebegin") {
        /* 生产路径先 chips.querySelectorAll(".f-tag").remove() 再插全量 → 覆盖式记录最近一次注入 */
        this._injected = String(html);
        this._html = String(html) + this._html;
      } else {
        this._html = this._html + String(html);
      }
    },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 200, width: 800, height: 200 }; },
    clientWidth: 800, clientHeight: 200, offsetWidth: 800, offsetHeight: 200, scrollWidth: 800, scrollHeight: 200,
    focus() {}, blur() {},
  };
}
const els = {};
const doc = {
  _handlers: {},
  getElementById(id) { return els[id] || (els[id] = mkEl(id)); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) {
    if (tag === "canvas") return { getContext() { return { measureText(s) { return { width: String(s).length * 7 }; } }; } };
    return mkEl("__" + tag);
  },
  addEventListener(t, f) { (this._handlers[t] = this._handlers[t] || []).push(f); },
};
const body = mkEl("body");
doc.body = body;
global.document = doc;
global.window = global;
global.addEventListener = function () {};
global.YJ_DATA = { url(p) { p = String(p).replace(/^\/+/, ""); if (p.indexOf("data/") === 0) p = p.slice(5); return "data/" + p; } };
global.fetch = url => {
  url = String(url);
  /* 主路径 stub：races-bundle.json 在 data/ 仓库不落盘（D11 替换式，只进 dist）→
   * 现场用共享模块 pack 现做（顺带把 pack→decode 全链路纳入下钻冒烟）。 */
  if (url.indexOf("races-bundle.json") >= 0) {
    const byH = {};
    for (const f of fs.readdirSync(path.join(ROOT, "data", "races")).filter(f => f.endsWith(".json"))) {
      byH[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "races", f), "utf8"));
    }
    const b = global.YJ.raceBundle.pack(byH);
    return Promise.resolve({ ok: true, json() { return Promise.resolve(b); } });
  }
  const txt = fs.readFileSync(path.join(ROOT, url), "utf8");
  return Promise.resolve({ ok: true, json() { return Promise.resolve(JSON.parse(txt)); } });
};

/* 下钻 URL：覆盖全部新维度 + 2 个无效值（grade:ZZZ / track:不存在）+ 一个枚举外值（sex:未知）+ 无效体重（weight:ABC） */
const DRILL_F = ["surface:ダ", "venue:中央", "dist:中距离", "cond:良", "turn:右", "ninki:1",
  "sex:牝", "grade:2勝クラス", "trainer:矢作芳人", "jockey:武豊", "result:一着", "byear:2024",
  "weight:470-480", "grade:ZZZ", "track:不存在", "sex:未知", "weight:ABC"].join(",");
global.location = { search: "?f=" + encodeURIComponent(DRILL_F), href: "", pathname: "/pages/races.html", replace() {} };   /* pathname/replace 补全：页面「独立打开=自动回壳」分支（§82.13）要用 */
global.YJ = {
  i18n: { t: k => k, e: (f, v) => v, g: (f, v) => v },
  device: { isMb() { return false; }, onChange() {}, isPc() { return true; } },
  bus: { onChange() {}, send() {} },
  selector: {
    loadHorses() { return Promise.resolve(basic.horses); },
    /* §56 后四维度的候选值/排序/文案只存在于传给组件的 items 里（不再有原生 select 标记），
     * 故记录每个实例配置供断言取用；出走马与 items 模式共用同一 init。 */
    init(o) { (global.__selInits = global.__selInits || []).push(o); },
    getHorses() { return basic.horses; },
  },
};

/* 共享模块按浏览器加载顺序入 stub：yj-util.js（YJ.util.esc，§48 后页面薄别名依赖）→ race-rows.js
 * （比赛行/徽章渲染已下沉，见 docs/UI优化记录.md §42）。浏览器里它们先于页面脚本加载，stub 环境须保持同样顺序。 */
/* P3/R6（docs/REFACTOR.md §12.4）：race-rows.js 已改读 window.YJ_GRADE（fail-fast）→ stub 环境须先注入
 * 与浏览器一致的 YJ_SITE / YJ_GRADE（node 侧 fs 读 config 两个 JSON，与 dist/site-config.js 同源）。 */
const _sireCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "sire.json"), "utf8"));
const _gradeCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "grade-table.json"), "utf8"));
window.YJ_SITE = _sireCfg.site || {};
window.YJ_GRADE = _gradeCfg.GRADE || {};
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "yj-util.js"), "utf8"));
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "race-rows.js"), "utf8"));
/* 统一缓存控制器（initLibrary 主路径经 YJ.cache.fetch('bundle') 取数）+ bundle 编解码模块：
 * node 无 caches → 控制器自动走降级（fetch stub 直读），顺带覆盖降级路径本身 */
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "yj-cache.js"), "utf8"));
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "race-bundle.js"), "utf8"));

/* 间接 eval → 页面 var/function 落到 global（后续可读 LIB/FLT/entryVal/matchEntry） */
(0, eval)(code);

/* ---- 期望：从源数据独立重算（口径镜像 scripts/stats/verify_stats.cjs [B]，证明两页一致） ---- */
const DNF_SET = new Set(["中止", "失格"]), EXC_SET = new Set(["取消", "除外"]);
const distOf = d => { d = Number(d); if (!isFinite(d) || !d) return ""; return d <= 1400 ? "短距离" : d <= 1800 ? "英里" : d <= 2400 ? "中距离" : "长距离"; };
const ninkiOf = n => { if (n === "" || n == null) return ""; n = Number(n); if (!isFinite(n) || n < 1 || n > 18) return ""; return String(n); };
const turnOf = c => { const s = String(c || ""); return s.slice(0, 1) === "右" ? "右" : s.slice(0, 1) === "左" ? "左" : ""; };
const sexOf = s => (String(s || "").trim() === "セ" ? "セン" : String(s || "").trim());
const sexOfH = h => sexOf((h || {}).性別_当前 || (h || {}).性別);   // 当前性别（同 races.html entryVal / YJ.util.sexOf）
/* 体重档（同 build_stats.py weight_bin / races.html weightBin：400-550 每 10kg 一档，550 归 540-550） */
const weightBinOf = w => {
  if (w === "" || w == null) return "";
  const n = Math.round(Number(w));
  if (!isFinite(n)) return "";
  if (n < 400) return "<400";
  if (n > 550) return ">550";
  const lo0 = Math.floor(n / 10) * 10, lo = lo0 >= 550 ? 540 : lo0;
  return lo + "-" + (lo + 10);
};
const allEntries = [];
for (const h of basic.horses) {
  if (!h.races_file) continue;
  let arr = [];
  try { const d = JSON.parse(fs.readFileSync(path.join(ROOT, h.races_file), "utf8")); arr = Array.isArray(d) ? d : (d.races || []); } catch (e) { continue; }
  arr.forEach(r => allEntries.push({ h, r }));
}
const match = en => {
  const r = en.r;
  if (r.venue_type !== "中央") return false;
  if (String(r.芝ダ || "") !== "ダ") return false;
  if (distOf(r.距離) !== "中距离") return false;
  if (String(r.馬場 || "") !== "良") return false;
  if (turnOf(r.コース) !== "右") return false;
  if (ninkiOf(r.人気) !== "1") return false;
  if (sexOfH(en.h) !== "牝") return false;
  if (String(r.格 || "") !== "2勝クラス") return false;
  if (String(r.調教師 || "") !== "矢作芳人") return false;
  if (String(r.騎手 || "") !== "武豊") return false;
  if (r.結果 !== 1) return false;
  if (String(en.h.生年 || "").slice(0, 4) !== "2024") return false;
  if (weightBinOf(en.r["馬体重"]) !== "470-480") return false;
  return true;
};
const expCount = allEntries.filter(match).length;

setTimeout(function () {
  console.log("[A] URL_F 解析 + validFilterValue 应用");
  ok(global.URL_F && global.URL_F.surface && global.URL_F.surface[0] === "ダ", "URL_F.surface = ダ");
  ok(global.URL_F.grade.length === 2, "URL_F.grade 两条（2勝クラス + ZZZ）");
  ok(global.FLT.surface.indexOf("ダ") >= 0 && global.FLT.venue.indexOf("中央") >= 0, "FLT 应用 surface:ダ / venue:中央");
  ok(global.FLT.grade.length === 1 && global.FLT.grade[0] === "2勝クラス", "无效值丢弃：grade:ZZZ 未入 FLT");
  ok(global.FLT.track.length === 0, "无效值丢弃：track:不存在 未入 FLT（按数据校验）");
  ok(global.FLT.sex.length === 1 && global.FLT.sex[0] === "牝", "无效值丢弃：sex:未知 未入 FLT");
  ok(global.FLT.turn[0] === "右" && global.FLT.ninki[0] === "1" && global.FLT.trainer[0] === "矢作芳人" &&
     global.FLT.jockey[0] === "武豊" && global.FLT.dist[0] === "中距离" && global.FLT.cond[0] === "良" &&
     global.FLT.result[0] === "一着" && global.FLT.byear[0] === "2024" && global.FLT.weight[0] === "470-480",
    "其余 9 个有效维度全部应用（含 weight:470-480）");
  ok(!global.FLT.weight.includes("ABC"), "无效值丢弃：weight:ABC 未入 FLT");

  console.log("[B] matchEntry 命中数 == 源数据独立重算");
  const hit = global.LIB.entries.filter(en => global.matchEntry(en)).length;
  ok(hit === expCount, "13 维 AND 命中 " + hit + " == 独立重算 " + expCount + "（均为 0，负例一致）");
  /* 单维正例：直接操纵页面 FLT（真实 matchEntry/entryVal 路径），覆盖全部新维度 */
  const countFor = (k, v) => {
    global.DIM_KEYS.forEach(kk => { global.FLT[kk] = []; });
    global.FLT[k] = [v];
    return global.LIB.entries.filter(en => global.matchEntry(en)).length;
  };
  const rawNinki = allEntries.filter(en => ninkiOf(en.r.人気) === "1").length;
  ok(countFor("ninki", "1") === rawNinki && rawNinki > 0, "ninki:1 命中 " + countFor("ninki", "1") + " == 源 " + rawNinki);
  const rawTurn = allEntries.filter(en => turnOf(en.r.コース) === "左").length;
  ok(countFor("turn", "左") === rawTurn && rawTurn > 0, "turn:左 命中 " + countFor("turn", "左") + " == 源 " + rawTurn);
  const rawSex = allEntries.filter(en => sexOf(en.h.性別) === "牝").length;
  ok(countFor("sex", "牝") === rawSex && rawSex > 0, "sex:牝 命中 " + countFor("sex", "牝") + " == 源 " + rawSex);
  const rawG2 = allEntries.filter(en => String(en.r.格 || "") === "2勝クラス").length;
  ok(countFor("grade", "2勝クラス") === rawG2 && rawG2 > 0, "grade:2勝クラス（新单级）命中 " + countFor("grade", "2勝クラス") + " == 源 " + rawG2);
  const rawTr = allEntries.filter(en => String(en.r.調教師 || "") === "矢作芳人").length;
  ok(countFor("trainer", "矢作芳人") === rawTr && rawTr > 0, "trainer:矢作芳人 命中 " + countFor("trainer", "矢作芳人") + " == 源 " + rawTr);
  const rawJk = allEntries.filter(en => String(en.r.騎手 || "") === "武豊").length;
  ok(countFor("jockey", "武豊") === rawJk && rawJk > 0, "jockey:武豊 命中 " + countFor("jockey", "武豊") + " == 源 " + rawJk);
  const rawMps = allEntries.filter(en => String(en.h["母父"] || "") === "キングカメハメハ").length;
  ok(countFor("mps", "キングカメハメハ") === rawMps && rawMps > 0, "mps:キングカメハメハ（母父新维度）命中 " + countFor("mps", "キングカメハメハ") + " == 源 " + rawMps);
  const rawW = allEntries.filter(en => weightBinOf(en.r["馬体重"]) === "470-480").length;
  ok(countFor("weight", "470-480") === rawW && rawW > 0, "weight:470-480 命中 " + countFor("weight", "470-480") + " == 源 " + rawW);
  const rawBr = allEntries.filter(en => String(en.h["生産牧場"] || "").trim() === "ノーザンファーム").length;
  ok(countFor("breeder", "ノーザンファーム") === rawBr && rawBr > 0, "breeder:ノーザンファーム 命中 " + countFor("breeder", "ノーザンファーム") + " == 源 " + rawBr);
  const rawOw = allEntries.filter(en => String(en.h["馬主"] || "").trim() === "サンデーレーシング").length;
  ok(countFor("owner", "サンデーレーシング") === rawOw && rawOw > 0, "owner:サンデーレーシング 命中 " + countFor("owner", "サンデーレーシング") + " == 源 " + rawOw);
  /* 还原全部预置维度组合（供 [C] 继续） */
  global.DIM_KEYS.forEach(kk => { global.FLT[kk] = []; });
  global.URL_F && global.DIM_KEYS.forEach(k => {
    const vals = global.URL_F[k];
    if (!vals) return;
    vals.forEach(v => { if (global.validFilterValue(k, v)) global.FLT[k].push(v); });
  });

  console.log("[C] renderFilters 新筛选行 + 页面不崩");
  const f = String(els["filters"]._html);
  /* §56：四维度改「出走马同款」搜索下拉 → 候选值/排序/文案只存在于传给组件的 items，
   * 断言随之从「读 filters 里的原生 select 标记」改为「读挂载点 id + 组件实例配置」 */
  const inits = global.__selInits || [];
  const selOf = ph => inits.find(o => o.placeholder === ph);
  ok(f.includes("赛道方向") && f.includes("右转") && f.includes("左转"), "筛选行 赛道方向（右转/左转）");
  ok(f.includes('id="fDimSel_ninki"') && f.includes('f-tag">1人気'), "人气 下拉挂载点 + 已选 tag（URL 预置 1人気）");
  ok(!f.includes("<select"), "四维度原生 select 已退场（筛选条 HTML 无 <select> 残留）");
  const ninkiSel = selOf("搜索人气添加…");
  ok(!!ninkiSel && ninkiSel.items.length >= 10 && ninkiSel.items.every(it => it.n > 0),
    "人气候选 items 带出赛数 n（共 " + (ninkiSel && ninkiSel.items.length) + " 档）");
  ok(!!ninkiSel && ninkiSel.items.map(it => +it.v).join(",") ===
    ninkiSel.items.map(it => +it.v).slice().sort((a, b) => a - b).join(","), "人气候选 1→18 固定升序");
  ok(!!ninkiSel && ninkiSel.items[0].l === ninkiSel.items[0].v + "人気", "人气候选文案带「人気」后缀");
  ok(!!ninkiSel && ninkiSel.excluded({ v: "1" }) === true && ninkiSel.excluded({ v: "2" }) === false,
    "excluded 回调：已选 1人気 从候选排除、未选 2人気 保留");
  const trSel = selOf("搜索调教师添加…");
  ok(!!trSel && trSel.items[0].n >= trSel.items[trSel.items.length - 1].n && trSel.items.length > 10,
    "调教师候选按出赛数降序（首位 " + (trSel && trSel.items[0].v) + " " + (trSel && trSel.items[0].n) + "场 / 共 " + (trSel && trSel.items.length) + " 人）");
  ok(!!trSel && trSel.multi === true && trSel.compact === true && typeof trSel.onSelect === "function",
    "维度下拉 = multi + compact + onSelect（与出走马同款交互）");
  ok(f.includes('id="fDimSel_jockey"') && !!selOf("搜索骑手添加…"), "骑手 下拉挂载点 + 实例");
  ok(f.includes('id="fDimSel_mps"') && f.includes(">母父<") && !!selOf("搜索母父添加…"),
    "母父 下拉挂载点（统计页母父维度下钻落点）");
  ok(f.includes('id="fDimSel_weight"') && f.includes('f-tag">470-480') && !!selOf("搜索体重添加…"),
    "体重 下拉挂载点 + URL 预置 470-480 tag + 实例（统计页体重维度下钻落点）");
  const wSel = selOf("搜索体重添加…");
  const wIdx = v => ["<400"].concat(Array.from({ length: 15 }, (_, i) => (400 + i * 10) + "-" + (410 + i * 10))).concat([">550"]).indexOf(v);
  /* §77：体重候选 = 档位全集补零 —— 当前数据无 540-550 / >550 出走，这两档也必须保留（n=0） */
  ok(!!wSel && wSel.items.length === 17 && wSel.items.every((it, i) => wIdx(it.v) === i)
    && wSel.items.some(it => it.v === "540-550" && it.n === 0) && wSel.items.some(it => it.v === ">550" && it.n === 0),
    "体重候选 17 档全集升序（空档 540-550 / >550 补零保留，n=0）：" + (wSel && wSel.items.map(it => it.v).join("→")));
  ok(f.includes('id="fDimSel_breeder"') && !!selOf("搜索生产牧场添加…"), "生产牧场 下拉挂载点（统计页生产牧场维度下钻落点）");
  ok(f.includes('id="fDimSel_owner"') && !!selOf("搜索马主添加…"), "马主 下拉挂载点（统计页马主维度下钻落点）");
  ok(f.includes("性别") && f.includes(">セン<"), "筛选行 性别（牡/牝/セン）");
  ok(f.includes("f-tag\">矢作芳人") || f.includes('data-fk="trainer"'), "调教师已选胶囊走 data-fk 委托");
  ok(f.includes("data-k=\"grade\" data-v=\"1勝クラス\"") && f.includes("data-v=\"3勝クラス\""), "级别新增 1胜/2胜/3胜 单级 chip");
  ok(global.LIB && global.LIB.entries.length === allEntries.length, "LIB 加载完整（" + global.LIB.entries.length + " 条）");
  const bodyHtml = String(els["body"]._html);
  ok(bodyHtml.includes("共") && bodyHtml.includes("没有符合条件的比赛记录"), "renderResults 真实跑通（0 命中 → 空态提示正确渲染）");
  const clearBtn = f.includes("清空条件");
  ok(clearBtn, "有预置条件 → 显示 清空条件 按钮");

  console.log("[D] 人气维度 添加 + tag 删除（§56 后走 addDim，原生 select 已退场）");
  {
    /* 四维度已改 selector.js 搜索下拉（候选渲染在组件内部，无原生 select 事件可模拟），
     * 故直接调下拉 onSelect 走的同一个生产函数 addDim → 覆盖 FLT 更新 + refreshDimUI + renderResults */
    global.addDim("ninki", "2");
  }
  ok(global.FLT.ninki.join(",") === "1,2", "addDim 添加 → FLT.ninki = 1,2");
  ok(String(els["fDimSel_ninki"]._injected).includes('f-tag">2人気'), "tag 2人気 渲染（refreshDimUI 插到下拉挂载点前，文本带人気）");
  {
    /* 模拟点 f-tag-x 删除 1人気 → FLT=[2] */
    const h = els["filters"].handlers.click;
    const evt = { target: { closest: sel => sel === ".f-tag-x" ? { dataset: { fk: "ninki", fv: "1" } } : null } };
    if (h && h.length) h[h.length - 1].call(els["filters"], evt);
  }
  ok(global.FLT.ninki.join(",") === "2", "点 tag × → 删除 1人気（FLT.ninki = 2）");
  {
    const t = String(els["fDimSel_ninki"]._injected);
    ok(t.includes('f-tag">2人気') && !t.includes('f-tag">1人気'), "删除后 tag 区只剩 2人気（局部刷新不重建筛选条）");
  }

  console.log("[C3] 性齢列（§78/§78.1）：lib 22 列 性齢 紧随出走马；embed（profile 下段/明细）也展示");
  {
    const keys = global.YJ.raceRows.cols("lib").map(c => c.k);
    ok(keys.length === 22 && keys[0] === "horse" && keys[1] === "sexage",
      "lib 列集 22 列，性齢 紧随出走马（列序随基准）");
    const eCols = global.YJ.raceRows.cols("embed");
    ok(eCols.length === 14 && eCols[0].k === "sexage",
      "embed 无馬名上下文 14 列、性齢 首列（datechart 传 horse → 15 列 性齢 紧随馬名；§78.1）");
    const en0 = global.LIB.entries.find(en => String(en.r["性"] || "").trim() && String(en.r["年齢"] || "").trim());
    ok(!!en0 && global.YJ.raceRows.rowLibHTML(en0).includes(">" + en0.r["性"] + en0.r["年齢"] + "</td>"),
      "lib 行 性齢 单元格 = " + (en0 ? en0.r["性"] + en0.r["年齢"] : "(无样本)"));
    ok(!!en0 && global.YJ.raceRows.rowEmbedHTML(en0.r).includes(">" + en0.r["性"] + en0.r["年齢"] + "</td>"),
      "embed 行 性齢 单元格 = " + (en0 ? en0.r["性"] + en0.r["年齢"] : "(无样本)"));
    ok(global.YJ.raceRows.libTheadHTML({}).includes(">性齢<"), "lib 表头含 性齢（stub i18n 键即文案）");
    const mbLib = global.YJ.raceRows.rowLibMbHTML(en0);
    ok(mbLib.includes("yj-mb-sexage") && mbLib.includes(">" + en0.r["性"] + en0.r["年齢"] + "</span>"),
      "lib mb 卡片顶部 马名槽后带 性齢 槽");
    ok(global.YJ.raceRows.rowEmbedMbHTML(en0.r).includes("yj-mb-sexage"),
      "embed mb 卡片含 性齢 槽（§78.1 两视图一致）");
  }

  console.log("[C4] 跳转收口（§80/§80.2）：赛事名 → netkeiba SP 比赛页（venue_type 分流 JRA/NAR/db 兜底）；马名档案链接统一新标签页");
  {
    const enJra = global.LIB.entries.find(en => en.r.venue_type === "中央" && String(en.r.race_id || "").trim());
    ok(!!enJra && global.YJ.raceRows.rowLibHTML(enJra).includes('href="https://race.netkeiba.com/race/result.html?race_id=' + enJra.r.race_id + '" target="_blank"'),
      "中央 → race.netkeiba.com SP 页 race_id=" + (enJra ? enJra.r.race_id : "") + "（.yj-rlink 无提醒样式）");
    const enNar = global.LIB.entries.find(en => en.r.venue_type === "地方" && String(en.r.race_id || "").trim());
    ok(!!enNar && global.YJ.raceRows.rowLibHTML(enNar).includes('href="https://nar.netkeiba.com/race/result.html?race_id=' + enNar.r.race_id + '" target="_blank"'),
      "地方 → nar.netkeiba.com SP 页（地方独立子域）race_id=" + (enNar ? enNar.r.race_id : ""));
    const enOv = global.LIB.entries.find(en => en.r.venue_type === "海外" && String(en.r.race_id || "").trim());
    ok(!enOv || global.YJ.raceRows.rowLibHTML(enOv).includes('href="https://db.netkeiba.com/race/' + enOv.r.race_id + '/"'),
      "海外（字母 id " + (enOv ? enOv.r.race_id : "") + "）→ db.netkeiba.com/race/{id}/ 兜底");
    const enNo = global.LIB.entries.find(en => !String(en.r.race_id || "").trim());
    ok(!enNo || !global.YJ.raceRows.rowLibHTML(enNo).includes("netkeiba.com"),
      "无 race_id 行（台账海外等 8 场）赛事名保持纯文本");
    const enAny = global.LIB.entries[0];
    ok(!!enAny && global.YJ.raceRows.rowLibHTML(enAny).includes('target="_blank" rel="noopener"'),
      "出走马 → 档案链接新标签页（hjump，§80 跳转统一）");
  }

  console.log("[E] 马名口径收口（§64）· horseText 剥生产国尾缀 + 无登録名兜底「母名の生年」");
  const SUF_RE = /[（(](JPN|USA|GB|IRE|NZ|AUS|AU|FR|CAN|GER|ITY|SA|ARG|BRZ|CHI|URU|HK|SGP|UAE|NZL)[）)]$/;
  const hSuf = basic.horses.find(h => SUF_RE.test(String(h["馬名"] || "")));
  const hNil = basic.horses.find(h => !h["馬名"] && !h["欧字馬名"]);
  ok(!!hSuf && global.horseText({ h: hSuf }) === "Grand Warrior",
    "出走马列 130 = Grand Warrior（源值 " + (hSuf && hSuf["馬名"]) + " 的生产国尾缀不展示，量尺同源）");
  ok(!!hNil && global.horseText({ h: hNil }) === hNil["母名"] + "の" + hNil["生年"],
    "无登録名马（id " + (hNil && hNil.id) + "）=「母名の生年」" + (hNil && global.horseText({ h: hNil })) + "，不再降级成 #" + (hNil && hNil.id));
  global.NAME_VIEW = 1;                                    /* 中文名档：同规则（缺港译/自译也不出 #id） */
  ok(global.horseText({ h: hSuf }) === hSuf["自译馬名"] && global.horseText({ h: hNil }) === hNil["母名"] + "の" + hNil["生年"],
    "NAME_VIEW=1 同规则：130 → " + hSuf["自译馬名"] + "、无名马仍 母名の生年");
  global.NAME_VIEW = 0;
}, 100);

/* ---- [F] 两处 pack 等价性（审计 1.2）：drill 现场 pack（stub 主路径用）== 实际 dist 产物（字节级）。
 * dist 未构建时跳过（data/ 不落盘的既定取舍；打包器侧另有「dist 回读 + 对源对账」断言把关）。 ---- */
setTimeout(function () {
  const distPath = path.join(ROOT, "dist", "data", "races-bundle.json");
  if (!fs.existsSync(distPath)) { console.log("  --  [F] 跳过：dist 未构建（无可比产物）"); return; }
  const byH = {};
  for (const f of fs.readdirSync(path.join(ROOT, "data", "races")).filter(f => f.endsWith(".json"))) {
    byH[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "races", f), "utf8"));
  }
  const s = JSON.stringify(global.YJ.raceBundle.pack(byH));
  const d = fs.readFileSync(distPath, "utf8");
  ok(s === d, "drill 现场 pack == dist/data/races-bundle.json（两处 pack 等价，字节级 " + d.length + " B）");
}, 300);

/* 汇总（放最后：等微任务+finish 全跑完） */
setTimeout(function () {
  console.log("\n═══ 比赛记录页下钻冒烟汇总 ═══ 通过 " + passes + " · 失败 " + fails);
  if (fails) process.exit(1);
}, 400);
