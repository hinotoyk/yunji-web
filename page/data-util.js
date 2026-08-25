/* 云迹 · 前端数据工具
 * basic.json = {_meta, horses}；历史快照 = v1 裸数组（含 races/pedigree 内嵌）。
 * 统一入口：loadCrops() 返回 {horses, meta}（兼容 v1/v2）
 * 按需加载：ensureRaces(h) / ensurePedigree(h) —— 详情页才拉拆分文件，列表不拉
 */
window.YJ = (function () {
  "use strict";

  async function loadCrops(url) {
    const r = await fetch(url || "../data/basic.json");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (Array.isArray(d)) return { horses: d, meta: { schema: "v1" } };
    return { horses: d.horses || [], meta: d._meta || {} };
  }

  async function ensureRaces(h) {
    if (Array.isArray(h.races) && h.races.length) return;
    if (!h.races_file) { h.races = h.races || []; return; }
    try {
      const r = await fetch("../" + h.races_file);
      if (r.ok) { const d = await r.json(); h.races = (d && d.races) || []; }
      else h.races = h.races || [];
    } catch (e) { h.races = h.races || []; }
  }

  async function ensurePedigree(h) {
    if (h.pedigree && (h.pedigree.父 || h.pedigree.母)) return;
    if (!h.pedigree_file) { h.pedigree = h.pedigree || {}; return; }
    try {
      const r = await fetch("../" + h.pedigree_file);
      if (r.ok) {
        const d = await r.json();
        h.pedigree = (d && d.pedigree) || {};
        if (d && d.fno) h.fno = d.fno;
        if (d && d.cross) h.cross = d.cross;
      } else h.pedigree = h.pedigree || {};
    } catch (e) { h.pedigree = h.pedigree || {}; }
  }

  return { loadCrops, ensureRaces, ensurePedigree };
})();
