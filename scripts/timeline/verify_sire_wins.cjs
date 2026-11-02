#!/usr/bin/env node
/* verify_sire_wins.cjs —— 父子制覇数据源（data/sire_wins.json）冒烟
 *
 * 背景（2026-11-02）：sire.wins 原为手工表、无校验源，kzn 曾写出キズナ 从未出走的「きさらぎ賞」，
 * 让 2025-02-09 サトノシャイニング 赢きさらぎ賞 时冒出凭空徽章。改派生后（sync_sire_wins.py 抓种马
 * 本人 netkeiba 成绩页）事实源 = 成绩页，本脚本守的是**派生链的完整性**（产物 ↔ 配置 ↔ 时间线 ↔ 源数据）。
 *
 * 断言（全离线，不联网）：
 *   A 产物结构与自洽：schema / count / wins 非空
 *   B 赛名唯一（norm 去格级尾缀 + 去空格后）
 *   C 格 ∈ 重赏枚举（GI/GII/GIII/JpnI-III/JGI-JGIII）
 *   D 日期合法（YYYY-MM-DD）且不晚于今天
 *   E 与 config/sire.json 的手工表一致（产物存在时，配置只是兜底；漂移 = 改了配置没重跑派生）
 *   F timeline.json 的 meta.stats.sire_wins == 按源数据重算的命中数
 *   G timeline 每条 cat="sire" 标签的 tip 能反查到产物条目
 *
 * 用法：node scripts/timeline/verify_sire_wins.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");
const GRADED = new Set(["GI", "GII", "GIII", "JpnI", "JpnII", "JpnIII", "JGI", "JGII", "JGIII"]);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ok  " + msg); } else { fail++; console.log("  FAIL " + msg); } };

/* 与 build_timeline.norm_race 同口径 */
const norm = (s) => String(s == null ? "" : s)
  .replace(/[（(][^()（）]*[)）]\s*$/, "")
  .replace(/[ 　]/g, "")
  .trim();

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

console.log("[A] 派生产物 data/sire_wins.json");
const doc = readJson(path.join(DATA, "sire_wins.json"));
ok(!!doc, "产物存在且是合法 JSON（缺失 → 先跑 python scripts/timeline/sync_sire_wins.py）");
const wins = (doc && Array.isArray(doc.wins)) ? doc.wins : [];
ok(wins.length > 0, "wins 非空（" + wins.length + " 项）");
ok(!!doc && doc.meta && doc.meta.schema === "sire-wins/v1", "meta.schema = sire-wins/v1");
ok(!!doc && doc.meta && doc.meta.count === wins.length, "meta.count 与 wins 条数一致（" + wins.length + "）");
ok(!!doc && doc.meta && /horse\/result\/\d+\//.test(String(doc.meta.source || "")), "meta.source 指向 netkeiba 成绩页：" + (doc && doc.meta ? doc.meta.source : "-"));

console.log("[B] 赛名唯一");
const seen = new Map();
let dup = "";
wins.forEach((w) => {
  const k = norm(w.name);
  if (seen.has(k)) dup = k + "（" + seen.get(k) + " / " + w.date + "）";
  else seen.set(k, w.date);
});
ok(!dup, dup ? "重复赛名：" + dup : "无重复赛名（" + wins.length + " 项唯一）");

console.log("[C] 格 = 重赏");
const badGrade = wins.filter((w) => !GRADED.has(String(w.grade || ""))).map((w) => w.name + ":" + w.grade);
ok(badGrade.length === 0, badGrade.length ? "非重赏条目：" + badGrade.join("、") : "全部为重赏格（L/OP/条件战不入表）");

console.log("[D] 日期合法");
const today = new Date().toISOString().slice(0, 10);
const badDate = wins.filter((w) => !/^\d{4}-\d{2}-\d{2}$/.test(String(w.date || "")) || w.date > today)
  .map((w) => w.name + ":" + w.date);
ok(badDate.length === 0, badDate.length ? "非法日期：" + badDate.join("、") : "日期均为合法 YYYY-MM-DD 且不晚于今天");

console.log("[E] 与 config/sire.json 手工表一致（产物存在时配置只是兜底）");
const cfg = readJson(path.join(ROOT, "config", "sire.json")) || {};
const cfgWins = (cfg.sire && Array.isArray(cfg.sire.wins)) ? cfg.sire.wins : [];
if (cfgWins.length) {
  const a = wins.map((w) => norm(w.name)).sort().join(",");
  const b = cfgWins.map((w) => norm(w.name)).sort().join(",");
  ok(a === b, a === b
    ? "配置与产物一致（" + wins.length + " 项）"
    : "配置与产物漂移 → 改了 config 要重跑 sync_sire_wins.py\n        产物：" + a + "\n        配置：" + b);
} else {
  ok(true, "配置无手工表（纯派生模式）");
}

console.log("[F] timeline.sire_wins == 源数据实际命中数");
const tl = readJson(path.join(DATA, "timeline.json")) || {};
const set = new Set(wins.map((w) => norm(w.name)));
let hits = 0;
for (const f of fs.readdirSync(path.join(DATA, "races"))) {
  if (!f.endsWith(".json")) continue;
  const recs = readJson(path.join(DATA, "races", f)) || [];
  for (const r of recs) if (r["結果"] === 1 && set.has(norm(r["レース名"]))) hits++;
}
const metaWins = tl.meta && tl.meta.stats ? tl.meta.stats.sire_wins : null;
ok(metaWins === hits, "timeline " + metaWins + " 次 = 源数据重算 " + hits + " 次");

console.log("[G] 每条 sire 标签都能反查到产物");
const labelBad = [];
(tl.events || []).forEach((e) => {
  (e.tags || []).forEach((t) => {
    if (t.cat !== "sire") return;
    const tip = String(t.tip || "");
    const hit = wins.some((w) => tip.endsWith(String(w.cn || w.name)) || tip.endsWith(w.name));
    if (!hit) labelBad.push((e.date || "") + " " + (e.horse && e.horse.name) + "：" + tip);
  });
});
ok(labelBad.length === 0, labelBad.length ? "tip 反查失败：" + labelBad.join(" | ") : "全部 " + hits + " 条 sire 标签 tip 均命中产物条目");

console.log("\n═══ 父子制覇数据源冒烟汇总 ═══ 通过 " + pass + " · 失败 " + fail);
process.exit(fail ? 1 : 0);
