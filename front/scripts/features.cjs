/* features.cjs —— 页面能力表（L2「可选挂载」的唯一出处，2026-11-12 试点）
 *
 * 一、这个文件解决什么
 *   页面级能力的「有没有」由 config/features.json 声明，本文件是那份 JSON 的**唯一解析器**：
 *   vite.config.js（CJS require）与 gen-site-config.mjs（ESM default import）共用同一份逻辑，
 *   避免「构建入口一套判断、运行时另一套判断」这种最容易漂移的双实现。
 *
 * 二、语义（与 AGENTS.md「缺失语义二分法」一致）
 *   - **缺文件 / 缺 features 段 / 缺某个键 = 该能力启用**。所以老站（kzn 同步过去还没这文件）
 *     行为完全不变，只写要关的：`{ "entries": false }`。
 *   - `features.profile` 永远为 true（它是默认落地页，关掉它会造成「没有任何页面可落地」的边界情况，
 *     配置成 false 时本文件打 ⚠ 并强制忽略）。
 *   - 值非布尔 → 打 ⚠ 并按 true 处理（宁可多一块，不可静默少一块）。
 *   - 未知键（拼错，如 "stat"）→ 打 ⚠ 列出可用 id：拼错的表现必须是"没反应 + 有提示"，
 *     不能是"配置里写了却没生效也不说话"。
 *
 * 三、能力与页面文件的关系
 *   一个能力可能对应多个入口文件（editor → 4 个编辑页）。**入口清单不在这里维护**：
 *   vite.config.js 直接扫 front/pages/*.html 生成 rollup input，删文件不会让 build 失败
 *   （这是「缺了不报错」在构建层的落地）；本文件的 pages 只用于「配置与文件对账」——
 *   能力开着但文件不存在 → 构建期 ⚠（意图与事实不一致，得有人管）。
 *
 * 四、加一个新页面（四步，缺一不可）
 *   ① 本文件 CAPS 登记（id + pages + label）；② front/index.html 导航项加 data-cap="<id>"；
 *   ③ 页面引 ../yj-cap.js（在 yj-util.js 之后）；④ node scripts/verify_caps.cjs。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const FEATURES_JSON = path.join(ROOT, "config", "features.json");
const PAGES_DIR = path.join(ROOT, "front", "pages");

/* 能力表：id → { pages: 入口文件名（不含 .html）, label: 空态卡片与构建日志用的中文名 } */
const CAPS = {
  profile:     { pages: ["profile"],       label: "基本信息" },
  races:       { pages: ["races"],         label: "比赛记录" },
  stats:       { pages: ["stats"],         label: "倾向统计" },
  leaderboard: { pages: ["leaderboard"],   label: "产驹赏金" },
  datechart:   { pages: ["datechart"],     label: "日期统计" },
  timeline:    { pages: ["timeline"],      label: "航迹线" },
  pedigree:    { pages: ["pedigree"],      label: "血统图" },
  entries:     { pages: ["entries"],       label: "出走马表" },
  editor:      { pages: ["edit", "edit-table", "edit-timeline", "edit-drafts"], label: "编辑台" }
};

const FORCE_ON = ["profile"];        /* 默认落地页，不允许关闭 */
const IDS = Object.keys(CAPS);

/* 页文件名（不含扩展名）→ 能力 id；未登记的页面返回 null（= 不受能力表管辖） */
const PAGE_CAP = {};
IDS.forEach(function (id) { CAPS[id].pages.forEach(function (p) { PAGE_CAP[p] = id; }); });

function warn(msg) { console.warn("[features] " + msg); }

/* 读 config/features.json（缺文件 = 全开）。两种形态都吃：裸对象 / { "features": {...} } */
function readRaw() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(FEATURES_JSON, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};        /* 没有文件 = 全开（老站/新克隆仓不受影响） */
    throw new Error("[features] config/features.json 不可读: " + e.message);
  }
  if (raw && typeof raw === "object" && raw.features && typeof raw.features === "object") return raw.features;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  throw new Error("[features] config/features.json 顶层应为对象（或 { \"features\": {...} }）");
}

/* → { caps: {id: bool}, disabled: [id], unknown: [key], missingPages: [id] }（结果缓存，进程内一次） */
let _cache = null;
function inspect() {
  if (_cache) return _cache;
  const declared = readRaw();
  const caps = {};
  IDS.forEach(function (id) { caps[id] = true; });
  const unknown = [];
  Object.keys(declared).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(CAPS, k)) { unknown.push(k); return; }
    const v = declared[k];
    if (typeof v !== "boolean") {
      warn("features." + k + " 的值应为 true/false（当前 " + JSON.stringify(v) + "）→ 按 true 处理");
      caps[k] = true;
      return;
    }
    caps[k] = v;
  });
  if (unknown.length) {
    warn("features.json 有未知能力 id: " + unknown.join(", ") + " → 已忽略。可用 id: " + IDS.join(", "));
  }
  FORCE_ON.forEach(function (id) {
    if (!caps[id]) warn('features.' + id + " 不允许关闭（默认落地页）→ 已强制启用");
    caps[id] = true;
  });
  /* 配置与文件对账：能力开着但入口文件不存在（被手工删了 / 文件名改了）→ ⚠，构建不阻断 */
  const missingPages = [];
  IDS.forEach(function (id) {
    if (!caps[id]) return;
    const lack = CAPS[id].pages.filter(function (p) { return !fs.existsSync(path.join(PAGES_DIR, p + ".html")); });
    if (lack.length) {
      missingPages.push(id);
      warn("features." + id + " = true，但入口文件不存在: " + lack.map(function (p) { return "front/pages/" + p + ".html"; }).join(", ")
        + "（导航会指向 404；要么补文件，要么把它设为 false）");
    }
  });
  _cache = { caps: caps, disabled: IDS.filter(function (id) { return !caps[id]; }), unknown: unknown, missingPages: missingPages };
  return _cache;
}

/* 单能力是否启用（未登记 id → true：不受管辖，别把非页面能力误判成关闭） */
function enabled(id) {
  const c = inspect().caps;
  return Object.prototype.hasOwnProperty.call(c, id) ? c[id] === true : true;
}

/* 某个页文件（不含 .html）是否被能力表关闭 */
function pageDisabled(pageBase) {
  const id = PAGE_CAP[pageBase];
  return !!id && !enabled(id);
}

/* 构建入口清单：front/pages/*.html 目录派生（排序保证确定性）。
 * ⚠ 不用 CAPS 过滤：被关闭的能力**仍要构建**——它的页面要能显示「本站未启用」空态卡片，
 *   而不是让直连 URL 掉到 404（缺了不报错 ≠ 给人看错误页）。真正删掉文件时这里自然少了它，
 *   build 也不会失败。 */
function pageEntries() {
  let files = [];
  try {
    files = fs.readdirSync(PAGES_DIR).filter(function (f) { return /\.html$/i.test(f); });
  } catch (e) {
    warn("读不到 " + PAGES_DIR + "：" + e.message);
    return [];
  }
  return files.map(function (f) { return f.replace(/\.html$/i, ""); }).sort();
}

module.exports = {
  CAPS: CAPS,
  IDS: IDS,
  PAGE_CAP: PAGE_CAP,
  inspect: inspect,
  enabled: enabled,
  pageDisabled: pageDisabled,
  pageEntries: pageEntries
};
