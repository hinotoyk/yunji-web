# 云迹 · 项目总纲与数据知识库（唯一入口）

> 定位：**仓库文档唯一入口 + 数据知识总库**。全部阶段性与设计文档已完成使命并归档删除（见 §9），
> 本文档把散落在各文档中的**不可丢的硬知识**提炼留存：数据契约、数据分类、basic.json 结构、查询模型、
> 身份/収得/比赛主源设计、血统解析算法与踩坑、已拍板决策与遗留问题。
> 数据契约与数据源无关：换源只改适配器，下游零改动（详见 [data-contracts.md](data-contracts.md)）。

---

## 0. 项目概览

- **项目**：铁鸟翱天（コントレイル）产驹资料库 · GitHub Pages 静态站 · 个人检索
- **站点**：`https://hinotoyk.github.io/yunji-web/page/`
- **仓库**：`github.com/hinotoyk/yunji-web`（branch main，Actions 自动部署）
- **当前数据状态**：404 匹 / 141 匹已出赛 / 血统 403+2 / basic.json（schema=basic/v1 = {_meta,horses}；只含基本信息，检索索引已移除，待单独重建）

---

## 1. 文档导航（先读谁）

| 顺序 | 文档 | 回答什么问题 |
|---|---|---|
| 1 | **本文档** | 项目怎么组织、数据怎么分类、设计口径、技术要点、遗留问题 |
| 2 | `docs/data-contracts.md` | 数据契约 A/B/C 精确定义、每层只消费契约、换源规则（活文档，随字段改动更新） |

> 快速操作（日常使用）：`README.md`（命令/结构）· `HANDOFF.md`（交接视角）。

---

## 2. 数据分类管理体系（数据字典）

> 来源：原 data-dashboard-v1.md §1（M5 设计，已实施）。**四类数据** + 写入权矩阵。

| 类别 | 文件 | 谁写 | 谁读 | 生命周期 |
|---|---|---|---|---|
| **A. 抓取数据** | `data/raw/*.json` | 抓取器 | build-data（只读） | 每次抓取覆盖 |
| **B. 身份数据** | `data/registry.json` | build-data（唯一写方） | build-data / admin（只读） | 只增不改（改名=names 追加） |
| **C. 比赛数据** | `data/races/google_ledger.csv` + `data/raw/netkeiba_races.json` | pull_races / 适配器 | build-data（只读） | 增量追加 |
| **D. 展示数据** | `data/basic.json` + 拆分文件（含人工字段） | build-data（唯一）+ admin（人工字段） | 前端（只读） | 每次构建重建 |

**写入权红线**：
- 抓取器**禁止**回写 admin 字段；build-data **唯一**写 registry/basic.json；admin **只写人工字段**（译名/近况/血统分析/备考/馬名意味/photo），直接改 basic.json 覆盖。
- **已拍板：不拆 notes.json**——admin 直接改 basic.json，全量抓取覆盖人工字段是已知取舍。

### A. 抓取数据子类
- `netkeiba.json`（基础+血统，主）· `jbis.json`/`jbis_pedigree.json`（JBIS 兜底/クロス增强）· `netkeiba_races.json`（成绩页，比赛主源）· `rotation_queue.json`（Track B 轮换队列状态）· `fetch_log.csv`（抓取日志审计）
- **职责**：保存源站原始形态，含外部 id、占位名；**不承担身份职责**（身份 = registry）。

---

## 3. 数据契约速查

> 完整定义见 [data-contracts.md](data-contracts.md)（活文档，字段改动同步更新）。

- **核心原则**：数据流通与数据源无关；每层只消费契约格式；换源只改 `scripts/adapters/`，下游零改动。
- **契约A**（raw/*.json）：netkeiba 主（子嗣+基础+血统）+ JBIS 兜底/クロス增强。字段规范化中文/日文标签。
- **契约B**（比赛记录）：`google_ledger.csv`（台账）+ `netkeiba_races.json`（netkeiba 成绩页主源）。字段清单：
  `日付, 場名, R, レース名, 格, 距離, 芝ダ, 馬場, 天候, 出走馬名, 騎手, 性, 年齢, 斤量, 頭数, 人気, 単勝, 結果, タイム, 上り, 着差, 通過, ペース, 馬体重, 増減, 賞金, Rt, 調教師, venue_type, 來源`（`race_class/条件/性齢/管理調教師/母父名` 已舍弃）
- **契约C**（basic.json）：前端唯一数据源；由 build-data.py 产出，任何人不得手改自动字段。
- **校验**：test-data.py 全量断言，违反契约立即失败（不静默）。

**统计口径**（W2/D2 拍板）：出赛数/胜/率/赏金合计/重赏 **只计中央+地方**（与 netkeiba 通算对齐），海外场在 `場地別` 展示分面保留。取消/除外不计入出赛数；中止计入。

---

## 4. basic.json · 模块化结构

> 来源：原 data-dashboard-v1.md §2/§3（M5 设计，已实施）。**契约C 的唯一消费形态**。
> **2026-08 拍板**：检索索引（顶层 `index` 倒排表 + 每匹 `facet`）已从 basic.json 移除；
> 前端检索/筛选方案待后续单独设计，届时另行落地（当前 index 列表直接遍历 `horses`）。

### 4.1 文件布局

```
data/
├── basic.json              # 列表唯一入口（基本信息：无血统树、无 races/stats、无检索索引）
├── racefiles/{id}.json     # 该马比赛记录（详情页按需加载；仅建有内容的马）
├── pedigree/{id}.json      # 该马血统树 + fno/cross（血统页按需加载；仅建有内容的马）
└── images/                 # 图片（预留）
```

- **拆分原则 = 按"消费场景"拆，不按"匹马"拆**：首屏请求 = 1 个大文件 + 按需 2 个小文件，总量最优（GH Pages 静态托管请求数有成本）。
- **已拍板：仅建有内容的马**（无 races 不建 races 文件、无血统不建 pedigree 文件；basic.json 对应字段留空字符串）。

### 4.2 结构

```
basic.json = { _meta, horses[] }
  _meta:  schema=basic/v1 · built(yyyy-MM-dd HH:mm:ss) · count · sources（与快照解耦，无 manifest 引用）
  horses: 每匹 = 基本信息（BASIC_FIELDS 白名单，见 build-data.py）+ races_file/pedigree_file 引用
```

> 检索：暂无（索引已移除）。后续单独设计检索/筛选，不再往 basic.json 塞索引数据。

---

## 5. 数据漏斗核心设计（身份 / 収得 / 比赛主源）

> 来源：原 data-funnel-v2.md（设计，已全部实施）。

### 5.1 数据源决策（已拍板）

| 数据 | 主源 | 辅助/兜底 |
|---|---|---|
| 新马发现 | **netkeiba 産駒一覧**（唯一入口） | JBIS 産駒一覧（登记滞后，交叉核对） |
| 基础信息 | **netkeiba** | JBIS（netkeiba 无记录的马） |
| 血统（5代/FNo/クロス） | **netkeiba** | JBIS（兜底 + クロス 增强） |
| 比赛记录 | **netkeiba 成绩页** `/horse/result/{id}/` | Google Sheets 台账（海外补缺/兜底） |
| 収得賞金 | **计算**（规则表，不抓取） | JRA 页面值仅抽查校验 |
| 馬名意味 | admin 人工补录（JS token 机制，纯 requests 不可行） | — |

### 5.2 身份层（registry，M1）

- 外部 id（nk_id/jbis_id）是**属性**不是**身份**；身份 = 本地自增 id（`data/registry.json`）。
- **id 语义 = 出生日期顺序**：种子按 生年月日 升序分配（最年长 = 1）；此后新马一律 `max+1`。
- `names` 按时间顺序追加：**末位 = 当前名，其余 = 曾用名**（改名 = names 追加，不产生新马）。
- 身份解析顺序：`nk_id → jbis_id → (馬名, 生年)`；均未命中 → 新 id（max+1）。
- **占位名规则**：netkeiba `〇〇の2025`（正则 `の(19|20)\d{2}$`）/ JBIS `母名＿2025`（含 `＿`）。占位名**不能当身份匹配依据**，必须走 nk_id。
- **唯一性断言**（W1/D1 拍板，test-data）：去国家后缀后「同名同生年」全库唯一；同「(母名,生年)」全库唯一；nk_id 全库唯一。`racelib.strip_country_suffix()` 去 `(JPN)/(USA)/(GB)/(IRE)/(NZ)/(FR)/(AU)`。

### 5.3 収得賞金（M4，计算不抓取）

**规则表（已闭环：13 匹 JRA 真值逐匹复算：11 精确 + 2 达 98%）**，`racelib.py` 常量：

| 场次 | 収得 |
|---|---|
| 新馬/未勝利 1着 | **400万 固定** |
| 1勝クラス 1着 | **500万 固定** |
| 2勝クラス / オープン特別 1着 | **600万 固定** |
| 3勝クラス 1着 | **900万 固定** |
| 重賞(JG) 1着 | **本賞金×50%** |
| 条件戦/OP 2着 | **0** |
| 重賞(JG) 2着 | **2着本賞金×50%**（JRA：1/2着 各自对着順本賞金算半額） |
| 3着以下 | 0 |

- **仅计中央**（与 JRA 马页"含地方ダートグレード算入"口径不一致，已知边界）；海外/地方不计入；付加賞不计入。
- **本賞金字段 = 该马自己的着順本賞金**（M2.4 修正，2026-08-26）：中央/海外 走 SP 接口 `race.netkeiba.com/race/result.html?race_id={id}`；**地方（NAR）走 `nar.netkeiba.com/race/result.html?race_id={id}`**（NAR 格式 `本賞金:10000.0、3500.0、…万円` 十进制浮点+顿号，独立解析器 `parse_sp_honsho_nar`）。读 `1着,2着,3着…万円` 阶梯（付加賞-free），按该马 `着順` 取对应档位（1着→首值、2着→次值），故 2着 马存的是 **2着本賞金**。回退 = db 域成绩页该马自己的 賞金 行（best-effort，可能含付加賞）。
- **2歳重賞 GⅢ 例外**（已实现，2026-08-26）：JRA 表 2歳 GⅢ 収得 = **1着1600万 / 2着600万 固定**（非本賞金×50%）；2歳 GⅠ/GⅡ 与 3歳以上 一样 = 本賞金×50%。判定用**马龄**（比赛年份-生年==2）而非赛名（赛名可能不带"2歳"，如ファンタジーS）。
- **地方重賞 JpnI/II/III 収得**（`compute_shutoku_jpn`，独立方法，2026-08-26 用户定案）：并入 `stats.収得賞金` 的 `Jpn` 子桶（总収得 = 平地+障害+Jpn）。规则（万円）：**1着** 本賞金 ≥1200 → ×50%、400≤x<1200 → 400万、<400 → 全额；**2着** ≥480 → ×50%、160≤x<480 → 160万、<160 → 全额（边界用显式 >=/<，即 1200/480→顶部×50%、400/160→中档、<400/160→全额）。
- **2歳折半**：默认关（`HALVE_2YO=false`，13 匹拟合均未要求；2016 番組改正疑似废止该规则）。
- **校验闸门**：`test-data.py::shutoku_check` 常驻快照断言——库内 5 匹真值偏差 ≤10%，超限 CI 报错（阈值 2026-08-19 从 5% 放宽到 10%）。
- **已知差异**：ジーネキング 収得 现 = 1000万（2歳GⅢ 2着 600万 + 2歳未勝利 1着 400万；2026-08-26 修正 2着=2着本賞金×50% 后由旧 3000万口径归位）；リアライズシリウス 150万（库外不再校验）。

### 5.4 比赛记录：契约B 双适配器 + 增量双轨制

- **主源 = netkeiba 成绩页**（`adapters/netkeiba_races.py`），台账仅海外补缺/兜底（`adapters/sheets_ledger.py`）。每条记录带 `來源: "netkeiba" | "ledger"`。
- 合并键 `(日付, 場名, R)` 去重，netkeiba 优先；台账中央/地方记录由 netkeiba 覆盖丢弃。
- **海外场合并策略**：netkeiba 视为"可能没保存这场"——netkeiba 有该场 → netkeiba 优先，台账只补空缺字段（`OVERSEAS_FILL_FIELDS=["賞金"]`）；netkeiba 无该场 → 台账展示（來源=ledger）。netkeiba 海外场 R 常空 → 同 (日付,場名) 松散匹配。
- **增量双轨制**：
  - **Track A 台账辅助检测（快）**：台账有 netkeiba 尚缺的场次且比赛日在窗口内 → 抓该马；窗口中央/地方 7 天、海外 30 天（状态可重入）。
  - **Track B 轮换兜底（慢但全）**：循环队列 `rotation_queue.json`（全部有 nk_id 的马），每天取 head 起 50 匹抓全量，约 8 天一轮。
- **比赛记录一旦发生不再变化** → 只做增量，旧场次永不重抓。

### 5.5 骑手全名（M2.2，jockey_id 字典）

- netkeiba 对 5 字骑手名**全站截断为 4 字**（佐々木大輔→佐々木大），但链接 `jockey_id` 完整。
- 解法：解析时提取 `jockey_id` → `data/jockeys.json` = `{jockey_id: 全名}`（一次性抓完终身有效，当前 103 条）→ 构建时按 jockey_id 解析全名，永不误配。
- 比赛记录不记录 管理調教師（用户拍板）。

---

## 6. 技术要点与踩坑（血统解析 / 编码 / 限流）

> 来源：原 data-source-refactor.md（技术权威，会话 2026-08-14/16）。改这些代码前必读。

### 6.1 血统解析算法（最大卡点）

- **netkeiba 血统表是 rowspan 级联表，非普通三角表** → **DFS 先序重建**：文档序 = 先父系后母系递归，rowspan = 子树占行数（根 16 → 叶子 1），递归对半切行数，重建二叉树后 BFS 分层。
- **深代格子 id 混淆为十六进制**（`000a00033a`），名字/年份/毛色完好 → 正则 `\w+` 不跳过；前端不依赖节点 id，无影响。
- 未命名仔血统**全量 62 格**（早期探针被 decimal-only 正则骗了）。
- 每侧 5 层，层序 1+2+4+8+16=31 项；血统节点 `{name, sex, year, color, id}`。

### 6.2 编码与解析坑

| 坑 | 现象 | 解法 |
|---|---|---|
| netkeiba EUC-JP | 乱码 | `r.encoding = "euc-jp"` |
| 性別/毛色不在详情表 | `p.txt_01` = "現役　牝3歳　青鹿毛" | 正则 `(牡\|牝\|セン)` + 12 色枚举 + `(\d+)歳` |
| 列表母名/母父名带 `[ ]` | "アオイプリンセス [ ]" | `clean_cell()` 去 `[...]` |
| 详情表 th/td 非 dt/dd | 解析 0 字段 | 按 `tr>th/td` 遍历 |
| 调教师截断 | "大久保龍" vs JBIS "大久保龍志" | 源站差异，接受 netkeiba 为准 |
| JBIS 403 限流 | 约 200 请求后 Forbidden | fetch 退避 20s+15s×attempt；仍失败 ⚠ 跳过 |
| 同名异马 | ノートルダム 搜到别马 | 校验血统父侧 G1=コントレイル |
| 前端 esc(undefined) | 无调教师马渲染崩溃 | `esc` 加 `s??""` 防护 |

### 6.3 流程纪律

- **禁止开发全量**：`--ped --limit` 曾因未接 limit 误跑全量；每类抽样 2-3 匹（test-data 已固化）。全量由人工触发（Actions 按钮或本地命令行）。
- **stdout 二次包装幂等**：测试脚本 import 抓取脚本时 `I/O operation on closed file` → TextIOWrapper 被 GC 关共享 buffer；包装需幂等（已是 utf-8 则跳过）。
- netkeiba 嵌套层级不一致曾误杀数据（全量事故教训）。
- 风控：5-8s 档全量 ≈50min；JBIS 限流 sleep ≥1.2s。
- **イリデの2025**：netkeiba 血统页源站空白，全库唯一无血统马（非解析 bug）。

---

## 7. 业务决策（已拍板）与遗留问题

> 来源：原 business-review-2026-08-24.md + biz-review-solution-2026-08-24.md（2026-08-24 会话）。

### 7.1 已拍板决策 D0~D8

| # | 决策 | 状态 |
|---|---|---|
| D0 | **新马入口唯一 = netkeiba 産駒一覧**（`--new`）；JBIS 功能保留但不再发现新马；台账**彻底禁止自动建档**（移除 aliases `action=create`） | ✅ 已实施 |
| D1 | Grand Warrior 三合一：幸存 netkeiba 实体 id=113（改名 Grand Warrior），并入 id=1 的 7 场海外赛 + id=112 的 jbis_id/クロス，删 id=1/112 | ✅ 已实施 |
| D2 | 出赛数/胜率**只计中央+地方**，海外单列 | ✅ 已实施（stats 口径） |
| D3 | 契约B 字段规范一次性全量实施（字段清单见 §3） | ✅ 已实施 |
| D4 | 待探索抓取项（英文名 / セリ取引価格 / netkeiba クロス）**全纳入** | ⏳ 见 §7.2 |
| D5 | 补全 workflow：每日 `--new`+`--races`、每周 `--ped`+`--fill` | ✅ 已实施（update-data.yml） |
| D6 | 海外马 通算成績/獲得賞金：先记录，暂时不处理 | ⏳ |
| D7 | `race_class` 彻底舍弃；前端按 race_class 的过滤暂缓 | ✅ 已实施 |
| D8 | Grand Warrior 迁移完成后清空全部历史数据（history/*.json + manifest 版本） | ✅ 已实施（当前 history 为空） |

### 7.2 遗留 / 待探索项

- **W4 待探索抓取项**（D4，2026-08 探索闭环）：
  - ① **本马英文名** ✅：来源 = netkeiba 详情页 `p.eng_name`（实测：スウィーティーベル→Sweetie Belle、ヴァンドレスト→Vent de l'Est）。`parse_detail` 已实现。**待回刷**：现有 404 匹历史记录缺 `英文名`/`セリ取引価格` 键。
  - ② **セリ取引価格** ✅：来源 = netkeiba 详情表「セリ取引価格」行（无拍卖记录 = `-`）。`parse_detail` 已实现。待定：`-` 是否归一空串（与クロス `なし`→`""` 同口径）。
  - ③ **netkeiba クロス** ✅（规则已解码并实现到 `parse_pedigree`）：`div.blood_cross` 隐藏字段 `input[name]=F/M路径`（每次出现一个），name 每字符 = 从本马往回一代，F=父系、M=母系；**首字符定侧**（F→S、M→M）、**长度=世代数**（FFF→S3、MFFF→M4、FMFMF→S5）。**表格 `N x N` 不编码侧向**（"5 x 5" 可能两次都在母侧，如 Danzig→M5×M5），必须用隐藏字段。转换：按祖先分组路径 → (侧, 世代) → 按 (世代升序, S<M) 排序 → `×` 连接 → JBIS 风格 `{名} ：S4×M4 ...`。验证：JBIS 侧 178/178 匹、591/591 段 100% 与血统树一致；netkeiba 实测 5 例（S3×M4 / M5×M5 / M4×S5 / S5×M5×M5 / M4×S5×M5）逐字对齐；无クロス（"なし"）→ 空串。百分比 = Σ(1/2)^世代，JBIS 不显示故转换时舍弃。
- **収得口径边界**：仅中央，不含地方ダートグレード；若日后要把 Jpn 算入需另行实现规则。2歳重賞 GⅢ 固定额已实现（见 §5.3）。
- **P5 低优先**：JBIS-only 马 母名/母父名缺失（parse_detail 未提取）；跨源血统命名不一致（netkeiba 无后缀 vs JBIS 带 `(USA)` → 血统祖先集合不一致；クロス名同样无/有后缀，可用 JBIS 血统树节点作后缀来源对齐）；赏金微量差（付加賞/四舍五入口径）。
- **数据缺口**：`data/raw/` 旧抓取文件是否清理待定；W4 新字段（英文名/セリ/结构化クロス）待一次全量回刷（详情页 + 血统页，约 800 请求 × ~6.5s ≈ 90 分钟）。

---

## 8. 数据分类速查卡（新接手者 30 秒版）

```
抓取(raw/*.json) ──► 契约A
台账(csv)+成绩页(netkeiba_races.json) ──► 契约B
                        │
             build-data.py（唯一构建器）
                        ▼
        data/basic.json（契约C = {_meta,horses}，基本信息）
        ├── data/racefiles/{id}.json   （按需）
        └── data/pedigree/{id}.json    （按需）
                        │
             前端 page/*.html（只读，index + pedigree）
```

**改数据流程**：改台账 → `python scripts/pull_races.py` → `python scripts/build-data.py` → `python scripts/test-data.py` → 提交。
**改代码流程**：改适配器/构建 → 跑 test-data → 本地 http.server 预览 → 提交。

---

## 9. 文档清理记录

### 9.1 保留（勿删）

- `docs/data-contracts.md`（契约活文档，随字段改动更新）
- `data/merge-report.md` / `new-horses-report.md` / `sync-report.md`（流水线产物，每次 build 重建）
- `data/registry.json` / `jockeys.json` / `aliases.json`（身份/骑手/别名数据，核心）
- `history/*.json`（历史快照，manifest 自动滚动保留 ≤30，当前 3 个；前端 index 已不再展示，后续单独做历史查阅页）
