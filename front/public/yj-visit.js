/* ============================================================
 * 云迹 · 站点访问统计出口（Vercount）单一出处 —— §87
 *
 * 职责只有一个：**只在正式域名上**注入统计脚本。本地预览、file://、以及 *.github.io
 * 那份部署，连脚本都不加载 —— 既不计数也不显示数字。
 *
 * 为什么必须按域名门控（延续 §85 的口径）：
 *   站点级 PV/UV 是**按 host 分桶**的，全域混算毫无意义：
 *     · 本地 127.0.0.1 / localhost 若计入，会把本地调试并进线上数字；
 *     · 线上各域名（www.yunji.xyz / apex yunji.xyz / *.github.io）是彼此独立的桶，数字互不相加。
 *   本站口径（2026-09-30 用户确认）：只统计线上 https://www.yunji.xyz/。
 *
 * 想换统计域名：只改下面 HOSTS 一处。apex 'yunji.xyz' 是另一个独立桶——
 *   线上已有 CF 侧 301（apex → www，见 §85 第 6 条），apex 与 http 裸域四个入口都落到 www。
 *
 * ★ 2026-10-02 由「不蒜子」迁到 Vercount（§87）：不蒜子服务端 502（取数 API
 *   `busuanzi.ibruce.info/busuanzi` 实测 502/超时，静态脚本本体也不稳），页脚数字长期回不来。
 *   Vercount 兼容同一套 DOM id（且额外认 vercount_*），HTML 零改动，只换本处 src。
 *
 * 显示端在 index.html 侧栏页脚：两个标签默认 hidden，取数成功才由统计脚本改成 inline；
 *   本脚本不加载时它们一直隐藏 → 页脚只剩原文案，不会出现「总访问 次」这种空占位。
 * ============================================================ */
(function () {
  var HOSTS = ['www.yunji.xyz'];
  if (HOSTS.indexOf(location.hostname) < 0) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://cn.vercount.one/js';
  document.head.appendChild(s);
})();
