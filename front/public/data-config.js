/* data-config.js —— 数据源映射 · 唯一配置点
 *
 * 所有数据请求都必须经 YJ_DATA.url() 解析，禁止散落写死 ../data/... 路径。
 * 想改数据目录/位置：只改 prefix / root；想换 CDN / 绝对数据源：改 url() 返回绝对地址。
 * 页面统一经 <script src="../data-config.js"> 引入，且必须先于任何使用 YJ_DATA 的脚本。 */
window.YJ_DATA = {
  /* ★ 数据目录名（dist 根相对）。构建时由 vite.config.js 的 copy-data 插件
   *   把项目根 data/ 复制为 dist/data/（跳过 _tmp 与 *.md/*.csv），页面引用 dist 内自带副本 */
  root: 'data',
  /* 页面 → dist 根的相对前缀：页面统一在 dist/pages/ 下 1 层，故为 .. */
  prefix: '..',
  /* 把「dist 根相对路径」（data/basic.json、data/races/1.json、photos/x.jpg…）转成当前页可用的相对 URL */
  url: function (p) {
    p = String(p == null ? '' : p).replace(/^\/+/, '');
    if (p.indexOf('data/') === 0) p = p.slice(5); /* 兼容后端契约里的 data/xxx 写法 */
    return this.prefix + '/' + this.root + '/' + p;
  },
  /* ---- 远程数据源（跨站引用 · 运行时 fetch，不复制进本仓 data/） ----
   * 兄弟站清单见 docs/友情跳转方案.md（四仓同文）。GitHub Pages 全站带 CORS *，可直连。
   * jbis-sire-rank-history：JBIS 種牡馬ランキング每日快照站（数据与派生产物的唯一出处，
   *   每日 JST 12:30 自动采集发布）。当前引用：
   *   · derived/sire-history/<board>/<jbis_id>.json —— 种马榜走势（stats.html §种马榜走势；
   *     yj-cache REG.sireRank，arg = "<board>/<jbisId>"，jbisId 源 = config/sire.json → YJ_SITE.jbisId）
   *   · embed/sire-rank-chart.js —— 该站发布的纯渲染图表组件（stats.html 动态加载一次） */
  remote: {
    jbisRank: 'https://hinotoyk.github.io/jbis-sire-rank-history/'
  }
};
