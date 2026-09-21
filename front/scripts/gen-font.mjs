/* eslint-disable no-console */
// ============================================================
// 构建期字体子集生成（P0 字体瘦身 · 方案 b，2026-09-20 定稿）
//
// 做什么：每次 build 现算「站点语料字符全集」→ 子集化可变字体 → 产出 1 片 webfont
//         + 覆盖 front/assets/fonts/noto-sc.css（theme.css 的 @import 入口不变）。
//         旧 101 片 Google 导出物不再进 dist（替换式，部署包只减不增）。
//
// 语料口径（不许写死，见 OPTIMIZATION_PLAN §5.0-1 / tests/font-cand/ANALYSIS.md §3）：
//   data/**/*.json（排除 _tmp/） ∪ front/index.html ∪ front/pages/*.html ∪ front/public/*.js
//   —— 数据文件全取「键 + 字符串值」，静态文案全取文件文本（宁多勿漏）。
//   当前 ≈1,902 字符（汉字 1,561）；每天 CI 更新数据会带新汉字，所以必须每次 build 重算。
//
// 增量：对字符集取 sha256，与已有 noto-sc.css 头部 `hash=` 一致且字体文件在 → 跳过（幂等、快）。
// 依赖：python + fontTools（源字体在 C:/Windows/Fonts/NotoSansSC-VF.ttf）。
//   缺依赖（GitHub Pages 的 deploy.yml 只有 node）→ 打警告并沿用仓库里已提交的产物，不失败；
//   新字因此走 body 字体栈尾的系统字体回退（ANALYSIS §3 风险 1 的既定缓解）。
//   本地要看失败就 `YJ_FONT_STRICT=1`。
//
// woff2 编码需要 brotli：真包（`pip install brotli`）优先；本机没装，则临时把
//   front/scripts/brotli-shim（ctypes 包系统 libbrotlienc.dll）挂到子进程 PYTHONPATH 上，
//   不改任何环境。两者都不可用时产物自动降级为 .woff（会大声警告）。
//
// 手动用法：node front/scripts/gen-font.mjs [--force] [--check]
//   --check = 只算语料与差异，不写文件（调试语料口径用）
// ============================================================
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // front/scripts
const FRONT = path.resolve(HERE, '..');
const ROOT = path.resolve(FRONT, '..');
const FONTS = path.join(FRONT, 'assets', 'fonts');
const OUT_CSS = path.join(FONTS, 'noto-sc.css');
const STEM = 'noto-sc-subset';
const FAMILY = 'Noto Sans SC';
// 生成 CSS 的模板版本：改了头注释/声明写法就 +1，让「字符集没变」的旧产物也重生成一次
// （noto-sc.css 会被 postcss/Tailwind 解析，注释正文里出现注释结束符会直接炸构建，
//   所以措辞改动必须能在下一次 build 滚动生效，而不是被 hash 相同的跳过逻辑留住）
const CSS_VERSION = 2;
// 站点实际用到的字重区间：theme.css + 各页内联样式实测 300（font-light）…700（font-bold）
const WGHT = { lo: 300, hi: 700 };
// 源可变字体（同字族同轴，tests/font-cand 全部实测即基于它）
const SRC_FONTS = [
  process.env.YJ_FONT_SRC,
  'C:/Windows/Fonts/NotoSansSC-VF.ttf',
  path.join(FONTS, 'src', 'NotoSansSC-VF.ttf'),
].filter(Boolean);

const PREFIX = '[gen-font]';
const log = (msg) => console.log(PREFIX + ' ' + msg);
const warn = (msg) => console.warn(PREFIX + ' \x1b[33mWARN\x1b[0m ' + msg);

// ---------- 1. 语料提取 ----------
function addStr(set, str) {
  for (const ch of str) set.add(ch);
}
function walkJson(node, set) {
  if (typeof node === 'string') return addStr(set, node);
  if (Array.isArray(node)) { for (const v of node) walkJson(v, set); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) { addStr(set, k); walkJson(v, set); }
  }
}
function readJson(file, set) {
  try { walkJson(JSON.parse(fs.readFileSync(file, 'utf8')), set); }
  catch (e) { warn('跳过无法解析的 JSON ' + path.relative(ROOT, file) + ' (' + e.message + ')'); }
}
// data/ 下所有 .json，跳过 _tmp/（与 vite.config.js 的 copy-data 同一口径：管线自用物）
const DATA_DIR = path.join(ROOT, 'data');
function collectData(set) {
  let files = 0;
  if (!fs.existsSync(DATA_DIR)) return 0;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== '_tmp') walk(p); }
      else if (ent.name.endsWith('.json')) { readJson(p, set); files++; }
    }
  };
  walk(DATA_DIR);
  return files;
}

function collectStatic(set) {
  const files = [path.join(FRONT, 'index.html')];
  for (const dir of ['pages', 'public']) {
    const d = path.join(FRONT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (dir === 'pages' && !f.endsWith('.html')) continue;
      if (dir === 'public' && !f.endsWith('.js')) continue;
      files.push(path.join(d, f));
    }
  }
  for (const f of files) if (fs.existsSync(f)) addStr(set, fs.readFileSync(f, 'utf8'));
  return files.length;
}

function extractCorpus() {
  const set = new Set();
  const nData = collectData(set);
  const nStatic = collectStatic(set);
  const codes = [...set].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  const hash = crypto.createHash('sha256').update(codes.join(',')).digest('hex').slice(0, 16);
  return { set, codes, hash, nData, nStatic };
}

// ---------- 2. 现有产物（从 noto-sc.css 头部读 hash，单一出处不另立 manifest） ----------
function readExisting() {
  if (!fs.existsSync(OUT_CSS)) return null;
  const css = fs.readFileSync(OUT_CSS, 'utf8');
  const m = css.match(/\/\*\s*yj-font:\s*v=(\d+)\s+hash=([0-9a-f]+)\b([\s\S]*)\*\//);
  if (!m) return null; // 手改过的 / 旧版 101 片格式 → 视为需要重建
  const version = Number(m[1]);
  if (version !== CSS_VERSION) return null; // 模板升级了，注释措辞要滚动重生成
  const url = (css.match(/url\(([^)]+)\)/) || [])[1];
  if (!url) return null;
  const fontFile = path.join(FONTS, url.replace(/^\.\//, ''));
  let size = 0;
  try { size = fs.statSync(fontFile).size; } catch (e) { /* 缺文件 */ }
  return { version, hash: m[2], url, fontFile, size, attrs: m[3].trim() };
}

// ---------- 3. 工具链探测 ----------
function pythonBin() { return process.env.YJ_PYTHON || 'python'; }
function py(code, extraPath) {
  const env = { ...process.env };
  if (extraPath) env.PYTHONPATH = [extraPath, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  return spawnSync(pythonBin(), ['-c', code], { encoding: 'utf8', env, timeout: 60000 });
}
function probeToolchain() {
  const v = py('import sys, fontTools; sys.stdout.write(fontTools.version)');
  if (v.status !== 0) return { ok: false, why: 'python/fontTools 不可用（' + (v.stderr || v.error || '').toString().trim().split('\n').pop() + '）' };
  const real = py('import brotli');
  const cffi = py('import brotlicffi');
  return {
    ok: true,
    fontTools: v.stdout.trim(),
    // 真包优先；都没有才挂 front/scripts/brotli-shim（只在这一次子进程里）
    brotli: real.status === 0 ? 'brotli' : cffi.status === 0 ? 'brotlicffi' : 'shim',
    shimPath: real.status === 0 || cffi.status === 0 ? null : path.join(HERE, 'brotli-shim'),
  };
}
function findSourceFont() {
  for (const p of SRC_FONTS) if (fs.existsSync(p)) return p;
  return null;
}

// ---------- 4. 生成 ----------
function runSubset(src, codes, shimPath) {
  const tmp = path.join(os.tmpdir(), 'yj-font-corpus-' + process.pid + '.txt');
  fs.writeFileSync(tmp, codes.map((c) => String.fromCodePoint(c)).join(''), 'utf8');
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  if (shimPath) env.PYTHONPATH = [shimPath, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  let r;
  try {
    r = spawnSync(pythonBin(), [
      path.join(HERE, 'subset_font.py'),
      '--src', src,
      '--out-dir', FONTS,
      '--stem', STEM,
      '--codes', tmp,
      '--wght', WGHT.lo + '-' + WGHT.hi,
    ], { encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  if (r.error) throw r.error;
  const kv = {};
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z_]+)=(.*)$/);
    if (m) kv[m[1]] = m[2];
  }
  return { code: r.status, kv, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const FORMAT = { woff2: "format('woff2')", woff: "format('woff')", truetype: "format('truetype')" };

function writeCss(fontName, kv, corpus, srcFont) {
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const css = `/* ============================================================
 * ${FAMILY} · 按需全量子集（P0 字体瘦身 · 方案 b，2026-09-20 定稿）
 * 本文件由 front/scripts/gen-font.mjs 在 vite build 前生成，请勿手改（改了会被覆盖）。
 * 语料 = 项目根 data 目录下的全部 .json（渲染数据，排除 _tmp 缓存）
 *        + front 静态文案（index.html、pages 下 .html、public 下 .js，含 i18n 字典）
 * 源字体 = ${path.basename(srcFont)}（可变），wght 轴限 ${WGHT.lo}–${WGHT.hi}；${kv.CODES} 字符 / ${kv.GLYPHS} 字形 / 1 片，替换旧 101 片（4.5MB）
 * 漏字 = 新数据带来的汉字未进子集时，按 body 字体栈尾（Noto Sans CJK SC / PingFang SC / Microsoft YaHei）降级，不出豆腐块
 * 重算 = npm run build 自动（字符集变了才真跑子集化）；强制重算 FONT_GEN=force npm run build
 * ============================================================ */
/* yj-font: v=${CSS_VERSION} hash=${corpus.hash} chars=${kv.CODES} in_src=${kv.IN_SRC} glyphs=${kv.GLYPHS} flavor=${kv.FLAVOR} bytes=${kv.BYTES} wght=${WGHT.lo}-${WGHT.hi} src=${path.basename(srcFont)} tool=fontTools${kv.fontTools || ''} at=${at} */
@font-face {
  font-family: '${FAMILY}';
  font-style: normal;
  font-weight: ${WGHT.lo} ${WGHT.hi};
  font-display: swap;
  src: url(${fontName}) ${FORMAT[kv.FLAVOR] || FORMAT.woff2};
}
`;
  fs.writeFileSync(OUT_CSS, css, 'utf8');
}

// 清掉历史遗留：换过容器格式（woff2 ↔ woff ↔ ttf）或中途崩溃留下的旁支文件，
// 否则 front/assets/fonts/ 里会多出一份没人引用的 1MB 字体，还会被误提交。
function cleanStale(keepName) {
  for (const f of fs.readdirSync(FONTS)) {
    if (f === keepName) continue;
    if (f.startsWith(STEM + '.') || f.includes('.probe.')) {
      fs.rmSync(path.join(FONTS, f), { force: true });
      log('清理遗留 ' + f);
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const force = argv.includes('--force') || process.env.FONT_GEN === 'force';
  const strict = process.env.YJ_FONT_STRICT === '1';
  if (process.env.FONT_GEN === 'skip') { log('FONT_GEN=skip，沿用现有字体产物'); return; }

  const corpus = extractCorpus();
  log(`语料 ${corpus.codes.length} 字符（data ${corpus.nData} 个 JSON + 静态 ${corpus.nStatic} 个文件）hash=${corpus.hash.slice(0, 8)}`);
  const cur = readExisting();
  if (!force && cur && cur.hash === corpus.hash && cur.size > 0) {
    log(`字符集未变、产物在（${(cur.size / 1024).toFixed(0)}KB），跳过生成。${cur.attrs}`);
    cleanStale(path.basename(cur.url));
    return;
  }
  if (check) {
    log(`--check：需要重新生成（${cur ? (cur.size ? '字符集变化' : '字体文件缺失') : 'noto-sc.css 非本脚本产物或不存在'}）`);
    return;
  }

  const src = findSourceFont();
  const tool = probeToolchain();
  if (!tool.ok || !src) {
    const why = !src ? '找不到源字体（试过的路径见 SRC_FONTS；可用 YJ_FONT_SRC 指定）' : tool.why;
    if (strict) { console.error(PREFIX + ' ' + why); process.exit(2); }
    warn(why + ' —— 沿用已提交的字体产物；新汉字将由系统字体回退。');
    if (cur && cur.size) return;      // 有旧产物就带着它继续 build
    warn('且本地无可用字体产物，CSS 会指向缺失文件（页面自动回退系统字体）。');
    writeCss(path.basename(cur ? cur.url : STEM + '.woff2'), { CODES: corpus.codes.length, IN_SRC: '?', GLYPHS: '?', FLAVOR: 'woff2', BYTES: 0 }, corpus, src || 'NotoSansSC-VF.ttf');
    return;
  }

  log(`源字体 ${src} ｜ fontTools ${tool.fontTools} ｜ brotli=${tool.brotli}${tool.brotli === 'shim' ? '（ctypes 替身，未装包）' : ''}`);
  const t0 = Date.now();
  const r = runSubset(src, corpus.codes, tool.shimPath);
  if (r.code !== 0 || !r.kv.FONT) {
    console.error(r.stdout + r.stderr);
    const msg = '子集化失败 exit=' + r.code;
    if (strict) { console.error(PREFIX + ' ' + msg); process.exit(r.code || 1); }
    warn(msg + ' —— 沿用现有字体产物。');
    return;
  }
  for (const line of r.stderr.split('\n')) if (line.trim()) console.warn('  ' + line.trim());
  const kv = r.kv;
  if (kv.MISS_SRC) log('源字体本身缺码点（无法覆盖，走系统回退）: ' + kv.MISS_SRC);
  const kb = (Number(kv.BYTES) / 1024).toFixed(0);
  log(`产出 ${kv.FONT} ${kb}KB ｜ ${kv.CODES} 字符 → ${kv.GLYPHS} 字形 ｜ flavor=${kv.FLAVOR} ｜ 覆盖断言 COVERAGE=${kv.COVERAGE} VERIFY=${kv.VERIFY} ｜ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (kv.FLAVOR !== 'woff2') {
    warn('未能输出 woff2（缺 brotli 且 ctypes 替身不可用），当前为 ' + kv.FLAVOR.toUpperCase() +
         '，体积偏大。修一次即可：pip install brotli');
  }
  writeCss(kv.FONT, { ...kv, fontTools: tool.fontTools }, corpus, src);
  cleanStale(kv.FONT);
  log(`已写 ${path.relative(ROOT, OUT_CSS)}`);
}

try { main(); }
catch (e) {
  if (process.env.YJ_FONT_STRICT === '1') throw e;
  warn('异常，跳过字体生成：' + (e && e.message));
}
