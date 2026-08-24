# 云迹 (yunji-web) · 交接文档

> 更新：2026-08-17（契约分层重构：比赛数据接入 Google Sheets 台账，定时自动同步）

## 1. 项目定位

GitHub Pages 托管的静态站：**铁鸟翱天（コントレイル）产驹资料库**，个人查阅/检索/管理。

- 站点名：**云迹**
- 仓库：https://github.com/hinotoyk/yunji-web （branch main）
- 托管：GitHub Pages + **Actions 自动部署**（push 即生效）

## 2. 目录结构

```
yunji-web/
├── page/
│   ├── index.html       # 主从分栏查看页（407 匹，5代血统树，年份筛选）
│   ├── detail.html      # 独立详情页（hash 深链接）
│   ├── preview.html     # 比赛数据临时预览页（核验用，阶段2 后移除）
│   └── admin.html       # 数据管理页（补录人工字段，勿用于覆盖抓取字段）
├── data/
│   ├── crops.json       # 站点数据（契约C，407 匹，含 races+stats；勿手改）
│   ├── raw/             # 契约A：netkeiba.json / jbis.json / jbis_pedigree.json
│   ├── races/google_ledger.csv # 契约B：比赛台账快照（649 条 / 135 匹，海外补缺/兜底）
│   ├── aliases.json     # 马名别名表（映射 / action=create 自动建档）
│   ├── sync-report.md   # 台账健康度（pull_races 产出）
│   ├── merge-report.md  # 马匹关联/覆盖/待校准（build-data 产出）
│   ├── manifest.json    # 版本清单
│   └── images/          # 图片目录（预留）
├── history/             # 历史版本快照（最多 30 个）
├── scripts/
│   ├── adapters/        # 数据源适配器（唯一知道源格式的代码）
│   │   └── sheets_ledger.py  # Google Sheets 台账适配器（URL/列名/日期格式）
│   ├── racelib.py       # 比赛域公共逻辑（契约B 校验/场地推导/汇总统计，与源无关）
│   ├── pull_races.py    # 比赛流水线：适配器 → 契约B → google_ledger.csv + sync-report
│   ├── scrape_netkeiba.py   # 契约A：netkeiba 抓取 --all/--horse/--name
│   ├── scrape_jbis.py       # 契约A：JBIS 血统 --all/--horse/--fill
│   ├── build-data.py        # 唯一构建器：契约A + 契约B → crops.json + merge-report + 快照
│   └── test-data.py         # 抽样校验 + 契约B/C 全量断言
├── docs/data-contracts.md   # 数据契约定义（核心文档，先读它）
├── .github/workflows/
│   ├── deploy.yml           # Pages 自动部署
│   └── update-data.yml      # 同步：schedule 定时(每天UTC22:00) + 手动 races/all/single
└── HANDOFF.md
```

## 3. 数据契约（先读 docs/data-contracts.md）

**核心原则：数据流通与数据源无关。** 每层只消费契约格式；换数据源只改适配器，下游零改动。

| 契约 | 内容 | 产出 |
|---|---|---|
| 契约A | 马匹基本数据/血统（raw/*.json） | 抓取器 |
| 契约B | 比赛记录（google_ledger.csv + netkeiba_races.json，字段/值域见文档） | `pull_races.py`（经适配器） |
| 契约C | 合并产物 crops.json（马档案+races+stats） | `build-data.py`，前端唯一数据源 |

**换比赛数据源**：`scripts/adapters/` 新增模块实现 `fetch() -> 契约B记录`，
`pull_races.py --adapter 新模块名`，下游零改动。契约被违反时 `test-data.py` 立即报错。

## 4. 数据源

| 数据 | 来源 | 说明 |
|---|---|---|
| 子嗣清单/基础信息 | **netkeiba 主源** | `list.html?sire_id=2017101835` 全量 404 匹 |
| 5代血统图 | **JBIS** | `/horse/{id}/pedigree/` 结构化 JSON，FNo/クロス |
| 比赛数据 | **Google Sheets 台账（人工维护，权威源）** | 逐场全字段（日付/場名/競走名/距離/馬場/結果/賞金/騎手…），中央+地方+海外；经 sheets_ledger 适配 |
| 自动建档 | 台账独有马（如 Grand Warrior） | aliases.json `action=create`，性別/生年由性齢推导 |
| 人工注释（译名/近况/血统分析/备考） | 管理页补录 | 下次全量抓取会覆盖事实字段 |

**已知限制**：
- JBIS 马名登记滞后、403 限流退避；netkeiba 数据截断以 netkeiba 为准（沿用既有处理）
- 海外赛事赏金未在台账记录 → 赏金合计 = 中央 + 地方
- 取消/除外不计入出赛数；中止计入
- 自动建档马无血统/基本信息（test-data 单独归类，不算失败）

## 5. 同步链路

```
定时（每天UTC 22:00）或 手动按钮：
    pull_races.py（拉台账→google_ledger.csv+sync-report）
  + [手动 all/single 才抓 netkeiba/JBIS]
  → build-data.py（契约A+契约B → crops.json + merge-report + 快照）
  → test-data.py（抽样 + 契约B/C 断言，失败则中止不发布）
  → commit & push → deploy.yml → Pages 自动更新
```

本地命令：

```
python scripts/pull_races.py                       # 比赛数据（快）
python scripts/scrape_netkeiba.py --all --sleep 1.0   # 马匹数据（重）
python scripts/scrape_jbis.py --all --sleep 1.2       # 血统（重）
python scripts/build-data.py --note "手动更新"
python scripts/test-data.py
```

## 6. 注意事项

- **契约分层是本项目地基**：任何新代码不得直接读数据源格式，必须走契约
- 管理页写入依赖浏览器 localStorage + GitHub API（纯静态无后端）
- 前端血统树父/母两列 × 5 代，G5 深代文字截断属正常
- 免责声明在页面 footer；许可证 CC BY-NC-SA 4.0
- 照片：hero 已留 4:5 占位，`photo` 字段 + `data/images/` 已预留（阶段4 做上传）
- 定时任务 60 天闲置会被 GitHub 暂停 → 手动 Run workflow 一次即恢复
