/* 比赛记录页 · 下钻冒烟（统计总览矩阵行 → races.html?f=... 全链路）
 * 用间接 eval 执行真实页面脚本（非 strict → 顶层 var/function 落到 global），
 * stub DOM + fetch + YJ.*（selector/bus/device/i18n），让 initLibrary 真跑完：
 *   [A] URL_F 解析 + validFilterValue 应用（无效值丢弃）
 *   [B] FLT 预置后 matchEntry 命中数 == 源数据独立重算（口径互证，覆盖新维度）
 *   [C] renderFilters 新筛选行（回り/人气/性别/调教师/骑手 select）渲染 + 页面不崩
 * 用法: node tests/_verify-races-drill.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

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
    id, _html: "", text: "", value: "", style: {}, dataset: {}, attrs: {}, handlers: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    set textContent(v) { this.text = String(v); }, get textContent() { return this.text; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
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
    init() {},
    getHorses() { return basic.horses; },
  },
};

/* 间接 eval → 页面 var/function 落到 global（后续可读 LIB/FLT/entryVal/matchEntry） */
(0, eval)(code);

/* ---- 期望：从源数据独立重算（口径镜像 _verify-stats.cjs [B]，证明两页一致） ---- */
const DNF_SET = new Set(["中止", "失格"]), EXC_SET = new Set(["取消", "除外"]);
const distOf = d => { d = Number(d); if (!isFinite(d) || !d) return ""; return d <= 1400 ? "短距离" : d <= 1800 ? "英里" : d <= 2400 ? "中距离" : "长距离"; };
const ninkiOf = n => { if (n === "" || n == null) return ""; n = Number(n); if (!isFinite(n) || n < 1 || n > 18) return ""; return String(n); };
const turnOf = c => { const s = String(c || ""); return s.slice(0, 1) === "右" ? "右" : s.slice(0, 1) === "左" ? "左" : ""; };
const sexOf = s => (String(s || "").trim() === "セ" ? "セン" : String(s || "").trim());
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
  if (sexOf(en.h.性別) !== "牝") return false;
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
  /* 还原 12 维组合（供 [C] 继续） */
  global.DIM_KEYS.forEach(kk => { global.FLT[kk] = []; });
  global.URL_F && global.DIM_KEYS.forEach(k => {
    const vals = global.URL_F[k];
    if (!vals) return;
    vals.forEach(v => { if (global.validFilterValue(k, v)) global.FLT[k].push(v); });
  });

  console.log("[C] renderFilters 新筛选行 + 页面不崩");
  const f = String(els["filters"]._html);
  ok(f.includes("赛道方向") && f.includes("右转") && f.includes("左转"), "筛选行 赛道方向（右转/左转）");
  ok(f.includes('data-sel="ninki"') && f.includes('f-tag">1人気'), "筛选行 人气 select + 已选 tag（1人気，同调教师/骑手逻辑）");
  ok(!f.includes(">1人気（"), "人气 select 选项排除已选值（1人気仅以 tag 存在）");
  ok(f.match(/1人気（\d+场）/), "人气选项带出赛数（1人気（N场））且固定升序");
  ok(f.indexOf(">2人気（") < f.indexOf(">10人気（"), "人气选项 1→18 升序（2人気 在 10人気 之前）");
  ok(f.includes("性别") && f.includes(">セン<"), "筛选行 性别（牡/牝/セン）");
  ok(f.includes('data-sel="trainer"') && f.includes('data-k="trainer" data-v="矢作芳人"'.replace("data-k=\"trainer\" ", "")) ||
     f.includes("f-tag\">矢作芳人"), "调教师 select 行 + 已选 tag");
  ok(!f.includes("矢作芳人（"), "调教师 select 选项排除已选值（矢作芳人仅以 tag 存在）");
  ok(!!f.match(/（\d+场）/), "调教师选项带出赛数（如 福永祐一（44场））");
  ok(f.includes('data-sel="jockey"') && f.includes("f-tag\">武豊"), "骑手 select 行 + 已选 tag");
  ok(f.includes("data-k=\"grade\" data-v=\"1勝クラス\"") && f.includes("data-v=\"3勝クラス\""), "级别新增 1胜/2胜/3胜 单级 chip");
  ok(global.LIB && global.LIB.entries.length === allEntries.length, "LIB 加载完整（" + global.LIB.entries.length + " 条）");
  const bodyHtml = String(els["body"]._html);
  ok(bodyHtml.includes("共") && bodyHtml.includes("没有符合条件的比赛记录"), "renderResults 真实跑通（0 命中 → 空态提示正确渲染）");
  const clearBtn = f.includes("清空条件");
  ok(clearBtn, "有预置条件 → 显示 清空条件 按钮");

  console.log("[D] 人气 select 交互（添加 + tag 删除，同调教师/骑手）");
  {
    /* 模拟 select change：ninki 选 2 → FLT=[1,2]（URL 已预置 1） */
    const h = els["filters"].handlers.change;
    const evt = { target: { closest: sel => sel === "select[data-sel]" ? { dataset: { sel: "ninki" }, value: "2" } : null } };
    if (h && h.length) h[h.length - 1].call(els["filters"], evt);
  }
  ok(global.FLT.ninki.join(",") === "1,2", "select 添加 → FLT.ninki = 1,2");
  ok(String(els["filters"]._html).includes('f-tag">2人気'), "tag 2人気 渲染（文本带人気）");
  {
    /* 模拟点 f-tag-x 删除 1人気 → FLT=[2] */
    const h = els["filters"].handlers.click;
    const evt = { target: { closest: sel => sel === ".f-tag-x" ? { dataset: { fk: "ninki", fv: "1" } } : null } };
    if (h && h.length) h[h.length - 1].call(els["filters"], evt);
  }
  ok(global.FLT.ninki.join(",") === "2", "点 tag × → 删除 1人気（FLT.ninki = 2）");
}, 100);

/* 汇总（放最后：等微任务+finish 全跑完） */
setTimeout(function () {
  console.log("\n═══ 比赛记录页下钻冒烟汇总 ═══ 通过 " + passes + " · 失败 " + fails);
  if (fails) process.exit(1);
}, 400);
