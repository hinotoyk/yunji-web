/* ============================================================
 * 云迹 · 站点访问统计出口（不蒜子 · busuanzi）单一出处 —— §85
 *
 * 职责只有一个：**只在正式域名上**注入不蒜子脚本。本地预览、file://、以及 *.github.io
 * 那份部署，连脚本都不加载 —— 既不计数也不显示数字。
 *
 * 为什么必须按域名门控（实测结论，见 UI优化记录 §85）：
 *   不蒜子的计数归属 = 请求 Referer 的 host。无 Referer 直接 Bad Request；同 host 不同路径共享
 *   同一个 site_pv；sub.example.com 与 example.com 各自独立桶。于是：
 *     · 本地 127.0.0.1 / localhost 落进的是「全网所有本地测试者共享的桶」（实测 100 万+），
 *       与线上数字毫无关系，显示出来只会误导；
 *     · 线上各域名（www.yunji.xyz / yunji.xyz / *.github.io）是彼此独立的桶，数字互不相加。
 *   本站口径（2026-09-30 用户确认）：只统计线上 https://www.yunji.xyz/，本地不掺进来。
 *
 * 想换统计域名：只改下面 HOSTS 一处。注意 apex 'yunji.xyz' 是**另一个独立桶**——
 *   除非同时把 apex 跳转到 www，否则两个域名各算一份，数字会忽大忽小。
 *
 * 显示端在 index.html 侧栏页脚：两个标签默认 hidden，取数成功才由不蒜子脚本改成 inline；
 *   本脚本不加载时它们一直隐藏 → 页脚只剩原文案，不会出现「总访问 次」这种空占位。
 * ============================================================ */
(function () {
  var HOSTS = ['www.yunji.xyz'];
  if (HOSTS.indexOf(location.hostname) < 0) return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
  document.head.appendChild(s);
})();
