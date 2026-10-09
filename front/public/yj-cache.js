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
 * 版本：桶名 yj-data-v1 —— 字段口径/格式升级时 +1，旧条目整体自然作废。
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

  /* v2（2026-09-30）：照片本地化删除了被 basic/timeline/races 旧数据引用的 data/photos/142-1|2.jpg，
   * 旧缓存条目会让老访客 404 一张图——桶 +1 整体作废（教训：**删被引用的数据文件必须同轮 bump 桶版本**，
   * 或保留旧文件一个 TTL 周期再删）。v1（2026-09-28）：控制器首版。 */
  var BUCKET = "yj-data-v2";
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
    timeline:  { ttl: TTL_DEF, url: function () { return YJ_DATA.url("timeline.json"); } }
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
  function openBucket() { return COK ? caches.open(BUCKET) : Promise.reject(new Error("no-caches")); }

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
  function fetchFull(urlAbs) {
    return nativeFetch(urlAbs).then(function (r) {
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
    var p = readEnv(urlAbs).then(function (env) {
      var age = env ? Date.now() - env.t : Infinity;
      if (env && age < REVAL) return env.data;                       /* ① 新鲜期：0 请求 */
      if (env && age < reg.ttl) {                                    /* ② 软过期：秒开 + 后台 SWR */
        revalidate(urlAbs, env, opts.onUpdate);
        return env.data;
      }
      return fetchFull(urlAbs).then(function (env2) {                /* ③ 硬过期/首访：同步全量 */
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

  return { fetch: fetch, clear: clear, REVAL_MS: REVAL };
})();
