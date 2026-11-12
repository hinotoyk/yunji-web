#!/usr/bin/env node
/* verify_caps.cjs —— 页面能力表（L2 可选挂载）离线冒烟 · 2026-11-12
 *
 * 判什么：`config/features.json`（意图）↔ `front/scripts/features.cjs` 的 CAPS（唯一 id 表）
 *        ↔ `front/pages/*.html`（事实）↔ `dist/`（构建产物）四者是否对得上。
 * 为什么：能力表的价值全在「关掉之后不炸」——关掉一项后如果导航还留着入口、页面没接空态脚本、
 *        或者 dist 少了那个页面（直连 404），配置就变成了骗人的开关。这些都不联网就能查。
 *
 * 用法：node scripts/verify_caps.cjs      （前置：npm run build 已跑过；不跑 build 则跳过 dist 段）
 * 退出码：0 全绿 / 1 有失败。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const FEATURES = require(path.join(ROOT, "front", "scripts", "features.cjs"));
const PAGES_DIR = path.join(ROOT, "front", "pages");
const DIST = path.join(ROOT, "dist");

let passes = 0, fails = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log("  ok  " + msg); }
  else { fails++; console.log("  ✗   " + msg); }
}
function section(t) { console.log("\n[" + t + "]"); }

/* 无侧栏导航入口的能力（页面从别处进入，不是遗漏）：
 * pedigree = 血统图，由基本信息页的血统区/「完整 5 代」弹窗打开，侧栏历史上就没有入口。
 * editor   = 编辑台，导航在 index.html 的 <template id="editNav"> 里，只在编辑模式开启时注入
 *            （§160：公网访客一行 DOM 都不产生）；因此断言看「模板在 + 注入条件带能力门」。 */
const NO_NAV = ["pedigree"];

const info = FEATURES.inspect();
const IDS = FEATURES.IDS;

section("A 配置契约（config/features.json → features.cjs）");
ok(info.unknown.length === 0, "无未知能力 id（拼错会被静默忽略：" + (info.unknown.join(", ") || "无") + "）");
ok(info.missingPages.length === 0, "启用的能力都有对应页面文件（缺失：" + (info.missingPages.join(", ") || "无") + "）");
ok(info.caps.profile === true, "profile 恒为启用（默认落地页，配置 false 会被强制改回）");
ok(IDS.length === 9, "能力表登记 9 项：" + IDS.join(", "));

section("B 源码接线（导航 / 空态脚本）");
const indexHtml = fs.readFileSync(path.join(ROOT, "front", "index.html"), "utf8");
IDS.forEach(function (id) {
  const hasNav = indexHtml.indexOf('data-cap="' + id + '"') >= 0;
  if (id === "editor") {
    ok(indexHtml.indexOf('id="editNav"') >= 0 && /EDIT_MODE\(\)\s*&&\s*capOn\('editor'\)/.test(indexHtml),
      "编辑导航在 template 里，注入条件带能力门（EDIT_MODE() && capOn('editor')）");
  } else if (NO_NAV.indexOf(id) >= 0) {
    ok(!hasNav, id + " 不在侧栏导航（" + NO_NAV.join("/") + " 由页面内入口进入，属预期）");
  } else {
    ok(hasNav, "侧栏有 " + id + " 的导航项（data-cap）");
  }
});

/* 只读页必须引 yj-cap.js；编辑页不引（由 yj-edit-gate.js 统一门禁，避免两个脚本抢 body） */
IDS.forEach(function (id) {
  FEATURES.CAPS[id].pages.forEach(function (p) {
    const file = path.join(PAGES_DIR, p + ".html");
    if (!fs.existsSync(file)) return;                  /* 文件缺失已在 A 段报过 */
    const html = fs.readFileSync(file, "utf8");
    if (id === "editor") {
      ok(html.indexOf("yj-edit-gate.js") >= 0 && html.indexOf("yj-cap.js") < 0,
        "编辑页 " + p + " 走 yj-edit-gate.js 门禁（不引 yj-cap.js）");
    } else {
      ok(html.indexOf("yj-cap.js") >= 0, "页面 " + p + " 引了 yj-cap.js（关闭时显示空态卡片）");
    }
  });
});

/* 反向：每个页面文件都必须在 CAPS 里登记，否则它游离于能力表之外（关了也关不掉） */
const unregistered = FEATURES.pageEntries().filter(function (p) { return !FEATURES.PAGE_CAP[p]; });
ok(unregistered.length === 0, "front/pages 下无「未登记能力」的页面（" + (unregistered.join(", ") || "无") + "）");

section("C 构建产物（dist/）");
const cfgFile = path.join(DIST, "site-config.js");
let W = null;
if (!fs.existsSync(cfgFile)) {
  console.log("  ·  dist 不存在或未构建 → 跳过 C/D 段（先 cd front && npm run build）");
} else {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(cfgFile, "utf8"), sandbox, { timeout: 2000 });
  W = sandbox.window;
  const built = (W.YJ_SITE && W.YJ_SITE.features) || {};
  ok(JSON.stringify(built) === JSON.stringify(info.caps),
    "dist 的 features 与 config 一致（" + IDS.filter(function (i) { return built[i]; }).length + "/" + IDS.length + " 启用）");
  ok(W.YJ_CAP && W.YJ_CAP.pageCap && typeof W.YJ_CAP.pageCap === "object",
    "dist 注入了 YJ_CAP.pageCap（页面 → 能力映射）");
  const missMeta = FEATURES.pageEntries().filter(function (p) { return !(W.YJ_CAP.pageCap || {})[p]; });
  ok(missMeta.length === 0, "每个页面都有能力映射（缺：" + (missMeta.join(", ") || "无") + "）");
  ok(!!(W.YJ_CAP.labels && W.YJ_CAP.labels.editor), "YJ_CAP.labels 带中文名（空态卡片标题用）");

  const missDist = [];
  IDS.forEach(function (id) {
    FEATURES.CAPS[id].pages.forEach(function (p) {
      if (!fs.existsSync(path.join(DIST, "pages", p + ".html"))) missDist.push(p);
    });
  });
  ok(missDist.length === 0, "关闭的能力**仍然构建**（空态卡片要靠它，缺：" + (missDist.join(", ") || "无") + "）");
  ok(fs.existsSync(path.join(DIST, "yj-cap.js")), "dist 根有 yj-cap.js");
}

/* D 段：跨站引用（P1-0）。两个兄弟站地址也是「站点身份」的一部分，空 = 该功能关闭。
 * 这条最容易在 fork 后漏：不配就会去抓原作者的部署（公开数据、不涉隐私，但原作者关站即空）。 */
section("D 跨站引用（config/sire.json → site.cross_site）");
const sireCfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "sire.json"), "utf8"));
const cs = (sireCfg.site && sireCfg.site.cross_site) || {};
const csWant = {
  jbisRank: String(cs.jbis_rank == null ? "" : cs.jbis_rank).trim(),
  rc: String(cs.racing_calendar == null ? "" : cs.racing_calendar).trim()
};
ok(typeof cs.jbis_rank === "string" || cs.jbis_rank === undefined,
  "cross_site.jbis_rank 为字符串（空串 / 缺省 = 关闭「种马榜走势」）");
ok(typeof cs.racing_calendar === "string" || cs.racing_calendar === undefined,
  "cross_site.racing_calendar 为字符串（空串 / 缺省 = 关闭「出走马表」）");
if (W) {
  ok(JSON.stringify(W.YJ_SITE.crossSite) === JSON.stringify(csWant),
    "dist 的 crossSite 与 config 一致（种马榜走势:" + (csWant.jbisRank ? "开" : "关") +
    " / 出走马表:" + (csWant.rc ? "开" : "关") + "）");
  /* 两个消费页都必须先加载 site-config.js —— crossSite 的值全靠它（getter 调用时求值） */
  ["stats", "entries"].forEach(function (p) {
    const html = fs.readFileSync(path.join(PAGES_DIR, p + ".html"), "utf8");
    ok(html.indexOf("../site-config.js") >= 0, p + " 引了 site-config.js（crossSite 的运行时来源）");
    ok(html.indexOf("../data-config.js") >= 0, p + " 引了 data-config.js（remote 的求值点）");
  });
}

console.log("\n═══ 页面能力表断言汇总 ═══ 通过 " + passes + " · 失败 " + fails);
if (fails) process.exit(1);
