/* ============================================================
 * yj-cache.js —— 全站数据产物统一缓存控制器（YJ.cache，单一出处）
 * ------------------------------------------------------------
 * 为什么存在（2026-09-28 与用户定稿）：数据此前零缓存或仅 sessionStorage 1h（路 D 只罩
 *   basic.json），每次访问全量重拉。本控制器统一管全部 data 产物：每产品注册 TTL，
 *   命中/校验/回退逻辑一处实现——
 *   ① 新鲜期（<10min）：0 请求；② 软过期（10min~TTL）：先用缓存秒开，后台 SWR 条件校验
 *      （If-None-Match / If-Modified-Since → 304 ≈ 300B 续期；200 = 有新数据 → 更新缓存 +
 *      opts.onUpdate 回调，页面可选热更新）；③ 硬过期（>TTL）/首访：同步取全量，
 *      失败回退旧缓存（断网可开）；④ caches 不可用（老浏览器/隐私极端）→ 降级为
 *      内存 + 直连 fetch（行为同旧版，功能不缺）。
 * 缓存载体：Cache API（同源跨标签页/iframe 持久共享）；键 = 产物绝对 URL；
 *   条目 = { t:写入时间, etag, lm, data:解析后 JSON }。
 * 失效：TTL 到期自取；编辑台保存 → YJ.selector.clearBasicCache() → 本控制器 clear('basic')；
 *   排障可控制台 YJ.cache.clear()（全部）/ clear('stats')（单个）。
 * 版本：桶名 = <site>.data-v3（§105 站点前缀，惰性求值）—— 字段口径/格式升级时 +1，旧条目整体自然作废。
 * 兼容性：Cache API 桌面+移动全覆盖（Safari 11.3+ / Chrome 40+ / Firefox 44+）；
 *   纯 JSON，无 DecompressionStream 等新依赖；不支持的环境自动降级直连。
 * 用法（非 module；须在 data-config.js 之后引入）：
 *   YJ.cache.fetch('stats')                  → Promise<解析后 JSON>
 *   YJ.cache.fetch('pedigree', { arg: id })  → 注册表 url(id) 求址；{ url } 可覆写求址
 *   YJ.cache.fetch('bundle', { onUpdate:fn })→ SWR 校验到新数据时回调（页面可选热重渲染）
 *   YJ.cache.clear(name?)                    → 清指定/全部
 * ============================================================ */
window.YJ = window.YJ || {};
YJ.cache = (function () {
  "use strict";

  /* 桶名 = <site>.data-v3（§105 站点命名空间）：本模块在 races/datechart 页先于 site-config/yj-util
   * 加载，禁止加载期求值 —— openBucket 运行期才取站点 id（彼时 yj-util 必已就绪）。旧「yj-data-v3」
   * 桶不再读写，首次开桶时由 cleanLegacyBucket 删掉（只占配额、不会再被命中）。v3（2026-10-21）：races-bundle 格式 v2（马级 +末脚，23→24）——旧缓存条目解码
   * 会错位，桶 +1 作废。v2（2026-09-30）：照片本地化删除了被 basic/timeline/races 旧数据引用的
   * data/photos/142-1|2.jpg，旧缓存条目会让老访客 404 一张图——桶 +1 整体作废（教训：**删被引用的数据
   * 文件必须同轮 bump 桶版本**，或保留旧文件一个 TTL 周期再删）。v1（2026-09-28）：控制器首版。 */
  function bucket() { return YJ.util.storeKey("data-v3"); }
  var REVAL = 10 * 60 * 1000;            /* 新鲜期：窗口内 0 请求 */
  var TTL_DEF = 12 * 60 * 60 * 1000;     /* 默认 12h（用户 2026-09-28 定）；注册表可按产品覆写 */

  /* 产物注册表：name → { ttl, url(arg) }；arg 型产品（pedigree）按 id 求址 */
  var REG = {
    basic:     { ttl: TTL_DEF, url: function () { return YJ_DATA.url("basic.json"); } },
    bundle:    { ttl: TTL_DEF, url: function () { return YJ_DATA.url("races-bundle.json"); } },
    pedigree:  { ttl: TTL_DEF, prefix: function () { return YJ_DATA.url("pedigree/"); },
                 url: function (id) { return YJ_DATA.url("pedigree/" + id + ".json"); } },
    stats:     { ttl: TTL_DEF, url: function () { return YJ_DATA.url("stats.json"); } },
    datechart: { ttl: TTL_DEF, url: function () { return YJ_DATA.url("datechart.json"); } },
    timeline:  { ttl: TTL_DEF, url: function () { return YJ_DATA.url("timeline.json"); } },
    /* 跨站引用（2026-10-27）：jbis-sire-rank-history 派生产物。arg = "<board>/<jbisId>"
     * （如 "t4-gen-central@2023/0001237042"），URL 单一出处 = data-config.js YJ_DATA.remote.jbisRank；
     * 对方站每日构建发布，结构升级有 index.json/schema 可校验，失败由控制器回退旧缓存。
     * 种马榜走势（stats.html）专用。 */
    sireRank:  { ttl: TTL_DEF, url: function (arg) { return YJ_DATA.remote.jbisRank + "derived/sire-history/" + arg + ".json"; } }
  };

  var COK = typeof caches !== "undefined" && typeof caches.open === "function";
  var mem = {};          /* urlAbs → env：Cache API 不可用时的唯一载体 + 可用时的本上下文加速 */
  var inflight = {};     /* urlAbs → Promise：并发调用合并 */
  var revalidated = {};  /* urlAbs → 1：本页生命周期内 SWR 后台校验每键至多一次 */
  var epoch = 0;         /* clear() 自增：作废在途 SWR 回写——否则「清缓存 + 在途 304」会把刚清掉的
                          * 键用旧数据续期成「新鲜旧值」（审计 2.2）；在途 fetchFull 回写新鲜全量，无害 */

  /* URL 绝对化（自包含副本，不引 YJ.util.absUrl，B2/F1.4 收口）：缓存控制器独立于工具层，
   * 缓存键稳定性要求 self-contained —— 与 yj-util.absUrl 是同一实现，语义一致。 */
  function abs(url) {
    try { return new URL(String(url), document.baseURI || location.href).href; }
    catch (e) { return String(url); }   /* stub/怪环境 → 退回原串（键一致性由调用方保证） */
  }
  function hdr(r, k) {
    try { return (r.headers && r.headers.get(k)) || ""; } catch (e) { return ""; }
  }
  /* 原生 fetch 出口：⚠ 控制器自己的 fetch(name, opts) 会遮蔽全局 fetch（IIFE 内同名函数提升），
   * 网络调用必须经此包装（调用时解析 window.fetch，测试换桩也随之生效），否则 fetchFull/revalidate
   * 会把 URL 当产品名递归调回控制器。 */
  function nativeFetch(u, o) { return window.fetch(u, o); }
  /* 旧共享桶清理（§105 收尾）：切换后不再读写 "yj-data-v3"，但它会在访客/本机里永久占配额。
   * 首次开桶时惰性删一次（Cache 条目是可再生的全量数据，删掉只等于下次重取）。 */
  var legacyCleaned = false;
  function cleanLegacyBucket() {
    if (legacyCleaned || !COK) return;
    legacyCleaned = true;
    try { caches.delete("yj-data-v3").catch(function () { /* 不存在/被禁 → 忽略 */ }); } catch (e) { /* ignore */ }
  }
  function openBucket() {
    if (!COK) return Promise.reject(new Error("no-caches"));
    cleanLegacyBucket();
    return caches.open(bucket());
  }

  function readEnv(urlAbs) {
    if (mem[urlAbs]) return Promise.resolve(mem[urlAbs]);
    if (!COK) return Promise.resolve(null);
    return openBucket().then(function (c) { return c.match(new Request(urlAbs)); })
      .then(function (r) { return r ? r.json() : null; })
      .then(function (env) { if (env) mem[urlAbs] = env; return env || null; })
      .catch(function () { return null; });   /* 读失败等同未命中 */
  }
  function writeEnv(env, urlAbs) {
    mem[urlAbs] = env;
    if (!COK) return;
    openBucket().then(function (c) {
      return c.put(new Request(urlAbs), new Response(JSON.stringify(env), { headers: { "Content-Type": "application/json" } }));
    }).catch(function () { /* 配额/隐私失败 → 留在内存层 */ });
  }

  /* fetchFull 刻意不带 cache:"no-store"（审计 3.3）：首访/硬过期允许浏览器 HTTP 缓存直接命中
   * 全量（ETag/Last-Modified 照常入 env）；Cache API 才是控制器唯一事实源，条件校验（revalidate）
   * 才强制 no-store 回源。日后勿"顺手补"no-store——那等于关掉一层合法缓存。 */
  function fetchFull(urlAbs, noStore) {
    /* noStore = 显式失效（bust）后的回源：GitHub Pages max-age=600，普通 fetch 可能命中
     * HTTP 缓存拿到旧产物——用户刚提交完要"立刻拉最新"，这层必须跳过（audit 3.3 的
     * 「刻意不带 no-store」只针对日常全量，不约束显式失效）。 */
    return nativeFetch(urlAbs, noStore ? { cache: "no-store" } : undefined).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json().then(function (data) {
        return { t: Date.now(), etag: hdr(r, "ETag"), lm: hdr(r, "Last-Modified"), data: data };
      });
    });
  }
  /* SWR 后台条件校验：304 只回 ~300B 头（续期）；200 = 有新数据（更新缓存 + onUpdate 回调）；
   * 网络失败静默保持旧缓存。本页生命周期内每键至多校验一次（revalidated 表）。 */
  function revalidate(urlAbs, env, onUpdate) {
    if (revalidated[urlAbs]) return;
    revalidated[urlAbs] = 1;
    var ep = epoch;                                        /* 捕获时点：clear() 后本轮回写作废 */
    var headers = {};
    if (env.etag) headers["If-None-Match"] = env.etag;
    if (env.lm) headers["If-Modified-Since"] = env.lm;
    nativeFetch(urlAbs, { headers: headers, cache: "no-store" }).then(function (r) {
      if (r.status === 304) {
        if (ep !== epoch) return;                          /* 已 clear → 弃写（旧数据不得续期回写） */
        env.t = Date.now(); writeEnv(env, urlAbs); return; /* 未变 → 只续期 */
      }
      if (!r.ok) return;                                                             /* 校验失败 → 缓存照旧 */
      return r.json().then(function (data) {
        if (ep !== epoch) return;                          /* 已 clear → 弃写 */
        var env2 = { t: Date.now(), etag: hdr(r, "ETag"), lm: hdr(r, "Last-Modified"), data: data };
        writeEnv(env2, urlAbs);
        if (onUpdate) { try { onUpdate(data); } catch (e) { /* 页面回调异常不影响缓存 */ } }
      });
    }).catch(function () { /* 断网等 → 保持旧缓存 */ });
  }

  function fetch(name, opts) {
    opts = opts || {};
    var reg = REG[name];
    if (!reg) return Promise.reject(new Error("yj-cache: 未注册产物 " + name));
    var urlAbs;
    try { urlAbs = abs(opts.url || reg.url(opts.arg)); }        /* 求址失败（YJ_DATA 缺席等）→ 归一为拒绝， */
    catch (e) { return Promise.reject(e); }                     /* 不让调用方吃到同步 throw（.catch 接不住） */
    if (inflight[urlAbs]) return inflight[urlAbs];   /* 去重含 cb：首个调用的 opts.onUpdate 生效，后续调用者不再注册 */
    var bt = bustTs();                               /* 显式失效时刻（编辑台提交成功后设置） */
    var noStore = bt && Date.now() - bt < NOSTORE_WIN;   /* 失效后 15min 内回源一律跳过 HTTP 缓存 */
    var p = readEnv(urlAbs).then(function (env) {
      var age = env ? Date.now() - env.t : Infinity;
      if (env && env.t <= bt) {                      /* 条目写在 bust 之前 → 视同硬过期，立即回源最新 */
        return fetchFull(urlAbs, noStore).then(function (env2) {
          writeEnv(env2, urlAbs);
          return env2.data;
        }).catch(function (e) {
          if (env) return env.data;
          throw e;
        });
      }
      if (env && age < REVAL) return env.data;                       /* ① 新鲜期：0 请求 */
      if (env && age < reg.ttl) {                                    /* ② 软过期：秒开 + 后台 SWR */
        revalidate(urlAbs, env, opts.onUpdate);
        return env.data;
      }
      return fetchFull(urlAbs, noStore).then(function (env2) {                /* ③ 硬过期/首访：同步全量 */
        writeEnv(env2, urlAbs);
        return env2.data;
      }).catch(function (e) {                                        /* ④ 取新失败 → 回退旧缓存 */
        if (env) return env.data;
        throw e;
      });
    });
    inflight[urlAbs] = p;
    var done = function () { delete inflight[urlAbs]; };
    p.then(done, done);
    return p;
  }

  /* 失效：name 省略 = 全清；arg 型产品（pedigree）按 URL 前缀匹配 */
  function matchName(name, u) {
    var reg = REG[name];
    if (!reg) return false;
    if (reg.prefix) return u.indexOf(abs(reg.prefix)) === 0;
    return u === abs(reg.url());
  }
  function clear(name) {
    epoch++;   /* 在途 SWR 回写作废（见 epoch 注释，审计 2.2） */
    Object.keys(mem).forEach(function (u) {
      if (!name || matchName(name, u)) {
        delete mem[u];
        delete revalidated[u];   /* 同步删节流标记：清除后允许新一轮 SWR 校验 */
      }
    });
    if (!COK) return Promise.resolve();
    return openBucket().then(function (c) { return c.keys(); }).then(function (reqs) {
      return Promise.all(reqs.map(function (rq) {
        if (name && !matchName(name, rq.url)) return null;
        delete revalidated[rq.url];
        return c.delete(rq).catch(function () {});
      }));
    }).catch(function () {});
  }

  /* ---- 显式失效（2026-10-26）：编辑台提交成功后调用 → 全站立即弃用旧数据 ----
   * 机制 = localStorage 盖时间戳（跨标签页/iframe 立即可见）+ 本上下文 clear()。
   * fetch 读到「条目写入时间 ≤ 戳」视同硬过期立即回源；戳后 NOSTORE_WIN 内回源再跳过
   * HTTP 缓存（GitHub Pages max-age=600，不跳会拿到发布前旧产物）。selector.js 的
   * sessionStorage 路 D 同读此戳（bustTs 导出），保同一标签页内 iframe 也不吃旧马表。 */
  function bustKey() {
    try { return YJ.util.storeKey("data-bust-ts"); }
    catch (e) { return "yj.data-bust-ts"; }   /* yj-util 缺席的怪环境：退共享键，失效仍生效 */
  }
  function bustTs() {
    try { return Number(localStorage.getItem(bustKey())) || 0; } catch (e) { return 0; }
  }
  var NOSTORE_WIN = 15 * 60 * 1000;
  function bust() {
    try { localStorage.setItem(bustKey(), String(Date.now())); } catch (e) { /* 隐私模式 → 只清本上下文 */ }
    return clear();
  }

  return { fetch: fetch, clear: clear, bust: bust, bustTs: bustTs, REVAL_MS: REVAL };
})();
