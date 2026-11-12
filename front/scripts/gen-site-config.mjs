#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
/* 页面能力表（L2 可选挂载）：config/features.json 的唯一解析器。CJS 模块，ESM 侧取 default。
 * 注入 window.YJ_SITE.features 供外壳（导航过滤）与 yj-cap.js（直连空态）共用同一份判断。 */
import FEATURES from "./features.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const SIRE_JSON = path.join(ROOT, "config", "sire.json");
const GRADE_JSON = path.join(ROOT, "config", "grade-table.json");
const FRIENDS_JSON = path.join(ROOT, "config", "friend-links.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error("[gen-site-config] 配置不可读: " + file + " → " + e.message);
  }
}

/* site 字段归一：字符串字段缺省 → ""；logo 缺省回退 site.name 首字符；
 * domains 缺省/非数组/空数组 → []（D10：yj-visit.js 的 HOSTS.indexOf 不对 undefined 抛 TypeError）；
 * id（§105 站点命名空间）：站点存储键前缀单源（yj-util.storeKey），缺省 → ""（前端 storeKey 回退 "yj"）。
 * ⚠ id 是站点级存储（PAT/草稿/缓存/IndexedDB）的隔离键：缺省时回退到旧的共享前缀 "yj"，
 * 同源本地双站会重新互串 → 构建期显式告警（不 fail-soft：新克隆仓最容易漏这一项）。
 *
 * repo（P0-5，2026-11-12）：编辑台目标仓库 "owner/repo"，全站唯一出处（YJ.util.GH_REPO 读它）。
 *   空 = 编辑功能整体关闭（侧栏编辑组不注入 / logo 三连点无反应 / 编辑页显示「未配置编辑仓库」），
 *   fail-closed 而非「回退到原作者的仓库」—— fork 后忘配的表现必须是"没有编辑功能"，
 *   绝不能是"拿别人的仓库地址去校验 PAT"。
 *   非空但格式不对（多了斜杠/空格/带 https://）→ 直接抛错：这类手滑会让 20+ 处 API 拼接全错，
 *   报错信息比线上 404 好查得多。
 *
 * analytics（P0-6）：{goatcounter, vercount}。goatcounter 空 = 不注入 count.js、不拉 TOTAL.json、
 *   页脚「总访问」节点不进 DOM；vercount 缺省 false = 不注入第三方计数脚本。 */
let warnedNoSiteId = false;
export function siteVars() {
  const sire = readJson(SIRE_JSON);
  const site = (sire && typeof sire.site === "object" && sire.site) || {};
  const str = (v) => (v == null ? "" : String(v));
  const id = str(site.id);
  const name = str(site.name);
  const logo = str(site.logo) || name.charAt(0);
  const domains = Array.isArray(site.domains) && site.domains.length ? site.domains : [];

  const repo = str(site.repo).trim();
  if (repo && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
    throw new Error('[gen-site-config] config/sire.json 的 site.repo 格式应为 "owner/repo"（不带协议、不带结尾斜杠）：'
      + JSON.stringify(repo));
  }
  const an = (site.analytics && typeof site.analytics === "object" && site.analytics) || {};
  const analytics = { goatcounter: str(an.goatcounter).trim(), vercount: an.vercount === true };

  /* cross_site（P1-0，2026-11-12）：两处跨站引用的宿主地址。
   *   jbis_rank       → stats 的「种马榜走势」（数据 derived/sire-history + 渲染组件 embed/）
   *   racing_calendar → entries 的「出走马表」（RC_ENTRIES_EMBED 组件）
   * **缺段/空串 = 该跨站功能关闭**（页面隐藏整节 / 显示未配置提示），与 repo / analytics 同一套
   * fail-closed 语义：fork 后一个字不改时，不该还去抓原作者的部署。
   * 注入成前端口径的 camelCase（jbisRank / rc），映射只此一处。 */
  const cs = (site.cross_site && typeof site.cross_site === "object" && site.cross_site) || {};
  const crossSite = { jbisRank: str(cs.jbis_rank).trim(), rc: str(cs.racing_calendar).trim() };

  /* jbisId（2026-10-27）：sire 的 JBIS 马 ID（config/sire.json 的 sire.jbis_id；注意顶层键也叫
   * sire，故取 sire.sire.jbis_id），跨站引用 jbis-sire-rank-history derived 产物路径用
   * （stats.html 种马榜走势）；缺省 → ""。 */
  const jbisId = str((sire.sire && sire.sire.jbis_id) || sire.jbis_id);
  /* sireName（§174，2026-11-02）：sire 的日文名（sire.sire.name_ja，同上取键注意），
   * 出走马表页（pages/entries.html）跨站引用 racing-calendar 深链 ?sire=<日文名> 用——
   * RC 按种马日文名 canonical 筛选父马。模板站（kzn 等）改 config/sire.json 即自动引用
   * 自家种马的出走表，零代码改动；缺省 → ""（entries.html 对空值显示配置缺失提示）。 */
  const sireName = str((sire.sire && sire.sire.name_ja) || sire.name_ja);
  if (!id && !warnedNoSiteId) {
    warnedNoSiteId = true;
    console.warn("[gen-site-config] config/sire.json 缺 site.id（§105）：存储键前缀将回退共享的 \"yj\"，" +
      "同一端口/同源部署多个站点时 PAT/草稿/缓存会互相串。新克隆仓库请改成自己的站点标识（如 \"kzn\"）。");
  }
  return {
    id, name, subtitle: str(site.subtitle), tagline: str(site.tagline), logo, domains,
    repo, analytics, jbisId, sireName, crossSite,
    /* 能力表（L2）：{capId: bool}。缺文件/缺键 = 全 true，见 features.cjs。 */
    features: FEATURES.inspect().caps
  };
}

/* 友链注册表（P0-7）：优先 config/friend-links.json（推荐：数组较长、与 sire.json 语义无关），
 * 其次 sire.json 内嵌的 site.friend_links（jbis/rc 这类不跑本仓构建的站兜底）。
 * 两种形态都接受「裸数组」与「{sites: [...]}」；缺省/非数组/空数组 → [] = 侧栏不渲染该分组。
 * 条目只做最小归一（id/url 为字符串），渲染侧的排除自身/拼接展示名交给 friend-links.js。 */
export function friendLinks() {
  const norm = (raw) => {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.sites) ? raw.sites : []);
    return arr.filter((s) => s && typeof s === "object" && String(s.id || "").trim() && String(s.url || "").trim())
      .map((s) => ({
        id: String(s.id).trim(),
        logo: s.logo == null ? "" : String(s.logo),
        color: s.color == null ? "" : String(s.color),
        name: s.name == null ? "" : String(s.name),
        sub: s.sub == null ? "" : String(s.sub),
        url: String(s.url).trim(),
        desc: s.desc == null ? "" : String(s.desc)
      }));
  };
  if (fs.existsSync(FRIENDS_JSON)) return norm(readJson(FRIENDS_JSON));
  const sire = readJson(SIRE_JSON);
  const site = (sire && typeof sire.site === "object" && sire.site) || {};
  return norm(site.friend_links);
}

export function gradeTable() {
  const cfg = readJson(GRADE_JSON);
  const t = cfg && cfg.GRADE;
  if (!t || typeof t !== "object" || !Object.keys(t).length) {
    throw new Error("[gen-site-config] config/grade-table.json 缺非空 GRADE 对象（见该文件 about 键与 docs/SCHEMA.md 格口径）");
  }
  return t;
}

/* HTML 占位符 → 替换值（transformIndexHtml 对 13 个入口全量 replace，占位符零残留由构建后核对）。
 * 值一律做 HTML 转义（& < > " '）：占位符都落在 HTML 文本/属性上下文，新项目品牌若含
 * < > & ' 等字符也不至于破版/注入；现有品牌名均无这些字符，转义后输出不变。
 *
 * 2026-11-12 新增两个（P0-5 / P0-7）：
 *   {{YJ_SITE_ID}}   → index.html 友链挂载点的 data-site（原来手写站名，漏改的表现 = 侧栏把
 *                      自己列出来、点自己跳自己，且不报错。默认派生比「记得改」可靠）
 *   {{YJ_SITE_REPO_HINT}} → PAT 提示文案的**整段括号**：有 repo = 「仅 owner/repo · Contents 读写」；
 *                      没配 = 「本站未配置 site.repo，编辑功能已关闭」。原来是写死的一句
 *                      「仅 <原作者仓库>」，fork 后把原作者仓库名印在每份 fork 上、还把人
 *                      往错的仓库引；整段交给构建期决定，HTML 里就不留半句空槽。 */
export function htmlReplacements() {
  const s = siteVars();
  const escHtml = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return {
    "{{YJ_SITE_NAME}}": escHtml(s.name),
    "{{YJ_SITE_SUBTITLE}}": escHtml(s.subtitle),
    "{{YJ_SITE_TAGLINE}}": escHtml(s.tagline),
    "{{YJ_SITE_LOGO}}": escHtml(s.logo),
    "{{YJ_SITE_ID}}": escHtml(s.id),
    "{{YJ_SITE_REPO_HINT}}": escHtml(s.repo
      ? "仅 " + s.repo + " · Contents 读写"
      : "本站未配置 site.repo，编辑功能已关闭"),
  };
}

/* dist/site-config.js 内容（closeBundle emit 的唯一文本出处；JSON.stringify 保证合法 JS 字面量）。
 * repo / analytics / YJ_FRIENDS 三者都是「空 = 关闭」语义，前端一律按此判定（见 yj-util / yj-visit / friend-links）。
 * YJ_CAP = 能力元数据（页面 → 能力 id、能力中文名）：yj-cap.js 判断「当前页属于哪个能力、卡片标题叫什么」
 * 时读它，源 = features.cjs 的 CAPS —— 页面表只维护一处，前端不重复写映射。 */
export function siteConfigJs() {
  const s = siteVars();
  const site = {
    id: s.id, name: s.name, subtitle: s.subtitle, tagline: s.tagline,
    logo: s.logo, domains: s.domains, repo: s.repo, analytics: s.analytics,
    jbisId: s.jbisId, sireName: s.sireName, features: s.features, crossSite: s.crossSite
  };
  const labels = {};
  FEATURES.IDS.forEach((id) => { labels[id] = FEATURES.CAPS[id].label; });
  return (
    "/* 构建产物 · 由 front/scripts/gen-site-config.mjs 生成（勿手改）；源 = config/sire.json + config/friend-links.json + config/grade-table.json + config/features.json */\n" +
    "window.YJ_SITE = " + JSON.stringify(site) + ";\n" +
    "window.YJ_CAP = " + JSON.stringify({ pageCap: FEATURES.PAGE_CAP, labels: labels }) + ";\n" +
    "window.YJ_FRIENDS = " + JSON.stringify(friendLinks()) + ";\n" +
    "window.YJ_GRADE = " + JSON.stringify(gradeTable()) + ";\n"
  );
}

/* 构建期「本站身份」自检（P0-8）：一次 build 打印一行到底的清单，漏配项飘红。
 * 这是「同源双站串键」「忘配编辑仓库」「fork 还在给原作者后台计数」的最低成本护栏——
 * 不阻断构建（除 repo 格式错误外），只让人一眼看见自己是谁。
 * fail 项用 ⚠（无 ANSI 色码：GitHub Actions 日志与本地终端表现一致，不会出现乱码）。 */
export function report() {
  const s = siteVars();
  const nFriends = friendLinks().length;
  const capInfo = FEATURES.inspect();
  const capOff = capInfo.disabled;
  const problems = [];
  if (!s.id) problems.push("site.id 缺失（存储键会回退共享前缀 yj，同源多站互串）");
  if (!s.repo) problems.push("site.repo 为空（编辑台整体关闭：侧栏无编辑组、编辑页显示「未配置编辑仓库」）");
  if (s.domains.length && !s.analytics.goatcounter && !s.analytics.vercount) {
    problems.push("已配 site.domains 但 site.analytics 两项皆空（域名白名单过了、统计仍保持关闭）");
  }
  if (!s.domains.length) problems.push("site.domains 为空（访问统计整体关闭，任何域名都不加载统计脚本）");
  const line = (k, v) => console.log("  " + k.padEnd(14, " ") + v);
  console.log("[本站身份] " + (s.name || "(未命名)") + (s.subtitle ? " · " + s.subtitle : "") +
    (s.id ? "  [" + s.id + "]" : ""));
  line("repo", s.repo || "（空 → 编辑关闭）");
  line("analytics", (s.analytics.goatcounter ? "goatcounter:" + s.analytics.goatcounter : "goatcounter:关") +
    " / " + (s.analytics.vercount ? "vercount:开" : "vercount:关"));
  line("domains", s.domains.length ? s.domains.join(", ") : "（空 → 统计不加载）");
  line("friend-links", nFriends ? nFriends + " 条" : "（空 → 不渲染站群导航）");
  line("cross-site", (s.crossSite.jbisRank ? "种马榜走势:开" : "种马榜走势:关") +
    " / " + (s.crossSite.rc ? "出走马表:开" : "出走马表:关"));
  line("sire", (s.sireName || "(无日文名)") + (s.jbisId ? " · JBIS " + s.jbisId : ""));
  /* 能力表：关闭项不是「问题」，是本站的选择 —— 只用一行说清开了几个、关了哪些 */
  line("capabilities", (FEATURES.IDS.length - capOff.length) + "/" + FEATURES.IDS.length +
    (capOff.length ? "（关闭: " + capOff.join(", ") + "）" : "（全开）"));
  /* progeny_years 只在 Python 侧消费；这里只做「有没有配」的提示（构建不读管线配置） */
  problems.forEach((p) => console.warn("  ⚠ " + p));
  return problems;
}

/* 直接运行 = 落盘 dist/site-config.js（vite.config.js 走 closeBundle 钩子调同一导出，不经本入口）。 */
function main() {
  const dst = path.join(ROOT, "dist", "site-config.js");
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const txt = siteConfigJs();
  fs.writeFileSync(dst, txt);
  console.log("[gen-site-config] → " + path.relative(ROOT, dst) +
    "（YJ_SITE " + siteVars().domains.length + " 域名 · YJ_FRIENDS " + friendLinks().length +
    " 条 · YJ_GRADE " + Object.keys(gradeTable()).length + " 键）");
  report();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
