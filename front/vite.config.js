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

// 构建收尾时把项目根 data/ 复制进 dist/data，使 dist 自包含（页面经 YJ_DATA.url 解析 ../data/...）。
// 跳过后端管道自用产物：缓存 data/_tmp/、报告与日志（*.md / *.csv），前端不引用。
// .json 在 dist 侧 minify（源 data/ 不动，CI diff 仍可读）：basic.json 等约 30% 是缩进空白。
// 日常快速迭代可跳过复制（沿用 dist 里上一次的 data）：COPY_DATA=skip npm run build
async function copyData() {
  if (process.env.COPY_DATA === 'skip') return;
  const fs = require('fs/promises');
  const path = require('path');
  async function walk(srcDir, dstDir) {
    await fs.mkdir(dstDir, { recursive: true });
    for (const ent of await fs.readdir(srcDir, { withFileTypes: true })) {
      if (ent.name === '_tmp') continue;
      const s = path.join(srcDir, ent.name);
      const d = path.join(dstDir, ent.name);
      if (ent.isDirectory()) { await walk(s, d); continue; }
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
  await walk(resolve(__dirname, '../data'), resolve(__dirname, '../dist/data'));
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
