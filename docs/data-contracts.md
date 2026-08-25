# 云迹 · 数据契约（Data Contracts）

> **核心原则：数据流通与数据源无关。**
> 每个环节只消费"契约格式"，绝不消费任何数据源的原始格式。
> 只要上一步能产出与契约一模一样的数据，下游流程就零改动。
> 数据源（或源站结构）如何变化，都只能影响"适配器/抓取器"这一层。

## 流水线总览

```
[源] netkeiba ──scrape_netkeiba.py──▶ data/raw/netkeiba.json ─┐
[源] JBIS     ──scrape_jbis.py──────▶ data/raw/jbis*.json    ─┤── 契约A
[源] Sheets   ──adapters/sheets_ledger.py──▶ 契约B记录 ──pull_races.py──▶ data/races/google_ledger.csv ─┤
                                                                                                  ▼
                                                          build-data.py（唯一构建器）──▶ data/basic.json（契约C）
                                                                                                  ▼
                                                          前端 index/detail/dashboard（只读 basic.json）
```

| 环节 | 消费 | 产出 |
|---|---|---|
| 抓取器（netkeiba/jbis） | 源站 HTML | 契约A：`data/raw/*.json` |
| 适配器（adapters/*） | 数据源格式（Sheets CSV 等） | 契约B 记录（内存） |
| `pull_races.py` | 契约B 记录（经适配器） | 契约B 快照：`data/races/google_ledger.csv` + `sync-report.md` |
| `build-data.py` | 契约A + 契约B | 契约C：`data/basic.json` + `merge-report.md` + 快照 |
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

## 契约B：比赛记录（data/races/google_ledger.csv + data/raw/netkeiba_races.json）

适配器输出、`pull_races.py` 校验并落盘。**字段名必须与下表一致**，值可为字符串
（`racelib.coerce_record()` 负责类型化与值域校验）。字段清单见 W3/D3（2026-08-24 业务梳理）；
`race_class / 条件 / 性齢 / 管理調教師 / 母父名` 已舍弃。

| 字段 | 类型 | 值域/说明 | 必填 |
|---|---|---|---|
| 日付 | str `YYYY-MM-DD` | 日期，适配器规范化 | ✔ |
| 場名 | str | 竞马场名（JRA/NAR/海外） | ✔ |
| R | str/int | 第 R 赛 | |
| レース名 | str | 赛事名（台账 競走名 / netkeiba レース名） | ✔ |
| 格 | str | 空 / GI / GII / GIII / JpnI / JpnII / JpnIII / L / OP / JGI / JGII / JGIII | |
| 距離 | int | 米 | |
| 芝ダ | str | 芝 / ダ / 障 / AW（台账 ダート→ダ、障害→障） | |
| 馬場 | str | 状态：良 / 稍重 / 重 / 不良 / Fast / Firm 等 | |
| 天候 | str | 晴 / 曇 / 雨 等 | |
| 出走馬名 | str | 马名（关联主键） | ✔ |
| 騎手 / 斤量 / 頭数 / 人気 / 単勝 | 混合 | 斤量保持字符串（如 55.0 / 121lb）；単勝 缺失为 空 | |
| 性 | str | 牡 / 牝 / セ（台账 性齢 首字；netkeiba 由档案 性別 补全） | |
| 年齢 | str | 周岁（按生年月日 + 比赛日实时计算；无生年月日用台账性齢） | |
| 結果 | int 或 str | 1~18 或 中止/取消/除外/失格 | ✔ |
| タイム / 上り / 着差 / 通過 / ペース / 増減 | str | | |
| 馬体重 | int | | |
| 賞金 | int 或 空 | 円；海外/缺失 → 空字符串（非 0） | |
| Rt / 調教師 | 混合 | 台账源自带；netkeiba 源由档案 調教師 补全 | |

派生字段（`racelib` 计算，随 google_ledger.csv 存储）：
- `venue_type`：中央（JRA）/ 地方（NAR）/ 海外（场名映射表在 `racelib.py`，可扩充）
- `來源`：`netkeiba` / `ledger`（netkeiba 为主源，台账海外补缺）

统计口径（W2/D2）：出赛数/胜/率/赏金合计/重赏 只计 中央+地方，与 netkeiba 通算对齐；
海外场在 `場地別` 等展示分面保留。取消/除外不计入出赛数；中止计入。

## 契约C：合并产物（data/basic.json）

前端唯一数据源。`{_meta, horses[]}`；`_meta` = `schema: basic/v1` · `built: yyyy-MM-dd HH:mm:ss` · count · sources（与快照解耦，不写 manifest 引用；快照由 `data/manifest.json` 登记）。
每匹只含基本信息（`BASIC_FIELDS` 白名单，见 `build-data.py`）：id / nk_id / jbis_id / 馬名 / 性別 / 生年月日 / 毛色 / 産地 /
馬主 / 生産牧場 / 調教師 / 通算成績 / 獲得賞金 / 総賞金 / 母名 / 母父名 / 生年 / 登録状態 / 英文名 / セリ取引価格 / photo +
拆分文件引用 `races_file` / `pedigree_file`（详情经拆分文件按需加载）。`races/stats/血统树` 不再内嵌。

## 契约校验

- `python scripts/test-data.py`：抽样数据校验 + **契约B/契约C 全量断言**（必需字段、值域、拆分文件引用、basic.json 结构）
- `python scripts/pull_races.py`：产出 `sync-report.md`（台账健康度）
- `python scripts/build-data.py`：产出 `merge-report.md`（马匹关联/覆盖/待校准）

数据源换了格式却违反契约 → 校验立刻报错（不静默）。
