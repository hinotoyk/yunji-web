const { resolve } = require('path');
const { spawnSync } = require('child_process');
const { defineConfig } = require('vite');

// 多页应用：外壳 + 各功能子页（iframe 架构，每页独立入口）
// edit = 编辑页（D6 独立入口，不在外壳 iframe 内，本地经 edit_server 访问）
const PAGES = ['profile', 'races', 'pedigree', 'stats', 'datechart', 'timeline', 'edit'];

const input = { main: resolve(__dirname, 'index.html') };
PAGES.forEach(function (p) {
  input[p] = resolve(__dirname, 'pages/' + p + '.html');
});

// 构建前生成按需字体子集（P0 字体瘦身 · 方案 b）：每次 build 现算语料字符集，
// 产出 assets/fonts/noto-sc-subset.woff2 + 覆盖 noto-sc.css（1 条 @font-face 替换旧 101 片）。
// 挂 buildStart 而非 closeBundle：Vite 解析 theme.css 的 url() 之前，字体文件必须已经存在。
// fail-soft：CI（.github/workflows/deploy.yml）只有 node、没有 python+fontTools，
// 此时沿用仓库里已提交的产物并告警，新汉字走 body 字体栈尾的系统字体回退。本地查错用 YJ_FONT_STRICT=1。
function genFont() {
  const r = spawnSync(process.execPath, [resolve(__dirname, 'scripts/gen-font.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) {
    const msg = '[gen-font] 字体子集生成失败 exit=' + (r.status === null ? 'signal' : r.status);
    if (process.env.YJ_FONT_STRICT === '1') throw new Error(msg);
    console.warn(msg + '（非致命，沿用现有字体产物）');
  }
}

// 构建期派生（D11 替换式 · 2026-09-28 立项）：把 data/races/*.json 打成 dist/data/races-bundle.json
// （1 请求 ~44KB gzip，等值替代 276 个逐马请求）。编解码单一出处 front/public/race-bundle.js
// （字段契约 = data/SCHEMA.md §8）；脚本自带 round-trip 断言，不等即失败。
// fail-soft 同 gen-font：打包失败告警并退回拷贝逐马小文件（站点仍可用，只是退回叠加形态）。
// COPY_DATA=skip 的快速迭代不打包（沿用 dist 里上一次的 bundle；首次构建前别用 skip）。
function buildRacesBundle() {
  const r = spawnSync(process.execPath, [resolve(__dirname, 'scripts/build-races-bundle.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.warn('[races-bundle] 打包失败 exit=' + (r.status === null ? 'signal' : r.status) + ' → 退回拷贝 data/races/*.json（叠加形态）');
    return false;
  }
  return true;
}

// 构建收尾时把项目根 data/ 复制进 dist/data，使 dist 自包含（页面经 YJ_DATA.url 解析 ../data/...）。
// 跳过后端管道自用产物：缓存 data/_tmp/、报告与日志（*.md / *.csv），前端不引用。
// .json 在 dist 侧 minify（源 data/ 不动，CI diff 仍可读）：basic.json 等约 30% 是缩进空白。
// 替换式：races-bundle 打包成功后跳过 data/races/*.json（bundle 等值替代，dist 净减小）。
// 日常快速迭代可跳过复制（沿用 dist 里上一次的 data）：COPY_DATA=skip npm run build
async function copyData() {
  if (process.env.COPY_DATA === 'skip') return;
  const bundled = buildRacesBundle();
  const fs = require('fs/promises');
  const path = require('path');
  async function walk(srcDir, dstDir, rel) {
    await fs.mkdir(dstDir, { recursive: true });
    for (const ent of await fs.readdir(srcDir, { withFileTypes: true })) {
      if (ent.name === '_tmp') continue;
      if (bundled && ent.isDirectory() && rel + ent.name === 'races') continue;  /* 逐马小文件已被 bundle 替代 */
      const s = path.join(srcDir, ent.name);
      const d = path.join(dstDir, ent.name);
      if (ent.isDirectory()) { await walk(s, d, rel + ent.name + '/'); continue; }
      if (/\.(md|csv)$/.test(ent.name)) continue;
      if (/\.json$/i.test(ent.name)) {
        try {
          const txt = (await fs.readFile(s, 'utf8')).replace(/^\uFEFF/, '');
          await fs.writeFile(d, JSON.stringify(JSON.parse(txt)));
          continue;
        } catch (e) { /* 非标准 JSON → 原样拷贝兜底 */ }
      }
      await fs.copyFile(s, d);
    }
  }
  await walk(resolve(__dirname, '../data'), resolve(__dirname, '../dist/data'), '');
}

module.exports = defineConfig({
  // 相对路径 base：产物可部署到任意子目录
  base: './',
  plugins: [
    { name: 'gen-font', apply: 'build', buildStart: genFont },
    { name: 'copy-data', apply: 'build', closeBundle: copyData },
  ],
  build: {
    // ★ 产物输出到项目根 dist/；数据由上方 copy-data 插件复制为 dist/data/
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input }
  }
});
