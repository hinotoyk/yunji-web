/*!
 * friend-links.js — 「站群导航」多站互跳小组件
 *
 * ★ 注册表来源（开源化 P0-7，2026-11-12）：**优先读构建注入的 window.YJ_FRIENDS**
 *   （源 = config/friend-links.json，构建期由 front/scripts/gen-site-config.mjs 注入
 *   dist/site-config.js）。为空数组 / 未注入 → 挂载点保持空白，不渲染分组。
 *   文件末尾的内置 LEGACY_SITES 只是历史兜底：仅当挂载点显式写了 data-friends-legacy 才启用，
 *   供 jbis-sire-rank-history / racing-calendar 这类不跑本仓构建的兄弟站过渡（它们没有 YJ_FRIENDS）。
 *
 * 字段（config/friend-links.json · sites[]）：
 *   id   = 站点标识（与本站 site.id 相同者渲染时自动排除）
 *   logo = 方块字（1~2 字）、color = 方块底色、name / sub = 主/副名、url = 跳转地址、
 *   desc = 第二行小字（"XX 产驹档案" 这类）
 *
 * 用法（挂载点；渲染失败 / 脚本缺失时挂载点保持空白，无占位观感）：
 *   <div data-friend-links data-site="{{YJ_SITE_ID}}" data-skin="yj"></div>
 *   <script src="friend-links.js" defer></script>
 *
 * data-site = 当前站 id（渲染时排除自身；空值回退 window.YJ_SITE.id —— 手改漏改的表现
 *   是「侧栏把自己也列出来、点自己跳自己」，而且不报错，所以默认派生比手改可靠）；
 * data-skin：
 *   yj   = 模板站侧栏皮肤，Tailwind utility 字面量
 *          （两站 tailwind.config.js 的 content 均扫 public 目录，可被编译进 theme css）；
 *   jbis = jbis 系页脚收尾皮肤（jbis / rc 两站共用），运行时注入自带 CSS（jbis 无 Tailwind）。
 *          颜色经归一化变量（--f-*）取宿主 token：jbis 原生变量（--line/--muted/--accent/
 *          --accent-soft/--ink/--card）与 shadcn 风（rc：--border/--muted-foreground/--primary/
 *          --foreground/--card）经 fallback 链自动适配，换肤跟随宿主。
 *
 * 跳转语义：一律新标签页（target=_blank + rel=noopener）——各站都是带页内状态的查询工具，
 * 跳走不丢当前筛选 / 图表 / 页码状态；外站也不进本站 iframe。
 */
(function () {
  "use strict";

  /* ---------- 内置注册表（**原站群示例**，仅 data-friends-legacy 时启用） ----------
   * 新站点请改 config/friend-links.json（构建期注入 YJ_FRIENDS）；fork 后这块可以整段删掉，
   * 只在给 jbis / racing-calendar 这类不跑本仓构建的兄弟站供文件时才需要保留。 */
  var LEGACY_SITES = [
    {
      id: "yunji", logo: "雲", color: "#0aa7a0",
      name: "云迹", sub: "云崽档案",
      url: "https://www.yunji.xyz/",
      desc: "コントレイル 产驹档案"
    },
    {
      id: "kzn", logo: "絆", color: "#0aa7a0",
      name: "絆", sub: "绊崽档案",
      url: "https://hinotoyk.github.io/kzn-web/dist/",
      desc: "キズナ 产驹档案"
    },
    {
      id: "jbis", logo: "LS", color: "#0aa7a0",
      name: "JBIS LS Rank榜", sub: "",
      url: "https://hinotoyk.github.io/jbis-sire-rank-history/",
      desc: "每日快照"
    },
    {
      id: "rc", logo: "RC", color: "#0aa7a0",
      name: "Racing Calendar", sub: "",
      url: "https://hinotoyk.github.io/racing-calendar/",
      desc: "一键生成出马表"
    }
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 展示名：name + sub 連写不超 10 字才拼「name · sub」，避免侧栏窄列截断
   * （主副名合计 ≤10 字才拼，否则窄列会截断；
   *   拉丁名宽度 ≈ 全角一半，窄列也不截断） */
  function labelOf(s) {
    if (s.sub && (s.name.length + s.sub.length) <= 10) return s.name + " · " + s.sub;
    return s.name;
  }

  /* ---------- 皮肤 yj：模板站侧栏 ----------
   * 视觉语言 = 侧栏既有元素逐类复用：分组标题 = nav 组标签（「统计」）同款，
   * 条目 = nav-item 同款（hover:bg-muted/40），logo 方块 = 品牌区 logo 同构（26px 缩号）。
   * 容器类也写在 JS 里（content 可扫到）；挂载点本身不带类，脚本缺失 = 零痕迹。 */
  function skinYJ(host) {
    var d = document.createElement("div");
    d.className = "border-t border-border px-2.5 pb-2";
    var h = '<div class="px-2.5 pb-1.5 pt-3 text-[11.5px] font-semibold uppercase tracking-[1.5px] text-secondary-foreground">站群导航</div>';
    host.sites.forEach(function (s) {
      if (s.id === host.site) return;
      h += '<a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="站群导航 · 新标签页打开"'
        + ' class="group mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">'
        + '<span aria-hidden="true" class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] text-[12.5px] font-bold text-primary-foreground" style="background:' + esc(s.color) + '">' + esc(s.logo) + '</span>'
        + '<span class="min-w-0 flex-1 leading-tight">'
        + '<span class="block truncate font-medium">' + esc(labelOf(s)) + '</span>'
        + '<span class="block truncate text-[10.5px] opacity-75">' + esc(s.desc) + '</span>'
        + '</span>'
        + '<span aria-hidden="true" class="flex-none text-[12px] text-primary opacity-0 transition-opacity group-hover:opacity-100">↗</span>'
        + '</a>';
    });
    d.innerHTML = h;
    host.el.appendChild(d);
  }

  /* ---------- 皮肤 jbis：jbis 系页脚收尾区（jbis / rc 两站共用） ----------
   * 位置 = main 之后、colophon footer 之前：读完内容自然到达的出口，不占首屏、
   * 不混入站头功能区（v2 定稿，站头 chips 行废弃）。
   * 视觉语言 = 宿主 panel 同语言（白底、1px 细线边、8px 圆角）+ 中文粗题 + 英文小字副题；
   * 条目 hover 同表格行（浅底 + 品牌边）。
   * 颜色 = 归一化变量（--f-*）：jbis 原生变量（--line/--muted/--accent/--accent-soft/
   * --ink/--card）与 shadcn 风（rc：--border/--muted-foreground/--primary/--foreground）
   * 经 fallback 链自动适配；品牌方块（雲/絆/LS/RC）= 四站家族识别语言，青绿恒定不随主题。 */
  var JCSS_ID = "yjfr-j-css";
  var JCSS = [
    ".yjfr-j{--f-line:var(--line,var(--border,#e5e5e5));--f-muted:var(--muted-foreground,var(--muted,#737373));--f-accent:var(--primary,var(--accent,#0aa7a0));--f-accent-soft:var(--accent-soft,var(--accent,#e6f6f5));--f-ink:var(--ink,var(--foreground,#1a1a1a));--f-card:var(--card,#ffffff);max-width:1200px;margin:0 auto;padding:0 24px 20px}",
    ".yjfr-j-head{margin:0 0 10px;font-size:13.5px;font-weight:700;color:var(--f-ink)}",
    ".yjfr-j-head span{margin-left:10px;font-size:11px;font-weight:400;letter-spacing:.1em;color:var(--f-muted)}",
    ".yjfr-j-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}",
    ".yjfr-j-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--f-line);border-radius:8px;background:var(--f-card);color:var(--f-ink);text-decoration:none;transition:border-color .15s,background .15s}",
    ".yjfr-j-card:hover{border-color:var(--f-accent);background:var(--f-accent-soft)}",
    ".yjfr-j-card:focus-visible{outline:2px solid var(--f-accent);outline-offset:2px}",
    ".yjfr-j-logo{display:flex;width:28px;height:28px;flex:none;align-items:center;justify-content:center;border-radius:8px;color:#fff;font-size:13px;font-weight:700}",
    ".yjfr-j-txt{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}",
    ".yjfr-j-txt b{font-weight:700;font-size:14px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}",
    ".yjfr-j-card:hover .yjfr-j-txt b{color:var(--f-accent)}",
    ".yjfr-j-txt small{font-weight:400;font-size:11.5px;color:var(--f-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".yjfr-j-arr{flex:none;font-size:13px;color:var(--f-accent);opacity:0;transition:opacity .15s}",
    ".yjfr-j-card:hover .yjfr-j-arr{opacity:1}",
    "@media (prefers-reduced-motion:reduce){.yjfr-j-card,.yjfr-j-txt b,.yjfr-j-arr{transition:none}}"
  ].join("\n");

  function ensureJCss() {
    if (document.getElementById(JCSS_ID)) return;
    var st = document.createElement("style");
    st.id = JCSS_ID;
    st.textContent = JCSS;
    document.head.appendChild(st);
  }

  function skinJBIS(host) {
    ensureJCss();
    var d = document.createElement("section");
    d.className = "yjfr-j";
    var h = '<h2 class="yjfr-j-head">站群导航<span>NETWORK</span></h2><div class="yjfr-j-cards">';
    host.sites.forEach(function (s) {
      if (s.id === host.site) return;
      h += '<a class="yjfr-j-card" href="' + esc(s.url) + '" target="_blank" rel="noopener" title="站群导航 · 新标签页打开">'
        + '<span aria-hidden="true" class="yjfr-j-logo" style="background:' + esc(s.color) + '">' + esc(s.logo) + '</span>'
        + '<span class="yjfr-j-txt"><b>' + esc(labelOf(s)) + '</b><small>' + esc(s.desc) + '</small></span>'
        + '<span aria-hidden="true" class="yjfr-j-arr">↗</span>'
        + '</a>';
    });
    d.innerHTML = h + '</div>';
    host.el.appendChild(d);
  }

  /* ---------- 引导：扫描挂载点，逐个渲染（幂等，先清空再渲染） ---------- */
  function boot() {
    var mounts = document.querySelectorAll("[data-friend-links]");
    for (var i = 0; i < mounts.length; i++) {
      var el = mounts[i];
      el.innerHTML = "";
      /* 注册表：构建注入的 YJ_FRIENDS 优先；未注入时只有显式 data-friends-legacy 才用内置表 ——
       * 这样「fork 站什么都没配」的表现是侧栏没有这一组，而不是渲染出原作者的四个站。 */
      var sites = Array.isArray(window.YJ_FRIENDS) ? window.YJ_FRIENDS
        : (el.hasAttribute("data-friends-legacy") ? LEGACY_SITES : []);
      if (!sites.length) continue;                       /* 空 = 不渲染（连分组标题都不出现） */
      var site = el.getAttribute("data-site") || (window.YJ_SITE && window.YJ_SITE.id) || "";
      var skin = el.getAttribute("data-skin") || "yj";
      try {
        if (skin === "jbis") skinJBIS({ el: el, site: site, sites: sites });
        else skinYJ({ el: el, site: site, sites: sites });
      } catch (e) { /* 任何渲染异常都静默：挂载点最多保持空白，绝不影响宿主页面 */ }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
