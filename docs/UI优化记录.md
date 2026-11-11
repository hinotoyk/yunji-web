# docs/UI优化记录.md · 云迹 UI 定稿与全站编码约定

> **本文件是什么**：云迹前端的**现行 UI 规格 + 硬约定**单一出处。每个条目只保留「最终落地 / 最终状态 / 关键结论 / 仍未变的取舍」，供后续改版与子项目同步时对照。
>
> **已清理的内容**（2026-11-11）：逐版微调链（产驹赏金 v2–v13.1）、被后续方案取代的中间态（编辑台双形态、`?edit=1` 开关、不蒜子统计）、一次性 bug 修复流水（§89 / §106–§109 / §133 / §143 / §147 / §151–§153 / §163）、待选型对照页（§178）、已废弃的重复编号（第二个 §87 / §166）。原文全在 git 历史（`7e48d69` 及之前），需要考古时 `git show 7e48d69:docs/UI优化记录.md`。
>
> **§ 编号保持原样**：缺号 = 已归档（清单见附录 A）。`AGENTS.md`（§48 / §105）、`HANDOFF.md`、`docs/子项目复制与同步指南.md`（§105 / §139 / §170 / §172 / §184 等）里的引用继续有效。

## 现行条目导航（按页面）

| 范围 | 看哪些 § |
|---|---|
| 全局 · 搜索栏 / 字体 / 设备 / 跨页联动 | §3 · §4 · §10 · §12–§14 · §20 · §28–§30 · §36 · §37 · §39 · §42 · §62 · §66 · §72 |
| 基本信息（profile） | §5 · §7 · §8 · §38 · §54/§55 · §94 · §95 · §97 · §98 · §99 · §136 · §137 · §158 · §159 · §159.1 · §160 |
| 比赛记录（races） | §9 · §11 · §22 · §25 · §34 · §40 · §46 · §51 · §53 · §56 · §57 · §60 · §61 · §78 · §80 · §100 · §101 · §102 · §161 · §162 · §164 |
| 倾向统计（stats） | §35 · §44 · §47 · §49 · §50 · §64 · §110 · §135 · §144 · §145 · §157 |
| 产驹赏金（leaderboard） | §112 · §114 · §115 · §128 · §129 · §130 · §131 · §181 |
| 日期统计（datechart） | §32 · §33 · §63 · §146 · §165 · §183 |
| 出走马表（entries） | §174 · §184 · §184.1 |
| 航迹线（timeline） | §31 · §45 · §148 · §149 · §166 · §175 · §176 · §177 · §179 · §182 · §188 |
| 视频回放（比赛记录·回放列） | §185 · §185.1 · §185.2 · §186 · §187 · §187.1 · §189 |
| 编辑台（4 页） | §91–§93 · §105 · §142 · §150 · §154 · §155 · §168 · §169 · §187 · §190 |
| 跨站 / 部署 / 冒烟 / 派生 | §103 · §169 · §170 · §171 · §172 · §173 |

---

## ★ 全站编码约定 · 复用抽离（§48 定稿，此后一切前端编码必须遵守）

1. **公共工具单一出处**：HTML 转义等页面级工具放 `public/yj-util.js`（`YJ.util.*`），页面只写薄别名 `var esc = YJ.util.esc`，**禁止再复制函数体**；共享模块保持零依赖可独立单测的，内部实现可自包含（如 race-rows 的 esc），但语义必须两处一致。
2. **业务语义组件单一出处**：比赛行/徽章/格式化（`gradeBadge/placeBadge/ninki*/GRADE（含派生 G/GLABEL）/weightOf/venueR…`）一律复用 `public/race-rows.js`，新页面直接引入，禁止本地重写映射表或徽章 HTML。
3. **数据语义色单一出处**：着顺浅色三件套（1/2/3着+着外）JS 侧 = `race-rows.js` 的 `PLACE_BG`，CSS 侧 = theme.css `.yj-nkm*`，两处互指注释、**改色必须同步**；新增数据语义色先找单一出处再写。
4. **组件样式进 theme.css**：≥3 页共用或全站统一的样式 → `@layer components` 用 `@apply` 封装（如 `.page-title`/`.sec-title`）；**但类名靠 JS 动态拼接、content 里没有字面量的类（如 `.yj-g*`），必须放在 @layer 之外**——Tailwind 会按 content 候选裁剪 @layer 内规则。
5. **收录门槛（防为了复用而复用）**：抽离前先 grep 查重复——**全站统一的数据语义，或 ≥3 处使用**才收口；仅 2 处且行为有分叉的明确不动（反例：`.seg`/`manYen`/`#page.embed` 等）。追补（2026-xx 用户决策）：凡 **2~3 处使用但高度相似**的代码，一律先列收口清单（当时归档成一份复用审计文档，2026-11 已删除）再统一处理；其中 `.seg`（统一 32px 规范值）与 `manYen`（`YJ.util.manYen(pr, empty)` 参数化）**已经用户确认分叉非刻意后收口**（见 F1.8/F1.9），其余分叉项（如 `#page.embed`）保持不动。
6. **零影响红线与验证清单**：复用收口只做等值搬移/纯删除；改完必跑 `npm run build` + 核对 dist（theme css 新类在、旧类无、`dist/data/basic.json` 存在——`COPY_DATA=skip` 与 `emptyOutDir` 叠加会清掉 data）。
7. **版本戳已自动化，禁止手工 `?v=N`（2026-xx 定稿，取代本条旧规）**：非 module 公共脚本统一由构建期插件
   `vite.config.js` 的 `auto-version` 自动打**内容哈希戳** `?v=<sha1 前 10 位>`（dev/build 通用）。内容不变 →
   URL 不变 → 缓存命中；内容一变 → 哈希变 → 浏览器自动换新。**页面源码一律不写 `?v=`，禁止手改哈希**；
   改 `public/x.js` 后**无需再 grep 全站 +1**。特殊：`site-config.js` 是构建期产物，按生成内容哈希（配置变化自动换）；
   `data-config.js`/`device.js` 等原无戳文件同样自动覆盖；外链脚本不参与。

---

## 一、页面与模块定稿（§3–§103）

### §3 · 搜索栏（智能单框）
- **最终落地**：`pages/selector.js`（组件主体）+ `pages/profile.html`（`YJ.selector.init`）。
- **最终状态**：✅ 封版。
- **关键结论**：单框一次匹配 8 类字段（4 名字 + 母名/马主/调教师/生产牧场 + id）；下拉彩色名字色块（青绿=日文/蓝=英文/橙=港译/紫=自译）+ 性别徽章 + 计数徽章；选中回填主名、再点清空重搜。

### §4 · 字体（全局排版）
- **最终落地**：`pages/theme.css`（body 栈）+ `pages/fonts/`（构建期按需子集，见 §66；Geist 拉丁回退）。
- **最终状态**：✅ 封版（字体文件方案已由 §66 取代：1 个 woff2 单片 ~589KB）。
- **关键结论**：思源黑体默认中文 + Geist 拉丁/数字回退；16px/1.40/0.10px；全站 `tabular-nums`；全部本地自托管无 CDN。

### §5 · 基本信息页两栏布局
- **最终落地**：`pages/profile.html` + `pages/selector.js`（`persistent` 常驻模式）+ `pages/theme.css`（`.yj-pane`）+ `index.html`（站点名コントレイル）。
- **最终状态**：✅ 已完成（commit `c1707e9`）。
- **关键结论**：左 400px 常驻搜索列 + 右详情；<1024px 堆叠单列；未选马显示分类总览；性别 `セ`/`セン` 归一。

### §7 · 马匹详情「上中下」一体式布局
- **最终落地**：`pages/profile.html`（三段一体 + `winRate/sexBadge/fitFrames` + 名字四槽）+ `pages/pedigree.html`（embed 去卡片/完整血统弹窗）+ `pages/races.html` + `public/i18n.js`。
- **最终状态**：✅ 已提交。
- **关键结论**：无卡片无分割线，靠留白 + 章节标题 + 中段通栏 band；PC 上段图片:信息列黄金比 1:0.618 实时计算；相册大箭头 + 白晕；名字区固定四槽空值占位。

### §8 · 中段数据概览 OVERVIEW 卡片化（方案 D v8）
- **最终落地**：`pages/profile.html` `statsBand` 重构（主卡 + 2×2 副卡 + `placeStats/ratePct`）。
- **最终状态**：✅ 已完成并合并（后被 §54/§55 演进为 S9 色带）。
- **关键结论**：主卡「5战2胜 [2-0-1-2]」36px/600 一行式；胜率/连对率/复胜率三比率；0 值浅灰弱化。

### §9 · 比赛记录页单行 21 列表（版本 B）
- **最终落地**：`pages/races.html`（`rowHTML` 21 列 + JBIS 配色注入 + `rowMbHTML` mb 两行分块）。
- **最终状态**：✅ 已完成并提交。
- **关键结论**：配色参考 JBIS 官方（G1 红/G2 深蓝/G3 绿/L 金/OP 现状；着顺仅 1/2/3 浅底彩边方块）；mb 两行分块无横滚。

### §10 · 设备判定统一入口（YJ.device）
- **最终落地**：`public/device.js`（新增）+ `pages/races.html` + `pages/profile.html` + `public/selector.js`。
- **最终状态**：✅ 已完成并提交。
- **关键结论**：768px 单断点唯一入口 `isMb/isPc/mode/onChange`；`isWide()` 被用户否决删除；断点翻转 `lastR` 免请求重渲染。

### §11 · 比赛记录·内嵌模式精简 15 字段
- **最终落地**：`pages/races.html`（`venueR` + `embedTableHTML/rowEmbedHTML/rowEmbedMbHTML` 三路分支）。
- **最终状态**：✅ 已完成。
- **关键结论**：内嵌无过滤/无计数；场地+R 组合「京都5R」；PC 紧凑化（内嵌 14 列/独立 20 列无横滚）；马体重合并「500（+2）」；PC 全列居中；mb 软分行 `label：value`。

### §12 · 独立模式全库跨马多维组合查询 + 分页
- **最终落地**：`pages/races.html`（`LIB/FLT/PG` + `renderFilters/renderResults/pageSeq`）+ `pages/profile.html`（`?horse=id`）。
- **最终状态**：✅ 已完成并提交。
- **关键结论**：8 维维度条（同维多选 OR/跨维 AND）；竞马场三行；前端内存分页默认 100 条/页；内嵌模式零影响。

### §13 · 跨马结果表：马名列去年份 + 列头「出走马」
- **最终落地**：`pages/races.html`（仅独立 PC 路径）。
- **最终状态**：✅ 已完成。
- **关键结论**：马名两档切换（`NAME_VIEW`）；跨马表扩列 15→21→22 列；mb 分页按设备分档（PC 100/mb 10）。

### §14 · 马番/枠番列 + 骑手名正式名
- **最终落地**：`pages/races.html` + `public/i18n.js` + `scripts/races/fetch_races.py` + `racelib.py`。
- **最终状态**：✅ 已完成。
- **关键结论**：马番/枠番数据由成绩页回填（--force）；骑手名按 jockey_id 归一为正式名。

### §18/§19 · 跨马表列宽（§19 取代 §18）
- **最终落地**：`pages/races.html`。
- **最终状态**：✅ §19 已取代 §18 定稿。
- **关键结论**：§18 强制 `table-layout:fixed` 无横滚被否；§19 改「最小固定 + 内容自适应」（`table-layout:auto` + width:max-content），内容超宽允许横向滚动；后续补删步速/位置 → 21 列 + 弹性列评分。

### §20 · 独立 MB 跨马卡片 v2
- **最终落地**：`pages/races.html`（仅 `libRowMbHTML`）。
- **最终状态**：✅ 已合并。
- **关键结论**：5 行重排镜像 PC 列序；马场/体重/赔率短标签硬编码，其余走 i18n；PC/内嵌零改动。

### §22 · 赛事名去冗余等级尾缀
- **最终落地**：`pages/races.html`（`raceNameText()`，6 处渲染 + 1 处量尺）。
- **最终状态**：✅ 已合并。
- **关键结论**：只剥有徽章代劳的 5 类尾缀（GI/GII/GIII/L/OP/Jpn*），`(1勝クラス)` 等无徽章尾缀保留。

### §23/§26 · 宽屏列宽 v6/v7
- **最终落地**：`pages/races.html`（`libLayout/fs` + `fill()` 三阶段注水 + `TIER_CAP` 档位表 + canvas 粗排/DOM 精量）。
- **最终状态**：✅ 已合并。
- **关键结论**：留白三阶段加权注水（弹性文本 2.0× → 数字 1.5× → 全表均分）；表内留白 >40% 自动升档；v7 注水上限随档位（档位越高赛事名越收、数字列越放）；调参指引见原 §23.7/§26.6。

### §25 · 人气徽章改「着顺同款颜色文字」
- **最终落地**：`pages/races.html`（`ninkiBadge()` 删胶囊，仅文字色）。
- **最终状态**：✅ 已合并。
- **关键结论**：1 黄 #e2cc38/2 蓝 #87aee6/3 橙 #dca167 文字色无底无框，4+ 纯数字；6 处渲染共用。

### §27 · 筛选加「出走马」
- **最终落地**：`pages/races.html` + `public/selector.js`（`multi/excluded/compact/placeholder` 选项）。
- **最终状态**：✅ 已合并。
- **关键结论**：`FLT.horse` 维度 id 字符串数组；搜索下拉复用 PROFILE 的 selector 组件；同维多选 OR/跨维 AND。

### §28 · 出走马跳转优化
- **最终落地**：`pages/races.html`（删两处 `_blank`）+ `index.html`（iframe load 同步侧边栏高亮）。
- **最终状态**：✅ 已合并。
- **关键结论**：去 `_blank` 走外壳 iframe 内部跳转，保留外壳侧边栏。

### §29 · 内嵌 RACES 加「在比赛记录中查看详情」
- **最终落地**：`pages/profile.html`（标题行链接）+ `pages/races.html`（解析 `URL_HORSE` 预置筛选）。
- **最终状态**：✅ 已合并。
- **关键结论**：`races.html?horse=id` 预置出走马筛选即该马详情，用户仍可自由增删条件。

### §30 · 选马器双格式马名
- **最终落地**：`public/selector.js`（`doubleName` opt-in）+ `pages/profile.html`。
- **最终状态**：✅ 已合并。
- **关键结论**：仅 profile 开启；副名复用 hk/zh 配色、与主名相同则跳过。

### §31 · 时间线页（航迹线）
- **最终落地**：`scripts/timeline/build_timeline.py`（预计算 `data/timeline.json`）+ `pages/timeline.html`（纯渲染）+ `run_update.py` 接入。
- **最终状态**：✅ 已完成并合并。
- **关键结论**：6 类事件（级别首胜/重赏胜利/世代新马首胜/世代重赏首胜/父子制覇/受赏），一场=一条事件多标签；父子制覇=レース名去尾缀与常量精确匹配；人工节点 `timeline_manual.json`。

### §32 · 日期统计页
- **最终落地**：`scripts/datechart/build_datechart.py`（预计算 `data/datechart.json`）+ `pages/datechart.html`。
- **最终状态**：✅ 已完成并接入真实数据。
- **关键结论**：天/周/月/年口径切换 + KPI 带（出走/通算战绩/总赏金/重赏胜利）+ 日历逐日 + 内嵌比赛表同款明细；预计算只做字段抽取、聚合口径全由前端在 runs[] 上算。

### §33 · 同日按发走时间细分排序
- **最终落地**：`pages/races.html`（统一 `raceCmp`）+ `build_datechart.py`（runs[] 加 `hs` 键）。
- **最终状态**：✅ 完成。
- **关键结论**：日期降序→同日発走降序→缺失视为最大；`発走` 零填充 "HH:MM" 字符串直接比较。

### §34 · 着顺过滤三态化
- **最终落地**：`pages/races.html`（`resultCode/resultMatches`）+ `tests/_verify-races-result.cjs`。
- **最终状态**：✅ 完成。
- **关键结论**：完赛=数字着顺；未完赛=中止/失格（计出走）；未出走=取消/除外（不计）；KPI「出赛」改「出走」。

### §35 · 统计总览页（STATS）
- **最终落地**：`scripts/stats/build_stats.py` → `data/stats.json` + `pages/stats.html` + `pages/races.html`（`f=` 解析）+ `verify_stats.cjs`/`verify_drill.cjs`。
- **最终状态**：✅ 已完成（v3~v15 多轮追改后定稿）。
- **关键结论**：倾向矩阵（10+ 维切面 × 场地）+ 年龄成绩曲线（指标多选组合）+ 重赏之路；矩阵着别列最终去样式纯数字；比率分母=出走。

### §36 · 着顺语义「纯彩字」失真修正
- **最终落地**：`pages/races.html` + `pages/stats.html` + `pages/datechart.html`。
- **最终状态**：✅ 已完成。
- **关键结论**：人气/通算战绩/进板数改「同色相深阶文字」无底无框（黄 #e2cc38/蓝 #87aee6/橙 #dca167 系），对比度 ≥6:1；浅底胶囊方案被否。

### §37 · 赛道方向译名 + 人气筛选多选
- **最终落地**：`pages/races.html` + `pages/stats.html` + 断言脚本转正（`tests/_verify-*.cjs` → `scripts/<模块>/verify_*.cjs`）。
- **最终状态**：✅ 已完成。
- **关键结论**：内部值 `turn:右/左` 不变，纯显示层译名；人气筛选复用 selRow（select 添加 + f-tag 删除）。

### §38 · 未选马总览改版
- **最终落地**：`pages/profile.html` `renderOverview()`。
- **最终状态**：✅ 已完成。
- **关键结论**：概览等式 `277 = 146 + 131` 实时聚合（不写死）；mb 端不做等式直接展示。

### §39 · 人气徽章与着顺徽章统一
- **最终落地**：`pages/races.html` CSS（`.yj-nk1/2/3` 套 `.yj-no*` 浅底彩边）。
- **最终状态**：✅ 已完成。
- **关键结论**：人气 1/2/3 与着顺同款浅底彩边徽章（不能改回亮金——白底不可读）。

### §40 · 全站 1/2/3 色浅色三件套
- **最终落地**：`pages/races.html` + `pages/stats.html` + `pages/datechart.html`。
- **最终状态**：✅ 已完成。
- **关键结论**：#FEED88/#CCDFFD/#ECC6A2 浅底深字；PC 徽章维持与着顺同款。

### §41/§43 · 通算战绩分节条（§43 修正 §41）
- **最终落地**：`pages/stats.html`（`.st-brk`）+ `pages/datechart.html`（`.dc-brk`）。
- **最终状态**：✅ §43 为最终形态。
- **关键结论**：§41 去连字符留白缝被判定理解偏差；§43 连体底色 + `<i>` 渐变接缝保留 `-` 连字符，圆角只留两端。

### §42 · 比赛行/徽章抽公共模块
- **最终落地**：新增 `public/race-rows.js`（`YJ.raceRows` 单一出处）+ `theme.css` 收口；`pages/races.html`/`datechart.html` 删本地副本。
- **最终状态**：✅ 已完成。
- **关键结论**：否决真 iframe 内嵌（数据源/范围/口径三因），采用共享渲染模块。

### §44 · 倾向矩阵着别列（v3 终版）
- **最终落地**：`pages/stats.html`（v3 全部去样式纯数字，删 `PLACE_C/placeCell/.st-place`）。
- **最终状态**：✅ v3 终版。
- **关键结论**：矩阵密度高，着别列不参与色彩语义；废案稿移 `tests/_trash/tendency-color-swatch.html`。

### §45 · 时间线骑手/调教师两行
- **最终落地**：`pages/timeline.html`（`teamHTML()`）+ `build_timeline.py`（発走排序）。
- **最终状态**：✅ 已完成（v2~v4）。
- **关键结论**：按 `｜` 拆两行；同日按発走排序并修正世代「首个」误挂；标签统一「首胜」；首胜加斜置小皇冠。

### §46 · 级别细分 13 档
- **最终落地**：`scripts/stats/build_stats.py`（`grade_key()`）+ `pages/stats.html`。
- **最终状态**：✅ 已完成。
- **关键结论**：班赛拆一胜/二胜/三胜级、重赏拆 G1-3/Jpn1-3；距离行标签附范围。

### §47 · 矩阵容器高度对齐
- **最终落地**：`pages/stats.html`（`matHtml/applyMatScroll`）。
- **最终状态**：✅ 已完成。
- **关键结论**：参考高度由人气表离屏实测 offsetHeight，内容更矮收缩、更高竖向滚动。

### §48 · 全站复用收口（v1 方案 9 项）
- **最终落地**：新增 `public/yj-util.js`（`YJ.util.esc` 单一出处，6 页薄别名）+ `race-rows.js` 导出 `PLACE_BG/G/GLABEL` + 徽章 CSS 收口 + `.yj-g*` 移出 `@layer` + `.page-title` 组件。
- **最终状态**：✅ 全部落地，提炼为文首「★ 全站编码约定」。
- **关键结论**：隐藏耦合——`.yj-g*` 动态拼类名靠页内重复 CSS 兼职候选锚点，收口后必须移出 @layer 否则构建静默丢配色。

### §49 · 人气页签升序 + 基准行中性灰
- **最终落地**：`pages/stats.html`。
- **最终状态**：✅ 已完成。
- **关键结论**：人气按数值升序；基准行改中性灰与数据语义色彻底分离。

### §50 · 倾向矩阵新增「母父」维
- **最终落地**：`scripts/basic/merge_basic.py`（`damsire_of`）+ `scripts/stats/build_stats.py` + `pages/stats.html` + `pages/races.html`。
- **最终状态**：✅ 已完成。
- **关键结论**：母父字段单一 derive 点（`pedigree.母[1][0].name`，277/277）；页签序 11 维定稿。

### §51 · 赛事名恒单行 + 等级尾缀改徽章
- **最终落地**：`scripts/timeline/build_timeline.py`（`strip_grade_suffix`）+ `pages/timeline.html`（`.tl-racename` + `fitRaceNames`）。
- **最终状态**：✅ 已完成。
- **关键结论**：只剥「尾缀==格且会渲染徽章」者；基准字号取 CSS 不写死、幂等复位。

### §52 · 侧边栏「日期图」→「日期统计」
- **最终落地**：`front/index.html` + `front/pages/datechart.html`（title/H1）。
- **最终状态**：✅ 已完成。
- **关键结论**：菜单名与页内 H1 全站一一对应，须一起改；数据管线/脚本侧 `datechart` 域名词不动。

### §53 · 比赛记录表收口（列定义驱动）
- **最终落地**：`public/race-rows.js` 重写（`COL/SETS` → `BASE_COLS` 21 列基准 + `VIEWS` 只允许 hide/th/mbLines 差异）；`races.html` 删死代码。
- **最终状态**：✅ 已完成（用户拍板字段基准化）。
- **关键结论**：单马 22 列独立表为死代码已删；`distMerged` 成唯一距离列（`泥1500` 式）；明细 15 列/内嵌 14 列。

### §54/§55 · 数据概览定稿 S9「晨雾光晕」色带
- **最终落地**：`pages/profile.html` + `theme.css @layer components`（`.yj-ov-*`）。
- **最终状态**：✅ S9 定稿（取代 §54 卡片式）。
- **关键结论**：渐变描边外框 + 白底径向雾，内部 成绩｜三率｜三赏金 发丝分格一行；渐变质感 utility 表达不了，皮肤整体收进 `.yj-ov-*`（类名完整字面量防裁剪）。

### §56 · 筛选改「出走马同款」搜索下拉
- **最终落地**：`public/selector.js`（`items` 通用选项模式）+ `pages/races.html`（四行 `.f-csel` 挂载点）。
- **最终状态**：✅ 已完成。
- **关键结论**：八个筛选维度共用选马器交互；原生 select 退场；外点关闭改实例注册表防多实例互顶。

### §57 · 海外马两项修正
- **最终落地**：`yj-util.js`（`splitName/nameKind`）+ `scripts/races/merge_races.py`（`性別_当前` 派生）+ 人工表。
- **最终状态**：✅ 已完成。
- **关键结论**：当前性别 = `性別_当前 || 性別` 全站单一出处；马名拉丁/日文按内容判定。

### §58 · 数据门禁修复
- **最终落地**：修 `scripts/stats/verify_stats.cjs` + `verify_drill.cjs`。
- **最终状态**：✅ 已完成。
- **关键结论**：`--check` 五步全绿，消除 update-data.yml 静默跳过提交隐患。

### §60 · 通算战绩收口
- **最终落地**：`merge_races.py`（`career_from_recs` 派生 `通算成績_逐场`）+ `profile.html` + `check_data.py` 同口径对账。
- **最终状态**：✅ 已完成。
- **关键结论**：口径=出走=全部−未出走；展示一律用 `通算成績_逐场`（含海外台账场）。

### §61 · 未出走不算通算
- **最终落地**：`datechart.html`（`isNR()`）。
- **最终状态**：✅ 已完成。
- **关键结论**：取消/除外=未出走不计通算；中止/失格=未完走仍算出走归着外。

### §62 · 跨标签页串扰修复
- **最终落地**：`front/public/bus.js`（localStorage → sessionStorage + `store()` 降级）。
- **最终状态**：✅ 已完成。
- **关键结论**：sessionStorage 按标签页隔离，同源 iframe 仍共享。

### §63 · 周口径跨月补真实邻月日
- **最终落地**：`datechart.html`（`.dc-outm` 灰显可点）。
- **最终状态**：✅ 已完成。
- **关键结论**：天/周/月三档共用同一骨架，跨月周两端不再空。

### §64 · 马名口径全站收口
- **最终落地**：`yj-util.js`（`fallbackName/mainName`），selector/profile/pedigree/races/race-rows/datechart 全改薄引用。
- **最终状态**：✅ 已完成。
- **关键结论**：生产国尾缀不展示；无登録名兜底「母名の生年」→母名→生年→#id；带尾缀 1 匹、无名 11 匹 100% 兜底。

### §65/§76 · 通算战绩括号（§76 定稿四段）
- **最终落地**：`race-rows.js`（`CAREER_BG` 曾导出后删除，括号直接复用 `PLACE_BG`）；datechart/stats/profile 三渲染点。
- **最终状态**：✅ §76 为最终形态（四段 [1着-2着-3着-着外]）。
- **关键结论**：五段曾加首段「出走」被 §76 瘦身去掉；着外统一出走口径；0 值 →「—」。

### §66 · 字体方案 b（构建期按需子集）
- **最终落地**：`vite.config.js`（`gen-font` 插件）+ `front/scripts/gen-font.mjs` + `subset_font.py`；`noto-sc.css` 只剩 1 条 @font-face（589KB）。
- **最终状态**：✅ 已完成。
- **关键结论**：每次 build 现算语料字符集，变了才重子集；wght 限 300–700；fail-soft（CI 无 python 沿用已提交产物）；旧 101 片归档 `tests/_trash/font-101-slices/`。

### §72 · 数据层提速（races 压缩包 + 统一缓存）
- **最终落地**：`front/public/race-bundle.js`（`YJ.raceBundle.pack/decode`）+ `front/scripts/build-races-bundle.mjs`（build 期替换式）+ `front/public/yj-cache.js`（`YJ.cache`，六产物 12h TTL + SWR）。
- **最终状态**：✅ 已完成。
- **关键结论**：276 请求→1 请求 44KB gzip；数据全站走统一缓存控制器；`manual_overrides.json` 保持 no-store。

### §74 · 文案更名「云崽档案」+「航迹线」
- **最终落地**：`index.html`（title/横幅/侧栏图标）+ `timeline.html`（更名「航迹线」）。
- **最终状态**：✅ 已完成。
- **关键结论**：改名按 §52「侧栏 + title/H1 一一对应」，数据产物/功能名不改。

### §77 · 筛选下拉加宽 + 体重补零
- **最终落地**：`races.html`（`.f-csel` width 238px + `WEIGHT_BINS` 补零）。
- **最终状态**：✅ 已完成。
- **关键结论**：必须显式 `width` 而非 flex-basis（Chromium 忽略嵌套 flex 项 basis）。

### §78 · 性齢列
- **最终落地**：`race-rows.js`（`BASE_COLS` 21→22 列，`sexage` 紧随馬名）+ theme.css（`.yj-mb-sexage`）；78.1 profile 下段/datechart 明细也展示（`build_datechart.py` runs[] 增 `sx/ya`）。
- **最终状态**：✅ 已完成。
- **关键结论**：全部走共享模块基准，页面零列清单改动。

### §80 · 跳转语义统一
- **最终落地**：stats 8 处文案 + `window.open(_blank)` + `race-rows.js`（`raceLink()`）+ `build_datechart.py`（runs[] 增 `rid`）。
- **最终状态**：✅ 已完成。
- **关键结论**：赛事名链接三分流——中央 `race.netkeiba.com` / 地方 `nar.netkeiba.com` / 海外字母 id 兜底 db；无 race_id 不出链接。

### §86 · 硬编码白名单收敛 + 障害重赏（JG1-3）纳入重赏口径（2026-10-01）
- **最终落地**：
  1. **海外场不设白名单**（`scripts/races/racelib.py`）：删 `OVERSEAS_VENUES`，`venue_type()` = 非中央/地方一律「海外」（原「未知」中间态取消）；台账缺 `場名` 也归海外，`fetch_ledger.py` 的 `REQUIRED` 收敛为 `日付/競走名/出走馬名/結果`。
  2. **着順非数字不设合法值白名单**（同文件 `coerce_record`）：删 `RESULT_DNF`，非数字結果一律保留原值（单字 中/取/除/失 仍经 `DNF_ABBR` 归一）；**空結果也收**（结果未出/未填），配套 `merge_races.career_from_recs` 把空結果**排除在通算计数外**（不计出走/着外）。
  3. **成绩页表头必填列最小集**（`scripts/races/fetch_races.py`）：必填仅 `日付/レース名`（缺才返回 `[]`），其余列可选（缺列→字段空，`c()` 与 `race_id/jockey_id` 解析全容错；线上实测表头 33 列无「馬名」列，马名来自 basic.json）。開催白名单未命中 → 去 R 号噪音后**原值作场名**。
  4. **毛色**（`basic/fetch_detail.py`、`races/fetch_detail.py`、`basic/fetch_pedigree.py`）：正则提全 token（漢字1-3+毛）、白名单命中优先、未收录用原值；顺带修掉旧子串扫描把「栃栗毛/鹿栗毛」截成「栗毛」的存量 bug。
  5. **徽章单表 + 障害重赏**：后端 `build_timeline.py` 的 `GLBL`/`GBADGE` 两张表合并为 **`GRADE = {格: (显示文案, 徽章类)}`**（旧名降级为派生别名），前端 `race-rows.js` 同构（`GRADE` + 派生 `G/GLABEL`，新增导出 `YJ.raceRows.GRADE`），两边补 `JGI/JGII/JGIII → JG1/JG2/JG3`（徽章类复用 `g1/g2/g3`，**不新增 CSS**）。
  6. **重赏口径全链路纳入 JG**：`timeline GRADED` / `stats+datechart TROPHY_GRADES` / 两个校验脚本的 `TROPHY_G`、`gradeKey`、`gradedKeys`、`G_SEQ`、重赏合计 / `races.html gradeMatches`+
     新单级选项 JG1-3 / `datechart.html GRADED` / `stats.html` 级别桶·下钻键·重赏步·帮助文案 / `docs/SCHEMA.md` 口径定义。L/OP 仍不算重赏。
  7. **（顺带修存量缺陷）三个校验脚本的 DOM stub 补全 `location`**（`verify_stats.cjs`/`verify_datechart.cjs`/`verify_drill.cjs`）：页面回壳脚本（§88）要读 `location.search/pathname` 并调 `location.replace`，stub 只有 `{href:""}` → 页面冒烟段自 9/30 起**每次 eval 即崩**（`undefined.indexOf`），导致 `run_update.py --ci` 的断言门长期判失败（而 workflow 自己的 commit 步骤照旧提交，所以 CI 表面正常、断言实际没跑）。补全后 4 个校验脚本 112+205+60 条断言 + 三态对账全绿。
- **最终状态**：✅ 已完成。构建通过（dist 已核对：`races.html` 含 JG1-3 选项、`stats.html` 含 JG 桶、`race-rows.js` 含 `GRADE`）；`timeline/datechart/stats` 三产物重算**内容无变化**（现库无 JG 场次 → 零影响、无回归）；合成 JGI 一着穿透测试通过（级别首胜 JG1/N 胜/世代重赏首胜/统计桶 JG1/筛选命中）；4 个校验脚本全绿。
- **关键结论**：白名单只许出现在「能同时覆盖未来取值」的地方——**分类口径（中央/地方 vs 其余）用默认值，不用枚举**；枚举仅保留「归一化词表」（如 `DNF_ABBR`/`ROMANS`），命中就归一、未命中就原值透传，**绝不用枚举做准入判定**。所有消费同一口径的副本（前端筛选/统计桶/断言脚本/文档）必须同轮同步，否则会出现「时间线认、筛选页不认」的静默不一致。

### §87 · 口径词汇统一：「格」归一入口 + 芝ダ 的 障/障害 分裂修正（2026-10-01）
- **最终落地**：
  1. **`格` 归一（新增 `racelib.normalize_grade()`，入库+落库双入口）**：全角折半角（`str.maketrans` 表）→ 去空白/中点/连字符 → 罗马数字折拉丁 → 阿拉伯记法映射罗马记法：`G1-3→GI-GIII`、`JG1-3→JGI-JGIII`、`Jpn1-3→JpnI-JpnIII`（覆盖 `JG2`/`J・G2`/`ＪＧ２`/`JpnⅡ`）。调用点：`coerce_record`（台账 CSV 入库）+ `merge_races.save_races_file`（落库自愈，历史/外部来源一并修正）；未命中值原样返回，台账自由文本（Allowance）与班赛 token（1勝クラス/新馬/未勝利/オープン）不受影响。
  2. **`芝ダ` 口径统一为 `障`**（`racelib.normalize_surface()` 提为公开入口，`_normalize_surface` 兼容别名；`save_races_file` 加入落库归一）。同步 5 处错写成 `障害` 的消费端：`races.html` 跑道筛选选项值（原 `障害` 永远筛不到库里的 `障`）、`i18n.js` 芝ダ 枚举（缺 `障` 键 → 显示不出「障碍」）、`race-rows.js` `SURF_SHORT`（`障害→障` 查表落空 → 跨马表丢「障」前缀）、`verify_datechart.cjs` `SURF_SET`（缺 `障` → 一旦有障碍场次断言即挂）、`SCHEMA.md` §日期图 `s` 取值说明。
- **最终状态**：✅ 已完成。构建通过；三产物重算**内容无变化**（现库 `格`/`芝ダ` 已是规范值 → 零影响）；40 条 python 断言（归一全写法 + 台账入库 + 落库自愈）+ 14 条前端断言全过；4 个校验脚本 112+205+60 全绿。
- **关键结论**：「归一化词表」必须在**入库和落库两个口**都做——只在解析侧归一，外部直接落库的值（台账手填、历史文件、编辑台写入）就会漏；同一份数据语义在库里只能有一种写法（`障` 而非 `障害`），消费端要么读规范值，要么在字典里同时容纳两种写法，**不能只认另一种**。另：`str.translate` 只认 ordinal 键，给字符键会**静默不生效**（本次实测踩到，必须用 `str.maketrans` 构造）。

### §88 · 修复「下钻新开标签页却停在首页」：?page= 扩展名归一 + `..` 校验归位（2026-10-02）
- **最终落地**：`index.html` 外壳 `?page=` 解析块（1 处）：① 扩展名归一——`pn = u.pathname` 不以 `.html` 结尾则补上，再进校验与赋 src（不动 `u.search`）；② `..` 检查从「`u.pathname` 归一后」改为「`wantPage` 原始串」的路径段正则 `/(^|[\/\\])\.\.($|[\/\\?])/`。
- **最终状态**：✅ 已完成（构建 + dist 核对 + 真浏览器 7 用例全绿：①用户原 URL 修复、②③④回归、⑤非法域名仍拒、⑥`..` 现在被拒、⑦query 内合法 `..` 未误伤）。
- **关键结论**：
  1. **根因是托管平台的扩展名重定向**：线上 `/pages/races.html` 返回 **301/307 → `/pages/races`**（实测 GitHub Pages 与 CF Pages 均如此）。于是内容页**独立打开**时 `location.pathname` 已无 `.html`，8 个内容页共用的回壳脚本（`location.pathname.split("/").slice(-2).join("/") + location.search`）算出 `rel = "pages/races?f=…"`，被外壳旧的 `/\.html$/` 校验**拒绝** → `wantSet` 保持 false → iframe 停在默认 profile。**表现为「新开标签页却停在首页」**，而地址栏里的 `page` 参数恰好缺 `.html`（那不是浏览器显示问题，是平台剥的）。**影响面不止下钻**：任何内容页被独立打开（分享单页链接、刷新内容页）都走这条路。
  2. **诊断法教训：本地静态服务器复现不出这类 bug**。`python -m http.server` 不做扩展名规范化，`/pages/races.html` 直接 200，于是本地全绿、线上全红。**凡涉及 URL 形态的问题，必须打真实托管域名验证**（本轮先用 Node 跟随 307 链发现 `/pages/races` 是 200 且 title 正常，才定位到回壳产物）。反向亦然：本地测「无扩展名直开」会 404，那是**测试环境差异**、不是缺陷。
  3. **旧 `..` 校验是空操作**：`new URL()` 已把 `../` 规范化掉，对 `u.pathname` 判 `".."` 永远不命中（实测 `pages/../pages/races.html` 被照常接受）。改为对**原始串**按路径段匹配后，该形态被正确拒绝；用 `(^|[/\\])\.\.($|[/\\?])` 而非裸 `indexOf("..")`，才不会误伤 query 里合法的 `..`（如 `f=venue:..`）——**安全校验要不误伤合法值，只能按结构匹配，不能按子串匹配**。
  4. **顺带澄清一处易误判**：下钻链接的 `data-href` 是裸相对路径 `races.html?f=…`，本轮实测 `window.open` 从 iframe 内调用时**按 iframe 的 baseURI 解析**（`/pages/stats.html` → `/pages/races.html`），故该写法本身正确、与既有 `raceLink()` 的 `profile.html?horse=` 同构；**若将来改由外壳读 `data-href` 导航，必须换成 `pages/races.html` 全路径**（相对基址不同 → 会落到站点根 `/races.html` 404）。此隐患本轮未改（无调用方），仅记录。

### §91 · 航迹线编辑台：节点卡实时预览（2026-10-13）
- **动因**：用户要求编辑航迹线节点时能**实时预览**「自己填写的卡片效果」。
- **最终落地**（`editor.js` + `edit-timeline.html`，逻辑层零改动；脚本 bump `editor.js?v=12` 两壳同步）：
  1. **`tlCardHTML(ev)`**：按 **tlToStore 落表形状**渲染，标记 = timeline.html `eventHTML` 人工节点分支同款（📌 标题 / cn / note / link=hjump / 图位 297:210 / `.tl-tag` 六色）；节点圆点**恒 manual 灰**（`build_timeline.to_manual_event` 硬编码，与所选标签无关——预览不能装作会变色）；图片 src 走 `photoSrc()`（草稿 `draft:tl:` → objectURL、站内页相对、外链全兼容）。
  2. **预览位置 = 表单下方全宽**（`data-tlpreview`）：卡片按真实页 `min(480px,100%)` 渲染，桌面比例像素级一致。首版放表单右侧 300px 侧栏，卡片被压到 ~170px 宽、正文竖排 → **侧栏方案废弃**，教训：预览忠实度优先于「一眼同屏」，卡片必须有真实宽度。**运行时坑（用户实测踩中）**：`tlToStore` 在**空 tags 时不写 `o.tags` 键**（落表契约 tags 可缺省）→ 预览直接读 `store.tags.length`，「＋ 新建」一打开空表单即 `Cannot read properties of undefined (reading 'length')`；教训：**消费派生形状必须按「缺省键」防御**（`(store.tags || [])`），不能假设派生函数总填满字段。修复后以「打开空表单 + 模拟 input 事件」驱动验证 title=OK 且预览逐键跟随——旧驱动带满值标签恰好掩盖了这条路径，**合成测试数据要么极简、要么极满，各测一份**。
  3. **逐键刷新**：输入委托 `data-tf` / `data-tl-label` / `data-tl-tip` 三分支补 `pvSync()`——只换预览卡 innerHTML、不重绘表单（打字不丢焦点）；cat 切换/选赛自动填/传图等本就重渲染的路径无需接入。
  4. **样式**：`edit-timeline.html` 页内 `<style>` 新增 `.yj-pv` 块 = timeline.html 卡样子集的**带作用域副本**（★ 单一出处仍是 timeline.html，改卡片结构/六色必须两处同步——与 TL_CATS「改色同步」同约定）。theme.css 零改动（该样式若进 theme.css 会作用于全站）。
- **验证**：`node --check`；构建 + dist 核对（dist/pages/edit-timeline.html 含 `.yj-pv`、dist/editor.js 含 `pvSync`/`data-tlpreview`）；headless Chrome 驱动页（填好日期/标题/cn/note/站内图/双标签）截图确认卡片与真实页同款。
- **关键结论**：预览的忠实度来自**渲染落表形状而非编辑态**——空标签、未选 cat 等不会落表的值在预览里天然消失（标题空时给「（标题未填）」灰字提示）；跨页样式复用在「仅 2 处」场景走**带作用域副本 + 同步注释**，比抽公共层更稳（与 AGENTS「仅 2 处不动」一致）。

### §92 · 引用比赛 → 比赛样式人工节点（タイム/上り/人気/騎手/調教師 全可选，2026-10-13）
- **动因**：用户实测发现「引用比赛」生成的是素格式卡（📌 标题 + 标签），与真实比赛卡（格徽章/场次/着顺+馬名/KPI 条/騎手調教師）**格式对不上**；要求 タイム/上り/人気/騎手/調教師 等可选填。
- **最终落地**（数据契约变更，SCHEMA.md 已同步）：
  1. **`timeline_manual.json` 人工节点新增可选比赛样式字段**：`rank`（着顺）· `time` · `agari` · `pop` · `jockey` · `trainer` · `grade`（原始格）· `meta`（场次一行）· `hero`（馬名）· `hero_cn`（副名）——全字符串、空值不写；`build_timeline.to_manual_event` 同名单透传 + 从 `grade` 经**同一 grade-table**（GBADGE/GLBL）派生 `gbadge`/`glabel`。
  2. **timeline.html 人工分支双态**：带任一比赛字段 → race 分支同款结构（格徽章/场次行/着顺+馬名行/KPI 条/騎手調教師，📌 只留给素格式）；否则维持原素格式。着顺徽章走既有 `.yj-no1/2/3` 数据语义色，非数字（中止等）无底色。
  3. **编辑台表单**：引用比赛时出现四组可选字段（成績/陣営/赛事/馬名，多字段行复用 refRow 网格）；选赛即按 `to_render_event` 同口径**自动预填**（`raceNameText` 剥徽章代劳的格级尾缀、騎手=騎手 · 斤量kg、场次=場名+R · 芝ダ+距離m · 馬場）——全部可改可清；编辑素格式老节点不受打扰（显示条件 = isRace || 已含字段）。
  4. **实时预览 rich 分支**（§91 预览扩展）：与真实页 rich 渲染同构；格徽章 = `window.YJ_GRADE` 单一出处（经 race-rows.GRADE，与后端同源 config/grade-table.json）；`.yj-pv` 样式副本补 KPI 条 + 格/着顺徽章两行页内变体。
  5. edit-timeline.html 加载 `race-rows.js?v=7`（GRADE/raceNameText 复用，不再复制映射）；editor.js bump v=14。
- **验证**：node/py 语法 + 构建 + dist 核对；**端到端驱动**（注入合成 bundle 记录走真实 `applyRefRace` change 链路）断言 title 剥尾缀/rank/pop/jockey/meta/hero 全对（title=OK）；**真实页链路**：临时塞合成节点 → `build_timeline.py` 重算 → timeline.html 截图确认 rich 卡与自动比赛卡同构（G1 徽章/场次/金 1 徽章/KPI/騎手調教師）→ `git restore` 还原数据文件 + 重建 dist 清除合成节点（**验证注入的数据文件必须还原**）。
- **坑**：改数据文件验证真实页时，`dist/data/` 是上次构建的副本——不重建就截图会误判「渲染丢了节点」（共 6 条 vs 构建 7 条）；任何 scripts/ 数据重算后必须 `npm run build` 才进 dist。
- **关键结论**：人工节点从「只能素格式」升级为「比赛样式可选」，**浅引用哲学不变**（不改 build_timeline 事件语义，只做字段透传与同构渲染）；「引用比赛」从此零手打可得一张与自动卡同构的赛果卡。

### §93 · 草稿箱：备注简显 + 独立查询页（2026-10-13）
- **动因**：用户反馈 ①抽屉里的备注整段铺开太啰嗦（如图片本地化全过程几百字），只要「什么时间引入了什么照片」；②草稿箱要有**独立查询页**（保留现有快速检索抽屉的同时）。
- **最终落地**：
  1. **备注简显 `noteBrief()`**：匹配「`YYYY-MM-DD 短标题：`」前缀 → 一行只显示「日期 + 冒号前短语」（例：`2026-09-30 图片本地化`），全文放 `title` 悬停可看；无该模式的备注截 42 字。**备注正文不动**（提交仍整段入库）——只改列表/抽屉的展示；备注输入框 placeholder 同步引导「一句话即可（何时引入了什么照片）」。作用于抽屉条目 + 已保存展开详情两处。
  2. **新页面 `edit-drafts.html`**（第三个编辑 Tab「草稿箱」，vite PAGES 已注册）：**未提交草稿**（时间线快照 / 比赛配图 / 按马合并的字段+图片，通栏 + 每条可放弃）+ **已保存人工表值**（全宽列表 + 检索）一页通览；保存条 = 同款「提交到 GitHub」，提交/PAT 设置与编辑页同一链路。
  3. **复用收口**：抽屉与查询页共用 `draftEntriesHTML()`（从 boxHTML 抽出）+ `pinsHTML()` + `state.savedQ` 检索状态 + `discardOne()`（放弃一条的逻辑从抽屉事件里抽出）；编辑壳三 Tab 同构（基本信息 / 航迹线 / 草稿箱）。
  4. editor.js bump v=15；查询页 init `mode:"drafts"`（加载 horses+table、不选马、`applyTab` 跳过）。
- **验证**：node 语法 + 构建 + dist 核对（新入口 / noteBrief / draftsHTML / discardOne 均在）；驱动测试 = 种子草稿（含长备注）→ 查询页断言渲染 + 检索过滤（title=OK:4）+ **简显生效截图**（几百字备注只显示「2026-09-30 图片本地化」）；**抽屉回归**（重构后 boxHTML 仍完整：草稿条目 / 已保存段 / GitHub 段，title=OK:1943）。
- **坑**：①驱动在静态按钮出现即点击 → 抽屉在 `loadTable()` 完成前打开，「已保存」段为空——真实用户场景 init 完成后的 render 会自动补全，测试要等 `state.table` 就绪再点；②新页面必须在 `vite.config.js` PAGES 注册，否则 `npm run build` 静默不产该页（dist 无文件才发现）。
- **关键结论**：草稿箱信息架构 = **抽屉管「快」，页面管「全」**——同一份数据、同一套检索状态、两条入口；备注属于「过程说明」，展示层给摘要、数据层保全量，两头都不丢。

### §94 · 基本信息：字段拓展 + 中文单显（2026-10-13）
- **动因**：用户反馈 ①要拓展可编辑字段（原表只开 5 个字段）；②行标签「中文 + 日文字段键」双写、下拉值「原值（中文）」双写重复，只留中文名。
- **最终落地**：
  1. **字段拓展（5 → 17）**：新增 12 个 basic.json 契约内可人工修正字段——自译馬名（=显示名控制）/馬名意味/生年/生年月日/産地/母名/生産牧場/通算成績/セリ取引価格/獲得賞金 (中央)/(地方)/総賞金；中文名全部命中 i18n FIELD 字典零改动。**刻意不开放**：派生列（収得賞金/母父/馬齢/性別_当前/通算成績_逐场——管线自动算，钉了没意义）与技术键（nk_id/jbis_id/*_file）。apply_overrides 本就任意键生效 + order_horse 保留模板外键 → 机制零改动。
  2. **中文单显**：行标签删 `.yj-ed-row-sub`（日文字段键不再上界面，键身份由 SCHEMA 承担；theme.css 同步删该类）；下拉值 `optLabel` 改「枚举字典命中 → 只显中文，未收录回退原值」（黒鹿毛（黑鹿毛）→ 黑鹿毛、現役（现役）→ 现役、牝（母）→ 母）；草稿箱 chips `pinValueText` 同口径中文单显。
- **验证**：构建 + dist 核对（row-sub 类消失 / 17 字段 / optLabel cn-first / 三壳 v=16）；驱动断言 `OK:18 paren=0 sex=公/母/阉`（18 行 = 17 字段 + 备注；下拉值零「（」双写；性别枚举全中文）+ 实页截图（12 新字段自动带出真实值，无样式回归）。
- **关键结论**：编辑表单的字段集 = **契约的「人工可修正子集」投影**——新增字段只改 FIELDS 一处（i18n 名与合并机制现成）；「键身份」信息从界面退到文档，界面只讲人话。
- **修正（同日用户反馈）**：马名含义/出生年/出生日期/产地/母名/生产牧场 6 个档案性字段撤下不放开；加开 香港馬名（港译）。驱动复验 `OK:13 gone= hk=true`（13 行 = 12 字段 + 备注）。
- **修正二（同日用户反馈）**：毛色也撤下禁止修改（定稿 = 核心 4 + 名号 2 + 赏金成绩 5 = **11 字段**）；性別下拉显示改 牡/牝/**骟**——**i18n ENUM 性別全局改**（牡→牡、牝→牝、セ/セン→骟），option value 仍存数据原值 セ（落库/合并口径不变），profile sexBadge「⚲ セン」→「⚲ 骟」、pedigree 性别文本同源自动跟随；i18n.js bump v2（全站 10 处引用）、editor v18。驱动复验 `OK:12 sex[牡=牡 牝=牝 セ=骟]`。

### §95 · JRA登录状态箭头链：抹消后去向可视化（2026-10-14）
- **背景**：コントレイル产驹 46 匹抹消马经 keibabook 免费页去向调查（探索产物 `tests/keibabook_masyoba_202610.csv`；地方 5 匹免费页明示、繁殖/乘马 40 匹按性别推定、1 匹不明），用户要求档案页「JRA登录状态」从单值升级为**箭头链**（视觉稿 `tests/status-chain-mockup.html` 定稿：虚线=推定、实线=已确认）。
- **数据侧（先于代码）**：`basic_io.py::BASIC_FIELDS` 31→**35 键**（`登録状態` 后插入 抹消日/抹消_去向種別/抹消_去向場所/抹消_去向確認，SCHEMA §1 契约表与 §3 编辑台白名单同步）；46 匹值钉 `manual_overrides.json`（種別枚举 `地方競馬|繁殖|乗馬|死亡|海外|不明`、確認枚举 `确认済|推定|需会员`）；离线 `merge_races` + `merge_basic` 落库（277 匹全带键、46 匹有值、键序=契约位）。
- **展示侧**：新组件类 `.yj-stb*`（theme.css @layer，类名在 yj-util.js 有字面量不被裁）；渲染单一出处 = `yj-util.js` **`YJ.util.statusChain(h)`**（§48 全站统一语义收口，profile 行内 + 编辑台预览共用）：現役=青绿实心（现状不变）、抹消=灰、地方=chart-2 蓝、繁殖=chart-3 橙、乘马=灰、死亡=destructive 红、海外=primary 青（预留）、未明=浅灰——**实线=确认済、虚线=推定/需会员**；文案全走 i18n（FIELD 3 词条 + ENUM 2 组），草稿预览经 draftOv 叠加自动生效。
- **编辑台**：FIELDS 增抹消组四字段（種別/確認走 `f.static` 固定枚举，controlHTML 支持固定枚举选项）；**登録状態=抹消 才展开**子表单 + 尾部「预览」行（`previewRowHTML`：草稿→人工值→生效值合成后走 statusChain）；文本改动 `softRefreshRow` 联动刷新预览行、select 走 change 全量 render 自动出现/收起。
- **验证**：`npm run build` 通过；dist 核对 theme-*.css 含 yj-stb 全类 / dist basic.json 46 匹有值（id20 園田 ✓）/ yj-util·i18n·editor 新逻辑在位。
- **关键结论**：箭头链是**展示层拼接**——数据侧 `登録状態` 保持官方值不污染，去向四键人工钉住（脚本只读永不写，CI 抹不掉）；编辑台交互与档案页预览同源一处渲染，改样式两处自动一致。
- **修正一（同日用户质询 id100 依据）**：「抹消前的地方出走」被误读为移籍证据——实为**交流战**（JRA 所属马出张，race 条件行带「交流」、厩舎栏仍 JRA）。复核全部 5 匹「地方确认済」：id100 門別（7/22 リゲル特別、9頭中6頭JRA厩舎）/ id27 金沢（7/7 加賀片山津津賞）/ id85 大井（9/2）三匹改为 **不明·空场所·需会员**；id20/id84 证据 = 马页厩舎栏变为園田调教师（移籍登录后才出现的字段变化），成立保留。**判定口径收进 SCHEMA §3**：移籍确认 = 厩舎栏地方化 或 近況履歴移籍备注；出走日期早于抹消日 = 交流战 ≠ 移籍。
- **机制补丁（伴随修正一）**：apply_overrides 跳过空值是防误清设计，但抹消组四键无抓取来源、旧值烤在 basic.json 里永远清不掉 → `core/manual.py` 套用前先重置 `constants.MASYO_GROUP_KEYS`（人工表 = 唯一来源，空覆盖即清空、删条目即降级），basic/races 两管线自动一致。
- **窄列适配定稿（同日）**：確認度从正文拆进徽章小字槽（`yj-stb-d`，与抹消日期同款）——「去向未明·需会员」9 字在 ~88px 值区必然裁切；`.yj-stb` 改 flex-wrap + max-w-full（正文 `.yj-stb-t` 锁 nowrap），窄列时小字折进虚线框内第二行、宽屏仍单行，任意内容组合都完整可见。
- **修正二（同日用户定稿，落库规则收紧）**：**只有「确认去向」才落库**——推定/猜测一律不写入（按性别推定的 繁殖/乗馬 全部撤下，只进调查底稿 CSV），不确定就只留抹消日；「確認度」字段整个废弃（含 需会员/推定/不明 枚举与实线/虚线区分——库里只有确认去向，徽章一律实线），BASIC_FIELDS 35→**34 键**，`MASYO_DROP_KEYS` 随每次套用清除废弃键且永不再写入；editor 種別枚举去掉「不明」。展示降级：44 匹只显 [抹消 日期]，2 匹（20/84 園田）显完整箭头链。

### §96 · status 任务直写 basic.json + 死亡文案（2026-10-15）
- **数据层（§95 修正二的后续，用户定稿）**：新增独立日频任务 `scripts/status/run_status.py`（不进 run_update 编排）——NAR 竞走馬一覧（1 请求，免登录）+ keibabook 抹消馬簿（栗東/美浦 2 请求，约 2 周滚动窗口）→ 比对 → 馬検索/近況履歴补抹消日 → **直写 `data/basic.json` 抹消组四键 + `kb_id`**；人工表回归纯人工（脚本永不写）。落库守则：NAR 所属場=地方 → 确认去向（**所属場原文直存不做映射**，同 美浦/栗東 一个道理）；所属場=JRA 一律跳过（含「抹消」标也不深挖，仅报告列出）；推定/猜测绝不入库。证据明细只进报告 `tests/status_task_report.md`，不进 basic.json。
- **契约**：`BASIC_FIELDS` 34→**35 键**（`jbis_id` 后插 `kb_id`，SCHEMA §1 表重编号）；抹消组改**双写入者逐键合并**（`apply_overrides`：人工条目里出现的键覆盖/显式清空，其余键保留任务值——旧「有条目即整组重置」会洗掉任务补的值，弃用）；`merge_races` VOLATILE 对 `登録状態` 加守卫（netkeiba 对移籍马回空、且长期残留「現役」，两者均不覆盖已有非空值）。pipeline.md 新增 §4（status 任务，旧 §4/§5 顺延为 §5/§6）。
- **首次运行成果**：NAR 31 匹（地方 22 / JRA 跳过 9）——15 匹补齐 抹消+地方競馬+所属場原文+kb_id（含 ハニージョー 2026-08-26·兵庫），其中 14 匹经 kinkyo 补抹消日；5 匹去向修正（88 大井/93 船橋/95 金沢/100 愛知/125 大井）；人工钉 2 匹（20/84 園田）原样未动；全库 抹消 46→61。未出走移籍马（189 浦和）无抹消日属正常（本无中央登録可抹）。
- **展示侧**：死亡徽章文案「死亡 · 斃死」→「**死亡**」（i18n ENUM 改动，存储枚举值不变）——斃死 为竞马法规术语，用户定稿过直白。组件类 `.yj-stb*` 与 `statusChain` 结构零改动。
- **验证**：`--dry-run` 报告逐项核对 → 正式落库 → `merge_basic` 复跑确认任务值跨合并存活、人工 園田 未被动 → `npm run build` 通过。
- **追記（同日，用户 3 点定稿）**：① NAR 列表**翻页兼容**——「次の50頭」锚跟随 `k_pageNum`（50 行/页，キズナ级产量验证）；② 新增**調教師覆盖**——NAR 馬详情页（RaceHorseInfo，仅地方马）調教師格「長　倉　　　　功（兵庫）」→ 压名字填充空格、**保留（所属）尾缀** →「長倉功（兵庫）」直接覆盖 basic（22 匹全落，与 20/84 厩舎栏人工证据交叉一致；人工钉調教師则跳过）；③ 20/84 去向移交脚本（人工表删 種別/場所 键，園田→兵庫，抹消日仍人工钉）；④ 代码简化 + 探针清理。
- **追記2（同日）**：46 匹抹消日**全部移出人工表、由 status 任务直接入库 basic.json**（用户定稿「脚本抓的数据直接入库」）——manual_overrides 抹消组条目清零，仅剩 5 个真实人工钉（40/66/92/142 photo、77 香港馬名）；数据仍在 basic（60 匹抹消日全齐），任务幂等 0 变更，合并存活。
- **追記3（同日）**：新增 **keibabook 补查遍**（用户定稿触发「抹消或空白 + 无去向 + 人工无值」）——馬検索拿 kb_id（kb_id 覆盖 15→100 匹）→ 马页 kanzen（中央抹消标/厩舎栏）+ 近況履歴；抹消标=确凿抹消证据、厩舎栏非中央地名=地方去向（存原文，同 園田 口径）；未登录/未出走/海外 = 观察段留痕不催人工（待办段只留真正需人工项）。报告五段结构定稿。
- **追記4（同日）**：档案页标签文案定稿——「登録状態」中文标签 **JRA登录状态 → JRA注册状态**（消除「登录=login」歧义；值文案保留「抹消」，仅动 i18n 字典不动 JSON）。
- **追記5（同日）**：编辑台拓展（用户定稿，含一次修正）：① 種別下拉 = `地方競馬|繁殖|乗馬|種馬`（新增 种马 枚举；死亡/海外 移出人工下拉——死亡=抹消馬簿斃死自动映射、海外=预留；展示枚举仍全量）；② **kb_id 不开放**（修正：技术键保持任务唯一写入层，任务侧 pinned 守卫保留——直接改 JSON 的人工钉仍被尊重且补查优先用人工值）；③ controlHTML 现值不在固定枚举时追加选项（防存量值保存误写空）；④ 抹消日/去向場所 維持既有开放（登録状態=抹消 时展开）。
- **追記6（同日）**：死代码清理 + **预览行回归修复**：`MASYO_DROP_KEYS`/`抹消_去向確認` 全链清除（constants/manual.py 两处死防御——库里早已无此键）；顺带发现编辑台抹消组**实时预览行从未渲染过**（formHTML 插入点误绑已废弃的 確認 字段 → 永假，联动刷新也找不到目标行）——插入点改到组尾 `抹消_去向場所`，切到「抹消」即见预览行，文本改动联动恢复工作。
- **追記7（2026-xx 用户决策）**：编辑台抹消组**空状态展开** + **死亡加回下拉**——① `登録状態` 为空（未登録/空值）时同样展开抹消组三字段（原仅 `=抹消` 才展开；formHTML 改 `showMasyo = st==="抹消" || st===""`）；② 種別下拉补 `死亡`（`地方競馬|繁殖|乗馬|種馬|死亡`；海外仍预留不入下拉）；③ `statusChain` 展示同步——空状态 + 有去向 → 单显去向徽章（无前置状态徽章故不带箭头，如 `[死亡]`），档案页与编辑台预览行一致。

### §97 · 访问统计双线：Vercount 保留计数（不展示）+ GoatCounter 计数/展示（2026-10-19）
- **动因**：Vercount 只给页脚两个数字、无任何详情维度（页面/来源/地区/时段全没有）；用户定稿「双线执行」——Vercount 继续计数（历史连续 + 冗余对照）但不展示，引入 GoatCounter 作展示端与详情后台（账号 code = `yunji`）。
- **最终落地**：
  1. **`public/yj-visit.js` 重写为双线注入**：① Vercount 照旧加载——页脚已无 `busuanzi_*` 容器，其脚本取不到 DOM → 只计数不展示（计数走 API POST，与 DOM 无关）；② 注入 GoatCounter `count.js`（`data-goatcounter` → `yunji.goatcounter.com/count`，上报）+ **自写页脚回填**：`GET https://yunji.goatcounter.com/counter/TOTAL.json` → `{"count":"1,234"}`（官方 Visitor counter 端点；`TOTAL`=全站合计、大小写敏感无前导斜杠；服务端缓存最长 4h → 数字非实时）。成功才 hidden→inline，超时 5s（AbortController）/失败/被拦截 → 一直隐藏（口径同 §85 第 4 条）；`index.html` 引 `yj-visit.js?v=3` 绕缓存。
  2. **`index.html` 页脚**：两个 `busuanzi_*` span → 单个链接容器 `gc_container_site_pv`（「总访问 N 次」**本身即后台链接** → `yunji.goatcounter.com`，title 提示详情维度）；**「访客 N 人」撤下**——GoatCounter 公开端点只有 PV（`count_unique` 已废弃、恒等于 count），UV 去后台看。所用类均为既有类（hidden/font-medium/text-foreground/80），theme.css 无新候选。
- **前置（用户操作）**：GoatCounter 后台开启 **Settings →「Allow adding visitor counts on your website」**（默认关；关着时端点 403 HTML 错误页——2026-10-19 Node 探针实测 `TOTAL.json`/`//.json` 三变体全 403，探针存 `tests/_trash/probe-gc.mjs`）。**开启后同日复验**：`TOTAL.json` → **200 + `access-control-allow-origin: *`** + `{"count_unique":"0","count":"0"}`（千分位字符串，与官方文档一致，count_unique≡count 已亲证）；对照 `//.json`（路径 `/`）→ 404（路径无数据时官方即回 404）→ **TOTAL 是唯一正确取数形态**（本站入口路径不定，全站合计天然规避）；上线后 count.js 开始上报，数字从 0 起算。
- **已知局限**：公开端点数字最长滞后 4h；无 UV；无「今日/近 7 天」页脚维度（后台有）；`count` 为千分位格式化字符串（按字符串回填展示，解析仅作有效性校验）。
- **关键结论**：官方 count.js 的 `visit_count()` 渲染块（200×80 带品牌框）不适配迷你页脚 → 走 `.json` 端点自建回填才是正解；Vercount 的「计数」与「展示」本就解耦（计数 POST 与 DOM 无关），删容器即得「只计数不展示」，双线互不干扰零 hack。
- **追記（同日，计数口径实测）**：页脚数字口径 = **会话去重访问数（visits），非原始页面加载**。官方 Sessions 文档「GoatCounter only counts visits」（会话 = siteID+UA+IP，内存 8h 窗口，窗口内同路径重复访问折叠）+ 合成实验坐实：同会话 7 次命中（`/`×3 + 3 条测试路径各 ×2）→ TOTAL 仅 **4** = 每路径恰 1 次。与「自然日去重」的差异：①8h 窗口跨段（早晚各一次 = 2）；②IP/浏览器变化 = 新会话；③不同入口路径（`/`、`/dist/`…）各算 1。**严格自然日去重 GC 不支持**（窗口固定 8h 不可配，要则自建 CF Worker/KV 或换 Umami 类）。用户侧「不统计自己」可用官方 `#toggle-goatcounter` 开关（count.js 内置，写 localStorage `skipgc`）。
- **追記2（同日，counter 端点缓存陷阱 + 探针法）**：`/counter/*.json` 同 URL 重复读会吃到**最长 4h 的服务端缓存**（实测连读全是 0 假象）；换正式参数（如 `?start=year`）即换缓存键读到真值——页脚数字滞后 ≤4h 属预期、低流量站更明显。探针法沉淀：①合成上报必须走**真实客户端形状**（sendBeacon + 全参数 query `p/r/t/e/s/b/q/rnd`；手搓 POST JSON 被 400 拒）；②count.js 客户端丢 localhost/file://（`data-goatcounter-settings='{"allow_local":true}'` 正当解开）+ bot 标记（headless 需 `--user-agent` 遮 UA，`navigator.webdriver` 不能开）；③counter 读路径用字面量双斜杠 `/counter//path.json`（%2F 编码形式路由 404）；④counter 响应有缓存，验证必须换缓存键。探针存 `tests/_trash/probe-gc*.mjs` + `gc-probe/`。**测试残留待清理**：账号含 4 条探针路径（合计 4 次访问），上线前后台删除归零起算。

### §98 · 名字区增补「马名含义」（2026-10-20）
- **动因**：用户指出档案页名字区（日文/英文/港译/自译）**从未展示 `馬名意味`**（studbook 意味・由来 原文，数据侧 268/277 有值、只剩 9 匹空），且认定名字区下方就是最合适的位置。此前该字段只在 §94 编辑台白名单里出现过一次（定为「档案性字段不放开」），展示层完全没接。
- **最终落地**（`front/pages/profile.html` `render()` 名字区，单文件改动）：
  1. **结构**：`nameHeader` 由「名字行」改为列容器——名字行（四槽 + `/`）不变，其下新增**含义行**；因此它天然落在照片/资料表/血统图整块之上、贴着名字，宽度与详情列同宽。
  2. **视觉**：标签沿用名字槽的小字标签语言（10.5px、`tracking-[1.5px]`、`muted-foreground/80`），正文 13px `leading-relaxed` `secondary-foreground` 并标 `lang="ja"`（原文是日文，字体栈自动回退）；**不做彩色徽章/底纹**，避免把注释性信息抬高成主字段。
  3. **空值与响应式**：`馬名意味` 为空 → 整行 `''` 不渲染（9 匹不出现空行，也不留「—」占位）；`max-md` 断点下标签与正文上下堆叠（文字 12px），窄屏不挤成两行悬挂缩进。
  4. **口径**：文案标签复用 i18n FIELD 既有词条 `t("馬名意味")` → 「马名含义」（**i18n.js 零改动**）；取值读 `hv`（草稿叠加视图），与资料表 `fi()` 同源，将来若重开该字段编辑则草稿自动生效。
- **验证**：`npm run build` 通过；dist 核对 `dist/pages/profile.html` 含含义行结构（`lang="ja"` / `leading-relaxed`），`dist/assets/theme-*.css` 已生成全部新用 utility（`text-[13px]`、`muted-foreground/80`、`max-md:flex-col` 等，headless 实测生效）；截图 `tests/_shot/v98-*`：id=231 プレイヤ「魅力的な男」、**最长文案 id=24 オールトクラウド**（38 字仍单行）、**空值 id=130 Grand Warrior 无空行**、430px 窄屏标签/正文上下堆叠。
- **关键结论**：`馬名意味` 是**名字的注解**而非档案字段——所以放在名字区、弱化排版、空值整体缺席，比塞进右侧资料表（会把 10 行拉到 11 行、且语义层级错位）更贴合阅读顺序；日文原文直接展示是当前唯一正确形态（库里无中文译本，自译名 ≠ 含义）。

### §99 · 主胜鞍：逐场派生精选 + 概览色带第二行（2026-10-21）
- **动因**：用户要求档案页展示「主胜鞍」，并给出筛选规则（重赏 > OP/L > 最高班赛 > 新馬/未勝利；重赏最多 4 条、同级取近者）。放置位置**先按选项落地在右侧资料表最后一行**（拍卖价格之后），同日用户实测后否决：加一行把整个资料表撑高、照片/血统列被拉长，观感差 → **改挂「数据概览 · OVERVIEW」色带内部第二行**（见文末修正，定稿）。
- **数据侧（无新增抓取）**：
  1. **派生字段 `主勝鞍`** 进 `basic.json` 契约（`core/basic_io.py::BASIC_FIELDS` 35→36 键，插在 `通算成績_逐场` 之后；同时加入 `BASIC_DERIVED_TAIL` 与 `order_horse` 归位链，`merge_basic` / `merge_races` 两管线同序）；元素 = `{日付, レース名, 格, 場名}`。
  2. **规则单一出处 = `scripts/races/merge_races.py::MAJOR_TIER` + `major_wins()`**（层级数字越小越优先）：重赏 `GI > JpnI > GII > JpnII > GIII > JpnIII`（障害 JGI/JGII/JGIII 与 G1/G2/G3 同层）＞ `L > OP` ＞ 班赛 `3勝 > 2勝 > 1勝` ＞ 新馬/未勝利。实现为「命中最高一级」：有重赏只取重赏（最多 `MAJOR_MAX=4`，同级日期近者优先）；无重赏有 OP/L 只取 OP/L（同样 4 条）；否则取最高班赛 1 条；只剩新馬/未勝利取最近 1 条。只看 `結果=1` 且带 `日付`。
  3. **`格` 空白（地方竞马 / 海外台账行）不进榜**——没有级别信息无法排序；当前 8 匹只有这类胜场，落库为 `[]`（展示侧整行不渲染，见下）。口径已写进 `docs/SCHEMA.md` §1（含层级表与「最多 4 条」常数指引）。
  4. 实测落库：62 匹非空（GII×2 / GIII×1 / L×1 / 1勝クラス×11 / 2勝クラス×1 / 未勝利×32 / 新馬×14）；当前库内无多胜同级样本，故用合成记录单测覆盖「4 条上限 / 同级近者优先 / 重赏压制班赛 / OP·L 压制班赛 / 最高班赛只取 1 条 / 空格不入选 / 2 着不入选」。
- **展示侧（`profile.html` + `theme.css`）**：挂在**「数据概览 · OVERVIEW」色带内部第二行**（全宽脚注行 `.yj-ov-wins`，细分隔线与上方 KPI 分开）：年份（11px 弱化 tabular-nums）+ 赛名（13px）+ 等级徽章，多条目 `flex-wrap`；标签 `主胜鞍 · MAJOR WINS` 沿用色带 `.yj-ov-k` 小字标签语言。徽章与「赛名去等级尾缀」复用共享模块 `front/public/race-rows.js`（`gradeBadge` / `raceNameText` 单一出处，profile 新增该脚本引用；徽章依赖 `site-config.js` 注入的 `window.YJ_GRADE`，原已加载）。**空数组 → 整行不渲染**（不显示「—」，不占色带高度）；`max-md`（767px）下标签独占一行、条目换行。i18n 新增 `主勝鞍 → 主胜鞍`（FIELD 字典一条），资料表不动（保持 10 行）。
- **验证**：`npm run build` 通过；dist 核对 `data/basic.json` 含 36 键与 `主勝鞍`、`pages/profile.html` 含色带脚注行与 `race-rows.js` 引用、`theme-*.css` 含 `.yj-ov-wins` 系类；headless 截图 `tests/_shot/v99b-*`：id39 京都新聞杯 [G2]（色带第二行）、id67 大寒桜賞(1勝クラス) 无徽章、id231 プレイヤ 无脚注行（色带高度不变）、430px 窄屏标签/条目换行、4 条模拟数据单行不溢出（临时改 dist 副本预览后已还原）。**构建注意**：本次首轮构建曾出现 dist 被清空后中断（只剩 public 副本），重跑即恢复——改完数据/脚本后必须确认 `dist/pages/profile.html` 与 `dist/data/basic.json` 都在，别只看命令退出码。
- **关键结论**：主胜鞍是**逐场成绩的展示精选**而非新抓取字段——层级规则沉在管线一处，前端只做渲染；「最多 4 条」是产品口径（常数在 `MAJOR_MAX`），将来放宽只改常数 + 重跑 `merge_races`。展示位置最终定在概览色带第二行：**成就信息归成就区**，且脚注行只在有胜鞍时出现，不给无胜鞍的 215 匹增加任何高度。
- **修正（同日用户反馈，定稿）**：资料表行版「加多一列导致 table 增高、很难看」→ 主胜鞍移入数据概览色带第二行；资料表恢复 10 行、照片/血统列高度回落，色带仅在 `主勝鞍` 非空时多一行。旧截图 `tests/_shot/v99-*`（表格行版）保留作对照，现行版看 `v99b-*`。

### §100 · 比赛记录 后3F：末脚金银铜 → 值直接套人気/着順徽章（2026-10-21）
- **动因**：数据侧已落 `末脚` 字段（金/银/铜/""，docs/SCHEMA.md §2；同日另一任务补齐 801 条历史），用户要求 races.html 展示，定稿口径：「**后3F 这一列的值直接套上人気、着順的样式**，金银铜对应 1/2/3」——不加列、不改结构、不做新样式。
- **最终落地**（共享模块 `front/public/race-rows.js` 单处，零新增 CSS 类、零新列、列数不变 22）：
  1. **`agariBadge(r)`**：上り 值 + 末脚 → 金→`yj-no yj-no1`、银→`yj-no2`、铜→`yj-no3`（= 人気/着順徽章**原类**），值原样放进徽章；无 medal / 台账缺键 → 纯文本。
  2. **inline `width:auto;padding:0 5px`** 押过档位 `.yj-lib.fs* .yj-no` 的定宽方块（值 4 字符放不进 26px；inline 优先级 > (0,3,0) 档位选择器），高/字号/圆角仍随徽章与档位缩放；列宽 `min` +12（左右 padding+边框）。
  3. PC `pc` 与 mb `mbItem`（raw 通道）同一段徽章输出，两视图一致；embed 视图彼时隐藏上り → 内嵌/明细零影响（§101 已解禁展示）。
- **验证**：探针 `tests/_tmp_probe/render_agari_probe.cjs` 9/9（金/银/铜三类徽章精确断言 + 无 medal 纯文本 + lib 22 列/embed 隐藏上り 回归）；`npm run build` 通过、dist 核对含 `agariBadge`；`verify_drill.cjs` 59/60（唯一失败仍是既有 554kg 体重档断言漂移，与本节无关）；headless 截图 `tests/_shot/v100b-*`：PC 13 行逐行核对（金 32.8/34.2 黄、银 33.6/34.7/34.6 蓝、铜 33.8 橙、其余纯文本）+ mb 卡片同款、与同卡人気徽章同色系。
- **关键结论**：末脚是上り 的属性——**值本身徽章化即达意**，不动列结构；`yj-no` 底座类的档位定宽是唯一坑（inline style 押制，避免新增 CSS 与 specificity 纠缠）。
- **修正（同日两次返工）**：v1 着順浅底三件套整格上色（挂 td）→ 用户否决「样式用错了」；v2 独立「末脚」列（金银铜徽章 chip）→ 用户否决（要求不动结构）。定稿 = 现行 v3（值直接套徽章）。

### §101 · 后3F 列序调整 + profile 内嵌/日期统计明细解禁 + 明细分页（2026-10-21）
- **需求（用户三条）**：① 比赛记录 后3F 移到着顺后面；② PROFILE 的 比赛记录 · RACES 内嵌表新增 后3F 列；③ 日期统计明细加 后3F 列并分页——PC 一页 100 条、mb 一页 10 条。末脚只作颜色判断，**不新增末脚列**。
- **落地**：
  1. **列序**：`race-rows.js` 基准 `BASE_COLS` 上り 移到 place 后（人気→着順→上り→タイム→着差）——单一出处改序，lib/mb/内嵌明细自动跟随；`BASE_LINES`（mb 分组行）不动。
  2. **内嵌/明细解禁**：embed 视图 hide 清单去掉 `agari`（16 列 含馬名 / 15 列不含）——profile 下段 RACES 与 datechart 明细是同一份 embed 代码，同时获得 后3F（金银铜徽章随 `agariBadge` 自动生效，§100）；datechart 短键产物补 `ag`（上り）/`ms`（末脚，仅配色判断不单独成列）两字段（`scripts/datechart/build_datechart.py`，docs/SCHEMA.md §6 模板同步），页面 `toRow` 补映射。
  3. **明细分页**：datechart.html `DETAIL_PAGE = { pc: 100, mb: 10 }`，页码状态 `st.dp.pc/mb` 各自独立（PC 表/mb 卡两套列表 CSS 断点各自显示，不引入 JS 设备判断）；口径/场地/锚点变化在 `render()` 归 1，页码点击委托在 `#dBody` 只重画明细区；页码组件 Tailwind utilities 现拼（首尾页+±2 窗口+省略号+「第 x/y 页 · 共 N 条」），本页第 2 处 pager、按「≥3 处才抽离」约定不共享 races.html 页内样式。
  4. **embed mb 卡补 后3F**（同日追加需求）：embed 视图 mb 分组 line 1 = `race/distMerged/baba/time/agari/prize`（後3F 隨 時間 相邻，同 lib 分组 time→agari 惯例）；顺带修 `mbi()` raw 分支不渲染 label 的旧口径——label 对 raw 同样生效（既有 raw 用点：horse 不在 mb 分组、race 无 label → 零视觉影响），後3F 无 medal 走常规 `mbi(lb, v)` 通道（label + `<b>` 值），金银铜 raw 嵌 chip（label 照常）→ mb 卡「后3F：[chip]」与其他项格式一致。
- **验证**：探针 15/15（新增 lib 上り 紧随着順、embed 解禁含徽章、embed/lib mb 徽章 + label 断言）；`verify_datechart.cjs` 112/112（EXPECTED_KEYS 25→27、PC 表头 15→16 随改；顺手修一处**既有数据漂移**——日期面板「数据末日之后禁用」原从 8 月固定走 1 步，数据推进到 10-18 后末日次日在 10 月必失败，改为步进到面板 HTML 含末日次日格为止）；`verify_drill.cjs` 59/60（唯一失败仍是既有 554kg 体重档）；`npm run build` + dist 三处核对（race-rows 列序 / datechart 分页 / 产物 ag 字段）；headless 截图 `tests/_shot/v101-*`：races 主表列序、profile RACES 内嵌（着順→后3F→时间 + 徽章）、datechart PC 明细（10 月 31 条 1 页无页码行）与 mb（37 条 4 页、页码行「第 1/4 页」）；`v102b-*` mb 卡「时间：2:02.7 后3F：[33.9] 赏金：120万」。
- **关键结论**：列基准单一出处再次显效——改序/解禁各只动一处、三视图自动跟随；分页两视图共用同一 runs 数组、页码状态独立，CSS 断点分侧显示即可，无需设备判断。

### §102 · 竞马场·地方筛选取全 NAR 15 场（2026-10-22）
- **动因**：races.html「竞马场·地方」筛选只列了库内有出场记录的 7 场（金沢/高知/園田/門別/姫路/大井/盛岡），用户要求显示全——官方口径：地方競馬情報サイト 競馬場ガイド（https://www.keiba.go.jp/guide/）列 **15 场**。
- **最终落地**：`races.html` `TRACK_LOCAL` 7→15 场，按官方编号顺序：帯広・門別・盛岡・水沢・浦和・船橋・大井・川崎・金沢・笠松・名古屋・園田・姫路・高知・佐賀（福山 2013-03 废止不在列）。
- **最终状态**：✅ 已完成。
- **关键结论**：筛选选项 = 官方全量清单，不跟随「库内有数据的场」；选中暂无记录的场 = 空结果属正常。场地名仅作筛选值透传（= 場名原值），无 i18n 改动。

### §103 · 友情跳转：「友情档案」三站互跳组件（2026-10-22）
- **动因**：用户要求给 云迹（www.yunji.xyz）/ 絆（kzn-web）/ 種牡馬ランキング（jbis-sire-rank-history，异构模板）三站做一套统一好用、各自好看的友情跳转。方案定稿 = **一个组件文件 + 各站一行挂载点**：`public/friend-links.js`（零依赖自渲染）三站同文副本，站点清单内嵌文件头 `SITES` 注册表（增删站只改这里，三站同步）；渲染按挂载点 `data-site` 排除自身。完整方案 = `docs/友情跳转方案.md`（三仓同文）。
- **最终落地**：
  1. **挂载点**（`front/index.html` 侧栏 `</nav>` 与版权块之间）：`<div data-friend-links data-site="yunji" data-skin="yj"></div>`，桌面常驻 + 手机抽屉内同源；`<head>` 加 `<script src="friend-links.js" defer>`（auto-version 自动打哈希戳）。挂载点不带任何样式类 → 脚本缺失/渲染异常**零痕迹**。
  2. **yj 皮肤**（yunji/kzn 共用）：视觉 = 侧栏既有元素逐类复用 —— 分组标题同 nav 组标签（`text-[11.5px] tracking-[1.5px] text-secondary-foreground`「友情档案」）、条目同 nav-item（`hover:bg-muted/40`）+ 品牌方块（26px 缩号，雲/絆 青绿、順 墨色）+ 两行文本（站名 `truncate` + 一句话简介）+ hover 才现形的青绿 `↗`。Tailwind 类全为 JS 字面量（content 扫 `./public/**/*.js`，theme.css 已编译核对）。
  3. **跳转语义**：一律新标签页（`_blank` + `noopener`）—— 三站都是带页内状态的查询工具，跳走不丢筛选/图表/页码状态；外站不进本站 iframe。展示名「name · sub」连写 ≤10 字（種牡馬ランキング 8 字单显），侧栏窄列不截断；装饰元素 `aria-hidden`，过渡仅颜色/透明度。
- **验证**：`npm run build` 通过；`dist/assets/theme-*.css` 含全部新类（escaped 形态核对 `py-[7px]`/`h-[26px]`/`rounded-[7px]`/`group-hover:opacity-100` 等）；`dist/index.html` 引用 `friend-links.js?v=2e6d45f8fc`；headless Edge 本地预览截图 `tests/_shot/v103-*`（桌面侧栏渲染 + 425px 抽屉收起无布局破坏 + dump-dom 核对渲染 DOM）。
- **过程坑（已修）**：JS 块注释里写了 `**/*.js` glob，`*/` 提前闭合注释 → 整文件 SyntaxError、脚本静默失效（挂载点空白、截图无组件）——注释内禁止再写带 `*/` 的通配符。
- **关键结论**：跨站组件要「一套方案、各站原生」= 单文件自渲染 + 每站皮肤适配宿主设计语言（yj 用宿主 Tailwind token，jbis 用宿主 CSS 变量换肤自动跟随）；挂载点保持裸元素是容错关键（脚本挂了页面零污染）。
- **修正（同日用户反馈，jbis 皮肤 v2 定稿）**：v1 把 jbis 入口放站头 tabs 下方胶囊 chips，用户否决「不太好」——外部友链混进 tabs/年度切换器的功能区、还占首屏。v2 改为**页脚收尾区**：挂载点移到 `site/index.html` main 之后、colophon footer 之前，形态改为站点 `.panel` 同语言的两列卡片（白底细线 8px 圆角、720px 断点单列），标题复刻 `.panel-title`（「友情档案 SISTER SITES」），hover 同表格行（`--accent-soft` 底 + `--accent` 边 + ↗ 现形）——读完排名自然到达的出口，不占首屏、不混功能区。yj 皮肤零改动。重建三站（friend-links.js 同步新哈希）+ 重截图 `tests/_shot/v103b-*`（桌面两列/ink 换肤/425px 单列/站头恢复干净）。**过程坑**：v2 重写渲染函数时卡片 `<a>` 漏写 `class="yjfr-j-card"`，CSS 选择器全落空、卡片裸奔成默认链接样式——渲染类名与 CSS 选择器必须成对核对，截图 + dump-dom 双验。
- **定稿微调（同日用户确认，截图 `v103c-*`）**：① kzn 展示副题「高情厚意档案」→「**绊崽档案**」（对应云迹「云崽」的家族爱称；kzn 站自身名称不变，仅友链展示名）；② jbis 品牌方块弃墨色「順」→ 家族青绿 + 「**LS**」（Leading Sire）——三块方块统一 `#0aa7a0`，双拉丁字母在 26px/28px 方块内居中无溢出。SITES 注册表两行改动 + 注释例子同步，三站重建拉齐哈希。
- **文案定稿（同日用户确认，截图 `v103d-*`）**：jbis 展示名「種牡馬ランキング」→「**JBIS LS榜**」、简介「JBIS 每日快照」→「**每日快照**」——长日文名在窄列截断且与 LS 方块不呼应，改后三条目节奏统一（短名 + 短简介），注册表 name/sub/desc 三字段同步。
- **v3 四站扩展（2026-10-23）**：第 4 站 racing-calendar（出走表，与 jbis 同构 site/→_site/）接入——注册表加 rc 条目（RC 方块 / Racing Calendar / 一键生成出马表）、组标题三轮比稿定稿「**站群导航 NETWORK**」、jbis 展示名改「**JBIS LS Rank榜**」。技术要点：jbis 系皮肤**变量归一化**（--f-* fallback 链）——rc 用 shadcn 风变量命名且语义相反（--muted/--accent 是底色非前景），链序专门设计（rc 走 --muted-foreground/--primary）实现一套 CSS 双站兼容；卡片网格改 repeat(auto-fit,minmax(280px,1fr)) 自适应列宽（3 卡一行）。方案文档升四仓同文；yj 侧栏自动 3 条目零改动。

### §105 · 编辑存储站点命名空间化（localStorage / Cache / IndexedDB / sessionStorage 键加站点前缀，2026-10-26 双仓同改）
- **动因**：用户浏览器同时打开 yunji-web 与 kzn-web，kzn 编辑台「连接 GitHub」面板**回显出贴在另一侧的 PAT**。根因：localStorage/Cache API/IndexedDB 全按 **origin**（协议+域名+端口，**路径无关**）隔离，而两仓编辑台键名完全相同——`yj.gh.token`（PAT）/ `yj.edit.drafts.v1`（草稿箱）/ `yj.edit.port` / IndexedDB `yj-edit-blobs` / 缓存桶 `yj-data-v3` / sessionStorage `yj:basic:<v>:<url>`、`yj:currentHorse`。线上两站不同源（www.yunji.xyz vs kzn 的 Cloudflare 域）互不影响；但**本地同端口**（127.0.0.1:8090 先后服务两目录）或 file:// 双开时即同源共用一份存储：PAT 串显（本次实锤）、草稿箱互相可见（在错误站点提交会把对方草稿写进本仓人工表 = 数据污染）、数据缓存互相喂错（两站 `/data/basic.json` 同路径同 URL）。
- **定稿（单源收口）**：站点级键全部加站点 id 前缀——`config/sire.json` site 段新增 **`id`**（`yunji` / `kzn`），`gen-site-config.mjs` 产出 `YJ_SITE.id`；`yj-util.js` 新增 **`siteId()` / `storeKey(k)`** 单源（缺省回退 `"yj"` = 旧无前缀键，站点配置缺失时的兜底）。各键落地：PAT → `<site>.gh.token`、草稿 → `<site>.edit.drafts.v1`、端口记忆 → `<site>.edit.port`、IndexedDB 库 → `<site>.edit-blobs`、缓存桶 → `<site>.data-v3`、`yj:basic:<v>:<url>` → `<site>.basic:<v>:<url>`、`yj:currentHorse` → `<site>.currentHorse`。
- **技术要点**：yj-util 在 stats/datechart/races 页、yj-cache 在 races/datechart 页**先于 site-config.js 执行**——加载期读 `YJ_SITE` 恒 undefined → 一律**调用时求值**：`YJ.util.DRAFT_KEY` 改 defineProperty getter（属性形态不变、调用点零改动）、`yj-cache` 桶名改 `bucket()` 函数（`openBucket` 运行期取站点 id）；**复评后** bus.js（`key()`）与 editor.js（`tokenKey()` / `blobDbName()` / `draftKey()`）、profile.html 的草稿读取也全部改成调用时求值——原先它们是加载期算好存下来，只是靠「页面脚本顺序恰好 site-config 在前」成立，属违反本节规则、静默退回共享键的隐患（不报错，最难查）。⚠ `selector.js` 有**两处**键构造（`basicKey` + `clearBasicCache` 的前缀遍历）必须同口径改，漏一处就清不掉新键。
- **影响**：一次性切换——旧键数据不再读写：**PAT 需重贴一次**；切换前未提交的旧草稿不再可见（上线前先清点提交；实锤时 kzn 草稿箱为空）；旧缓存桶 `yj-data-v3` 由 `yj-cache.js::cleanLegacyBucket()` 在首次开桶时删除（Cache 条目是可再生的全量数据，删掉只是下次重取），线上访客无感（ETag/304 照常）。
- **不做自动迁移（复评定稿）**：旧键是两站**共写**的混合数据——草稿箱里可能混着另一站的马匹条目（id 空间不同），PAT 可能是另一站仓库的细粒度令牌（跨仓推送必 403）。盲迁 = 把错误凭据/脏草稿装进新命名空间，比不迁更难排。改为「**不继承 + 提示**」：`editor.js::legacyTokenNote()` 在当前站未配置 PAT 而旧键 `yj.gh.token` 有值时，在「连接 GitHub」面板显式提示重贴一次；旧 IndexedDB 库 `yj-edit-blobs` 不删（里面可能还有未提交草稿图，留着可人工导出，占用体积小）。
- **验证**：`node --check` 双仓 5 个 public 模块 + gen-site-config.mjs 全过；两仓 `npm run build` 通过（races-bundle round-trip 对账通过）；dist 断言——旧键字面量代码侧零残留（`yj.gh.token` / `yj.edit.drafts.v1` / `yj.edit.port` / `yj-edit-blobs` / `yj:basic:` / `yj:currentHorse` / `caches.open(BUCKET)`），新形态在位（site-config `id` 字段 / `storeKey(` / `function bucket`）；`yj-cache.js` 头注释保留一处旧桶名（说明去向，刻意）。复评补测：node vm 直跑三例（无 site-config → 回退 `yj.*` 旧键；有 `id` → `yunji.*`；桶名惰性求值 `yunji.data-v3` 且加载期 0 次 `caches.open`）；仓库自带冒烟重跑全绿（yj-cache 16/16、stats 205/205、datechart ALL PASS、drill 60/60、result PASS）。
- **复评追补（2026-10-26 二次审阅，用户授权直接改）**：① 惰性求值收口（bus/editor/profile，见上）；② 旧桶清理 `cleanLegacyBucket()`；③ PAT 旧键提示 `legacyTokenNote()`；④ `site.id` 补进配置契约（`docs/子项目复制与同步指南.md` §1.1 + README 新项目步骤）与 `AGENTS.md` 硬规（存储键前缀 + 加载期禁求值）；⑤ `gen-site-config.mjs` 对缺省 `id` 构建期告警（新克隆仓最容易漏）；⑥ `data/fetch_log.jsonl` 裁剪改为**计数门控 + 全量按 ts 过滤**（原「只看首行是否过期」在 merge=union 把旧行夹到中间时会永久跳过裁剪，且逐请求全量读 4MB）；⑦ 常驻用例 `scripts/races/verify_races_edits.py`（13 断言）+ `scripts/verify_fetch_log.py`（原 `tests/` 里的临时脚本移出，补 trim/幂等/门控——`tests/` 按约定不入库，挪到 `scripts/` 才留得住）；⑧ `scripts/races/verify_drill.cjs` 的体重档位断言去掉「540-550 / >550 必须为空」的数据绑定（2026-10 已有 554kg，断言随数据过期）。
- **关键结论**：跨站共存的工具链，站点级存储键必须自带命名空间；「origin 判定与路径无关」是本质——本地多项目共用一个端口时，任何未前缀的键都会跨项目互串。bus.js §62「sessionStorage 优于 localStorage」防的是**跨标签页**串扰，本次前缀补上的是**同标签跨站导航残留**这另一半。

## 二、概览图 · 统计 · 产驹赏金（§110–§145）

### §110 · 统计总览新增「种马榜走势 · SIRE RANK」：跨站引用 jbis-sire-rank-history（2026-10-27）

- **动因**：用户要求把云崽（コントレイル）的赏金变化图引到站内，未来还会引用 racing-calendar。定稿方案 = **组件化跨站引用**（与 friend-links「一个组件文件 + 各站一行挂载」同模式）：jbis-sire-rank-history 仓出纯渲染图表组件 `embed/sire-rank-chart.js`，云迹只负责喂数据与挂载；**不复制数据进本仓 data/**（兄弟站即数据唯一出处，避免双站同步负担）。**图表风格（组件 v1.3.1 用户选型定稿）= combo 单面板**：赏金累计平滑线+渐变面积 + **单日增量柱（与赏金共用 y 轴、同面板**，独立刻度分轴版仍在组件里留作 triple）；**名次副图去除**（用户：太丑）→ 名次信息由主图跳增标注「+金额（N位）」与 tooltip 承担，KPI 保留「排名」。y 轴 = 目标 ~9 格自动取整（千万级步进，1.87億 板每 2,000万一格）；默认 23年世代・中央（首产世代）。
- **云迹侧改动**（本仓）：
  - `front/public/data-config.js`：新增 `YJ_DATA.remote.jbisRank`（GitHub Pages 站根，跨站 URL 单一出处）；
  - `front/public/yj-cache.js`：注册表新增 `sireRank` 条目（arg = `"<board>/<jbisId>"` 如 `t4-gen-central@2023/0001237042`，TTL 12h 同全站；GH Pages 带 CORS `*`，Cache API/304 续期/断网回退全链路照常）；
  - `front/scripts/gen-site-config.mjs`：`YJ_SITE` 增发 `jbisId`（源 = config/sire.json 的 `sire.jbis_id`；注意顶层键也叫 sire）；
  - `front/pages/stats.html`：新增 ⑤ 种马榜走势（维度 seg 年度/23年世代/24年世代 × 范围 seg 中央/総合；KPI 当前赏金/排名/较前快照/最新快照；`manYen` 复用 §48 单一出处；**口径 = JBIS 榜单，不受顶部工具条影响**，页面不放口径文案——图下注释与 ⑥说明·NOTES 模块按用户要求整体移除，口径只留在代码注释与本记录）；KPI/曲线/矩阵/重赏各 section 回归无损。
  - `tests/sire-rank-embed/`：本地联调候选页（跨域取数 → yj-cache → 远程组件 → 渲染全链路）。
- **jbis 侧改动**（彼仓）：`site/embed/sire-rank-chart.js`（零依赖 ~10KB，纯渲染不 fetch 不写存储；颜色缺省继承宿主 CSS 变量 `--primary`/`--chart-2`，回退 `--accent`——jbis 四主题与云迹 Tailwind 都零改样式）+ `site/embed-demo.html` 演示页 + 彼仓 DESIGN.md §12 组件契约。
- **坑与教训**：
  - 云迹 Tailwind 配置色键为 `chart2`（无连字符）**不产出 CSS 变量**，SVG 属性/图例里 `var(--chart-2)` 拿不到值（透明）→ 页面内单一定义 `SRK_COLORS`，图例与组件入参同源；
  - 注册表 URL 模板曾漏 `/<jbisId>/` 段（联调日志 `[404] .../t4-gen-central@2023.json` 一眼定位）→ arg 契约定为 `<board>/<jbisId>`；
  - headless 截图「页面没变」是 **HTTP 缓存**（模拟服务曾发 max-age=600 且复用 profile），换 profile + no-cache 才看到新代码；
  - stats 页独立打开会被 `rehome.js` 回壳重定向，无头验证须带 `?embed=1`。
- **验证**：组件 `buildSVG` Node 冒烟 17 断言全绿（正常/单点/空态/小值刻度/全 1 名次除零）；无头 Edge 端到端（:8090 → :9091 跨域，模拟 GH Pages CORS）`jbre-ok` + SVG 3 path + KPI「138237.8万円 · 第2位 · 16 快照」；整页 `?embed=1` 回归——四既有 section 照常、本节在组件未发布时优雅降级出「重试」；`npm run build` 过，dist 的 theme css 含 `underline`/`hover:underline`，data-config/yj-cache/site-config/stats.html 均含新内容。**上线顺序**：先 push jbis 仓（发布 embed 组件），云迹再 push——否则组件 404 显示重试态（数据本身正常）。

### §111 · 概览新增「状态 · BY STATUS」方形面积图（2026-10-27）

- **动因**：用户想在未选马概览的「性别 BY SEX」下面补一组**状态**统计；原始键组合太散（`登録状態` 現役/抹消/空 × `抹消_去向種別` 六枚举）没法直接摆。用户选型：**不要数字卡，用方形面积图（treemap）**，且**每类单独统计**——中央现役、地方现役、繁殖、乘马、未确定、种马、死亡、未登录。
- **分类口径**（前端现场聚合，**不动数据**，与 `yj-util.js statusChain` 同源）：
  - `現役` → 中央现役（164）；确认去向 → 地方现役/繁殖/乘马/种马/死亡/海外（空状态马有确认去向同样归入，如未出道即死亡的 レッドロアリング 归「死亡」）；
  - `抹消` 且去向未确认 → **JRA抹消**（v2.1 两次更名：未确定 → 抹消 → JRA抹消，标明这是 JRA 注册状态；15 匹，口径不变）；其余（空状态无去向，多为未出道马，含海外出走马 Grand Warrior）→ 未登录（50）。
  - **JRA现役与地方现役都算现役**（语义同：仍在出赛）→ 面积图分两块、色系同族（primary 实心 / accent 浅青）可对照。当前分布：164 + 24 + 14 + 9 + 15 + 0 + 1 + 50 = 277。
- **改动**：`front/pages/profile.html`（renderOverview 内新增 CATS 分类聚合 + `tmSquarify`/`tmPaint` + `group('状态','BY STATUS')`，resize 防抖重排）；`front/pages/theme.css`（`.yj-tm` 块形态 + `.yj-tm--*` 纯色类，块与图例小方块共用，色系对齐 `.yj-stb` 语义）。仅此一处使用 → 不抽离（§48）。
- **算法**：squarified treemap（Bruls 贪心压短边）+ **末行保底 10px**——1 匹的小类在窄高容器下会细成 0.5px 的丝，从相邻同向前一行「保宽削厚」借厚度，容器仍精确铺满、无叠无漏（Node 冒烟 7 组容器尺寸：fill/inBounds/noOverlap/minSide≥10 全绿）。
- **展示细节**：面积 ∝ 匹数；块内标签按面积阈值显隐（≥50×44 竖排类名+数，≥64×26 横排一行，再退数字-only）；hover 有 title 说明；「海外」去向当前 0 匹，>0 时自动进图例/色块。
- **v2（同日用户定稿，参照通用 treemap 版式图）**：①去掉图例，**类名+数字直接标进块内**；②**8 类全部上墙**——<2 匹的小类（死亡 1、种马 0）放**右侧定宽格子栏**（等分格子）：纯面积图里 0 匹必然不可见、1 匹细成丝，硬等效放大会虚增面积比（迭代版实测 0 匹块被撑到和 14 匹块一样大，误导）→ 右栏「块小即类小」诚实且全可读，大类主区面积**零失真**；③配色改**低饱和**：Tailwind 200 级底 + 同 hue 800/900 级深字（现役=青绿/蓝同族两档、繁殖=橙、乘马=黄绿、抹消=中性灰、种马=紫、死亡=红、未登录=蓝灰）；④tmSquarify 末行借厚保底 10→**28px**（短容器下 1-9 匹尾行会细成 10-20px，28px=内联标签最低预算，前行「保宽削厚」容器仍精确铺满）。Node 冒烟 10 组真实容器尺寸（PC 190-320 / mb 170-260）：无重叠 + 8/8 可标注全绿。
- **v3（同日，用户要求概览/性别统一这套样式）**：①块渲染收口 `tmHTML` 单一出处（状态/性别共用，仍在 renderOverview 内，§48 仅 2 处不出 public）；②性别改 3 类小面积图（复用 tmSquarify：牡/牝两大块面积 ∝ 匹数，骟马 4 匹走末行借厚 28px 全宽细条），去掉白色统计卡——色 牡=indigo-200、牝=rose-200、骟=neutral-200；③概览保留「总数 = 年份 + 年份」等式（签名版式不动），白卡阴影 → 浅底色块：总数 teal-200/70、年份按 y1..y5（sky/indigo/cyan/blue/teal）轮换自动续色；④stat()/sexName() 随之废弃删除。验证：build 过、dist 新类核对、PC/mb 无头截图（性别图含 28px 骟马条、概览等式块正常）。
- **v4（同日，用户两点定稿）**：①概览改**年份占比图**（复用 tmSquarify/tmHTML）：块面积 ∝ 匹数、块内 名+匹数+**占比行**（52.7% vs 47.3% 面积差肉眼难辨，标注才读得准，新类 `.yj-tm-p`）；**总数不占面积**——它=全部面积的和，再摆一块必双重计数 → 抬到组标题右侧信息 chip（group 增第 4 右参，muted 胶囊 + primary 数字）；年份色仍 y1..y5 轮换自动续色，`.yj-tm--total` 删除；②性别改**三等分列**（面积图下骟马 4 匹缩成细条太易忽视，用户点名）——保留块样式/色类，等宽平权，静态渲染不再占 paint 通道；paintAll 收口为 tmPaint+ovPaint 两图。验证：build 过、dist 核对（tm--p/性别静态块/无 sx·totalTile 残留）、PC/mb 无头截图。
- **v5（同日，用户定稿）**：死亡固定**浅灰**（red-200 → neutral-200/neutral-600，终点/退场=无彩色语义；与性别组骟马同色但不同组）并**钉在右栏末位**（右栏贴右缘、末格=整图右下角「最角落」；minis 排序加 dead 末位 pin，死亡若 ≥2 匹回主图则按常规面积排位）。
- **v5.1（同日）样式代码清理**：类定义与用法逐一对账（profile.html 字面量 vs theme.css 定义）——**无孤儿类**；`.yj-tm--overseas`/y3..y5 为条件类（海外 >0 / 新增年份自动续色）按设计保留；`stat()`/`sexName`/`sxPaint`/`totalTile` 等迭代废案此前已随改随删，本次核对无残留；代码注释压缩为当前逻辑（v1~v5 迭代过程记录归本文件），并修正一处失实注释（右栏注「末行保底 10px」→ tmSquarify 实际 MIN=28px）。
- **验证**：`npm run build` 过，dist 的 theme css 含 `.yj-tm--live` 等新类，dist/pages/profile.html 含 tmSquarify/group('状态') 新代码；冒烟测试直接从页面源码提取 `tmSquarify` 真函数跑，非复制版；无头 Edge PC/mb 截图复核通过。

### §112 · 新页「赏金榜 · LEADERBOARD」：总榜/自然年/世代 × 牡牝三态（2026-10-27）

- **动因与定稿**：用户要一份产驹赏金排名（榜单页），三问定稿——①**世代榜口径 = 该世代（生年）成员的通算赏金**（随数据更新自然成长，不做世代×自然年交叉）；②**海外台账行源数据无金额 → 赏金按 0 计 + 页面脚注说明**（胜数照计，不做人工补录机制、不单独成榜）；③**性别三态 全部 / 牡馬（含骟）/ 牝馬**（`セ` 归牡组，同 stats 性别维度「牡含セン」口径；全库仅 2 匹骟马，不单独成榜）。分类思路与 stats.json 切面体系（all / yYYYY / gYYYY）同构，不引入新概念。
- **切面**：榜别 seg 总榜（通算）/ 自然年（该日历年逐场合计）/ 世代（「XXXX年世代」措辞同 timeline 定稿）+ 联动年份/世代 seg + 性别 seg；选择记忆 localStorage（`YJ.util.storeKey("leaderboard.view")`，§105 站点前缀，调用期求值）。
- **金额口径（实测）**：**逐场 `賞金` 加总**（= datechart `runs[].pr` 同源同值），与 netkeiba「獲得賞金(中央)+(地方)」**274/274 匹全等**（257 纯中央 + 17 地方差额恰补齐）；不用 basic `総賞金`（多为空/展示串）、不用 `収得賞金`（JRA 通报权重口径）；未出走（取消/除外）不计金额不计出走；海外台账场金额按 0 计。
- **榜单列**：順位（按赏金排定、(赏金,1着) 相同并列同顺位）/ 馬名（日文+〈港译/自译〉，链 profile；副行「世代 · 性别」）/ 赏金（`manYen` 亿/万）/ 1着 / 出走（切面内计数）/ 重赏（切面内一着最高格徽章 + 重赏一着数，无重赏有 L/OP 胜显该徽章+同级胜数，否则 —）；表头点击换序（再点切升降，同 stats `.st-mat` 交互），并列次序 = 赏金 → 1着 → id。**总榜/自然年只列出走过的马，世代榜含全部成员**（0 赏金沉底，体现整代阵容）；顶部 KPI 细带 = 切面内赏金总额 / 马数 / 重赏胜利。
- **实现（零新数据产物）**：只读 `datechart.json`（845 行逐场）+ `basic.json`（生年/性别/中文名 join），前端聚合（同 datechart「前端聚合保单一事实源」哲学），不加管线、不改 SCHEMA；新页 `front/pages/leaderboard.html` 注册进 `vite.config.js` PAGES + `front/index.html` 侧栏「统计」组（统计总览之后，💰）；复用 theme.css `.seg`/`.card`/`.yj-grade`、race-rows `GRADE/GLABEL`、yj-cache `datechart`/`basic` 条目；页面局部样式 `lb-*`（KPI 条/矩阵表版式同 stats 页内样式先例）。
- **当前成果**：页面已实现并通过构建；`npm run build` 过、dist 产物核对（leaderboard.html、侧栏导航、theme css 新类）通过。
- **修一处初版 bug**：展示排序比较器方向写反（`(val(y2)-val(x))*dir` 在默认 desc 时变升序、0 赏金马沉到表首；名次列按 byPr 独立排定不受影响）→ 改为 `(val(x)-val(y2))*dir`。
- **验证**：`npm run build` 过；dist 核对（leaderboard.html / index 侧栏导航 / theme css 类齐全）。冒烟测试台 `tests/leaderboard-sim.mjs`（Node vm 跑**真**公共脚本 + **真** dist 数据，对账基准 = 由 datechart.json 独立复算）：总榜 KPI「15亿9,942万 / 172 / 🏆4」全对——总额 = datechart meta prize_total；**172 = meta 173 减去仅有一条「取消」记录的 Hazey Jane**（三态口径不计出走，恰证口径正确）；自然年 2026（13亿1,133万）、世代 2023、牝马榜 top 序、并列顺位、重赏徽章、亿/万格式、表头排序全部断言通过。Edge 无头截图在本机环境挂起（探测命令 120s 无输出），渲染验证由 vm 冒烟承担。

### §114 · 赏金榜 v3 定稿：图表化——空心=总赏金、实心=重赏赏金，撤表格（2026-10-28）

- **用户选型**（四方案候选后）：**方案 A 变体 + 只留图表**——横向条形榜，**空心条 = 总赏金**（按榜首归一），**实心段 = 重赏赏金**（同条内叠加，读出「大头来自重赏还是分场」）；整页撤表格，明细靠悬停 tooltip + 点击行开档案（§80 新标签）。
- **口径新增**：重赏赏金 = `格` ∈ 重赏（race-rows GRADE 徽章类 g1/g2/g3）场次逐场赏金合计（含 2-5着）。独立复算对账：全库 **5亿360万、8 匹**有重赏所得；榜首 ゴーイントゥスカイ 总 3亿4,429万 / 重赏 3亿3,679万（98%）→ 实心段近满、视觉区分度直接成立。
- **收录范围收窄**：图只画赏金>0 的马（总榜 139 匹），0 赏金马数进脚注（总榜/自然年 = 出走过但 0 赏金 33 匹；世代 = 尚未获得赏金 N 匹）——v1「世代榜含全部成员」在图表形态下自然收窄（0 长度空心条无信息量）。KPI = 赏金总额 / 上榜马数 / 重赏赏金；图例 □ 总赏金 ■ 重赏赏金。
- **改动**：`front/pages/leaderboard.html` 全页改版（删 `.lb-mat` 表格/排序交互，新增 `.lb-row/.lb-bar/.lb-fill/.lb-legend`，聚合器增 `sg` 字段，恢复 `race-rows.js` 引入取 GRADE）；`tests/leaderboard-sim.mjs` 断言全面改版（KPI 三项、139 行、8 实心段、榜首空心 100% + 实心 97.82%、四切面序、两种排除脚注）。
- **验证**：`npm run build` 过 + 冒烟绿；预期值 = data/races/*.json 独立复算（139/8/5亿360万 全对上）。Edge 无头截图今日**全局失效**（含昨日成功的候选页 URL 也 0 字节，旧 `--headless`/新 `--headless=new`、全新 profile 均复现，疑似 Edge 自动更新所致，§112 已有先例）——渲染验证由 vm 冒烟承担，视觉效果以 :8090 实页为准。

### §115 · 赏金榜 v4 定稿：引入 ECharts 定制包渲染（2026-10-28）

- **决策过程**：用户反馈 v3 样式太丑 → 图表库体积实测（echarts@5.6.0，esbuild tree-shaken，%TEMP% 探针）：全量 1,009.9 KB raw / 326.8 KB gzip；**定制包（仅 Bar+Grid/Tooltip/Legend/Dataset+Canvas）≈503 KB raw / ≈161-167 KB gzip**；Chart.js 4 全量 205/69 KB；uPlot 50/22 KB；对照本页现状 gzip ~25 KB。四选一，用户定**引入 ECharts 定制包**（161 KB 只在赏金榜页加载、可接受；后续换图表形态都是改配置）。
- **打包与引入方式**：`echarts/core` 按需引入 + esbuild iife 全局 `window.YJ_ECHARTS`，**vendor 成 `front/public/echarts.bar.min.js`（515 KB，文件头留重建 recipe）**——与已提交的字体子集同属「构建产物入库」先例；vite autoVersion 自动打 `?v=hash` 长缓存；**仅 leaderboard.html `<script>` 引用，其他页面 0 下载**；页面侧 fail-soft（包缺失出提示不白屏）。
- **渲染重构**：DOM 条形 → canvas。双系列同槽叠加 trick：「总赏金」= 透明填充 + 描边（空心），「重赏赏金」= 实心主色、`barGap:-100%` 叠放且条宽略窄嵌进描边内（v3 语义原样保留）；类目轴标签「名次 马名」超宽截断；条尾金额标签（有重赏的追加 ◆ 重赏金额）；tooltip（axis 触发）出全明细含世代/性别；点击条形开档案（§80 新标签）；切面切换 notMerge 整体重绘 + 700ms 入场动画；`window resize` 防抖重算画布；画布高度 = 行数×26+42px（139 行 ≈3656px 通长画布，页面自然滚动）。本页 CSS 删条形行样式只剩 KPI/图例/空态（无孤儿类）。
- **验证**：`npm run build` 过（dist 页 15.34 kB；echarts.bar.min.js 515 KB `?v=62b27486ab`）；`tests/leaderboard-sim.mjs` 改 ECharts 桩（捕获 setOption 载荷）：KPI 三项、139 行、榜首双系列值 344,298,000/336,798,000、条尾标签「3亿4,429万 ◆3亿3,679万」、top3 描边强调、2026（137 行/榜首 328,442,000）、世代与牝马序、并列前缀、点击回调注册全过；canvas 绘制本身 vm 无法验证，视觉以实页为准（Edge 无头截图持续不可用，§114 已记录）。
- **候选页退役**：`tests/leaderboard-charts.html` + 四张候选截图 → `tests/_trash/`（§114 四方案选型完成使命）。

### §128 · 页面更名：赏金榜 → 产驹赏金（2026-10-28，用户选定）

- **动因**：用户觉得「赏金榜」不好听，给出直白型（赏金排行/获得赏金/战绩榜）、档案型（赏金谱/赏金录）、主体型（产驹赏金/云崽赏金榜）三组候选，选定 **产驹赏金**（强调排名主体 = コントレイル产驹，信息最准）。
- **落地**：侧栏菜单（index.html 💰 项）、页面 `<title>`、页首大标题（`产驹赏金 · LEADERBOARD`）、vite.config 与页内 JS 分节注释共 5 处；页内副标题「赏金排行 · RANKING」与 KPI「赏金总额/重赏赏金」为数据口径用语，保持不变。文件名 leaderboard.html 与路由不改（无链接破坏）。
- **验证**：`npm run build` 过、冒烟全绿；dist 全文检索「赏金榜」零残留。

### §129 · 产驹赏金：分页（PC 100/页 · MB 10/页）+ 撤性别图例（2026-10-28，双仓同改）

- **用户需求**：① 榜单分页，PC 一页最多 100 名、MB 一页 10 名；② 去掉图例「名字颜色：牡/牝/骟」文案（名字颜色本身保留，性别明细走悬停 tooltip）。双仓（yunji/kzn）同步。
- **分页实现**：`pageSize()` 按断点取 100/10；`renderChart` 切片渲染当前页（页码越界自动夹回）；页码条 `#pager` = 上一页/页码·名次区间·总数/下一页（单页隐藏，首末页按钮禁用态）；翻页只重画当前页（KPI/图例/脚注不随页变化）并 `scrollIntoView` 回图区顶端。**切面签名**（mode/y/gen/sex/nm/断点）变化时自动回第 1 页（`renderAll._sig` 比对，翻页走 renderChart 直调不算变化）；chipW 列宽按**全部行**扫描，翻页不跳变。页码不进持久化（刷新回第 1 页）。
- **顺带修复**：MB 短页后 x 轴刻度密排重叠 → xAxis `hideOverlap: true`。MB 布局经 CDP 探针实测无横向溢出（scrollWidth 390 = clientWidth，pager 右缘 363 < 390），此前截图上的「截断/发灰」为 2x DPR 缩览假象；探针留存 `tests/_mb-probe.mjs`。
- **冒烟重写（重要）**：期望 KPI/榜首/名次不再手写常量，改为**从 dist/data 独立复算**（同口径：取消/除外不计、年取 d 前 4 位、重赏 = GRADE 徽章 g1/g2/g3、并列同顺位）——昨夜数据管线自动更新（15亿9,942万→15亿9,948万）曾把手写断言打红，此后数据更新冒烟自动跟表；分页断言随行数自算页数（yunji 139→2 页 / kzn 823→9 页通用）。新增断言：页码条文案/禁用态、第 2 页切片与首行名次、单页隐藏、图例无性别文案。
- **kzn 同步**：页面字节级一致（kzn §110 已对齐 §112–§128）→ 整页 + 冒烟直拷；kzn 侧记 §111。
- **验证**：双仓 `npm run build` 过、冒烟全绿；PC/MB 截图（`tests/leaderboard-v14-pc.png`/`-mb.png`、kzn `tests/kzn-v14-pc.png`/`-mb.png`）：页码条/禁用态/图例/轴刻度均正确。

### §130 · 产驹赏金：撤图例操作提示文案（2026-10-28，双仓同改）

- **用户需求**：去掉图例里「悬停看明细 · 点击条形开档案」。图例定稿只剩 **总赏金 / 重赏赏金** 两个色样；tooltip 与点击交互不变（操作不言自明）。
- **落地**：renderLegend 收口两行；页面与 yunji/kzn 保持逐字节一致（整页直拷同步）。
- **验证**：双仓 build 过、冒烟全绿；dist 渲染层检索「悬停看明细」零残留（仅存 §130 注释记录字样）。

### §131 · 产驹赏金：上墙口径放宽——有比赛记录即展示，0 赏金排末尾按名序（2026-10-28，双仓同改）

- **用户定稿**：「所有有比赛记录（无论中止、取消还是什么结果）产驹都应该展示，0 赏金也不怕，直接按照名字顺序排到最后」。原口径只画赏金>0 的马（取消/除外还不算出走）。
- **口径变更**：① aggregate 新增 `raw` 计数（**任何** run 都 +1，含取消/除外；通算与自然年切片都记）——金额口径不变（取消/除外仍不计金额）；② viewRows 筛选改为 `s.raw > 0` 即上墙（总榜/自然年/世代统一），0 赏金行保留；③ 排序：0 赏金段一律排末尾，彼此按**显示名**排序（原名 `localeCompare("ja")` / 译名 `("zh-Hans-CN")`，随译名切换），有赏金段仍按 (赏金，1着，id)；并列规则自动让全部 0 赏金马**共享同一名次**（= 有赏金匹数+1，yunji 140 / kzn 824）。
- **展示适配**：0 赏金条尾与 tooltip 总赏金显示 **—**（不再出现「0万」噪声）；脚注改为「赏金为 0 的 N 匹（含仅中止/取消/除外者）按名字顺序排在榜末」。
- **规模变化**：yunji 139 → **173** 匹（+34，PC 2 页）；kzn 823 → **911** 匹（+88，PC 10 页）。未在 datechart 出现过的产驹（从未有任何记录）仍不上墙。
- **冒烟镜像同步**：独立复算同口径（raw 计数、0 赏金末尾段、共享名次）；名次标签断言对 0 赏金段**只用共享名次值**（对 Node/Chromium collation 差异免疫）；条尾 0 值「—」断言新增。
- **kzn 同步**：整页直拷 + 冒烟直拷（kzn 侧记 §113）。
- **验证**：双仓 build 过、冒烟全绿；CDP 实截 yunji 榜尾（`tests/lb-v15-tail.png`）：141 并列名次、五十音名序（ス→セ→ノ→ハ→ブ→…→レ）、条尾「—」、脚注 34 匹说明全部正确。
- **追记（§132）**：用户要求撤下脚注「赏金为 0 的 N 匹（含仅中止/取消/除外者）按名字顺序排在榜末」——行为不变，仅去文案（viewRows 的 zero 计数随之删除）；双仓 build/冒烟全绿，渲染层零残留。

### §134 · 页面更名：统计总览 → 倾向统计（2026-10-29，用户选定）

- **动因**：用户觉得侧栏「统计总览」不达意——页面主体是「倾向矩阵」（10+ 维切面）而非泛泛总览，提议改 **倾向统计**；与同组「日期统计」（§52 更名先例）句式对齐。
- **落地**：侧栏菜单（index.html 📊 项）、页面 `<title>`（`倾向统计 · {{YJ_SITE_NAME}}`）、页首大标题（`倾向统计 · STATS`）；顺带同步页内旧名引用——stats.html 分节注释、races.html 下钻注释 ×3、产驹赏金 tooltip「同倾向统计性别口径」、README 功能页表与 HANDOFF 页名。文件名 `stats.html`、路由与 `stats.json` 管线命名不动（§52 先例：脚本侧域名词不改，无链接破坏）。
- **验证**：`npm run build` 过；dist 全文检索「统计总览」零残留、「倾向统计」在侧栏与页内就位。
- **追记（2026-10-30）**：已同步 kzn（kzn 侧记 §116）。

### §135 · 倾向统计 v2：删「重赏之路」+ 模块重排 + 月龄明细表改「月龄 × 世代子行」（2026-10-29，用户定稿）

- **用户需求**：① 删「重赏之路 · GRADED」模块；② 模块顺序调整为 产驹倾向 → 种马榜走势 → 年龄成绩曲线（数据概览仍居首）；③ 月龄明细表从「生产年 × 月龄」行改为「月龄 × 世代子行」版式（每月龄一组，组内 2023/2024 世代各一行）。
- **落地（stats.html）**：四个 section 重排为 ①数据概览 → ②产驹倾向 → ③种马榜走势 → ④年龄成绩曲线；重赏之路整块删除（section + `G_STEPS`/`renderGraded` + `.st-gline/.st-gstep/.st-garrow` 样式 + renderAll 调用）；月龄明细表行序改**月龄升序、同月龄世代升序**，表头「生产年/月龄」两列并为「月龄/世代」，组首行标月龄加粗、组间分隔线 = 新增 `.st-mat tr.grp td`（2px 上缘线）。**重赏胜利 KPI（🏆）与 `trophyMerged()`/trophies 数据保留**，不受模块删除影响。
- **冒烟同步（verify_stats.cjs，205 → 193 断言）**：删 [C6] 重赏之路 9 条断言 → 改负断言「页面 HTML/CSS/JS 零残留」；curveTable 断言改「行=月龄 · 世代子行」；**顺带收掉 4 条 aboutNote 存量失效断言**（页面说明区早已随旧版移除、脚本未跟上 → 修复前基线即 3 FAIL，本次归零）；TESTING.md 断言数 168 → 193（页名同步「倾向统计」）。
- **验证**：`node scripts/stats/verify_stats.cjs` 全绿（193 通过 · 0 失败）；`npm run build` 过；dist 检索「重赏之路」零残留。
- **追记（2026-10-30）**：已同步 kzn（kzn 侧记 §116）——折线数断言保留 kzn 数据驱动版（不写死 2023+2024），kzn 断言总数随数据量为 465。

### §136 · 档案页 BY SEX 三块配色对齐基本信息性别徽章（2026-10-30，用户提出）

- **动因（用户）**：档案页（profile.html）「性别 · BY SEX」三等分色块用的 indigo-200/rose-200/neutral-200 与「基本信息」性别徽章（sexBadge：牡 `#C9EFFE/#0B5A8C` · 牝 `#FFDBD5/#B03A30` · 骟 `#EFEFEF/#5A5A5A`）不一致——同一性别两种色语言，要求统一到徽章基准。
- **落地（theme.css `.yj-tm--male/female/gelding`）**：三行 `@apply` 直接改用 sexBadge 同款指定色（属规则允许的「指定色块」，非散写 hex）；色随性别语义不随匹数。副产品：牡不再与概览年份 `y2`（indigo-200）撞色。同步修正两处注释——theme.css 面积图配色总注（删「与性别组骟马同 neutral-200」过期表述）与性别段注释、profile.html BY SEX 注释，均标明性别三列=徽章指定色例外。
- **验证**：`npm run build` 过；dist/assets/theme-*.css 实测三规则值为 rgb(201 239 254)/rgb(11 90 140)、rgb(255 219 213)/rgb(176 58 48)、rgb(239 239 239)/rgb(90 90 90)，与徽章逐位一致。
- **追记（2026-10-30）**：已同步 kzn（kzn 侧记 §115）——sexBadge 基准与三块补丁两仓一致。

### §137 · 档案页：概览年份色 5 色 → 12 色全 hue，一年一色零重复（2026-10-30，用户定调）

- **动因（用户，看 kzn 实测）**：kzn 概览 9 个年份块「只有两个颜色（蓝紫两族）」——根因 = 年份色 v1 仅 y1..y5 且五色全在蓝青族（sky/indigo/cyan/blue/teal），9 厩年取模轮换每色两现；用户定调「有几个年份就有几个颜色」。
- **落地（theme.css + profile.html，双仓同改）**：y1..y12 共 12 色全 hue 铺开、冷暖交替（蓝/紫/青绿/玫红/橙黄/靛/黄绿/洋红/青/橙/翠绿/蓝），仍 200 浅底 + 同 hue 900 深字（全 Tailwind 调色板类，无自写 hex）；profile.html `YEARC` 同步扩容，取色逻辑不变（年份降序位次、新增年份插队拿 y1 顺移续色、未知年份排最后）——厩年 ≤12 一年一色零重复（kzn 现 9 厩年全异色、云迹 2 年），>12 才取模循环。kzn 侧性别三块徽章色同批补同步（§136 追记，kzn 侧记 §115）。
- **验证**：两仓 `npm run build` 过；dist/assets/theme-*.css 实测 12 条 y 规则 bg 12 hue 全异（#BAE6FD/#DDD6FE/#99F6E4/#FECDD3/#FDE68A/#C7D2FE/#D9F99D/#F5D0FE/#A5F3FC/#FED7AA/#A7F3D0/#BFDBFE）+ text 900 级对应，两仓一致；kzn 性别三块 = 徽章逐位一致。

### §139 · 全站 UI 审查与整改：KPI 条/空态/时间线卡片三处副本收口 + 12 项体验修正（2026-10-30）

- **动因**：用户要求「评审现有 UI 设计并提出优化方案，只能读文件不能改」，随后升级为「按建议实施 + 写审查文档」。完整逐项记录（含被否掉的 9 条建议及其理由）= 当时的 UI 审查报告（2026-11 文档清理时删除，git 历史可查；对照截图仍留 `docs/assets/ui-review-2026-10-30/`），本节只记**结论性决策**。
- **收口（三处真实副本，本次主要收益）**：
  1. **KPI 条** `.st-kpi`/`.dc-kpi`/`.lb-kpi` 三份六行定义逐字节相同 → 统一为 `theme.css` 的 `.yj-kpis`/`.yj-kpi`（含 mb 媒体查询）。三页本地定义删除，类名替换，各页特有图标（`.trophy`）改挂 `.yj-kpi` 之下。
  2. **时间线卡片** `edit-timeline.html` 的 `.yj-pv` 块原是 `timeline.html` 页内 `<style>` 的人工副本 → 新建 `pages/timeline-cards.css` 装「视觉原子」（卡片壳/图位/文本区/赛事名行/事件标签/数据条/节点底座/日期排版/徽章变体双作用域），两页共同引用；**布局骨架不共享**（正式页居中轴线左右交替 vs 预览单侧一行，grid 不通用）。
  3. **空态** `.hint-empty` 60px 版（theme.css）与 26px 版（stats/leaderboard 各自覆盖）并存 → 新增 `.hint-empty--sm` 紧凑变体；leaderboard 三处改用变体、stats 的死覆盖删除。
- **体验修正（12 项）**：侧栏选中态由「实心 primary 白字」改「浅青底 + 深青字 + 左侧 3px 竖条」（`.nav-item::before`，scaleY 进出）；外壳切页 160ms 淡入；`profile` 搜索列 md 280px / lg 350px 分档 + mb 限高 45vh；treemap 原生 title 补占比；`races` 加跨马查询模式提示条（EMBED 分支隐藏）；`timeline` 字号下限 10.5→11；`datechart` 口径/单位切换加 150ms 淡入；`leaderboard` 重赏系列加 `#066a66` 描边（色弱可分）+ MB 分页 10→20；`pedigree` 5 代图 mb 取消 `min-width:760px`；`edit` 页首草稿提示条（MutationObserver 镜像 `#summary`，**不改 editor.js 以免与 kzn 分叉**）；`edit-table` 快捷键改 `<kbd>` 胶囊；`editor.js` 草稿箱两卡加左侧色条（橙=未提交 / 青绿=已保存）。
- **主动否掉的建议（详见审查文档第三节）**：手机菜单钮改 fixed（净高度相等、会压页头）、名字四槽 items-baseline（flex-col 下会对齐到标签）、年份胶囊缩进 28→23px（28 本就对齐卡内文字）、分节条 0 值空洞（色块照常铺满）、相册 1/N 指示器（早已存在）、宽屏密度分档（早已存在）、KPI 均值基准（需后端 bench 字段）、保存条收起（唯一提交入口，风险>收益）、pedigree 补 md:w-[90%]（定宽内容不该满铺）。
- **验证**：`cd front && COPY_DATA=skip npm run build` ✓ 8.70s；产物核对——`.yj-kpi` 6 规则 + 2 媒体查询齐备、`.hint-empty--sm` 层叠在 `.hint-empty` 之后、`.nav-item:before` 已输出、旧 `.st-/dc-/lb-kpi` 零残留、`timeline-cards.css` 两页共同引用且顺序在 theme 之后、`index.html` 仅剩 logo 的 `bg-primary`。
- **对照截图（2026-10-30 追补）**：审查文档第二节「逐项对照图解」含 7 张改前/改后并排图（侧栏选中态 / 跨马查询提示条 / 编辑台草稿提示 / 草稿箱两卡色条 / 赏金双系列描边 / 快捷键 kbd / 5 代血统窄屏），源页 = `tests/ui-review-2026-10-30/*.html`，产物 = `docs/assets/ui-review-2026-10-30/*.png`，用 Edge 无头渲染（`--headless=new --virtual-time-budget=3000 --screenshot`，**虚拟时间预算必须给，否则截到空白图**）。截图页的「改后」栏引用真实 `dist/assets/theme-*.css`，属规格级示意而非线上像素复刻；三处视觉零变化的收口（KPI 条/时间线卡片/空态）不放截图只做文字说明。
- **kzn 同步**：`editor.js`（草稿卡色条）与 `pedigree.js`（窄屏 min-width）两处为双仓共用文件，必须同步并逐字节对账；其余按 kzn 页面集取舍（见审查文档 6.3）。

### §140 · 用户复看 §139 后的回退（4 项）+ 新增（1 项）+ 三个真 bug 修复（2026-10-30 下午）

用户看过 §139 的线上效果后逐条反馈：**4 项判定为「多余/变丑」要求撤掉，1 项要求补内容，另报 2 个 mb 端 bug**。本节记结论与根因，不改上一节的记录（保留决策演进）。

- **回退 4 项（撤回 §139 对应改动）**：
  1. `races` 跨马查询模式提示条整条删除（筛选条自带「筛选 · FILTER」标题，模式本就易辨，多一行是噪音）。JS 里 `modeHint` 隐藏分支同步删除。
  2. `edit` 页首草稿提示条整条删除（含 MutationObserver 镜像脚本）——「本匹有 N 处未提交改动…」与底部保存条信息重复。
  3. `leaderboard` 重赏系列 `borderColor:#066a66 / borderWidth:1.5` + 图例 `inset box-shadow` 全部撤掉，回纯色（用户原话「加了之后很丑」）。
  4. `edit-table` 快捷键 `<kbd>` 键帽回退为一整行纯文本（键帽抢视线），页内 `<style>` 随之清空删除。
- **新增 1 项**：`editor.js` 草稿箱「已保存人工表值」每条马名行补中文名 —— 取值 `香港馬名 || 自译馬名`（港译优先，无则自译），`max-w-[46%] truncate` 防挤压，两者都空则不占位。
- **真 bug 1 · 编辑台脏状态不刷新（用户报：香港马名输入 1 再删掉，仍显示草稿态）**
  - 表层原因：`isDirty()` 只判断 `state.draft` 里「键在不在」，输入后删空 → 键仍在（值 `""`）→ 永远 pending。
  - 深层坑 A：**函数名冲突**。新增的 `setDraft(key,val)` 与照片模块既有的 `setDraft(list)`（同一闭包）重名，函数声明提升下后定义者胜出 → 字段输入调进照片逻辑，把**字段名当图片路径**写进 `ph` 草稿（实测 `ph={"1":{"mode":"set","list":["香港馬名"]}}`、`ov` 空、输入框值被清空）。改名 `putFieldDraft` 解决。
  - 深层坑 B：**只删内存键不够**。`hydrateHorse()` 每次渲染都从 `ovGet()` 重灌 `state.draft`，箱里旧值立刻复活（表现为「状态看着对了，但草稿箱仍计 1 处、刷新后浅橙底又回来」）。必须在 `putFieldDraft` 里同时 `delete` 落箱那条（`ovPut` 在 keys 空且无 `_note` 时整条删除）。
  - 实测验收：输入「1」→ `dry=true / chip=草稿 / 落盘 ov={"1":{"香港馬名":"1"}}`；清空 → `dry=false / chip=无 / 落盘 ov={} / 按钮回到「草稿箱」无计数`。
- **真 bug 2 · mb 端搜索下拉不显示（profile）**
  - 根因是 §139 自己引入的：给左列加 `max-md:max-h-[45vh] max-md:overflow-y-auto`，而 mb 端 `persistent=isPc()` 为 false → 下拉是 `position:absolute` 浮层，被祖先 `overflow-y-auto` 裁掉。
  - 修复：左列与 `#selector` 在 mb 端一律 `block`（去掉限高与 overflow）；`selector.js` 的 `.drop` 补 `max-md:flex-none`（原 `flex-1 min-h-0` 在 `.yj-sel` 为 `h-auto` 时 `flex-basis:0` 会把列表高度算成 0，这是同一处的第二重隐患）。
  - 实测验收：聚焦后 `hiddenClass=false / dropH=360 / items=278`，列表正常浮层显示。
- **真 bug 3 · mb 端赏金图右侧留空（leaderboard）**
  - 主因：`grid.right` 硬编码 112 是照 PC 的「名次+主名+互补名」rich 标签预算留的；MB 标签只有一串「3億4,429万」约 55px @10.5px，多出的 57px 全是死空白。改为 `right: mb ? 68 : 112`，label `fontSize` mb 10.5 / `distance` 3，条形区约 +38px。
  - 次因：`.seg` 是 `inline-flex` 不换行，按钮 `padding:0 15px` 时两组控件合计约 374px > mb 可用宽 362px，撑出横向滚动条。本页 mb 端压缩到 `padding:0 9px / font-size:12.5px`（只作用于 `#modeSeg/#sliceSeg/#sexSeg/#nameSeg`，不影响 stats / datechart）。
- **截图工具坑（务必记住）**：本机 Edge 无头 `--window-size=390,900` 的**实际 `innerWidth` 是 492px**（系统 DPI 125%，且设 288 仍得 492，存在下限），截图宽 390 却按 492 布局渲染 → 右侧一律「看起来被裁」，极易误判成页面横向溢出。**判断布局健康必须用实测值**（`docEl.scrollWidth === innerWidth`、`#chart.clientWidth === canvas 宽`），不能只看截图边缘。测量办法：把带 `setTimeout` 检测脚本的页面副本放进 `dist/pages/`，跑完即删。
- **验证**：`npm run build` ✓ 7.09s（含 data 复制与 races-bundle 对账）；四处回退在 `front/` 与 `dist/` 双侧 grep 残留为 0（仅注释提及）；`node --check` 两个改动 JS 通过；mb 下拉、mb 赏金图、PC 赏金图、编辑台脏状态四项均已实测。
- **kzn 同步**：`editor.js` 本次改动为 `putFieldDraft` 新增 + 两处调用点 + `pinsHTML` 中文名，属双仓共用文件，须同步并逐字节对账。

### §141 · 页内样式拆分（审查 §6.2-1）+ kpiHTML 去重（§6.2-4）（2026-10-30 傍晚）

处理审查报告 6.2 的四项工程化债务中的两项（另两项见 §141 末「未做」）。**核心结论：审查报告 6.2-1 只点了 races/stats/datechart 三页，实际全站有 9 个文件带 `<style>`，漏了 leaderboard 与 timeline——按报告原文的范围做会留下两处同样的混排债务。**

#### ① 全站 `<style>` 盘点（实测，字符数）

| 文件 | 体积 | 行数 | 处置 |
|---|---|---|---|
| `datechart.html` | 8.21 kB | 108 | **拆** → `datechart-page.css` |
| `races.html` | 7.98 kB | 85 | **拆** → `races-page.css` |
| `stats.html` | 4.28 kB | 59 | **拆** → `stats-page.css` |
| `leaderboard.html` | 2.51 kB | 27 | **拆** → `leaderboard-page.css`（报告漏点） |
| `timeline.html` | 2.28 kB | 37 | **拆** → `timeline-page.css`（报告漏点） |
| `edit-timeline.html` | 1.02 kB | 10 | 保留内联 |
| `index.html` | 530 B | 9 | 保留内联 |
| `profile.html` | 432 B | 6 | 保留内联 |
| `pedigree.html` | 137 B | 2 | 保留内联 |

**分档标准**：≥2 kB 且规则数 > 4 → 拆；<1 kB 且规则 ≤ 4 条 → 保留。5 个大块合计 25.3 kB，占全部内联样式 **92.3%**；4 个小块合计 2.1 kB（pedigree 仅 1 条规则 137 B），拆出去是「多一个 HTTP 请求换 137 字节」的负优化，故保留。**目标不是「零内联 style」，而是消除大块混排。**

#### ② 拆分原则（不得违反）

- **每页一个独立文件，禁止合并成 `pages.css`**——否则变成「只一页用的样式让所有页白下载」，正是审查报告明确反对的做法。
- **禁止搬进 `theme.css`**：`.filter-*`/`.pg-*`/`.f-*`/`.st-*`/`.dc-*`/`.lb-*`/`.tl` 前缀全站均只一页使用（已 grep 核实）。
- 纯搬移：**不改选择器名、不改声明值**。5 个文件头均写明「本文件内容来源 + 为何不共享 + 加载顺序约束」。

#### ③ ★ 重要发现：Vite 不保证 CSS link 顺序（架构约束）

**实测**：源码里写 `theme.css` → `xxx-page.css`，dist 产物里变成 **`xxx-page.css` → `theme.css`**（单页独有 chunk 排在共享 chunk 之前）。`timeline.html` 因仍有 `<style>` 块而保住原序，其余 5 页全部反序。

**后果与约束（已写入 5 个文件头）**：
- 页面 CSS **禁止**用同名选择器覆盖 `theme.css` 的类（`.card`/`.seg`/`.yj-kpi`…）——会**静默失效**，且极难排查（页面「改了没生效」）。
- 确需覆盖时用父级作用域/双类名提高特异性（如 `.st-mat .card`）。
- 当前 5 个文件均不含对 theme 同名类的覆盖，故顺序无关：
  - `races` 的 `#page.embed` 靠 **id 优先级**胜出，与顺序无关；
  - `datechart` 的 `.yj-kpi .trophy` 是**新增子选择器**（theme 里无 `.trophy` 规则，已 grep 确认 `theme-*.css` 零匹配），不是覆盖；
  - `timeline` 与 `timeline-cards.css` 的同名类（`.tl-date`/`.tl-node`/`.tl-card`/`.tl-cardwrap`）**只定义不同属性**，不构成覆盖。

#### ④ ★ 拆分暴露并修复了一个既有 CSS bug（timeline 轴线）

原 `timeline.html` 页内 `<style>` 的注释第 2 行写：

```
 * 卡片视觉（.tl-card/.tl-photo/.tl-body/.tl-racename*/.tl-tag*/.tl-kpis/...
```

`.tl-racename*/` 里的 `*/` 被 CSS 解析器当作**注释结束符** → 注释提前截断 → 紧随其后的 `.tl{position:relative}` 选择器被污染成 `.tl-tag*/.tl-kpis/... .tl`（无效选择器）→ **整条规则被浏览器丢弃，从未生效**。

- 内联在 HTML 里时 esbuild 静默容忍；拆成独立 `.css` 后 minify 报 `▲ [WARNING] Unexpected "*" [css-syntax-error]` 才暴露。
- **实际影响**：`.tl::before`（轴线）是 `position:absolute`，失去定位祖先 → 相对**初始包含块**定位 → 轴线从页面最顶端贯穿整个视口，穿过页头标题区（对照图 `tests/css-split-check/{ok,bug}.png`）。
- **修复**：注释里 `*` 与 `/` 之间加空格，并加警示注释说明此坑。修复后 `.tl{position:relative}` 正常生效，轴线正确限制在容器内（年份胶囊下方 → 末卡片）。
- ⚠ **这是本次唯一的视觉变化，且是修正而非回归**。若有人质疑「拆分应零变化」，答复：零变化指的是「不该有的变化为零」，此处的变化是把一个一直错位的装饰线放回正确位置。

#### ⑤ kpiHTML 去重（§6.2-4）

`stats.html` 原有两份**逐字节相同**的 3 行闭包 `kpi(k,v,cls)`（原 295-297 行于 `renderKpis()`、703-705 行于 `srkKpis()`），只有调用处不同。收口为文件级 `function kpiHTML(k, v, cls)`（`stats.html:220`），7 处调用改指它。**纯 JS 局部函数合并，不碰 CSS/构建/双仓文件，零风险。**

#### ⑥ 验证（构建 + 产物核对）

- `cd front && COPY_DATA=skip npm run build` ✓ 5.67s，**零 CSS 语法警告**（修复前有 `Unexpected "*"`）。
- **规则级比对（最严格的一步）**：用 `git show HEAD:front/pages/X.html` 取原 `<style>` 块，去注释/展平 `@media`/规范化空白后与新 `.css` 做集合比较：

| 页面 | 原规则数 | 新规则数 | 结果 |
|---|---|---|---|
| stats | 37 | 37 | 零丢失 |
| races | 61 | 61 | 零丢失 |
| datechart | 76 | 76 | 零丢失 |
| leaderboard | 13 | 13 | 零丢失 |
| timeline | 29 | 29 | 唯一「差异」= `.tl{position:relative}` 由污染态修正为正确态（即 ④ 的 bug） |

- **产物**：`theme` 63.22 kB / gzip 11.45；`races` 5.21 / 1.43；`datechart` 5.71 / 1.55；`stats` 2.63 / 0.92；`timeline` 1.70 / 0.68；`leaderboard` 0.99 / 0.48；`timeline-cards` 2.29 / 0.91。
- **源码残留**：5 页 `<style>` 计数全部为 0。
- **关键规则存在性**：`#page.embed` / `table.yj-lib.fs155` / `.dc-dp-panel` / `.yj-kpi .trophy` / `.lb-pager` / `.st-mat` / `.tl{position:relative}` 在对应 dist CSS 中均命中。
- **对照图**：`tests/css-split-check/timeline-ok.html`（修复版）vs `timeline-bug.html`（`.tl{position:static}` 模拟原 bug）→ `ok.png` / `bug.png`。**本机 Edge 无头截图静默失败（exit=0 但无文件），改用 Chrome**（`/c/Program Files (x86)/Google/Chrome/Application/chrome.exe --headless=new --virtual-time-budget=3000`）——记入工具坑。

#### ⑦ 未做（本轮明确不做）

- **间距令牌落地（§6.2-2）**：实测各页几乎不存在裸 `padding:12px` 之类行内硬编码，硬编码集中在页内 `<style>` 里且多为非标准值（`5px 7px`/`9px`），无法用四档令牌等值替换。真正可换的是 Tailwind utility（`p-4`→`p-card`），但那会**改变实际间距值**（16→24px），属视觉调整而非重构 → 不单独立项。
- **暗色模式（§6.2-3）**：`.yj-ov-*` 的渐变描边 + 双重径向雾需整体重新设计（不是换色），`.yj-tm--*` 需 200/900 色阶全反，涉 11 页逐类补变体，且无暗色设计稿 → 风险高，待设计驱动。

### §142 · 批量表格去掉键盘流 + 修复草稿箱放弃后的双向联动（2026-10-30 傍晚）

用户三点反馈：①③ 批量表格（基本信息 / 比赛记录两个页签）**去掉快捷键文案、不做快捷按键兼容**；② 改了基本信息表格后点草稿箱「放弃修改」，表格没变化。第 ② 条是真 bug，且比赛记录页签同样受影响。

#### ① 键盘流移除（edit-table.html + editor-table.js）

**删掉的**：
- `edit-table.html` 页头那行「点单元格就地改 · Enter 下移 / Tab 右移 / 方向键移动 · Ctrl+Z 撤销 / Ctrl+Y 重做 · Delete 清格」整条 `<span>`（历史：10-30 上午刚从 `<kbd>` 键帽回退成纯文本，下午直接删除）。
- `editor-table.js` `bind()` 里网格级 `keydown` 整块：Enter↓ / Tab→ / 方向键移动 / F2 进编辑 / Delete·Backspace 清格 / Ctrl+Z·Y 撤销重做。
- `moveCursor()` 与 `cursorTd()` 两个函数（只服务上述导航，移除后成死代码）。`setCursor()` **保留**——`commitEdit` / `applyCell` 提交后仍要重新给该格画光标环。

**保留的**（属编辑控件基础行为，不是「电子表格快捷键」）：
- 格内输入框 `Enter` = 提交本格（不再自动下移）；`Escape` = 取消本格。
- `Tab` 不拦截 → 走浏览器默认焦点移动，触发 `blur` 里的 `commitEdit`，效果与「点别处」一致。
- 工具条「↶ 撤销 / ↷ 重做」按钮、`Esc` 退出全屏。

#### ② 放弃草稿后表格不刷新（真 bug，两条路径）

**根因**：`editor.js::discardOne()` 按草稿类型分支，只有 `__rc`（比赛记录）派发了 `yj-rc-dropped` 事件通知表格页；**普通马匹字段草稿（`ov`）的分支只 `draftDropHorse()` 删 localStorage + `render()`，不派发任何事件**。而 `editor-table.js` 把 ov 草稿水合成表格行（`S.pendOv` / `S.sh.basic.rows`），内存状态没人通知刷新 → 用户看到「点了放弃，表格没变化」。

**修复**：
- `editor.js::discardOne()` 的普通马匹分支补 `document.dispatchEvent(new CustomEvent("yj-ov-dropped", { detail: { id } }))`，与 `__rc` 分支的 `yj-rc-dropped` 完全对称。
- `editor-table.js::init()` 新增 `yj-ov-dropped` 监听：清掉该马的 `touchedOv` / `pendOv` 痕迹、丢弃正在编辑的格，再 `hydrateBasic()` + `rebuild()` + `updateSummary()`。
  - 为什么要清 `touchedOv`：`hydrateBasic()` 会按当前草稿重建 `startOv`，但若残留 `touchedOv[id]`，下一次 `syncOv()` 会用旧 `startOv` 把已放弃的值写回草稿箱。
- ⚠ **双仓同步（2026-10-30 用户定稿：暂缓，本仓不做）**：`editor.js` 与 kzn 仓逐字节对齐，本次改动**只落在 yunji-web**；kzn 侧一律不动——已核实 `Z:/IdeaProjects/kzn-web` 工作区 `git status` 输出为空、17:00 后零文件改动。**同步时机与内容由用户本人决定并执行**，本仓不发起任何 kzn 侧写入。

**三条路径都已实测**（见 ③）：草稿箱放弃基本信息、草稿箱放弃比赛记录（`__rc`）、底部「放弃修改」按钮（`resetSession`）——三者都能让表格回到原值。

#### ③ 自动化验收（16 项全通过）

用同源 iframe 包装页驱动真实页面（`dist/pages/_selftest-linkage.html`，跑完即删），断言结果截图存 `tests/css-split-check/linkage-test-allpass.png`：

| 组 | 断言 |
|---|---|
| 基本信息 | 初始化 / 277 行渲染 / 点击出输入框 / Enter 提交生效 / ov 草稿写入 / **Escape 取消仍有效** / **方向键与 Delete 已无效果** / 抽屉打开 / **★ 放弃后表格恢复原值** / localStorage 清空 / **撤销按钮有效** |
| 比赛记录 | 849 行渲染 / 改格生效 / d.rc 写入 / **★ `__rc` 放弃后恢复原值** |
| 底部按钮 | 改格生效 / **★ 「放弃修改」后恢复原值**（headless 下 `confirm` 恒 false，测试内覆盖为 true） |

**测试工具坑（务必记住，本次踩了 3 个）**：
1. **本机 Edge 无头截图静默失败**（exit=0 但无文件）→ 改用 Chrome（`/c/Program Files (x86)/Google/Chrome/Application/chrome.exe`）。
2. **`--virtual-time-budget` 会加速 `setTimeout`**：用定时器轮询等数据加载，15 秒虚拟时间在真实几毫秒内耗尽 → 数据还没回来就超时。改用 **MutationObserver**（由真实 DOM 变化驱动，不受虚拟时间影响）。
3. **iframe 的初始 `about:blank` 文档 `readyState` 就是 `complete`**：用 `readyState` 判断「已加载」会误判并拿到空文档，测试永久挂起。必须等真正的 `load` 事件，并用 `location.href` 含目标页名二次确认。

#### ④ 未做

- 未删除工具条的撤销/重做按钮（用户只要求去快捷键，按钮仍在且实测有效）。
- 未改动 `Delete` 键在**输入框内**的原生行为（那是文本框自带，不属于表格导航）。

### §144 · 倾向统计：产驹倾向矩阵 PC/MB 展示优化（2026-10-30，用户提出「是否有更优解」）

- **动因（用户）**：产驹倾向 · TENDENCY 的界面是否有更优解，PC 端和 MB 端的展示优化。
- **现状问题（截图 + 代码实测，非推测）**：

| # | 端 | 问题 |
|---|---|---|
| 1 | MB | 15 个页签折成 **5 行**、占约 170px 纯空白（最后两行只剩零星几颗） |
| 2 | MB | 表格 9 列溢出约两列——「连对 / 复胜」被裁，且**没有任何可横滑的视觉提示**，看起来像渲染坏掉 |
| 3 | MB | 距离标签「中距离 1801-2400m」在 71px 列宽下折成 **3 行**，行高失控 |
| 4 | PC | 页签折成 2 行，第二行只剩「马主」一颗 |
| 5 | 双端 | 长列表（调教师 69 行 / 骑手 / 竞马场）在容器内竖向滚动时，**表头与「总体平均」基准行一起滚走** → 滚到中段后没有比较基准，只能凭记忆 |
| 6 | 双端 | **读数错误（本次最实质的一条）**：8 个数值列全是纯数字 + 红绿，样本量不可感知 →「长距离 16 场 25.0% 胜率」与「英里 364 场 9.6%」等权呈现，低样本档看起来像最优解 |
| 7 | 双端 | 死规则：`td.dim .num{color}` 空转——矩阵的 `<td class="dim">` 里从来没有 `.num` 子元素，出走<10 的行根本没被弱化 |

- **落地**：
  1. **页签栏**：PC 收紧到 `padding:4px 8px / font 12px / gap 4px` → 15 个一行放完；MB `flex-wrap:nowrap + overflow-x:auto` 改单行横滑，右缘 mask 渐隐。选中页签由 `renderTabs(true)` 调 `scrollIntoView` 滑入视野——**只在用户点击时传 true**，初始化传 false，否则 `block:"nearest"` 会把页面直接滚到矩阵处。
  2. **表格粘性**：`border-collapse` 改 `separate`（sticky 单元格在 collapse 下边框不跟随移动，Chrome 已知问题；全表只用横向边框，`separate + border-spacing:0` 视觉等价）→ `thead th` sticky top、`tr.base td` sticky `top:var(--st-th)`、`td.left/th.left` sticky left（窄屏横滑时类别常驻）。`--st-th` 由 `applyMatScroll` **实测表头高度**写入，不写死 px（字体回退/缩放下会错位，错位后基准行上沿漏出被覆盖的行）。
  3. **出走列数据条**：`--nb = 该行出走 ÷ 本页签数据行最大出走`，用 `background-image` 渐变 + `background-size` 画成格内数据条（不加额外元素，数字仍居中、单元格内容结构不变）。**分母刻意不含基准行**——基准行是各档之和、恒为最大，拿它当分母会让调教师/骑手这类「档多且每档都小」的页签每档只剩 2~3%，条全糊成一条细线、完全失去比较作用；以「最多档 = 100%」才比得出「哪档数据多」。基准行因此不给条（它是合计，不是档）。
  4. **距离标签拆两段**：`<span class="st-c1">中距离</span><span class="st-c2">1801-2400m</span>`，PC 同行（范围降为 11.5px 次级灰字，层次更清）、MB 各占一行（10px）。
  5. **MB 压缩**：字号 12px、内边距 `5px 3px`、`样本少` 徽章缩到 9.5px、隐藏**非当前排序列**的 ⇅（它靠负外边距悬在文字右侧不占表宽，窄屏 3px 内边距下会被右缘裁掉半颗，还会给表格留下 3px「幻影溢出」）。9 列在 375px 下完整显示；更窄机型走 `#matWrap` 横滑 + 首列投影兜底。
  6. **溢出提示统一**：`syncEdges()` 给 `#matTabs` / `#matWrap` 打 `data-edge="more|end"`，CSS 据此决定右缘渐隐与首列投影，滑到末端自动撤掉。容差取 **4px** 吃掉排序图标造成的幻影溢出（实测 `table.scrollWidth` 324 / 列宽合计 321，按 2px 判会把满宽表格误判成可横滑、平白给首列加一道投影）。
  7. **修死规则**：`.st-mat td.dim{color:#b4b4b8}` 直接命中单元格（率列里的 `yj-up/yj-down` 自带色，仍优先生效）。
- **验证**：`node scripts/stats/verify_stats.cjs` **193 通过 · 0 失败**（**顺手修掉一条自 §141 拆分 CSS 起就恒假的断言**：`tr.base td{background:#f4f4f5` 仍只读 `stats.html`，改读 `stats-page.css` 并同步为新写法；本次改动前基线即 192/1）；`npm run build` 过；dist 实测 `st-nb` / `data-edge` / `border-collapse:separate` / `td.dim{color:#b4b4b8}` 均在；实测数据：MB 表 `scrollWidth 321 = clientWidth 321`（9 列满宽无溢出）、页签 `29px` 单行（原 5 行）、长列表滚动 260px 后 `th top=0 / base top=26` 双双吸附。截图 `tests/stats-final-pc.png`、`tests/stats-final-mb.png`、`tests/tendency-sticky-pc.png`（调教师页签滚动中段）。
- **未做（明确取舍，不是遗漏）**：
  - 数值列**未改右对齐**——居中在 43px 窄列更稳，且要连带改排序图标的负外边距定位；本次收益不足以承担回归风险。
  - MB **未改卡片式列表**——会丢掉表头点击排序与「一行加得起来」的列语义，属另一套交互，需单独立项。
  - 15 个页签**未分组**——页签序 = 用户定稿（verify 有硬断言），分组必然要重排，与定稿冲突。

### §145 · 倾向统计：年龄成绩曲线改 ECharts 定制包（2026-10-30，用户提出「顺便换成自定义版 echart」）

- **动因（用户）**：年龄成绩曲线有没有优化展示的空间；顺便换成自定义版 ECharts，改完之后**没人引用的样式和控件删掉**。
- **现状问题（读 `setOption` 载荷 + 截图实测，非推测）**：

| # | 端 | 问题 |
|---|---|---|
| 1 | 双端 | y 轴写死 50%，而**撑满这个上限的只有一颗 9 场的 44.4%**（2岁4月，纯噪声）；14 颗可靠点（n≥20）实际落在 6%~15.3%，全挤在底部 30% 高度里互相压线 |
| 2 | 双端 | 悬停提示只有一个 SVG `<title>` —— 必须精确停在 3px 圆点上才出，触屏**完全不可用** |
| 3 | 双端 | 样本量只用「空心/实心」区分，两个 3px 圆肉眼几乎分不出；读者无法判断 44.4% 是 9 场还是 90 场 |
| 4 | 双端 | 没有总体平均参考线 → 与矩阵「高于/低于总体平均」口径断裂，看曲线不知道 15% 算高还是低 |
| 5 | 双端 | `#genSeg` 下拉 + `#curveLegend` 自绘图例是**两个控件做同一件事**；而「线型=指标」这条映射只存在于自绘图例里，指标一多就绕 |
| 6 | 双端 | 手写 SVG 的 x 轴 19 个标签等距硬排，窄屏必重叠（无 `hideOverlap` 之类的兜底） |

- **定制包（`front/public/echarts.line.min.js`）**：
  - 从 `echarts/core` 按需引入 **LineChart + Grid/Tooltip/Legend/MarkLine + CanvasRenderer**，esbuild 打成 IIFE，挂 `window.YJ_ECHARTS`。
  - 体积 **519 KB 原始 / 174 KB gzip**（与产驹赏金在用的 `echarts.bar.min.js` 515 KB/175 KB 同量级）；全量 `echarts.min.js` 约 1 MB/330 KB，只为一个折线图不值。
  - 只有 `stats.html` 引用；构建配方写在文件头注释里（`npm i echarts@5.6.0 esbuild` → `npx esbuild entry.js --bundle --minify --format=iife --target=es2018`），重建不依赖本文档。
  - `entry.js` 全文（重建时照抄即可）：

```js
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);
window.YJ_ECHARTS = echarts;
```
- **落地**：
  1. **y 上界只按可靠点定标**：`ymax = ceil(max(n≥SM_F 的点, 平均线) × 1.12 / 5) × 5`，下限 20%。本数据从 50% 降到 **20%**，可靠点带从占 30% 高度变成占 75%。
  2. **超上界的点贴顶画 ▲**：`d.real` 存真实值、`d.value` 钳到 `ymax×0.98`、`symbol` 改 `triangle`。不这么做只剩两个坏选择——要么让线冲出画布被裁成「断头」（实测观感像渲染坏了），要么把刻度让给一颗 9 场的点。tooltip 与明细表**照旧报真实值**（44.4%），只有图上高度是贴顶位置。
  3. **axis tooltip**：`trigger:"axis"` + 虚线 axisPointer，`formatter` 自绘「世代 · 指标 · 比率 · 出走n（· 样本少 / ▲超出上界）」；`confine:true` 防贴边溢出。
  4. **点径 = 样本量**：`symbolSize` 回调 `4 + 5×√(n/maxN)`（4~9px）；n<SM_F 仍额外改空心（白底 + 世代色描边），两种编码叠加。
  5. **总体平均参考线**：每个指标一条 `markLine`（灰虚线），**只挂在第一个可见世代上**，避免同一条线画多遍；标签 PC 放右端加白底小片（3岁4月后两条线都在 10~20%，裸字会被压），**MB 不显示标签**（图宽 321px，放哪端都盖数据）。
  6. **图例即世代筛选器**：ECharts 内置 legend，`data` = 世代、`selected` 存 `st.genSel`；点击只 `renderCurveTable` + `renderCurveNote`，**不重画**（避免动画回放）。系列 `name` 用「世代」而非「世代×指标」→ 同名系列被 ECharts 合并成一个图例项，点一下关掉该世代全部指标。
  7. **线型交给指标按钮**：`RATE_METRICS` 的 dash 串同时喂两处——按钮里的 `.st-lt` 小样用 `repeating-linear-gradient`、系列用 `lineStyle.type` 数组（`"6,3"` 字符串 ECharts 不认，必须 `split(",").map(Number)`）。
  8. **删掉的**：`#genSeg`（`<div class="seg">` + 渲染 + click 监听）、`#curveLegend`、`.st-legend i.dot`、整段手写 SVG 生成逻辑（`renderCurve` 137 行 → 232 行，但多出 tooltip/图例联动/贴顶标记/明细表跟随）。`.st-legend` 类**保留**——种马榜走势还在用。
  9. **y 轴不写 `splitNumber`**：`min/max` 固定时默认切 5 段 → 0/5/10/15/20 整值；写 `splitNumber:3` 会切出 0/8/20 这种非等距丑刻度（实测）。
- **验证**：`node scripts/stats/verify_stats.cjs` **211 通过 · 0 失败**（§144 基线 207，本次 +4：贴顶 ▲ 数量与真实值、只有 n<20 才会超界、页脚 ▲ 说明、tooltip 报真实值）。断言全部改读 `setOption` 载荷（页面已不产出 SVG）。浏览器实测：**真实鼠标点击图例**（`dispatchAction` 不触发 `legendselectchanged`，不能用来验这条）→ `selected:{"2023年世代":false,"2024年世代":true}`、明细表 27 行 → 8 行、峰值注解只剩 2024；再点回来 27 行复原。PC 1016×260 / MB 336×240 画布，x 轴标签 `hideOverlap` 生效（MB 只留 5 个），零 console error。截图 `tests/age-final-pc.png`、`tests/age-final-mb.png`、`tests/age-card-pc.png`、`tests/age-card-mb.png`、`tests/age-legend-click-table-pc.png`。
- **未做（明确取舍）**：
  - **没有把 n<20 的点直接不画**：13/27 个点都是小样本，砍掉等于把 2岁2月~2岁5月整段（幼驹最早出赛的月龄）抹掉；改成贴顶 ▲ 保留信息量。
  - **图例切换不重算 y 上界**：切换前后同一高度代表同一百分比，才比得出「世代差多少」；重算会让刻度随点击跳动。
  - **没有加误差带/置信区间**：数据只给得到「出走 × 前三着」，算 Wilson 区间要改后端预计算；当前用「点径 + 空心 + ▲」三层编码已能表达可靠性。
  - **没有做「导出 PNG」**：ECharts 自带 `getDataURL`，但页面其余图表（种马榜、产驹赏金）都没有导出，单点加会成为孤例。

## 三、界面定稿 · 2026-10-31 起（§146–§188）

## §146 · 日期统计页 7 项展示优化（2026-10-30）

**对象**：`datechart.html` + `datechart-page.css`（数据/交互零改动，纯展示层）。

**最终思路**：日历的「信息可扫读性」三件套——空格日给 `#fafafa` 极浅底（网格不再像没加载完）、周末列头着色（土=蓝 `#4467ab` / 日=红 `#bb3f39`，日本日历惯例；星期头同步从日文曜日「月火水…」改中文数字「一二三…」，与日期选择器面板同款）、mb 端胜日格加 4px 青绿圆点 `.dc-wdot`（≤768px 显示，PC 仍靠背景深浅，双通道编码补色弱可读性）。打磨项：**同日分组已回退（用户反馈空日期列反造成困扰）**——PC 明细表恢复每行完整日期；小字对比度 `.dc-dow/.dc-prz/.dc-ym-n` `#8a8a8a`→`#6b6b70`（达 WCAG AA 4.5:1）；🏆 emoji 换单色 SVG 奖杯 `TROPHY`（Material emoji_events 路径，`currentColor`，KPI/日历格/年卡三处共用；颜色定稿亮金 `#e8a013`（用户从 `#d97706`/`#e8a013` 中选定更亮的后者；奖杯语义、暖色与 chart3 同族）；语言统一「勝→胜」「週→周」（含周面板 tooltip）。

**关键实现**：`dc-wdot` 绝对定位于格左下（`.dc-cell` 补 `position:relative`）。年视图月卡「胜 n」同步改中文。

**验证**：`npm run build` 通过；dist 核对 `datechart-*.css` 含 `dc-idle/dc-wdot/dc-dow.sat/dc-dow.sun/#6b6b70` 全部新类、`dist/pages/datechart.html` 含 SVG 路径与「周/胜」文案。浏览器截图核对（PC 1440 / mb 390）：列头着色、空格浅底、金色奖杯、mb 圆点全部生效，无重叠/截断。截图 `tests/datechart-v2-pc.png`、`tests/datechart-v2-mb.png`（改前基线 `tests/datechart-pc.png`、`tests/datechart-mb.png`）。

## §148 · 航迹线（timeline）四组展示优化（2026-10-31，用户问「是否还有优化空间」全选）

**对象**：`timeline.html` + `timeline-page.css`（布局）+ `timeline-cards.css`（视觉原子，两页共享）+ `editor.js`（预览同步）。数据/后端零改动。

**最终思路**（PC/mb 截图实测定案，骨架不动——三列 grid、六类事件色、赛事名恒单行均维持）：
1. **无图纯文本卡**：无图事件不再出 `.tl-photo.empty` 浅灰占位板（🐎 emoji 部分环境还渲染不出），卡片退化为全宽文本卡——信息密度更好；卡片壳 `.tl-card`(flex)+`.tl-body`(flex:1) 天然支持，无需变体类。`timeline-cards.css` 删 `.tl-photo.empty` 两规则；`editor.js` 预览同步 + 提示文案补「无图 = 纯文本卡」。
2. **年份胶囊 sticky + 年内计数**：`render()` 改为按年分组 `.tl-group`（yearrow + 该年全部行，交替序号跨年连续）；`.tl-yearrow` `position:sticky;top:8px`（sticky 以 `.tl-group` 为界，只在本年份区间内吸附）；yearrow 全宽透明层 `pointer-events:none` 防挡下方卡片 hover（胶囊自身恢复）；胶囊内补 `.tl-yc`（`N 条`，细竖线分隔）+ 默认淡投影。mb 端 `top:4px`。
3. **交互微动效**：卡片入场 fade+上浮 14px（`IntersectionObserver` 逐行加 `.in` 放行；hidden 态只在 JS 挂 `.tl-anim` 后生效=渐进增强，无 JS/老浏览器全量放行绝不藏内容；整体包 `@media (prefers-reduced-motion: no-preference)`）；hover 事件行 → 同排节点 `scale(1.45)`+中性光晕（过渡在 cards 的 `.tl-node` 底座）；图片 hover `scale(1.04)`（.35s）。
4. **日期+统计条**：日期年份 `<b>` 加粗加深（`#555b61`，月日维持浅灰 tabular-nums；`dateHTML()` 拆年月日，editor.js 预览同构）；顶部 stats 一行灰字 → 「数字+量词标签」迷你统计块（17px 粗体数字，重赏/父子制覇数字走 `text-primary` 青绿=胜语义色；Tailwind utility 内联，pages/*.html 在 content globs 内可编译）。

**验证**：`node --check editor.js` ✓；`npm run build` ✓（⚠ 构建须带数据拷贝：试跑 `COPY_DATA=skip` 后 dist/data 被清空未回填，截图 401/404——**dist 会先清空**，skip 只该在确认数据无需回填时用）；dist 核对 `timeline-*.css` 含 `tl-yc/tl-anim/tl-group/hover 节点/reduced-motion/pointer-events:none`、`timeline-cards-*.css` 含 `tl-date b/scale(1.04)`、`tl-photo.empty` 与 🐎 全站清零。截图 `tests/timeline-review/`（`pc.png/mb.png`=改前，`pc-after.png/mb-after.png`=改后）。注：无头截图中个别图片灰块 = 懒加载与本地单线程服务器的传输竞态（图片 curl 全 200、每轮失败卡片随机），非页面问题；编辑台空态正常无报错。

## §149 · 全局加载动画 + 相册交互升级（2026-10-31，用户三项诉求）

**对象**：`public/loading.js`（新组件）+ `pages/profile.html`（相册/iframe 遮罩）+ `pages/pedigree.html`、`pages/races.html`、`pages/stats.html`（加载态接入）。数据/后端零改动。
**背景**：2026-09-21 任务 #18 撤销过骨架屏/spinner 一整套（各页保留「正在加载…」纯文案）；本条经用户**重新立项**，只恢复最轻量的 spinner（数据等齐一次性渲染口径不变），专治 iframe 内嵌子页与跨站图表的冷加载空白期。

**最终思路**：
1. **全局加载动画 `YJ.ui.spin(o)`**（loading.js，全站可自由调用）：环形 spinner（`animate-spin` 核心 utility，浅轨道 + 1/4 圆弧，`text-primary`）+ 可选文案；`{label, sm}` 两档（sm=卡内紧凑）。⚠ 注释里不得出现 `**/*.js` 之类含 `*/` 的 glob 字面量——会把块注释提前闭合（verify_stats eval 当场炸过，已改写措辞）。
2. **iframe 加载遮罩 `YJ.ui.frameSpin(fr)`**：spinner 覆盖层盖在 iframe 容器上（容器须 relative）。退场三保险：主信号 = 子页渲染完 postMessage `{type:"yj:frameReady"}`（`e.source` 校验只认自己这个 frame）；兜底 = iframe load+1.2s；保险 = 9s。profile 的 pedframe（`.p-3` 补 `relative`）与 raceframe（新包 `relative` 容器）接入；pedigree/races 内嵌分支在首次渲染定形（成败都算）时发 ready 消息。races 内嵌初始态由「请在上方选择一匹马」改为 spinner（该文案在内嵌里本就不成立）。
3. **加载态接入**：pedigree 内嵌「加载中…」、races 全库加载「正在加载全库比赛数据…」、stats 种马榜走势「読み込み中…」→ spinner（页面无 loading.js/组件缺失时 `YJ.ui &&` 守卫退回纯文案）；stats 数据概览卡加 `#kpisLoad` 占位（stats.json 冷加载期间 spinner，renderKpis 取数后整体覆写）。
4. **相册交互升级（profile avatarHTML/avatarBind 重写）**：
   - **双层交叉淡入**：两层 `pav-img` 叠放（备用层建时无 src，避免空 src 请求当前页），切换 = 新 src 写进备用层 → onload/complete 后翻 `opacity`（duration-300），无白闪；旧层淡出后留作下一个备用画布（src 保留防淡出中破图）。相邻一张预加载（§5.3.2 保留）。
   - **箭头钮**：透明大字Glyph → 36px 白玻璃圆钮（`bg-white/85 + border-black/10 + shadow-md + backdrop-blur`），hover 放大 + 主色，active 按压回缩，带 aria-label。
   - **圆点指示器**：底部居中黑玻璃胶囊（≤8 张才出），当前张 = 加长白点，切换动画 `transition-all`。
   - **输入面**：保留点击左/右半切换；新增触摸滑动（>40px 判翻页）与键盘 ←/→（wrap `tabindex=0`，焦点环 focus-visible）。
   - 计数 chip 补 `z-10`（旧层次偏低会被图盖住的理论隐患）。

**验证**：`npm run build` ✓；dist 核对 theme css 含 `@keyframes spin/animate-spin`、loading.js 含 `yj-frameload`、pedigree/races 含 `frameReady`、profile 含 `pav-dots`、stats 含 `kpisLoad`、`dist/data/basic.json` 在。门禁 verify_stats 211/0（首跑曾炸于注释 glob，见上）、verify_drill 60/0、verify_yj-cache 16/0。playwright-core（channel msedge）实测：profile ?horse=40 遮罩退场、相册点击 ‹›→ 计数 1/2→2/2 + 圆点翻位（截图 `tests/ui-149-overlay.png`/`ui-149-profile.png`）；stats 图表出图、KPI 覆写正常（`ui-149-stats.png`；调试注意：子页直开会被 rehome 回壳，须从外壳 iframe 里断言）。

- **§149 补记（相册浮层二轮定稿，2026-10-31 用户反馈「逻辑没问题、样式丑」）**：浮层控件从「白玻璃三件套」改**暗色玻璃语言**（macOS/图库式）：箭头 = `bg-black/35 + ring-white/25 + backdrop-blur-md` 圆钮 + SVG 细箭头（替换文字 ‹›），PC 默认 `opacity-0` 悬停相册 `group-hover` 浮现（mb 无 hover 常显、键盘 focus-visible 浮现）；计数 chip 同语言暗玻璃；圆点去掉灰胶囊底，改**底部渐变暗部**（`from-black/40`，h-16/mb 12）承托裸点（激活 = 加长白点）。逻辑（双层淡入/预加载/输入面）零改动。验证：build ✓（⚠ grep css 时注意 Tailwind 产物里 `/` 转义为 `\/`，直 grep `from-black/40` 会假阴性）；无头实测悬停浮现/点箭头 2/2 + 圆点翻位（截图 `tests/ui-149-style-hover.png`/`ui-149-style-next.png`）。

- **§149 补记 2（总赏金上格 · 方案B定稿，2026-10-31）**：数据概览色带赏金组补「总赏金」格 = 獲得賞金(中央)+獲得(地方)（JBIS 口径，収得是另一口径不入和；源值「3億4,429万円」混合字符串 → `manOf` 解析成万円相加再回排，0/双缺 =「—」同 money() 惯例）。用户从 4 候选（B 四格均分 / C 升主格前插 / D 收单格 / E 并入战绩行，对比页 `tests/prize-band-variants.html` + 截图 `tests/ui-prize-variants.png`）中**拍板方案 B**。落地：`.yj-ov-prizes--4` 变体（数值 20px、字距/格距收紧、`flex:1 1 120px` + 容器 wrap → 宽屏 1×4、中等宽自动 2×2 不重叠）；连带微调 `.yj-ov-rec` padding 28→24、`.yj-ov-rate` 22→18（腾宽度）；mb 端 `.yj-ov-prizes--4 .yj-ov-m` flex-basis 还原 auto（120px 行向 basis 在纵排会变每行最小高、撑出大空行）。中间被否的「hero+sub 明细降级」与 22px 一刀切均已回退。验证：build ✓、fit 实测 854/854 无溢出、PC 2×2 与 mb 紧凑行截图 `tests/ui-149-band*.png`。
- **§149 补记 3（四格数值字号回调，2026-10-31 用户反馈「比三率还小」）**：`--4` 数值 20→**24px**（= 三率 `.yj-ov-rate b` 同级，主次不再颠倒），格距 padding-left 14→12；实测 1500 视口 854/854 单屏无溢出（超宽自动折 2×2）。连带修：mb 媒体查询里 `.yj-ov-m b{20px}` 特异性低于 `--4` 的 24px 规则会失效，补同特异性 `.yj-ov-prizes--4 .yj-ov-m b{20px}` 覆盖（截图 `tests/ui-149-band24.png` / `ui-149-band-mb.png`）。

- **§149 补记 4（血统配色统一 + 外壳级浮层 + 照片灯箱，2026-10-31）**：①血统格父系/母系配色统一为基本信息性别徽章全站基准（牡蓝 #C9EFFE/名 #0B5A8C · 牝粉 #FFDBD5/名 #B03A30，替换旧 #e9f1f7/#f8eeee）。②血统弹窗遮罩「一边遮住一边没盖住」根因 = profile 被回壳进外壳 iframe，页内 fixed 遮罩盖不到外壳侧栏；用户从 3 案选定**外壳级全屏暗遮罩**：index.html 增加浮层渲染端（yj-util + pedigree + lightbox 三脚本 + message 通道，沿用 e.source===frameEl.contentWindow 校验），profile 收 pedigreeFull 后转发 parent（直开无外壳时本地 openModal 兜底）；渲染后 frameEl.contentWindow.blur()+window.focus() 归还焦点，否则 Esc/方向键仍发给 iframe。③新增 public/lightbox.js（YJ.lightbox.open(photos,index)）：bg-black/85 全屏暗场、双层交叉淡入、玻璃圆钮 ‹ ›、计数徽章、Esc/点空白关闭、←/→ 与触摸滑动、相邻预加载；相册加 .pav-zoom 放大钮（单图/多图都有，单图也补 data-photos+group），点击转发 yj:lightbox 消息（承接相册当前张序号）。⚠ lightbox 初始计数徽章初版硬编码 "1/N" 已修为 (idx+1)；「显示 40-1 而非 40-3」排查后是数据里照片数组本身顺序 [40-3,40-1]、行为一致非 bug。验证：build ✓；无头实测配色 rgb 对拍 ✓、弹窗/灯箱均在外壳文档且 0,0,1400,900 全屏 ✓、Esc/ArrowRight 经焦点归还后可用 ✓（截图 tests/ui-149-pedmodal.png / ui-149-lightbox.png）。
- **§149 补记 5（mb 血统弹窗改回横滚版，2026-10-31 用户拍板）**：撤销 2026-10-30 §23/§2.7 的窄屏缩档（≤768px 取消 min-width、字号降 9px → 名字大面积省略号），恢复 PC 同款正常字号 + 横向滚动；并把窄屏横滚宽度提到 **1120px**（= PC 弹窗自然宽度实测 1124px——反正要横滚，滚距换零省略号：760px 底线下 62 名字仍截 24 个）。简约 2 代内嵌卡（.pside-simple 自身锁 min-width:0）不受影响。验证：build ✓；375px 视口实测弹窗网格 1120px 可横滚、截断 0/62、内嵌简约卡 317px 无滚动（截图 `tests/ui-149-pedmb.png`）。
- **§149 补记 6（mb 横滚版滚动适配，2026-10-31）**：横滚不能只搬 PC 原样——openModal 补 mb 专属引导与反馈：①弹窗 body 包 `relative` 层加**左右渐隐提示**（`pg-fade-l/r`，黑 10% 渐变 28px），scroll 监听状态机：未滚动右缘亮、到最右左缘亮、居中两缘同亮，不可横滚（PC）全部隐藏；②底部 **「⇄ 左右滑动查看全部世代」提示条**（`pg-hint`，`hidden max-md:flex` + JS 按可滚性显隐）；③`.pg-modal-body` 补 iOS 惯性滚动。**修弹窗高度链**：原 `.pg-modal-wrap`（block）最小高度被内容撑破——16 行网格 962px 把提示条推出 `max-h-96vh` 弹窗外（overflow-hidden 裁掉不可见）；改嵌套 flex 收缩链 `wrap: flex-1 min-h-0 flex-col + body: flex-1 min-h-0`（`h-full` 对 max-h 派生高度不生效，百分比链路要靠 flex-1）。close() 统一清 resize 监听。验证：build ✓（另发现一次构建瞬时丢 dist/bus.js——Windows 文件锁竞态，重跑恢复，**build 后应核对 dist 完整性**）；375px 实测几何 body 697/hint 25 全收进 780 弹窗、初始 fadeR=1/fadeL=0 → 滚到头 fadeR=0/fadeL=1、提示条显隐正确、PC 零变化（hint display:none、无渐隐）；截图 `tests/ui-149-pedmb-hint2.png`。
- **§149 补记 7（mb 横滚版二轮瘦身，2026-10-31 用户反馈「太臃肿」）**：横滚版初版直接沿用 PC 行高 26px/字号 14-12px/宽 1120px，手机上观感臃肿。mb（≤768px，仅 `.pg-modal` 作用域）缩一档：行高 26→19px、名字 14/13/12→11/10.5/10px（`!important` 压过 cell() 的 inline 字号）、meta 9→8px、内距 2px8→1px6、横滚宽 1120→**880px**（字小同宽容纳更多字符，实测仍 **0/62 截断**）。整树高度 832→641px 一屏收住；提示条/渐隐/触滚不受影响。验证：375px 实测 gridW 880、fontSize 11px、truncated 0/62、hint 可见、无报错（截图 `tests/ui-149-pedmb-compact.png`）。

## §150 · 编辑台三页 + 批量表格改版（2026-10-31，用户四点诉求全选 + 三附加项）

**对象**：`public/editor.js` + `public/editor-table.js` + `pages/edit.html`（无改动，纯壳）+ `pages/edit-table.html`（工具条）+ `pages/theme.css`（编辑台组件层）。数据契约 / 草稿链路 / 提交管线零改动。

**最终思路**（方案先经 4 张 mockup 确认，用户 4 模块 + 3 附加项全选）：
1. **基本信息表单分组化**：14 行单列台账 → 「名字 / 状态 / 抹消去向(条件) / 阵营 / 成绩与赏金 / 备注」六组（`.yj-ed-groups/.yj-ed-ghead/.yj-ed-grid2`），短字段两列网格（`max-md:` 降单列）；字段行改竖排 cell（`.yj-ed-cell`：标签行内联状态胶囊 + 「恢复官方值」小钮），状态着色从整行底色下沉为控件描边（`--pin` 浅青 / `--dry` 橙）；金额字段（セリ/総賞金/中央/地方）`f.num` 右对齐 tabular-nums + 「円」后缀。`softRefreshRow` 仍按 `[data-row]` 等值替换，逐键刷新不丢焦点；抹消组条件展开 + 组尾预览行机制原样保留。
2. **图片区拖拽网格**：大图位（🐎占位 slot）退役，改 120px 瓦片网格（`.yj-ed-thumbs/.yj-ed-thumb`）：首图「封面」青绿徽标、其余序号角标、悬停 ✕、压缩结果条；末尾恒挂虚线「＋」加号格（点击上传 / 空态通栏放大）；**外部文件拖入** = `dataTransfer.types` 含 `Files` 分流到 uploadQueue（与缩略图重排序同一容器两套语义，`isFileDrop` 判别 + `.yj-ed-extdrop` 整区高亮）；**Ctrl+V 粘贴图片**直进压缩入库（仅 horse 页装 document paste 监听，文本粘贴不拦截）；外链导入收进工具行小钮（`state.photos.open` 面板复用）。草稿链路（IndexedDB / persistPhotosOf / §107 即时落箱）不动。
3. **航迹线节点表单**：date+title / cn+note 两列；**图片从手填路径文本框改 84×60 小格**（`.yj-ed-tlph`：有图缩略图+✕、无图图标占位）+「＋上传图片」钮，手填路径降为紧凑小输入框（兼容保留，`data-tf="photo"` 链路不变）；标签改**胶囊流**（`.yj-ed-tagpill`：色点+文字+✕，点胶囊展开该枚编辑 `state.tl.tagEdit`，一次一个；新标签自动进编辑态）；实时预览卡（§91）与落表校验零改动。
4. **批量表格**：页签挂待保存计数徽章（`updateSummary` 同步 `#cntBasic/#cntRaces`，0 隐藏）；新增「只看待保存」开关（`S.onlyDirty` + `rowDirty`：基本信息按 pendOv、比赛按 _st/_pend，过滤进 computeView）；待保存格悬停**原值对照 title**（基本信息=官方值+已保存双基线，比赛=_base）；基本信息页签马名格附「↗ 去编辑」锚点（新标签 `edit.html?id=`，rehome 回壳；grid click 先行 guard 防触发就地编辑）；**粘贴导入先预览后入表**（`showPastePreview`：行数+前 8 行样例+未匹配马名警示，确认才 doPasteImport）；搜索支持 `列名:值`（表头中文名或字段键，认不出回退全文本）。键盘流按 §142 定稿不复活。
5. **附加项**：保存条「变更摘要」恒显折叠 chip（无改动灰/有改动橙，点击展开 `state.sumOpen`；`renderSummary` 对 table 页守卫——顺带修掉 editor.render 用「未选马」覆写表格页摘要的隐患，显隐收口 `syncSummaryVis()`）；`.yj-ed-in` 36→34px 统一；时间线节点行加 ↑↓ 快速调序（`tlMove` 相邻交换 + persistTlDraft，落表仍按 date 稳定排序——同日期节点间有效，title 已注明）。

**验证**：`node --check editor.js / editor-table.js` ✓；`npm run build` ✓；dist 核对 theme-*.css 含 `yj-ed-groups/ghead/grid2/cell--pin/cell--dry/thumbs/cover/thumb--add/extdrop/tagpill/tlph` + `outline-style:dashed`/`pr-8`（⚠ `outline-dashed` 经 @apply 内联，直 grep 类名假阴性）、dist/editor.js 含 `isFileDrop/tlMove/sumToggle`、dist/editor-table.js 含 `showPastePreview/onlyDirty/data-hedit`、edit-table.html 含 `cntBasic/dirtyBtn`。无头实测（playwright-core channel msedge，外壳 iframe frameLocator，脚本 `tests/_pw/check150.mjs`，截图 `tests/ui-150-{edit,table,timeline}.png`）：edit 页 5 分组 + 两列网格 + 4 个金额右对齐 + 封面徽标/加号格 + 摘要 chip 点开有明细；table 页改格后页签徽章 0→1、橙格 title 原值对照、277 个「↗」锚点 href=edit.html?id=N、「只看待保存」277→1 行、粘贴预览弹窗出现/取消关闭；tl 页编辑卡图片小格 + 标签胶囊自动进编辑态 + 两个同日期节点 ↑↓ 调序后首行互换；全程 console/pageerror 零报错。**修一处测试中发现的接线遗漏**：edit-table.html 的 `YJ.editorTable.init({...})` 初版漏传 `dirtyBtn/cntBasic/cntRaces`（els 查表有了、html 没传 → 徽章/开关静默失效），已补。

## §154 · 草稿判脏「净效果等值」收口为单一函数 YJ.util.effEqual（2026-10-31，用户提问驱动）

**现状核实**：判脏散落 7 个调用点、4 种写法——字段/表格 `String(a)===String(b)` 裸比 ×5（editor.js putFieldDraft；editor-table.js setBasicCell×2 / hydrateBasic×2 / setRaceCell）、照片 `photoKeys()` 键串 `===` ×1、时间线 `JSON.stringify` 内联重复 ×2（loadTimeline / persistTlDraft）。语义同源（净效果 vs 基线），≥3 处跨页 → 按 §48 收口进 yj-util.js。

**实现**：`YJ.util.canon(v)` 稳定序列化 + `YJ.util.effEqual(a,b)` = canon 等值。设计取舍：
- 原始值走 `String()`（表单口径：1 与 "1" 同值，保持既有字段/表格语义；调用侧标量先 String() 归一）；
- 对象键**排序**——比 JSON.stringify 更稳：磁盘 JSON 与内存重建的同内容对象键序可能不同，stringify 会插入序敏感误判 dirty（原 TL 判定潜在假阳性，顺手修复）；
- 数组保序（照片/节点顺序是语义）；
- 字符串值不加引号转义（松散表单等值），边界注释注明「仅限同 schema 两份数据的等值判定」。
- editor.js 1302/1654 两处 `String()===String()` 是 **ID 等值**非脏判定，语义不同不收口（仅 2 处不动）。

**为什么不用哈希**：本场景数据量 KB 级、单次比较，canon 比较即 O(n) 最优；哈希仍需 O(n) 计算、还引入碰撞风险（32/53-bit 非加密哈希的生日碰撞对「免确认净零」判定不可接受），只有跨会话指纹/远端同步/大 blob 去重才值得上 SHA-256（crypto.subtle，需 https/localhost）。

**验证**：node --check ×3 ✓；npm run build ✓（dist editor.js/editor-table.js/yj-util.js 均含 effEqual）；回归 check151（照片净零+引用比赛带图）/check152（TL 净零快照+文案）/check153（表格净零+建议浮层）三轮全绿，零 console 错误。

## §155 · mb 端开放编辑（2026-10-31，用户定稿：mb 体验接近 PC）

**旧门**（mb 只读门，原 §82.13，已随本节作废）：四编辑页（edit / edit-table / edit-timeline / edit-drafts）是纯 CSS 门——「🖥️ 请在电脑端使用」占位块 + 主容器/保存条 `max-md:hidden`，代码逻辑本身设备无关。拆除即通。

**改动**：
1. 四页删占位块，主容器与 savebar 去 `max-md:hidden`；旧门注释改 §155 定稿。
2. **触屏可达性**：照片瓦片 ✕ 原为 `hidden group-hover:inline-flex`（触屏无 hover 不可达）→ 加 `max-md:inline-flex` 常显；PC 行为不变。
3. **触屏调序**：HTML5 DnD 不触发于触屏 → 瓦片左下 ‹› 小钮（`md:hidden`，`data-pmv` 委托到 movePhoto + render），首/尾位相应钮隐藏；PC 仍走拖拽。
4. 顺带修文案残留：抽屉「已保存（人工表现值）」→「人工维护值」。
5. 已核实无需改的：抽屉/建议浮层/selector 均自带 max-w-full；表格 sticky 列 + overflow 触屏横滚；工具条 flex-wrap 自然换行；shell 侧栏 mb 有 menuBtn 开关、编辑组注入只看 ?edit=1 与设备无关。

**触屏不具备的 PC 能力**（点按上传/外链已覆盖核心链路）：拖文件入库、Ctrl+V 粘贴、拖拽排序（已由 ‹› 补齐）。

**验证**：build ✓；tests/_pw/check155.mjs（390×844 isMobile+hasTouch）——四页真实界面渲染、保存条可见、照片 ‹› 换位双向通过（img 身份比对）、✕ 免 hover 可见、改馬主字段提交钮解锁、表格 277 行 + 点格出 select 编辑器、PC 1400 回归调序钮/✕ 正确隐藏；check151-153 PC 回归全绿；零 console 错误。截图 tests/ui-155-{edit,table,timeline}-mb.png。

## §156 · mb 灯箱图片不显示（跨文档相对 URL 404，2026-10-31 用户实测反馈）

**现象**：部署站手机端点放大 → 灯箱壳正常（X/大箭头/计数），但大图空白，只见底下相册卡透出来（小箭头/🔍/2/2 幽灵重影），像「放大出了异常」。

**根因**：跨文档相对路径解析。profile 在 iframe 内把 `YJ_DATA.url()` 产物（`../data/photos/x.webp`，「页相对」）经 postMessage 发给外壳，外壳文档在站点根（部署子路径 `/yunji-web/` 下）解析时多退一级 → `/data/...` 404 → 灯箱 img 空白（onerror 仍 flip，双层都透明）。本地 dev 服务（项目根含源 data/ 目录）恰好掩盖了问题；pages 自身加载数据不受影响（pages 在 1 层子目录，`../data` 解析正确），唯独灯箱这种「外壳层渲染」的跨文档场景踩中。

**修复**（front/index.html 接收侧收口，sender 零约束）：收到 `yj:lightbox` 后以 `frameEl.contentWindow.location.href`（同源可读）为 base，`new URL(u, base).href` 归一成绝对 URL 再交 YJ.lightbox.open——相对/绝对/data: 均兼容，未来其他 sender 也不会再犯。

**验证**：搭子路径镜像（tests/_pw/_sub/yunji-web ← dist，:8091）复现部署形态——修复前 img `natural 0x0`、src 解析到站点根（404 实锤）；构建修复后 img `854x1280 → rendered 367x549`、src 正确落子路径、翻页计数 2/2；像素采样确认遮罩（背景 rgb≈37 = 白字×15%）与照片层（rgb≈229 全亮）层级正确；直开本页（无外壳）本地兜底不经此路径、本就正确。390×844 触屏视口，零 console 错误。截图 tests/ui-156-{before,after-mb}.png。

## §157 · 目录总览三组统计图交互升级（2026-10-31，用户：pc/mb 设计优化 + 加交互效果）

**对象**：profile.html「未选马」目录总览的 概览(年份 treemap) / 性别(三等分列) / 状态(treemap) 三组。此前块只有 `hover:brightness-95` + 原生 title，整区静态。

**改动**（全部收敛在 renderOverview 作用域 + theme.css 面积图皮肤段，不动数据）：
1. **块 hover/按压升级**（theme.css `.yj-tm`/`.yj-tile`）：hover = 上浮 -2px + shadow-md + brightness-95；active = 按压回弹（触屏点按也有反馈）；transition 扩为 filter/transform/box-shadow 200ms。块为绝对定位，transform 与 left/top 不冲突。
2. **入场动画**（theme.css @layer 外新增 `.yj-tm-anim` + `@keyframes yjTmIn`，防候选裁剪同 §147 先例）：块/性别瓦片交错淡入上浮（fade + translateY(6px) scale(.97)，450ms，块序 ×45ms 内联 delay）。fill 模式 **backwards**——只覆盖 delay 期，动画结束回归普通样式，不压 hover 的 transform 过渡。resize 重排不传 anim（拖窗口不反复闪）。
3. **数字滚动**：块内匹数标 `data-cnt`，首次渲染 rAF 统一时间轴 650ms ease-out cubic 滚到目标值；只跑一次，resize 重建的块直出终值；`prefers-reduced-motion` 直接终值（CSS 侧动画/过渡同媒体查询全关）。
4. **悬停读数条**：每组图下常驻一行（色点 + 类别 + 含义说明），`#ovStats` mouseover/mouseout 委托，数据源 = 块上 `data-name`/`data-tip`，色点取块 computed backgroundColor 跟随块色；mouseout 以 `b.contains(relatedTarget)` 排除块内子元素移动防闪烁。解决块 overflow:hidden 装不下浮层、原生 title 慢的双重限制（title 保留给读屏/触屏长按）；mb 端 tap 色块同样触发 mouseover 更新读数条。
5. **状态图补占比**：tmPaint 传入全状态合计为 pctSum → 大块（ih≥64）显示占比，与概览图同语言。
6. **组头合计 chip 统一**：性别/状态组头右侧补「合计 n 匹」chip（同概览组「收录产驹总数」语言）；mb 端组卡 p-5 → max-md:p-3.5、站点标题卡 p-6 → max-md:p-4。

**验证**：build ✓（dist theme CSS 含 yjTmIn keyframes / .yj-tm:hover 上浮阴影 / reduced-motion 关停，:8091 服务 dist）；Edge 无头 dump-dom（?embed=1 避 rehome 回壳）——10 色块 + 3 读数条 + data-cnt 齐备，dump 抓到 count-up 中间帧（146→"11"）与入场动画中间帧（截图 tests/_ov_pc.png / tests/_ov_mb.png：PC 1200 / MB 390 布局无重叠无裁切，读数条默认文案「悬停 / 点按色块查看分类说明」就位）。

## §158 · 马匹详情页交互八连（2026-10-31，用户点名 1/3/4/5/6/8/11/12 号提案）

**对象**：profile.html 选中马后的详情视图（字段表 / 血统 iframe / 概览色带 / 出走表 iframe）。

**改动**：
1. **字段行点击复制**：`fi()` 行挂 `.yj-cp`（hover 提亮 + 手型 + title 提示）、值槽 `.yj-cp-v`；点击取 textContent（空值「—」跳过）→ clipboard API（失败退 execCommand 隐藏 textarea），成功后值槽尾部浮出「已复制」小签 1.2s（`.yj-cp-ok`，keyframes `yjCpOk`）。委托绑在常驻的 `#body` 上一次生效（bindDetailExtras，挂函数 flag 防重绑）。
2. **血统块 hover 提亮 + 弹窗内 JBIS 直达**（public/pedigree.js）：`.pcell` hover = brightness(.955) + 1.5px 内描边（reduced-motion 关停）；cell() 输出 `data-pid`（台账 jbis 口径 id）；**完整 5 代弹窗内**点击单元格 → 新标签 `jbis.or.jp/horse/{id}/`（openModal 补 title「点击打开 JBIS 资料 ↗」）；简约 2 代网格点击仍是「弹完整版」既有语义，委托里显式排除。
3. **切马过渡**：render() 重绘 `#body` 后重触发 `.yj-view-in`（260ms 淡入上浮；remove→reflow→add 重放；reduced-motion 关停）。
4. **KPI 数字滚动**：§157 的 countUp 收口为 `animateCounts(root)`（data-cnt + data-fmt：缺省整数 / 'pct' / 'man'——'man' 把万円数滚成「X億Y,ZZZ」重建赏金排版口径）。数值槽 = 独立 span（不含単位 em），滚动重写 textContent 不伤子元素。概览页（#ovStats）与详情色带（胜率三率 + 四赏金格）共用；「—」格不参与。修过一 bug：`isFinite('')` 误真 → dim 格曾产出空 data-cnt，改 NaN 判定。
5. **着顺构成条**：通算成績大字下 6px 圆角分段条（1着 bg-primary / 2着 bg-chart2 / 3着 bg-chart3 / 着外 bg-neutral-300，全站数据语义色；flex-grow ∝ 匹数；逐段 title=悬停说明；0 值段不渲染；未出赛不渲染条）。入场 scaleX 生长（yjBarIn，段序 stagger 90ms）；mb 端从定宽条改通栏。aria-label 配齐。
6. **出走表行交互**（races-page.css，.yj-lib 容器前缀防误伤）：行 hover 淡底 + 1/2/3 着顺·人气徽章随行 hover scale(1.12) + 全表 td tabular-nums（賞金/タイム位对齐；CJK 不受影响）。
7. **页内锚点小目录**：`.yj-anchor` sticky 吸顶在 `#detailCol`（PC 端真正的滚动容器——外壳 iframe 定高、详情列内滚，无需跨文档 postMessage）顶部，毛玻璃底；点击 detailCol.scrollTo 平滑滚到 sec-basic/sec-stats/sec-races；scroll 监听 spy 高亮当前段（段顶越过列口 140px）。mb 端 max-md:hidden（无内滚）。
8. **「详细数据→」箭头**：箭头包 `.yj-more-arr`，hover 右移 2px（theme.css transition）。

**验证**：build ✓（theme CSS 含全部新类/keyframes；races CSS 含 tr:hover）；profile 内联脚本 node --check ✓；Edge 无头 dump-dom（?embed=1&horse=1）——锚点 3 按钮 / 11 复制行 / yj-view-in / data-cnt（pct×3 + man×3，dim 格无空 attr）/ 构成条 2 段（1着1+着外4，0值段正确剔除）/ yj-more-arr 全部就位；截图 tests/_dt_pc.png 布局无破损（顶部右侧胶囊导航可见）。

**待真机确认**：clipboard 在 GitHub Pages https 下走 navigator.clipboard（localhost/file 走 execCommand 兜底）；血统弹窗 JBIS 新标签由弹窗所在文档（外壳）的委托处理，外壳已加载 pedigree.js。

## §159 · 详情页四项回调（2026-10-31 深夜，用户过目 §157/§158 后逐条反馈）

1. **名字四格点击复制**：名字区 日文/英文/港译/自译 真值格挂 `.yj-cp`/`.yj-cp-v`（hover 圆角淡底胶囊：px-1.5 py-1 + -mx-1.5 负边距抵消不动布局；空槽 nslot 不可复制）。复用 §158 委托，零新增 JS。
2. **锚点小目录下线**：§158-11 用户用不上 → 删 anchorNav/sticky nav/委托点击/scroll spy（profile.html）+ `.yj-anchor` 三条规则（theme.css）；section 顺带去掉 scroll-mt-2。
3. **构成条段色 = 出走着顺徽章同款**：1着 `bg-[#ffef7f]` / 2着 `bg-[#cbdeff]` / 3着 `bg-[#efc79f]`（theme.css `.yj-no1-3` 原值），着外保持灰。类字面量在 profile.html → Tailwind content 扫得到。
4. **赛事名可点击提醒**：`.yj-rlink` 由「观感同文本」改为 浅灰虚线下划线（underline dashed #d4d4d4, 1px, offset 3px）+ hover 加深 #a3a3a3；比赛记录页跨马表与 profile 内嵌表同时生效。
5. **embed 视图解禁 枠番/馬番**（race-rows.js）：hide 清单去掉 waku/umaban → 18 列；embed mb 卡片行2 补 waku/umaban。**datechart 分叉**：datechart.json 短键产物无 枠番/馬番 字段 → 新增 `chart` 视图维持旧 16 列口径，embed API 三函数支持 `o.view` 覆盖，datechart.html 三处调用传 `view:"chart"`（避免明细表出现空列）。

**验证**：build ✓；profile 内联 JS / race-rows.js node 语法 ✓；dist 核对：yj-anchor 0 残留、rlink 虚线规则、三个段色类编译产物、名字格 `yj-cp -mx-1.5`×4、VIEWS.chart；Edge 无头截图（profile?embed=1&horse=1，3800 高全页）目检 —— 表头 枠番/馬番 有数字、1着黄/上り金/3着橙 徽章与构成条同色系、赛名下浅灰虚线 6x 特写确认（#d4d4d4 像素全图扫描 294 命中集中赛名区）。**测法坑**：races.html?embed=1 不消费 query horse（只等父页 postMessage yj:horse，§53 bus 设计）→ 单开 URL 永远 loading，验证内嵌表必须走 profile 页截图。

### §159.1 · datechart 明细补枠番/馬番，回归单列配置（2026-10-31 深夜，用户拍板：两个共用列配置的都加上）

上一轮 embed 解禁枠番/馬番时给 datechart 造了 `chart` 视图分叉（16 列旧口径）；用户过目后拍板直接统一。改动：

1. **数据产物补字段**：`build_datechart.py` runs[] 加 `wk`（枠番）/`ub`（馬番），27→29 键；`docs/SCHEMA.md` §6 字段模板同步。重建 `data/datechart.json`（849 条全量有值，海外/台账缺 → ''）。
2. **前端回归单列**：race-rows.js 删 `VIEWS.chart` 分叉 + embed API 回滚 `o.view` 覆盖（§158.5 的临时方案撤销）；datechart.html toRow 补 `枠番: r.wk, 馬番: r.ub`、三处调用去掉 `view:"chart"`。datechart 明细与 profile 内嵌表共用 embed 18 列。
3. **verify 同步 + 修过期断言**：EXPECTED_KEYS 29 键、rawOk 加 wk/ub、[B] 对账补字段、[C2] 16→18 列断言。顺带修 verify 三处既有漂移（HEAD 基线就在挂，非本次引入）：① stub el() 缺 `classList` → 页面 render/fadeIn 中途抛错、[C] 段明细全空；② 页面「週」已汉化「周」→ 5 处标签断言；③ trophy emoji 已换内联 SVG → 2 处 KPI 断言改正则。**112 断言 ALL PASS**。

**验证**：build ✓（dist datechart.json 29 键含 wk/ub）；Edge 无头截图 datechart 明细——枠番/馬番列数据在位（枠8 馬15 斤55 序列正常）。

## §160 · 奖杯统一为金渐变 SVG +「金光闪闪」辉光（2026-11-01 凌晨）

**背景**：两页重赏奖杯图案不一致——stats.html KPI 仍是彩色 🏆 emoji（15px），datechart.html 已是 §146-5 的单色 currentColor SVG。用户拍板统一为 SVG，并加「金光闪闪」效果。

**方案（两层质感）**：
1. **金色渐变填充（金属质感）**：TROPHY SVG 内嵌 `linearGradient#yj-tg`（微对角 x2=.2）：亮金 `#fde68a` → `#fbbf24` → 基线金 `#e8a013`（沿用 §146-5 原 currentColor 定的亮金，视觉延续）→ 深金 `#d97706`。多实例重复 id 由浏览器取首个解析，defs 逐字节相同无视觉差。
2. **辉光呼吸动画（闪闪）**：theme.css 末尾 `.yj-trophy{animation:yjTrophyShine 2.6s ease-in-out infinite}`（@layer 外防候选裁剪）——金色 `drop-shadow` 双层辉光脉冲 + 高光段 `brightness(1.12)` 提亮；`prefers-reduced-motion` 时静止（与全站动画约定一致）。

**改动点**：
- `datechart.html`：TROPHY 常量升级金渐变版（KPI/明细胜格 dc-gw/月卡 dc-ym-top 三处共用点自动生效）。
- `stats.html`：新增逐字节相同的 TROPHY 副本（仅 2 页，§48 门槛内不抽离，注释互指），KPI「重赏胜利」emoji → SVG；`.st-trophy` 15px → 16px 并补 `inline-flex/vertical-align:-2px`（对齐 datechart KPI §147 的 16px 用户定稿基准）。
- `theme.css`：追加 §160 动画块。
- `verify_stats.cjs`：KPI 重赏断言由写死 emoji 字符串改为与 verify_datechart 同款正则（svg 前缀匹配 + 尾部数字比对）。

**验证**：build ✓（dist theme CSS 含 `yjTrophyShine`/`.yj-trophy`；两页 SVG 常量在；🏆 两页 0 残留）；`verify_stats.cjs` 211 通过 · `verify_datechart.cjs` 112 ALL PASS。

## §161 · RACES 筛选：新增 后3F 维度 + 三项面板优化（2026-11-01 凌晨，用户点名）

**背景**：用户要求 RACES 独立模式筛选①新增「后3F」维度（金末脚/银末脚/铜末脚 + <33/33-34/>34，边界 33-34 含 33 与 34）；②评估筛选面板剩余优化空间。优化三项经用户多选拍板：已选条件摘要 + URL 同步、chip 命中场数、金银铜语义配色（折叠方案未选，未做）。

### 1. 后3F 维度（races.html）

- **双口径一维**：金/银/铜 = 末脚徽章（该场全场上がり3F 密集排名 1/2/3，SCHEMA §末脚 同口径）；<33 / 33-34 / >34 = 上り 绝对用时桶（`agariBucket`，parseFloat；缺失/非数不入桶）。同维度多选=OR（金银铜与数值档可混选）。
- **实现**：FLT/DIM_KEYS 增 `agari`；匹配判定抽 `dimHit(en,k,v)` 单值命中（matchEntry/facetCounts 共用，改口径只改一处）；`matchEntryX(en,skip)` 支持跳过指定维度；`validFilterValue` 增 AGARI_OPTS 白名单 → 统计页 `?f=agari:金` 下钻直接可用。
- **行位**：着顺之后、级别之前，wide 独行（避免半列空洞）。

### 2. 面板三项优化

1. **chip 命中场数（faceted）**：每枚 chip 尾部小数字 = 「除本维度外其它已选条件」过滤后的命中数（`facetCounts(key,opts)` 单维度一次扫描）；0 命中整枚置灰（仍可点，选中无记录场=空结果口径一致）。chip 行（跑道/场地/马场/距离/方向/年份×2/性别/着顺/后3F/级别/竞马场×3）全覆盖；搜索下拉维度不加（下拉本身已有 n 计数）。
2. **已选条件摘要条**：filter-head 与筛选卡之间一行「已选 N 项」+ 全维度已选值胶囊（含 chip 维度与搜索下拉维度，值显示名经 `DIM_LABEL`/`dimValLabel` 换算），× 直接删。胶囊删除统一走 renderFilters 整体重建（摘要/底行 chip/下拉排除三处同步；bindFilters 原先「selector 标签只刷局部」与「出走马局部刷新」两条路径合并为一条）。
3. **金银铜 chip 语义配色**：与结果表 上り 徽章 yj-no1/2/3 同色系——未选中左侧色点（金 #e2cc38/银 #87aee6/铜 #dca167），选中整枚换语义色底黑字（#ffef7f/#cbdeff/#efc79f），类名 `ag-gold/ag-silver/ag-bronze`（chip() 内 key+v 判定注入，特异性 3 类压过 .filter-chip.on）。

### 3. 筛选状态 ↔ URL 双向持久化（含回壳协作）

- **格式**：`?f=k:v,k:v` 与统计页下钻同一格式（本来只进不出，现双向）。
- **独立打开（含 embed=1 直链）**：`syncURL()` 在 renderResults 顶部 replaceState 本窗 URL（不产生历史条目；空筛选删参）。
- **回壳后（rehome 进 index.html iframe）**：子页 URL 不外显、复制分享的是顶层地址 → 子页 postMessage `{type:"yj:url", url:"pages/races.html?f=…"}`，外壳（index.html message 监听）经 e.source 比对 + `/^pages\/[\w.-]+\.html(\?|$)/` 白名单后，把顶层 `?page=` replaceState 成当前子页地址（edit=1 时保留）。刷新/重开 → ?page= 直达机制把 ?f= 透传进 iframe → URL_F 预置还原。
- 摘要条命中数等即时重算，URL 不含分页页码（PG 仍是会话态）。

**验证**：build ✓（dist races.html 含 agariBucket/facetCounts/syncURL、races CSS 含 ag-*/chip-n/filter-sum）；Edge 无头冒烟（tests/.pw/agari-verify.js，msedge channel + frameLocator）：6 chip 计数 金100/银108/铜100/<33:3/33-34:82/>34:750 ✓；点金末脚 849→100 且 chip `filter-chip on ag-gold` ✓；叠加一着 AND ✓、顶层 URL 回写 `?page=…%3Ff%3D…` ✓；带 URL 重开 chip on 态+摘要 2 胶囊全还原 ✓；摘要条 × 删除同步 chip 与 URL ✓；无 JS 报错。截图 tests/_agari-filter.png 目检：色点/选中配色/计数/摘要条排版正常。

## §162 · RACES mb 端高级筛选折叠（2026-11-01，用户点名）

**背景**：mb 端筛选行太多（20+ 行全量展开首屏占满）。用户定稿：默认展示 出走马/跑道/场地/马场/距离/性别/着顺/后3F/级别 共 9 行，其余收进「高级筛选」。

**实现（races.html + races-page.css）**：
- 行集二分：`primaryRows`（常用 9 行）/ `advRows`（赛道方向/出生年份/比赛年份/竞马场×3/人气/母父/骑手/调教师/生产牧场/马主/体重）。**仅 mb 渲染**时把 advRows 包进 `.f-adv` 折叠区（默认 `display:none`，`.open` 才显示）；PC 平铺不产生包裹，行为零变化。
- 开合状态：`ADV_MANUAL`（null=自动：隐藏维度有已选值即展开，如 `?f=year:2026` 下钻自动展开；用户点过 #fAdv 后固定 true/false）。按钮文案带已选数徽标（`高级筛选 · N ▾/▴`），N = 隐藏维度已选值总数。
- 摘要条照常显示隐藏维度已选值（收起也能看到/删除）。#fAdv 只重建筛选条不动结果。
- 设备切换补 `renderFilters()`：mb/PC 行集不同，翻转（转屏/跨 768px）时重建筛选条（此前只重渲染结果表）。

**验证**：build ✓；tests/.pw/mb-adv-verify.js（Edge 无头 390px）：默认折叠（赛道方向/竞马场不可见、出走马/后3F 可见）✓；点开/收起 ✓；`?f=year:2026` 自动展开+徽标「高级筛选 · 1」✓；摘要条在折叠态可见 ✓；转 1440px 后 #fAdv 消失、全行平铺 ✓；无 JS 报错。截图 tests/_mb-filter.png。

**§162 位置修正（用户实测反馈）**：「高级筛选」按钮从 filter-head 移到**筛选卡底部整行**（常用 9 行末尾、级别行下方）——放头部不显眼，用户圈定要放在常用行收尾处。样式改为虚线边框整行按钮（`.f-adv-btn{grid-column:1/-1;height:34px;border:1px dashed}`），展开后高级行出现在按钮下方；文案徽标/自动展开逻辑不变。build ✓ + mb-adv-verify 全过 + 截图目检落位。

**§162 行集追加（用户追加定稿）**：mb 默认行再收两项——马场、后3F 也进高级筛选折叠区，mb 默认只留 7 行（出走马/跑道/场地/距离/性别/着顺/级别），折叠区内保持卡片相对顺序（马场、后3F 在赛道方向之前）；PC 全行平铺不变。build ✓ + mb-adv-verify 全过 + 截图目检。

## §164 · mb 比赛卡片全站统一分组（2026-11-01，用户提问驱动）

**背景**：用户对比 mb 端 比赛记录卡（lib 5 行分组）与 日期统计明细卡（embed 3 行紧凑分组）——列序同源但行编排各异，观感差异大。用户定稿：**两边样式一样，明细只是隐藏一些字段**。

**改动（race-rows.js 单点）**：
- `VIEWS.embed.mbLines` 从自写 3 行紧凑分组改回基准 `BASE_LINES`（两视图共用同一分组引用，lib 的 5 行编排全站唯一）。
- `mbCardHTML.pick()` 补尊重视图 `hide`/`onlyIfHorse` 清单——分组清单共用后，隐藏字段（天气/出走数/着差/赔率）不再经 COL 回落被画出来（旧紧凑分组正是为规避回落而生，现由 pick 处统一保证）。
- 视图差异从「①hide ②标签 ③mb 分组」三处收窄为两处；行内标签覆盖（马场/体重）随 BASE_LINES 的 spec 自然一致（明细卡「马场状态」旧标签随之统一为「马场」）。

**效果**（菊花赏 G1 同一条，mb 390px）：races = 赛事行(含天气) | 时间行(含着差) | 番号行(含出赛数) | 体重行(含赔率) | 人马行；datechart = 同 5 行，缺 天气/着差/出赛数/赔率，标签/行序逐字段一致。profile 内嵌（同 embed 视图）自动跟随。

**验证**：build ✓；verify_datechart 112 ALL PASS、verify_stats 211 通过；Edge 无头（tests/.pw/mb-unify-verify.js）两页卡片均为 5 行、datechart 无隐藏字段、无 JS 报错；截图 tests/_mb-unified.png。

## §165 · mb 日期统计明细全字段展示（2026-11-01，用户追加定稿）

**背景**：§164 统一分组后，明细卡与比赛记录卡只差 4 个隐藏字段。用户定稿：mb 端干脆**全字段展示**（「都没啥区别」）——明细 mb 卡与比赛记录卡零差别。

**改动链（产物 → 契约 → 前端）**：
1. `build_datechart.py`：产物 29→33 键，补 `tn`(天候)/`ts`(頭数)/`cs`(着差)/`od`(単勝)。
2. `docs/SCHEMA.md` §6 契约同步 4 键。
3. `datechart.html toRow`：短键→原始键映射补 天候/頭数/着差/単勝。
4. `race-rows.js`：`pick()` 恒可 COL 回落（§164 的 hide 缺位检查废除）——**hide 清单从此仅作用于 PC 表格**（embed PC 表仍 18 列 §159 不变）；行内「赔率」标签并进 BASE_LINES spec（原 lib 视图级覆盖，embed 落默认「独赢赔率」→ 两卡标签差异清零）。
5. `verify_datechart.cjs`：EXPECTED_KEYS 29→33、字段校验 + [B] 对账映射同步。

**效果**：同一条 菊花赏G1 mb 390px 两页 innerText 逐字段全等（含 天气/着差/出赛数/赔率）。

**验证**：产物重算 849 条 ✓；verify_datechart 112 ALL PASS、verify_stats 211 通过；Edge 无头（tests/.pw/mb-full-verify.js）两卡文本全等、无 JS 报错。**未 commit。**

## §166 · timeline 照片卡接入灯箱（2026-11-01，全站终检发现）

**背景**：全站终检发现交互不一致——lightbox.js 仅 profile.html 引用（§149.3），timeline 页照片卡（.tl-photo 297×210）不能点击放大。

**改动**：
1. `timeline.html`：引入 `../lightbox.js`（直开本页本地兜底）；`photoHTML` 的 `YJ.ui.img` 补 `title="放大查看"`；渲染后委托监听挂 `#body`（render 只换 innerHTML，监听器常驻不叠加）——点击照片 → 图集取当前 DOM 顺序全部卡片照片（跨事件连续翻页），index = 被点照片。
2. 通道与 profile 相册完全一致（§149.3/§156）：外壳内 `postMessage(yj:lightbox)` 顶层渲染（外壳以 iframe 地址为 base 归一 URL，sender 零约束）；直开本页 → 本地 YJ.lightbox。
3. `timeline-cards.css`：`.tl-photo img` 补 `cursor:zoom-in`（hover 1.04 微缩放本就有，光标补全可点暗示）。

**效果**：timeline 照片点击全屏放大，‹›/←→/触摸翻页、Esc 关闭，与 profile 同一视觉语言；外壳内遮罩全屏含侧栏。

**验证**：build ✓；dist 核对（timeline.html 含 lightbox.js/openPhotoLightbox、cards css 含 zoom-in、dist/lightbox.js 在位）✓；Edge 无头（tests/.pw/tl-lightbox-verify.js）：7 张照片卡 → 点第 1 张外壳顶层灯箱出现「1 / 7」、→ 翻页「2 / 7」、Esc 关闭 ✓、点第 2 张起始「2 / 7」✓、无 JS 报错；截图 tests/_tl-lightbox.png。**未 commit。**

## §167 · mb 两处排版优化（2026-11-01，用户截图反馈）

**① stats 产驹倾向页签：mb 横滑改回换行平铺**
- 背景：§144 曾把 mb 页签改单行横滑 + 右缘渐隐（省竖向空间），但「还有哪些分类」被藏进不可见区——用户定稿：**分成多行**，分类数量本身就是信息。
- 改动：`stats-page.css` 删 mb 媒体查询里的横滑三件套（nowrap/overflow-x/scrollbar 隐藏）与 `.st-tabs[data-edge=more]` 渐隐选择器；基础 `.st-tabs` 本就 wrap，两端同构。JS 全部安全 no-op 不动（syncEdges 恒判 end、scrollIntoView nearest 不滚动）。
- 效果：15 页签 390px 下折 3 行（高 88px）、无横向溢出。

**② 比赛记录/日期统计 mb 卡分组行：两端对齐撑满卡宽**
- 背景：§164/§165 统一五行分组后，行内容偏短（390px 下右侧大片留白，用户截图圈红）。
- 改动：`theme.css` `.yj-mb-line` 由 `display:block` 改 `flex + justify-content:space-between`（wrap + row-gap:2px 兜底极窄机型；baseline 对齐兼容人気徽章混排）；字段间距下限仍由 `.yj-mb-item` margin-right 承担。**单点改动全站生效**（races/datechart/profile 内嵌同一 mbCardHTML）。
- 效果：每行首尾贴边（距卡缘恒 12px）、中间均匀分布，观感 = 紧凑表单。

**验证**：build ✓（theme-DGiO8iK3.css / stats-DYHxM3kO.css）；Edge 无头 390px（tests/.pw/mb-layout-verify.js）：页签 15 枚 3 行无溢出 ✓，races/datechart 两页五行首尾贴边全过 ✓、无 JS 报错；截图 tests/_mb-line-spread-races.png、tests/_mb-line-spread-datechart.png 目检（明细卡呈均匀表单感）。**未 commit。**

### §167.1 · mb 卡分组行改稿（同日，用户否决 space-between）
- 用户反馈：机械的两端对齐铺满不满意，**原自然流式排布挺好**，只需把字段左右间隔分开一些。
- 改动：`theme.css` `.yj-mb-line` 回退 `display:block`（撤 flex/space-between），`.yj-mb-item` margin-right 12→20px。
- 验证：build ✓（theme-v5wP16K1.css）；Edge 无头 390px（tests/.pw/mb-line-gap-verify.js）：行内字段间隔实测 20px、无 JS 报错；截图 tests/_mb-line-gap-v2.png 目检（自然左对齐 + 宽松间隔）。

## §168 · 编辑模式入口改版：PAT 校验解锁，废除 ?edit=1 URL 开关（2026-11-01，用户提案）

**背景**：`?edit=1` 开编辑模式不优雅。用户提案：主页放一个交互动作，输入正确 PAT 才进入编辑模式。评估结论：纯静态站本就无真闸门（编辑导航 template 明文在源码里、真闸门 = GitHub PAT），入口从「知道 URL」换成「持有 PAT」语义更自洽，安全模型不变，纯 UX 收益 → 采纳。

**方案定稿（用户两选）**：触发 = **侧栏 logo 800ms 内三连点**；`?edit=1` **彻底移除**（不留兜底）。

**改动**：
1. `yj-util.js`：新增 `editUnlocked()` 单一判定出处 = 「本站仓库 PAT 已验证存机」（读 `storeKey("gh.token")`，站点前缀键，调用时求值）。外壳与内容页共用（§48：3 处使用达标抽离）。
2. `index.html`：
   - `EDIT_MODE` 由 URL 参数改为函数 `EDIT_MODE() = YJ.util.editUnlocked()`；删 `withEdit()` 透传（子页同源共享 localStorage 自读开关）；`yj:url` 回写的顶层 URL 不再附加 edit=1。
   - **yj-util.js 改同步加载**（原 defer）：body 末内联脚本启动期要调 `YJ.util.editUnlocked()`，defer 会排在其后取不到。
   - logo 挂 `#logoTap`；新增 `#editGate` 对话框（fixed 遮罩 + max-w-sm 卡片）：锁定态 = PAT 输入（password）+「验证并进入」；已解锁态 = 状态提示 +「退出编辑模式」（destructive 描边）+ Esc/点遮罩/「关闭」均收起。
   - 校验 = GitHub API 真实验证 `GET /repos/hinotoyk/yunji-web`（fine-grained PAT 的 metadata:read 为必选权限）：200 = 有效且属本站仓库（**双站防串**：kzn 的 PAT 会被 403/404 拒绝）；401 = token 错；403/404 = 非本站仓库令牌；网络失败不改本地状态。通过后 token 写入 `gh.token`（**与编辑台「连接 GitHub」同一把键 → 编辑台无需再粘贴**）+ 注入编辑导航 + 重载当前 iframe（子页编辑入口立即出现）。退出 = 清 token + 撤导航 + 重载。
   - 导航注入/撤除收口 `injectEditNav()/removeEditNav()`：均重建 items 并重挂点击（editNodes 记录注入节点整组可撤）。
   - `EG_REPO` 常量与 editor.js `GH_REPO` 重复一份（外壳不加载 editor.js，注释互指同步）。
3. `profile.html` / `timeline.html`：编辑入口判定改 `YJ.util.editUnlocked()`，URL 参数逻辑删除。

**已知局限**：GET 校验只证「有读权限」，read-only PAT 能解锁但提交时会失败——编辑台既有提交错误处理已兜住，可接受。

**验证**：build ✓（dist theme CSS 含 z-50/max-w-sm/bg-black\/40 等 6 个新类；dist index/profile/timeline 均含 editUnlocked、withEdit 0 残留）；内联脚本 node 语法 ✓；Edge 无头冒烟（临时 playwright + `--channel msedge` + route 拦截 api.github.com mock 401/200）**14 项全过**：默认无编辑导航 → 三连点呼出 → 假 PAT 401 报错 → mock 200 解锁后 token 落 `yunji.gh.token`（站点前缀实证）+ 导航注入 + iframe 内 EDIT_MODE=true + 航迹线页编辑入口可见 + 顶层 URL 无 edit=1 → 已解锁态/退出按钮 → 退出后 token 清除/导航撤除/子页 EDIT_MODE=false → Esc 关闭。**未 commit。**

## §169 · 顶层 URL 同步收口 + 全页初始 loading 统一 + SIRE RANK 稳定占位（2026-11-01，用户三点反馈）

**① 顶层 ？page= 为什么只刷比赛记录、还带 %2Fdist%2F**
- 根因：只有 races.html 因 ？f= 持久化会 postMessage `yj:url`（§164），其余页从不回写 → 点其他导航 URL 不动；且外壳 yj:url 分支把相对地址经 `new URL()` 解析成绝对路径 `/dist/pages/...` 再编码 → `%2Fdist%2Fpages%2F...`（部署子路径烤进链接）。
- 收口：外壳新增 `syncTopUrl(rel)`（topPageUrl 白名单 `^pages/[\w.-]+\.html` + 相对形态编码），三个来源统一走它 —— ① 侧栏 `go()` 点击即刷；② iframe load 回调回写实际地址（覆盖页内链接跳转 + 旧绝对路径深链自愈；顶层无 query 时不回写，首次进站保持干净地址）；③ 子页 `yj:url` 消息（不再自行解析）。
- 效果：任意导航顶层 URL 都跟随当前子页（刷新/分享保状态）；URL 恒为 `?page=pages%2Fxxx.html` 相对形态。

**② 初始 loading 只有个别页有**
- 现状盘点：profile（血统图 frameSpin + spin）/races（spin×2）/stats（kpisLoad + SIRE RANK）有；timeline/datechart/leaderboard 只有纯文案或空白。
- 统一：三页引入 loading.js，初始取数期给 `YJ.ui.spin`（守卫 `window.YJ && YJ.ui` 缺组件退回旧行为；datechart 门禁 stub 不加载 loading.js → 自动跳过不踩测试）。datechart 占 #cal/#kpis/#dBody、leaderboard 占 #kpis/#legend/#chart（#chart 首次 ECharts init 前本有 innerHTML="" 清占位，安全）、timeline 占 #body。stats 补 #distBar/#rateBand（renderDistBar/renderRateBand 均 innerHTML 覆写；#curve 是 ECharts 复用实例域、matTable 是 table 元素，均不塞占位）。

**③ SIRE RANK 切世代/分类图表闪没**
- 根因：renderSireRank 每次切板 `el.innerHTML = spinner` → 旧图整块消失、数据到位再闪回。
- 改造：`#srkChart` 外包 `#srkWrap`（relative + min-h-[320px] 兜首载）；加载浮层挂 **wrap**（兄弟节点 —— JBIS render 会整体重写 srkChart，浮层放里面会被一并清掉）；切板不清空旧图，浮层（bg-background/80）盖住示意，KPI 保留旧值仅 opacity-50 半透明；渲染成功后按实测图高锁 wrap minHeight（后续切板不再塌陷）；失败态清 minHeight 显示错误+重试。
- node 门禁兼容：`srkLoading` 以 `typeof document.createElement !== "function"` 判 stub 环境跳过（verify_stats 的 document 桩无 createElement，且 Promise executor 内抛错只变 rejection —— 现有 211 断言不受影响）。

**验证**：build ✓；verify_stats 211·0 ✓、verify_datechart 112 ALL PASS ✓、verify_result 全过 ✓；verify_drill 58·2 —— 与改动无关的既有漂移（git stash 基线复跑同样 58·2）。Edge 无头冒烟（playwright --channel msedge + 路由延迟 600/700ms + addInitScript 禁 caches 强制走网络）**18 项全过**：URL 四项（相对形态/无 %2Fdist%2F/点击即刷/深链自愈）+ 三页 spinner 出现与撤除 + SIRE RANK 六项（首载浮层/渲染内容/高度锁定/切板旧图保留/浮层出现/KPI 半透明→恢复）+ 无 pageerror。**未 commit。**

## §170 · 冒烟与 CI 回灌（kzn §117 同批改进回归本仓，2026-11-02）

- **动因**：§139–§169 同步到 kzn（kzn §117）时，数据耦合断言在 kzn 数据下假失败，逐个改成了派生式；其中三处在本仓本身就是陈旧失败（drill 58/60 常态红），一并修净后回灌。
- **verify_drill.cjs（4 处）**：① 体重候选 n 改从源数据重算对账（弃「仍有空档」存在性断言）；② tag 删除断言改读 renderFilters 整体重建后的筛选条（§150 后删除胶囊不再走 refreshDimUI 局部注入——本仓 2 处常态失败之一）；③ embed 列数 15/16 → 17/18（§159 枠番/馬番解禁后实况——本仓另一处常态失败）；④ [E] 马名断言期望值从源数据派生（弃 Grand Warrior 硬编码，NAME_VIEW=1 回退剥尾缀日文名 §53.7 口径）。60/60 全绿。
- **verify_stats.cjs（C2 段）**：世代全集/系列数/图例/明细表断言全部从 stats.json 的 curve 派生（GENS），弃 2023/2024 硬编码——本仓 2 世代、kzn 8 世代同一份代码各自成立。本仓实测 211 全绿（kzn 483，断言数随数据规模浮动）。
- **verify_datechart.cjs（C7/C8 段）**：目标马按 SUF_RE 从产物自动选；vseg 开关语义（已激活不重复点击）；逐月导航（month 面板无年份直选）；明细分页翻找（st.dp 持久化先归 1）。本仓实测自动选中 Grand Warrior（2025-10 海外）113 全绿。
- **workflows（status/update-data/update-day 三条，kzn 版回灌）**：数据 push 后显式 dispatch deploy.yml——GITHUB_TOKEN 推送不触发 push 事件（GitHub 防递归），此前定时数据更新落库后线上 Pages 不跟随，要等下一次手动 push；deploy.yml 已有 workflow_dispatch 触发器，dispatch 不受限制。另 status.yml 补 keibabook/studbook 对 Actions 出口 IP 403 的自动降级说明。
- **验证**：四段冒烟本仓全绿（drill 60 / stats 211 / datechart 113 / result 三态闭合）；workflow 文件逐行核对只含上述增量，未动 deploy.yml。

## §171 · 15 世代压测：枚举膨胀与全量渲染的六处收口（2026-11-02，用户 10 张截图反馈）

**动因**：用 15 世代模拟数据（1165 匹 / 11519 条出走，`data/_tmp/gen15-sim`）跑全站，PC+MB 共 10 处排版/性能问题。诊断结论：8 处是同一病根——**组件的视觉空间按「枚举值数量」线性分配**（chips 平铺、每世代一条线、treemap 每值一块），数据从 2~3 世代涨到 15 世代即越界；2 处是编辑台全量 DOM 渲染。用户拍板**方向 C（混合）**：有序枚举横滚、图表缩放、空间图改等高网格、大表格虚拟滚动。

1. **批量表格虚拟滚动**（`editor-table.js`，PC5/MB5 打开十几秒 + 一滑就卡）
   - 根因：`renderBody()` 把 11519 行 × 约 19 列（≈45 万单元格）一次性拼进 tbody，首屏同步阻塞、滚动整表重排。
   - 改造：只渲染可视区 ± 12 行，前后各一条占位 `<tr>`（高度 = 行数 × 行高）撑住滚动条总高度；滚动走 rAF 合帧，窗口未变直接跳过。
   - 列宽：auto 布局下列宽由「当前可见行」决定，滚动会跳 → 首次渲染用探针行（跨全表抽样 ≤400 行）量出列宽，锁进 `<colgroup>` + `table-layout:fixed`；超长内容 `text-ellipsis` + `title` 悬停看全名。列显隐/切页签时 `invalidateCols()` 重新量。
   - 追加行：`revealRow(r)` 先把目标行滚进可视区再渲染，替代原「查 td」写法（未渲染的行没有 td）。
   - 搜索：全表 rowText 拼接有成本，输入去抖 120ms。
2. **年龄成绩曲线加区间缩放**（`stats.html` ④，PC3/MB3）
   - 根因：无 dataZoom，月龄拉到 60+ 桶、13 条世代线全叠加 → 毛线团。
   - 改造：PC 底部 slider + inside；MB 只留 inside（双指缩放/单指拖动，省高度）。图例 >8 项改 `type:"scroll"` 单行可滚（MB 不再换行压住绘图区），MB 图例左对齐 + grid.top 42。**默认只勾最近 5 个世代**（>8 世代时才生效，2 世代的数据零影响），其余图例一键开。
3. **筛选 chips 横滚带**（`races.html` + `races-page.css`，PC2）
   - 根因：`.filter-chips` 平铺换行，比赛年份 13 个 → 3 行，左侧标签垂直居中错位、筛选卡高度翻倍。
   - 改造：`row()/rowWide()` 按选项数自动挂 `filter-chips--scroll`（>10 项），单行 `overflow-x:auto` + 右缘渐隐 + 隐藏滚动条，chip 不收缩。
4. **世代/年份切面横滚带**（`leaderboard.html` + `leaderboard-page.css`、`stats.html` + `stats-page.css`，PC4/MB4/MB2）
   - 根因：`.seg` 内按钮可折行，15 枚「2026年世代」被挤成两行断字，且容器 `overflow:hidden` 直接裁掉后半段。
   - 改造：`#sliceSeg` / `#yseg` 放开 `overflow-x:auto` + 按钮 `white-space:nowrap;flex:none`，右缘渐隐；`.seg button` 全站补 `white-space:nowrap`（短标签页无感知）。
5. **概览年份占比：面积图改等高网格**（`profile.html`，PC1/MB1）
   - 根因：`tmSquarify` 在 15 个数值接近的块上必然产出极端长宽比 —— PC 像被拉扯，MB 直接文字重叠。
   - 改造：年份块改 `grid-cols-5 / max-md:grid-cols-3` 等高卡片（年份 + 匹数 + 占比），保留 `data-name/data-tip` 读数条与 `data-cnt` 数字滚动；**状态图分类稳定（≤9 类）仍走面积图**。
6. **倾向矩阵**（MB2 表列被裁）：§144 已压缩到 12px/3px，本次只补 chips 横滚（第 4 条）；表格本身溢出走 `#matWrap` 横滑 + 首列投影，不重复处理。

7. **ECharts 定制包补 DataZoom**（`front/public/echarts.line.min.js`）
   - 坑：§145 的定制包只打包了 Line + Grid/Tooltip/Legend/MarkLine，**没有 DataZoomComponent** —— 传了 `dataZoom` 配置会被静默忽略（图上什么都不会发生，控制台零报错）。
   - 重建配方（§145 原配方 + DataZoomComponent）：`npm i --no-save echarts@5.6.0` → entry 增加 `DataZoomComponent` 并 `echarts.use([...])` → `./node_modules/.bin/esbuild entry.js --bundle --minify --format=iife --target=es2018 --outfile=public/echarts.line.min.js`。体积 519KB → **538.6KB**（+19KB，仅 stats 页加载）。

**验证**（15 世代模拟站 `data/_tmp/gen15-sim`，1165 匹 / 11519 条；PC 1440 / MB 390）：
- 批量表格：**首屏 1183ms**（含 basic+bundle 拉取解析；改前十余秒）→ DOM 里只有 30 行（基本信息）/ 29 行（比赛）；滚到 120000px 后 41 行、`firstRi=3416`、`scrollHeight=403202`（= 11519 × 35px 行高）→ 虚拟滚动与占位高度自洽；`colgroup` 已锁宽。
- 年龄曲线：`getOption().dataZoom = ["inside","slider"]`（PC）/ 仅 inside（MB），`legend.type = "scroll"`，13 世代下默认只勾 2020–2024 五代。
- 比赛筛选：`.filter-chips--scroll` 四行（级别/出生年份/比赛年份/竞马场·地方）均 `scrollWidth > clientWidth` 且 `docOverflow = 0`（不再顶破卡片）；顺带修了 `.filter-grid` 轨道 `1fr → minmax(0,1fr)`（nowrap 内容的 min-content 会把列撑宽，`overflow-x` 永不触发）。
- 世代切面：`#sliceSeg` 15 枚按钮单行（`1494/1014`）、高 34px 不折字；`#yseg` `1351/1048`。
- 概览：15 张等高卡（PC 5 列 / MB 3 列），零重叠。
- 冒烟：`verify_stats 211·0` / `verify_drill 60·0` / `verify_datechart 113 ALL PASS`（真实 2 世代数据下曲线默认全选，不受「近 5 世代」影响）。

## §172 · 父子制覇数据源改派生：sire.wins 从手工表 → 种马成绩页（2026-11-02，kzn 误报驱动）

**起因**：kzn 出现 1 次「父子制覇」——2025-02-09 サトノシャイニング 赢きさらぎ賞，tip「高情厚意同胜：如月赏」。核实发现 `config/sire.json` 的 `sire.wins` 是**手工表**，把キズナ 从未出走的きさらぎ賞写成了胜鞍；`build_timeline.py` 只按赛名精确匹配，没有任何校验源 → 凭空徽章。

**为什么只加校验不够**：赛名唯一 / 日期区间 / 产物与数据一致这三项，这次的错**全都能通过**（错的是「这匹马到底赢没赢过这场」这个事实，管线里没有权威源）。

**方案（用户拍板「方案二 · 派生」）**：
1. **新增 `scripts/timeline/sync_sire_wins.py`**（手动跑、产物入库，不挂每日管线——netkeiba 对 CI 出口 IP 不稳）：
   读 `sire.netkeiba_id` → 抓 `db.netkeiba.com/horse/result/{id}/`（EUC-JP）→ 复用 `races/fetch_races.py::parse_races`
   （与产驹逐场成绩同源同解析）→ 取 `着順==1` → 格先按赛名解析、解析不出再抓该场 SP 页看 `Icon_GradeType`
   → 只留**重赏**（GI/GII/GIII/JpnI-III/JGI-JGIII；L/OP/条件战不入表）→ 写 `data/sire_wins.json`
   （`{meta, sire, wins[{date,name,grade,cn,race_id}]}`；`cn` 从旧手工表按规范化赛名继承，译文不丢）。
2. **`build_timeline.py` 改读产物**：`_load_sire_wins()` 优先 `data/sire_wins.json`，缺失/损坏/空 → 回退 `config.sire.json`
   （兼容未跑过派生的老仓）。手工表降级为兜底。
3. **新增 `scripts/timeline/verify_sire_wins.cjs`（11 断言，全离线）**：产物结构自洽 / 赛名唯一 / 格=重赏 / 日期合法且不晚于今天 /
   产物 ↔ config 无漂移（改了配置必须重跑派生）/ `timeline.sire_wins` == 源数据重算命中数 / 每条 sire 标签 tip 能反查产物。

**结果**：
- yunji：コントレイル 11 场出走 → **7 项重赏**，与手工表逐项一致（東京スポーツ杯2歳S/ホープフルS/皐月賞/東京優駿/神戸新聞杯/菊花賞/ジャパンC）；`timeline` 内容无变化（跳过写入）。
- kzn：キズナ 14 场出走 → **5 项重赏**（毎日杯/京都新聞杯/東京優駿/ニエル賞/産経大阪杯）；父子制覇 3 次（京都新聞杯×3）不变。

**验证**：五段冒烟全绿——yunji 11/113/211/60/三态闭合，kzn 11/113/483/60/三态闭合。

**维护约定**：`sire.wins` 只在**没有产物**时生效；改了 `config/sire.json` 的 wins 或换了种马，必须 `python scripts/timeline/sync_sire_wins.py` + `python scripts/timeline/build_timeline.py`，否则 `verify_sire_wins` 会报漂移。

## §173 · 线上（CF Pages）侧栏选中态全灭：iframe 路径被剥 .html（2026-11-02，用户两站对比截图反馈）

**现象**：同样是「基本信息」选中，kzn（GitHub Pages）浅青底 + 左侧 3px 竖条正常，yunji（www.yunji.xyz，CF Pages）**一项都不亮**；点侧栏后能亮，页内一跳（如点马名）又灭。

**根因**：CF Pages 把 `/pages/x.html` **307** 成 `/pages/x`（`curl -I` 实测），iframe 里 `location.pathname` 因此是 `/pages/profile`，而 `index.html` 的 load 回调是拿它和 `data-href="pages/profile.html"` 做**后缀全等**比对 → 全部落空 → `light(null)` 全灭。同一份代码在 GitHub Pages 不剥扩展名，所以 kzn 与 `hinotoyk.github.io/yunji-web` 一直正常。§88 只在外壳入口（`?page=` 补 `.html`）和 `rehome.js` 两处补过扩展名，**iframe load 高亮这条路漏了**。

**改法（`front/index.html` 一处）**：新增 `pageKey(p)`（剥尾部 `.html`）——load 回调里 `path` 与 `data-href`、`pages/edit-table.html` 特例分支统一走它比对；顶层 `?page=` 回写改 `/(pages\/[\w.-]+)$/` 抓路径后 `pageKey()+'.html'` 补回（原来要求 pathname 带 `.html`，CF 上页内跳转回写同样失效）。**零视觉改动**，纯路径归一。

**验证**：
- 本地无头 Edge 复现两套托管语义：`tests/_tmp_cfstrip/serve_cf.py`（模拟 CF 307 剥扩展名）vs 直接静态服务。改前 CF 语义 `data-on="true"` **0 个**（与线上 dump 一致：11 项全 false），改后 1 个；六页 `?page=` 逐页跑 races/stats/leaderboard/datechart/timeline 全部命中对应条目；GH 语义（不剥扩展名）仍 1 个，无回归。
- `front && COPY_DATA=skip npm run build` ✓ 7.58s；`dist/assets/theme-ClQOko3b.css` 未变（本次不涉样式）。

**同步提示**：kzn 若也从 GitHub Pages 迁到 CF Pages（或任何会剥 `.html` 的托管），同一处 `pageKey` 归一必须一起带过去，否则高亮同样全灭。

## §174 · 出走马表页：跨站引用 racing-calendar（embed 协议 + 侧栏导航，2026-11-02 立项）

**需求**：侧栏「统计」组缺一个出走马表入口；出走表数据在独立仓 racing-calendar（RC，JBIS/Racing Post 出馬表采集站，同款青绿方案 F 视觉）。未来 kzn（キズナ）等种马站也要引用同一个出走马表页面 → **引用必须是协议化的一层，不是复制页面**。

**方案定稿（跨站 iframe 深链引用，不复制不落盘）**：

1. **RC 侧加 `embed` 协议**（`site/app.js` + `site/style.css`，协议文档落 `docs/DESIGN.md` §8「嵌入引用」）：
   - `index.html?embed=1` → 挂 `html[data-embed]` 标记；
   - CSS 按 `[data-embed]` 收编装饰层：隐藏 `.page-title` / `footer` / `.powered` / `[data-friend-links]`，
     `#page` 宽度 100% / 内距收紧（宿主页自己有 page-title 与留白，嵌进来双标题会重复）；
   - **embed 锁亮色**：宿主站（yunji/kzn）无暗色主题，暗色 iframe 嵌进亮色壳会突兀 →
     `prefers-color-scheme: dark` 覆盖只对非 embed 生效；分享卡 canvas 本就固定亮色，双口径一致；
   - **筛选状态走既有 URL 协议**：RC 已有 `?sire=<canonical>&d=<日期>&scope=&k=&group=` 深链（syncUrl 双向），
     宿主只负责拼 URL——这就是「引用协议」，RC 升级功能宿主零改动自动跟随；
   - 泛用参数 `?embed=1&sire=…` 对任何站开放（kzn 传 `キズナ`），不绑定云迹品牌。
2. **宿主侧新页 `pages/entries.html`**（本仓）：
   - 结构 = 同款 `.page-title`（出走马表 · ENTRIES）+ **来源说明条**（数据 · 出走表来自 Racing Calendar，新标签打开 ↗）+ 全高无边框 iframe；
   - iframe src 按 `YJ_SITE` 拼接：`https://hinotoyk.github.io/racing-calendar/?embed=1&sire=<种马日文名>`；
   - **种马名单一出处 `config/sire.json`**：`gen-site-config.mjs` 新增 `sireName`（种马日文名）注入 `YJ_SITE`——
     kzn 模板站改配置即自动引用キズナ，不需要改任何代码（同步指南的模板机制天然继承）；
   - RC 官网地址不写死在页面：**常量进 `data-config.js`**（`YJ_DATA.rc()`，站点数据映射单一出处惯例），
     `?rcdev=1` 调试参数切本地 `http://127.0.0.1:9090/`；
   - 加载体验对齐 §149：iframe 加载遮罩（YJ.ui.frameSpin 不适用——那是同源子页 postMessage 信号，跨站拿不到），
     改用**本页自带遮罩**：`iframe load 事件` 摘除，超时 15s 显示失败态（「上游站点无响应」+ 重试按钮 + 新标签打开兜底）；
   - 无 rehome 回壳（页面本身就在壳里跑；直开 URL 由外壳 `?page=` 机制兜住，无需改造）。
3. **侧栏**（`front/index.html` 统计组）：「🏁 出走马表」置于「日期统计」与「航迹线」之间——
   出走表是赛前前瞻（未来 1-2 天），与既有页全是赛后记录互补，放统计组末位、航迹线前。

**废案（不展开）**：复制 RC 页面代码进本仓（双仓维护、升级即漂移，违「业务流程自己设计但这里是引用」）；RC 产 JSON 落盘本仓 data/（出走表是瞬时数据，落盘即过期，且 RC 每日两次自动采集已是线上活数据）；window.open 新标签（用户要的是站内页面）。

**验证口径**：RC `npm run build` 后 `_site/` 直开 `?embed=1` 核对装饰层收起 + 锁亮色 + `?sire=` 深链生效；本仓 build 后核对 `dist/pages/entries.html` 存在、`dist/site-config.js` 含 `sireName`；本地双服务（:8090 宿主 + :9090 RC）实测 iframe 内嵌视觉与深链。

**实施结果（同日完成）**：
- RC 侧：`index.html` head 内联脚本挂 `<html data-embed>`（首帧生效无闪烁）；`style.css` 暗色 token 覆盖收窄为 `:root:not([data-embed])`（embed 锁亮）+ `[data-embed]` 隐藏 page-title/footer/powered/站群导航、`#page` 占满；`app.js` `syncUrl()` 保留 `embed=1`（模式标志不随筛选重写丢失）。协议文档 = RC `docs/DESIGN.md` §10 + README「嵌入引用」节。
- 顺手修复 RC 两个深链 bug（外部引用暴露出来的）：① `main()` 无条件 `defaultDates()/defaultScope()` 覆盖 URL 恢复的 `?d=/?scope=` → 改为「URL 未指定才套默认」；② `?sire=` 深链按展示名原文存 state，而行内比较用 canonical（JBIS id）→ 永不匹配，改 URL 恢复时过 `canonOf()` 归一。这两个修复同时让 RC 自身分享链接的日期/血统恢复变正确。
- 宿主侧：`pages/entries.html`（page-title + 来源条「数据来自 Racing Calendar ↗」+ `父：コントレイル` chip + 全高 iframe + load 摘遮罩 + 15s 超时失败态[重试/新标签]）；query 白名单透传（`RC_QS_KEYS = d/w/scope/v/k/sire/ss/bms/q/group`，`sire` 缺省取 `YJ_SITE.sireName`；`rcdev=1` 切本地调试不透传）；`vite.config.js` PAGES 注册；外壳侧栏「🏁 出走马表」置于日期统计与航迹线之间；`data-config.js` `remote.rc` 官网地址单源；`gen-site-config.mjs` 增 `sireName`（sire.sire.name_ja，kzn 改 config 即自动引用キズナ）。
- 冒烟：双服务实测截图核对——embed 装饰层收起、锁亮色、`?d=2026-10-24&sire=コントレイル` 端到端出「共 11 頭 · 9 R」真实数据行、父列全コントレイル、宿主页与 iframe 视觉无缝。线上生效前置：RC 仓库 push 部署后宿主页才收到新版（本地 `?rcdev=1` 已验证）。

## §175 · 种马榜走势 mb 标注去重叠 + 航迹线 mb 卡片重排（2026-11-05，用户两张截图反馈）

### ① 种马榜走势：mb 只留「名次变化」，KPI 撤两格

**反馈**：「赏金增量和排名重叠了，可以只保留排名的变化」+「mb 与 pc 的文案也优化一下，把较前快照和最新快照去掉」。

**根因**：跳增标注文案 `+23,024.0（2位）` 实测宽约 88px，而 26 个快照在 390px 幅面上点距只有 ~13px → 相邻标注必然互压（PC 900px 下点距 ~32px，密集跳增同样会压）。名次只是走势的「结构变化」，金额已由增量柱 + 末点承担。

**改动（跨两仓）**：

- **jbis 仓 `site/embed/sire-rank-chart.js` → v1.4.1**（组件是纯渲染，文案与形态由宿主传参）：
  - `opts.annotate` 新增 `"rank"` 档：只标**名次变化日**，文案 `N位`（≈18px）、颜色 = 名次色 `--chart-2`，与图例/ tooltip 的「名次」同一条通道；`true` 档行为不变（`+金额（N位）`）。
  - 两档共用**避让**：按候选文案宽设最小间距（rank 34px / full 92px），冲突时 **full 档按日增大者优先**（否则窄幅下被丢的恰是最想看的大跳增）、rank 档自右向左（最新优先）。
  - 落点：太靠顶（距轴顶 <26px，如峰值/末点）改标在点**下方**；标注加 `paint-order:stroke` + 白描边，压在曲线/面积上也读得清。
  - 顺带修 **x 轴末刻度重叠**（`10/2710/28`）：尾点必标，若与上一候选间距 <42px 就丢掉前一个。
- **本仓 `stats.html`**：`annotate: isMb() ? "rank" : true`（跨 768px 断点 resize 时整体重绘，同断点内仍交给组件自身 ResizeObserver）；`srkKpis()` 删「较前快照」「最新快照」两格，只留「当前赏金 / 排名」——两端文案统一，mb 两格一行排开不再折行。

**⚠ 生效顺序**：图由兄弟站脚本渲染，**jbis 仓 push 后线上才生效**（本仓先传参是向后兼容的：旧组件收到 `"rank"` 按 truthy 走全量档，不会白屏）。

### ② 航迹线 mb：通栏图 + 通栏文本 + 名次行拆两层

**反馈**：「时间、后3F、人气都没有在一行上面」「名次和日文名、中文名也没有对齐」「排版特别乱」。

**根因**（两端都中招，只是 mb 更明显）：卡片是「图 44~50% + 右文」，正文列只剩 ~170px（mb）/ ~190px（PC 480 卡）。
① `.tl-kpis` 是 flex-wrap，三项装不下就把「人気」挤到第二行；② 名次行是裸 `flex-wrap`，容器一窄就「徽章独占一行、〈中文名〉掉到行首」——看着像没对齐。

**改动**：
- `timeline-cards.css`
  - 新增名次行两层原子：`.tl-horse`（徽章 + 文本组，不换行）+ `.tl-horse-txt`（主名 + `〈中文名〉`，可整体换到第二行，**换行后左缘仍与主名对齐**）；主名超宽走省略号（`flex:0 1 auto` + `min-width:0`），中文名 `flex:none` 永不被挤掉。
  - `.tl-kpis` 由 flex-wrap 改 **3 等分栅格**（タイム・上り・人気 恒一行，两端同构）。
  - mb 媒体查询里卡片改竖排：`.tl .tl-card{flex-direction:column}`、图满宽定高 152px（cover 裁切）、文本通栏、数据条加一条上分隔线；复位 `.tl-item.left` 的 `order`（左右交替只服务桌面的图位顺序）。
- `timeline.html`：race 分支与 manual 分支的名次行改用 `.tl-horse/.tl-horse-txt/.tl-hname/.tl-hcn`；`hero` 拆成 文本组。
- `public/editor.js`：预览卡同一处结构同步（§26 两页共用原子的约定）。

**候选评审页（未入选方案留在 tests/ 供回看）**：`tests/timeline-mb-cards.html` 四套 mb 候选——A 通栏图（**采用**）/ A2 同 A 图高 118 / B D 形环绕（图左 float + 弧形右缘，卡最矮，但 9 字马名会被截成 `ゴー…`）/ C 左图右文等宽栅格（同样截名，且图下留白大）。B/C 落选理由即「马名被截」这条硬伤。

**验证**：`npm run build` ✓；390px 探针（`tests/_tl-probe.mjs`）实测——卡片 346、图 344×152、三格 label/值 y 完全一致（418/434）、徽章与主名 top 同为 379、无横向溢出；PC 1280 同套量测通过，中文名换行后左缘与主名对齐（966 vs 965）。种马榜 mb 截图（`tests/_shot/after-stats-mb-full.png`）：KPI 两格、图上仅「2位」、x 轴 `10/10 … 11/05` 无重叠；PC（`after-stats-pc.png`）四条标注 `+1,397.6（3位）/+2,089.0（3位）/+23,024.0（2位）/+1,850.0（2位）` 全部保留且互不压叠。**未 commit / 未 push。**

## §176 · 航迹线卡片：图片改为「完整显示」（2026-11-05，用户截图：图被裁掉一半）

**反馈**：「排版也还行，但图片没有展示完全，必须要完整展示图片」。截图里菊花賞那张的图只露出马身中段。

**根因**：图位是**固定比例框 + object-fit:cover**——框比图「更宽」，纵向必然裁掉上下：
- mb：§175 定的 `height:152px`，344:152 ≈ 2.26，而照片原始比例 1.27~1.50 → 纵向只剩 **56%~66%**（马腿/马头被切）；
- PC：`.tl-photo` 的 `aspect-ratio:297/210 = 1.414`，图片 1.5 时裁 6%、1.265 时裁 11%（只是不那么刺眼）。

**改动（`timeline-cards.css`，两端同一套）**：
- 去掉图位固定比例 + `object-fit:cover`，改「**宽占位、高跟图走**」：`.tl-photo` 只定宽（PC 50% / mb 通栏）+ 底色，
  `img{width:100%;height:auto}` → 图按**自身比例**完整展开，容器高度由图决定，任何比例都不裁。
- 解码前的高度占位仍由 `YJ.ui.img` 的 `width/height`（297×210）先撑，图到位后自动收敛（没有 0 高度塌陷）。
- mb 只留一条兜底：`max-height:62vh` + `object-fit:contain`——将来上传竖构图照片时也不会把卡片拉到半屏以上（此时左右留浅灰边，仍不裁）。
- `timeline.html` / `public/editor.js` 的 img 仍是 297×210 属性（仅占位，含义注释已改）；候选页 `tests/timeline-mb-cards.html` 的 A 方案同步。

**验证**（`tests/_pic-probe.mjs`：比对每张图渲染框比例 vs 原图比例）：
390px 下 7 张图 `boxAR == natAR`（1.499/1.366/1.265/1.501…）全部 `full`，卡高 481~523；320px 同样全 `full`（274 宽 → 183/201/217 高）；PC 1280 全 `full`（239 宽 → 159~189 高）。
代价是**卡片高度不再统一**（相差 ≤42px）：1.27 的图比 1.5 的图高 42px——这是「不裁 + 不留黑边」的必然结果，视觉上每张卡独立成块，可接受。

## §177 · 航迹线 PC：竖排通栏图（与 mb 同构，图片撑满卡片）（2026-11-06）

**反馈**：「mb 端样式非常满意，PC 也优化一下，类似 mb 这种能充满整个卡片的」。

**根因**：PC 卡片是横排「左图 50% + 10px 白边 + `align-self:center`」——图区宽度只有卡片一半、四周留白、还比文本块矮，
所以图永远「压不满」卡片：480 宽的卡片里，图只占 240×160，上下各露出 20px 白。

**为什么不能只把横排的图拉满**：横向铺满 = 图区高度锁定为卡片高度（≈200px），而 240px 宽的照片在 1.5 比例下只有 160px 高 →
要么 `cover` 裁掉 20%（§176 刚否掉），要么 `contain` 露灰边。**「铺满 + 不裁」只有在竖排下同时成立**，所以 PC 直接采用 mb 的卡片结构。

**改动**：
- `timeline-cards.css`：`.tl-card` 基础态改 `flex-direction: column`；`.tl-photo` 去掉 `width:50%/margin:10px/border-radius`，
  改 `align-self:stretch + width:auto + margin:0`（图区通栏，圆角交给 `.tl-card{overflow:hidden}` 统一裁切）；`.tl-body` 内边距 12/16 → 13/18/16。
  mb 媒体查询里重复的竖排规则**删掉**（现在只在 mb 收紧内边距 + 给数据条加上分隔线）。
- `timeline-page.css`：`.tl-item.left .tl-photo{order:2}` 撤销（左右交替只决定卡片落在轴哪侧，图恒在上）；
  `.tl-item` 的 `align-items:center → start`——卡片高 500+ 后，日期/节点若还垂直居中会飘到图片中部，现在**贴卡片顶边**，
  一眼对应「这张卡是哪天」。
- 结果：PC 卡片 = 480 宽通栏图（480×320）+ 下方文本，与 mb 结构完全一致（两端只有字号/内边距差异）。

**验证**：`npm run build` ✓。`tests/_pic-probe.mjs`：1440/1280/1024/820 各宽度 `boxAR == natAR` 全部 `full`（无裁切）；
`tests/_box-probe.mjs`（1024）：卡高 509~559、图 400×267~316、正文 400×214、无横向溢出；**mb 390px 与 §176 截图逐像素相同**（`ImageChops` bbox=None，零回归）。
整页高度 1440 下 4292px（改前约 2300）：这是「图按自身比例铺满」的必然代价——7 场赛事、每屏约 2 张卡，滚动变长但每张图都完整。

## §179 · 选型落地：PC 卡宽 480 → 420（V1）（2026-11-06）

§178 对照页三选一，用户定 **V1 · 竖排通栏图 + 卡宽收到 420**。

**改动（1 行）**：`timeline-page.css` `.tl-cardwrap{width:min(480px,100%) → min(420px,100%)}`。
结构、比例、图位规则一字未动——仍是 §177 的竖排通栏图（`img{width:100%;height:auto}`，图按自身比例完整展开）。

**为什么有效**：竖排下卡宽直接决定图高（图高 = 卡宽 ÷ 原始比例）。420 宽的 1.5 图 = 420×280，
比 480 的 320 矮 40px，页面按比例缩短，但「图通栏贴边、不裁不留边」的观感不变。

**验证**（1440）：卡 418×（图 279/306/272，随原始比例）、图 `boxAR == natAR` 全部 `full`、无横向溢出；
整页高 **4292 → 4001px**（同 3 场赛事区间 1779 → 1655）。1024 下卡宽仍被半栏撑满（(1024-56)/2=484 > 420），
即收窄只作用于 ≥1010 的宽屏，窄桌面自动回落原状。**mb 390px 与 §176 逐像素一致**（`ImageChops` bbox=None）。
编辑台 `.yj-pv` 不含 `.tl-cardwrap`，不受影响（当前为空态，正常）。

…结论：§178 的 V2（横排 + 模糊铺底）未采用，实现要点仍留在上文备查。

## §181 · 赏金排行点名字：改用组件原生标签事件（修正 §180 的误判）（2026-11-06）

**用户反馈**：「定制裁剪包能不能加上这个功能呢，现在点名字没反应、点条状图就跳过去了」。

**结论：包不用改**。§180 那句「该包没给 axisLabel 写 eventData」是**误判**——真正原因是 `triggerEvent` 的**位置**：
包里读的是 `axisModel.get("triggerEvent")`（轴级），写在 `axisLabel` 下会被静默忽略。改成轴级后，标签原生事件立刻带
`targetType:"axisLabel" + dataIndex`（详见 §180 的「关键结论」）。

**代码（`leaderboard.html`）**：
- `yAxis` 基座 `{ type:"category", inverse:true, … }` 增 `triggerEvent: true`；
- `EC.on("click")`：`targetType==="axisLabel"` → 开档案；其余（series）→ `showTip`；
- 保留容器级「标签列整条」兜底点击（字形命中会漏缝），400ms 时间戳与原生路径去重；
- `mousemove` 只给名字列 `cursor:pointer`。替代 §180 原来纯坐标换算的实现（保留其兜底角色）。

**为什么用户那边「点条形会跳」**：条形跳转是 §180 **之前**的行为（`EC.on("click")` 直接 `window.open`），
该改动当时只在本地 `dist` 里、未提交未部署；用户看到的是旧构建（缓存/未部署）。**清缓存强刷（Ctrl+F5）即可**。
这也解释了「点名字没反应」——旧构建里名字根本没有事件。

**验证**（`tests/_lb-click2.mjs` / `tests/_lb-hover.mjs`，CDP 真实点击 + hook `window.open`）：

| 落点（1280 / 390） | cursor | 打开 | 备注 |
|---|---|---|---|
| 日文名 | pointer | `profile.html?horse=40` ✓ | 原生 axisLabel 事件 |
| 中文名那一行 | pointer | 同上 ✓ | 原生 |
| 名次数字 | pointer | 同上 ✓ | 同在富文本标签内 |
| 两行之间的缝 / 行末缝 | pointer | 同上 ✓ | 容器兜底生效 |
| 条形 | 默认 | 无 ✓ | 只 `showTip`（tooltip=shown） |
| 条形右端空白 / 轴下空白 | 默认 | 无 ✓ | — |

每次点击**只开一个**标签页（去重生效）；`npm run build` 通过，控制台/网络零报错（`#chart canvas` 1 个，CUR_ROWS=100）。

## §182 · 文案口径统一：「马场」→「马场状态」、航迹线 KPI 中文化（2026-11-06）

**用户反馈**：① 比赛记录页筛选行「马场」与结果表列头「马场」应叫「马场状态」（值是 良/稍重/重/不良）；
② 航迹线卡片迷你数据条「タイム / 上り / 人気」应显示「时间 / 后3F / 人气」。

**最终思路（单一出处 = i18n 字典）**：`front/public/i18n.js` 早有 `馬場 → 马场状态`、`タイム → 时间`、
`上り → 后3F`、`人気 → 人气`，问题出在**展示层绕过字典**：lib 视图把 baba 列硬编码成短标签「马场」、
timeline 卡片把三个 KPI 写成日文原键。

- ① 删掉 `race-rows.js` 中 lib 视图的 baba 短标签覆盖三处（th / mbLabel / BASE_LINES 行内 label），
  表头与 mb 卡片自然回落字典全称；「体重/赔率」短标签保留（列宽考虑）。PC 列宽由
  `LIB_TH = LIB_COLS.map(c => c.thm)` 随表头文案自动量宽，列宽算法零改动。
  筛选行 label、`DIM_LABEL.cond`、stats 页签「马场」及相关注释同步为「马场状态」→ 全站口径一致。
- ② `timeline.html` 补引 `i18n.js`，`kpi()` 内统一 `esc(YJ.i18n.t(label))`（label 仍传日文原键，
  两个渲染分支共用）；编辑台实时预览（`editor.js`）同款三格改走 `YJ.i18n.t(...)`，四个编辑页均已引入字典。
  不改任何后端 JSON / 数据产物。

**改动文件**：`front/pages/{races,stats,timeline,timeline-cards.css}`、`front/public/{race-rows,editor}.js`。

**验证**：`npm run build` ✓ 7.18s（races-bundle 276 马 / 868 条 round-trip 通过）；dist 核对
`pages/races.html` / `pages/stats.html` 含「马场状态」、`pages/timeline.html` 含 `i18n.js` 引用、
`editor.js` 含 `YJ.i18n.t("タイム")`；vm 运行时对账：`cols("lib").baba.th === "马场状态"`、
`["タイム","上り","人気"].map(t) === 时间 / 后3F / 人气`，embed 视图表头同为「马场状态」。

**同步**：kzn §118（同文修复；kzn 卡片布局 / SRK 措辞 / 品牌头保持原样，不做整批同步）。

**冒烟既有欠账（与本次无关，未改测试脚本）**：`verify_datechart.cjs` yunji 13/113、kzn 3/112 失败。
复核后确认**不是断言值过期**（[C1] 期望值全部从 `data/races` 源数据独立重算），真因两条：
- ① **锚点口径分歧**：页面 `datechart.html:753` 取「全场地（含地方/海外）最新一着」作锚点（yunji → 2026-11-05 → 窗口 2026年11月），
  脚本 `C1:254` 经 `scope()` 只按 JRA 取最新一着（yunji 最新 JRA 一着 2026-10-31 → 期望 2026-10），
  于是 C1 七项 + C3 三项 + 马名切换三项全部错位；kzn 两口径同在 11 月，故 C1/C3 全过。
- ② **马名切换样本数据耦合**：脚本 `:318` 只在当前锚点月的 JRA 明细里找带中文名（`hc`）的马，
  kzn 2026-11 月 JRA 8 条里 0 条有中文名 → 样本为空 → 3 项假失败（失败消息括号为空即证据）。
kzn 其余四段 483 / 60 / 三态闭合 / 11 全绿；数据产物 [A][B] 契约与 1:1 对账全绿。
**影响**：`run_update.py --ci` 把该脚本当门禁，失败即「跳过数据提交」（`update-data.yml` 每日北京时间 06:00 跑），
`--check` 亦报红；另默认 JRA 口径却锚到地方赛月份，会让用户打开页面落在几乎空的月份（11 月 JRA 仅 5 条，10 月 71 条）。
以 HEAD 版 `race-rows.js` 对账：embed 视图表头/标签改动前后**完全一致**，datechart 页面不受本次影响。
该欠账已由 §183 解决（用户定：锚点 = 当前自然月 + 空月兼容），本节只记录复核结论。

## §183 · 日期统计页锚点 = 当前自然月 + 空月兼容（2026-11-06）

**用户定稿**：「今天是几月份就几月份，兼容没有数据也别报错就行了」。

**最终思路**：
- 口径统一：页面锚点不再取「全场地最新一着」，改为**当前自然月**（`todayParts()` 用 `Intl.DateTimeFormat` 固定
  Asia/Shanghai，与 CI 的 UTC runner、体检脚本同源，跨月边界不会各算一天）；不再随数据末日/最后一胜跳月，
  默认只统计中央赛也不再与锚点场地口径打架 → §182 的锚点分歧由此消除。
- 空月 = 合法状态：当前月无记录（月初 / 数据滞后 / 未来月）时 KPI 归零、总赏金「—」、日历画整月空格、
  明细出「该口径暂无出走记录」、› 禁用 ‹ 可用；不抛错、不回退到旧月份。
- `dpOpen()` 面板浏览态钳到数据范围内（窗口标签仍显示当前月），避免当前月超出数据范围时打开面板整屏禁用。
- 体检 `verify_datechart.cjs` 同源：`TODAY`/`FIRST_MONTH` 常量；[C1] 期望锚点改当前月，总赏金/步进边界全派生；
  马名切换样本改从当前页明细 DOM 反查（有中文名验切换、无中文名验回退、空月验空态），不再要求「某月恰有中文名马」；
  当前月无记录时 [C1] 零值/空态断言先跑完，再「回最新」切到数据末月跑 [C2][C3] 交互断言，覆盖率不降；
  [C7] 当前年无数据时自动切数据末年，不把未来空年当失败。

**改动**：`front/pages/datechart.html`（todayParts / init 锚点 / dpOpen 钳制）、
`scripts/datechart/verify_datechart.cjs`（常量 + C1/C2/C3/C7 断言）。两仓改前逐字同文，按指南整拷同步（kzn 工作区转 CRLF）。

**验证**：
- 两仓 `npm run build` ✓（10.98s / 8.73s，races-bundle round-trip 通过）；dist/pages/datechart.html 含
  `todayParts` + `Asia/Shanghai` + 面板钳制。
- 冒烟：`verify_datechart` yunji **113/113**、kzn **111/111** 全绿；`run_update.py --check` 四段全 OK（门禁恢复）；
  第五段 `verify_sire_wins` 11/11 全绿。
- **空月实证**：临时探针把「今天」模拟成 2027-01-15（数据范围外、整月 0 条），整份冒烟仍 ALL PASS
  （yunji 114 / kzn 112）——窗口 2027年1月、出走 0、总赏金 —、明细空态、无异常；探针跑完已删。
- 未跑 `--ci`（会 commit+push），改动未 commit / 未 push。

## §184 · 出走马表 embed v2.5.0：马号满格色带 + 彩衣列（2026-11-08，用户参考站截图定稿）

**需求**：用户给两张截图——① 本页实际效果（马号列是圆角小灰芯片、且没有彩衣列），② 参考站（netkeiba 式）的「马号 + 彩衣」两列：数字直接坐在**满格色块**里、彩衣图标紧跟其后。要求 RC 的 embed 组件「按这种形式展示马号和彩衣」。

**方案定稿（只改 RC `site/embed/entries-table.js`，宿主零改动）**：

1. **马号 = 满格色带**：底色刷在 `td` 上（表格单元格背景必然填满整格，不受内容高度影响），零左右内距、无圆角、去掉该列横向分隔线 → 上下相邻两格颜色直接相接成一条竖带，同枠的产驹一眼连成一段；比赛分隔线在这列也让位（`tr.rf td.nm.bd{border-top:0}`），否则竖带会被切成一格一格。色 = 枠番（JRA 官方 8 色，与主站 `.waku`、分享卡 `drawDense` 同源），字 = 馬番，12.5px×`--re-k` / 700。
   - 旧实现是 26×19 圆角芯片：色块之间被行线和留白割开，读不出「一条带」。
2. **彩衣列**（`data/silks/` 马主勝負服，RC 构建时随站点发布）：紧跟马号，高 19px×`--re-k`、等比缩放、白底 1px 细描边、`onerror` 移除（不留破图）。行里存的是站点根相对路径，渲染时补组件的 `base`；整批行都没有彩衣时**整列不摆**（空列比缺列更费解）。
3. **无枠番退化**（海外 RP 源恒无枠番 / 未確定页）：不刷底、退回普通居中馬番（`--re-muted`），**不再套灰块**——灰块会被读成「字段坏了」。
4. **列位/列宽**：三档（`<720` 卡片 / `720–1179` 十列 / `≥1180` 加母父 / `≥1500` 再加练马师）重算、每档合计 100%；结构竖线从「马号右缘」移到「彩衣右缘」（色带本身即边界，再画线会割裂）。卡片态马号仍是 24×19 小方块、彩衣 17px，第二行骑手缩进 33→61px 与马名左缘对齐。

**顺带定位一个「假 bug」**：截图里马号整列是 `–`，不是组件问题——RC 的 `_site/derived/2026-11-08.json` 是前一天 17:27 的产物，而原始数据当天 12:26 重抓过（枠順確定后 frame/num 才齐），差一份 build。重建后该日 860/860 全有枠番（旧产物 397/860）。

**验证**：RC build 后本页实测三档（1240 / 900 / 390）——色带无缝、彩衣居中、列宽不挤；切「海外」验无枠番分支（纯文本、彩衣列按数据留）；「最近一周」折叠区同款生效。组件 `VERSION` 2.4.0 → 2.5.0。

### §184.1 · 组件版本戳：手写 `?v=` → 构建期内容哈希 manifest（2026-11-08，用户定稿）

**背景**：§174.1 之后宿主用 `<script>` 动态插入 RC 的 `embed/entries-table.js`，用的是裸 URL。GitHub Pages 给 JS 的 CDN 缓存约 10 分钟，RC 改组件后宿主会有一段时间仍吃旧文件。候选三条：

| 方案 | 新版可见延迟 | 每次进页面下载 | 隐患 |
|---|---|---|---|
| 手写 `?v=2.5.0` | 直到记得改 | 缓存命中 0 | 必然忘记 bump → 线上永远旧版 |
| 纯随机 `?v=Math.random()` | 立即 | **52KB 每次都重下** | 每个伪 URL 都是缓存未命中、CDN 逐 URL 回源；用户报障对不上版本 |
| **内容哈希 `?v=<sha1-10>`** | 立即 | 缓存命中 0 | 多一个 ~70B 的 manifest 请求 |

**定稿 = 内容哈希**（与 §7 硬规同一口径：sha1 前 10 位、页面源码不写 `?v=`、禁止手改哈希）。随机数买到的是「绝对新鲜」，代价是把缓存收益整份扔掉，还多一层 CDN 回源——跨站组件同样该走 §7 的路子，只是它的哈希要由 RC 发布、宿主运行时读。

**落地**：
- RC 侧 `src/build.js`：构建时对 `_site/embed/entries-table.js` 取 sha1 前 10 位 → 写 `_site/embed/manifest.json`（`{file, hash, version, bytes, builtAt}`，`version` 从文件里的 `var VERSION` 抓，不新增第二个版本源）。构建日志 `[embed] entries-table.js v2.5.0 sha1:9e7a6cf6c1`。协议落 RC `docs/DESIGN.md` §10「缓存与版本戳」。
- 本仓 `front/pages/entries.html`：`loadEmbed()` 改为先 `fetch(RC_BASE + "embed/manifest.json", {cache:"no-store"})` → 再插 `entries-table.js?v=<hash>`；manifest 取不到（旧部署 / 断网 / `file://`）退回裸 URL，功能不受影响，最多吃一次旧缓存。宿主不必知道 RC 的版本号，也就不存在「两边版本号对不齐」。
- `dist/pages/entries.html` 同步同文（本次因本机 `vite build` 被安全删除守卫打断，dist 为手工同文同步；正常环境 `npm run build` 产出一致，无需回改）。

**验证**：探针页实测最终 src = `.../embed/entries-table.js?v=9e7a6cf6c1`；改一行组件 → 哈希变；本页截图正常渲染（马号色带 + 彩衣都在）。

**注**：kzn-web 目前**没有** `pages/entries.html`（grep 无 `RC_BASE`/`rcdev`），模板站接入时把 `loadEmbed()` 整段（含 manifest 读取）一起搬，别只搬 `<script>` 那几行。

## §185 · 比赛记录加「视频回放」列：B 站源 + 离线匹配 + 站内播放浮层（2026-11-09，用户三问定稿）

**需求**：用户要在比赛记录加一列视频回放，引用 B 站 UP 主（mid=3493136521235298）的比赛录像。三个问题一起定：① 怎么配 UP 主 + 抓全量 + 正则匹配比赛（允许人工换源填其他链接）；② B 站站外播放要支持、样式做好看；③ B 站 logo 标识来源 + 人工字段标注是否带字幕 + logo 加特征区分字幕。用户决策：人工覆写先手工 JSON、全链路一次做完、字幕**二态**（有/无，默认无）。

**数据链（构建期做掉，前端只查表——正则不进浏览器）**：

- 配置 `config/video-sources.json`（mid + 匹配正则 + 场地别名 + 字幕关键词；换 UP 主只改这里，子项目站各自维护）。
- 抓取 `scripts/video/fetch_video.py`：**免登录合集/系列接口**（`seasons_series_list` page_size≤10 / `seasons_archives_list` / `x/series/archives`）拉全量 → `data/_tmp/video/videos.json`。实测 29 条全量到手；**投稿全量接口 `x/space/wbi/arc/search` 对服务器 IP 一律风控**（无签名 -352、WBI 签名 + buvid + dm_* 仍 412）→ **CI/GitHub Actions 不抓 B 站**，抓取只在本地跑（`run_update.py --video`），产物入库随 copy-data 进 dist；`--from-file` 手工导出兜底。
- 匹配 `scripts/video/build_video_map.py`：标题三信号（日期三种形态 / 场地中文→日文归一 / R）→ `(日付,場名,R)` 查全库比赛索引 → `race:<race_id>`（无 id 海外场 `slot:日付|場名|R`，与 `racelib.race_key` 同构）→ `data/video-map.json`。**实测 27/29 自动命中**；剩 2 条（直播回放、跨日合集）按设计留 `data/video_report.md` 待人工。同场多驹共享一键 → 全部产驹行同列同视频，天然正确。
- 人工覆写 `data/video_manual.json`（脚本只读，值永远优先）：`url` 任意 http(s)——B 站链接前端自动解析 BV 号走站内 iframe，其他源降级新标签页 + 蓝阶「其他链接」图标；`subtitle: true` → 角标「字」。

**前端形态**：

- `race-rows.js` 基准列 22 → **23 列**（動画末位，`BASE_LINES` 末组同加）；量宽 `min = fmt("回放")+38`，`libLayout` 派生自动跟随。embed 视图同步展示（profile 下段 / datechart 明细）；**无视频整格空态**（`cellHTML` 返回 ""，不占感官）。
- 新模块 `front/public/yj-video.js`（`YJ.video`）：`load()`（`YJ.cache.fetch` videoMap/videoManual 合并，失败静默空表）→ `cellHTML(r)`（按钮）→ document 级事件委托开**16:9 浮层**（`player.bilibili.com/player.html?bvid=&page=&high_quality=1&danmaku=0&autoplay=1&no_related=1`；**点击才注入 src、关闭即清空**——几十行表格绝不并发拉播放器；Esc/遮罩/× 关闭；底部「带字幕」chip +「在 B 站打开 ↗」）。races.html 两条渲染链（embed renderHorse / 独立 initLibrary）均 `Promise.all([bundle, videoLoad()])` 并行预取；datechart init 预取 + renderDetail「未就绪 → load 完成重渲染一次」兜底（ready 检查防循环）。
- **B 站 logo = 简化自绘小电视**（品牌粉 #FB7299，指定品牌色块例外，单一出处 theme.css `.yj-vid*`）；**字幕二态**：`subtitle=true` 右上角粉底白字「字」角标，false 无角标（无噪音）。交互（YJ.video 未加载/数据失败 → 整列退场不崩）。
- i18n `動画 → 回放`；`yj-cache.js` 注册 `videoMap`/`videoManual`（12h）。

**断言同步**（列数硬编码）：`verify_drill.cjs` C3 段 22/17/18 → **23/18/19**，并新增「動画列末位 + stub 无 YJ.video 空单元格不崩」断言。

**验证**：`npm run build` 通过（`dist/assets/theme-*.css` 含 yj-vid×7 / yj-vm×14 处，`dist/data/video-map.json` 6.7KB、`dist/yj-video.js` 带内容哈希版本戳，races/datechart 两页已引）；`verify_drill.cjs` **61/0 全绿**（新增 1 条断言）；`verify_result.cjs` 三态对账通过；node 端到端冒烟（真实 bundle + video-map → cellHTML 输出 `data-yj-vid` 按钮、无字幕无角标、manual `_` 键忽略、embed 行 18 td）；`python serve.py` 本地 9090 实测 video-map/video_manual/yj-video.js/races.html 全 200。数据契约见 `docs/SCHEMA.md` §10、管线说明见 `docs/pipeline.md` §4.6。

**踩坑记录**：verify_drill 的 node stub 环境不加载 yj-video.js → races.html 直接调 `YJ.video.load()` 抛 TypeError 打挂整页初始化（LIB=null 连坐五条断言）。修法 = 页面侧 `videoLoad()` 防御（YJ.video 缺失 → `Promise.resolve()`），这也是正确的容错语义：视频模块缺席时回放列整列空态、主数据链零影响。

### §185.1 修正（2026-11-09 晚，用户反馈「匹配错了」）

用户指出回放匹配有误，复查后定位**四个问题**，全部修掉：

1. **清单不全（根因）**：原实现只走合集/系列接口，拿到 29 条；该 UP 主实际投稿 **192 条**（`x/space/navnum` 与 `x/web-interface/card` 均报 191~192）。合集只收被整理过的部分，2026 年整季比赛录像几乎全漏。→ 新主通道：**站内搜索按 UP 昵称**（`search_type=video&keyword=<昵称>&order=pubdate`，实测 10 页 192 条，返回条目 `author` 恒为本 UP 主），合集退为兜底（`--via seasons`）。
2. **多 P 视频整条丢弃**：`2025/8/24-8/25 比赛合集` 是 3 分 P，真实场次在分 P 标题里，原实现按整条标题匹配 ⇒ 录不到。→ fetch 阶段对疑似多 P 拉 `x/web-interface/view` 存 `pages`，build 阶段逐 P 匹配并记 `page=N`（实测拆出 4 场，含中京3R/札幌5R/新潟6R）。
3. **跨年错配（真·匹配错）**：`11月8日 京都3R ゴールデンプロミス`（2026-11-08，当日中央赛未入库）曾被"同月日唯一候选"抢到 **2025-11-08 京都3R**（シティプロスパー/ネッタイヤライ）。→ 改为：推断年查不到就判未收录，**绝不跨年硬配**，只在报告写「跨年候选 xxx（未采用，人工确认）」。
4. **新建马名校验 + 场地正则回归**：标题片假名马名不在该场出走马 → 判疑似错配不落库（`_meta.suspect`）；另修自身回归——改场地正则时漏掉中文「东京」，导致 11 条 2026 场次全掉（`東京` 被重复写了两遍）。

**结果**：27 → **111 场**（全部走「精确」命中；107 条马名验证通过，4 条标题本身没写马名但日期/场地/R 精确）；前端 873 行里 **165 行**出现回放按钮（同场多驹共享）。断言 61/0、datechart 113 全过。人看清单 `data/_tmp/video/videos.md`（192 条：发布日 / 标题 / 分P / URL / 匹配结果）。

### §185.2 日频自动化（2026-11-10）：GitHub 定时 + 本机兜底，风控感知不洗数据

用户问「能不能上 GitHub 每天定时抓」。能做，但**不能天真地抓**：实测 B 站对机房 IP 返回的是
`HTTP 200 + code:0 + data:{v_voucher}`（只有验证票、没有 result）—— 如果按「结果为空」处理，
每天会把 111 场映射洗成 0 场。所以这一轮的核心不是加 cron，而是把「抓不到」变成安全事件。

**四处改动**：

1. **风控识别**（`scripts/video/common.py::guard_risk`）：`data` 只有 `v_voucher` 且无 `result/list` → 抛
   `RiskControl`。同时 `jget` 支持环境变量 `BILI_COOKIE`（CI 配 Secret 用登录态提高通过率）。
2. **清单入库**（新 `data/video_raw.json`，193 条 / ~50KB）：`data/_tmp/` 被 gitignore，Actions 读不到 →
   抓取全挂时仍能用基线重算映射（当日新入库的比赛照样能挂上旧视频）。`copy-data` 显式跳过它，不进 dist。
3. **累积合并 + best-effort**（`fetch_video.py`）：默认按 `bvid` 并集**只增不减**（`--replace` 才覆盖），
   实测「只放开合集通道（29 条）」时清单仍是 193 条、映射仍是 111 场；`--best-effort` 让 CI 失败也 exit 0。
4. **新工作流** `.github/workflows/video-task.yml`：`update-data` 成功后串联（每天 1 次，不新增独立 cron 以免抢文件），
   `--via both --best-effort` → 重算 → 无变化不提交 → 有变化才 commit + dispatch deploy。
   另加 `scripts/video/local_refresh.py` 作本机兜底（家宽 IP 必成，抓取→重算→push）。

**验证**：`py_compile` 过；YAML `safe_load` 结构检查过（1 job / 7 steps）；`guard_risk` 三态单测过
（正常放行 / 仅 v_voucher 拦截 / 有 result 时放行）；`local_refresh.py --no-push` 真跑一遍（193 条清单 →
111 场映射，新增 0）；模拟「只抓到合集 29 条」→ 清单 193 不被清空，且**并集多捞到 1 条搜索漏掉的视频**。

## §186 · 回放列四项修正：页面内手工配多源 / 浮层整页居中 / 透明遮罩 / 只留图标（2026-11-10，用户看图反馈）

用户看本地预览提了 4 条：① 比赛记录**没办法手工配置视频源**，且要**支持多个源**；② 基本信息页看视频，视频框**不在整个页面最中间**（截图里偏右下）；③ 遮罩深色「好丑」，改**透明**；④ 按钮「只显示图标即可，不用文字」。

**① 手工配置 + 多源（数据契约升级 v2）**

- `data/video-map.json` 从 `videos[key] = 单对象` 改为 **`videos[key] = 源数组`**（`_meta.schema = video-map/v2`）；`build_video_map.py` 的人工表解析支持 `{"sources":[…]}` / 单对象（旧契约） / 直接数组，外层 `append:true` 追加、`clear:true` 清空；前端 `normList()` 兼容两种形状，缓存里旧数据也不炸。
- **页面内编辑**：回放列每行都有极淡的铅笔（有视频）或虚线 `+`（无视频）入口 → 编辑弹窗可增删多个源（链接 / 标题 / 分 P / 字幕）、「恢复自动匹配」、「复制 JSON」。保存写 **localStorage 本机表**（键 = `YJ.util.storeKey("videoManualLocal")`，调用时求值），优先级高于仓库人工表与自动表；按 `data-yj-vid-cell` 原地刷新按钮、跨 iframe 走 `storage` + `yj:videoChanged`。要全站生效就把复制的片段粘进 `data/video_manual.json` 重算 + build。
- **多源交互**：图标右下角数字角标；点击开浮层，顶部源切换条逐个切；非 B 站源在浮层内显示外链卡片（单源 other 仍保持新标签页直开）。同场多驹共享一个比赛键 → 配一次全马生效。

**② 浮层整页居中（根因 = 三层 iframe）**

站点是外壳 `index.html`（侧栏）→ `profile.html` → `races.html?embed=1` 三层嵌套，页内 `position:fixed` 只相对**最内层 iframe 视口**居中，所以看起来被挤在右下。修法不是 postMessage 转发（外壳要多引脚本、还要重传数据），而是**同源 iframe 直接把浮层 DOM 挂到 `window.top.document`**：外壳已引同一份 `theme.css`（新类同步可用），`fixed inset-0` 立刻变成全视口居中，Esc / 遮罩 / × 全部在顶层生效（键盘监听同时挂顶层与本页面双保险）。直开子页（`top === window`）自动退回本 document，行为不变。同族先例 = §149.2 血统弹窗 / 灯箱的顶层渲染约定。

**③ 透明遮罩**：`.yj-vm-mask` 的 `bg-black/60` → `bg-transparent`，弹窗自身加 `ring-1 ring-black/5` + 既有 `shadow-2xl` 分层；点空白关闭仍由透明层捕获。

**④ 只留图标**：`.yj-vid` 改 28×25 的方形图标按钮（去掉 `<span>回放</span>`），`.yj-vid-edit` 19px 淡铅笔（hover 整格才显色），`race-rows.js` 量宽 `fmt("回放")+38` → `max(fmt+8, 58)`。字幕「字」角标、B 站粉/其他链接蓝阶保留。

**验证**：`npm run build` 通过（新 CSS `theme-DE7joZkv.css` 含 `.yj-vid-cell/.yj-vid-edit/.yj-vid-n/.yj-vm-tabs/.yj-ve-*/.yj-vtoast`，`dist/index.html` 已引用同一份；`.yj-vm-mask` 编译结果 `background-color:transparent`）；断言 61/0 + 113 + 211 + 结果对账全绿；node 端到端冒烟 9 项通过（v2 数据 / 无文字 / 无视频只有 + / 浮层挂顶层且本页无浮层 / 本机双源角标 / 多源切换条 2 个 tab / 编辑弹窗 2 行 / 单源外链直开 / 清空源回退 + / lib 仍 23 列）。

## §187 · 视频源编辑并入比赛记录批量编辑（草稿箱 + PAT）+ 批量表格横向扩宽（2026-11-10）

用户反馈：① 「源的编辑建议放在比赛记录批量编辑里，这样能复用草稿箱和 PAT 提交机制」；② 基本信息批量编辑 / 比赛记录批量编辑**两侧留白太多，横向扩大、每边只留 100px**。另附一条待定：字幕「字」角标不好看，要求重新设计几个候选（**本轮只出候选，未改代码**）。

**为什么必须同时收编正式页的本机编辑**：§186 的页面内编辑把配置写进 localStorage 本机表且优先级最高 —— 若保留，编辑台 PAT 提交的值会被本机旧值盖掉。故 `yj-video.js` 精简为**只读**：删掉本机表层、编辑弹窗、编辑入口图标与 storage/message 同步；回放列回到「只有一个图标 + 无视频空态」，播放浮层底部加「配置视频源 ↗」直达编辑台（绝对路径按 iframe pathname 拼，外壳顶层文档与直开子页都对）。

**编辑台链路（同构扩展，不新增后端脚本 / 不新增 CI 重算）**：

- 新草稿段 `d.vid = { "<比赛键>": { sources:[…] } }`（`editor.js` 加 `vidGet/vidPut/vidN/vidDropAll`），计入 `draftCount()`；草稿箱抽屉/查询页新增「回放视频源」汇总条目，`__vid` 放弃、`yj-vid-dropped` 通知表格重水合。
- 新白名单 5 `VM_PATH = data/video_manual.json`：`submitDrafts()` 读远端 → `mergeVideoManual(remote, d.vid)`（保留 `_readme`/未改业务键，草稿按比赛键覆盖，`sources:[]` → `clear:true`）→ 与其余 4 张人工表同一原子 commit；commit message / 成功报告 / 清箱同步补上。
- **前端直读且人工值优先 → 提交后无需后端重算**，`YJ.cache.bust()` + `watchCI` 后约 2 分钟生效；`video-task.yml` 每日重算 video-map 只是幂等再次合并。
- 表格：`editor-table.js::RACE_LAYOUT` 末位加 `视频源` 列（`type:"video"`），点击开多源弹窗（复用 `.yj-ve*` 骨架，增删 URL/标题/分P/字幕 + 恢复自动匹配 + 存入草稿箱）。**绝不写 `races_edits.json`**：该列在 `startEdit` 被拦截、不走 `applyCell`；行初始化 4 处跳过它，`r._pend` 永不出现该键。列格显示「N 源 + 自动/人工/草稿」chip，`rowDirty()` 把草稿计入「只看待保存」。
- 弹窗同样挂 `window.top.document`（编辑台也在外壳 iframe 内 → 整页居中，同 §186）。

**宽度定稿**：`edit-table.html` 两个页签共用同一容器 —— 主内容 `:19` 与底部保存条 `:79` 的 `max-w-[1280px]` → `max-w-none px-[100px]`（桌面每边正好 100px），移动端保留 `max-md:px-3` 单断点降级。表格 `w-max min-w-full` 横向滚动，容器变宽后自然多显示几列。

**验证**：`npm run build` 通过（`theme-C9MvKOjG.css` 编译出 `.px-\[100px\]{padding-left:100px;padding-right:100px}`，`.yj-ve-*` 弹窗类因 editor-table.js 字面量引用全部保留，外壳 `dist/index.html` 与编辑台引用同一份 CSS）；断言 61/0 + 113 + 211 全绿；node vm 冒烟 5 项（合并表保留说明/业务键、覆盖双源、空源 clear；草稿读写清箱；列定义/拦截/4 处跳过；白名单/vmCommit/__vid/导出 API）；回放模块冒烟 4 项（只图标、无编辑入口、无视频空态、浮层挂顶层 + 编辑台绝对路径、lib 仍 23 列）。

### §187.1 字幕角标定稿（用户选候选 A 变体）

用户看完 4 个候选后定：「A 很不错，但是把 CC 改成『字』就好看的，这个字不能大」。
→ 保留 A 的**圆角矩形胶囊**外形（弃用原先 14×14 的圆形大角标），文字换回中文「字」且**压到 9px / 400 字重**：
`.yj-vid-sub` = `16×12` 胶囊、`border-radius:4px`、`right/top:-6px`、深粉 `#d4537e` 底白字，与右下多源数字角标（9px）同字号、视觉一套。
角标字小 → 按钮 `title` 在 `subtitle=true` 时追加「· 带字幕」，hover 仍能看清语义；播放浮层底部「带字幕」chip 保持不变。
⚠ 当前 111 场自动匹配的字幕全是 false（标题无字幕关键词），**页面上看不到这个角标** —— 要在编辑台「比赛记录批量编辑 → 视频源」弹窗里勾「带字幕」并提交后才出现。

## §188 · 航迹线 sticky 年份胶囊缓退：滚动中可见、停止后慢慢消失（2026-11-11）

**痛点（用户 mb 看图反馈）**：往下拉时吸顶的「2026 N 条」年份胶囊一直盖在卡片内容上不动。

**方案（用户定稿：拉的时候可以出现，停止之后要慢慢消失）**：
- 滚动进行中：所有年份胶囊照常显示，**不**做任何处理（滚动即恢复，出现快 0.25s）。
- 滚动静默 ~0.9s 后：只把「当前吸附在视口顶」的胶囊**缓慢淡出**（0.8s + 0.15s 延迟）；
  自然流位置的年份标签不动——静置阅读时年份上下文不丢。
- 吸附态判定 = 胶囊 `getBoundingClientRect().top` 贴住 sticky 偏移（±2px；PC 8px / mb 4px，
  与 CSS 的 `top` 同源）。偏高 = 自然流、偏低 = 被父盒推出（正在滚出年份区间），都不算吸附。

**落点**：CSS = `front/pages/timeline-page.css`（`.tl-idle .tl-yearrow.stuck` 淡出规则，过渡包在
`prefers-reduced-motion: no-preference` 里，减动效下瞬时隐藏）；JS = `front/pages/timeline.html`
（`IDLE_MS=900` 静默计时 + `markStuckPills()` 吸附判定，scroll 监听 passive，iframe 外壳内同样生效）。
出现快 / 消失慢靠「过渡取自目标状态」实现：恢复态 0.25s、淡出态 0.8s+延迟。

**验证**：`npm run build` 通过，`dist/` 下 CSS/HTML 均含新规则与 `markStuckPills`；`python serve.py`
打开 `http://127.0.0.1:9090/timeline.html` 缩窄视口实测：滚动中胶囊常显，停住 ~1s 后缓缓淡出，再滚立刻回来。

### §188.1 淡出动画优化（用户反馈"效果对但动画可以更顺"）

纯 opacity 淡出偏干瘪 → 改为三轨组合：透明度 + 轻微上浮缩小（`translateY(-8px) scale(.95)`）+
阴影同步收拢（`box-shadow → 0`），同一条平滑曲线 `cubic-bezier(.4,0,.2,1)`，时长 0.7s + 0.2s 延迟；
恢复（出现）= 0.3s ease-out 从上方轻微落回。动画作用点从 yearrow 收窄到胶囊本体 `.tl-year`
（全宽透明层不动，sticky 吸附定位不受 transform 影响）。其余判定/JS 不变。

### §188.2 侧栏 nav 复用 .yj-pane 细滚动条（本地 vs 线上滚动条差异排查）

现象：本地侧栏无滚动条、线上有 Windows 经典双箭头粗滚动条。根因**不是代码差异**——底部
「总访问 N 次」行（yj-visit.js，§97 GoatCounter 回填，成功才显示）线上渲染成功使页脚多一行 →
nav（flex-1 overflow-y-auto）被压矮 ~20px → 内容溢出露滚动条；本地拉取失败该行隐藏，nav 刚好放下不溢出。
修复：nav 复用 theme.css 已有的 `.yj-pane` 细滚动条样式（thin / 8px 浅灰圆角），溢出时视觉与侧栏一体，
不出现经典双箭头。落点 = `front/index.html` nav 加 `yj-pane` 类，零新 CSS。
---

## §189 · 回放浮层：链接时间轴（`t=`）透传 + mb 静音起播（2026-11-11，用户反馈）

**问题**：用户贴的 B 站回放链接常带时间轴（例：`.../BV16hVS6GErr/?t=2339`，通天飞 · 青叶赏）。PC 端「能跳转能看」，mb 端「既不自动播放也不跳转」。

**根因（两条独立）**：
1. **`t` 从未传给播放器**：`playerHTML` 只用 `bvid` / `page` 拼 `player.bilibili.com/player.html`，源链接上的 `t=` 被整段丢弃 → iframe 永远从 0 开始（PC 上看到的「能跳」其实是点了「在源站打开」后 B 站站点自己认 t）。
2. **mb 有声自动播放被浏览器禁止**：移动端对未静音 iframe 的 `autoplay=1` 一律忽略，画面停在首帧，观感即「没播」。

**修法**（`front/public/yj-video.js`，纯前端，数据零改动）：
- `normSource` 从 `url` 解析**起播点与分 P**：`?t=` / `?start=`（支持 `2339`、`1h2m3s`、`1m39s` 三种写法，`?t=` 也认 `#t=`），`?p=` / `?page=`；表里显式写了 `start` / `page` 时以字段为准。
- 播放器 URL 追加 `&t=<秒>` —— `player.html` 的 `SEARCH_PARAM` 本来就支持 `t`(number) 与 `muted`(boolean)，但**站点链接上的 t 不会自动透传进去**，必须由我们拼；mb 端再追加 `&muted=1`（移动端仅放行静音自动播放）。
- 浮层底部新增两枚 chip：「从 38:59 开始」「静音起播·点喇叭开声」（后者仅 mb + B 站源显示），避免用户以为跳错了。
- 多源切换沿用同一逻辑，每个源解析自己的 `t`；`other` 源仍走外链（链接自带 t 不变）。

**验证**：`node --check` ✓；`COPY_DATA=skip FONT_GEN=skip npm run build` ✓（dist/yj-video.js 含 `&t=` 与静音提示）；无头驱动（stub `YJ.cache` + `YJ.device.isMb`）dump iframe `src` —— mb = `...&autoplay=1&no_related=1&t=2339&muted=1`，PC = `...&t=2339`（无 muted）；页脚 chip 文案正确。解析单测：`?t=2339→2339`、`?t=1h2m3s→3723`、`?p=2&t=90→page2/start90`、无 t→0。

**§189.1 分享链接 / av 号兼容（2026-11-11 用户补充）**：B 站「复制链接」默认长这样 —— `…/video/BV16hVS6GErr/?share_source=copy_web&vd_source=5abc…&t=2339`，参数顺序、数量都不固定。改为 `parseBili()` 统一识别：

- **只认视频 ID**：路径 `/video/BV…`、`?bvid=`、`/video/av123`、`?aid=` 四种都认；av 号走 `player.html?aid=`（cid/bvid 由播放器自己解析）。
- **分享参数一律丢弃**：`share_source` / `vd_source` / `spm_id_from` / `unique_k` 等不进播放器 URL（避免误导播放器参数解析）。
- **`t` / `p` 与顺序无关**：`?share_source=…&vd_source=…&t=2339` 正常解析出 `2339`；`t` 在中间、在末尾、带 `#` 都行。
- **`b23.tv` 短链**：离线展不开（要一次 HTTP 302）→ 仍按「其他链接」外链打开，并在浮层说明「短链无法解析 BV 号，请点打开视频或改填完整链接」，不让用户以为是坏了。

**验证（无头驱动，dump iframe `src`）**：
| 粘贴形态 | 结果 |
|---|---|
| `…/video/BV16hVS6GErr/?share_source=copy_web&vd_source=5abc…&t=2339` | `bvid=BV16hVS6GErr&page=1&…&t=2339` |
| `…/video/av170001?t=90` | `aid=170001&page=1&…&t=90` |
| `m.bilibili.com/video/BV1jzHG6DEHC/?p=2&t=1h2m3s` | `bvid=BV1jzHG6DEHC&page=2&…&t=3723` |
| `b23.tv/AbCdEf` | 不外嵌，浮层给短链说明 + 外链按钮 |

## §190 · 编辑页 PAT 门禁：未解锁不再呈现编辑界面 + 回放浮层「配置视频源」收进编辑模式（2026-11-11，用户提案）

**背景**：用户在回放浮层看到「配置视频源 ↗」，指出这与「有 PAT 才能编辑」的约定相矛盾，进一步要求「进入编辑页面必须有 PAT 校验」。复查后确认这是 §168 的**半个门禁**：那一轮只做到「未解锁不注入侧栏编辑导航」，而 `pages/edit*.html` 本身是公开静态文件 —— 直连 URL（浮层按钮 `target=_blank`、收藏、分享链接）照样能打开整张批量表格，只是提交时才因为没有 PAT 而失败。另有一处真实泄漏：`yj-video.js` 的 `editHref()` 硬拼导航链接，**完全不看** `editUnlocked()`，公网访客人人都能看到这个入口。

**定案**（用户诉求 = 进页即校验，不再只靠「导航不出现」）：
1. **页面级门禁** `public/yj-edit-gate.js`（新）：4 个编辑页在 `yj-util.js` 之后、`editor*.js` 之前同步引入。已解锁 → 立即 return（零成本、零 DOM 改动）；未解锁 → `html[data-yj-locked]` 打标 + 内联样式 `body{visibility:hidden}`（**先锁可见性**，防表格闪一下），`DOMContentLoaded` 后把 body 换成一张「编辑页 · 需要 PAT」卡片：粘贴 → `YJ.util.verifyPat` 真实验证 → 通过写 `gh.token` → `location.reload()`。卡片另给「返回站点」。
2. **入口同源**：`yj-video.js` 新增 `canEdit()`（判定 = `YJ.util.editUnlocked()`），浮层底部「配置视频源」只在编辑模式渲染；未解锁时浮层其余功能（播放/切源/在源站打开）不受影响。
3. **顺带收口（§48 达标：3 处）**：仓库常量与 PAT 校验原先三份（`editor.js` `GH_REPO` / `index.html` `EG_REPO` + 内联 fetch / 门禁要用第三份）→ 统一为 `YJ.util.GH_REPO` + `YJ.util.verifyPat()`（返回 `{ok,status,msg,token}`，401/403/404/网络四档文案一并收口）。外壳 `editGate` 与编辑页门禁共用同一套判定与文案，`editor.js` 改为引用常量（消除字面量重复）。

**定位说明（务必别再误解）**：这是**前台可见性门禁，不是安全边界**。编辑页是公开静态文件，改 JS 即可绕；真正把守写权限的仍是 GitHub PAT（无 PAT 无法提交，§104 原子 commit）。收益 = 公网访客看不到编辑界面、不会误入、与侧栏编辑入口语义一致。§168 的「已知局限」不变：`GET /repos` 只证读权限。

**验证**（`python serve.py` + playwright `--channel msedge`，脚本 `tests/_admin-gate-check.cjs`）：
| 场景 | 结果 |
|---|---|
| 无 token 直连 `pages/edit-table.html?sheet=races` | `#yj-gate` 存在 · `#grid` **不存在**（0 行）· bodyText 只有门禁文案 |
| 塞 token 后 reload | 门禁消失 · 表格 **889/889 行**渲染 · 侧栏「编辑」组出现 |
| races 浮层（已解锁） | `.yj-vm-cfg` = 1，href = `/pages/edit-table.html?sheet=races` |
| races 浮层（未解锁） | 浮层正常渲染（`.yj-vm` = 1）· `.yj-vm-cfg` = **0** |

构建核对：`dist/yj-edit-gate.js` 已拷出（5.2KB）· 4 个编辑页各含 1 处引用 · `dist/assets/theme-*.css` 含 `z-\[9999\]` / `max-w-sm` / `bg-black\/40`。

**⚠ 新增编辑页必须带门禁**：任何新的 `pages/edit*.html` 都要在 `yj-util.js` 后引 `../yj-edit-gate.js`，否则等于给公网开一扇后门。

## 附录 A · 已归档条目（原文见 git 历史 `7e48d69` 及之前）

| 已删条目 | 内容 | 去向 / 替代 |
|---|---|---|
| §21 | 待决策：仓库根 index.html 跳转 | 已落地为外壳 iframe 路由（§169） |
| §24 | 等级徽章 L/OP 类名不可见（bug） | 现行口径 = `config/grade-table.json` 的 `about` 键（listed / open） |
| §59 | SP 页性齢拆列（当时标 🚧 待回填） | 已全量完成，字段见 `docs/SCHEMA.md` §2 |
| §67–§71 | 编辑台换皮 / 动效门禁结案 / 收口与回滚 | 编辑台现行为见 §150；动效方案已整体撤销（不要再复活） |
| §73 · §75 · §79 | favicon 补齐 / 措辞「年世代」/ 删统计页注记 | 现状即结果，无需再记 |
| §81 · §82 · §83 · §84 · §85 | 编辑台双形态、B 稿常开工作表（含 82.1–82.23 微调）、`?edit=1` 开关、钉住标记、不蒜子统计 | 编辑台现行形态见 §150（草稿箱 + 三页 + 分组表单）；入口见 §168；统计见 §97 |
| §90 | 编辑台 v3「工作台」分组导航 + 状态沉默化 | 被 §150「表单分组化」取代 |
| §87（第二个） | 访问统计由不蒜子迁 Vercount | 被 §97「双线：Vercount 计数 + GoatCounter 展示」取代 |
| §89 | 只传照片不写 photo 条目的孤儿图修复 | 已修，编辑台现行为见 §150 / §187 |
| §104 | 批量表格「键盘电子表格流」 | **已被 §142 撤掉**（键盘流不再存在，勿按 §104 复原） |
| §106–§109 | 编辑台提交/持久化/草稿箱四个 bug 修复 | 一次性修复流水；现行机制见 §105 · §150 · §154 |
| §113 · §116–§127 | 产驹赏金 v2–v13.1 逐版微调 | 现行方案见 §112 · §114 · §115 · §128–§131 |
| §133 | 时间线编辑页保存条不刷新（bug） | 已修；判脏统一走 §154 `effEqual` |
| §138 | 冒烟 firstRow 取行漂移审查 | 结论已成 `verify_stats.cjs` 现行实现；同步红线见子项目指南 |
| §143 | 提交成功后批量表格不重水合（bug） | 已修 |
| §147 · §151 · §152 · §153 | 年视图错位 / 幽灵待保存 / 时间线净零快照 / 草稿判脏修复 | 一次性修复流水；现行判脏口径 = §154 |
| §156b | 灯箱复开首图空白（为 §156 的二次修复） | 与 §156 同批，已修 |
| §163 | 金银铜 chip 色点与 tooltip 伪元素冲突 | 已修（`.yj-chip` 伪元素改实元素） |
| §171.1 | 「横滚藏内容」方案被否决 + 配色降饱和 | 现行为 = §171 的六处收口（不横滚） |
| §174.1–§174.4 | 出走马表 embed 四次改稿（v1.1–v1.2.1） | 现行组件协议与呈现见 §174 + §184 |
| §178 | PC 卡片「缩短/紧凑」备选对照页 | 选型已定案于 §179（卡宽 420） |
| §180 | 赏金排行点马名（第一版误判） | **被 §181 修正**（改用组件原生标签事件） |
| 重复 §87 / §166 | 编号重复的两个条目 | 各保留第一处；第二个 §87 见本表第 4 行说明 |
