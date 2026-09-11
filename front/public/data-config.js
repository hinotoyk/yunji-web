/* data-config.js —— 数据源映射 · 唯一配置点
 *
 * 所有数据请求都必须经 YJ_DATA.url() 解析，禁止散落写死 ../../data/... 路径。
 * 想改数据目录/位置：只改 root 一行；想换 CDN / 绝对数据源：改 url() 返回绝对地址。
 * 页面统一经 <script src="../data-config.js"> 引入，且必须先于任何使用 YJ_DATA 的脚本。 */
window.YJ_DATA = {
  /* ★ 数据目录名（站点根相对）。当前 = 项目根下的 data/ */
  root: 'data',
  /* 站点根 → 页面的相对前缀：页面统一在站点根下 2 层（dist/pages/），故为 ../.. */
  prefix: '../..',
  /* 把「站点根相对路径」（data/basic.json、data/races/1.json、photos/x.jpg…）转成当前页可用的相对 URL */
  url: function (p) {
    p = String(p == null ? '' : p).replace(/^\/+/, '');
    if (p.indexOf('data/') === 0) p = p.slice(5); /* 兼容后端契约里的 data/xxx 写法 */
    return this.prefix + '/' + this.root + '/' + p;
  }
};
