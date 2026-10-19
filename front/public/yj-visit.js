/* ============================================================
 * 云迹 · 站点访问统计出口（§97 双线：Vercount 计数 + GoatCounter 计数/展示）
 *
 * 职责：**只在正式域名上**注入统计脚本。本地预览、file://、以及 *.github.io
 * 那份部署，连脚本都不加载 —— 既不计数也不显示数字。
 *
 * 域名门控（延续 §85 口径）：站点级 PV 按 host 分桶，本地/其它域混算无意义。
 * 本站口径（2026-09-30 用户确认）：只统计线上 https://www.yunji.xyz/。
 * 白名单单源 = config/sire.json 的 site.domains（构建注入 window.YJ_SITE，此处只读取归一，
 * 缺省/非数组 → [] → 不加载任何统计脚本，防 undefined 抛 TypeError）。
 *
 * §97 双线方案（2026-10-19 用户确认「保留 Vercount 不展示 + 引入 GoatCounter」）：
 *   ① Vercount：继续加载计数（历史连续 + 冗余对照）；页脚已无 busuanzi_* 容器
 *      → 其脚本取不到 DOM，只计数、不展示（计数走 API POST，与 DOM 无关）。
 *   ② GoatCounter：注入 count.js 上报（data-goatcounter → {CODE}.goatcounter.com/count）；
 *      页脚「总访问」由本脚本拉公开端点回填（官方 Visitor counter 文档）：
 *        GET https://{CODE}.goatcounter.com/counter/TOTAL.json → {"count":"1,234"}
 *      · TOTAL = 全站合计（大小写敏感、无前导斜杠）；服务端缓存最长 4h → 数字非实时。
 *      · 公开端点只有 PV（count_unique 已废弃、恒等于 count）→ 页脚不再显示
 *        「访客 N 人」，独立访客去后台看。
 *      · 前置：后台须开启「Allow adding visitor counts on your website」（默认关，
 *        关着时端点 403，2026-10-19 探针实测）。
 * 展示端在 index.html 侧栏页脚：链接容器默认 hidden，取数成功才改 display:inline；
 * 超时 5s / 失败 / 被拦截 → 一直隐藏，不会出现「总访问 次」空占位（口径同 §85 第 4 条）。
 * ============================================================ */
(function () {
  var HOSTS = (window.YJ_SITE && Array.isArray(window.YJ_SITE.domains)) ? window.YJ_SITE.domains : [];
  if (HOSTS.indexOf(location.hostname) < 0) return;

  /* ① Vercount：只计数（页脚容器已删 → 无展示） */
  var v = document.createElement('script');
  v.async = true;
  v.src = 'https://cn.vercount.one/js';
  document.head.appendChild(v);

  /* ② GoatCounter：上报 + 页脚回填（code 变更只改 GC_CODE 一处） */
  var GC_CODE = 'yunji';

  var g = document.createElement('script');
  g.async = true;
  g.setAttribute('data-goatcounter', 'https://' + GC_CODE + '.goatcounter.com/count');
  g.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(g);

  var ac = (typeof AbortController === 'function') ? new AbortController() : null;
  var timer = ac ? setTimeout(function () { ac.abort(); }, 5000) : null;
  fetch('https://' + GC_CODE + '.goatcounter.com/counter/TOTAL.json',
        ac ? { signal: ac.signal } : undefined)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      if (timer) clearTimeout(timer);
      var a = document.getElementById('gc_container_site_pv');
      var n = (d && d.count != null) ? parseInt(String(d.count).replace(/[^0-9]/g, ''), 10) : NaN;
      if (!a || !(n >= 0)) return;                       // 元素缺失/值异常 → 保持隐藏
      document.getElementById('gc_value_site_pv').textContent = String(d.count);
      a.style.display = 'inline';                        // hidden → 显示（同 §85 Vercount 口径）
    })
    .catch(function () { /* 超时/失败/被拦截 → 一直隐藏 */ });
})();
