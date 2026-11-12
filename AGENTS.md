# AGENTS.md · 云迹项目规则（AI 助手必读）

本文件汇总散落在项目各文档中的**硬性规则**，供 AI 助手在任何会话开始时遵守。详细背景与依据见源文档（已注明出处）。

## 0. Git 协作（最高优先级）

- **commit**：仅在用户明确要求提交时执行；未要求不得自行 `git commit`。
  —— `docs/DESIGN.md` §8「Git 协作约定」
- **push**：永远不执行 `git push`；推送只能由用户本人操作。
  —— `docs/DESIGN.md` §8「Git 协作约定」
- `dist/` 在 `.gitignore` 中，构建产物不入库，由 CI/本地构建生成。

## 1. 工作流程

- 正式源码在 `front/`（Vite 多页 + Tailwind）；修改 → `npm run build` → 产物到项目根 `dist/` → 验证 `dist/` 生效。
- **每次改样式/类名后必须构建并核对** `dist/assets/theme-*.css` 含新类——编译期框架最大坑：改了类但没编译 → 页面无变化。
- 探索/候选版放项目根 `tests/`，废案放 `tests/_trash/`；旧 `testpage/` 已归档 `tests/_trash/testpage-snapshot`，只读勿直接改。
- UI 优化：每改一个模块，先把「最终思路 + 一句话结论」写进 `docs/DESIGN.md` §11 的 UI 规格索引（不展开废案与过程链），再合并进正式页面。
- **文档只放两处**：仓库根 `README.md` / `AGENTS.md` + `docs/`（索引 = `docs/README.md`）。过程文档（重构方案 / 落地审计 / 复用审计 / UI 审查报告）在项目完成后即清理——2026-11 已删 4 篇；**规则与结论必须沉淀到 `docs/` 常驻文档、`AGENTS.md` 或代码注释里**，不要让唯一出处停留在一份一次性报告上。

## 2. 前端架构（必须遵守，不得退回旧方式）

- 架构已定：**Vite 多页构建 + Tailwind CSS v3（编译期）**。禁止手写散落 CSS / CDN 运行时 Tailwind / 无构建直接改页面。
- 样式一律用 Tailwind utility 类；复用组件类在 `front/pages/theme.css` 的 `@layer components` 用 `@apply` 封装；不散落原生 CSS、不写死 hex（指定色块除外）。
- 主题 token 统一在 `front/tailwind.config.js`（primary 青绿 `#0aa7a0`、shadcn Neutral 灰阶、Noto Sans SC + Geist）。
- JS 里拼接的 Tailwind 动态类必须能被 `tailwind.config.js` 的 `content` 扫到（当前 globs 含 `./pages/**/*.js` 与 `./public/**/*.js`）。
- 共享 JS（非 module `<script>`）放 `front/public/`，由 Vite 原样拷到 `dist/` 根，页面用 `../xxx.js` 相对引用。
- 响应式：统一 `max-md:`（768px）单断点，不要写多个碎断点。
- i18n：日文字段/枚举 → 中文全部走 `front/public/i18n.js` 字典（`YJ.i18n.t/e/g`），**不改后端 JSON**。
- 数据语义色（全站一致）：1着/胜=`primary` 青绿、2着=`chart-2` 青、3着=`chart-3` 橙、未完走（中止/取消/除外/失格）=`destructive` 红、重赏徽章（GI/GII/GIII/L/OP）用 `primary`/`chart-*` 分级。
- 跨页联动走 `bus.js`（postMessage + **sessionStorage**，按标签页隔离），不另起机制。
- **跨站引用（entries 出走马表）**：`pages/entries.html` 引 racing-calendar 的纯渲染组件（`window.RC_ENTRIES_EMBED`），组件 URL 的版本戳**必须读 `embed/manifest.json` 的内容哈希**（`?v=<hash>`），禁止手写版本号；宿主注入能力（译名 / 马匹页跳转）按对方仓 `docs/DESIGN.md` §10.1 契约对接，本地自动指向 `:9093`。
- **编辑页必须挂 PAT 门禁（§190 定稿）**：编辑页（`pages/edit.html` / `edit-table.html` / `edit-drafts.html` / `edit-timeline.html`，以及**今后新增的任何编辑页**）必须在 `yj-util.js` 之后、`editor*.js` 之前引入 **`../yj-edit-gate.js`** —— 未解锁时整页换成解锁卡片，公网访客看不到编辑界面。页面里任何指向编辑页的入口一律用 `YJ.util.editUnlocked()` 判定显隐（如回放浮层「配置视频源」的 `canEdit()`），禁止硬拼链接无条件暴露。⚠ 这是**前台可见性门禁，不是安全边界**（编辑页是公开静态文件）：真正把守写权限的是 GitHub PAT，仓库常量与校验单一出处 = `YJ.util.GH_REPO` / `YJ.util.verifyPat()`。
- **站点级存储键必须带站点前缀（§105 定稿）**：localStorage / sessionStorage / IndexedDB 库名 / Cache API 桶名一律经 **`YJ.util.storeKey(k)`** 构造，前缀 = `YJ_SITE.id`（源 = `config/sire.json` site.id，缺省回退共享 `"yj"`）——禁止裸字面量键；且**加载期不得求值**（部分页面 `site-config.js` 晚于模块脚本，加载期算好会静默退回旧共享键 → 同源双站 PAT/草稿/缓存互串，不报错最难查）。新增键先 grep 现有 `storeKey(` 调用点确认语义不重叠（§105 原键清单已随 UI 记录归档）。
- **站点身份一律走 `config/`，禁止在代码里写死（开源化 P0，2026-11-12 定稿）**：编辑仓库 = `site.repo`（前端经 `YJ.util.GH_REPO` 读，**空值 = 编辑功能整体关闭**的 fail-closed，不是回退默认仓库）、统计账号 = `site.analytics{goatcounter,vercount}`、友链 = `config/friend-links.json` → `YJ_FRIENDS`、产驹生年 = `sire.progeny_years`（Python 侧 `sire_config.progeny_years()`）、跨站引用 = `site.cross_site{jbis_rank,racing_calendar}`（空 = 对应板块整体关闭，页面不许拼空地址去 fetch）、文案 = `site.copy{intro,about,footer_note}`（空 = 回退默认）、友链挂载点 `data-site` = `{{YJ_SITE_ID}}`、PAT 提示 = `{{YJ_SITE_REPO_HINT}}`。**空值语义 = 合法关闭态**（功能消失、构建只打 ⚠），只有 `progeny_years` 缺/非法才硬报错。新增任何「每站不同的值」先问能不能进 `config/sire.json`；`npm run build` 结束的「本站身份」输出是漏配的第一道检查。依据 = `docs/DESIGN.md` §3「站点身份」一行与 §10 决策时间线。
- **缺失语义二分法（2026-11-12 定稿，新增配置项前必读）**：配置项为空/缺失时怎么反应，**取决于它决定什么，两种处理方向相反，不许混**：
  - **决定数据正确性**（缺了页面上的数字 / 条目会算错）→ **硬报错退出**（`sys.exit` / 构建抛错），文案指路字段契约。例：`sire.progeny_years` 缺了会静默建档 0 匹、漏整代；`config/grade-table.json` 缺非空 `GRADE`；`site.repo` 写成 `https://…` 这类格式错误。
  - **决定功能有无**（缺了只是少一块）→ **静默关闭**，构建最多 ⚠，绝不报错、绝不回退别人的默认值。例：`site.repo` 空（编辑台关）、`site.analytics` 空（统计静默）、友链空、`video-sources.mid` 空、`site.cross_site` 空、`features` 里 `false`。
  - 判据一句话：**「缺了它，已有页面上的内容会不会算错？」会错 → 报错；只是少一块 → 静默。** 反例警示：不要因为「空 = 关闭」读起来顺，就把 `progeny_years` 也做成静默 —— 那是最难查的一类事故。
- **页面能力可挂载（L2 · 2026-11-12 试点）**：页面级能力的「有没有」由 **`config/features.json`** 单一定义，id 表（唯一出处）= `front/scripts/features.cjs` 的 `CAPS`；**缺文件/缺字段 = 全部启用**（老站与 kzn 不受影响），只写要关的。约束：① 导航项必须带 `data-cap="<id>"`（外壳按表过滤，关掉后入口不出现）；② 页面必须引 `front/public/yj-cap.js`（关掉后直连 URL 显示「本站未启用」空态卡片，不是白屏/404）；③ 构建入口由 `front/pages/` **目录派生**而非硬编码数组（删页面文件不会 build 失败）；④ 新增页面 = 在 `CAPS` 登记 + 导航加 `data-cap` + 页面引 `yj-cap.js` + 跑 `node scripts/verify_caps.cjs`。**能力只能进一步关闭，不能强开依赖缺失的能力**（编辑台 = `features.editor` 与 `site.repo` 双门 AND）。

- **复用抽离（硬性约定，§48 定稿）**：公共工具（esc 等）单一出处 `front/public/yj-util.js`（`YJ.util.*`，页面薄别名，禁止复制函数体）；比赛行/徽章/格式化/格级映射一律复用 `front/public/race-rows.js`；着顺浅色三件套 JS 侧 = `race-rows.js` 的 `PLACE_BG`（CSS 侧 = theme.css `.yj-nkm*`，两处互指、改色同步）。**只有全站统一语义或 ≥3 处使用才抽离，仅 2 处不动**；收口只做等值搬移/纯删除，改后照常 build+dist 核对。theme.css `@layer components` 里**不放 JS 动态拼类名、content 无字面量的类**（会被 Tailwind 按候选裁剪，如 `.yj-g*` 必须在 @layer 之外）。细则见 `docs/DESIGN.md` §4「前端编码约定」。

## 3. 数据与路径

- 数据源在项目根 `data/`，构建时由 `vite.config.js` 的 `copy-data` 插件复制为 `dist/data/`（跳过 `_tmp/` 与 `*.md`/`*.csv`/`*.jsonl`）；前端一律经 **`YJ_DATA.url('...')`** 解析（`front/public/data-config.js` 为**唯一数据源映射点**，`prefix:'..'`，内部拼 `../data/...`）。**改数据目录/位置只改该文件 `prefix`/`root`**，禁止散落写死数据路径。`data/` 各产物的**字段契约与口径单一出处 = `docs/SCHEMA.md`**（生成脚本文件头只留一行指路），管线流程见 README「维护与排障」。
- **本地预览一律 `python serve.py`**（项目根；服务 `dist/`，端口单源 = `serve.config.json` 的 **9090**，启动即打开 `http://127.0.0.1:9090/index.html`，`--no-open` 只起服务）。禁止再手写 `python -m http.server <port>`（端口散落 + 缺 no-cache/CORS）。`dist/` 已自包含数据副本，务必 http 访问（file:// 下 fetch 失败）；`scripts/` 更新数据后需重新构建才会进 `dist/data/`。
- **端口是约定不是偏好**：四兄弟站 yunji `9090` / kzn `9091` / jbis-sire-rank-history `9092` / racing-calendar `9093`，各仓 `serve.config.json` 为唯一出处。端口被占用时脚本**直接报错退出**——不要改成自动顺延（`entries.html` 硬编码了 RC 的 9093，顺延即静默失配）；换端口只改该 JSON，并连带核对跨站引用。
- `data/basic.json` 是后端合并产物，**前端只读，勿手改**。
- **产物清单（`data/` 下 500+ 个 JSON）**：`basic.json`（合并主表，277 匹）/ `pedigree/{id}.json` / `races/{id}.json` / `timeline.json` / `datechart.json` / `stats.json` / `sire_wins.json`（父子制覇派生）/ `video-map.json`（回放映射）+ `video_raw.json`（B 站抓取基线，只增不减）；人工表 4 张：`manual_overrides.json` / `timeline_manual.json` / `races_manual.json` / `video_manual.json`（契约见 `docs/SCHEMA.md`，`_` 前缀键不参与套用）。
- **前端数据一律走统一缓存控制器 `front/public/yj-cache.js`（`YJ.cache.fetch(name[, opts])`）**：注册表按产物给 TTL（当前全 12h，可按产品覆写），禁止页面绕过控制器直连 fetch 数据产物（编辑台 no-store 语义除外）。**改数据目录/位置时同步核对 `yj-cache.js` 注册表的 `url/prefix`**。
- `data/races-bundle.json`（比赛压缩包，契约 = `docs/SCHEMA.md` §8）是**构建期派生产物**：只在 `npm run build` 时由 `front/scripts/build-races-bundle.mjs` 生成进 dist（**替换式**——打包成功则 dist 不拷贝 `data/races/*.json`），**`data/` 仓库不落盘、后端管线不经过它**；数据更新后重新构建即得新 bundle。
- `data/fetch_log.jsonl`（抓取观测日志，逐行 JSON）**入库可追踪**：`.gitattributes` 的 `data/fetch_log.jsonl merge=union` 扛并发 rebase（status/update-data/update-day 三条线都会追加同一文件），`scripts/core/net.py::trim_fetch_log` 按 `LOG_RETENTION_DAYS`（60 天）滚动裁剪，检测频率 `TRIM_CHECK_EVERY`（每 N 次写入一次，避免逐请求全量读 4MB）。构建期 `vite copy-data` 跳过 `*.jsonl`，日志不进 `dist/` 与线上包。
- 数据更新：`scripts/basic` 与 `scripts/races` **业务隔离、代码抽离复用**——两管线共享逻辑统一下沉中立层 `scripts/core`（路径/站点/颜色等字面量常量单源 = `core/constants.py`，两个 `common.py` 只做薄再导出，不再各持一份拷贝）；中立层不得出现管线概念，各管线风控口径 `DOMAIN_SLEEP`/`STRIP_BASES` 仍由各 `common.py` 持有并以形参注入 `net.bind()`；业务模块互不 import 对方。此外 `scripts/status`（登録状态/抹消馬簿，直写 basic.json）与 `scripts/video`（B 站回放匹配）是**独立支线**，不挂在 `--ci` 里，由 workflow 串联。数据统一落根 `data/`；日常/定时统一入口 `python run_update.py <策略>`。⚠ `--init`/`--races-force` 会删空/覆盖 `data/`，`--ci` 会 commit+push（测试必须隔离：跑 `--init` 前先备份 `data/`，`--ci` 会 commit+push）。
- **GitHub Actions 权限**：workflow 里写 `permissions:` 会**整体覆盖**仓库默认的 "Read and write"——没列出的 scope 直接变 `none`。凡是末步要 `POST /repos/{repo}/actions/workflows/deploy.yml/dispatches`（`update-data`/`status` 都靠它触发 Pages）或 `upload-artifact` 的 job，必须声明 `actions: write`，否则一律 **403（curl exit 22）**。`status.yml` 曾只声明 `contents: write`，2026-10-31 起连续多日标红，实际是数据已提交、仅部署触发失败（`update-data` 当时没写 `permissions`，靠仓库默认才侥幸成功，现已显式声明）。

## 4. 已删除 / 不要复活

- 早期配色方案 A~D、shadcn 探索页、顶部导航布局方案、暗黑模式 已删除，**不要复活**。
- **已删除的过程文档（2026-11 清理，磁盘已无此文件，仅 git 历史可查）**：`docs/REFACTOR.md`（重构方案，P1-P5 已落地）、`docs/审计报告-工作区全量改动.md`、`docs/重复代码审计.md`、`docs/UI审查报告-2026-10-30.md`。源码注释里的这些文件名属**历史出处指认**，不必找回；同类内容（配置契约 → `config/*.json` 内的字段注释、复用约定 → `docs/DESIGN.md` §4）已有常驻替身，**不要再新建一次性报告来承载规则**。归档清单见 `docs/README.md` 末节。
- 项目约定：「请求怎么发」可参考旧实现，「业务流程」要自己重新设计。

## 5. 项目定位

- 站点：**云迹 · 云崽档案**（单一种马产驹的个人查阅/检索用，当前收录コントレイル产驹，建档 277 匹 / 成绩 276 份）。前端 9 个功能页 + 编辑台 4 页（见 `README.md` 功能页表），已进入维护期：改动以修 bug / 补数据 / 微调体验为主，不再大改架构。
- **子项目（模板站身份）**：本仓是子项目站的同步源。现有 kzn-web（絆 · キズナ产驹，独立仓库不共享 git 历史）。凡涉及「复制新子项目 / 把本仓改造同步到子项目 / 子项目回灌」，**禁止凭感觉整拷**：一律先确认 ①`config/` 全部是站点个性（永不动）②`front/**` 与 `scripts/**` 只搬等值代码 ③冒烟断言里的具体值必须改成从产物派生（红线见 `docs/DESIGN.md` §4 末尾「冒烟断言红线」）。子项目同步的正式指南待补，未补齐前不要批量同步。
- 部署：**双平台静态站**——GitHub Pages（站点根 = 仓库根，入口 `/dist/index.html`，push main 由 `deploy.yml` 构建发布）与 Cloudflare Pages（`wrangler.jsonc`，assets = `./dist`）。⚠ CF Pages 会把 `/pages/x.html` **307** 剥成 `/pages/x`，任何 `location.pathname` 与 `.html` 做比对的代码必须先经外壳 `pageKey()` 归一（线上侧栏高亮全灭的坑）。本地预览用项目根 `python serve.py`（固定 `http://127.0.0.1:9090/`，服务 `dist/`）。
