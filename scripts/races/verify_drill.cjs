/* 比赛记录页 · 下钻冒烟（统计总览矩阵行 → races.html?f=... 全链路）
 * 用间接 eval 执行真实页面脚本（非 strict → 顶层 var/function 落到 global），
 * stub DOM + fetch + YJ.*（selector/bus/device/i18n），让 initLibrary 真跑完：
 *   [A] URL_F 解析 + validFilterValue 应用（无效值丢弃）
 *   [B] FLT 预置后 matchEntry 命中数 == 源数据独立重算（口径互证，覆盖新维度）
 *   [C] renderFilters 新筛选行（赛道方向/人气/性别/调教师/骑手 select）渲染 + 页面不崩
 *   [D] 人气 select 交互（添加 + tag 删除，同调教师/骑手）
 *   [E] 马名口径收口（horseText 剥生产国尾缀 + 无登録名兜底「母名の生年」，见 UI优化记录 §64）
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
  const txt = fs.readFileSync(path.join(ROOT, String(url)), "utf8");
  return Promise.resolve({ ok: true, json() { return Promise.resolve(JSON.parse(txt)); } });
};

/* 下钻 URL：覆盖全部新维度 + 2 个无效值（grade:ZZZ / track:不存在）+ 一个枚举外值（sex:未知） */
const DRILL_F = ["surface:ダ", "venue:中央", "dist:中距离", "cond:良", "turn:右", "ninki:1",
  "sex:牝", "grade:2勝クラス", "trainer:矢作芳人", "jockey:武豊", "result:一着", "byear:2024",
  "grade:ZZZ", "track:不存在", "sex:未知"].join(",");
global.location = { search: "?f=" + encodeURIComponent(DRILL_F), href: "" };
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
 * （比赛行/徽章渲染已下沉，见 UI优化记录 §42）。浏览器里它们先于页面脚本加载，stub 环境须保持同样顺序。 */
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "yj-util.js"), "utf8"));
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "race-rows.js"), "utf8"));

/* 间接 eval → 页面 var/function 落到 global（后续可读 LIB/FLT/entryVal/matchEntry） */
(0, eval)(code);

/* ---- 期望：从源数据独立重算（口径镜像 scripts/stats/verify_stats.cjs [B]，证明两页一致） ---- */
const DNF_SET = new Set(["中止", "失格"]), EXC_SET = new Set(["取消", "除外"]);
const distOf = d => { d = Number(d); if (!isFinite(d) || !d) return ""; return d <= 1400 ? "短距离" : d <= 1800 ? "英里" : d <= 2400 ? "中距离" : "长距离"; };
const ninkiOf = n => { if (n === "" || n == null) return ""; n = Number(n); if (!isFinite(n) || n < 1 || n > 18) return ""; return String(n); };
const turnOf = c => { const s = String(c || ""); return s.slice(0, 1) === "右" ? "右" : s.slice(0, 1) === "左" ? "左" : ""; };
const sexOf = s => (String(s || "").trim() === "セ" ? "セン" : String(s || "").trim());
const sexOfH = h => sexOf((h || {}).性別_当前 || (h || {}).性別);   // 当前性别（同 races.html entryVal / YJ.util.sexOf）
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
     global.FLT.result[0] === "一着" && global.FLT.byear[0] === "2024", "其余 8 个有效维度全部应用");

  console.log("[B] matchEntry 命中数 == 源数据独立重算");
  const hit = global.LIB.entries.filter(en => global.matchEntry(en)).length;
  ok(hit === expCount, "12 维 AND 命中 " + hit + " == 独立重算 " + expCount + "（均为 0，负例一致）");
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
  /* 还原 12 维组合（供 [C] 继续） */
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

/* 汇总（放最后：等微任务+finish 全跑完） */
setTimeout(function () {
  console.log("\n═══ 比赛记录页下钻冒烟汇总 ═══ 通过 " + passes + " · 失败 " + fails);
  if (fails) process.exit(1);
}, 400);
