#!/usr/bin/env node
/* 构建期打包器：data/races/*.json → dist/data/races-bundle.json（D11 替换式派生，data/ 仓库不落产物）。
 * 由 vite copy-data 插件调用（front/vite.config.js）；编辑保存管道只跑 merge_basic、不动 races/*.json
 * → bundle 不会因编辑保存过期，管线（run_update.py）零改动。
 * 自检①：pack → decode 与源逐马数据语义全等（含未知键 Rt / 无 race_id 台账）；
 * 自检②（审计 1.2）：dist 写盘产物回读 + 独立 decode 对源对账 + 字节一致。任一不等即 build 失败。
 * 用法: node front/scripts/build-races-bundle.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/* 复用共享编解码模块（单一出处）：window stub + 间接 eval，与 verify_drill.cjs 同法 */
globalThis.window = globalThis;
(0, eval)(fs.readFileSync(path.join(ROOT, "front", "public", "race-bundle.js"), "utf8"));
const RB = globalThis.YJ.raceBundle;

const SRC = path.join(ROOT, "data", "races");
const DST = path.join(ROOT, "dist", "data", "races-bundle.json");
const by = {};
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith(".json")).sort()) {
  by[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
}
const bundle = RB.pack(by);
const back = RB.decode(bundle);

/* ---- round-trip 语义全等断言（null ≡ 缺失；键集与值逐项比对）----
 * 同场字段以首见为准是 pack 的既定语义 → 若源数据出现「同 race_id 场次级字段分歧」，
 * 这里会直接失败（stop-the-line），先修数据再上线。 */
const eqVal = (a, b) => a === b || (a == null && b == null);
function cmpObj(src, dec, at) {
  const keys = new Set([...Object.keys(src), ...Object.keys(dec)]);
  const probs = [];
  for (const k of keys) {
    if (!eqVal(src[k], dec[k])) probs.push(at + "." + k + ": " + JSON.stringify(src[k]) + " != " + JSON.stringify(dec[k]));
  }
  return probs;
}
let nEntries = 0;
for (const hid of Object.keys(by)) nEntries += by[hid].length;   /* 只按源计一次（reconcile 跑两遍） */
function reconcile(backMap) {
  const probs = [];
  for (const hid of Object.keys(by)) {
    const src = by[hid], dec = backMap[hid] || [];
    if (src.length !== dec.length) probs.push(hid + ": 条数 " + src.length + " != " + dec.length);
    for (let i = 0; i < Math.min(src.length, dec.length); i++) probs.push(...cmpObj(src[i], dec[i], hid + "[" + i + "]"));
  }
  if (Object.keys(backMap).length !== Object.keys(by).length) probs.push("马数不一致: " + Object.keys(by).length + " != " + Object.keys(backMap).length);
  return probs;
}
const problems = reconcile(back);
if (problems.length) {
  console.error("[races-bundle] round-trip 断言失败 " + problems.length + " 处：");
  problems.slice(0, 20).forEach(p => console.error("  " + p));
  process.exit(1);
}

fs.mkdirSync(path.dirname(DST), { recursive: true });
const txt = JSON.stringify(bundle);
fs.writeFileSync(DST, txt);

/* ---- 产物回读断言（审计 1.2）：独立 decode 实际写盘的 dist 文件并与源逐马对账。
 * 校验对象是「写盘产物」而非内存对象——写盘链路异常或其他 pack 调用点漂移产物时在此拦截。 ---- */
const distObj = JSON.parse(fs.readFileSync(DST, "utf8"));
if (JSON.stringify(distObj) !== txt) {
  console.error("[races-bundle] dist 回读与写入内容字节不一致（写盘链路异常）");
  process.exit(1);
}
const probsDist = reconcile(RB.decode(distObj));
if (probsDist.length) {
  console.error("[races-bundle] dist 回读对源对账失败 " + probsDist.length + " 处：");
  probsDist.slice(0, 20).forEach(p => console.error("  " + p));
  process.exit(1);
}

const raw = Object.keys(by).reduce((s, k) => s + JSON.stringify(by[k]).length, 0);
console.log("[races-bundle] " + Object.keys(by).length + " 马 · " + nEntries + " 条 · 源 minified " + (raw / 1024).toFixed(0) + "KB → bundle " + (Buffer.byteLength(txt) / 1024).toFixed(0) + "KB → " + path.relative(ROOT, DST) + "（round-trip + dist 回读对账通过）");
