# 云迹 · 前端交接文档（testpage 阶段）

> 本文件记录「云迹」前端重建到当前阶段的全部决策、现状与后续路线，供接手者直接上手。
> 配套文档：`testpage/THEME.md`（配色主题规格）。
> 数据契约：见项目根 `HANDOFF.md`（后端/数据）与 `data/basic.json`。

---

## 1. 一句话现状

前端**配色与布局已定稿**：定稿主题「方案 F 青绿 × shadcn Neutral（仅亮色）」+ **左侧导航外壳**（iframe 内嵌各功能页）+ **响应式（单断点 768px，非桌面即手机，侧边栏手机收成抽屉）**。
**基本信息页 `pages/profile.html` 已完成**（三段式：头像+信息头 / KPI / 内嵌比赛表），已接入真实数据；血统简约版（2 代）+ 完整版（5 代）弹窗已集成；比赛记录页 `pages/races.html` 已做（独立可单独打开 / 被 profile 内嵌两种模式）。其余统计 3 页仍为占位。

> ⚠ 数据路径约定已变：服务器**服务项目根**（非 `--directory testpage`），`pages/` 里 fetch 用 `../../data/...`（见 §6/§7）。

---

## 2. 已定稿的关键决策（不要随意改）

| 项 | 决策 |
|---|---|
| **配色主题** | 方案 F 青绿 × shadcn Neutral（仅亮色，**无暗黑模式**） |
| **主强调色** | 青绿 `--primary` = `hsl(177 88.7% 34.7%)` ≈ `#0aa7a0` |
| **底色** | shadcn Neutral 灰阶，`--background` = `#ffffff` |
| **布局** | **左侧导航**（竖向，分「云崽档案 / 统计」两组）+ 右侧 iframe 内容区 |
| **响应式** | **单断点 768px**：非桌面即手机；手机下侧边栏收成顶部 ☰ 抽屉（遮罩+左滑） |
| **内嵌方式** | **iframe 真独立页面**（每个功能一个 HTML，独立 URL/滚动） |
| **选马方式** | 功能子页面**内自带选马器**（搜索+下拉，共享 `selector.js`，fetch basic.json 缓存） |
| **i18n** | **前端字典翻译**：`i18n.js` 集中管理日文字段/枚举 → 中文；不改动后端 JSON |
| **跨页联动** | `bus.js`：postMessage + localStorage 双通道共享选中马，profile 内嵌 races 自动联动 |
| **统计拆分** | 拆成 **3 个子页**：统计总览 / 日期图 / 时间线 |
| **命名** | 功能子页面目录叫 `pages/`（不是 shell/） |
| **工作流** | 正式页面放 `testpage/` 先审阅，**满意后再迁移到 `page/`** |

> 已删除：早期配色方案 A~D、shadcn 探索页、顶部导航布局方案、暗黑模式。**不要复活它们**。

---

## 3. 文件结构（当前）

```
testpage/
├─ index.html              # ★ 外壳：左侧导航 + iframe 内容区（含手机抽屉）
├─ palette-f-neutral.html  # 定稿主题示例页（真实组件预览）
├─ THEME.md                # 配色主题规格（变量表、语义色约定）
├─ HANDOFF.md              # 本文档
└─ pages/                  # ★ 功能子页面（被 index.html iframe 内嵌）
   ├─ theme.css            # ★ 共享主题（仅亮色变量 + 通用组件类 + 信息头/字段分组/断点）
   ├─ i18n.js              # ★ 国际化字典（日文字段/枚举 → 中文）
   ├─ selector.js          # ★ 共享选马器（搜索+下拉，fetch basic.json 并缓存）
   ├─ bus.js               # ★ 跨 iframe 共享选中马（postMessage + localStorage）
   ├─ pedigree.js          # ★ 血统渲染（简约 2 代 + 完整 5 代 + 弹窗）
   ├─ profile.html         # 基本信息    ✅ 已完成（三段式+血统简约/完整+内嵌比赛）
   ├─ pedigree.html        # 血统图      （占位，血统渲染已在 profile 内实现）
   ├─ races.html           # 比赛记录    ✅ 已完成（KPI+逐场表，独立/嵌入两模式）
   ├─ stats.html           # 统计总览    （占位）
   ├─ datechart.html       # 日期图      （占位）
   └─ timeline.html        # 时间线      （占位）
```

> 数据在项目根 `data/`（不进 testpage）：`data/basic.json`（277 匹马）、`data/pedigree/{id}.json`（血统）、`data/races/{id}.json`（逐场成绩，276 个文件）。
> 因为 `pages/` 在项目根下两层，fetch 数据路径为 `../../data/...`；服务器需**服务项目根**（见 §6/§7）。

---

## 4. 数据契约（子页面要用的数据）

### 4.1 基本信息（`data/basic.json` → `horses[]`）

每匹马字段：`id, nk_id, jbis_id, 馬名, 欧字馬名, 香港馬名, 自译馬名, 母名, 生年, 馬名意味, 登録状態, 性別, 毛色, 馬齢, 生年月日, 産地, 馬主, 調教師, 生産牧場, 通算成績, 獲得賞金, セリ取引価格, photo, races_file, pedigree_file, 収得賞金`

- `races_file` = `"data/races/{id}.json"`（站点根相对），`pedigree_file` = `"data/pedigree/{id}.json"`
- 前端用 `fetch("../data/...")` 或按需加载（参考旧 `page/data-util.js` 的 `ensureRaces/ensurePedigree` 按需拉取思路）

### 4.2 血统（`data/pedigree/{id}.json`）

```json
{ "id":1, "jbis_id":"...", "馬名":"...", "fno":"F5-g", "cross":"Halo(USA) ：S4×M5",
  "pedigree": { "父":[ [gen0..], [gen1..], ... ], "母":[ ... ] } }
```
每代每格：`{name, sex, id, year, color}`。5 代。渲染参考旧 `page/pedigree.html`（可按需保留/改造其 16 行网格算法）。

### 4.3 比赛记录（`data/races/{id}.json`，数组按日付倒序）

每场字段：`日付, 開催, 場名, R, レース名, 格, 条件, 距離, 芝ダ, 馬場, 天候, 出走馬名, 騎手, 斤量, 頭数, 人気, 単勝, 結果, タイム, 上り, 着差, 通過, ペース, 馬体重, 増減, 賞金, venue_type(中央/地方/海外), race_id, jockey_id, 本賞金, 來源`

- `結果`：数字=着顺；`中止/取消/除外/失格`=未完走
- 全库共 **691 场**，日期范围 2025-06-15 ~ 2026-08-30，跨 2025/2026 两个年份
- 可用于统计的维度：场地（venue_type）、竞马场（場名）、芝ダ（芝/ダ/AW）、距离（距離）、クラス（格：新马/未胜利/1胜/2胜/GI/GII/GIII/L/OP）、人气（人気）、马场（馬場）、年份（日付）

---

## 5. 后续开发路线（按序）

1. **基本信息页** `pages/profile.html`：选马器 + 马匹基本信息展示（马名/性别/毛色/生年月日/产地/马主/调教师/生产牧场/通算成绩/获得赏金/収得賞金/セリ取引価格） — ✅ **已完成**
2. **血统图页** `pages/pedigree.html`：选马器 + 5 代血统图 + FNo/クロス（可参考旧 `page/pedigree.html` 算法，套用新主题） — ⏳ 血统渲染已在 profile 内实现（简约 2 代 + 完整 5 代弹窗）；独立 `pedigree.html` 页尚未做
3. **比赛记录页** `pages/races.html`：选马器 + KPI 汇总卡 + 逐场履历表（过滤/排序） — ✅ **已完成**（支持独立打开 / 被 profile 内嵌两模式）
4. **统计总览页** `pages/stats.html`：顶部按年胜场/入赏趋势柱状图 + 全成绩总表 / 芝·ダ别 / 竞马场别 / クラス别 — （占位）
5. **日期图页** `pages/datechart.html`：天/周/月/年切换，柱状图显胜场数 + 下方胜场列表 + 重赏标记 — （占位）
6. **时间线页** `pages/timeline.html`：全部 691 场按时间从小到大排列 — （占位）

> 统计页的「胜率/连对率/聚合」需前端从各 `races` 文件实时计算（前端一次性加载所有 races 或按需聚合；数据量小，可全部 `fetch` 后在前端聚合）。

### 5.1 已落地进度（本次会话）

- **三段式基本信息页** `profile.html`：
  - **上段**：头像（读 `photo`，兼容 数组/网络图/本地图，无图回退 🐎）+ 名字横排小卡片（日本名/英文名/香港名/自译，`-` 分隔，缺名不显示）+ 信息格（生年月日/产地/马主/调教师/生产牧场/精选拍卖）。
  - **中段**：KPI 通算成绩 / 获得赏金 / 收得奖金（含平地·障害·Jpn 明细）。
  - **下段**：内嵌 `races.html?embed=1` 展示全部历史比赛，选中马自动联动（无闪烁）。
  - **血统区块**：位于信息头下、KPI 上，展示**简约版**（完整版同款树状网格只取前 2 代，父上母下，行高压到 2/3 适配容器）；**点击弹窗**看完整 5 代。
- **比赛记录页** `races.html`：KPI（出赛/胜/2,3着/胜率/连对率/赏金合计，前端实时计算）+ 逐场表（10 列：日付/场名/赛事名/距离/芝ダ/着顺/时间/着差/骑手/赏金，可按场地/着顺过滤）；**嵌入模式隐藏 KPI**（那串汇总只在独立模式显示）。
- **血统渲染** `pedigree.js`（样式照抄旧 `page/pedigree.html`）：`.pside` 5 列网格 + `cell()` 16 行算法；简约版 = 只取前 2 代（2 列）+ `.pside-simple` 紧凑适配；完整版含 FNo/クロス（放血统图上方、标题下方）；格子含名字（保留国籍后缀）/出生年/毛色，性别浅蓝/浅粉底；深代（gen2+）年/毛色放名字后同行。

---

## 6. 技术约定

- **统一用 CSS 变量**（见 `pages/theme.css`），不要散落写死 hex。子页面 `<head>` 引 `<link rel="stylesheet" href="theme.css">`，再写页面特有样式。
- **数据语义色**（全站一致）：
  - 1着/胜 = `--primary`（青绿）
  - 2着 = `--chart-2`（青）
  - 3着 = `--chart-3`（橙）
  - 未完走（中止/取消/除外/失格）= `--destructive`（红）
  - 重赏徽章（GI/GII/GIII/L/OP）= 用 `--primary` 或 `--chart-*` 分级着色（可另定）
- **共享类**（`theme.css` 已定义）：`.btn(.sec/.out/.ghost)`、`.badge(.acc)`、`.card`、`.kpis/.kpi(.v/.hi/.k)`、`.tblwrap`、`table`（`thead/tbody`、`td.win/.num/.sub`）、`.sec-title`、`.hinfo`（信息头）、`.fieldgrid/.field`（字段分组）、`.hint-empty`（空态）
- **共享 JS**：`i18n.js`（字典翻译 `YJ.i18n.t/e/g/prizeEntries`）、`selector.js`（选马器 `YJ.selector.init`，暴露 `getHorses()`）、`bus.js`（联动 `YJ.bus.broadcast/onChange`）、`pedigree.js`（血统 `YJ.pedigree.load/simpleHTML/fullHTML/openModal/bindSimple`）
- **i18n 用法**：字段名用 `YJ.i18n.t("馬名")`、枚举用 `YJ.i18n.e("性別","牝")`、读值翻译用 `YJ.i18n.g(h,"馬名")`。新增字段/枚举翻译只需在 `i18n.js` 里加。
- **响应式**：所有页面统一 `@media (max-width:768px)` 手机样式；不要写多个碎断点。
- **本地预览**：`python -m http.server 8090 --directory Z:\IdeaProjects\yunji-web`（**必须服务项目根**，见 §7；访问 `http://127.0.0.1:8090/testpage/index.html`）

---

## 7. 注意事项

- 数据在项目根 `data/`，而 `pages/` 在项目根下两层（`testpage/pages/`），所以 **fetch 相对路径为 `../../data/basic.json`**（`../../data/races/{id}.json`、`../../data/pedigree/{id}.json`）。
- **服务器必须服务项目根**（`python -m http.server 8090 --directory 项目根`），而不是 `testpage`——否则 `../../data/` 超出服务器根、fetch 会 404。务必通过 http 访问（file:// 下 fetch 会失败）。
- `basic.json` 是**后端合并产物**，勿手改；前端只读。
- 前端完成、用户审阅满意后，才迁移到 `page/`（旧 page 下的 index/pedigree/race-ui 是上一代实现，可作参考但不要照搬业务逻辑）。
- 本项目约定「请求怎么发可参考、业务流程要自己重新设计」，迁移时同样适用。
