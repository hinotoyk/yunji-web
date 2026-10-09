# 云迹 · 云崽档案

「云迹 · 云崽档案」是**单一种马产驹**的个人查阅/检索资料库（当前收录 **コントレイル**（铁鸟翱天 / Contrail，netkeiba id `2017101835`）产驹；换种马只需调整种马配置，见 `docs/REFACTOR.md` §1），以 **GitHub Pages 静态站**形式部署。数据由 Python 管线从 JBIS / netkeiba / studbook.jp 抓取维护，前端为 Vite 多页 + Tailwind CSS 构建，全站离线自包含。

## 功能页

| 页面 | 文件 | 说明 |
|---|---|---|
| 基本信息（云崽档案） | `pages/profile.html` | 头像/名字四槽/信息表/血统/数据概览/内嵌比赛记录；未选马显示全库概览等式 |
| 比赛记录 | `pages/races.html` | 单马履历（内嵌/独立双模式）+ 独立「全库跨马多维组合查询」（8 维筛选 + 分页） |
| 统计总览 | `pages/stats.html` | 倾向矩阵（10+ 维切面）× 年龄成绩曲线 × 重赏之路 |
| 日期统计 | `pages/datechart.html` | 天/周/月/年日历聚合（进板数/赏金/重赏标识） |
| 航迹线（时间线） | `pages/timeline.html` | 里程碑事件流（级别首胜/重赏/世代新马首胜/父子制覇…） |
| 血统图 | `pages/pedigree.html` | 简约 2 代 + 完整 5 代弹窗（profile 内嵌） |
| 编辑台 | `pages/edit.html` / `edit-timeline.html` | 草稿箱模式人工修正，线上一次性提交 GitHub |

外壳 `index.html`：左侧导航 + iframe 内容区，响应式单断点 768px（手机收成 ☰ 抽屉）。

## 技术栈

- **前端**：Vite 多页构建 + Tailwind CSS v3（编译期），产物输出到仓库根 `dist/`；共享 JS 放 `front/public/`（Vite 原样拷贝），页面相对引用。
- **数据**：全部 JSON 产物在仓库根 `data/`（`basic.json` + `pedigree/{id}.json` + `races/{id}.json` + `timeline.json` + `datechart.json` + `stats.json`），构建时复制为 `dist/data/`，前端经 `YJ_DATA.url()` 统一解析。
- **数据管线**：Python（`scripts/`），JBIS 建档 → netkeiba/studbook 详情与成绩 → 合并回 `data/basic.json`；统一入口 `python run_update.py <策略>`。
- **部署**：GitHub Pages（`dist/` 自包含数据副本），push main 时 CI 自动 `npm run build` 并发布。

## 目录结构

```
yunji-web/
├── config/                # 站点/种马配置（sire.json · grade-table.json）
├── data/                  # ★ 全部数据产物（basic.json / pedigree/ / races/ / timeline.json / datechart.json / stats.json）
├── docs/                  # ★ 全部人工文档（索引见 docs/README.md，逐篇说明见下表「文档导航」）
├── scripts/               # Python 数据管线（core 中立层 / basic 建档 / races 竞赛 / timeline / datechart / stats / check_data）
├── front/                 # ★ 前端正式源码（Vite 多页 + Tailwind）
│   ├── index.html         # 外壳：左侧导航 + iframe 内容区
│   ├── pages/             # 功能子页面 + theme.css（Tailwind 输入）
│   ├── public/            # 共享 JS（i18n / selector / race-rows / yj-cache / yj-util / bus / device / pedigree / editor …）
│   └── scripts/           # 构建期工具（gen-font.mjs / gen-site-config.mjs / build-races-bundle.mjs）
├── dist/                  # 构建产物（gitignore，CI 现场构建）
├── run_update.py          # 数据更新统一入口（9 种策略）
├── run_full_test.py       # 从 0 全量自测
├── AGENTS.md              # AI 助手工作规则（硬性约定汇总）
└── README.md              # 本文件
```

## 快速开始

```bash
# 前端：安装依赖 → 构建（产物到根 dist/）
cd front
npm install
npm run build

# 本地预览（dist 已自包含数据，服务项目根或 dist/ 均可）
python -m http.server 8090            # 项目根 → http://127.0.0.1:8090/dist/index.html
python -m http.server 8091 --directory dist   # 或直接服务 dist → http://127.0.0.1:8091/
```

> 必须用 http 访问（file:// 下 fetch 失败）；Vite dev server（`:5173`）取不到数据，仅开发热更新用。
> 每次改 `front/` 后 `npm run build` 再刷新验证；改数据后同样需重新构建才会进 `dist/data/`。

## 新项目：换种马（单配置源）

本站是**单一种马参数化**的通用资料库：复制仓库后，种马/品牌/台账全部由 `config/sire.json` 一处定义
（字段契约见 `docs/REFACTOR.md` §3.3），**不改代码**即可跑新种马：

1. 复制仓库，编辑 `config/sire.json`：`jbis_id` / `netkeiba_id` / `sire.name_*`（`name_ja`/`name_cn` 均不可为空，否则父子制覇徽章整体关闭）/ `studbook` / `wins`（可空数组 = 不启用父子制覇徽章）/ `site`（`name`/`subtitle`/`tagline`/`logo`/`domains` 统计域名白名单）/ `ledger.url`（**空 = 台账环节跳过**，不联网不失败）。
2. 离线核对抓取 URL 拼装（**不联网**）：`python scripts/basic/build_registry.py --print-urls`，确认新 ID 拼出的 JBIS / netkeiba 列表页 URL 正确。
3. `python run_update.py --init` 全量重建数据（需联网抓取；`--init` 会删空 `data/`）。
4. `cd front && npm run build` 构建站点（品牌文案构建期注入，`dist/site-config.js` 由 `front/scripts/gen-site-config.mjs` 自动生成）。
5. **手动替换品牌资产**（不在配置范围）：`front/public/favicon.svg`、`front/public/apple-touch-icon.png`，并更新 `front/package.json` 的 `name`/`description` 元数据。
6. 本地 `python -m http.server 8090` 冒烟 8 页后推送部署。

## 数据更新

```bash
python run_update.py <策略>
```

| 策略 | 做什么 |
|---|---|
| `--init` | 删空 data/ 从 0 全量重建 |
| `--basic [--year …]` | 新马对账建档 + 补缺 + 合并（日常基本数据） |
| `--races` | 详情更新+判变 → 成绩增量 → 台账海外 → 合并（赛后日常） |
| `--horse 1,2,3` | 只处理指定 id 的马 |
| `--races-force` | 全部马重抓成绩页（覆盖式重建） |
| `--check [--fix]` | 数据一致性校验（+ 自动补跑修复） |
| `--ledger` | 只拉台账海外并入 |
| `--ci [--year …]` | 基本+比赛+校验+git 提交（GitHub Actions 每日） |

详细验证点 / 回归清单 / 排查指南见 `docs/TESTING.md`；管线内部流程见 `docs/pipeline.md`。

## 部署

- **GitHub Actions**：push main 时 `.github/workflows/deploy.yml` 自动 `npm run build`，把仓库根（含 `dist/` + `data/`）发布为 Pages 站点根，访问 `https://<user>.github.io/<repo>/dist/index.html`。
- **数据自动更新**：`.github/workflows/update-data.yml` 每天 UTC 22:00 跑 `--ci`（数据仓库模式，跑完有变化自动 commit+push），也可手动触发选策略。
- 前置：Settings → Pages → Source 选 **GitHub Actions**；Settings → Actions → Workflow permissions 勾选读写。

## 文档导航

| 文档 | 内容 |
|---|---|
| `docs/HANDOFF.md` | 交接文档：当前状态 / 架构 / 编码规范 / 关键决策 |
| `docs/UI优化记录.md` | 各模块 UI 优化的最终方案与当前成果（含文首全站编码约定） |
| `docs/SCHEMA.md` | 数据产物字段契约（单一出处） |
| `docs/pipeline.md` | 后端数据管线说明（怎么跑 / 两管线流程 / 设计原则 / 离线红线） |
| `docs/TESTING.md` | 更新策略的测试验证点与排查手册 |
| `docs/REFACTOR.md` | 重构方案（种马配置化 / 复用收口 / docs 目录整理） |
| `docs/request-path.html` | 请求·数据流路径图 |
| `docs/README.md` | docs/ 目录索引 |
