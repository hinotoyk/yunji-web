const { resolve } = require('path');
const { cp } = require('fs/promises');
const { defineConfig } = require('vite');

// 多页应用：外壳 + 各功能子页（iframe 架构，每页独立入口）
const PAGES = ['profile', 'races', 'pedigree', 'stats', 'datechart', 'timeline'];

const input = { main: resolve(__dirname, 'index.html') };
PAGES.forEach(function (p) {
  input[p] = resolve(__dirname, 'pages/' + p + '.html');
});

// 构建收尾时把项目根 data/ 复制进 dist/data，使 dist 自包含（页面经 YJ_DATA.url 解析 ../data/...）。
// 跳过后端管道自用产物：缓存 data/_tmp/、报告与日志（*.md / *.csv），前端不引用。
// 日常快速迭代可跳过复制（沿用 dist 里上一次的 data）：COPY_DATA=skip npm run build
function copyData() {
  if (process.env.COPY_DATA === 'skip') return;
  return cp(resolve(__dirname, '../data'), resolve(__dirname, '../dist/data'), {
    recursive: true,
    filter: (src) => !/(^|[\\/])(_tmp)([\\/]|$)/.test(src) && !/\.(md|csv)$/.test(src),
  });
}

module.exports = defineConfig({
  // 相对路径 base：产物可部署到任意子目录
  base: './',
  plugins: [{ name: 'copy-data', apply: 'build', closeBundle: copyData }],
  build: {
    // ★ 产物输出到项目根 dist/；数据由上方 copy-data 插件复制为 dist/data/
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input }
  }
});
