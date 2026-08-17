# 云迹 · 数据契约（Data Contracts）

> **核心原则：数据流通与数据源无关。**
> 每个环节只消费"契约格式"，绝不消费任何数据源的原始格式。
> 只要上一步能产出与契约一模一样的数据，下游流程就零改动。
> 数据源（或源站结构）如何变化，都只能影响"适配器/抓取器"这一层。

## 流水线总览

```
[源] netkeiba ──scrape_netkeiba.py──▶ data/raw/netkeiba.json ─┐
[源] JBIS     ──scrape_jbis.py──────▶ data/raw/jbis*.json    ─┤── 契约A
[源] Sheets   ──adapters/sheets_ledger.py──▶ 契约B记录 ──pull_races.py──▶ data/races/ledger.csv ─┤
                                                                                                  ▼
                                                          build-data.py（唯一构建器）──▶ data/crops.json（契约C）
                                                                                                  ▼
                                                          前端 index/detail/dashboard（只读 crops.json）
```

| 环节 | 消费 | 产出 |
|---|---|---|
| 抓取器（netkeiba/jbis） | 源站 HTML | 契约A：`data/raw/*.json` |
| 适配器（adapters/*） | 数据源格式（Sheets CSV 等） | 契约B 记录（内存） |
| `pull_races.py` | 契约B 记录（经适配器） | 契约B 快照：`data/races/ledger.csv` + `sync-report.md` |
| `build-data.py` | 契约A + 契约B | 契约C：`data/crops.json` + `merge-report.md` + 快照 |
| 前端 | 契约C（唯一数据源） | 页面 |

**更换数据源的唯一动作**：在 `scripts/adapters/` 新增一个模块，实现 `fetch() -> 契约B记录`，
然后 `python scripts/pull_races.py --adapter 新模块名`。`pull_races.py` 及以下全部零改动。

---

## 契约A：马匹基本数据（data/raw/*.json）

由抓取器产出，字段为规范化中文/日文标签（不是原始 HTML）：

| 字段 | 说明 |
|---|---|
| nk_id / jbis_id | 两站马匹 ID（至少一个） |
| 馬名 | 日文（或英文，海外马）登记名 |
| 性別 / 生年月日 / 毛色 / 産地 / 馬主 / 生産牧場 / 調教師 | 基础信息 |
| 通算成績 / 獲得賞金 / 総賞金 | 源站汇总（保留作交叉校验，展示以台账汇总为准） |
| 母名 / 母父名 / 生年 / 登録状態 | 血统关联信息 |
| pedigree / fno / cross | 5代血统图 / FNo / クロス |

合并规则（netkeiba 主、JBIS 辅）与字段语义以 `build-data.py` 为准。

## 契约B：比赛记录（data/races/ledger.csv）

适配器输出、`pull_races.py` 校验并落盘。**字段名必须与下表一致**，值可为字符串
（`racelib.coerce_record()` 负责类型化与值域校验）。

| 字段 | 类型 | 值域/说明 | 必填 |
|---|---|---|---|
| 日付 | str `YYYY-MM-DD` | 日期，适配器规范化 | ✔ |
| 場名 | str | 竞马场名（JRA/NAR/海外） | ✔ |
| R | str/int | 第 R 赛 | |
| 競走名 | str | 赛事名 | ✔ |
| 条件 | str | 如 2歳新馬 / 3歳未勝利 / 3歳OP | |
| 格 | str | 空 / GI / GII / GIII / L | |
| 距離 | int | 米 | |
| 馬場 | str | 芝 / ダート / AW | |
| 状態 | str | 良 / 稍重 / 重 / 不良 | |
| 天候 | str | 晴 / 曇 / 雨 等 | |
| 出走馬名 | str | 马名（关联主键） | ✔ |
| 騎手 / 性齢 / 斤量 / 頭数 / 人気 / 単勝 | 混合 | 性齢如 牡2；斤量/単勝 float | |
| 結果 | int 或 str | 1~18 或 中止/取消/除外/失格 | ✔ |
| タイム / 上り / 着差 / 増減 | str | | |
| 馬体重 | int | | |
| 賞金 | int | 円；海外/缺失为 0 | |
| Rt / 管理調教師 / 母父名 | 混合 | | |

派生字段（`racelib` 计算，随 ledger.csv 存储）：
- `venue_type`：中央（JRA）/ 地方（NAR）/ 海外（场名映射表在 `racelib.py`，可扩充）
- `race_class`：重賞 / リステッド / オープン / 条件・未勝利（由 格/条件 推导）

统计口径：取消/除外不计入出赛数；中止计入。

## 契约C：合并产物（data/crops.json）

前端唯一数据源。每匹马：契约A 全部字段 + `photo` + `races[]`（契约B 记录，按日付倒序）+ `stats`（`racelib.compute_stats()` 汇总）。结构示例见 `云迹项目.md` 3.3。

## 契约校验

- `python scripts/test-data.py`：抽样数据校验 + **契约B/契约C 全量断言**（必需字段、值域、stats 一致性）
- `python scripts/pull_races.py`：产出 `sync-report.md`（台账健康度）
- `python scripts/build-data.py`：产出 `merge-report.md`（马匹关联/覆盖/待校准）

数据源换了格式却违反契约 → 校验立刻报错（不静默）。
