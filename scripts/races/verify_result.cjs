/* races.html 着顺三态口径断言（2026-09 引入；文案定稿：完赛/未完赛/未出走）
 * 口径：完赛=数字着顺；未完赛=中止/失格（计入出走）；未出走=取消/除外（不计出走）
 * 对齐 netkeiba 出走回数（産駒成績累計 678 = 677 数字着顺 + 1 中止，取消/除外不计）
 * 运行：node scripts/races/verify_result.cjs  （读 data/races/*.json 全量对账） */
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "..", "..", "data", "races");

function resultCode(n){
  return typeof n === "number" ? "fin" : (n === "中止" || n === "失格") ? "dnf" : "dnr";
}
function resultMatches(n, opt){
  if (opt === "一着") return n === 1;
  if (opt === "二着") return n === 2;
  if (opt === "三着") return n === 3;
  if (opt === "着外") return typeof n === "number" && n >= 4;
  if (opt === "完赛") return typeof n === "number";
  if (opt === "未完赛") return n === "中止" || n === "失格";
  if (opt === "未出走") return n === "取消" || n === "除外";
  return false;
}

const rows = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".json")) continue;
  rows.push(...JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
}

let fails = 0;
function assert(cond, msg){ if (!cond){ fails++; console.error("FAIL: " + msg); } }

/* [1] 三态分类：总和闭合 + 字符串着顺白名单（出现新值如「降着」会 FAIL 提醒归入完走）
 *     分布快照（2026-09-14 数据）：完赛 733 / 未完赛 1（中止） / 未出走 6（取消 2·除外 4） */
const KNOWN_STR = ["中止", "取消", "除外", "失格"];
const cnt = { fin: 0, dnf: 0, dnr: 0 };
rows.forEach(r => {
  cnt[resultCode(r.結果)]++;
  if (typeof r.結果 === "string") assert(KNOWN_STR.includes(r.結果), "未知字符串着顺「" + r.結果 + "」（需确认口径归属）");
});
assert(rows.length === cnt.fin + cnt.dnf + cnt.dnr, "三态总和=总记录数");

/* [2] 七个着顺选项：每条至少命中一项；多重命中仅允许「完赛+其子集」
 *     （完赛=聚合项，⊃ 一着/二着/三着/着外，同 GRADE_OPTS「重赏」⊃ G1/G2/G3 模式） */
const OPTS = ["一着","二着","三着","着外","完赛","未完赛","未出走"];
const SUB = ["一着","二着","三着","着外"];
let bad = 0;
rows.forEach(r => {
  const hits = OPTS.filter(o => resultMatches(r.結果, o));
  const ok = hits.length >= 1 && hits.every(h => h === "完赛" || !hits.includes("完赛") || SUB.includes(h));
  if (!ok) bad++;
});
assert(bad === 0, "选项命中异常（未命中或非法重叠）" + bad + " 条");

/* [3] 聚合关系：前三 + 着外 = 完赛；一/二/三着与着外不重叠 */
const top3 = rows.filter(r => resultMatches(r.結果, "一着") || resultMatches(r.結果, "二着") || resultMatches(r.結果, "三着")).length;
const fuko = rows.filter(r => resultMatches(r.結果, "着外")).length;
assert(top3 + fuko === cnt.fin, "前三(" + top3 + ")+着外(" + fuko + ")=完赛(" + cnt.fin + ")");

/* [4] 出走口径：出走 = 完赛 + 未完赛（不含未出走） */
const syusso = rows.filter(r => resultCode(r.結果) !== "dnr").length;
assert(syusso === cnt.fin + cnt.dnf, "出走=完赛+未完赛=" + syusso);

if (fails) { console.error(fails + " 项断言失败"); process.exit(1); }
console.log("races 着顺三态断言全部通过：总 " + rows.length +
  " = 完赛 " + cnt.fin + " + 未完赛 " + cnt.dnf + " + 未出走 " + cnt.dnr +
  "（出走口径 " + (cnt.fin + cnt.dnf) + "）");
