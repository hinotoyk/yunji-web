# 云迹 · 云崽档案

「云迹 · 云崽档案」是**单一种马产驹**的个人查阅/检索资料库（当前收录 **コントレイル**（铁鸟翱天 / Contrail，netkeiba id `2017101835`）产驹，建档 277 匹 / 成绩 276 份），以 **GitHub Pages / Cloudflare Pages 静态站**形式部署。数据由 Python 管线从 JBIS / netkeiba / studbook.jp / 台账抓取维护，前端为 Vite 多页 + Tailwind CSS 构建，全站离线自包含。换种马只需改 `config/sire.json`（字段契约见 `docs/子项目复制与同步指南.md` §1.1）。

## 功能页

| 页面 | 文件 | 说明 |
|---|---|---|
| 基本信息（云崽档案） | `pages/profile.html` | 头像/名字四槽/信息表/血统/数据概览/内嵌比赛记录；未选马显示全库概览等式 |
| 比赛记录 | `pages/races.html` | 单马履历（内嵌/独立双模式）+ 独立「全库跨马多维组合查询」（8 维筛选 + 分页）+「回放」列（B 站源、站内浮层） |
| 倾向统计 | `pages/stats.html` | 倾向矩阵（15 维切面）× 种马榜走势 × 年龄成绩曲线（ECharts 定制包） |
| 产驹赏金 | `pages/leaderboard.html` | 赏金排行（双系列条形 + 重赏描边），点马名跳基本信息 |
| 日期统计 | `pages/datechart.html` | 天/周/月/年日历聚合（进板数/赏金/重赏标识） |
| 出走马表 | `pages/entries.html` | 跨站引用 racing-calendar 的出走马组件（embed 协议，版本读其 `manifest.json` 内容哈希；线下自动指向本地 `:9093`） |
| 航迹线（时间线） | `pages/timeline.html` | 里程碑事件流（级别首胜/重赏/世代新马首胜/父子制覇…）+ sticky 年份胶囊 |
| 血统图 | `pages/pedigree.html` | 简约 2 代 + 完整 5 代弹窗（profile 内嵌） |
| 编辑台 | `pages/edit.html` · `edit-table.html` · `edit-timeline.html` · `edit-drafts.html` | 草稿箱模式人工修正（单马字段 / 批量表格 / 航迹线 / 视频源），PAT 校验解锁入口，线上单原子 commit；mb 端不开放 |

外壳 `index.html`：左侧导航 + iframe 内容区，响应式单断点 768px（手机收成 ☰ 抽屉）；侧栏含四兄弟站「友情档案」互跳（`public/friend-links.js`）。

## 技术栈

- **前端**：Vite 多页构建 + Tailwind CSS v3（编译期），产物输出到仓库根 `dist/`；共享 JS 放 `front/public/`（Vite 原样拷贝），页面相对引用。
- **数据**：JSON 产物全在仓库根 `data/`（`basic.json` + `pedigree/{id}.json` + `races/{id}.json` + `timeline.json` + `datechart.json` + `stats.json` + `sire_wins.json` + `video-map.json` + 三张人工表），构建时复制为 `dist/data/`，前端经 `YJ_DATA.url()` 统一解析、经 `YJ.cache.fetch()` 统一缓存（12h TTL + SWR）。比赛数据构建期打成 `races-bundle.json`（1 请求替代 276 个小文件）。
- **数据管线**：Python（`scripts/`），JBIS 建档 → netkeiba/studbook 详情与成绩 → 合并回 `data/basic.json`；另有 `scripts/status`（登録状态）、`scripts/video`（回放匹配）两条独立支线；统一入口 `python run_update.py <策略>`。
- **字体**：构建期按需全量子集（`gen-font.mjs` → 1 个 woff2 + 1 条 `@font-face`），fail-soft。
- **部署**：GitHub Pages（push main 由 CI 构建发布）+ Cloudflare Pages（`wrangler.jsonc`，assets = `dist/`）。

## 目录结构

```
yunji-web/
├── config/                # 站点/种马配置（sire.json · grade-table.json · video-sources.json）
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
├── AGENTS.md              # AI 助手工作规则（硬性约定汇总）
└── README.md              # 本文件
```

## 快速开始

```bash
# 前端：安装依赖 → 构建（产物到根 dist/）
cd front
npm install
npm run build

# 本地预览：端口固定（单源 = 项目根 serve.config.json），服务 dist/，自动打开首页
cd ..
python serve.py             # → http://127.0.0.1:9090/index.html
python serve.py --no-open   # 只起服务，不弹浏览器
```

> 必须用 http 访问（file:// 下 fetch 失败）；端口被占用时 `serve.py` **直接报错退出，不会换号**——四兄弟站约定 yunji `9090` / kzn `9091` / jbis-sire-rank-history `9092` / racing-calendar `9093`。
> Vite dev server（默认 `:5173`，根是 `front/`、取不到 `../data`）只做热更新，**不占本站约定端口**；看数据一律走 `python serve.py`。
> 每次改 `front/` 后 `npm run build` 再刷新验证；改数据后同样需重新构建才会进 `dist/data/`。

## 新项目：换种马（单配置源）

本站是**单一种马参数化**的通用资料库：复制仓库后，种马/品牌/视频源全部由 `config/` 三个文件定义，
**不改代码**即可跑新种马（字段契约与品牌保留清单见 `docs/子项目复制与同步指南.md`）：

1. 复制仓库，编辑 `config/sire.json`：`jbis_id` / `netkeiba_id` / `sire.name_*`（`name_ja`/`name_cn` 均不可为空，否则父子制覇徽章整体关闭）/ `studbook` / `wins`（兜底值，主数据由 `sync_sire_wins.py` 派生）/ `site`（**`id` = 站点存储命名空间前缀，必须改**，否则同源多站 PAT/草稿/缓存互串；`name`/`subtitle`/`tagline`/`logo`/`domains` = 品牌与统计域名白名单）/ `ledger.url`（**空 = 台账环节跳过**，不联网不失败）。
2. 按需改 `config/video-sources.json`（B 站 UP 主 mid + 匹配正则；`mid` 留空 = 回放功能关闭）。
3. 离线核对抓取 URL 拼装（**不联网**）：`python scripts/basic/build_registry.py --print-urls`。
4. `python run_update.py --init` 全量重建数据（需联网抓取；`--init` 会删空 `data/`）。
5. `cd front && npm run build`（品牌文案构建期注入，`dist/site-config.js` 由 `gen-site-config.mjs` 生成）。
6. **手动替换品牌资产**：`front/public/favicon.svg`、`apple-touch-icon.png`，并更新 `front/package.json` / `wrangler.jsonc` 的 name 与元数据。
7. 本地 `python serve.py`（:9090）冒烟，改 `serve.config.json` 的 `name`/`port` 后再推送部署。

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
| `--check [--fix]` | 数据一致性校验（+ 自动补跑修复） |
| `--ledger` | 只拉台账海外并入 |
| `--video` | 视频回放：抓 B 站 UP 主清单 + 离线匹配 → `data/video-map.json` |
| `--ci [--year …]` | 基本+比赛+校验+派生+git 提交（GitHub Actions 每日） |

详细验证点 / 回归清单 / 排查指南见 `docs/TESTING.md`；管线内部流程见 `docs/pipeline.md`。

## 部署与自动化

- **GitHub Pages**：push main 时 `.github/workflows/deploy.yml` 自动 `npm run build`，把仓库根（含 `dist/` + `data/`）发布为站点根，访问 `https://<user>.github.io/<repo>/dist/index.html`。
- **Cloudflare Pages**：`wrangler.jsonc` 指向 `./dist`（`front/public/_headers` 管缓存头）。⚠ CF 会把 `/pages/x.html` **307** 剥成 `/pages/x`，凡用 `location.pathname` 比对 `.html` 的代码必须先经外壳 `pageKey()` 归一（线上侧栏高亮全灭的坑踩过一次）。
- **数据自动更新**（5 条 workflow，串联不抢文件）：
  - `update-data.yml`：每天 UTC 22:00（北京 06:00）跑 `--ci`，有变化自动 commit+push 并 dispatch 部署；
  - `update-day.yml`：每天北京 21:00 用 `--day` 快更当天赛果（幂等去重，与全量 CI 互不覆盖）；
  - `status.yml`：`update-data` 成功后串联，跑登録状态 / 抹消馬簿（keibabook 对 Actions 出口 IP 403 时自动降级，由本机 `scripts/studbook_sync.py` 补跑）；
  - `video-task.yml`：`update-data` 成功后串联，尽力抓 B 站清单重算回放映射（机房 IP 有风控，抓不到不动数据；本机 `scripts/video/local_refresh.py` 家宽必成）。
- 前置：Settings → Pages → Source 选 **GitHub Actions**；Settings → Actions → Workflow permissions 勾选读写；末步要 dispatch 部署的 job 必须声明 `actions: write`（否则 403）。

## 文档导航

| 文档 | 内容 |
|---|---|
| `docs/HANDOFF.md` | 交接文档：当前状态 / 架构 / 编码规范 / 关键决策 |
| `docs/UI优化记录.md` | 各模块 UI 优化的最终方案与当前成果（含文首全站编码约定） |
| `docs/SCHEMA.md` | 数据产物字段契约（单一出处） |
| `docs/pipeline.md` | 后端数据管线说明（怎么跑 / 各管线流程 / 设计原则 / 离线红线） |
| `docs/TESTING.md` | 更新策略的测试验证点与排查手册 |
| `docs/子项目复制与同步指南.md` | `config/sire.json` 字段契约 / 品牌保留清单 / 子项目同步规程 |
| `docs/友情跳转方案.md` | 四站互跳方案 |
| `docs/request-path.html` | 请求·数据流路径图 |
| `docs/README.md` | docs/ 目录索引（含已归档文档说明） |
