/* 云迹 · 血统渲染（样式照抄 page/pedigree.html，适配当前主题）
 * 数据：data/pedigree/{id}.json → {pedigree:{父:[[]...], 母:[[]...]}, fno, cross}
 *       每代每格 {name, sex, id, year, color}
 * API:
 *   YJ.pedigree.load(id, base)        → promise<ped>（带缓存）
 *   YJ.pedigree.simpleHTML(ped)       → 简约版：父母两侧各 2 代（共 6 格）
 *   YJ.pedigree.fullHTML(ped)         → 完整版：父母各 5 代网格 + FNo/クロス
 *   YJ.pedigree.openModal(ped, title) → 弹窗展示完整版
 * 样式注入一次；依赖 theme.css 变量做底色/边框，性别底、网格线照抄旧版。
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
    return fetch((base || "../../data/pedigree/") + key + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) { cache[key] = d; return d; });
  }

  /* 单元格（照抄旧版 .pcell）：保留国籍后缀，显示年/毛色；深代年/毛色放名字后同行 */
  function cell(n, g, i, off, rowsTotal) {
    var rows = rowsTotal / Math.pow(2, g);
    var rs = off + 1 + i * rows, re = off + 1 + (i + 1) * rows;
    if (!n) return '<div class="pcell x" style="grid-row:' + rs + '/' + re + '"></div>';
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

  /* 一侧的代序列：g=0..gens-1 层 */
  function side(arr, off, gens, rowsTotal) {
    var out = [];
    for (var g = 0; g < gens; g++) {
      var row = arr[g] || [];
      for (var i = 0; i < Math.pow(2, g); i++) out.push(cell(row[i], g, i, off, rowsTotal));
    }
    return out.join("");
  }

  /* ---------- 简约版：完整版只取前 2 代（父上母下树状网格，紧凑适配容器） ---------- */
  function simpleHTML(ped) {
    var p = (ped && ped.pedigree) || {};
    var f = p.父 || [], m = p.母 || [];
    if (!f.length && !m.length) return '<div class="pg-empty">暂无血统数据</div>';
    // 与完整版同款 .pside 网格，仅 2 代；父侧行 1-8、母侧行 9-16（rowsTotal=8，紧凑）
    var grid = '<div class="pside pside-simple">' +
      side(f, 0, 2, 8) +
      side(m, 8, 2, 8) +
    '</div>';
    return grid;
  }

  /* ---------- 完整版：父母各 5 代（照抄旧版） ---------- */
  function fullHTML(ped) {
    var p = (ped && ped.pedigree) || {};
    var f = p.父 || [], m = p.母 || [];
    var foot = [];
    if (ped && ped.fno) foot.push('<span><b>FNo</b> ' + esc(ped.fno) + '</span>');
    if (ped && ped.cross) foot.push('<span><b>クロス</b> ' + esc(ped.cross) + '</span>');
    // FNo / クロス 放在血统图上方（标题下方），保留原样式
    var info = foot.length ? '<div class="pedi-foot">' + foot.join("") + '</div>' : "";
    if (!f.length && !m.length) {
      return info + '<div class="pg-empty">暂无血统数据</div>';
    }
    var grid = '<div class="pside">' + side(f, 0, 5, 16) + side(m, 16, 5, 16) + '</div>';
    return info + grid;
  }

  /* ---------- 弹窗 ---------- */
  function openModal(ped, title) {
    var ov = document.createElement("div");
    ov.className = "pg-overlay";
    ov.innerHTML =
      '<div class="pg-modal">' +
        '<div class="pg-modal-head"><span class="pg-modal-title">' + esc(title || "血统图") + '</span>' +
          '<button class="pg-close" type="button">×</button></div>' +
        '<div class="pg-modal-body">' + fullHTML(ped) + '</div>' +
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

  /* 注入样式（照抄 page/pedigree.html 血统网格 + 弹窗壳） */
  var css = `
/* 血统网格（照抄旧版 page/pedigree.html） */
.pside{display:grid;grid-template-columns:repeat(5,1fr);grid-auto-rows:26px;gap:1px;background:hsl(var(--border));border:1px solid hsl(var(--border));border-radius:8px;overflow:hidden;min-width:760px}
.pcell{min-width:0;background:hsl(var(--card));padding:2px 8px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;cursor:pointer}
.pcell.m{background:#e9f1f7}
.pcell.f{background:#f8eeee}
.pcell.x{background:repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(0,0,0,.02) 6px,rgba(0,0,0,.02) 12px);cursor:default}
.pcell .name{font-weight:600;color:hsl(var(--foreground));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcell .meta{color:hsl(var(--muted-foreground));white-space:nowrap}
.pcell:not(.inline) .name{display:block}
.pcell:not(.inline) .meta{display:block;font-size:9px;margin-top:1px;overflow:hidden;text-overflow:ellipsis}
.pcell.inline{flex-direction:row;align-items:center;gap:6px}
.pcell.inline .meta{flex:none;font-size:10px;margin-left:auto;padding-left:6px}
.pedi-foot{margin-top:8px;font-size:11px;color:hsl(var(--muted-foreground));display:flex;gap:16px;flex-wrap:wrap}
.pedi-foot b{color:hsl(var(--primary));font-weight:600}
.pg-empty{color:hsl(var(--muted-foreground));font-size:12.5px;padding:10px 0}
.pg-hint{font-size:11px;color:hsl(var(--muted-foreground));margin-top:8px}
.pg-hint b{color:hsl(var(--primary));font-weight:500}

/* 简约版：完整版只取前 2 代，紧凑适配容器（高度≈完整版同结构，行高压到 2/3） */
.pside-simple{grid-template-columns:repeat(2,1fr);min-width:0;grid-auto-rows:15px;border-radius:6px}
.pside-simple .pcell{padding:1px 8px}
.pside-simple .pcell .name{font-size:11px}
.pside-simple .pcell .meta{font-size:7px}

/* 弹窗壳（完整版，大弹窗可滚动，优先可读） */
.pg-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px}
.pg-modal{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:12px;max-width:98vw;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}
.pg-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid hsl(var(--border))}
.pg-modal-title{font-size:15px;font-weight:600}
.pg-close{width:30px;height:30px;border:none;border-radius:8px;background:hsl(var(--muted)/.5);color:hsl(var(--foreground));font-size:18px;line-height:1;cursor:pointer}
.pg-close:hover{background:hsl(var(--muted))}
.pg-modal-body{overflow:auto;padding:14px 16px;min-width:0;max-width:96vw}
@media (max-width:768px){
  .pg-modal-body{padding:10px}
}
`;
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  return { load, simpleHTML, fullHTML, openModal, bindSimple };
})();
