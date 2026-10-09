/* 独立打开 = 自动回壳（单一出处，2026-xx 由 8 页内联副本收口，docs/重复代码审计.md A1）：
 * 站内页一律经外壳（index.html）带侧边栏运行；被外壳 iframe 内嵌时 window.top !== window.self，
 * 原样不动。embed 模式同理不回壳。必须早于其它脚本在 head 同步执行。 */
if (window.top === window.self && location.search.indexOf("embed=1") < 0) {
  var rel = location.pathname.split("/").slice(-2).join("/") + location.search;
  location.replace("../index.html?page=" + encodeURIComponent(rel));
}
