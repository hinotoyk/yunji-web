/* ============================================================
 * race-bundle.js —— races/*.json 极致压缩包「打包 ↔ 解包」单一出处
 * ------------------------------------------------------------
 * 为什么存在（2026-09-28 立项，路 B / D11 替换式；决策与处置记录 = front/UI优化记录.md §72）：
 *   RACES 全库查询此前逐马拉 276 个 data/races/{id}.json（276 请求——basic.json 全量引用，
 *   其中 128 个是未出道马的空文件；gzip 合计 ~180KB）。
 *   构建期把全库打成一个 dist/data/races-bundle.json（gzip 后 ~44KB、1 个请求），**替换式**上线
 *   （dist 不再拷逐马小文件，D11）；打包与解包共用本模块的字段表，杜绝两份实现漂移。
 *
 * 格式 v1（字段契约详情 = data/SCHEMA.md §8；产物只落 dist/data/，data/ 仓库不落）：
 *   { v:1, dict:[…字符串字典], xk:[…模板外未知键], races:[[…场次行]], by:{ "<马id>": [[row]] } }
 *   - races 场次表 = RK 17 个比赛级字段按序（同场多驹只存一行；字符串字段存 dict 序号，数值原样）；
 *     race_id 为 null = 台账海外无 race_id（按 马+日付 虚拟场次归组），解码时省略该键
 *   - by 马行 = [场次下标, EK 23 个马级字段按序]；RK∪EK 之外的未知键（如 Rt）以 [xk序号, 值, …] 对追加行尾
 *   - null = 源记录无此键（解码省略键，与源对象同构，下游 falsy 判断不受影响）
 *   - 输出**确定性**（马 id 升序 + 字典按首见序 + 无时间戳）：数据不变 → 字节不变 → 部署 ETag 稳定 → 前端 SWR 304
 *
 * 用法（非 module，页面 <script src="../race-bundle.js"></script> 引入；须在 data-config.js 之后）：
 *   YJ.raceBundle.decode(bundleObj)  → { "<马id>": [逐场记录对象…] }  与逐马 JSON 完全同构
 *   YJ.raceBundle.pack(byObj)        → bundleObj（构建端 front/scripts/build-races-bundle.mjs 与测试端用）
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.raceBundle = (function () {
  "use strict";

  /* 场次级字段（17）：同一场比赛所有马共享，全库 753 条 / 583 场 → 同场多驹在此去重 */
  var RK = ["日付", "発走", "開催", "場名", "R", "コース", "レース名", "格", "条件", "距離", "芝ダ", "馬場", "天候", "頭数", "race_id", "venue_type", "來源"];
  /* 马级字段（23）：逐马逐场独有（枠番/人気/着顺/タイム/騎手…），顺序即行内字段序 */
  var EK = ["出走馬名", "性", "年齢", "斤量", "枠番", "馬番", "人気", "単勝", "結果", "タイム", "上り", "着差", "通過", "ペース", "馬体重", "増減", "賞金", "本賞金", "騎手", "調教師", "jockey_id", "trainer_id", "photo"];
  /* 进全局字典的字段：字符串型且高重复（数值/唯一值如 距離/頭数/race_id 原样存，进字典反而变大） */
  var DICT = {};
  ["日付", "発走", "開催", "場名", "コース", "レース名", "格", "条件", "芝ダ", "馬場", "天候", "venue_type", "來源", "出走馬名", "性", "タイム", "上り", "着差", "通過", "ペース", "増減", "騎手", "調教師"].forEach(function (k) { DICT[k] = 1; });

  function dictIdx(dict, map, s) {
    var i = map[s];
    if (i === undefined) { i = dict.length; map[s] = i; dict.push(s); }
    return i;
  }
  /* 编码单值：null/缺失 → null（解码省略键）；字典字段 → 序号；其余原样（类型保持） */
  function encVal(dict, map, k, v) {
    if (v === undefined || v === null) return null;
    if (DICT[k]) return dictIdx(dict, map, String(v));
    return v;
  }
  /* RK∪EK 之外的未知键（如 Rt，模板外键 SCHEMA 约定追加在末尾）：[xk序号, 值] 对追加行尾，无损保留 */
  function appendExtra(row, rc, xk, xmap) {
    for (var k in rc) {
      if (DICT[k] || EK.indexOf(k) >= 0 || RK.indexOf(k) >= 0) continue;
      var xi = xmap[k];
      if (xi === undefined) { xi = xk.length; xmap[k] = xi; xk.push(k); }
      row.push(xi, rc[k] === undefined ? null : rc[k]);
    }
  }

  /* 打包：by = { "<马id>": [逐场记录对象…] }（与 data/races/{id}.json 数组同构）→ bundle 对象。
   * 马 id 数值升序遍历 → 字典按首见序 → 确定性输出。同场字段以首见为准（构建端 round-trip
   * 断言保证「同场分歧」会直接 build 失败，见 SCHEMA §8）。 */
  function pack(by) {
    var dict = [], dmap = {};
    var xk = [], xmap = {};
    var races = [], ridx = {};   /* 场次组键 → 行下标；race_id 缺失（台账海外）按 马+日付 虚拟归组 */
    var out = { v: 1, dict: dict, xk: xk, races: races, by: {} };
    var ids = Object.keys(by).sort(function (a, b) { return (+a) - (+b) || (a < b ? -1 : 1); });
    ids.forEach(function (hid) { out.by[hid] = []; });   /* 空马（races 文件为 []，128 匹未出道）也保留键：解码后与源同键集 */
    for (var pass = 0; pass < 2; pass++) {
      for (var ii = 0; ii < ids.length; ii++) {
        var hid = ids[ii], arr = by[hid] || [];
        for (var e = 0; e < arr.length; e++) {
          var rc = arr[e];
          /* 场次组键：race_id 缺失（undefined/null，台账海外）按 马+日付 虚拟归组；
           * ⚠ 空串 "" 是「存在但为空」的真实值（8 条台账），也要走虚拟归组（否则跨马组键相撞），
           *   但行内必须原样存 ""（encVal 编码），解码后与源逐键相等 */
          var gid = rc.race_id ? String(rc.race_id) : "\u0001" + hid + "\u0001" + String(rc.日付 || "");
          if (pass === 0) {
            if (ridx[gid] !== undefined) continue;
            ridx[gid] = races.length;
            var row = RK.map(function (k) {
              if (k === "race_id" && (rc.race_id === undefined || rc.race_id === null)) return null;
              return encVal(dict, dmap, k, rc[k]);
            });
            appendExtra(row, rc, xk, xmap);
            races.push(row);
          } else {
            var erow = [ridx[gid]];
            for (var ei = 0; ei < EK.length; ei++) erow.push(encVal(dict, dmap, EK[ei], rc[EK[ei]]));
            appendExtra(erow, rc, xk, xmap);
            (out.by[hid] || (out.by[hid] = [])).push(erow);
          }
        }
      }
    }
    return out;
  }

  /* 解包：bundle 对象 → { "<马id>": [逐场记录对象…] }。键集与源逐马对象同构：
   * 未知键原样还原；null/缺失一律省略键（与源「无此键」等价）。 */
  function decode(b) {
    var dict = b.dict || [], xk = b.xk || [];
    var rows = b.races || [], by = b.by || {};
    var raceObjs = rows.map(function (row) {
      var o = {};
      for (var i = 0; i < RK.length; i++) {
        var v = row[i];
        if (v === null || v === undefined) continue;
        o[RK[i]] = (DICT[RK[i]] && typeof v === "number") ? dict[v] : v;
      }
      for (var j = RK.length; j < row.length; j += 2) {
        var k = xk[row[j]], v2 = row[j + 1];
        if (v2 !== null && v2 !== undefined) o[k] = v2;
      }
      return o;
    });
    var out = {};
    Object.keys(by).forEach(function (hid) {
      out[hid] = by[hid].map(function (row) {
        var e = {}, src = raceObjs[row[0]] || {}, k;
        for (k in src) e[k] = src[k];                 /* 场次级字段展开进每条记录（与源扁平结构同构） */
        for (var i = 0; i < EK.length; i++) {
          var v = row[i + 1];
          if (v === null || v === undefined) continue;
          e[EK[i]] = (DICT[EK[i]] && typeof v === "number") ? dict[v] : v;
        }
        for (var j = 1 + EK.length; j < row.length; j += 2) {
          var k2 = xk[row[j]], v2 = row[j + 1];
          if (v2 !== null && v2 !== undefined) e[k2] = v2;
        }
        return e;
      });
    });
    return out;
  }

  return { pack: pack, decode: decode, RK: RK, EK: EK };
})();
