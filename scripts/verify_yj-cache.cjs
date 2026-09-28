/* yj-cache 冒烟断言（node，无浏览器）：stub fetch/Date，覆盖控制器全部分支：
 *   [A1] 首访直连 + 写缓存     [A2] 新鲜期（<REVAL）0 请求
 *   [A3] 软过期 → 秒开旧值 + 后台 SWR 304 续期 → 续期后回新鲜期 0 请求
 *   [A4] 硬过期 → 同步重取     [A5] 软过期 SWR 节流（同页同键至多一次）
 *   [A6] 硬过期 + 取新失败 → 回退旧缓存（不抛）
 *   [A7] clear('stats') 定向清除
 *   [B1] 新页生命周期（重 eval）软过期 SWR 200 → 更新缓存 + onUpdate 回调
 * 降级路径（node 无 caches → COK=false）全程覆盖：与浏览器 Cache API 同一套读写层。
 * 用法: node scripts/verify_yj-cache.cjs */
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log("  ok  " + msg); } else { fails++; console.log("  FAIL " + msg); } };

/* ---- stub 环境（先于 eval：模块顶层读 document/location/caches/YJ_DATA）---- */
global.document = { baseURI: "http://x.test/pages/races.html" };
global.location = { href: "http://x.test/pages/races.html" };
global.YJ_DATA = { url(p) { return "data/" + p; } };          /* 浏览器里由 data-config.js 提供 */
global.window = global;

const CODE = fs.readFileSync(path.join(ROOT, "front", "public", "yj-cache.js"), "utf8");
const MIN = 60 * 1000, H = 60 * MIN;
let mode = 200, payloadN = 0, shift = 0;                       /* mode: 200|304|"fail" · shift: 假钟偏移 */
const calls = [];
const RESP = () => ({
  ok: mode === 200,                                            /* 真实 fetch：304 → ok=false */
  status: mode,
  headers: { get(k) { return k === "ETag" ? 'W/"v' + payloadN + '"' : (k === "Last-Modified" ? "Mon, 28 Sep 2026 00:00:00 GMT" : ""); } },
  json() { return Promise.resolve({ v: payloadN, tag: "p" + payloadN }); },
});
global.fetch = function (u, o) {
  calls.push({ u: String(u), inm: (o && o.headers && o.headers["If-None-Match"]) || "", ims: (o && o.headers && o.headers["If-Modified-Since"]) || "" });
  if (mode === "fail") return Promise.reject(new Error("网络断"));
  return Promise.resolve(RESP());
};
/* 模块内一律裸调 Date.now()（全局查找）→ 换 global.Date.now 即可拨钟 */
const RealNow = Date.now.bind(Date);
Date.now = () => RealNow() + shift;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  (0, eval)(CODE);
  const C = global.YJ.cache;

  console.log("[A1] 首访直连 + 写缓存");
  const d1 = await C.fetch("stats");
  ok(d1 && d1.tag === "p0", "返回解析后 JSON（tag=p0）");
  ok(calls.length === 1 && calls[0].u === "http://x.test/pages/data/stats.json", "1 次网络请求 · 绝对 URL 求址（stub YJ_DATA 无 .. 前缀 → pages/ 下解析）");
  ok(calls[0].inm === "" && calls[0].ims === "", "首访无条件请求头");

  console.log("[A2] 新鲜期（<10min）0 请求");
  const d2 = await C.fetch("stats");
  ok(calls.length === 1 && d2.tag === "p0", "内存命中：仍 1 次请求 · 数据一致");

  console.log("[A3] 软过期 → 秒开 + SWR 304 续期");
  mode = 304; shift = 11 * MIN;                                /* 11min：过 REVAL、远小于 12h */
  const d3 = await C.fetch("stats");
  ok(d3.tag === "p0", "秒开旧值（不等网络）");
  await sleep(30);
  ok(calls.length === 2, "后台补 1 次条件校验");
  ok(calls[1].inm === 'W/"v0"' && calls[1].ims !== "", "带 If-None-Match + If-Modified-Since");
  const d3b = await C.fetch("stats");                          /* 304 已续期 → 回新鲜期 */
  ok(calls.length === 2 && d3b.tag === "p0", "续期生效：再取 0 请求");

  console.log("[A4] 硬过期 → 同步重取");
  mode = 200; payloadN = 2; shift = 13 * H;                    /* env.t≈11min → age≈12h49m > 12h */
  const d4 = await C.fetch("stats");
  ok(d4.tag === "p2" && calls.length === 3, "硬过期取到全量新值 p2");

  console.log("[A5] 软过期 SWR 节流（同页同键至多一次）");
  shift += 11 * MIN;                                           /* age 11min → 软过期，但 revalidated 已置位 */
  const d5 = await C.fetch("stats");
  await sleep(30);
  ok(d5.tag === "p2" && calls.length === 3, "不再重复校验（节流）· 旧值照常");

  console.log("[A6] 硬过期 + 取新失败 → 回退旧缓存");
  mode = "fail"; shift = 26 * H;                               /* age≈26h−13h=13h > 12h → 硬过期 */
  const d6 = await C.fetch("stats");
  await sleep(30);
  ok(d6.tag === "p2" && calls.length === 4, "取新失败不抛错 · 回退旧缓存 p2");

  console.log("[A7] clear('stats') 定向清除");
  mode = 200; payloadN = 3;
  await C.clear("stats");
  const d7 = await C.fetch("stats");
  ok(d7.tag === "p3" && calls.length === 5, "清除后重新直连 → p3");

  console.log("[B1] 新页生命周期（重 eval）· SWR 200 → 更新 + onUpdate");
  (0, eval)(CODE);                                             /* 重 eval = 新闭包（新页） */
  const C2 = global.YJ.cache;
  mode = 200; payloadN = 1; shift = 0;
  const calls2 = [];
  const callsB = calls.splice(0, calls.length);                /* 清空台账，B 段独立计数 */
  global.fetch = function (u, o) {
    calls2.push(String(u));
    if (mode === "fail") return Promise.reject(new Error("网络断"));
    return Promise.resolve(RESP());
  };
  let updated = null;
  const b1 = await C2.fetch("stats", { onUpdate: d => { updated = d; } });
  ok(b1.tag === "p1", "新页基线 p1");
  payloadN = 2; shift = 11 * MIN;                              /* 软过期，源已有新数据 */
  const b2 = await C2.fetch("stats", { onUpdate: d => { updated = d; } });
  ok(b2.tag === "p1", "秒开旧值 p1");
  await sleep(30);
  ok(updated && updated.tag === "p2", "onUpdate 收到新数据 p2");
  const b3 = await C2.fetch("stats");
  ok(b3.tag === "p2", "后续读取拿到新值 p2（缓存已更新）");

  console.log("\n═══ yj-cache 冒烟汇总 ═══ 通过 " + passes + " · 失败 " + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("冒烟异常:", e && (e.stack || e.message)); process.exit(1); });
