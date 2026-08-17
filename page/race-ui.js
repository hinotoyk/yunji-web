/* 云迹 · 比赛展示组件（index.html / detail.html 共用）
 * 数据契约C：h.races[]（逐场履历）+ h.stats（汇总）
 * API: RaceUI.statsHTML(h)  → KPI 卡 HTML（放 hero 区）
 *      RaceUI.section(h,n)  → {html, bind} 比赛成绩区块（过滤 + 排序履历表）
 */
window.RaceUI = (function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const G = { GI: "g1", GII: "g2", GIII: "g3", L: "gL" };
  const V = { 中央: "v0", 地方: "v1", 海外: "v2" };
  const COLS = [
    ["日付", "日付"], ["場名", "場名"], ["R", "R"], ["競走名", "競走名"], ["条件", "条件"],
    ["距離", "距離"], ["馬場", "馬場"], ["状態", "状態"], ["頭数", "頭数"], ["人気", "人気"],
    ["単勝", "単勝"], ["着順", "結果"], ["タイム", "タイム"], ["着差", "着差"], ["斤量", "斤量"],
    ["騎手", "騎手"], ["馬体重", "馬体重"], ["賞金", "賞金"], ["調教師", "管理調教師"],
  ];
  const SORTABLE = new Set(["日付", "距離", "結果", "賞金"]);

  // 注入组件样式（与站点配色一致，页面无需重复定义）
  const style = document.createElement("style");
  style.textContent = `
.rkpis{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-top:14px}
.rkpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;text-align:center}
.rkpi .v{font-size:19px;font-weight:800;font-family:'Noto Serif SC',serif}
.rkpi .v.good{color:var(--green)}
.rkpi .k{font-size:10px;color:var(--muted-2);margin-top:2px;letter-spacing:1px}
.rk-empty{display:block;padding:10px 14px;color:var(--muted-2);font-size:12.5px;background:var(--card-soft);border:1px dashed var(--line-2);border-radius:10px}
.rgraded{margin-top:12px;font-size:12px;color:#4d483e;line-height:1.9}
.rgraded b{color:var(--amber);font-weight:600}
.rgraded em{font-style:normal;color:var(--muted)}
.rbar{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap}
.rbar select{font:inherit;font-size:12px;color:var(--muted);border:1px solid var(--line-2);border-radius:8px;padding:5px 8px;background:var(--card);outline:none;cursor:pointer}
.rbar select:focus{border-color:var(--green)}
.rhint{font-size:11px;color:var(--muted-2);margin-left:auto}
.rhint b{color:var(--green)}
.rscroll{overflow-x:auto;margin-top:10px;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.rtbl{width:100%;border-collapse:collapse;font-size:12px;min-width:1180px}
.rtbl th{background:#faf8f2;color:var(--muted);font-weight:600;font-size:10.5px;letter-spacing:1px;padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap;position:sticky;top:0}
.rtbl th.sortable{cursor:pointer;user-select:none}
.rtbl th.sortable:hover{color:var(--green)}
.rtbl td{padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.rtbl tr:hover td{background:#fbf9f4}
.rtbl .mono{font-family:Consolas,Menlo,monospace;font-size:11px}
.rtbl .pos1{color:var(--green);font-weight:800}
.rtbl .pos2{color:#1a6fb5;font-weight:700}
.rtbl .pos3{color:var(--amber);font-weight:700}
.rtbl .dnf{color:#b0563f;font-weight:600}
.rtag{display:inline-block;border-radius:4px;padding:0 5px;font-size:10px;margin-left:5px;vertical-align:1px}
.rtag.g1{background:#fbe7e7;color:#b02a2a}
.rtag.g2{background:#fdf0d3;color:#a06a10}
.rtag.g3{background:#e3f0fb;color:#1a6fb5}
.rtag.gL{background:#ece7f8;color:#6d28d9}
.rtag.v0{background:#e7f4ee;color:#2f7d63}
.rtag.v1{background:#fdf0e2;color:#b4691a}
.rtag.v2{background:#f1e8fb;color:#7c3aed}
.race-empty{padding:24px 14px;text-align:center;color:var(--muted-2);font-size:12.5px}
`;
  document.head.appendChild(style);

  /* ── KPI 汇总卡 ── */
  function statsHTML(h) {
    const s = h.stats || {};
    const n = (h.races || []).length;
    if (!n) return `<div class="rkpis rk-empty">尚未出赛 · 台账无记录</div>`;
    const pct = v => (v === "" || v == null) ? "—" : (parseFloat(v) * 100).toFixed(1) + "%";
    const card = (v, k, c) => `<div class="rkpi"><div class="v${c ? " " + c : ""}">${esc(v)}</div><div class="k">${k}</div></div>`;
    return `<div class="rkpis">
      ${card(s.出賽数 ?? "—", "出赛")}
      ${card(s.勝 ?? "—", "胜", s.勝 > 0 ? "good" : "")}
      ${card((s["2着"] || 0) + " / " + (s["3着"] || 0), "2着 / 3着")}
      ${card(pct(s.勝率), "胜率")}
      ${card(pct(s.連対率), "连对率")}
      ${card(s.賞金合計 ? (s.賞金合計 / 10000).toFixed(0) + "万" : "—", "赏金合计(万)")}
      ${card(s.重賞出走 ?? "—", "重赏出场")}
      ${card(s.重賞勝ち ?? "—", "重赏胜", s.重賞勝ち > 0 ? "good" : "")}
    </div>`;
  }

  /* ── 逐场履历 ── */
  const DEFAULTS = { venue: "all", cls: "all", res: "all", sort: "日付", dir: -1 };

  function rowsFor(h, st) {
    let rs = h.races.slice();
    if (st.venue !== "all") rs = rs.filter(r => r.venue_type === st.venue);
    if (st.cls !== "all") rs = rs.filter(r => r.race_class === st.cls);
    if (st.res === "win") rs = rs.filter(r => r.結果 === 1);
    else if (st.res === "top3") rs = rs.filter(r => r.結果 === 1 || r.結果 === 2 || r.結果 === 3);
    else if (st.res === "dnf") rs = rs.filter(r => typeof r.結果 === "string");
    const col = st.sort;
    rs.sort((a, b) => {
      if (col === "日付") return st.dir * (a.日付 < b.日付 ? -1 : a.日付 > b.日付 ? 1 : 0);
      const na = parseInt(a[col]) || 0, nb = parseInt(b[col]) || 0;
      return st.dir * (na - nb);
    });
    return rs;
  }

  function rowHTML(r) {
    const cls = r.結果 === 1 ? "pos1" : r.結果 === 2 ? "pos2" : r.結果 === 3 ? "pos3" : (typeof r.結果 === "string" ? "dnf" : "");
    const grade = r.格 && G[r.格] ? `<span class="rtag ${G[r.格]}">${r.格}</span>` : "";
    const vtag = V[r.venue_type] ? `<span class="rtag ${V[r.venue_type]}">${r.venue_type}</span>` : "";
    return `<tr>
      <td class="mono">${esc(r.日付)}</td>
      <td>${esc(r.場名)}${vtag}</td>
      <td class="mono">${esc(r.R ?? "")}</td>
      <td>${esc(r.競走名)}${grade}</td>
      <td>${esc(r.条件 || "")}</td>
      <td class="mono">${esc(r.距離 ?? "")}</td>
      <td>${esc(r.馬場 || "")}</td>
      <td>${esc(r.状態 || "")}</td>
      <td>${r.頭数 ?? ""}</td>
      <td>${r.人気 ?? ""}</td>
      <td class="mono">${r.単勝 ?? ""}</td>
      <td class="${cls}">${esc(r.結果)}</td>
      <td class="mono">${esc(r.タイム || "")}</td>
      <td class="mono">${esc(r.着差 || "")}</td>
      <td class="mono">${r.斤量 ?? ""}</td>
      <td>${esc(r.騎手 || "")}</td>
      <td>${r.馬体重 ?? ""}</td>
      <td class="mono">${r.賞金 ? r.賞金.toLocaleString() : ""}</td>
      <td>${esc(r.管理調教師 || "")}</td>
    </tr>`;
  }

  function section(h, n) {
    const s = h.stats || {};
    const races = h.races || [];
    if (!races.length) {
      return {
        html: `<section class="sec" id="race-sec"><div class="sec-head"><span class="n">${n}</span><h2>比赛成绩 · 逐场履历</h2><span class="hint">权威源：Google Sheets 台账</span></div><div class="race-empty">尚未出赛 / 台账无记录</div></section>`,
        bind() {},
      };
    }
    const graded = (s.重賞 || []).length
      ? `<div class="rgraded">重赏 / Listed 出场：${s.重賞.map(g => `${esc(g.競走名)} <em>${esc(g.格)} ${g.結果}着 · ${esc(g.日付)}</em>`).join("　")}</div>` : "";
    const head = `<tr>${COLS.map(([label, col]) =>
      `<th data-col="${col}" class="${SORTABLE.has(col) ? "sortable" : ""}">${label}${SORTABLE.has(col) ? " ⇅" : ""}</th>`).join("")}</tr>`;
    const html = `<section class="sec" id="race-sec">
      <div class="sec-head"><span class="n">${n}</span><h2>比赛成绩 · 逐场履历</h2><span class="hint">权威源：台账 · 共 <b>${races.length}</b> 场</span></div>
      ${graded}
      <div class="rbar">
        <select data-rf="venue"><option value="all">全部场地</option><option value="中央">中央</option><option value="地方">地方</option><option value="海外">海外</option></select>
        <select data-rf="cls"><option value="all">全部类别</option><option value="重賞">重赏</option><option value="リステッド">L / Listed</option><option value="オープン">OP 特别</option><option value="条件・未勝利">条件 / 未胜利</option></select>
        <select data-rf="res"><option value="all">全部着顺</option><option value="win">胜</option><option value="top3">前三</option><option value="dnf">未完走</option></select>
        <span class="rhint">显示 <b>${races.length}</b> 场 · 点击表头排序</span>
      </div>
      <div class="rscroll"><table class="rtbl"><thead>${head}</thead><tbody></tbody></table></div>
    </section>`;
    function bind(root) {
      const tbody = root.querySelector("tbody");
      const st = Object.assign({}, DEFAULTS);
      const draw = () => {
        const rs = rowsFor(h, st);
        tbody.innerHTML = rs.map(rowHTML).join("") ||
          `<tr><td colspan="${COLS.length}" class="race-empty">无符合条件的记录</td></tr>`;
        root.querySelector(".rhint b").textContent = rs.length;
      };
      root.querySelectorAll("select[data-rf]").forEach(sel =>
        sel.addEventListener("change", () => { st[sel.dataset.rf] = sel.value; draw(); }));
      root.querySelectorAll("th.sortable").forEach(th =>
        th.addEventListener("click", () => {
          const c = th.dataset.col;
          if (st.sort === c) st.dir *= -1; else { st.sort = c; st.dir = -1; }
          draw();
        }));
      draw();
    }
    return { html, bind };
  }

  return { statsHTML, section };
})();
