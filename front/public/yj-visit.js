/* ============================================================
 * 站点访问统计出口（§97 双线：Vercount 计数 + GoatCounter 计数/展示）
 *
 * 职责：**只在正式域名上**注入统计脚本。本地预览、file://、以及 *.github.io
 * 那份部署，连脚本都不加载 —— 既不计数也不显示数字。
 *
 * 域名门控（延续 §85 口径）：站点级 PV 按 host 分桶，本地/其它域混算无意义。
 * 白名单单源 = config/sire.json 的 site.domains（构建注入 window.YJ_SITE，此处只读取归一，
 * 缺省/非数组 → [] → 不加载任何统计脚本，防 undefined 抛 TypeError）。
 *
 * ★ 开源化（P0-6，2026-11-12）：统计**账号**也走配置，三态：
 *   site.analytics = { "goatcounter": "<code>", "vercount": true|false }
 *   ① goatcounter 空 → 不注入 count.js、不拉 counter/TOTAL.json、页脚「总访问」节点**从 DOM 移除**
 *      （以前 href 写死在 index.html 里，fork 后每个访客都可能点到原作者的统计后台）；
 *   ② vercount 非 true（缺省 false）→ 不注入第三方计数脚本（公用计数、不归属任何人，
 *      fork 也没必要白送一次第三方请求）；
 *   ③ 两项都空 + domains 非空 → 构建期已在「本站身份」自检里提示，运行期完全静默。
 *   效果：fork 者即使只改域名、没配 analytics，也不会把自己的访客计进原作者的 GoatCounter。
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
 * 展示端在 index.html 侧栏页脚：链接容器默认 hidden 且**不带 href**（href 由本脚本按配置补），
 * 取数成功才改 display:inline；超时 5s / 失败 / 被拦截 → 一直隐藏，不会出现「总访问 次」
 * 空占位（口径同 §85 第 4 条）。
 *
 * ★ 展示回落（2026-11-15，用户要求「GoatCounter 没正常显示就显示 Vercount」）：
 *   GoatCounter 展示**失败**（≠ 未配置）时，改显示 Vercount 的站点 PV，页脚不空着。
 *   「失败」判定 = 以下任一：fetch 超时 5s / 非 2xx（403 最常见：后台没开 visitor counts）/
 *   JSON 无 count 字段 / count 解析不出非负整数 / 节点缺失。
 *   实现要点（三条都不能改）：
 *     · Vercount 数字由它自己的脚本渲染进 #vercount_value_site_pv（DOM 契约见其脚本：
 *       busuanzi_value_* 与 vercount_value_* 双 id 兼容、容器成功后才 display:inline）。
 *       **不自己请求 Vercount API**：其 /api/v2/log 是「计数 + 返回」一体端点，再调一次就把 PV 刷高。
 *       只读它已渲染的值；它自己失败时会用 localStorage 缓存 visitorCountData 兜底渲染，故可能晚到
 *       → 用 MutationObserver 等它落定（只观察一个节点，不必设超时）。
 *     · 显隐必须挂**外层包裹** #vc_container_site_pv：vercount 脚本会强写内层容器 display:inline，
 *       那会盖掉 Tailwind 的 hidden 类；写在内层 → GoatCounter 正常时也会露出 Vercount 数字。
 *     · 两条线只认第一次结果（settled 闸）：GC 成功就不再回落，回落了也不再被 GC 顶掉。
 *   未配置 vercount（≠true）→ 无回落节点，行为与之前完全一致（失败就保持隐藏）。
 *   注意：GoatCounter **未配置**（GC_CODE 空）不算失败 —— 仍按 P0-6 把节点从 DOM 移除，不回落。
 * ============================================================ */
(function () {
  var SITE = window.YJ_SITE || {};
  var HOSTS = Array.isArray(SITE.domains) ? SITE.domains : [];
  if (HOSTS.indexOf(location.hostname) < 0) return;

  var AN = (SITE.analytics && typeof SITE.analytics === 'object') ? SITE.analytics : {};
  var GC_CODE = String(AN.goatcounter == null ? '' : AN.goatcounter).trim();
  var USE_VERCOUNT = AN.vercount === true;

  var GC_NODE_ID = 'gc_container_site_pv';
  var GC_VALUE_ID = 'gc_value_site_pv';
  var VC_NODE_ID = 'vc_container_site_pv';      /* 外层包裹：显隐归本脚本独占（见文件头回落第 2 点） */
  var VC_VALUE_ID = 'vercount_value_site_pv';   /* vercount 脚本的 DOM 契约，勿改名 */

  /* 页脚节点在 body 里，本脚本在 <head> 同步执行 → 此刻还取不到，统一等 DOM 就绪再操作 */
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* Vercount 渲染裸数字（"1234"），GoatCounter 端点自带分隔（"1,234"）→ 统一成后者观感 */
  function group(text) {
    return String(text).replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ③ 展示回落：露出 Vercount 行（等它把数字写进 DOM） */
  function revealVercount() {
    if (!USE_VERCOUNT) return;
    var wrap = document.getElementById(VC_NODE_ID);
    var val = document.getElementById(VC_VALUE_ID);
    if (!wrap || !val) return;                       /* 节点缺失（旧缓存 HTML / 类被裁剪）→ 无回落可言 */
    var shown = false;
    function show() {
      if (shown) return;
      shown = true;
      if (/\d/.test(val.textContent)) val.textContent = group(val.textContent);
      wrap.classList.remove('hidden');
      wrap.style.display = 'inline';                 /* 双保险：class 被 Tailwind 裁剪时仍能露出 */
    }
    if (/\d/.test(val.textContent)) { show(); return; }
    if (typeof MutationObserver !== 'function') return;   /* 极老浏览器：无回落，保持隐藏且不抛错 */
    var mo = new MutationObserver(function () {
      if (/\d/.test(val.textContent)) { mo.disconnect(); show(); }
    });
    mo.observe(val, { childList: true, characterData: true, subtree: true });
  }

  /* ① Vercount：计数（页脚平时不展示，只在 ③ 回落时露出）；未配 = 不加载 */
  if (USE_VERCOUNT) {
    var v = document.createElement('script');
    v.async = true;
    v.src = 'https://cn.vercount.one/js';
    document.head.appendChild(v);
  }

  /* ② GoatCounter：未配 code → 页脚节点直接从 DOM 移除（不是隐藏：DOM 里不该留原作者后台的指针） */
  if (!GC_CODE) {
    whenReady(function () {
      var a = document.getElementById(GC_NODE_ID);
      if (a && a.parentNode) a.parentNode.removeChild(a);
    });
    return;
  }
  whenReady(function () {
    var a = document.getElementById(GC_NODE_ID);
    if (!a) return;
    a.href = 'https://' + GC_CODE + '.goatcounter.com';   /* 后台链接随配置变（原来是写死的静态 href） */
    a.title = 'GoatCounter 统计后台：页面 / 来源 / 地区 / 时段';
  });

  var g = document.createElement('script');
  g.async = true;
  g.setAttribute('data-goatcounter', 'https://' + GC_CODE + '.goatcounter.com/count');
  g.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(g);

  var ac = (typeof AbortController === 'function') ? new AbortController() : null;
  var timer = ac ? setTimeout(function () { ac.abort(); }, 5000) : null;

  var settled = false;                 /* 只认第一次结果：GC 显示成功 或 回落 Vercount，二选一 */
  function fallback() {
    if (settled) return;
    settled = true;
    /* ★ 必须等 DOM 就绪：fetch 可能在本脚本（<head>、body 还没解析）就失败/返回，
     *   此刻 getElementById 全是 null → 之前会误判「节点缺失」而静默什么都不显示。 */
    whenReady(revealVercount);
  }

  fetch('https://' + GC_CODE + '.goatcounter.com/counter/TOTAL.json',
        ac ? { signal: ac.signal } : undefined)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      if (timer) clearTimeout(timer);
      var n = (d && d.count != null) ? parseInt(String(d.count).replace(/[^0-9]/g, ''), 10) : NaN;
      whenReady(function () {
        var a = document.getElementById(GC_NODE_ID);
        var el = document.getElementById(GC_VALUE_ID);
        if (!a || !el || !(n >= 0)) return fallback();   /* 节点缺失 / 值异常 = 没显示出来 → 回落 */
        if (settled) return;
        settled = true;
        el.textContent = String(d.count);
        a.style.display = 'inline';                      /* hidden → 显示（同 §85 Vercount 口径） */
      });
    })
    .catch(fallback);                                  /* 超时/失败/被拦截 → 回落 Vercount */
})();
