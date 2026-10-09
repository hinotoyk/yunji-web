#!/usr/bin/env node
/* 站点配置注入生成器（docs/REFACTOR.md §5.4 D1/D2 + §12 R6 · P3）：
 * 读 config/sire.json（site 段）+ config/grade-table.json，产出两样东西——
 *   ① dist/site-config.js（D1：emit 到 dist 根，与 copy-data 同模式）：
 *        window.YJ_SITE = {name, subtitle, tagline, logo, domains}; window.YJ_GRADE = {...};
 *      浏览器侧所有品牌文案 / 统计域名 / 格级表的运行时唯一出处；
 *   ② HTML 占位符替换表（{{YJ_SITE_NAME}} 等 4 个），由 vite.config.js 的 config-inject
 *      插件在 transformIndexHtml 钩子里消费（dev + build 通用，D2）。
 * 本文件是两条路径的单一出处：vite.config.js 动态 import 本模块的导出；
 * 直接 `node front/scripts/gen-site-config.mjs` 则落盘 dist/site-config.js（调试/CI 用）。
 * 归一约定（复核 b）：domains 缺省/非数组 → []（防 yj-visit.js 对 undefined 做 indexOf 抛错）；
 * logo 缺省 → site.name 首字符（回退链与 HTML 占位符同一份逻辑，见 siteVars）。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const SIRE_JSON = path.join(ROOT, "config", "sire.json");
const GRADE_JSON = path.join(ROOT, "config", "grade-table.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error("[gen-site-config] 配置不可读: " + file + " → " + e.message);
  }
}

/* site 五字段归一：字符串字段缺省 → ""；logo 缺省回退 site.name 首字符；
 * domains 缺省/非数组/空数组 → []（D10：yj-visit.js 的 HOSTS.indexOf 不对 undefined 抛 TypeError）。 */
export function siteVars() {
  const sire = readJson(SIRE_JSON);
  const site = (sire && typeof sire.site === "object" && sire.site) || {};
  const str = (v) => (v == null ? "" : String(v));
  const name = str(site.name);
  const logo = str(site.logo) || name.charAt(0);
  const domains = Array.isArray(site.domains) && site.domains.length ? site.domains : [];
  return { name, subtitle: str(site.subtitle), tagline: str(site.tagline), logo, domains };
}

export function gradeTable() {
  const cfg = readJson(GRADE_JSON);
  const t = cfg && cfg.GRADE;
  if (!t || typeof t !== "object" || !Object.keys(t).length) {
    throw new Error("[gen-site-config] config/grade-table.json 缺非空 GRADE 对象（docs/REFACTOR.md §12.2）");
  }
  return t;
}

/* HTML 占位符 → 替换值（transformIndexHtml 对 9 个入口全量 replace，占位符零残留由构建后核对）。
 * 值一律做 HTML 转义（& < > " '）：占位符都落在 HTML 文本/属性上下文，新项目品牌若含
 * < > & ' 等字符也不至于破版/注入；现有品牌（云迹·云崽档案等）无这些字符，转义后输出不变。 */
export function htmlReplacements() {
  const s = siteVars();
  const escHtml = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return {
    "{{YJ_SITE_NAME}}": escHtml(s.name),
    "{{YJ_SITE_SUBTITLE}}": escHtml(s.subtitle),
    "{{YJ_SITE_TAGLINE}}": escHtml(s.tagline),
    "{{YJ_SITE_LOGO}}": escHtml(s.logo),
  };
}

/* dist/site-config.js 内容（closeBundle emit 的唯一文本出处；JSON.stringify 保证合法 JS 字面量）。 */
export function siteConfigJs() {
  const s = siteVars();
  return (
    "/* 构建产物 · 由 front/scripts/gen-site-config.mjs 生成（勿手改）；源 = config/sire.json + config/grade-table.json */\n" +
    "window.YJ_SITE = " + JSON.stringify({ name: s.name, subtitle: s.subtitle, tagline: s.tagline, logo: s.logo, domains: s.domains }) + ";\n" +
    "window.YJ_GRADE = " + JSON.stringify(gradeTable()) + ";\n"
  );
}

/* 直接运行 = 落盘 dist/site-config.js（vite.config.js 走 closeBundle 钩子调同一导出，不经本入口）。 */
function main() {
  const dst = path.join(ROOT, "dist", "site-config.js");
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const txt = siteConfigJs();
  fs.writeFileSync(dst, txt);
  console.log("[gen-site-config] → " + path.relative(ROOT, dst) +
    "（YJ_SITE " + siteVars().domains.length + " 域名 · YJ_GRADE " + Object.keys(gradeTable()).length + " 键）");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
