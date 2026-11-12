# 云迹 · 设计文档（DESIGN）

> 本文件是项目**唯一的架构与约定文档**：项目定位 / 当前状态 / 前端架构 / 编码约定 / 数据管线 / 数据契约 / 编辑台 / Git 协作 / 遗留 / 决策时间线 / UI 规格索引。
> 其余文档的分工：`README.md` = 怎么跑、怎么换站、维护排障；`AGENTS.md` = 硬规则清单（禁止事项与判据）；`docs/SCHEMA.md` = 数据产物字段契约；`docs/README.md` = 文档索引。
>
> **历史归档**：本文件合并自原 `docs/HANDOFF.md`（架构与决策）、`docs/UI优化记录.md`（UI 规格与编码约定）、`docs/开源化改造清单.md`（开源化改造记录）三份文档（2026-11-12）。UI 条目正文已归档：`git show 7e48d69:docs/UI优化记录.md`；本文只保留**按页面的 § 索引**与**仍然生效的约定**。

---

## 0. 项目一句话

**云迹 · 云崽档案**：单一种马产驹的个人查阅/检索静态站（当前收录 **コントレイル**（铁鸟翱天 / Contrail，netkeiba `2017101835`）产驹），GitHub Pages / Cloudflare Pages 部署，`dist/` 自包含数据副本。同时是本仓「种马应援站」模板的主项目，`config/` 五个 JSON 即站点身份的全部旋钮。

## 1. 当前状态

| 维度 | 状态 |
|---|---|
| 数据规模 | `data/basic.json` 建档 **277 匹**（2023=131 + 2024=146，id 1~277）；血统 277/277；成绩 276 个 `races/{id}.json`；回放映射 `data/video-map.json` |
| 前端页面 | **9 个功能页**：profile / races / stats / leaderboard / datechart / entries / timeline / pedigree（profile 内嵌）+ 编辑台 4 页（edit / edit-table / edit-timeline / edit-drafts，PAT 解锁，mb 不开放） |
| 可挂载 | 页面能力由 `config/features.json` 控制（关闭 = 侧栏入口消失 + 直连显示「本站未启用」，页面仍构建） |
| 构建 | `front/` `npm run build` → 根 `dist/`（含 `dist/data/` 副本 + races 压缩包 + 字体子集 + `site-config.js` 注入） |
| 数据更新 | `python run_update.py <策略>`；5 条 Actions：`deploy` / `update-data`（每日 `--ci`）/ `update-day` / `status` / `video-task` |
| 部署 | push main → `deploy.yml` 构建并发布仓库根，入口 `/dist/index.html`；Cloudflare Pages（`wrangler.jsonc`，assets = `./dist`） |
| 一致性门禁 | `--check` + 6 个断言脚本（verify_result / verify_drill / verify_stats / verify_datechart / verify_sire_wins / verify_caps），全绿才算完 |

## 2. 目录结构

```
├── config/        # sire.json（种马+站点身份+跨站+文案）· features.json（页面能力表）
│                  # friend-links.json（友链）· video-sources.json（B 站源）· grade-table.json（格级单源）
├── data/          # 全部数据产物 + 4 张人工表 + photos/
├── docs/          # 人工文档（索引 docs/README.md；本文件为架构与约定的唯一出处）
├── scripts/       # Python 管线：core 中立层 / basic / races / timeline / datechart / stats / status / video
├── front/         # 前端源码：index.html 外壳 + pages/ 功能页 + public/ 共享 JS + scripts/ 构建期工具
├── dist/          # 构建产物（gitignore，CI 现场构建）
├── run_update.py  # 数据更新统一入口          run_full_test.py # 从 0 全量自测（= --init 载体）
└── AGENTS.md / README.md / LICENSE / NOTICE
```

## 3. 前端架构（已定稿，勿回退）

| 项 | 决策 |
|---|---|
| **构建** | **Vite 5 多页**（`front/` 源 → `dist/`），`base:'./'` 可部署任意子目录；**入口清单由 `front/pages/*.html` 目录派生**（删页面文件不会炸 build） |
| **样式** | **Tailwind v3 编译期**：utility 为主，共享组件类在 `pages/theme.css` 的 `@layer components` 用 `@apply`；禁止散落原生 CSS / CDN 运行时 Tailwind |
| **主题 token** | `tailwind.config.js`：primary 青绿 `#0aa7a0`、shadcn Neutral 灰阶、Noto Sans SC + Geist；不写死 hex（指定色块除外） |
| **JS 动态类** | 拼接的 Tailwind 类必须被 `content` 扫到；`.yj-g*` 这类 JS 拼类名必须放 `@layer` 之外（放里面会被按候选裁剪） |
| **共享 JS** | 放 `front/public/`，Vite 原样拷到 `dist/` 根，页面 `../xxx.js` 引用；**版本戳由构建期插件自动打内容哈希**，页面源码禁止手写 `?v=` |
| **数据路径** | 一律 `YJ_DATA.url()`（`public/data-config.js` 唯一映射点，`prefix:'..'`）；改数据目录只改该文件 |
| **数据缓存** | 一律走 `public/yj-cache.js`（`YJ.cache.fetch(name[,opts])`）：注册表按产物给 TTL（默认 12h，10min 新鲜期 0 请求 + SWR）；桶名带站点前缀（`site.id`），**删被引用的数据文件必须同轮 bump 桶版本** |
| **比赛数据** | 构建期打成 `dist/data/races-bundle.json`（替换式，1 请求替代 276 小文件）；编解码单一出处 `public/race-bundle.js` |
| **字体** | 构建期按需子集（1 个 woff2 + 1 条 @font-face），fail-soft：CI 无 python/fontTools 时沿用已提交产物 |
| **响应式** | 单断点 768px（`max-md:`）；JS 统一 `public/device.js`（matchMedia，可实时重渲染） |
| **跨页联动** | `public/bus.js`：postMessage + **sessionStorage**（按标签页隔离）共享选中马 |
| **i18n** | 日文字段/枚举 → 中文走 `public/i18n.js`（`YJ.i18n.t/e/g`），**不改后端 JSON** |
| **站点身份** | 全部来自 `config/`（编辑仓库 / 统计 / 友链 / 跨站地址 / 生年 / 文案 / 能力表），页面里不写死；空值 = 合法关闭态 |
| **编辑门禁** | 编辑页引 `yj-edit-gate.js`（PAT 门禁）、只读页引 `yj-cap.js`（能力空态）；两者都是**可见性门禁，不是安全边界** |

**数据语义色（全站一致）**：1着/胜=`primary`、2着=`chart-2`、3着=`chart-3`、未完走（中止/取消/除外/失格）=`destructive`、重赏徽章（GI/GII/GIII/L/OP）用 `primary`/`chart-*` 分级。着顺浅色三件套：JS 侧 `race-rows.js` 的 `PLACE_BG`、CSS 侧 `theme.css` 的 `.yj-nkm*`，**改色必须同步**。

## 4. 前端编码约定（§48 定稿，必须遵守）

1. **公共工具单一出处**：`public/yj-util.js`（`YJ.util.*`），页面只写薄别名，禁止复制函数体。
2. **业务语义组件单一出处**：比赛行 / 徽章 / 格式化（`gradeBadge/placeBadge/ninki*/G/GLABEL/weightOf/venueR…`）一律复用 `public/race-rows.js`，禁止本地重写映射表或徽章 HTML。
3. **数据语义色单一出处**：见 §3 末尾「着顺浅色三件套」。
4. **组件样式进 theme.css**：≥3 页共用或全站统一的样式 → `@layer components` + `@apply`；但**类名靠 JS 动态拼接、content 里没有字面量的类必须放 @layer 之外**。
5. **收录门槛**：抽离前先 grep —— **全站统一语义或 ≥3 处使用**才收口；仅 2 处且行为有分叉的不动（反例：`#page.embed`）。
6. **零影响红线**：复用收口只做等值搬移 / 纯删除；改完必跑 `npm run build` 并核对 dist（新类在、旧类无、`dist/data/basic.json` 存在）。
7. **改完必须构建验证**：每次改样式/类名后 build，再去 `dist/assets/theme-*.css` 搜类名确认真编译进去（编译期框架最大的坑：改了类没编译 → 页面无变化）。快速迭代可 `COPY_DATA=skip npm run build`。

**冒烟断言红线（做子项目 / 换数据时必看）**：`verify_*.cjs` 里的**具体值**（马名、世代名、年份数、场地、条数、「哪个档为空」）都会在另一份数据上假失败 → 一律改成从产物派生（世代全集 ← `stats.json` 的 `curve` 去重；目标样本 ← 按正则从产物现找；存在性断言 ← 改成「与源数据重算一致」）。

## 5. 数据管线

- **两条管线业务隔离、代码抽离复用**：`scripts/basic/` 与 `scripts/races/` 的业务模块互不 import；共享逻辑下沉中立层 `scripts/core`（常量单源 `constants.py`；两个 `common.py` 只做薄再导出）；风控口径 `DOMAIN_SLEEP`/`STRIP_BASES` 仍由各 `common.py` 持有并以形参注入 `net.bind()`。
- **线性单链**（无跨源来回兜底）：基础 = JBIS 建档 → 血统/nk_id/意味 并发 → netkeiba 详情 → merge；竞赛 = 详情+判变 → 成绩增量（SP 页一次回填 格/条件/調教師/本賞金）→ 台账海外 → merge。
- **缓存 + 合并**：抓取脚本只写 `data/_tmp/{basic,races}/`，merge 时统一写 `basic.json` 并删缓存 → 可并发、无覆盖。
- **风控**：按域限速（0.8~1.2 抖动）+ `data/fetch_log.jsonl` 统一日志（逐行 JSON，入库可追踪，`.gitattributes` merge=union 扛并发 rebase，按 60 天滚动裁剪）。
- **离线脚本零第三方依赖（硬规）**：`core/*` 与 `common.py` 模块顶层禁止 import 第三方包（requests/bs4 只在发请求处惰性导入）——否则 Pages deploy 的 merge 步会在没装 requests 的 runner 上炸。
- **人工值**：`manual_overrides.json`（马字段）/ `timeline_manual.json`（时间线节点）/ `races_manual.json`（比赛配图）——两管线合并收尾都套 `manual.apply_overrides`；**直接改 `basic.json` 会被次日 CI 抹掉**。
- **判变 = 变化 ∪ 缺失**：成绩抓取目标 = 通算成績变化 ∪ 无 races 文件 ∪ 数据缺失，自动补拉。
- **派生必须同轮重算**：改了 `sire.wins` → 重跑 `scripts/timeline/sync_sire_wins.py`；改了格口径 → 重跑 `stats`/`datechart` 派生，否则 verify 报漂移。

## 6. 数据契约

**字段契约与口径的单一出处 = `docs/SCHEMA.md`**（生成脚本文件头只留一行指路）。要点：

- `basic.json`：`{"_meta":{...},"horses":[…]}`，字段模板与列序 = `scripts/core/basic_io.py::BASIC_FIELDS`（31 键）。**前端只读，勿手改**。
- `races/{id}.json`：逐场数组，列序 = `scripts/races/common.py::RACE_RECORD_ORDER`；**結果三态** = 完赛（数字着顺）/ 未完赛（中止·失格，计出走）/ 未出走（取消·除外，不计出走）。
- `timeline.json` / `datechart.json` / `stats.json`：前端预计算产物，内容无变化时跳过写入（避免 `--ci` 每轮空 diff 提交）。
- ⚠ 人工表会随构建进 `dist/data/`，**公网可读**（含 `_note`）→ 备注只写业务理由。

## 7. 编辑台（草稿箱模式）

- **恒为草稿箱模式**：本地编辑服务已删除。改动存浏览器（localStorage / IndexedDB）→「提交到 GitHub」走 GitHub Data API **单原子 commit** → push main 后 CI 构建约 2 分钟生效。
- 4 个页面，侧栏「编辑」分组**仅在 PAT 验证后注入 DOM**；mb 端不开放（窄屏只显示「请在电脑端使用」）。
- 草稿判脏走 `YJ.util.effEqual`（净效果等值）；入口无 `?edit=1` 开关。
- 图片：上传/外链本地化走 `front/public/editor.js`，照片落 `data/photos/`，经人工表钉 `photo` 字段；比赛配图走 `races_manual.json`（race_id → photo，台账场用虚拟键 `@马id@日付`）。
- 安全边界：人工表公网可读；`_note`/`_orig` 等 `_` 前缀键不参与套用。

## 8. Git 协作约定

- **commit**：仅在用户明确要求时执行；**push**：永远不执行（推送只能由维护者本人操作）。
- **git 身份**：仓库级固定 GitHub noreply 邮箱；仓库内不得出现公司邮箱 / 私有 npm 源 / 任何 token；装包走项目级 `front/.npmrc` 的官方 registry。
- `dist/`、`tests/`、`test-logs/`、`data/_tmp/` 在 `.gitignore`；`data/` 是数据仓库模式（直接提交进 git）。

## 9. 已知遗留 / 注意事项

- `id 129「エスポワール」` 未命名仔无 nk_id，无法抓详情/成绩（建档缺 nk_id 1/277）。
- 台账海外场若馬名与 basic 不一致会被跳过（记入报告）；海外场不参与収得。
- 障害重赏 `(JG1)` 阿拉伯数字已归一为 JGI/JGII/JGIII；海外 `(G1)` 归一为 GI。
- 编辑台草稿若与远端完全一致会生成同内容 tree 的空 commit（无害）；防重复未做。
- `tests/` 是探索/候选版区（gitignored），`tests/_trash/` 为淘汰归档（只读）。

## 10. 关键决策时间线（最新为准）

- **视觉/外壳**：青绿 × shadcn Neutral（仅亮色，无暗黑）+ 左侧导航外壳 + iframe 内嵌 + 单断点 768px。
- **信息架构**：倾向统计 / 日期统计（原「日期图」）/ 航迹线（原「时间线」）三页独立；`XXXX年产` → `XXXX年世代`；「下钻」→「跳转」。
- **性能**（2026-09-28）：races 压缩包 + 全站统一缓存控制器；字体 101 片分片 → 构建期按需子集 1 片（2026-09-20）。
- **编辑台**（2026-09-29/30 → 2026-11-01）：草稿箱 + 线上单原子 commit；`?edit=1` 废除，改 PAT 校验解锁（§168）；编辑页整页门禁（§190，2026-11-11）。
- **代码结构**（2026-xx）：取消「两管线互不 import」硬限制 → 「业务隔离、代码抽离复用」；`core/paths.py` 扩展为 `core/constants.py`；新增 `net.bind()` 与 `runtime.install_lazy_http()`。
- **开源化**（2026-11-12）：代码 MIT + 数据独立声明（LICENSE / NOTICE）；站点身份全部进 `config/`（`repo` / `analytics` / `cross_site` / `progeny_years` / 友链），空值 = 关闭；构建期「本站身份」自检；页面能力表（`features.json` + `yj-cap.js`，关闭的能力仍构建以显示空态）；构建入口改目录派生。

## 11. UI 规格索引（正文归档在 git）

> §N = 原 UI 记录编号。**正文已归档**：`git show 7e48d69:docs/UI优化记录.md`（缺号 = 更早已归档）。代码注释里的 `§N` 引用按本表定位到页面，正文去 git 查。

| 范围 | 看哪些 § |
|---|---|
| 全局 · 搜索栏 / 字体 / 设备 / 跨页联动 | §3 · §4 · §10 · §12–§14 · §20 · §28–§30 · §36 · §37 · §39 · §42 · §62 · §66 · §72 |
| 基本信息（profile） | §5 · §7 · §8 · §38 · §54/§55 · §94 · §95 · §97 · §98 · §99 · §136 · §137 · §158 · §159 · §160 |
| 比赛记录（races） | §9 · §11 · §22 · §25 · §34 · §40 · §46 · §51 · §53 · §56 · §57 · §60 · §61 · §78 · §80 · §100–§102 · §161 · §162 · §164 |
| 倾向统计（stats） | §35 · §44 · §47 · §49 · §50 · §64 · §110 · §135 · §144 · §145 · §157 |
| 产驹赏金（leaderboard） | §112 · §114 · §115 · §128–§131 · §181 |
| 日期统计（datechart） | §32 · §33 · §63 · §146 · §165 · §183 |
| 出走马表（entries） | §174 · §184 · §184.1 |
| 航迹线（timeline） | §31 · §45 · §148 · §149 · §166 · §175–§177 · §179 · §182 · §188 |
| 视频回放 | §185 · §185.1 · §185.2 · §186 · §187 · §187.1 · §189 |
| 编辑台（4 页） | §91–§93 · §105 · §142 · §150 · §154 · §155 · §168 · §169 · §187 · §190 |
| 跨站 / 部署 / 冒烟 / 派生 | §103 · §169–§173 |

**仍然生效的两条跨页规则**（细则在 §190 / §105，实现已在代码里）：

- **编辑页必须挂 PAT 门禁**：编辑页在 `yj-util.js` 之后、`editor*.js` 之前引 `../yj-edit-gate.js`；任何指向编辑页的入口用 `YJ.util.editUnlocked()` 判显隐。
- **站点级存储键必须带前缀**：localStorage / sessionStorage / IndexedDB / Cache API 桶名一律经 `YJ.util.storeKey(k)`，且**加载期不得求值**（部分页面 `site-config.js` 晚于模块脚本）。
