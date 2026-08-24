# 云迹 · 文档地图与数据分类总纲（唯一入口）

> 更新：2026-08-24（M5 crops v2 + 数据分类大盘落地后重写）
> 定位：**仓库文档唯一入口**。从这里出发找到一切。历史阶段性文档已归档删除（见 §5 清理清单）。
> 数据契约与数据源无关：换源只改适配器，下游零改动（详见 §2）。

---

## 0. 一句话概览

- **项目**：铁鸟翱天（コントレイル）产驹资料库 · GitHub Pages 静态站 · 个人检索/管理
- **站点**：`https://hinotoyk.github.io/yunji-web/page/`
- **仓库**：`github.com/hinotoyk/yunji-web`（branch main，Actions 自动部署）
- **当前数据状态**：407 匹 / 135 匹已出赛 / 405 血统 / crops.json v2（schema=crops/v2，含 facet 检索索引 + _meta.index 倒排表）

---

## 1. 文档导航（先读谁）

| 顺序 | 文档 | 回答什么问题 |
|---|---|---|
| 1 | **本文档** | 整个仓库怎么组织、数据怎么分类、从哪读起 |
| 2 | `docs/data-contracts.md` | 数据契约 A/B/C 精确定义、每层只消费契约、换源规则 |
| 3 | `docs/data-dashboard-v1.md` | **数据分类管理体系**（谁写谁读、写入权）+ crops v2 模块化 + 大盘设计 |
| 4 | `docs/data-funnel-v2.md` | 数据漏斗设计（身份层/収得計算/新马对账/比赛主源决策） |
| 5 | `docs/data-funnel-v2-exec.md` | 漏斗 v2 分步实施（M1~M5 已全部完成，DoD 已达成） |
| 6 | `docs/data-source-refactor.md` | 数据源调研结论 + netkeiba 血统解析算法 + 踩坑记录（技术权威） |
| 7 | `docs/session-handoff-2026-08-19-M2.md` | 最近一次交接快照（M2+M3 完成、M4 判定输入） |

> 快速操作（日常使用）：`README.md`（命令/结构）· `HANDOFF.md`（交接视角，⚠ 部分内容待随改名更新）。

---

## 2. 数据分类管理体系（速查）

> 完整版见 `docs/data-dashboard-v1.md` §1。**四类数据** + 写入权矩阵。

| 类别 | 文件 | 谁写 | 谁读 | 生命周期 |
|---|---|---|---|---|
| **A 抓取数据** | `data/raw/*.json` | 抓取器（唯一） | build-data（只读） | 每次抓取覆盖 |
| **B 身份数据** | `data/registry.json` | build-data（唯一） | build-data / admin | 只增不改（改名=names 追加） |
| **C 比赛数据** | `data/races/google_ledger.csv` + `data/raw/netkeiba_races.json` | pull_races/适配器 | build-data（只读） | 增量追加 |
| **D 展示数据** | `data/crops.json` + 拆分文件 | build-data + **admin（人工字段）** | 前端（只读） | 每次构建重建 |

**写入权红线**：
- 抓取器**禁止**回写 admin 字段；build-data **唯一**写 registry/crops；admin **只写人工字段**（译名/近况/血统分析/备考/馬名意味/photo），直接改 crops.json 覆盖（已拍板，不拆 notes.json——全量抓取覆盖人工字段是已知取舍）。

**契约 C 结构（M5 起）**：
```
data/crops.json = { _meta, index, horses[] }
  _meta:  schema=crops/v2 · built · count · sources · manifest
  index:  倒排表 {字段:{值:[id…]}}（性別/調教師/騎手/場名/格/血统祖先/登録状態…，带计数分面）
  horses: 每匹 = 基础信息 + stats + facet（检索索引）+ races_file/pedigree_file 引用
data/racefiles/{id}.json   该马比赛记录（详情页按需，仅建有内容的马 135 个）
data/pedigree/{id}.json    该马血统树+fno/cross（血统页按需，405 个）
```

---

## 3. 各保留文档要点总结

### 3.1 docs/data-contracts.md（核心契约）
- **契约A** raw/*.json：netkeiba 主（子嗣+基础+血统）+ JBIS 兜底/クロス增强
- **契约B** 比赛统一格式：`google_ledger.csv`（台账海外补缺/兜底）+ `netkeiba_races.json`（netkeiba 成绩页主源），字段/值域见文档
- **契约C** crops.json：前端唯一数据源；由 build-data.py 产出，**任何人不得手改自动字段**
- **校验**：test-data.py 全量断言，违反契约立即失败

### 3.2 docs/data-dashboard-v1.md（M5 设计，已实施）
- 数据分类四类 + 写入权矩阵（§1）
- crops v2 模块化：`{_meta, index, horses}` + racefiles/pedigree 拆分 + facet 四层查询 + `_meta.index` 倒排表（§2）
- 查询模型：模糊/强匹配·等值/强匹配·集合/数值范围（§3）
- 已拍板决策：**不做 notes.json**（admin 直接改 crops.json）、仅建有内容的拆分、大盘页本轮做、_meta.index 生成
- DoD 全部达成：crops 瘦身 -49%、test-data 全绿、前端零回归、大盘页可用

### 3.3 docs/data-funnel-v2.md（漏斗设计）
- 数据源决策：netkeiba 主源（子嗣/血统/成绩），JBIS 兜底
- 身份层：本地自增 id（registry），id 顺序=生年月日升序；改名=names 追加不产生新马
- 収得賞金（M4）：仅计中央、规则表计算（平地/障害），见 §4
- 新马发现：每日 `--new` 对账三态（新马/改名/消失）
- 双轨比赛：台账检测（7/30 天窗口）+ 轮换队列（50匹/天）

### 3.4 docs/data-funnel-v2-exec.md（实施记录，M1~M5 已完成）
- M1 身份层 registry + build-data 身份重构 ✅
- M2 比赛主源切 netkeiba + 骑手字典 + 本賞金 ✅
- M3 `--new` 对账 + 定时任务 ✅
- M4 収得計算 + 快照闸门 ✅
- **M5 crops v2 + 前端迁移 + 大盘 ✅（本次）**
- 铁律：每步独立可验证；改完立刻 `python scripts/test-data.py`

### 3.5 docs/data-source-refactor.md（技术权威）
- netkeiba 血统 DFS 先序 rowspan 解析算法（最大卡点）
- 深代格子 id 十六进制混淆处理（正则 `\w+`）
- 踩坑记录：EUC-JP 编码、限流退避、嵌套层级不一致误杀、禁止开发全量、stdout 二次包装幂等
- 覆盖矩阵 A/B/C 实测结论

### 3.6 docs/session-handoff-2026-08-19-M2.md（最近交接）
- M2+M3 完成记录；**待办输入**：札幌2歳S 本賞金 3100万 ≠ 设计 3000万（M4 已按规则计算，差异作为已知口径记录）
- 骑手截断全站 4 字、jockeys.json 103 全名
- 常用命令速查

### 3.7 技术记忆点（历史文档沉淀，防丢失）
> 这些事实分散在历史交接里，已被保留文档覆盖，但**结论值得留存**；已写入本文档备查。

**血统解析（data-source-refactor）**：
- netkeiba 血统表是 DFS 先序 rowspan 级联结构；深代格子 id 为十六进制混淆，正则需 `\w+`
- イリデの2025 是全库唯一无血统马（源站空白），非解析 bug

**抓取与构建经验**：
- **禁止开发全量**：`--ped --limit` 曾因未接 limit 误跑全量；每类抽样 2-3 匹（test-data 已固化）
- stdout 二次包装会 I/O 崩溃；包装需幂等（utf-8 时跳过）
- netkeiba 嵌套层级不一致曾误杀数据（全量事故教训）
- 风控 5-8s 档全量 ≈50min；JBIS 403 限流退避

**身份层（M1）**：
- id 语义 = 生年月日升序（最年长 = 1）；registry `names` 末位 = 当前名（改名 = names 追加，不产生新马）
- 占位名（`〇〇の2025`）不能作为身份匹配依据，必须走 nk_id

**本賞金（M2）**：
- 主公式 = 5着/0.10；备选 = 4着/0.15（已保留 `compute_honsho_prize` 回退）
- 札幌2歳S 实测 3100万 ≠ 设计 3000万（已知口径差异，M4 按实测计算）

---

## 4. 已删除的历史交接文档（2026-08-24 执行）

> 以下文档是**阶段性实现记录**，内容已被保留文档覆盖/取代，**不再被任何文档引用**。
> **已删除**（git rm，独立 commit 便于回滚）；如需考古可在 git 历史找回。

| 删除的文档 | 为何可删 |
|---|---|
| `docs/data-funnel.md` | v1 血缘树，已被 data-funnel-v2.md（下一版设计）取代 |
| `docs/session-handoff-2026-08-16.md` | 数据源 v2 实现记录，被 data-source-refactor(v2) + 契约/漏斗覆盖 |
| `docs/session-handoff-2026-08-17.md` | 阶段0-2 交接；"台账为权威源"结论已被 M2 推翻（netkeiba 主源） |
| `docs/session-handoff-2026-08-18.md` | 校验链+审核页阶段记录；主源方向已被 M2 替换 |
| `docs/session-handoff-2026-08-19.md` | 漏斗 M1 进度交接；实现已落地并被 exec 文档勾选 |
| `docs/design-race-verification.md` | 自认"待确认"设计稿；实际演进（netkeiba 主源+对账）偏离其预设，阶段已过 |

---

## 5. 清理清单（2026-08-24 已执行）

> ✅ **已执行**（本次会话）：6 篇历史交接文档已 git rm（§4），3 个本地临时报告已删除。
> 保留项与可选优化见下。

### 5.1 已删除：历史交接文档（git tracked）
> 共 6 篇，见 §4 表格。已用 `git rm` 删除并独立 commit；git 历史可随时找回。

### 5.2 已删除（本地临时产物，git 已忽略，不占仓库）
| 文件 | 说明 |
|---|---|
| `data/probe_race_report.md`（110KB） | ✅ 已删，历史探测报告，无消费方 |
| `data/probe_race_report_graded.md`（36KB） | ✅ 已删，同上 |
| `data/race-diffs-report.md`（1.2KB） | ✅ 已删，compare-races 每次重建 |

### 5.3 保留（勿删）
| 文件 | 说明 |
|---|---|
| `data/race-diffs.json` | **业务消费方**（page/review.html 读它），必须保留 |
| `data/merge-report.md` / `new-horses-report.md` / `sync-report.md` | 流水线产物，每次 build 重建 |
| `data/registry.json` / `jockeys.json` / `aliases.json` | 身份/骑手/别名数据，核心 |
| `history/*.json`（9 个） | 历史快照，manifest 自动滚动保留 ≤30 |

### 5.4 可选（需你拍板）
- `history/` 是否只保留最近 N 个快照（如 5 个）进一步瘦身？当前 9 个全被 manifest 引用，删除需同步 manifest。
- `data/raw/` 旧抓取文件是否清理？见 `docs/data-source-refactor.md` §9 已知限制。

---

## 6. 数据分类速查卡（新接手者 30 秒版）

```
抓取(raw/*.json) ──► 契约A
台账(csv)+成绩页(netkeiba_races.json) ──► 契约B
                        │
             build-data.py（唯一构建器）
                        ▼
        data/crops.json（契约C v2 = {_meta,index,horses}）
        ├── data/racefiles/{id}.json   （按需）
        └── data/pedigree/{id}.json    （按需）
                        │
             前端 page/*.html（只读）
             admin.html（写人工字段，直接改 crops.json）
```

**改数据流程**：改台账 → `python scripts/pull_races.py` → `python scripts/build-data.py` → `python scripts/test-data.py` → 提交。
**改代码流程**：改适配器/构建 → 跑 test-data → 本地 http.server 预览 → 提交。
