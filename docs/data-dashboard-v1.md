# 数据大盘 v1 · 设计文档（数据分类管理 + crops 模块化）

> 日期：2026-08-24 · 状态：**设计定稿，已拍板**（数据分类 / 模块化 / 大盘 / notes 决策）
> 定位：`data-funnel-v2.md` 的 **M5 细化版**（crops.json v2 + 数据分类 + 大盘）。
> 前置：M1~M4 已完成（身份层 / 比赛主源 netkeiba / 骑手字典 / 収得計算 / 新马对账）。
> 关联：[data-contracts.md](data-contracts.md) · [data-funnel-v2.md](data-funnel-v2.md) · [data-funnel-v2-exec.md](data-funnel-v2-exec.md)
> 本文档回答两个问题：**① 数据怎么分类管理（谁写谁读、归属、口径）；② crops.json 怎么模块化（唯一数据源拆分）。**

---

## 0. 变更摘要（当前 → 本方案）

| 维度 | 当前（v1） | 本方案（v2） |
|---|---|---|
| crops.json 顶层 | 裸数组（407 匹） | `{_meta, horses[]}` + schema 版本号 |
| 检索 | 前端线性扫 4MB | **facet 预计算检索索引**（模糊/强匹配/集合/数值四层） |
| 比赛记录 | 内嵌 races[]（MB 级，详情/列表同付） | **拆 `data/racefiles/{id}.json` 按需加载**（`data/races/` 已被台账 csv 占用） |
| 血统树 | 内嵌 5 代树（62 节点×407） | **拆 `data/pedigree/{id}.json` 按需加载** |
| 人工字段 | 管理页写 crops.json（会被全量抓取覆盖） | **沿用 v1：admin 直接改 crops.json 覆盖**（已拍板，不拆 notes.json） |
| 大盘 | 无 | 带计数的分面导航 + 汇总指标（`_meta.index` 倒排表） |

**核心原则不变**：crops.json 仍是前端唯一数据源（语义层）；拆分只发生在"文件布局"层，契约C 的每匹档案结构不破坏（`_meta.schema` 版本化向前兼容）。

---

## 1. 数据分类管理体系（数据字典）

### 1.1 分类总览：四类数据（已拍板：人工字段并入展示数据，不独立）

| 类别 | 文件 | 谁写 | 谁读 | 生命周期 |
|---|---|---|---|---|
| **A. 抓取数据** | `data/raw/*.json` | 抓取器 | build-data（只读） | 每次抓取覆盖 |
| **B. 身份数据** | `data/registry.json` | build-data（唯一写方） | build-data / admin（只读） | 只增不改（改名=追加 names） |
| **C. 比赛数据** | `google_ledger.csv` + `netkeiba_races.json` | pull_races / 适配器 | build-data（只读） | 增量追加 |
| **D. 展示数据** | `data/crops.json` + 拆分文件（**含人工字段**） | build-data（唯一写方）+ **admin（人工字段）** | 前端（只读） | 每次构建重建；人工字段 admin 覆盖 |

### 1.2 每类数据详细口径

#### A. 抓取数据（契约A 源形）
- **职责**：保存源站原始形态，含外部 id、占位名；**不承担身份职责**（身份 = registry）。
- 子类：
  - `netkeiba.json`（基础信息 + 血统，主）
  - `jbis.json` / `jbis_pedigree.json`（JBIS 兜底）
  - `netkeiba_races.json`（成绩页抓取，比赛主源）
  - `rotation_queue.json`（Track B 轮换队列，状态文件）
  - `fetch_log.csv`（抓取日志，审计）
- **写入方唯一**：对应抓取器/适配器。**禁止** admin / build-data 回写。

#### B. 身份数据（registry.json）
- **职责**：本地自增 id（身份）+ 外部键（nk_id/jbis_id，属性）+ 名字历史（names[]，末位=当前名）。
- **写入方唯一**：`build-data.py::resolve_identity`（M1 起）。`build_registry.py` 只负责一次性种子，**不常驻**。
- 语义：改名不是新马（nk_id 命中同一 id，names 追加）；占位名不能当身份匹配依据。

#### C. 比赛数据（契约B）
- `google_ledger.csv`：Google Sheets 台账快照。**主源已切 netkeiba**，台账仅海外补缺/兜底 + Track A 检测信号。
- `netkeiba_races.json`：netkeiba 成绩页抓取（主源），含 race_id / jockey_id / 本賞金 / 來源。
- **写入方唯一**：pull_races.py / adapters。build-data 只读并合并。

#### D. 展示数据（crops.json v2 + 拆分 + 人工字段）
- **唯一写方（自动部分）**：build-data.py。任何人不得手改自动生成字段。
- **人工字段（译名/近况/血统分析/备考/馬名意味/photo）**：admin 页直接改 **crops.json** 并覆盖（浏览器 → GitHub API 写 crops.json，沿用 v1 模式）。**已拍板：不拆 notes.json**——改动直接生效，全量抓取后人工字段可能被抓取值覆盖（已知取舍，与 v1 一致）。
- 顶层 `{_meta, horses[]}` + `_meta.schema` 版本号（`crops/v2`），前端按版本兼容。

### 1.3 写入权矩阵（防覆盖总表）

| 字段/数据 | 抓取器 | build-data | admin |
|---|---|---|---|
| 基础信息（性別/生年/毛色…） | ✔ 写 raw | ✔ 合并 | ✗（只读展示） |
| 血统（pedigree/fno/cross） | ✔ 写 raw | ✔ 合并 | ✗ |
| 比赛记录（races） | ✔ 写契约B | ✔ 合并 | ✗（改台账） |
| 身份（id/keys/names） | ✗ | ✔ 唯一写方 | ✗ |
| **人工注释（译名/近况/备考/馬名意味/photo）** | ✗ | ✔ 保留（admin 写的值） | **✔ 直接写 crops.json** |

---

## 2. crops.json v2 · 模块化设计

### 2.1 文件布局总览

```
data/
├── crops.json              # 列表/大盘/检索唯一入口（瘦身版：无血统树、无 races）
├── racefiles/{id}.json     # 该马比赛记录（详情页按需加载；仅建有内容的马；data/races/ 已被台账 csv 占用）
├── pedigree/{id}.json      # 该马血统树 + fno/cross（血统页/详情页按需加载；仅建有内容的马）
└── images/                 # 图片（预留）
```

> **为什么这样拆而不拆成 400+ 全量小文件？**
> GitHub Pages 是静态托管，**请求数有成本**。407 匹 × N 文件 = 上千请求 → 反而更慢。
> 拆分原则 = **按"消费场景"拆，不按"匹马"拆**：列表/大盘只需要瘦身 crops；只有进详情页才需要 races/血统。这样首屏请求 = 1 个大文件 + 按需 2 个小文件，总量最优。
> **已拍板：仅建有内容的马**（无 races 不建 races 文件、无血统不建 pedigree 文件；crops 里对应字段留空字符串）。

### 2.2 crops.json v2 结构

```json
{
  "_meta": {
    "schema": "crops/v2",
    "built": "2026-08-24T07:00:00+09:00",
    "count": 407,
    "sources": { "netkeiba": "2026-08-24", "jbis": "2026-08-20", "ledger": "2026-08-24" },
    "manifest": "20260824_0700"
  },
  "index": {
    "性別": { "牝": [2, 5, ...], "牡": [...], "セ": [...] },
    "調教師": { "田中克典": [2, ...], ... },
    "騎手": { "北村友一": [2, ...], ... },
    "場名": { "札幌": [2, ...], ... },
    "格": { "GI": [...], ... },
    "主要場地": { "中央": [...], "地方": [...], "海外": [...] },
    "登録状態": { "現役": [...], ... }
  },
  "horses": [
    {
      "id": 2,
      "nk_id": "2023100938", "jbis_id": "0001375379",
      "馬名": "スウィーティーベル", "曾用名": [],
      "译名": "", "近况": "", "血统分析": "", "备考": "", "馬名意味": "", "photo": "",
      "性別": "牝", "生年": "2023", "生年月日": "2023年1月23日", "毛色": "青鹿毛",
      "産地": "日高町", "馬主": "", "生産牧場": "下河辺牧場", "調教師": "田中克典 (栗東)",
      "登録状態": "現役",
      "fno": "F9-f", "cross": "Halo(USA) ：S4×M4",
      "stats": { /* 同 v1：出赛/胜率/賞金/収得/距离分布… 数值供范围过滤 */ },
      "facet": {
        "search_text": "スウィーティーベル 下河辺牧場 田中克典 北村友一 浜中俊 札幌 京都 阪神 メイクデビュー …",
        "馬名": "スウィーティーベル", "曾用名": [],
        "性別": "牝", "生年": "2023", "登録状態": "現役",
        "調教師": "田中克典", "馬主": "", "生産牧場": "下河辺牧場",
        "騎手": ["北村友一", "浜中俊"], "場名": ["札幌", "京都", "阪神"], "格": [],
        "血统祖先": ["コントレイル", "Northern Dancer", "Mr. Prospector", "…"],
        "has_races": true, "has_win": false, "has_graded_win": false,
        "主要場地": ["中央"], "有地方": false, "有海外": false,
        "fno": "F9-f"
      },
      "race_count": 7,
      "races_file": "data/races/2.json",
      "pedigree_file": "data/pedigree/2.json"
    }
  ]
}
```

### 2.3 拆分文件结构

**`data/racefiles/{id}.json`**（详情页按需）：
```json
{ "id": 2, "馬名": "スウィーティーベル", "races": [ /* 契约B 记录，日付倒序，带 來源 */ ] }
```

**`data/pedigree/{id}.json`**（血统页按需）：
```json
{ "id": 2, "馬名": "スウィーティーベル", "pedigree": { "父": [[…]], "母": [[…]] }, "fno": "F9-f", "cross": "…" }
```

### 2.4 设计决策记录

| 决策 | 理由 |
|---|---|
| 顶层 `{_meta, horses}` | schema 版本化，前端按版本兼容；未来字段演进有据 |
| facet 预计算进每匹 | 检索 O(1)，前端零归一化逻辑；407 匹扫描已够快 |
| `_meta.index` 倒排表 **本轮做** | 带计数的分面导航需要（已拍板），`{字段:{值:[id…]}}`，per-horse facet 不变 |
| races / pedigree 按 id 拆文件 | 首屏瘦身（4MB → ~600KB），详情按需；将来数据暴涨可增量加载；**仅建有内容**（已拍板） |
| 人工字段沿用 v1（admin 直接改 crops.json） | **已拍板**：改动即时生效、结构简单；全量抓取覆盖人工字段是已知取舍 |
| 图片 `photo` 字段 + `data/images/` | 阶段4 做上传；字段已预留 |

---

## 3. 查询模型（三层：模糊 / 强匹配 / 数值范围）

### 3.1 分层定义

| 层 | 数据 | 匹配方式 | 例子 |
|---|---|---|---|
| 模糊全文 | `facet.search_text`（全字段拼接） | 小写 substring | "ドバイ" → 跑过迪拜；"メイクデビュー" → 出道战 |
| 强匹配·等值 | `馬名`/`曾用名`/`性別`/`生年`/`登録状態`/`調教師`/`馬主`/`生産牧場`/`fno` | `===` | 調教師 = 田中克典 |
| 强匹配·集合成员 | `騎手`/`場名`/`格`/`血统祖先`/`主要場地` | `Array.includes` | 血统祖先含 Northern Dancer |
| 数值范围 | `stats` 数值字段（賞金合計/収得/出賽数/勝…） | 比较运算 | 賞金合計 ≥ 1亿 |

### 3.2 规则

1. **归一化在构建时做一次**：facet 所有字符串 NFKC + 去全半角空白 + toLowerCase；前端只做朴素 `===`/`includes`，零归一化逻辑。原始展示值保留在马档案顶层。
2. **搜索两段式**：输入 q → 先对 `馬名`/`曾用名` 精确等值（命中置顶），再 search_text 模糊——"レッドスカイ"精确命中自己，不被血统里的"スカイ"淹没。
3. **数组字段 = 集合语义**（去重成员），不做子串；含任一/含全部由前端决定。
4. **人工字段只进 search_text**，不做强匹配（值不稳定、非枚举）。
5. **比赛属性过滤**（距離/馬場/状態）量小，前端直接扫该马 races；大盘需要时把去重集合加进 facet（设计留口子）。
6. **姓名字段**（骑手/调教师/马主）在契约B 层已全名归一化（M2.5），facet 数组值直接用全名。

---

## 4. 实施步骤（里程碑）

### M5.1 输出结构 `{_meta, horses}`（纯 build-data 改动，数据不动）

**做什么**：build-data 输出顶层从裸数组 → `{_meta, horses[]}`。
**改动**：`scripts/build-data.py` 输出段；新增 `_meta`（schema/built/count/sources/manifest）。
**验证**：`python scripts/build-data.py --no-snapshot` → `python -c "读取 _meta.schema=='crops/v2'"`；test-data 相应更新读取入口。

### M5.2 facet + `_meta.index` 生成（racelib `build_facet`）

**做什么**：每匹生成 facet（检索索引）；血统祖先 = 5 代树 62 节点扁平化去重；`_meta.index` 倒排表（带计数分面导航）。
**改动**：
- `scripts/racelib.py` 新增 `build_facet(h)`：search_text + 强匹配 + 集合 + 布尔。
- `scripts/build-data.py` 调用写入每匹 facet；构建 `_meta.index`（`{字段:{值:[id…]}}`，字段 = 性別/調教師/騎手/場名/格/主要場地/登録状態 等枚举）。
**验证**：`python -c` 抽查一匹：search_text 含曾用名；血统祖先含 Northern Dancer；值全小写无全角空格；index 计数与 horses 一致。

### M5.3 races / pedigree 拆分文件

**做什么**：build-data 额外产出 `data/racefiles/{id}.json` 和 `data/pedigree/{id}.json`；crops 内嵌字段替换为文件引用 + `race_count`。**仅建有内容的马**（已拍板）。
**改动**：`scripts/build-data.py` 输出段新增拆分逻辑（`os.makedirs` + 逐匹写，有内容才写）。
**验证**：`data/races/` 文件数 = 有 races 的马数；crops 中 races 字段移除后 size 大幅下降；无 races 的马 `races_file=""`。

### M5.4 前端迁移

**做什么**：
- `index.html`/`detail.html`/`pedigree.html`/`preview.html`：读 `d.horses`；详情页按 `races_file`/`pedigree_file` 按需 fetch。
- `admin.html`：读 `d.horses`；写回 `{_meta, horses}`（人工字段仍在 crops 内直接覆盖）。
**验证**：本地 http.server + 浏览器：列表/详情/血统/检索无 console 错误；admin 补录 → commit → 重载不丢；旧页面零回归。

### M5.5 大盘页（page/dashboard.html 新）

**做什么**：用 `_meta.index` 做带计数的分面过滤 + 汇总指标（出赛率/胜率/賞金分布/収得分布/场地分布）。
**验证**：浏览器：筛选器带计数、组合过滤正确、汇总数字与 crops 一致、无 console 错误。

---

## 5. 待决 / 待确认（用户拍板）

- [x] **拆分粒度**：仅建有内容的马（无 races/无血统不建空文件）（**已拍板**）
- [x] **crops.json 瘦身后** pedigree 顶层字段 → 移入 pedigree 文件，crops 保留 `pedigree_file` 引用 + fno/cross 摘要（**已拍板**）
- [x] **大盘页**：本轮做（M5.5）（**已拍板**）
- [x] **notes.json**：**不做**——admin 直接改 crops.json 覆盖（**已拍板**）
- [x] **`_meta.index` 倒排表**：本轮生成（**已拍板**）
- [x] **旧数据版本问题**：已解决（crops 恢复为带 id 新版，commit d737c05）
- [ ] （若有新疑点，随时补充）

---

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 拆分文件请求数失控 | 按消费场景拆（首屏 1 + 详情 2），不按匹拆全量；仅建有内容 |
| 人工字段被抓取覆盖 | 已拍板接受（admin 直接改 crops.json 覆盖，与 v1 一致） |
| `_meta.index` 体积 | 407 匹 × 少量枚举字段 ≈ 几十 KB，可接受 |
| 结构迁移破坏前端 | `_meta.schema` 版本化 + 迁移前后对比（Playwright 已有先例） |
| 血统祖先集合内存/大小 | 62 节点/匹 ≈ 407×62 ≈ 2.5 万字符串，约几百 KB，可接受；必要时换懒加载 |
| 回滚 | 每里程碑独立 commit；`git revert` 即回滚；crops 由 build 重建，无手工状态 |

---

## 7. 验收总清单（DoD）

- [ ] `_meta.schema == "crops/v2"`；crops 顶层 `{_meta, index, horses}`
- [ ] crops.json 瘦身（去掉 races/血统树后体积下降 ≥80%）
- [ ] races/pedigree 拆分文件按 id 存在（仅建有内容）且内容正确
- [ ] 人工字段 admin 直接改 crops.json 覆盖生效（不拆 notes.json）
- [ ] facet 四层查询 + `_meta.index` 带计数分面全部可用
- [ ] 前端四页面 + admin 零回归；大盘页可用
- [ ] `python scripts/test-data.py` 零失败
- [ ] 本文档待决项全部闭环
