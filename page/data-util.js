/* 云迹 · 前端数据工具（M5.4 迁移）
 * crops.json v2 = {_meta, index, horses}；历史快照 = v1 裸数组（含 races/pedigree 内嵌）。
 * 统一入口：loadCrops() 返回 {horses, meta, index}（兼容 v1/v2）
 * 按需加载：ensureRaces(h) / ensurePedigree(h) —— 详情页才拉拆分文件，列表/大盘不拉
 * admin 覆盖后重建 index：rebuildIndex(horses) —— 与 racelib.build_index 语义对齐
 */
window.YJ = (function () {
  "use strict";

  async function loadCrops(url) {
    const r = await fetch(url || "../data/crops.json");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (Array.isArray(d)) return { horses: d, meta: { schema: "crops/v1" }, index: null };
    return { horses: d.horses || [], meta: d._meta || {}, index: d.index || null };
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

  /* admin 改人工字段后重建 _meta.index 倒排表（与 racelib.build_index 语义一致）
   * 枚举标量：性別/生年/登録状態/調教師/馬主/生産牧場/fno
   * 集合：騎手/場名/格/血统祖先/主要場地 + 布尔（has_races/has_win/has_graded_win/有地方/有海外）
   * 每匹马从 facet 读取；无 facet（新建马）自动用档案字段补全。
   */
  function rebuildIndex(horses) {
    const nf = s => String(s ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    const scalar = ["性別", "生年", "登録状態", "調教師", "馬主", "生産牧場", "fno"];
    const list = ["騎手", "場名", "格", "血统祖先", "主要場地"];
    const flags = { has_races: "has_races", has_win: "has_win", has_graded_win: "has_graded_win", 有地方: "有地方", 有海外: "有海外" };
    const idx = {};
    const put = (field, val, id) => {
      const v = nf(val);
      if (!v) return;
      (idx[field] = idx[field] || {});
      const d = idx[field];
      (d[v] = d[v] || []).push(id);
    };
    horses.forEach(h => {
      const f = h.facet || {};
      const id = h.id;
      scalar.forEach(field => put(field, f[field] ?? h[field], id));
      list.forEach(field => {
        const vals = f[field] && Array.isArray(f[field]) ? f[field] : (h[field] && Array.isArray(h[field]) ? h[field] : []);
        vals.forEach(v => put(field, v, id));
      });
      Object.keys(flags).forEach(k => {
        const flag = f[k] != null ? f[k] : h[k];
        if (flag) put(flags[k], "true", id);
      });
    });
    return idx;
  }

  return { loadCrops, ensureRaces, ensurePedigree, rebuildIndex };
})();
