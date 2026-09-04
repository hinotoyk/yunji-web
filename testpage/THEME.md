# 云迹 · 定稿主题规格文档

> **主题：方案 F 青绿 × shadcn Neutral 底色（仅亮色）**
> 状态：**已定稿**（用户拍板），作为「云迹」正式页面的统一配色标准。
> 示例页：`testpage/palette-f-neutral.html`
> 布局：**左侧导航外壳** `testpage/index.html`（暂未接数据，子页面为占位）

---

## 1. 设计决策（为什么是这套）

- **底色用 shadcn Neutral**：纯黑白灰中性底框（`#ffffff`），专业、干净、数据密度高，赛马数据表/血统图/成绩表在这种中性底上最清晰易读。shadcn 是成熟的组件库开源方案，这套变量系统久经验证。
- **强调用方案 F 青绿**：项目一直以来的签名色方向是「青绿 / 科技感」（teal 系）。方案 F 的青绿（`#0aa7a0`）在 Neutral 中性底上既保留清爽科技感，又不像早期手调版那样发飘、没层次。
- **仅亮色**：不提供暗黑模式（用户要求去除）。

一句话：**用 shadcn 的专业中性骨架，叠上方案 F 的青绿签名色** —— 既有数据看板的专业度，又有「云迹」的辨识度。

---

## 2. 颜色 Token（CSS 变量，HSL）

### 2.1 亮色（`:root`）

| 变量 | HSL 值 | 说明 | 近似 hex |
|---|---|---|---|
| `--background` | `0 0% 100%` | 页面底色 | `#ffffff` |
| `--foreground` | `0 0% 3.9%` | 主文字 | `#0a0a0a` |
| `--card` | `0 0% 100%` | 卡片底 | `#ffffff` |
| `--card-foreground` | `0 0% 3.9%` | 卡片文字 | `#0a0a0a` |
| `--popover` | `0 0% 100%` | 弹层底 | `#ffffff` |
| `--popover-foreground` | `0 0% 3.9%` | 弹层文字 | `#0a0a0a` |
| **`--primary`** | **`177 88.7% 34.7%`** | **主强调·青绿** | **`#0aa7a0`** |
| `--primary-foreground` | `0 0% 100%` | 主按钮文字 | `#ffffff` |
| `--secondary` | `0 0% 96.1%` | 次按钮/次要底 | `#f5f5f5` |
| `--secondary-foreground` | `0 0% 9%` | 次要文字 | `#171717` |
| `--muted` | `0 0% 96.1%` | 弱化底（表头/子行） | `#f5f5f5` |
| `--muted-foreground` | `0 0% 45.1%` | 弱化文字 | `#737373` |
| `--accent` | `177 88.7% 95%` | 青绿浅 tint 强调 | `#e6f6f5` |
| `--accent-foreground` | `177 80% 22%` | 强调上的深青文字 | `#0b6b64` |
| `--destructive` | `0 84.2% 60.2%` | 危险/删除 | `#ef4444` |
| `--destructive-foreground` | `0 0% 98%` | 危险文字 | `#fafafa` |
| `--border` | `0 0% 89.8%` | 边框 | `#e5e5e5` |
| `--input` | `0 0% 89.8%` | 输入框边框 | `#e5e5e5` |
| `--ring` | `177 88.7% 34.7%` | 聚焦光环·青绿 | `#0aa7a0` |

**图表色 `--chart-1..5`（亮色）**

| 变量 | HSL | hex |
|---|---|---|
| `--chart-1` | `177 88.7% 34.7%` | `#0aa7a0` 青绿 |
| `--chart-2` | `201 86.9% 44.9%` | `#0f8fd6` 青 |
| `--chart-3` | `23 80.5% 53.7%` | `#e8742a` 橙 |
| `--chart-4` | `177 86.7% 41.2%` | `#0ec4ba` 亮青绿 |
| `--chart-5` | `201 60% 62%` | 浅蓝 |

> 说明：本主题**仅亮色**，不提供暗黑模式（用户要求去除）。以上 2.1 亮色变量即为唯一一套。

---

## 3. 布局（已定稿）

- **外壳** = `testpage/index.html`（**左侧导航**布局，用户选定；顶部方案已废弃）。
- 外壳通过 **iframe** 内嵌各功能子页面（独立 HTML，各自 URL/滚动）。
- **选马**：功能子页面内自带选马器（不在左侧放产驹列表）。
- **暂未接数据**：子页面当前为占位（标着"将展示 XX"），数据随后接入。

功能页面清单（全部内嵌进 index）：

| 分组 | 页面 | 文件 | 内容 |
|---|---|---|---|
| 单匹马 | 基本信息 | `pages/profile.html` | 马名/性别/毛色/生年月日/产地/马主/调教师/生产牧场/通算/赏金/収得等 |
| 单匹马 | 血统图 | `pages/pedigree.html` | 5 代血统图 + FNo/クロス |
| 单匹马 | 比赛记录 | `pages/races.html` | KPI 汇总 + 逐场履历表 |
| 统计 | 统计总览 | `pages/stats.html` | 趋势图 + 全成绩/芝ダ/竞马场/クラス 4 表 |
| 统计 | 日期图 | `pages/datechart.html` | 天/周/月/年切换 + 胜场列表 + 重赏标记 |
| 统计 | 时间线 | `pages/timeline.html` | 全部场次按时间排列 |

---

## 4. 文件结构

```
testpage/
├─ index.html            # ★ 外壳（左侧导航 + iframe 内嵌）
├─ palette-f-neutral.html# 定稿主题示例（真实组件预览）
├─ THEME.md              # 本文档
└─ pages/
   ├─ theme.css          # ★ 共享主题（仅亮色）+ 通用组件
   ├─ profile.html       # 基本信息（占位）
   ├─ pedigree.html      # 血统图（占位）
   ├─ races.html         # 比赛记录（占位）
   ├─ stats.html         # 统计总览（占位）
   ├─ datechart.html     # 日期图（占位）
   └─ timeline.html      # 时间线（占位）
```

> 已删除：其他主题（方案 A~D、shadcn 探索、顶部导航布局）及暗黑模式，均不保留。

本地预览：`python -m http.server 8090 --directory testpage`，访问 `http://127.0.0.1:8090/index.html`。

---

## 5. 应用到正式页面的约定（后续开发用）

- **字体（已定稿）**：正文 `font-family:'Noto Sans SC','Noto Sans CJK SC','Geist','PingFang SC','Microsoft YaHei',sans-serif`，`font-size:16px; line-height:1.40; letter-spacing:0.10px`，`font-variant-numeric:tabular-nums` + `-webkit-font-smoothing:antialiased`。
  - 中文默认**思源黑体 Noto Sans SC（本地自托管）**；拉丁/数字回退 Geist（本地）。
  - 苹方 PingFang SC / 微软雅黑 Microsoft YaHei **仅作系统回退，不打包分发**。
  - 本地字体资产与授权说明见 `UI优化记录.md` 模块 2（试衣间 fontlab.html 已随封版移除，不再保留）。
- **统一使用上面这套 CSS 变量**，不要散落写死 hex。页面只需在 `<head>` 引入一份共享的 `pages/theme.css`（变量 + 基础组件样式），再按需写页面特有样式。
- **数据语义色**约定（保证全站一致）：
  - 1着/胜 = `--primary`（青绿）
  - 2着 = `--chart-2`（青）
  - 3着 = `--chart-3`（橙）
  - 未完走（中止/取消/除外/失格）= `--destructive`（红）
  - 重赏徽章（GI/GII/GIII/L/OP）= 用 `--primary` 或 `--chart-*` 分级着色（可另定）
- **成绩表**：表头用 `--muted` 底，总行/子行用 `--muted` 弱化区分，正文 `--card` 底 + `--border` 分隔线（与示例页一致）。
- **仅亮色**：站点只有亮色主题，无暗黑模式、无 `.dark` 切换。
- 正式页面放 `testpage/` 先审阅，**用户满意后再迁移到 `page/`**（这是工作流约定）。
