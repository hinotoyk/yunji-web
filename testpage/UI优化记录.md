# 云迹 · UI 优化记录文档

> 本文档记录「云迹」前端**逐模块 UI 优化**的完整过程：每个模块的**修改思路**与**落地实现方案**。
> 约定：**每改一个模块，先把该模块的思路与方案写进本文档，再合并到正式页面**（`testpage/` 下先审阅，满意后迁移/合并进正式实现）。
> 配套：`testpage/THEME.md`（配色主题规格）、`testpage/HANDOFF.md`（前端交接总览）。

---

## 1. 记录格式（模板）

每个模块一节，按以下小节记录：

| 小节 | 内容 |
|---|---|
| **背景与需求** | 该模块要解决什么问题、用户原始诉求 |
| **方案探索** | 给出过哪些候选方案、各自思路（含预览链接/截图说明） |
| **选定与理由** | 最终选哪个方案、为什么（用户拍板的过程） |
| **打磨迭代** | 选定后按用户反馈逐轮打磨的点（每轮一个 bullet） |
| **最终落地** | 合并进哪个正式文件、具体实现要点（结构/样式/逻辑） |
| **状态** | ✅ 已完成 / 🚧 进行中 / 📌 待办 |

---

## 2. 模块进度总览

| # | 模块 | 状态 | 落地文件 | 备注 |
|---|---|---|---|---|
| 1 | 搜索栏（方案 A 智能单框） | ✅ 已完成 | `pages/profile.html` + `pages/selector.js` | 含多名字色块、性别徽章、计数、选中回填主名 |
| 2 | 字体（定稿：思源黑体 + Geist） | ✅ 已完成 | `pages/theme.css` + `pages/fonts/`（noto-sc + geist） | 思源黑体默认中文 + Geist 拉丁回退；正文 16px/1.40/0.10px；数字等宽；界面标签放大。试衣间已移除 |

---

## 3. 模块 1 · 搜索栏（基本信息 · PROFILE 顶部）

### 3.1 背景与需求

基本信息页顶部原有搜索栏（`selector.js` 注入）仅支持**四种名字**（日文名 / 欧字名 / 自译名 / 香港名）与 ID 检索，且视觉为普通单框，信息密度一般。

用户诉求（逐轮明确）：
1. **默认可搜四种名字**，并**额外支持母名 / 马主 / 调教师 / 生产牧场**。
2. 样式要**简约、高信息密度**，契合主题（方案 F 青绿 × shadcn Neutral）。
3. 给出 **3 个设计方案**供选择。
4. 只改「基本信息 · PROFILE」与搜索栏部分，不动其它模块。

### 3.2 方案探索

在 `testpage/searchbar-options.html` 做了三个**可实际搜索、接真实数据**的候选方案供选择：

- **方案 A · 智能单框**：一个输入框一次匹配全部 8 类字段，最省空间、最快速 → **选定**。
- **方案 B · 分段搜索**：字段分段器 + 输入框，检索意图更明确。
- **方案 C · 多字段筛选栏**：五列输入 AND 组合筛选，信息密度最高。

> 方案 B / C 仅作对照，未采用；已从预览页移除，仅保留方案 A。

### 3.3 选定与理由

用户拍板：**方案 A · 智能单框搜索**。
理由：最简约、单框即可覆盖全部需求，配合下拉行的字段命中标注，兼顾速度与信息密度，最贴合"高信息密度 + 简约"的目标。

### 3.4 打磨迭代

选定方案 A 后，按用户反馈逐轮打磨：

1. **占位符直接提醒**：占位符改为 `日文名 · 英文名 · 港译名 · 自译名 · 母名 · 马主 · 调教师 · 生产牧场`，一眼看到可搜范围。
2. **下拉展示多名字**：结果行展示该马全部名字（如 `ゴーイントゥスカイ / Going to Sky / 通天飞 / 奔向天际`），主名加粗、其余弱化。
3. **性别用原生 牡/牝/セン**：不再翻译成 公/母/阉。
4. **名字类型区分（第一版）**：尝试"日/英/港/译"小字标签 → 用户反馈不佳。
5. **名字类型区分（定稿）**：改为**彩色色块包着字体**：青绿底=日文名 / 蓝底=英文名 / 橙底=港译名 / 紫底=自译名；中间缺口显示灰块 `—`，结尾缺失省略。
6. **性别徽章配色（定稿）**：`♂ 牡` 背景 `#C9EFFE`、`♀ 牝` 背景 `#FFDBD5`、`⚲ セン` 背景 `#EFEFEF`（文字加深保证可读）。
7. **整体视觉打磨**：输入框 hover/聚焦态、下拉圆角与投影、选中行左侧青色竖条、下拉顶部"匹配 N 匹"计数条。
8. **计数徽章入框**：输入框右侧实时计数徽章（空态=总马数 277，输入=命中数并青色高亮）。
9. **术语统一**：全站名字术语统一为「日文名 / 英文名 / 港译名 / 自译名」（选中卡字段标签同步）。
10. **滚动条 / 动画 / 移动端**：下拉细滚动条、150ms 淡入动画（尊重 `prefers-reduced-motion`）、≤768px 收紧。
11. **选中回填主名**：选完回填该马日文主名；再次点击输入框自动清空并重新搜索。
12. **精简已选反馈**：按用户要求**去掉 `✓ 已选` 徽章与「1 匹」计数**，仅保留回填主名，界面更干净。

### 3.5 最终落地

- **合并文件**：
  - `pages/selector.js` — 搜索组件主体（结构 + 样式注入 + 检索逻辑 + 键盘导航 + 选中回填）。
  - `pages/profile.html` — 保持 `<div id="selector"></div>` + `YJ.selector.init({el, base, onSelect})` 调用，无需改动渲染逻辑。
- **实现要点**：

  1. **检索字段**（大小写不敏感子串匹配）：
     - 名字 4 个：`馬名` / `欧字馬名` / `自译馬名` / `香港馬名`
     - 附加 4 个：`母名` / `馬主` / `調教師` / `生産牧場`
     - 兼容 `id`
  2. **占位符**：`日文名 · 英文名 · 港译名 · 自译名 · 母名 · 马主 · 调教师 · 生产牧场`
  3. **下拉行**：
     - 名字用**彩色色块**（`.nblock.jp/.en/.hk/.zh`），主名加粗（`.nblock.main`），中间缺口灰块 `—`，结尾缺失省略
     - 右侧性别徽章（`.sx.colt/.filly/.geld`，色值见上）+ 出生年
     - 命中非名字字段时显示青色字段胶囊（如「马主」）+ 命中值副行
  4. **计数徽章**：`.cnt`，空态显示总马数，输入显示命中数（`.on` 青色高亮）。
  5. **选中回填**：选中后 `input.value = 日文主名`（无徽章/计数）；再次点击输入框清空重搜。
  6. **键盘导航**：`↑`/`↓` 高亮、`Enter` 确认、`Esc` 关闭；鼠标点击选中。
  7. **可访问性/动效**：下拉 150ms 淡入（尊重 reduced-motion）、细滚动条、移动端（≤768px）收紧。

- **样式**：全部由 `selector.js` 注入（`#yj-sel-css`），沿用 `theme.css` 变量，未散落写死 hex（性别/名字色块为指定色值，已在文档记录）。

### 3.6 状态

✅ **已完成**（已合并进 `pages/profile.html` + `pages/selector.js`，本模块封版）。

---

## 4. 模块 2 · 字体（全局排版）

### 4.1 背景与需求

用户反馈：**当前字体太丑、看不清**。原 `theme.css` 第 30 行是纯系统字体栈（`-apple-system / Segoe UI / PingFang SC / Microsoft YaHei / Arial…`），没有任何 Web 字体。问题集中在：

1. Windows 中文落到**微软雅黑**，小字号（表格 13px、标签 10.5px）发虚、发闷。
2. **数字未全站等宽**：仅 `.num`/`.cnt` 开了 `tabular-nums`，成绩/距离/赔率/斤量等数字列宽度不齐。
3. **字号过小**：血统简约版 meta 仅 7px、字段标签 10.5px、表头 11px，易糊。

需求：选一套中/日/英混排 + 数字友好的字体方案（咨询 ChatGPT 给了选字体方法论：可读性 / 数字表现 / 中英日协调 / 字重体系 / 加载性能等维度）。

### 4.2 方案探索

关键约束：**中文/日文全量 Web 字体单字重 5~10MB**，全量引入必然拖慢；通行做法是「拉丁/数字用一个小体积可变字体（一个文件覆盖 100~900 全部字重）+ 中文日文走系统栈精修」。本项目为本地 `python http.server` 服务，可把小字体文件**自托管进项目**（离线可用、无外网依赖、无许可证风险，Geist 为 OFL 开源）。

调研（web_search）结论：
- 拉丁候选：**Geist**（Vercel 出品，现代科技感，契合青绿主题）vs **Inter**（经典稳妥）→ 选定 Geist（更贴本主题气质，Inter 作名后备选）。
- 中文系统栈精修：PingFang SC（macOS）→ MiSans / HarmonyOS Sans / 思源黑体（若安装）→ 微软雅黑（Windows 兜底）。
- 日文：Hiragino Sans（macOS）→ Yu Gothic / Meiryo（Windows）。
- 参考：[Geist vs Inter](https://diversekit.com/blog/geist-vs-inter)、[UI 字体抉择](https://zeoseven.com/blog/articles/2025/10/11/)、[中文黑体选型（MiSans/鸿蒙/思源对比）](https://www.uisdc.com/5-commercially-available-blackbody)、[Noto Sans SC（CJK 字体体积）](https://www.npmjs.com/package/noto-sans-cjk-sc)。

> 备选临时方案（未采用）：A 纯系统栈精修（零下载但 Windows 中文仍是雅黑）；C 全量中文字体 Web Font（观感统一但 5~10MB）；D 本地装 MiSans/鸿蒙后引用（需用户自己装字体）。

### 4.3 选定与理由

用户拍板：**方案 B · 拉丁可变字体 + 系统中文**。
理由：英文名/数字/UI 焕新（数字整齐清晰），中文日文保持最稳的系统渲染；体积小（~29KB）、离线可用、观感提升最大。

### 4.4 打磨迭代

1. **@font-face 自托管**：下载 Geist latin 子集 woff2（29,400 字节，`wOF2` magic 校验通过），存 `pages/fonts/geist-latin.woff2`，`font-weight:100 900`（一个文件覆盖全字重），`font-display:swap`。
2. **全站字体栈**：`'Geist','Segoe UI','PingFang SC','MiSans','HarmonyOS Sans SC','Source Han Sans SC','Noto Sans CJK SC','Microsoft YaHei','Hiragino Sans','Yu Gothic','Yu Gothic UI','Meiryo',Roboto,…` —— 拉丁走 Geist，中文日文按系统最优回退。
3. **可读性小包**：`line-height 1.5→1.55`、`-webkit-font-smoothing:antialiased`、`text-rendering:optimizeLegibility`、`font-variant-numeric:tabular-nums`（全站数字等宽，替代原先只对 `.num`/`.cnt` 生效）。
4. **字号上调**：表格 13→13.5、表头 11→11.5、字段标签 10.5→11；血统简约版名字 11→11.5、meta 7→8、行高 15→17px（避免溢出）。
5. **示例页同步**：`palette-f-neutral.html` 内联字体栈与 @font-face 同步更新（相对路径 `pages/fonts/...`）。
6. **界面文字放大（用户点名）**：用户反馈「界面的文字也要看清，如 基本信息 · PROFILE / 比赛记录 · RACES 看不清楚」——此前误把优化重点只放在字体上。系统上调**界面标签字号 + 加深颜色**：
   - `.sec-title`（节标题）：11px 45%灰 → **14px 深色 + 字重700 + 左侧青色竖条装饰**。
   - 表头 `thead th` 11.5→12.5px、字段标签 `.field .k` 11→12px、KPI 标签 `.kpi .k` 11→12.5px、`.badge` 11→12px 且文字用深色。
   - 页面特有小标签：`profile.html`（名字卡标签 10→11、元信息 10.5→11.5、比赛栏 11→13、血统提示 11→12）、`races.html`（提示 11.5→12.5、成绩标签 10→11.5、空态 13→13.5）、`selector.js`（性别 10.5→12、字段胶囊 9.5→10.5、副行 11→12、列表头 10.5→12）、`pedigree.js`（血统脚注 11→12.5、提示 11→12）、`index.html`（导航组 10→11.5、导航项 13→14、底部 11→12、面包屑/提示 11~13→12.5~14）。
   - 次要文字统一由 `--muted-foreground`（45%灰）提到 `--secondary-foreground`（9%深灰），保证对比度。
7. **字体本地化（用户提供源文件）**：用户下载 MiSans / HarmonyOS Sans 官方 zip 放入项目 → 解压到 `pages/fonts/`（MiSans 保留 VF 可变字体 + woff2；HarmonyOS 保留 SC.ttf），删除桌面格式 otf/ttf/woff（省 192MB），目录总量 ~101MB。
8. **授权合规确认**：Geist / Inter / 思源黑体 = SIL OFL（开源免费商用）；MiSans / HarmonyOS Sans = 免费商用；苹方 / 微软雅黑 / Segoe UI = 系统内置仅作回退、不打包分发。
9. **用户拍板定稿（fontlab 试衣间选定）**：
   ```css
   body{
     font-family:'Noto Sans SC','Noto Sans CJK SC','Geist','PingFang SC','Microsoft YaHei',sans-serif;
     font-size:16px; line-height:1.40; letter-spacing:0.10px;
     font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased;
   }
   ```
   - **默认中文改为思源黑体 Noto Sans SC（本地自托管）**，Geist 作拉丁/数字回退；苹方/微软雅黑仅系统回退。
   - 字号 14→**16px**、行高 1.55→**1.40**、新增字距 **0.10px**（正文放大+收紧，观感更清晰）。
   - 已回填 `theme.css` body + 接入本地 `noto-sc.css`（`@import`，101 子集按需加载）；`palette-f-neutral.html` 同步；试衣间默认值同步为定稿方案。

### 4.5 最终落地

- **合并文件**：
  - `pages/theme.css` — `@import` 本地 `noto-sc.css`（思源黑体）+ `@font-face`（Geist）+ 全局 body 字体栈/字号/行高/字距/平滑/等宽 + 表格/表头/标签字号上调。
  - `pages/fonts/noto-sc.css` + `noto-sc/` — 思源黑体 Noto Sans SC 全量本地化（101 子集）。
  - `pages/fonts/geist-latin.woff2` — 拉丁/数字回退字体。
  - `pages/pedigree.js` — 血统简约版字号/行高微调。
  - `palette-f-neutral.html` — 示例页同步（link noto-sc + 内联 body 栈）。
  - ~~`fontlab.html` / `inter-latin.woff2` / `misans/` / `harmonyos-sans/`~~ — **已随封版移除**（见 §4.7/§4.8）。
- **实现要点**：
  1. `@import` 与 `@font-face` 用相对路径，各页面经 `theme.css` 自动继承，无需每页改。
  2. 全站 `tabular-nums` 让成绩/距离/日期/赔率数字对齐。
  3. 苹方 PingFang SC / 微软雅黑 Microsoft YaHei 仅作系统回退，不打包分发（授权合规）。
- **样式**：字体全本地自托管 + 系统回退，无外部 CDN 依赖，离线可用。

### 4.6 状态

✅ **已完成 + 用户拍板封版**（用户通过试衣间选定：思源黑体 16px/1.40/0.10px，已回填 `theme.css`，本模块封版）。

### 4.7 历史：字体试衣间 `fontlab.html`（已随封版移除）

> 用户反馈「看不出变化」后新增的**在线字体对比工具**（实时切换字体/字重/字号/行高/字距/数字等宽），用于辅助拍板，避免盲改。定稿回填后已按用户要求**整体移除**（页面 + 未采用的对比字体一并清理）。

- 试衣间曾支持：Geist / Inter / 思源黑体 / 纯系统栈 / 苹方 / 微软雅黑 / MiSans / 鸿蒙 / 本地思源 / Segoe UI 对比；展示马匹为**通天飞**（id=40，4 名字+重赏成绩最齐全）。
- 试衣间最终产出（已回填封版）：思源黑体 16px / 行高 1.40 / 字距 0.10px（见 §4.4 第 9 条）。
- **移除内容**：`fontlab.html`、`inter-latin.woff2`、`misans/`、`harmonyos-sans/`。

### 4.8 当前保留的字体资产（`pages/fonts/`，共 ~4.4MB）

| 资产 | 大小 | 用途 |
|---|---|---|
| `geist-latin.woff2` | 29KB | 拉丁/数字回退（body 栈第 3 位） |
| `noto-sc.css` + `noto-sc/`（101 子集） | ~4.4MB | **思源黑体 Noto Sans SC**（默认中文，unicode-range 分段按需加载） |

> 已删除（未采用，避免冗余）：Inter、MiSans、鸿蒙 HarmonyOS Sans、试衣间页面。如需重新启用，可参考本节历史记录。

---

## 5. 后续模块（待办）

- 模块 2：血统图页 `pages/pedigree.html`（5 代血统 + FNo/クロス）
- 模块 3：比赛记录页 `pages/races.html`（KPI + 逐场表）— 已实现基础版，待按本记录方式逐项优化
- 模块 4：统计总览页 `pages/stats.html`
- 模块 5：日期图页 `pages/datechart.html`
- 模块 6：时间线页 `pages/timeline.html`

> 每个模块开工前，先在本文档新增对应小节（复制 §1 模板），记录思路后再动手实现。
