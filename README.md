# 云迹 · 云崽档案

「云迹 · 云崽档案」是**单一种马产驹**的个人查阅/检索资料库（当前收录 **コントレイル**（铁鸟翱天 / Contrail，netkeiba id `2017101835`）产驹，建档 277 匹 / 成绩 276 份），以 **GitHub Pages / Cloudflare Pages 静态站**形式部署。数据由 Python 管线从 JBIS / netkeiba / studbook.jp / 台账抓取维护，前端为 Vite 多页 + Tailwind CSS 构建，全站离线自包含。

本项目同时是一套**可复用的「种马应援站」模板**：换一匹应援对象只需改 `config/`（种马 ID、站名、编辑仓库、统计账号、友链），**不改代码**。代码 MIT 授权，数据与图片的版权边界见 [NOTICE](./NOTICE)。

## 三条上手路径

按你要做到哪一步选一条，**不用读源码**。

### 路径 A · 1 分钟看效果（不跑数据管线）

```bash
git clone <本仓库>
cd front && npm install && npm run build && cd ..
python serve.py            # → http://127.0.0.1:9090/index.html
```

仓库自带 `data/` 全量数据，构建时自动复制进 `dist/`，所以 clone 完就能看到完整站点（含 277 匹产驹档案）。**零 Python 依赖**（纯标准库）；只有可选的字形子集步骤需要 `fontTools` + `brotli`，缺失会自动降级并告警，不影响构建。

### 路径 B · 10 分钟换成自己的种马（空壳站）

1. 复制仓库，编辑 `config/sire.json`：`sire.jbis_id` / `sire.netkeiba_id` / `sire.name_*` / `sire.studbook` / **`sire.progeny_years`**（只写已出生/已登记的生年）与 `site` 段（`id` 必改、`name`/`subtitle`/`tagline`/`logo`/`domains`/`repo`/`analytics`）。
2. `config/friend-links.json` 清空成 `{"sites": []}`（不渲染「站群导航」分组），或填自己的友链。
3. 按需关掉用不上的功能页：`config/features.json` 写 `{"entries": false, "editor": false}`（侧栏入口消失、直连显示「本站未启用」，不用删文件）。
4. `cd front && npm run build` —— 构建结束会打印一行「本站身份」自检（`repo` / 统计开关 / 友链条数 / 能力开关 / 种马），漏配项带 ⚠。
5. `python serve.py` 看效果：品牌、标题、导航、页脚都已是你的站，但**数据仍是原仓库的**（`data/` 是别人的产物，页面会把原种马的产驹列出来）。想要真空壳：先清空 `data/`（**先备份**）再 build；正常顺序是走路径 C 让管线自己建。

### 路径 C · 数小时抓全量数据

```bash
python scripts/basic/build_registry.py --print-urls   # 先离线核对抓取 URL（不联网、不写盘）
python run_update.py --init                           # ⚠ 会删空 data/ 后全量重建，需联网
cd front && npm run build
```

⚠ **路径 C 的警告**：`--init` / `--races-force` 会删空或覆盖 `data/`；日站对机房 IP 与高频访问有风控，管线内置 `DOMAIN_SLEEP` 限速——**嫌慢就改它**（`scripts/basic/common.py` / `scripts/races/common.py` 顶部有逐步下调的方法与代价说明，别一次砍半）；产驹多的种马全量重建很慢（实测 729 匹 6 小时，其中 5 小时是限速等待），**不需要预先调任何超时** —— 编排层只按「有没有进度输出」判卡死（连续 20 分钟无输出即中止），总时长兜底是 CI 的 job 上限。

## 配置即站点身份（`config/` 五个文件）

| 文件 | 管什么 | 空值语义 |
|---|---|---|
| `config/sire.json` | 种马档案（ID / 名称 / studbook / 父子制覇 wins / **`progeny_years`**）+ 站点身份（`site.id` / 品牌四件套 / `domains` / **`repo`** / **`analytics`** / **`cross_site`**）+ 台账 URL | `repo` 空 = 编辑台关闭；`analytics` 空 = 统计静默；`cross_site` 空 = 对应跨站板块关闭；`ledger.url` 空 = 台账环节跳过 |
| `config/features.json` | **页面能力表**：哪些功能页挂载、哪些不挂 | 缺文件/缺键 = 全部启用；`"entries": false` = 关掉「出走马表」（侧栏入口消失、直连显示「本站未启用」） |
| `config/friend-links.json` | 侧栏「站群导航」友链数组 | 空数组 = 分组不渲染 |
| `config/video-sources.json` | B 站 UP 主 mid + 匹配正则 | `mid` 空 = 回放功能关闭 |
| `config/grade-table.json` | 级别（GI/GII/…）归一表 | 必须非空（构建期校验） |

字段逐行契约在配置文件内（`config/*.json` 每个键都有注释性质的 `_about`/行内说明），消费方 = `scripts/core/sire_config.py` 与 `front/scripts/gen-site-config.mjs`。**改配置 ≠ 改代码**：页面里没有写死的站名、仓库名、统计账号、友链或跨站地址。

两处**跨站引用**（`site.cross_site`，都是可选的）：

- `jbis_rank` → 倾向统计页的「种马榜走势」（数据与图表组件来自 jbis-sire-rank-history 站）；
- `racing_calendar` → 出走马表页（组件来自 racing-calendar 站）。

不配 = 该板块整体不出现（种马榜整节不渲染 / 出走表显示「未配置数据源」），**不会留半截或 404**。它们都是别人的站，fork 后默认不该继续抓原作者的部署。

### 可选功能（能力表）

不想要哪块就关掉，**不用删文件、不会 404**：

```jsonc
// config/features.json
{ "features": { "entries": false, "editor": false } }   // 只写出要关的
```

- 侧栏入口不出现（外壳按表过滤，空分组标题也一并收起）；
- 直连 URL（旧书签 / 分享链接）显示「本站未启用 · 出走马表」说明卡片，不是白屏；
- 构建照常通过（页面仍会被构建 —— 空态卡片要靠它），`npm run build` 的「本站身份」会列出 `capabilities 7/9（关闭: entries, editor）`；
- 能力 id 与页面映射的唯一出处 = `front/scripts/features.cjs`；验收命令 = `node scripts/verify_caps.cjs`。
- 编辑台是**双门 AND**：`features.editor` 与 `site.repo` 任一为关，编辑台即关闭。

## 功能页

| 页面 | 文件 | 说明 |
|---|---|---|
| 基本信息（云崽档案） | `pages/profile.html` | 头像/名字四槽/信息表/血统/数据概览/内嵌比赛记录；未选马显示全库概览等式 |
| 比赛记录 | `pages/races.html` | 单马履历（内嵌/独立双模式）+ 独立「全库跨马多维组合查询」（8 维筛选 + 分页）+「回放」列（B 站源、站内浮层） |
| 倾向统计 | `pages/stats.html` | 倾向矩阵（15 维切面）× 种马榜走势（跨站引用，见下）× 年龄成绩曲线（ECharts 定制包） |
| 产驹赏金 | `pages/leaderboard.html` | 赏金排行（双系列条形 + 重赏描边），点马名跳基本信息 |
| 日期统计 | `pages/datechart.html` | 天/周/月/年日历聚合（进板数/赏金/重赏标识） |
| 出走马表 | `pages/entries.html` | 跨站引用 racing-calendar 的出走马组件（embed 协议，版本读其 `manifest.json` 内容哈希；线下自动指向本地 `:9093`） |
| 航迹线（时间线） | `pages/timeline.html` | 里程碑事件流（级别首胜/重赏/世代新马首胜/父子制覇…）+ sticky 年份胶囊 |
| 血统图 | `pages/pedigree.html` | 简约 2 代 + 完整 5 代弹窗（profile 内嵌） |
| 编辑台 | `pages/edit.html` · `edit-table.html` · `edit-timeline.html` · `edit-drafts.html` | 草稿箱模式人工修正（单马字段 / 批量表格 / 航迹线 / 视频源），PAT 校验解锁入口，线上单原子 commit；mb 端不开放；**`site.repo` 未配置时整页显示「编辑台已关闭」** |

外壳 `index.html`：左侧导航 + iframe 内容区，响应式单断点 768px（手机收成 ☰ 抽屉）；侧栏可选的「站群导航」互跳（`public/friend-links.js`，注册表 = `config/friend-links.json`）。

> 跨站引用（`stats` 的种马榜走势 ← jbis-sire-rank-history、`entries` 的出走表 ← racing-calendar）是**可选外部依赖**，地址在 `front/public/data-config.js` 的 `remote` 段；没有兄弟站时这两块会加载失败，其余页面完全不受影响。

## 技术栈

- **前端**：Vite 多页构建 + Tailwind CSS v3（编译期），产物输出到仓库根 `dist/`；共享 JS 放 `front/public/`（Vite 原样拷贝），页面相对引用。
- **数据**：JSON 产物全在仓库根 `data/`（`basic.json` + `pedigree/{id}.json` + `races/{id}.json` + `timeline.json` + `datechart.json` + `stats.json` + `sire_wins.json` + `video-map.json` + 三张人工表），构建时复制为 `dist/data/`，前端经 `YJ_DATA.url()` 统一解析、经 `YJ.cache.fetch()` 统一缓存（12h TTL + SWR）。比赛数据构建期打成 `races-bundle.json`（1 请求替代 276 个小文件）。
- **数据管线**：Python 纯标准库（`scripts/`），JBIS 建档 → netkeiba/studbook 详情与成绩 → 合并回 `data/basic.json`；另有 `scripts/status`（登録状态）、`scripts/video`（回放匹配）两条独立支线；统一入口 `python run_update.py <策略>`。
- **字体**：构建期按需全量子集（`gen-font.mjs` → 1 个 woff2 + 1 条 `@font-face`），fail-soft。
- **部署**：GitHub Pages（push main 由 CI 构建发布）+ Cloudflare Pages（`wrangler.jsonc`，assets = `dist/`）。

## 目录结构

```
├── config/                # 站点/种马配置（sire.json · features.json · friend-links.json · video-sources.json · grade-table.json）
├── data/                  # ★ 全部数据产物（basic.json / pedigree/ / races/ / timeline.json / datechart.json / stats.json / 人工表 / 报告）
├── docs/                  # ★ 全部人工文档（索引见 docs/README.md）
├── scripts/               # Python 数据管线（core 中立层 / basic / races / timeline / datechart / stats / status / video / check_data.py）
├── front/                 # ★ 前端正式源码（Vite 多页 + Tailwind）
│   ├── index.html         # 外壳：左侧导航 + iframe 内容区
│   ├── pages/             # 9 个功能页 + 各页 CSS + theme.css（Tailwind 输入）
│   ├── public/            # 共享 JS（i18n / selector / race-rows / yj-cache / yj-util / bus / device / pedigree / editor / race-bundle / lightbox / yj-video / friend-links …）
│   └── scripts/           # 构建期工具（gen-font.mjs / gen-site-config.mjs / build-races-bundle.mjs）
├── .github/workflows/     # deploy / update-data / update-day / status / video-task
├── dist/                  # 构建产物（gitignore，CI 现场构建）
├── run_update.py          # 数据更新统一入口（10 个策略参数）
├── run_full_test.py       # 从 0 全量自测
├── serve.py               # 本地预览（端口单源 = serve.config.json）
├── LICENSE / NOTICE       # 代码 MIT · 数据与图片来源声明
├── AGENTS.md              # AI 助手工作规则（硬性约定汇总）
└── README.md              # 本文件
```

## 本地预览

```bash
cd front && npm run build   # 产物到仓库根 dist/
cd .. && python serve.py    # → http://127.0.0.1:9090/index.html（--no-open 只起服务）
```

> 必须用 http 访问（file:// 下 fetch 失败）；端口被占用时 `serve.py` **直接报错退出，不会换号**——四兄弟站约定 yunji `9090` / kzn `9091` / jbis-sire-rank-history `9092` / racing-calendar `9093`。**fork 出第二座站时必须改 `serve.config.json` 的 `port`**（两站同端口 = 同源，本地存储会互相串）。
> Vite dev server（默认 `:5173`，根是 `front/`、取不到 `../data`）只做热更新，**不占本站约定端口**；看数据一律走 `python serve.py`。

## 离线验收（不联网，改完就跑）

```bash
cd front && npm run build && cd ..    # 构建尾部会打印「本站身份」（repo / 统计 / 域名 / 友链 / 能力 / 种马）

node scripts/races/verify_drill.cjs           # 比赛记录页下钻（统计矩阵 → races?f= 全链路）
node scripts/races/verify_result.cjs          # 着顺三态口径（完赛 / 未完赛 / 未出走 分账）
node scripts/stats/verify_stats.cjs           # 统计总览（产物契约 + 源对账 + 页面冒烟）
node scripts/datechart/verify_datechart.cjs   # 日期图（同上）
node scripts/timeline/verify_sire_wins.cjs    # 父子制覇数据源
node scripts/verify_caps.cjs                  # 页面能力表（配置 ↔ 导航 ↔ 空态脚本 ↔ dist 对账）

python scripts/basic/build_registry.py --print-urls   # 只打印抓取 URL（不改盘、不联网）
```

六条全绿 = 代码与数据契约都没被破坏。改过 `config/features.json`、增删页面后**必须**跑 `verify_caps`。

## 数据更新

```bash
python run_update.py <策略>
```

| 策略 | 做什么 |
|---|---|
| `--init` | 删空 data/ 从 0 全量重建 |
| `--basic [--year …]` | 新马对账建档 + 补缺 + 合并（日常基本数据） |
| `--races [--since N]` | 详情更新+判变 → 成绩增量 → 台账海外 → 合并（赛后日常） |
| `--horse 1,2,3` | 只处理指定 id 的马 |
| `--races-force` | 全部马重抓成绩页（覆盖式重建） |
| `--day 20261020[,..]` | 按天快速更新（SP 结果页；可配 `--jra-only` 跳过地方） |
| `--check [--fix]` | 数据一致性校验（+ 自动补跑修复）；附带「数据体检」结论（仅出报告，不影响流程） |
| `--ledger` | 只拉台账海外并入 |
| `--video` | 视频回放：抓 B 站 UP 主清单 + 离线匹配 → `data/video-map.json` |
| `--ci [--year …]` | 基本+比赛+校验+派生+git 提交（GitHub Actions 每日） |

未配 `--year` 时按 `config/sire.json` 的 `sire.progeny_years` 处理（只抓列出的生年）。

## 维护与排障

**日常三条线**（都已自动化，人工只在失败时介入）：`update-data` 每日 06:00 跑 `--ci`（有变化才 commit，末步 dispatch 部署）→ 串联 `status`（登録/抹消马簿）与 `video-task`（B 站回放匹配）；`update-day` 每日 21:00 用 `--day` 快更当天赛果（幂等，与全量互不覆盖）。

**管线三条硬规矩**（动脚本前先看）：

- `scripts/basic` 与 `scripts/races` **业务隔离**、共享逻辑下沉 `scripts/core` 中立层（中立层不出现管线概念）；`status` / `video` 是独立支线，不挂在 `--ci` 里。
- **能离线就不联网**：`--print-urls`、`merge_*`、五个 verify 全部离线可跑；抓取一律经 `core/net.py`（按域限速 `DOMAIN_SLEEP`，别调低 —— 调低等于加速被封）。
- **人工值只写 `data/manual_overrides.json`**：`data/basic.json` 是合并产物，手改会被下一轮 merge 覆盖。正确姿势 = 改人工表 → `python scripts/basic/merge_basic.py`。

**发版前 10 分钟**：`git status`（不该有 `dist/`）→ `cd front && npm run build`（「本站身份」段无 ⚠）→ 六件套冒烟 → 肉眼过首页 / 基本信息 / 比赛记录（点一场看回放）/ 统计 / 日期统计，并把窗口拉窄到 768px 以下看抽屉。

**疑难速查**：

| 症状 | 先查 |
|---|---|
| 改了样式没生效 | 没 build；或动态拼接的 Tailwind 类被裁剪（去 `dist/assets/theme-*.css` 搜类名） |
| 线上侧栏高亮全灭 | CF 把 `/pages/x.html` 307 剥成 `/pages/x`，`location.pathname` 比对必须先经外壳 `pageKey()` 归一 |
| 编辑台打不开 / 403 | `site.repo` 与 PAT 所属仓库不一致（双站防串是故意的） |
| 访客数不涨 | `site.domains` 是否含当前域名；GoatCounter 后台是否开了 visitor counter 端点 |
| 某匹马数据一直缺 | `python run_update.py --horse <id>` 定向跑；再看 `data/fetch_log.jsonl` 里该 host 的状态码 |
| 全量跑到一半被掐断 | 日志出现 `✗ [步骤] 判为卡死（连续 1200s 无输出）` → 站点假死/请求挂住（看 `data/fetch_log.jsonl` 该 host 的状态码与 dur）；若只跑到一半就整轮退出，这是有意的：不完整缓存不许合并提交 |
| 抓完发现马名乱码/整批空 | 先跑 `python scripts/smoke_fetch.py`（4~5 个请求，30 秒）判断是解码/跳转/结构哪一处变了；再看 `--check` 报告里的「数据体检」段。两者都**只出报告，不阻断流程** |
| 删了旧图后老访客 404 | 缓存桶要 +1（`front/public/yj-cache.js` 的 `data-vN`） |

**B 站回放**：`config/video-sources.json` 的 `mid` 留空 = 关闭。机房 IP 有风控，抓不到时管线不改数据（沿用已有基线）；本机可用 `scripts/video/local_refresh.py` 补跑，需要登录态可设环境变量 `BILI_COOKIE`。

## 部署与自动化

- **GitHub Pages**：push main 时 `.github/workflows/deploy.yml` 自动 `npm run build`，把仓库根（含 `dist/` + `data/`）发布为站点根，访问 `https://<user>.github.io/<repo>/dist/index.html`。
- **Cloudflare Pages**：`wrangler.jsonc` 指向 `./dist`（`front/public/_headers` 管缓存头）。⚠ CF 会把 `/pages/x.html` **307** 剥成 `/pages/x`，凡用 `location.pathname` 比对 `.html` 的代码必须先经外壳 `pageKey()` 归一（线上侧栏高亮全灭的坑踩过一次）。
- **数据自动更新**（5 条 workflow，串联不抢文件）：`update-data.yml`（每天 UTC 22:00 / 北京 06:00 跑 `--ci`）→ `status.yml`（登録状态）与 `video-task.yml`（B 站回放映射）串联；`update-day.yml`（北京 21:00 快更当天赛果）。
- 前置：Settings → Pages → Source 选 **GitHub Actions**；Settings → Actions → Workflow permissions 勾选读写；末步要 dispatch 部署的 job 必须声明 `actions: write`（否则 403）。
- **fork 后要改的站点资产**（不在 config 里）：`front/public/favicon.svg`、`front/public/apple-touch-icon.png`、`front/package.json` 与 `wrangler.jsonc` 的 `name`、`serve.config.json` 的 `name`/`port`。`.github/workflows/*` **不用改**——仓库名走 `${{ github.repository }}`，域名只出现在注释里。逐步清单见 [docs/FORK.md](./docs/FORK.md)。

## 文档导航

| 文档 | 内容 |
|---|---|
| `docs/FORK.md` | **克隆后改成自己应援站的分步手册（给 AI 执行）**：必填/可空字段表、品牌文件清单、首次抓数据 |
| `AGENTS.md` | AI 助手 / 协作者的**硬规则**（架构不得回退、缺失语义二分法、能力挂载、站点身份走配置） |
| `docs/SCHEMA.md` | 数据产物字段契约（单一出处；改字段先改这里） |
| `docs/DESIGN.md` | **架构与约定的唯一出处**：当前状态 / 前端架构 / 编码约定 / 数据管线 / 编辑台 / 决策时间线 / UI 规格 §索引 |
| `docs/request-path.html` | 请求·数据流路径图（浏览器打开） |
| `docs/README.md` | docs/ 目录索引（含已归档文档说明） |

## License

- **代码**：[MIT](./LICENSE) © 2026 hinotoyk
- **数据与图片**：来源与使用边界见 [NOTICE](./NOTICE)，版权归 JBIS / netkeiba / studbook.jp 及各摄影者所有，**不在** MIT 授权范围内。
- **商标**：MIT 不包含商标授权。「云迹 / 云崽档案 / 雲」标识不随代码授权，fork 后请更换品牌，避免与原站混淆。
