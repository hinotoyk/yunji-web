# yunji-web · 云迹

铁鸟翱天（コントレイル）产驹资料库 · GitHub Pages 静态站，供个人查阅检索。

## 在线访问

`https://hinotoyk.github.io/yunji-web/page/`

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000/page/preview.html （比赛数据预览页）
```

## 数据源（契约分层，与数据源无关）

> 数据流通与数据源无关：每层只消费契约格式，换数据源只改适配器，其余零改动。
> 详见 [`docs/data-contracts.md`](docs/data-contracts.md)。

| 数据 | 来源 | 契约 | 说明 |
|---|---|---|---|
| 子嗣清单/基础信息 | netkeiba（主源） | 契约A `data/raw/netkeiba.json` | `horse/list.html?sire_id=2017101835` 全量 400+ 匹 |
| 血统数据 | JBIS（辅） | 契约A `data/raw/jbis*.json` | 5代血统图 + FNo/クロス |
| 比赛数据 | netkeiba 成绩页（主源，M2）+ Google Sheets 台账（海外补缺/兜底） | 契约B `data/races/google_ledger.csv` + `data/raw/netkeiba_races.json` | 中央+地方+海外统一契约B；台账经 `scripts/adapters/sheets_ledger.py` 适配 |
| 马匹身份 | registry 映射表（M1） | `data/registry.json` | 本地自增 id + 外部键(nk_id/jbis_id)映射 + 名字历史 |
| 合并产物 | build-data.py | 契约C `data/crops.json` | 前端唯一数据源 |
| 图片 | 用户自己上传（预留） | `photo` 字段 + `data/images/` | 管理页上传（阶段4） |

## 同步链路（定时自动 + 手动兜底）

**定时自动**：GitHub Actions `schedule`，每天 UTC 22:00（JST 07:00）自动执行：
新马对账 `--new` → 成绩增量 `--races`（双轨制：台账检测 7/30 天 + 轮换 50匹/天）→
台账 `pull_races.py` → `build-data.py`（重建）→ `test-data.py`（契约校验）→ 提交 → 自动部署；
每周补跑血统空洞重试 `--ped` + JBIS 兜底 `--fill`。
（注意：仓库闲置 60 天定时任务会被 GitHub 暂停，届时手动 Run workflow 一次即恢复。）

**手动按钮**：Actions 页 → **Sync yunji data** → Run workflow，三种模式：
- `races`：只拉比赛台账 + 重建（快，默认）
- `all`：netkeiba 全量 + JBIS 血统 + 台账 + 重建（重，慎用）
- `single` + 马名：只更新某一匹

本地手动跑：

```bash
python scripts/pull_races.py                       # 契约B：拉台账 → data/races/google_ledger.csv + sync-report.md
python scripts/scrape_netkeiba.py --new            # 契约A：新马对账（每日增量，自动建档/改名）
python scripts/scrape_netkeiba.py --races          # 契约B：成绩页双轨制增量（主源）
python scripts/scrape_netkeiba.py --all            # 契约A：netkeiba 全部子嗣 + 基础信息（全量，慎用）
python scripts/scrape_jbis.py --all                # 契约A：JBIS 5代血统图
python scripts/build-data.py --note "备注"         # 契约A+契约B → crops.json + merge-report.md + 快照
python scripts/test-data.py                        # 抽样 + 契约B/C 全量校验
```

换比赛数据源：在 `scripts/adapters/` 新增模块实现 `fetch()` 输出契约B字段，然后
`python scripts/pull_races.py --adapter 新模块名`，下游零改动。

## 结构

```
data/
├── crops.json         站点数据（契约C，由构建脚本生成，勿手改）
├── registry.json      马匹身份映射表（本地 id + 外部键 + 名字历史，M1）
├── jockeys.json       骑手 ID → 全名 字典（解决 netkeiba 截断）
├── raw/               抓取原始数据（契约A：netkeiba.json / jbis*.json / netkeiba_races.json / rotation_queue.json / fetch_log.csv）
├── races/google_ledger.csv   比赛台账快照（契约B，海外补缺/兜底源）
├── aliases.json       马名别名表（映射/自动建档控制）
├── sync-report.md     台账健康度报告
├── merge-report.md    马匹关联/覆盖/待校准报告
├── manifest.json      版本清单
├── images/            图片目录（预留）
history/               历史版本快照（最多 30 个）
page/
├── index.html         主从分栏 SPA（列表 + 详情）
├── detail.html        独立详情页（hash 深链接）
├── preview.html       比赛数据临时预览页（核验用）
└── admin.html         数据管理页（可补录人工字段）
scripts/
├── adapters/          数据源适配器（当前：sheets_ledger.py / netkeiba_races.py）
├── racelib.py         比赛域公共逻辑（契约B：校验/推导/汇总/収得，与源无关）
├── pull_races.py      比赛流水线（适配器 → 契约B → google_ledger.csv）
├── scrape_netkeiba.py netkeiba 抓取（--new 对账 / --races 增量 / --all / --horse / --name）
├── scrape_jbis.py     JBIS 血统抓取（--all / --horse / --fill）
├── build-data.py      唯一构建器（契约A + 契约B + registry → crops.json）
├── build_registry.py  身份映射表种子生成（M1，一次性）
├── build_jockeys.py   骑手字典构建（M2，一次性）
└── test-data.py       抽样 + 契约校验
docs/
└── data-contracts.md  数据契约定义（A/B/C + 换源规则）
```

## 数据说明

- 数据仅供分享交流，严禁用于任何违法行为
- 比赛记录以 netkeiba 成绩页为主源；Google Sheets 台账仅用于海外场补缺/兜底（海外赛事赏金未在台账记录，赏金合计 = 中央 + 地方）
- 取消/除外不计入出赛数；中止计入
- 収得賞金（平地/障害）由 racelib 规则表计算（M4），仅计中央，口径见 `docs/data-funnel-v2.md` §4
- 自动建档马（如 Grand Warrior）由台账生成，基本信息待补

License: CC BY-NC-SA 4.0
