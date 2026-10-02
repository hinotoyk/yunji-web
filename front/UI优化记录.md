# 云迹 · UI 优化记录文档

> 本文档记录「云迹」前端各模块 UI 优化的**最终方案**与**当前成果**（按最新状态收口；历史背景/废案/反复迭代过程不展开）。
> 约定：每改一个模块，先把该模块的最终思路与成果写进本文档，再合并进正式页面（`front/` 源码 → `npm run build` → `dist/` 验证）。
> 配套：根 `HANDOFF.md`（交接/规范）、根 `README.md`（项目介绍）、`data/SCHEMA.md`（数据契约）。

## ★ 全站编码约定 · 复用抽离（§48 定稿，此后一切前端编码必须遵守）

1. **公共工具单一出处**：HTML 转义等页面级工具放 `public/yj-util.js`（`YJ.util.*`），页面只写薄别名 `var esc = YJ.util.esc`，**禁止再复制函数体**；共享模块保持零依赖可独立单测的，内部实现可自包含（如 race-rows 的 esc），但语义必须两处一致。
2. **业务语义组件单一出处**：比赛行/徽章/格式化（`gradeBadge/placeBadge/ninki*/GRADE（含派生 G/GLABEL）/weightOf/venueR…`）一律复用 `public/race-rows.js`，新页面直接引入，禁止本地重写映射表或徽章 HTML。
3. **数据语义色单一出处**：着顺浅色三件套（1/2/3着+着外）JS 侧 = `race-rows.js` 的 `PLACE_BG`，CSS 侧 = theme.css `.yj-nkm*`，两处互指注释、**改色必须同步**；新增数据语义色先找单一出处再写。
4. **组件样式进 theme.css**：≥3 页共用或全站统一的样式 → `@layer components` 用 `@apply` 封装（如 `.page-title`/`.sec-title`）；**但类名靠 JS 动态拼接、content 里没有字面量的类（如 `.yj-g*`），必须放在 @layer 之外**——Tailwind 会按 content 候选裁剪 @layer 内规则。
5. **收录门槛（防为了复用而复用）**：抽离前先 grep 查重复——**全站统一的数据语义，或 ≥3 处使用**才收口；仅 2 处且行为有分叉的明确不动（反例：`.seg`/`manYen`/`#page.embed` 等）。
6. **零影响红线与验证清单**：复用收口只做等值搬移/纯删除；改完必跑 `npm run build` + 核对 dist（theme css 新类在、旧类无、`dist/data/basic.json` 存在——`COPY_DATA=skip` 与 `emptyOutDir` 叠加会清掉 data）。

---

## 1. 模块进度总览（最新状态）

| # | 模块 | 状态 | 最终方案一句话 |
|---|---|---|---|
| 1 | 搜索栏（智能单框） | ✅ | 单框匹配 8 类字段，下拉彩色名字色块 + 性别徽章 + 计数 |
| 2 | 字体（思源黑体 + Geist） | ✅ | 本地自托管思源 + Geist 回退，16px/1.40，全站数字等宽（后经 §66 改构建期按需子集） |
| 3 | 基本信息页两栏布局 | ✅ | 左 400px 常驻搜索列 + 右详情，<1024px 堆叠，未选马显示分类总览 |
| 4 | 马匹详情「上中下」一体式 | ✅ | 无卡片无分割线，上段黄金比 1:0.618，中段 OVERVIEW 卡，名字四槽占位 |
| 4.1 | 中段数据概览卡片化 | ✅ | 白底主卡「x战x胜 [x-x-x-x]」+ 三率副卡（后经 §54/§55 改 S9 色带） |
| 5 | 比赛记录页单行 21 列表 | ✅ | 版本 B 清爽网格 + JBIS 配色 + mb 两行分块 |
| 5.1 | 比赛记录·内嵌模式 | ✅ | profile 下段精简 15 字段，无过滤，场地+R 组合文案 |
| 6–8 | 统计/日期图/时间线占位 | ✅ | 均已替换为正式页（§31/§32/§35） |
| 10 | 设备判定统一入口 | ✅ | `YJ.device`（768px matchMedia）+ 断点翻转重渲染 |
| 12 | 独立模式全库跨马查询 | ✅ | 8 维筛选（同维多选 OR/跨维 AND）+ 内存分页 |
| 13 | 跨马结果表 | ✅ | 马名列去年份、表头「出走马」、马名两档切换 |
| 14 | 马番/枠番列 + 骑手正式名 | ✅ | 数据回填 + jockey_id 归一 |
| 18/19 | 跨马表列宽 | ✅ | §18 固定百分比无横滚被 §19 取代：最小固定 + 内容自适应 |
| 20 | 独立 MB 跨马卡片 v2 | ✅ | 5 行镜像 PC 列序 + 字段翻译对齐 |
| 22 | 赛事名去冗余等级尾缀 | ✅ | 只剥有徽章代劳的 5 类尾缀，其余保留 |
| 23/26 | 宽屏列宽 v6/v7 | ✅ | 全列参与分配 + 密度分档 + 注水上限随档位 |
| 24 | 等级徽章 L/OP 不可见修复 | ✅ | G 表取值统一小写对齐 `.yj-gl/.yj-gop` |
| 25 | 人气徽章改颜色文字 | ✅ | 1/2/3 数字染着顺同款深阶文字色 |
| 27 | 筛选加「出走马」 | ✅ | tag 型多选，复用 selector 组件 |
| 28 | 出走马跳转优化 | ✅ | 去掉 `_blank`，走外壳 iframe 内跳转保留侧边栏 |
| 29 | 内嵌 RACES 加跳转 | ✅ | `races.html?horse=id` 预置出走马筛选 |
| 30 | 选马器双格式马名 | ✅ | `doubleName` opt-in（仅 profile 开启） |
| 31 | 时间线页（航迹线） | ✅ | 后端预计算 timeline.json，前端 1 请求纯渲染，6 类事件 |
| 32 | 日期统计页 | ✅ | 后端预计算 datechart.json，天/周/月/年日历 + KPI 带 + 内嵌明细 |
| 33 | 同日按发走时间排序 | ✅ | 统一 `raceCmp`，四处生效 |
| 34 | 着顺过滤三态化 | ✅ | 完赛/未完赛/未出走三态，KPI 改「出走」 |
| 35 | 统计总览页 | ✅ | 倾向矩阵（10+ 维切面）+ 年龄成绩曲线 + 重赏之路，后端预计算 |
| 36 | 着顺语义纯彩字修正 | ✅ | 人气/通算战绩/进板数改同色相深阶文字 |
| 37 | 赛道方向译名 + 人气筛选多选 | ✅ | 显示层译名 + 复用 selRow 下拉 |
| 38 | 未选马总览等式 | ✅ | `277 = 146 + 131` 实时聚合；mb 端直接展示 |
| 39 | 人气徽章与着顺统一 | ✅ | 人气 1/2/3 套用同款浅底彩边徽章 |
| 40 | 全站 1/2/3 色浅色三件套 | ✅ | #FEED88/#CCDFFD/#ECC6A2 浅底深字 |
| 41/43 | 通算战绩分节条 | ✅ | §43 修正 §41：连体底色 + 保留 `-` 连字符（渐变接缝） |
| 42 | 比赛行/徽章抽公共模块 | ✅ | `race-rows.js` 单一出处，datechart 加 `toRow()` 适配 |
| 44 | 倾向矩阵着别列 | ✅ | v3 终版全部去样式纯数字 |
| 45 | 时间线骑手/调教师两行 | ✅ | 拆两行 + 発走排序 + 「首胜」+ 小皇冠 |
| 46 | 级别细分 13 档 | ✅ | 班赛拆级/重赏拆 G1-3、Jpn1-3 |
| 47 | 矩阵容器高度对齐 | ✅ | 人气表离屏实测量取 max-height |
| 48 | 全站复用收口 | ✅ | v1 方案 9 项全落地（yj-util/race-rows/PLACE_BG/徽章 CSS/`.yj-g*` 移出 @layer） |
| 49 | 人气页签升序 + 基准行中性灰 | ✅ | parseInt 升序 + 基准行改中性灰 |
| 50 | 倾向矩阵新增「母父」维 | ✅ | derive 点 merge_basic.py damsire_of，页签序 11 维定稿 |
| 51 | 赛事名恒单行缩字号 | ✅ | `.tl-racename` nowrap + 0.5px 步进降字号，等级尾缀改徽章 |
| 52 | 侧边栏「日期图」→「日期统计」 | ✅ | 菜单 + title/H1 一并改 |
| 53 | 比赛记录表收口 | ✅ | `race-rows.js` 列定义驱动（BASE_COLS + VIEWS 显隐），字段基准化 |
| 54/55 | 数据概览 S9 色带 | ✅ | 三率并入主卡 → 定稿「晨雾光晕」渐变描边色带（`.yj-ov-*`） |
| 56 | 筛选改搜索下拉 | ✅ | 人气/母父/骑手/调教师走 selector `items` 模式，原生 select 退场 |
| 57 | 海外马两项修正 | ✅ | 马名语言按内容判定 + `性別_当前` 派生单一出处 |
| 58 | 数据门禁修复 | ✅ | verify_stats/verify_drill 断言回绿，`--check` 五步全绿 |
| 59 | SP 页性齢拆列 | 🚧 | `性`+`年齢` 入库，存量 276 文件待 `--force` 回填 |
| 60 | 通算战绩收口 | ✅ | `通算成績_逐场` 由 races 全量推导，check 同口径对账 |
| 61 | 未出走不算通算 | ✅ | 取消/除外不计出走，日期统计页 `isNR()` |
| 62 | 跨标签页串扰修复 | ✅ | bus 联动 localStorage → sessionStorage 隔离 |
| 63 | 周口径跨月补邻月日 | ✅ | 月网格首尾真实邻月日期（`.dc-outm`） |
| 64 | 马名口径收口 | ✅ | `fallbackName()`（母名の生年）+ `mainName()` 剥生产国尾缀 |
| 65 | 通算战绩五段 →（§76 四段） | ✅ | 括号五段 [出走-1-2-3-着外]（后经 §76 瘦身为四段） |
| 66 | 字体方案 b | ✅ | 101 片 → 构建期按需全量子集 1 片 589KB |
| 67 | 编辑台定稿换皮 | ✅ | 三栏壳 + `.yj-ed-*` 28 类进 theme.css |
| 68 | 阶段 5 动效门禁结案 | ✅ | 像素差异为字体子集光栅双稳态，非动效问题 |
| 69 | 6b 前端收口 | ✅ | races 同键行序 `raceTieCmp` + nameToggleHTML 单一出处 |
| 70 | 动效 + 呈现层回滚 | ✅ | 动效/骨架屏/边到边/分批**全部撤销**（用户拍板），保留缓存/图片 lazy |
| 71 | 复审收尾修正 | ✅ | editor.js 补 clearBasicCache、edit_server Host 校验、.gitignore 补 _tmp |
| 72 | 数据层提速 | ✅ | races 压缩包（1 请求 44KB）+ 全站统一缓存控制器 yj-cache |
| 73 | favicon 补齐 | ✅ | favicon.svg + apple-touch-icon.png，8 页 head 注入 |
| 74 | 文案更名「云崽档案」+「航迹线」 | ✅ | 侧边栏 + title/H1 一一对应 |
| 75 | 措辞「年产」→「年世代」 | ✅ | 纯措辞，聚合键零变化 |
| 76 | 通算战绩五段 → 四段 | ✅ | 去首段出走，括号直接复用 PLACE_BG |
| 77 | 筛选下拉加宽 + 体重补零 | ✅ | `.f-csel` width 238px + WEIGHT_BINS 补零 |
| 78 | 性齢列 | ✅ | BASE_COLS 21→22 列，mb 性齢槽；78.1 明细/内嵌也展示 |
| 79 | 统计页移除注记文案 | ✅ | 删 renderGraded 尾注 span |
| 80 | 跳转语义统一 | ✅ | 「下钻」改「跳转」+ 新标签页 + 赛事名链接（SP 页中央/地方分流） |
| 81 | 编辑台大改版 | ✅ | 双形态 + 草稿箱 + 一次性提交 + edit-timeline 拆分 |
| 82 | 编辑台 B 稿定稿 | ✅ | 「常开工作表」定稿，82.1~82.23 全部落地（详见 §82） |
| 83 | 编辑入口全站收敛 | ✅ | 所有直跳编辑页入口默认不进视野，唯一开关 URL `?edit=1` |
| 84 | 钉住标记（📌）移除 | ✅ | 行尾 📌 机制整块删除，浏览页零直跳编辑入口 |
| 85 | 侧栏页脚访问统计（不蒜子） | ✅ | 只统计线上 `www.yunji.xyz`（本地/其它域不加载），页脚回填站点 PV/UV |

---

## 2. 模块最终决策摘要

### §3 · 搜索栏（智能单框）
- **最终落地**：`pages/selector.js`（组件主体）+ `pages/profile.html`（`YJ.selector.init`）。
- **最终状态**：✅ 封版。
- **关键结论**：单框一次匹配 8 类字段（4 名字 + 母名/马主/调教师/生产牧场 + id）；下拉彩色名字色块（青绿=日文/蓝=英文/橙=港译/紫=自译）+ 性别徽章 + 计数徽章；选中回填主名、再点清空重搜。

### §4 · 字体（全局排版）
- **最终落地**：`pages/theme.css`（body 栈）+ `pages/fonts/`（noto-sc 101 子集 + geist-latin）。
- **最终状态**：✅ 用户拍板封版（后被 §66 改为构建期按需子集）。
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

### §21 · 待决策 · 仓库根 index.html 跳转
- **最终落地**：未实施（拟定 `<meta http-equiv="refresh">` 方案）。
- **最终状态**：📌 等待用户决策。

### §22 · 赛事名去冗余等级尾缀
- **最终落地**：`pages/races.html`（`raceNameText()`，6 处渲染 + 1 处量尺）。
- **最终状态**：✅ 已合并。
- **关键结论**：只剥有徽章代劳的 5 类尾缀（GI/GII/GIII/L/OP/Jpn*），`(1勝クラス)` 等无徽章尾缀保留。

### §23/§26 · 宽屏列宽 v6/v7
- **最终落地**：`pages/races.html`（`libLayout/fs` + `fill()` 三阶段注水 + `TIER_CAP` 档位表 + canvas 粗排/DOM 精量）。
- **最终状态**：✅ 已合并。
- **关键结论**：留白三阶段加权注水（弹性文本 2.0× → 数字 1.5× → 全表均分）；表内留白 >40% 自动升档；v7 注水上限随档位（档位越高赛事名越收、数字列越放）；调参指引见原 §23.7/§26.6。

### §24 · 等级徽章 L/OP 不可见修复
- **最终落地**：`pages/races.html`（`G` 取值统一小写）。
- **最终状态**：✅ 已修复。
- **关键结论**：class 选择器区分大小写，`"L":"gL"` 对 `.yj-gl` 永远不命中。

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

### §59 · SP 页性齢拆列
- **最终落地**：`scripts/races/` 解析 SP 页拆 `性`+`年齢` 入库（`RACE_RECORD_ORDER` 模板更新）。
- **最终状态**：🚧 进行中（存量 276 文件待 `--force` 回填 ≈34 分钟，需用户点头）。
- **关键结论**：`セン` 归一为 `セ`。

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

### §67 · 编辑台定稿换皮
- **最终落地**：`pages/edit.html`（三栏壳）+ `.yj-ed-*` 28 个类进 theme.css + 文案常规化。
- **最终状态**：✅ 已完成。
- **关键结论**：功能逻辑一行不许坏（只动皮与词）；编辑页不得影响浏览页。

### §68 · 阶段 5 动效门禁结案
- **最终落地**：站点代码一行未改；临时「假修法」回滚。
- **最终状态**：✅ 方法论结案。
- **关键结论**：像素差异是字体子集决定的光栅路径双稳态，非动效破的；门禁改「同构建内 off-vs-on」比。

### §69 · 6b 前端收口
- **最终落地**：`raceCmp` 同键后接 `raceTieCmp`（着顺→race_id→馬番→馬名）；`race-rows.js` 加 `nameToggleHTML`；删死别名。
- **最终状态**：✅ 已完成。
- **关键结论**：同键组 135 个/298 行改序是目的非事故；全排列测试证明行序唯一。

### §70 · 动效 + 呈现层回滚
- **最终落地**：A1~A5 动效、B1 骨架屏、B2 边到边、B5 分批**全部撤销**；保留 B3 共享缓存/B4 图片 lazy/B6 minify/§69 tie-break。
- **最终状态**：✅ 用户拍板「动效全不要」，已回滚。
- **关键结论**：回滚不能用整文件 checkout（避免炸掉 tie-break/编辑台/字体子集）；全站回到「一次性渲染 + 写死加载文案」。

### §71 · 复审收尾修正
- **最终落地**：`editor.js`（`clearBasicCache`）、`edit_server.py`（Host 校验/CORS 收紧）、`.gitignore`（补 `data/_tmp/`）。
- **最终状态**：✅ 已完成。

### §72 · 数据层提速（races 压缩包 + 统一缓存）
- **最终落地**：`front/public/race-bundle.js`（`YJ.raceBundle.pack/decode`）+ `front/scripts/build-races-bundle.mjs`（build 期替换式）+ `front/public/yj-cache.js`（`YJ.cache`，六产物 12h TTL + SWR）。
- **最终状态**：✅ 已完成。
- **关键结论**：276 请求→1 请求 44KB gzip；数据全站走统一缓存控制器；`manual_overrides.json` 保持 no-store。

### §73 · favicon 补齐
- **最终落地**：`front/public/favicon.svg` + `apple-touch-icon.png`（180×180）；8 页 head 注入。
- **最终状态**：✅ 已完成。
- **关键结论**：iOS 不认 SVG → 另出满幅方角 PNG（预圆角会渲成黑角）。

### §74 · 文案更名「云崽档案」+「航迹线」
- **最终落地**：`index.html`（title/横幅/侧栏图标）+ `timeline.html`（更名「航迹线」）。
- **最终状态**：✅ 已完成。
- **关键结论**：改名按 §52「侧栏 + title/H1 一一对应」，数据产物/功能名不改。

### §75 · 措辞「年产」→「年世代」
- **最终落地**：`stats.html` 7 处 + `build_timeline.py` 标签 + `timeline.json` 重算。
- **最终状态**：✅ 已完成。
- **关键结论**：纯措辞改动，聚合键/逻辑零变化。

### §77 · 筛选下拉加宽 + 体重补零
- **最终落地**：`races.html`（`.f-csel` width 238px + `WEIGHT_BINS` 补零）。
- **最终状态**：✅ 已完成。
- **关键结论**：必须显式 `width` 而非 flex-basis（Chromium 忽略嵌套 flex 项 basis）。

### §78 · 性齢列
- **最终落地**：`race-rows.js`（`BASE_COLS` 21→22 列，`sexage` 紧随馬名）+ theme.css（`.yj-mb-sexage`）；78.1 profile 下段/datechart 明细也展示（`build_datechart.py` runs[] 增 `sx/ya`）。
- **最终状态**：✅ 已完成。
- **关键结论**：全部走共享模块基准，页面零列清单改动。

### §79 · 统计页移除注记文案
- **最终落地**：`stats.html` 删 `renderGraded()` 尾注 span。
- **最终状态**：✅ 已完成。

### §80 · 跳转语义统一
- **最终落地**：stats 8 处文案 + `window.open(_blank)` + `race-rows.js`（`raceLink()`）+ `build_datechart.py`（runs[] 增 `rid`）。
- **最终状态**：✅ 已完成。
- **关键结论**：赛事名链接三分流——中央 `race.netkeiba.com` / 地方 `nar.netkeiba.com` / 海外字母 id 兜底 db；无 race_id 不出链接。

### §81 · 编辑台大改版（双形态 + 草稿箱 + 一次性提交）
- **最终落地**：`front/public/editor.js`（`local`/`draft` 双形态 + 草稿箱 + GitHub writer 单原子 commit）+ `pages/edit.html` + 新 `pages/edit-timeline.html` + `deploy.yml`（+setup-python）。
- **最终状态**：✅ 已完成（未 commit；线上链路待用户实测）。
- **关键结论**：线上直接编辑走「草稿箱存浏览器本地 + 一次性提交」；预览=新标签叠加真实资料页。

### §82 · 编辑台 B 稿定稿（常开工作表）
- **最终落地**：三稿竞稿 → 用户先选 A 后**改选 B**；`edit.html`/`edit-timeline.html` 重写为单列 max-w-880px 常开直改工作表。
- **最终状态**：✅ 已完成（82.1~82.23 全部落地）。
- **关键结论**：B 稿「字段常开直改 + 青绿描边 + 恢复官方值常驻」定稿；时间线编辑台只管人工节点、双入口（引用比赛浅引用 + 自填荣誉）。

#### §82 子节摘要（均为最终决策）
- **82.1** 需求与竞稿：三稿竞稿，用户改选 B；时间线数据模型定稿（编辑台只管人工节点）。✅
- **82.2** B 稿落地：速选下拉/保存条视口固定/「改」圆徽；选马来源改直读 basic.json 卸载 selector；时间线引用比赛=浅引用（复用 races-bundle 解码）。✅
- **82.3** 门禁与状态：构建/冒烟全绿；候选稿三件套留对照。✅
- **82.4** 追加：本机直连下线（恒为草稿箱模式）、selector 检索回归（compact 组件）、文案减负。✅
- **82.5** 追加：「改」角标作用域收窄后**整个删除**（待保存由 chip+青绿描边承担）。✅
- **82.6** 追加：登録状態 瓦片改回下拉（五字段控件形态统一）。✅
- **82.7** 修复：上传本地图片 TypeError（photoSrc 引用错位 + uploadOne 漏写缓存）。✅
- **82.8** 修复：外链被 CORS 拒（fetchRemote 三级抓取，最后 weserv.nl 公共代理）。✅
- **82.9** 新规则：比赛人工配图 `data/races_manual.json`（race_id→photo）；build_timeline 按 race_id 查表。✅
- **82.10** 追加：时间线 STEP1 原生 select 全换 selector.js compact 搜索组件。✅
- **82.11** 追加：选马下拉开双名显示（三处 `doubleName:true`）。✅
- **82.12** 追加：STEP 下拉规格统一（`SEL_CMP` 紧凑规格，宽 380px）。✅
- **82.13** 追加：mb 端不开放编辑台（三处入口 `max-md:hidden`；窄屏显「请在电脑端使用」）。✅
- **82.14** 删除 `scripts/edit_server.py` + 跳转带回侧边栏（草稿箱为唯一落盘链；外壳支持 `?page=` 直达）。✅
- **82.15** 修复：「连接/设置」点了没反应（`state.gh.msg` 判空）。✅
- **82.16** 临时：压缩管线离线复刻预览（`tests/photo-pipeline-preview/run.mjs`，跑完即弃）。✅（临时任务）
- **82.17** 图片正式本地化入库：马142 切 `142-3/142-4.webp`、马40 撤外链改 `40-1.webp`；经 manual_overrides 钉 photo 数组。✅
- **82.18** 修复：删图后老访客 404 → 缓存桶 `yj-data-v1→v2` 整体作废；沉淀硬规「删被引数据文件必须同轮 bump 桶」。✅
- **82.19** 详情照片区去掉 📌 钉住标记（`avatarHTML()` 删 photo 分支 pinMark）。✅
- **82.20** 编辑台抽屉「已保存」段折叠 + 马名检索（`#savedQ` 大小写不敏感过滤）。✅
- **82.21** 修比赛配图草稿「下标当键」：STEP2 键改真 race_id（台账场禁用）；草稿条目可读标签可点击跳回。✅
- **82.22** 台账场（无 race_id）也可配图：`races_manual` 虚拟键 `@马id@日付`（`rmKeyOf` 单一出处）。✅
- **82.23** 时间线照片 `/pages/data/…` 404：photo 路径口径定稿 = **页相对 `../data/…` 或外链 URL**，`first_photo()` 补 `../` 前缀。✅

### §83 · 编辑入口全站收敛（`?edit=1` 单一开关）
- **最终落地**：`pages/timeline.html`（「编辑 ↗」加 `hidden` + `#editEntry`，仅带参时 `classList.remove`）+ `pages/profile.html`（`EDIT_MODE` 门控草稿条里的「回编辑台 ↗」）+ `index.html`（`EDIT_MODE`/`withEdit()` 把 `edit=1` **透传进 iframe**：`?page=` 直达、默认页 profile、侧栏换页三处）。
- **最终状态**：✅ 已完成（真 HTTP + headless Chrome 宽视口逐项对照，5 场景全绿）。
- **关键结论**：直跳编辑页的入口默认一律不进视野——外壳「编辑」导航组（既有约定）+ 时间线页内「编辑 ↗」+ profile「回编辑台 ↗」三处共用**同一个开关**：URL 带 `?edit=1`（拼在外壳上即可全站生效，外壳负责透传；也可直接拼在内容页 URL 上）。窄屏仍按 §82.13 由 `max-md:hidden` 隐藏。**验证方法沉淀**：必须走 HTTP + 宽视口——`file://` 下的嵌套 iframe 不加载 CSS（类名隐藏失效），且内容区 <768px 会触发 `max-md:hidden`，两者都会造成假阴性。

### §84 · 钉住标记（📌）整块移除
- **最终落地**：`pages/profile.html` 删 `PINS`/`PIN_ROW`/`PIN_CLS`/`pinEntry`/`pinField`/`hasPin`/`pinMark`/`loadPins`、行渲染里的 `pinMark(...)`、`currentH` 追踪变量、`[data-edit]` 点击委托（跳 `edit.html?id=`）。
- **最终状态**：✅ 已完成（构建 + HTTP 复验：行/概览/比赛记录均正常，无 📌）。
- **关键结论**：行尾 📌 用户判「丑且没必要」整块删除（§82.19 只删掉了照片区那一枚）；浏览页因此**零**直跳编辑页入口（唯一残留的「回编辑台 ↗」按 §83 门控）。顺带收益：profile 不再每次加载多拉一次 `manual_overrides.json`。**保留不动**：「草稿」徽章（未提交草稿提示）与草稿预览提示条。

### §85 · 侧栏页脚接入站点访问统计（不蒜子 · busuanzi）
- **最终落地**：`public/yj-visit.js`（**新增**：第三方统计脚本的唯一注入点 + 正式域名白名单）+ `index.html`（head 引 `yj-visit.js?v=1`；侧栏页脚「云迹 · 数据仅供分享交流」下方加 `#busuanzi_container_site_pv` / `#busuanzi_container_site_uv` 两个标签，数字位 `#busuanzi_value_site_pv` / `#busuanzi_value_site_uv`）。
- **最终状态**：✅ 已完成（构建 + dist 核对 + 真 HTTP/headless 复验：正式域名取数回填、本地不加载不显示、统计服务不可达保持隐藏）。
- **关键结论**：
  1. **计数归属 = 请求 Referer 的 host**（实测）：无 Referer 直接 `Bad Request`；同 host 不同路径共享一个 `site_pv`；`sub.example.com` 与 `example.com` 各自独立桶。**本地 `127.0.0.1`/`localhost` 是「全网本地测试者共享的桶」**（实测 100 万+，显示出来纯误导），线上每个域名（`www.yunji.xyz` / apex `yunji.xyz` / `<user>.github.io`）各自一个桶、互不相加。
  2. **门控口径（2026-09-30 用户确认）：只统计线上 `https://www.yunji.xyz/`，本地不掺进来** → `yj-visit.js` 里 `HOSTS = ['www.yunji.xyz']` 白名单，非白名单域名**连脚本都不加载**（不计数也不显示，页脚只剩文案）。要加/换域名只改这一处；**apex `yunji.xyz` 是另一个桶**，不做跳转就会出现两个域名各算一份、数字忽大忽小。
  3. **PV 口径 = 一次「打开网站」= 一次**（不存在「每页各算一次」的水分）：第三方脚本**只挂外壳** `index.html`（`dist/pages/*.html` 实测 0 处引用），iframe 内换页不重新加载外壳 → 不计；从书签直开内容页时该页无脚本、只做 `location.replace('../index.html?page=…')`（§82.13 回壳）→ 也只计 1 次。只接站点级 `site_pv`（累计打开）/`site_uv`（cookie 去重的独立访客），**不接 `page_pv`**（内容页全在 iframe 内、外壳是唯一 URL，页面级无意义）。
  4. **空占位防护沿用官方推荐做法**：容器先 `hidden`（Tailwind，等价官方 `style="display:none"`），取数成功才由脚本改成 `display:inline`；3 秒超时/离线/被拦截 → 一直隐藏，不会出现「总访问 次」。注入点放 head（第三方脚本自带 `async`），数字回填由脚本内部 `ready()` 等到 DOM 就绪，不会丢数字。
  5. **本方案只给「累计」**：不蒜子不提供「今日」维度，要今日数据得另挂百度统计一类带后台的分析（本项目未接）。线上数字从 0 起算；想让线上从某个基数开始，需到不蒜子注册登录后自行改。
  6. **入口收敛（Cloudflare 侧配置，不在本仓库）**：`yunji.xyz` → `www.yunji.xyz` 的 **301 已在 CF Redirect Rules 配好并线上实测通过**——wildcard `https://yunji.xyz/*` → `https://www.yunji.xyz/${1}`、`301`、勾 Preserve query string（`${1}` 写法：该版界面要求花括号，`$1` 会报 replacement syntax 错）；实测 `?page=pages/races.html` 直达参数与路径均保留，真浏览器从 apex 进入能落到 www 并打开目标页。**明确不做（2026-09-30 用户决定）**：http 裸域（`http://yunji.xyz` 仍返 200，匹配不上 `https://…` 规则）这一格**不跳 www、也不进统计**；其余三格（`https://yunji.xyz`、http/https 的 `www`）都正常计数。以后要补只需再加一条 `http://yunji.xyz/*` → `https://www.yunji.xyz/${1}` 的规则，**不必**开全 zone 的 Always Use HTTPS（那会连带影响该 zone 下其它子域）。
  7. **UV 实测不可靠，口径以 PV 为准**（2026-09-30 线上实测）：同一浏览器 profile 连开两次，`site_pv` 10→11 的同时 `site_uv` 也 10→11，且该 profile 的 cookie 库里**没有 busuanzi 的 cookie**（第三方 cookie 被浏览器默认拦截）→ 不蒜子的 UV 靠它自己域上的 cookie 去重，**去重失效时 UV 会趋近 PV**。故展示端「总访问」当主指标，「访客」只作参考；要精确独立访客须用第一方分析（百度统计一类）。
  8. **补救：页脚两端都显示（2026-09-30 用户确认）**。原页脚块是 `hidden md:block`，于是 **mb 端只计数、不显示**（计数脚本挂在外壳 head，与视口无关）——实测手机视口下 `script[src*=busuanzi]` 已注入、`#busuanzi_value_site_pv` 已回填 22，但 `页脚 display:none`、高度 0，且抽屉里 nav 一路延伸到抽屉底边（无页脚）。改为常显（去掉 `hidden`/`md:block`）后：桌面侧栏底部与手机 ☰ 抽屉底部显示同一块，抽屉内页脚矩形底边 == 抽屉底边；桌面像素不变。
  9. **验证法沉淀（mb 端专用）**：要看手机抽屉内的真实状态，headless 的 `--screenshot` 不够（抽屉默认关着），需 CDP：起 `--remote-debugging-port`，`Runtime.evaluate` 里 `#menuBtn.click()` 后 `Page.captureScreenshot`（本轮临时脚本 `%TEMP%\yj-visit\yj-cdp.mjs`，不入库）。**坑**：headless Chrome 窗口会被最小宽度钳到 ~492px，而 `--screenshot` 仍按请求宽度裁切 → 会造出「mb 端内容被切」的**假象**（实测 shell / iframe 的 `scrollWidth == clientWidth == 492`，**无横向溢出**）；另 `Start-Process -ArgumentList` 不会给含空格的参数加引号，`--host-resolver-rules` 这种会被拆开导致 Chrome 立刻退出——用 `&`/后台 job 启动才安全。

### §86 · 硬编码白名单收敛 + 障害重赏（JG1-3）纳入重赏口径（2026-10-01）
- **最终落地**：
  1. **海外场不设白名单**（`scripts/races/racelib.py`）：删 `OVERSEAS_VENUES`，`venue_type()` = 非中央/地方一律「海外」（原「未知」中间态取消）；台账缺 `場名` 也归海外，`fetch_ledger.py` 的 `REQUIRED` 收敛为 `日付/競走名/出走馬名/結果`。
  2. **着順非数字不设合法值白名单**（同文件 `coerce_record`）：删 `RESULT_DNF`，非数字結果一律保留原值（单字 中/取/除/失 仍经 `DNF_ABBR` 归一）；**空結果也收**（结果未出/未填），配套 `merge_races.career_from_recs` 把空結果**排除在通算计数外**（不计出走/着外）。
  3. **成绩页表头必填列最小集**（`scripts/races/fetch_races.py`）：必填仅 `日付/レース名`（缺才返回 `[]`），其余列可选（缺列→字段空，`c()` 与 `race_id/jockey_id` 解析全容错；线上实测表头 33 列无「馬名」列，马名来自 basic.json）。開催白名单未命中 → 去 R 号噪音后**原值作场名**。
  4. **毛色**（`basic/fetch_detail.py`、`races/fetch_detail.py`、`basic/fetch_pedigree.py`）：正则提全 token（漢字1-3+毛）、白名单命中优先、未收录用原值；顺带修掉旧子串扫描把「栃栗毛/鹿栗毛」截成「栗毛」的存量 bug。
  5. **徽章单表 + 障害重赏**：后端 `build_timeline.py` 的 `GLBL`/`GBADGE` 两张表合并为 **`GRADE = {格: (显示文案, 徽章类)}`**（旧名降级为派生别名），前端 `race-rows.js` 同构（`GRADE` + 派生 `G/GLABEL`，新增导出 `YJ.raceRows.GRADE`），两边补 `JGI/JGII/JGIII → JG1/JG2/JG3`（徽章类复用 `g1/g2/g3`，**不新增 CSS**）。
  6. **重赏口径全链路纳入 JG**：`timeline GRADED` / `stats+datechart TROPHY_GRADES` / 两个校验脚本的 `TROPHY_G`、`gradeKey`、`gradedKeys`、`G_SEQ`、重赏合计 / `races.html gradeMatches`+
     新单级选项 JG1-3 / `datechart.html GRADED` / `stats.html` 级别桶·下钻键·重赏步·帮助文案 / `data/SCHEMA.md` 口径定义。L/OP 仍不算重赏。
  7. **（顺带修存量缺陷）三个校验脚本的 DOM stub 补全 `location`**（`verify_stats.cjs`/`verify_datechart.cjs`/`verify_drill.cjs`）：页面 §82.13 的「独立打开=自动回壳」脚本要读 `location.search/pathname` 并调 `location.replace`，stub 只有 `{href:""}` → 页面冒烟段自 9/30 起**每次 eval 即崩**（`undefined.indexOf`），导致 `run_update.py --ci` 的断言门长期判失败（而 workflow 自己的 commit 步骤照旧提交，所以 CI 表面正常、断言实际没跑）。补全后 4 个校验脚本 112+205+60 条断言 + 三态对账全绿。
- **最终状态**：✅ 已完成。构建通过（dist 已核对：`races.html` 含 JG1-3 选项、`stats.html` 含 JG 桶、`race-rows.js` 含 `GRADE`）；`timeline/datechart/stats` 三产物重算**内容无变化**（现库无 JG 场次 → 零影响、无回归）；合成 JGI 一着穿透测试通过（级别首胜 JG1/N 胜/世代重赏首胜/统计桶 JG1/筛选命中）；4 个校验脚本全绿。
- **关键结论**：白名单只许出现在「能同时覆盖未来取值」的地方——**分类口径（中央/地方 vs 其余）用默认值，不用枚举**；枚举仅保留「归一化词表」（如 `DNF_ABBR`/`ROMANS`），命中就归一、未命中就原值透传，**绝不用枚举做准入判定**。所有消费同一口径的副本（前端筛选/统计桶/断言脚本/文档）必须同轮同步，否则会出现「时间线认、筛选页不认」的静默不一致。

### §87 · 口径词汇统一：「格」归一入口 + 芝ダ 的 障/障害 分裂修正（2026-10-01）
- **最终落地**：
  1. **`格` 归一（新增 `racelib.normalize_grade()`，入库+落库双入口）**：全角折半角（`str.maketrans` 表）→ 去空白/中点/连字符 → 罗马数字折拉丁 → 阿拉伯记法映射罗马记法：`G1-3→GI-GIII`、`JG1-3→JGI-JGIII`、`Jpn1-3→JpnI-JpnIII`（覆盖 `JG2`/`J・G2`/`ＪＧ２`/`JpnⅡ`）。调用点：`coerce_record`（台账 CSV 入库）+ `merge_races.save_races_file`（落库自愈，历史/外部来源一并修正）；未命中值原样返回，台账自由文本（Allowance）与班赛 token（1勝クラス/新馬/未勝利/オープン）不受影响。
  2. **`芝ダ` 口径统一为 `障`**（`racelib.normalize_surface()` 提为公开入口，`_normalize_surface` 兼容别名；`save_races_file` 加入落库归一）。同步 5 处错写成 `障害` 的消费端：`races.html` 跑道筛选选项值（原 `障害` 永远筛不到库里的 `障`）、`i18n.js` 芝ダ 枚举（缺 `障` 键 → 显示不出「障碍」）、`race-rows.js` `SURF_SHORT`（`障害→障` 查表落空 → 跨马表丢「障」前缀）、`verify_datechart.cjs` `SURF_SET`（缺 `障` → 一旦有障碍场次断言即挂）、`SCHEMA.md` §日期图 `s` 取值说明。
- **最终状态**：✅ 已完成。构建通过；三产物重算**内容无变化**（现库 `格`/`芝ダ` 已是规范值 → 零影响）；40 条 python 断言（归一全写法 + 台账入库 + 落库自愈）+ 14 条前端断言全过；4 个校验脚本 112+205+60 全绿。
- **关键结论**：「归一化词表」必须在**入库和落库两个口**都做——只在解析侧归一，外部直接落库的值（台账手填、历史文件、编辑台写入）就会漏；同一份数据语义在库里只能有一种写法（`障` 而非 `障害`），消费端要么读规范值，要么在字典里同时容纳两种写法，**不能只认另一种**。另：`str.translate` 只认 ordinal 键，给字符键会**静默不生效**（本次实测踩到，必须用 `str.maketrans` 构造）。

### §87 · 访问统计由不蒜子迁到 Vercount（2026-10-02）
- **最终落地**：`public/yj-visit.js`（只改注入的 `s.src` → `https://cn.vercount.one/js`）+ `index.html`（引 `yj-visit.js?v=2` 绕缓存；页脚两个 `span` 与 id **零改动**——Vercount 兼容同一套 `busuanzi_container_*`/`busuanzi_value_*`，且额外认 `vercount_*`）。
- **最终状态**：✅ 已完成（构建 + dist 核对 + 真实 Chrome/CDP 线上复验：数字回填、容器由 hidden 转 inline）。
- **关键结论**：
  1. **迁移动因：不蒜子服务端故障，不是本站代码问题**。2026-10-02 实测（Node/OpenSSL 通路，对照 `cn.bing.com` 447ms 正常）：取数 API `https://busuanzi.ibruce.info/busuanzi` 返回 **`502 Bad Gateway`**（另两次 24s/30s 超时），静态脚本本体 `busuanzi.pure.mini.js` 时好时坏（621ms 成功 / 24s 超时）。社区同步佐证：linux.do「不蒜子好像挂了两天了」「又又又挂了，不想忍了」。**区分**：同期 headless Chrome 实测 CF beacon（`static.cloudflareinsights.com`）返回 200/30KB，故 `index:159` 那条 `ERR_SSL_PROTOCOL_ERROR` 在本机属**偶发**、与页脚缺数字**不同源**，不要把两件事混为一谈。
  2. **诊断法沉淀（本轮新增，可复用）**：判定「页脚数字没了」这类问题必须**分层**——① 用 CDP 看 `#busuanzi_container_site_pv` 的 `display` 与 `#busuanzi_value_site_pv` 文本；② 看 `document.querySelector('script[src*="busuanzi"]')` 是否注入（验证白名单与门控）；③ **单独**探测取数端点本身。本轮 ①② 全绿、③ 502 → 一步定位服务端，避免误改前端。**坑**：本机 `curl.exe`（Schannel）报 `SEC_E_NO_CREDENTIALS`、PS 5.1 `Invoke-WebRequest` 拿不到 HTTPS 响应头，但 **Node（OpenSSL）TLS 正常**——探针一律走 Node，别用 curl 下结论。（另：PS 5.1 无 `-SkipHttpErrorCheck`，`-MaximumRedirection` 亦需 7.0+；`Start-Process -ArgumentList` 启动 headless Chrome 需 `--user-data-dir`，沿用 §85 第 9 条。）
  3. **Vercount 的两处行为优于不蒜子**：① 用 **POST + `window.location.href`**（不依赖 Referer），故**直接访问也能计数**，没有不蒜子「无 Referer 直接 Bad Request」的毛病；② 取数成功会写 **localStorage 缓存**，API 失败时用上次成功的值续显，比「失败即隐藏」更稳。**已实测** CORS：`access-control-allow-origin: *`、预检 `OPTIONS` 放行 `Content-Type`，POST 返回 `{"status":"success","data":{"site_uv":1,"site_pv":1,"page_pv":1}}`。
  4. **门控口径不变**：`HOSTS = ['www.yunji.xyz']` 白名单保留（本地/`file://`/`*.github.io` 连脚本都不加载）；apex → www 的 CF 301 已在 §85 第 6 条配好，四个入口都落 www。**代价**：Vercount 是独立服务，累计数字**从 0 重新起算**（不蒜子里那份旧数字仍存于其服务端，若其恢复可查）。
  5. **仍未解决（已知局限）**：不提供「今日/近 7 天」维度；UV 仍为 cookie 去重近似值（Vercount 为 `max-age=31536000; samesite=lax`，比不蒜子的第三方 cookie 可靠），要精确独立访客仍须第一方分析。

### §88 · 修复「下钻新开标签页却停在首页」：?page= 扩展名归一 + `..` 校验归位（2026-10-02）
- **最终落地**：`index.html` 外壳 `?page=` 解析块（1 处）：① 扩展名归一——`pn = u.pathname` 不以 `.html` 结尾则补上，再进校验与赋 src（不动 `u.search`）；② `..` 检查从「`u.pathname` 归一后」改为「`wantPage` 原始串」的路径段正则 `/(^|[\/\\])\.\.($|[\/\\?])/`。
- **最终状态**：✅ 已完成（构建 + dist 核对 + 真浏览器 7 用例全绿：①用户原 URL 修复、②③④回归、⑤非法域名仍拒、⑥`..` 现在被拒、⑦query 内合法 `..` 未误伤）。
- **关键结论**：
  1. **根因是托管平台的扩展名重定向**：线上 `/pages/races.html` 返回 **301/307 → `/pages/races`**（实测 GitHub Pages 与 CF Pages 均如此）。于是内容页**独立打开**时 `location.pathname` 已无 `.html`，8 个内容页共用的回壳脚本（`location.pathname.split("/").slice(-2).join("/") + location.search`）算出 `rel = "pages/races?f=…"`，被外壳旧的 `/\.html$/` 校验**拒绝** → `wantSet` 保持 false → iframe 停在默认 profile。**表现为「新开标签页却停在首页」**，而地址栏里的 `page` 参数恰好缺 `.html`（那不是浏览器显示问题，是平台剥的）。**影响面不止下钻**：任何内容页被独立打开（分享单页链接、刷新内容页）都走这条路。
  2. **诊断法教训：本地静态服务器复现不出这类 bug**。`python -m http.server` 不做扩展名规范化，`/pages/races.html` 直接 200，于是本地全绿、线上全红。**凡涉及 URL 形态的问题，必须打真实托管域名验证**（本轮先用 Node 跟随 307 链发现 `/pages/races` 是 200 且 title 正常，才定位到回壳产物）。反向亦然：本地测「无扩展名直开」会 404，那是**测试环境差异**、不是缺陷。
  3. **旧 `..` 校验是空操作**：`new URL()` 已把 `../` 规范化掉，对 `u.pathname` 判 `".."` 永远不命中（实测 `pages/../pages/races.html` 被照常接受）。改为对**原始串**按路径段匹配后，该形态被正确拒绝；用 `(^|[/\\])\.\.($|[/\\?])` 而非裸 `indexOf("..")`，才不会误伤 query 里合法的 `..`（如 `f=venue:..`）——**安全校验要不误伤合法值，只能按结构匹配，不能按子串匹配**。
  4. **顺带澄清一处易误判**：下钻链接的 `data-href` 是裸相对路径 `races.html?f=…`，本轮实测 `window.open` 从 iframe 内调用时**按 iframe 的 baseURI 解析**（`/pages/stats.html` → `/pages/races.html`），故该写法本身正确、与既有 `raceLink()` 的 `profile.html?horse=` 同构；**若将来改由外壳读 `data-href` 导航，必须换成 `pages/races.html` 全路径**（相对基址不同 → 会落到站点根 `/races.html` 404）。此隐患本轮未改（无调用方），仅记录。



