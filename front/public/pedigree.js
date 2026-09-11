/* 云迹 · 血统渲染（Tailwind 版）
 * 逻辑与原版完全一致（简约 2 代 / 完整 5 代 / 弹窗）；
 * 视觉全部用 Tailwind utility 类实现，grid-row 动态值走 inline style。
 * API 与原版相同：
 *   YJ.pedigree.load / simpleHTML / fullHTML / openModal / bindSimple
 */
window.YJ = window.YJ || {};
YJ.pedigree = (function () {
  "use strict";

  var cache = {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function load(id, base) {
    var key = String(id);
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch((base || YJ_DATA.url('pedigree/')) + key + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) { cache[key] = d; return d; });
  }

  /* 单元格：保留国籍后缀，显示年/毛色；深代年/毛色放名字后同行
   * 视觉用 Tailwind：.pcell.m 淡蓝底、.pcell.f 淡粉底、.pcell.x 斜纹空位 */
  function cell(n, g, i, off, rowsTotal) {
    var rows = rowsTotal / Math.pow(2, g);
    var rs = off + 1 + i * rows, re = off + 1 + (i + 1) * rows;
    if (!n) return '<div class="pcell x cursor-default" style="grid-row:' + rs + '/' + re + '"></div>';
    var cls = n.sex === "牝" ? "f" : "m";
    var fs = g <= 1 ? 14 : g === 2 ? 13 : 12;
    var meta = [n.year, n.color].filter(Boolean).join(" · ");
    var inline = g >= 2 ? " inline" : "";
    return '<div class="pcell ' + cls + inline + '" style="grid-row:' + rs + '/' + re + ';font-size:' + fs + 'px" title="' +
      esc([n.name, n.year ? n.year + "年生" : "", n.color].filter(Boolean).join(" · ")) + '">' +
      '<span class="name">' + esc(n.name) + '</span>' +
      (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') +
    '</div>';
  }

  function side(arr, off, gens, rowsTotal) {
    var out = [];
    for (var g = 0; g < gens; g++) {
      var row = arr[g] || [];
      for (var i = 0; i < Math.pow(2, g); i++) out.push(cell(row[i], g, i, off, rowsTotal));
    }
    return out.join("");
  }

  /* 简约版：前 2 代（父上母下，紧凑适配容器） */
  function simpleHTML(ped) {
    var p = (ped && ped.pedigree) || {};
    var f = p.父 || [], m = p.母 || [];
    if (!f.length && !m.length) return '<div class="py-2.5 text-[13px] text-muted-foreground">暂无血统数据</div>';
    var grid = '<div class="pside pside-simple">' +
      side(f, 0, 2, 8) +
      side(m, 8, 2, 8) +
    '</div>';
    return grid;
  }

  /* 完整版：父母各 5 代 */
  function fullHTML(ped) {
    var p = (ped && ped.pedigree) || {};
    var f = p.父 || [], m = p.母 || [];
    var foot = [];
    if (ped && ped.fno) foot.push('<span class="flex gap-1.5"><b class="font-semibold text-primary">FNo</b> ' + esc(ped.fno) + '</span>');
    if (ped && ped.cross) foot.push('<span class="flex gap-1.5"><b class="font-semibold text-primary">クロス</b> ' + esc(ped.cross) + '</span>');
    var info = foot.length ? '<div class="mt-2 flex flex-wrap gap-4 text-[12.5px] text-secondary-foreground">' + foot.join("") + '</div>' : "";
    if (!f.length && !m.length) {
      return info + '<div class="py-2.5 text-[13px] text-muted-foreground">暂无血统数据</div>';
    }
    var grid = '<div class="pside">' + side(f, 0, 5, 16) + side(m, 16, 5, 16) + '</div>';
    return info + grid;
  }

  /* 弹窗 */
  function openModal(ped, title) {
    var ov = document.createElement("div");
    ov.className = "pg-overlay fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4";
    ov.innerHTML =
      '<div class="pg-modal flex max-h-[96vh] max-w-[98vw] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,.25)]">' +
        '<div class="flex items-center justify-between border-b border-border px-4 py-3">' +
          '<span class="pg-modal-title text-[15px] font-semibold">' + esc(title || "血统图") + '</span>' +
          '<button class="pg-close h-[30px] w-[30px] cursor-pointer rounded-lg border-none bg-muted/50 text-[18px] leading-none text-foreground hover:bg-muted" type="button">×</button>' +
        '</div>' +
        '<div class="pg-modal-body min-w-0 max-w-[96vw] overflow-auto p-3.5 max-md:p-2.5">' + fullHTML(ped) + '</div>' +
      '</div>';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); }
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.querySelector(".pg-close").addEventListener("click", close);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    window.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }

  function bindSimple(el, ped, title) {
    el.addEventListener("click", function () { openModal(ped, title); });
  }

  /* 注入网格样式（Tailwind utility 已覆盖配色/字号/间距；
   * 仅 grid 布局机制与紧凑版行高需要少量结构性 CSS，定义在这里） */
  var css = `
/* 血统网格（5 列，行列照抄旧版；配色用 Tailwind 类） */
.pside{display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:26px;gap:1px;background:#e5e5e5;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;min-width:760px}
.pcell{min-width:0;padding:2px 8px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;cursor:pointer;background:#fff}
.pcell.m{background:#e9f1f7}
.pcell.f{background:#f8eeee}
.pcell.x{background:repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(0,0,0,.02) 6px,rgba(0,0,0,.02) 12px);cursor:default}
.pcell .name{font-weight:600;color:#0a0a0a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcell .meta{color:#737373;white-space:nowrap}
.pcell:not(.inline) .name{display:block}
.pcell:not(.inline) .meta{display:block;font-size:9px;margin-top:1px;overflow:hidden;text-overflow:ellipsis}
.pcell.inline{flex-direction:row;align-items:center;gap:6px}
.pcell.inline .meta{flex:none;font-size:10px;margin-left:auto;padding-left:6px}

/* 简约版：2 列，紧凑 */
.pside-simple{grid-template-columns:repeat(2,1fr);min-width:0;grid-auto-rows:17px;border-radius:6px}
.pside-simple .pcell{padding:1px 8px}
.pside-simple .pcell .name{font-size:11.5px}
.pside-simple .pcell .meta{font-size:8px}
`;
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  return { load, simpleHTML, fullHTML, openModal, bindSimple };
})();
