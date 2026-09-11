const { resolve } = require('path');
const { defineConfig } = require('vite');

// 多页应用：外壳 + 各功能子页（iframe 架构，每页独立入口）
const PAGES = ['profile', 'races', 'pedigree', 'stats', 'datechart', 'timeline'];

const input = { main: resolve(__dirname, 'index.html') };
PAGES.forEach(function (p) {
  input[p] = resolve(__dirname, 'pages/' + p + '.html');
});

module.exports = defineConfig({
  // 相对路径 base：产物可部署到任意子目录
  base: './',
  build: {
    // ★ 关键：产物输出到项目根 dist/，使 dist/pages/*.html 里的 ../../data 能正确指向项目根 data/
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input }
  }
});
