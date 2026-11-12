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
   * 兄弟站地址见 config/sire.json 的 site.cross_site（本文件只负责读取）。GitHub Pages 全站带 CORS *，可直连。
   * ★ 统一引用模式（2026-11-02 定稿）：兄弟站发布「derived 数据产物 + embed/ 纯渲染组件」，
   *   宿主 = remote 配置一处 + 动态加载组件 + 挂载点传参 → 内嵌结果（不 iframe 整站、不复制渲染逻辑）。
   * jbis-sire-rank-history：JBIS 種牡馬ランキング每日快照站（数据与派生产物的唯一出处，
   *   每日 JST 12:30 自动采集发布）。当前引用：
   *   · derived/sire-history/<board>/<jbis_id>.json —— 种马榜走势（stats.html §种马榜走势；
   *     yj-cache REG.sireRank，arg = "<board>/<jbisId>"，jbisId 源 = config/sire.json → YJ_SITE.jbisId）
   *   · embed/sire-rank-chart.js —— 该站发布的纯渲染图表组件（stats.html 动态加载一次）
   * racing-calendar：出走表站（JBIS/Racing Post 出馬表采集，每日两次自动更新，DESIGN.md §10）。
   *   entries.html 挂载 embed/entries-table.js 组件（RC_ENTRIES_EMBED.mount）——
   *   组件自带数据编排与解包，sire = YJ_SITE.sireName（config/sire.json 单源）；
   *   调试 `?rcdev=1` 切本地 http://127.0.0.1:9093/（该仓 `npm run serve`，已带 CORS *；端口单源 = 其 serve.config.json）。
   *
   * ★ 地址不再写死（P1-0，2026-11-12）：单一出处 = config/sire.json 的 site.cross_site
   *   （构建期注入 window.YJ_SITE.crossSite）。**缺段/空串 = 该跨站功能关闭** ——
   *   stats 隐藏「种马榜走势」整节、entries 显示「未配置出走表数据源」，
   *   语义与 site.repo / site.analytics 一致（fork 后一个字不改，不该还去抓原作者的部署）。
   *   用 getter 而不是字面量：本文件在少数页面早于/晚于 site-config.js 的先后不完全一致，
   *   加载期固化会把覆盖静默丢掉（与 §105 storeKey「一律调用时求值」同一个坑）。 */
  remote: {
    get jbisRank() {
      var cs = window.YJ_SITE && YJ_SITE.crossSite;
      return (cs && cs.jbisRank) ? String(cs.jbisRank) : "";
    },
    get rc() {
      var cs = window.YJ_SITE && YJ_SITE.crossSite;
      return (cs && cs.rc) ? String(cs.rc) : "";
    }
  }
};
