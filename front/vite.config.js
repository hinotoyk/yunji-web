const { resolve } = require('path');
const { spawnSync } = require('child_process');
const { defineConfig } = require('vite');

// 多页应用：外壳 + 各功能子页（iframe 架构，每页独立入口）
// edit = 编辑页（D6 独立入口，§82.4 起恒为草稿箱模式：线上提交走 GitHub API → CI，无本机服务依赖）
// edit-table = 批量表格编辑页（§104 键盘电子表格流：基本信息 manual_overrides + 比赛 races_edits）
// edit-timeline = 航迹线人工节点编辑页（2026-09 从 edit.html 拆出，同为独立入口）
// edit-drafts = 草稿箱查询页（§93：未提交草稿 + 已保存人工值一页通览，与抽屉共用渲染/检索）
const PAGES = ['profile', 'races', 'pedigree', 'stats', 'datechart', 'timeline',
  'edit', 'edit-table', 'edit-timeline', 'edit-drafts'];

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
// （字段契约 = docs/SCHEMA.md §8）；脚本自带 round-trip 断言，不等即失败。
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
      if (/\.(md|csv|jsonl)$/.test(ent.name)) continue;
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

// 站点配置注入（docs/REFACTOR.md §5.4 D1/D2 + §12 R6 · P3）：
//   ① transformIndexHtml 替换 9 个入口的 {{YJ_SITE_NAME/SUBTITLE/TAGLINE/LOGO}} 占位符（dev + build 通用，D2）；
//   ② closeBundle emit dist/site-config.js（D1：dist 根，window.YJ_SITE + window.YJ_GRADE）；
//   ③ configureServer 中间件直挂 /site-config.js（vite dev 下也不缺运行时配置）。
// 逻辑单一出处 = front/scripts/gen-site-config.mjs（vite.config.js 动态 import 其导出）。
function siteConfigPlugin() {
  const fs = require('fs');
  const path = require('path');
  const { pathToFileURL } = require('url');
  // 非字面量说明符：Vite config loader 的 esbuild（externalize-deps）对 dynamic-import 一律 external，
  // 本文件不进配置 bundle（避免 inject-file-scope-variables 把 shebang 顶到行中），运行时由 Node 原生加载。
  const genConfigUrl = pathToFileURL(path.resolve(__dirname, 'scripts/gen-site-config.mjs')).href;
  return {
    name: 'config-inject',
    async transformIndexHtml(html) {
      const gen = await import(genConfigUrl);
      const reps = gen.htmlReplacements();
      let out = html;
      for (const k of Object.keys(reps)) out = out.split(k).join(reps[k]);
      return out;
    },
    async closeBundle() {
      const gen = await import(genConfigUrl);
      const dst = path.resolve(__dirname, '../dist/site-config.js');
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, gen.siteConfigJs());
    },
    configureServer(server) {
      server.middlewares.use('/site-config.js', function (req, res) {
        import(genConfigUrl).then(function (gen) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(gen.siteConfigJs());
        });
      });
    }
  };
}

// 统一版本戳（2026-xx 定稿，取代手工 ?v=N，UI优化记录 §X 硬规 #7 废止）：
// 非 module 公共脚本在 build/dev 时由本插件自动打内容哈希戳 ?v=<sha1 前 10 位> ——
//   内容不变 → URL 不变 → 浏览器缓存命中；内容一变 → 哈希变 → 自动取新文件。
// 页面源码从此不写 ?v=（也禁止手改哈希），改 public/x.js 无需再 grep 全站 +1。
// site-config.js 是构建期产物（不在 public/），按生成内容哈希；外链脚本不参与。
function autoVersionPlugin() {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const { pathToFileURL } = require('url');
  const pub = path.resolve(__dirname, 'public');
  const genConfigUrl = pathToFileURL(path.resolve(__dirname, 'scripts/gen-site-config.mjs')).href;
  let gen = null;
  function hashOf(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10); }
  return {
    name: 'auto-version',
    async transformIndexHtml(html) {
      gen = gen || await import(genConfigUrl);
      return html.replace(/(<script[^>]*\bsrc=")([^"]+\.js)(?:\?[^"]*)?"/g, function (m, pre, file) {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return m;      /* http(s)/数据外链不动 */
        const rel = file.replace(/^\.\.\//, '');
        let buf = null;
        if (rel === 'site-config.js') {
          try { buf = Buffer.from(gen.siteConfigJs(), 'utf8'); } catch (e) { return m; }
        } else {
          const abs = path.join(pub, rel);
          if (!fs.existsSync(abs)) return m;                      /* 非 public 产物保持原样 */
          buf = fs.readFileSync(abs);
        }
        return pre + file + '?v=' + hashOf(buf) + '"';
      });
    }
  };
}

module.exports = defineConfig({
  // 相对路径 base：产物可部署到任意子目录
  base: './',
  plugins: [
    { name: 'gen-font', apply: 'build', buildStart: genFont },
    siteConfigPlugin(),
    autoVersionPlugin(),
    { name: 'copy-data', apply: 'build', closeBundle: copyData },
  ],
  build: {
    // ★ 产物输出到项目根 dist/；数据由上方 copy-data 插件复制为 dist/data/
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input }
  }
});
