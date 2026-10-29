# 云迹 · UI 优化记录文档

> 本文档记录「云迹」前端各模块 UI 优化的**最终方案**与**当前成果**（按最新状态收口；历史背景/废案/反复迭代过程不展开）。
> 约定：每改一个模块，先把该模块的最终思路与成果写进本文档，再合并进正式页面（`front/` 源码 → `npm run build` → `dist/` 验证）。
> 配套：`docs/HANDOFF.md`（交接/规范）、根 `README.md`（项目介绍）、`docs/SCHEMA.md`（数据契约）。

## ★ 全站编码约定 · 复用抽离（§48 定稿，此后一切前端编码必须遵守）

1. **公共工具单一出处**：HTML 转义等页面级工具放 `public/yj-util.js`（`YJ.util.*`），页面只写薄别名 `var esc = YJ.util.esc`，**禁止再复制函数体**；共享模块保持零依赖可独立单测的，内部实现可自包含（如 race-rows 的 esc），但语义必须两处一致。
2. **业务语义组件单一出处**：比赛行/徽章/格式化（`gradeBadge/placeBadge/ninki*/GRADE（含派生 G/GLABEL）/weightOf/venueR…`）一律复用 `public/race-rows.js`，新页面直接引入，禁止本地重写映射表或徽章 HTML。
3. **数据语义色单一出处**：着顺浅色三件套（1/2/3着+着外）JS 侧 = `race-rows.js` 的 `PLACE_BG`，CSS 侧 = theme.css `.yj-nkm*`，两处互指注释、**改色必须同步**；新增数据语义色先找单一出处再写。
4. **组件样式进 theme.css**：≥3 页共用或全站统一的样式 → `@layer components` 用 `@apply` 封装（如 `.page-title`/`.sec-title`）；**但类名靠 JS 动态拼接、content 里没有字面量的类（如 `.yj-g*`），必须放在 @layer 之外**——Tailwind 会按 content 候选裁剪 @layer 内规则。
5. **收录门槛（防为了复用而复用）**：抽离前先 grep 查重复——**全站统一的数据语义，或 ≥3 处使用**才收口；仅 2 处且行为有分叉的明确不动（反例：`.seg`/`manYen`/`#page.embed` 等）。追补（2026-xx 用户决策）：凡 **2~3 处使用但高度相似**的代码，一律先归档进 `docs/重复代码审计.md` 再统一处理；其中 `.seg`（统一 32px 规范值）与 `manYen`（`YJ.util.manYen(pr, empty)` 参数化）**已经用户确认分叉非刻意后收口**（见该文档 F1.8/F1.9），其余分叉项（如 `#page.embed`）保持不动。
6. **零影响红线与验证清单**：复用收口只做等值搬移/纯删除；改完必跑 `npm run build` + 核对 dist（theme css 新类在、旧类无、`dist/data/basic.json` 存在——`COPY_DATA=skip` 与 `emptyOutDir` 叠加会清掉 data）。
7. **版本戳已自动化，禁止手工 `?v=N`（2026-xx 定稿，取代本条旧规）**：非 module 公共脚本统一由构建期插件
   `vite.config.js` 的 `auto-version` 自动打**内容哈希戳** `?v=<sha1 前 10 位>`（dev/build 通用）。内容不变 →
   URL 不变 → 缓存命中；内容一变 → 哈希变 → 浏览器自动换新。**页面源码一律不写 `?v=`，禁止手改哈希**；
   改 `public/x.js` 后**无需再 grep 全站 +1**。特殊：`site-config.js` 是构建期产物，按生成内容哈希（配置变化自动换）；
   `data-config.js`/`device.js` 等原无戳文件同样自动覆盖；外链脚本不参与。

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
| 86 | 编辑台照片提交孤儿图修复 | ✅ | photo 条目写入脱离 d.ov 循环，纯传照片也能正确提交（§89） |
| 87 | 访问统计双线：Vercount 计数 + GoatCounter 展示 | ✅ | 页脚数字改 GoatCounter 公开端点回填并即后台链接；Vercount 保留计数不展示（§97） |

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
- **按语（2026-10-09）**：等级徽章类名后更名 —— `.yj-gl/.yj-gop` → `.yj-listed/.yj-open`（L=Listed/OP=Open 全名，防被误读为格名；见 `config/grade-table.json` 的 `about` 键与 `docs/REFACTOR.md` §12）。本条为历史日志，保留当时类名。

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
     新单级选项 JG1-3 / `datechart.html GRADED` / `stats.html` 级别桶·下钻键·重赏步·帮助文案 / `docs/SCHEMA.md` 口径定义。L/OP 仍不算重赏。
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

### §89 · 修复「只传照片不写 photo 条目」：编辑台提交孤儿图（2026-10-08）
- **现象**：提交 `715e836`（编辑台草稿一次性提交）显示「0 匹人工值 · 1 匹图片」→ 图片文件 `data/photos/66-1.webp` 入库，但 `manual_overrides.json` **没有** 66 的 photo 条目 → 乘天风（id 66）页面显示 🐎 占位。
- **根因**：`editor.js` 批量提交组装里，photo 条目写入（`ent.photo = committed[id]`）**嵌套在 `d.ov`（人工字段草稿）的循环内**。只传照片、不存任何人工字段的马不进该循环 → 图片文件走 `uploads` 通道成功入库，但 photo 条目永不写入人工表。commit message 的「N 匹图片」统计的是**文件数**，与人工表条目数不同步，极具迷惑性。
- **最终落地**：`front/public/editor.js` 提交组装函数——把 `d.ph`（照片草稿）处理拆成**独立循环**，`mode === "set"`/`"remove"` 的马**无条件**写/删 `photo` 条目（含 `_orig` 官方值快照与 `hasPin` 判定，与人工字段循环同口径），与上传通道对齐；同一匹马 ov+ph 并存时顺序为 ov 先、ph 后叠加，结果与旧行为一致。
- **数据侧补救**：`data/manual_overrides.json` 补 `"66": {"photo": ["data/photos/66-1.webp"], "_note": "…"}`，`merge_races.py`（离线、幂等）套用 → `basic.json` id 66 photo 生效（diff 仅 6 行），重建 dist 后线上可显示。
- **验证**：`node --check` 语法通过；`npm run build` + dist 核对（`dist/editor.js` 含独立循环）；`dist/data/basic.json` id 66 `photo=data/photos/66-1.webp`；HTTP `/dist/data/photos/66-1.webp` 200。
- **教训**：**「文件入库」≠「关联入库」**——编辑台三条通道（马图/比赛图/时间线图）都是「blob 上传 + 表条目」两段式，任何一段漏了都会产生孤儿（此前 `:540` 修的是**文件缺失**方向，本轮修的是**条目缺失**方向）。以后改提交流程，先检查「文件」与「条目」成对。

### §90 · 编辑台 v3「工作台」改版：分组导航 + 状态沉默化（2026-10-13）
- **动因**：用户对两个编辑页（基本信息 / 航迹线）「都很不满意」，点名参考网上成熟做法、要**简约直观**（附参考截图 = 专业 GIS/航线工具的右键「编辑」分组菜单：组标题 + 图标条目 + 当前项/禁用态的状态语言）。
- **最终落地**（`front/pages/edit.html` + `edit-timeline.html` 壳重写、`theme.css` 编辑台块重排、`editor.js` 渲染层同步；**逻辑/事件委托/data-\* 钩子零改动**，脚本 bump `editor.js?v=11`）：
  1. **页首「编辑」分段导航**（参考图「编辑」分组的直译）：✎ 基本信息 / ⌇ 航迹线 两个条目（内联 SVG 线条图标 + 文字），当前项 `aria-current="page"` 白底浮起（`.yj-ed-tabs/.yj-ed-tab`，壳层静态）。替代旧 timeline 报头的「‹ 回马匹编辑」孤链接。
  2. **状态沉默化（v3 核心约定）**：「与官方一致」不再亮牌（行尾常驻灰 chip 整体删除）——**沉默 = 官方**；仅「已保存」（浅青底 + 青绿 chip）与「待保存/草稿」（橙底 + 橙 chip）两态发声。全表 6 枚常驻徽章 → 0 枚，异常态反而更显眼。
  3. **行标签主次重排**：中文标签 13px medium 为主 + 日文字段名 10px 灰次级（`.yj-ed-row-k/.yj-ed-row-sub`），替代旧「日文大写在上 + 中文小字在下」的双重平权标签；备注行同步（备注 / _note）。
  4. **控件减重**：`.yj-ed-in` 38px semibold → 36px medium、focus ring primary/15；photo 列 268→280px。
  5. **航迹线空态入口卡（signature）**：空态 = 「引用比赛 / 自填荣誉」两张邀请卡（`.yj-ed-card`：图标 + 标题 + 一句说明），替代旧虚线框一句话提示；工具条保留同款入口；有节点后列表盒装化（rounded 容器 + 行 hover）。
  6. **节点编辑表单 = 青绿描边卡**：本页唯一「进行中」区域与列表/工具条视觉分离；STEP 措辞简化为「选马 / 选比赛」；表单头契约提示缩短。
  7. **保存条减负**：删独立 `#count` span（计数机制本就并入「草稿箱 · N」按钮文字）；模式点 `.yj-ed-chipdot`；「放弃修改」ghost 化。
  8. **theme.css 收敛**：删无引用旧类 `.yj-ed-mast/.yj-ed-seg5*/.yj-ed-tile*/.yj-ed-official*/.yj-ed-row-v/.yj-ed-row-acts/.yj-ed-rowedit`；新增 `.yj-ed-tabs/.yj-ed-tab/.yj-ed-row-sub/.yj-ed-card(-ico)/.yj-ed-chipdot`；全部类名仍以完整字面量出现在 pages html / public editor.js（content 覆盖，@layer 不裁）。不新增 hex，语义色沿用 primary/chart3/accent/muted/destructive。
- **验证**：`node --check` 通过；构建通过（races-bundle 对账 276 马 · 782 条）；dist 核对（theme-*.css 含全部新类、`.yj-ed-tile`/`.yj-ed-official` 已消失；dist/editor.js 含 `yj-ed-card`）；headless Chrome 截图四态全绿——基本信息 idle、基本信息「草稿 + 已保存」混合态（橙/青两态 + 恢复官方值按钮 + 草稿箱 · 1 计数）、航迹线空态双卡、航迹线「2 节点列表 + 自填荣誉表单展开」。
- **关键结论**：编辑台的「直观」来自**状态语言的克制**——默认全部沉默，只有偏离官方值的两态才发声（对应参考图「禁用项才置灰、其余不解释」的专业工具惯例）；页面间的「直观」来自**常驻分组导航**而非页内回跳链接；空态要当**入口**设计（图标 + 标题 + 说明），不当「没数据」的报错设计。gen-font 本地产物与 CI 字节级漂移再次出现（同 §前轮），`git restore` 回 CI 版即可，属构建噪音非回归。

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

### §104 · 编辑台 · 批量表格「键盘电子表格流」（基本信息 + 比赛记录 批量增删改，2026-10-24）
- **动因**：用户要求「基本信息和比赛都能通过类似 Excel 的表格形式批量新增、修改、删除」。出 A（键盘电子表格流）/B（批量选择流）/C（变更台账流）三个候选原型对比（`tests/_trash/edit-table-cand/` 归档，截图 `tests/_shots/et-*`），用户拍板 **A 案**：整页密表 + 单元格就地编辑 + Enter↓/Tab→/方向键 + Ctrl+Z·Y 撤销重做 + 行首勾选批量删除。
- **定稿结构**：新页 `front/pages/edit-table.html`（编辑导航第 2 项「批量表格」，电脑端专用）+ 新共享模块 `front/public/editor-table.js`（表格引擎）；编辑链路全部复用 `editor.js`——草稿箱、GitHub 连接、一次性原子提交、`_orig` 快照、报告语言零改动。三候选均真实数据验证过（277 匹 / 818 条），A 转正后 B/C 归档废案。
- **编辑范围（口径）**：
  - **基本信息页签**：可改字段 = 编辑台字段白名单（`editor.js::FIELDS` 单一出处，14 字段）+ photo；馬名/派生列/技术键只读。**增删行不开放**——建档/移除走抓取管线（JBIS 白名单注册表），人工表管不了（与 §94 口径一致）。
  - **比赛记录页签**：增/删/改全开放。日付/场名/赛事名等为场次级字段（同组多驹联动改），出走马名/人気/タイム等为马级字段；删除行 = 删该驹该场记录；新增行 馬名 从档案马名 datalist 解析出 id，匹配不到则该行不进草稿（防脏数据）。
- **落库契约（新增白名单 4）**：`data/races_edits.json`（`{del:[{id,race_id,日付,馬名}], mod:[{…,set:{字段:值|null}}], add:[{…全字段记录, 來源:"人工"}]}`，id=马 id；匹配键 = `record_keys` 对称双键）——**merge_races 每轮 fetch 合并后、派生前重新套用**（del/mod 不烙死在文件里，重抓回来会被再删/再改），套用在派生前 → 収得/通算/主勝鞍/性別_当前 自动跟随。契约 = `docs/SCHEMA.md` §9。
- **草稿模型**：基本信息批量编辑直写草稿箱 `d.ov`（与编辑台同契约：值=钉住、null=恢复官方值、空值且无钉=不产生条目）；比赛编辑进新草稿段 `d.rc`（同上三段），提交时叠加远端 `races_edits.json`（同组键覆盖、del 连带清 mod、重建行自动撤 del、add 双键去重）。撤销/重做 = 内存日志逐条回滚并同步草稿箱；「放弃修改」按会话快照只回滚本页产生的改动（不碰其它页面的草稿）。
- **关键结论**：批量表格不另起提交链路——**它就是编辑台的第 4 个入口**，草稿箱/提交/PAT/报告全共享；后端只加一个「编辑表套用」纯函数步骤。Excel 交互（键盘流 + 粘贴导入 TSV + 导出 TSV + 列显隐）负责输入效率，数据一致性交还给既有 merge/派生管线。
- **验证（2026-10-24）**：`npm run build` 通过（edit-table.html 8.42kB 入包；bundle 818 条 round-trip 对账过）；`theme-*.css` 新类 13/13 编译核对；后端 `apply_race_edits` 隔离单测 6/6（mod 双键命中 / del 台账同日多场组 / add 去重 + 人工缺省 / null 删键 / 空表 no-op）；浏览器 E2E 自测 18/18 全过（`tests/et-selftest.html` 真实 DOM 驱动 dist 页：格编辑→d.ov、追加行→馬名解析 id→rc.add、场次级同组联动→rc.mod、勾选删除→rc.del、撤销/重做/放弃修改全回滚、箱无残留）；headless 截图（`tests/_shots/et-formal-{basic,races}.png`）钉住青绿格 / GI 徽章 / sticky 列 / 4-tab 导航全就位。
- **补充（2026-10-25 用户反馈 2 条）**：① 外壳侧栏「编辑」组加「**比赛信息编辑**」（基本信息编辑正下方，`data-url="pages/edit-table.html?sheet=races"` 直达比赛页签；data-href 后缀匹配 → 页内切 tab 高亮不错位）；② 批量表格工具条加「**⛶ 全屏**」——初版用 Fullscreen API，实机在 iframe/内嵌环境点击无反应（`allowfullscreen` 权限链被拦），**定稿改 CSS 伪全屏**：表格卡 `#fsTarget` 切 `fixed inset-0 z-[70]` 盖满视口（类切换全部为 JS 字面量 → 编译期扫到），表区限高 `calc(100vh - 200px)`、section 自身 overflow-auto 兜底，ESC / 按钮退出复原；全屏态 = 工具条 + 表格 + 行数脚注（保存条让位，退出后提交）。E2E 自测扩到 20/20（进/出全屏断言各一）。
- **打磨三连（2026-10-25 用户反馈）**：① **双高亮**——提交上一格时 `applyCell` 会给它补光标环，紧接着开新格编辑器 → 旧环残留；定稿 `startEdit` 开编辑器前 `setCursor(null)` 清环（编辑中位置由输入框自身指示，提交/取消后才落环）。② **编辑态跳表**——`w-full` 输入框在 auto 表格布局里以固有宽度(~170px)参与列宽计算，窄格（抹消日等）被撑开、整表抖动；**定稿编辑控件 `absolute left-0 top-0 h-full w-full` 盖满本格**（absolute 不参与表格布局 → 格子多大框多大，全屏/非全屏一致、窄格零撑开）+ `invisible whitespace-pre` 占位文本保列宽（本格可能是该列最宽者）+ sticky 格不动 `position`（relative 会破坏吸左，sticky 自身即 containing block）。③ **侧栏高亮跟随页签**——页内切页签不产生 iframe load，外壳 load 监听管不到；内容页 `switchSheetUI` postMessage `{type:"yj:page", page, sheet}`（仅认 `e.source === frameEl.contentWindow`）。E2E 21/21（含 absolute 盖满断言）。
- **导航收拢（2026-10-25 用户定稿）**：编辑台 4 页的**页内页签全部撤下**（edit.html / edit-table.html / edit-timeline.html / edit-drafts.html 的 `.yj-ed-tabs` 块，theme.css 组件类一并删除勿复活），导航**统一收进外壳侧栏「编辑」组 5 条目**：✎ 基本信息编辑（edit.html）/ ⊞ 基本信息批量编辑 / ▤ 比赛记录批量编辑（两条批量共用 `pages/edit-table.html`，`data-navid` 区分；后者 `data-url` 带 `?sheet=races`）/ ⧗ 航迹线 / 🗒 草稿箱。高亮三路齐发：外壳 load 按 `?sheet=` 精确点亮 navid、页内切页签 postMessage 同步、页内跳转（草稿箱跳马/跳场）走 pathname 后缀匹配。独立打开的内容页由 rehome 回壳 → 侧栏导航兜底。E2E 回归 20/20。
- **小打磨（2026-10-25 用户反馈 2 条）**：① 「⬇ 导出 TSV」撤下（编辑流闭环只进不出，按钮与 `exportTsv`/`tsvBtn` 全链路移除）；② 比赛页签「格（级别）」改**下拉框**——选项 = `racelib.GRADE_ORDER`（GI/JpnI/GII/JpnII/GIII/JpnIII/L/OP）+ 障害 JGI/JGII/JGIII + 班赛 3勝/2勝/1勝クラス + 新馬/未勝利（与 `merge_races` 的 `normalize_grade` 归一、`MAJOR_TIER` 展示层级同口径；现值不在枚举时下拉自动追加保真）。
- **追記（2026-10-26，与 kzn 双仓同改）**：修复台账行（race_id 空）del/mod 静默无效——前端 del/mod 条目只带 `馬名`（人读标识）而 `record_keys` 读记录字段 `出走馬名`，race_id 空时键集为空被跳过（上文本节「race_id 缺失（台账）走 馬名+日付」名不副实；本仓尚未实际使用 races_edits.json，零存量影响）。定稿在**后端键构建处归一**：`merge_races.entry_match_keys` 复制条目把 馬名 映射为 出走馬名（条目自带 出走馬名 优先、不污染原条目），del/mod 两处匹配改走它；SCHEMA §9 措辞同步；隔离单测 6→**10** 例全过（新增 台账 del / 台账 mod / 出走馬名 优先 / 条目不被污染）。展示层遗留（双仓同形态）：批量表格刷新后台账行的待保存划线/改值高亮不回显（`editor-table.js::recKeysJs` 同口径读 出走馬名）——仅展示层，草稿/远端条目与后端套用不受影响。隔离单测已落成常驻用例 **`scripts/races/verify_races_edits.py`（13 断言）**：台账 del/mod、race 键 del、horse 键 mod、add 与已有/同表去重、add 缺省（來源/本賞金）、null 删键、空表 no-op、条目不被污染、出走馬名 优先；另附「旧口径键集为空 → 复现原 bug」一条。

### §105 · 编辑存储站点命名空间化（localStorage / Cache / IndexedDB / sessionStorage 键加站点前缀，2026-10-26 双仓同改）
- **动因**：用户浏览器同时打开 yunji-web 与 kzn-web，kzn 编辑台「连接 GitHub」面板**回显出贴在另一侧的 PAT**。根因：localStorage/Cache API/IndexedDB 全按 **origin**（协议+域名+端口，**路径无关**）隔离，而两仓编辑台键名完全相同——`yj.gh.token`（PAT）/ `yj.edit.drafts.v1`（草稿箱）/ `yj.edit.port` / IndexedDB `yj-edit-blobs` / 缓存桶 `yj-data-v3` / sessionStorage `yj:basic:<v>:<url>`、`yj:currentHorse`。线上两站不同源（www.yunji.xyz vs kzn 的 Cloudflare 域）互不影响；但**本地同端口**（127.0.0.1:8090 先后服务两目录）或 file:// 双开时即同源共用一份存储：PAT 串显（本次实锤）、草稿箱互相可见（在错误站点提交会把对方草稿写进本仓人工表 = 数据污染）、数据缓存互相喂错（两站 `/data/basic.json` 同路径同 URL）。
- **定稿（单源收口）**：站点级键全部加站点 id 前缀——`config/sire.json` site 段新增 **`id`**（`yunji` / `kzn`），`gen-site-config.mjs` 产出 `YJ_SITE.id`；`yj-util.js` 新增 **`siteId()` / `storeKey(k)`** 单源（缺省回退 `"yj"` = 旧无前缀键，站点配置缺失时的兜底）。各键落地：PAT → `<site>.gh.token`、草稿 → `<site>.edit.drafts.v1`、端口记忆 → `<site>.edit.port`、IndexedDB 库 → `<site>.edit-blobs`、缓存桶 → `<site>.data-v3`、`yj:basic:<v>:<url>` → `<site>.basic:<v>:<url>`、`yj:currentHorse` → `<site>.currentHorse`。
- **技术要点**：yj-util 在 stats/datechart/races 页、yj-cache 在 races/datechart 页**先于 site-config.js 执行**——加载期读 `YJ_SITE` 恒 undefined → 一律**调用时求值**：`YJ.util.DRAFT_KEY` 改 defineProperty getter（属性形态不变、调用点零改动）、`yj-cache` 桶名改 `bucket()` 函数（`openBucket` 运行期取站点 id）；**复评后** bus.js（`key()`）与 editor.js（`tokenKey()` / `blobDbName()` / `draftKey()`）、profile.html 的草稿读取也全部改成调用时求值——原先它们是加载期算好存下来，只是靠「页面脚本顺序恰好 site-config 在前」成立，属违反本节规则、静默退回共享键的隐患（不报错，最难查）。⚠ `selector.js` 有**两处**键构造（`basicKey` + `clearBasicCache` 的前缀遍历）必须同口径改，漏一处就清不掉新键。
- **影响**：一次性切换——旧键数据不再读写：**PAT 需重贴一次**；切换前未提交的旧草稿不再可见（上线前先清点提交；实锤时 kzn 草稿箱为空）；旧缓存桶 `yj-data-v3` 由 `yj-cache.js::cleanLegacyBucket()` 在首次开桶时删除（Cache 条目是可再生的全量数据，删掉只是下次重取），线上访客无感（ETag/304 照常）。
- **不做自动迁移（复评定稿）**：旧键是两站**共写**的混合数据——草稿箱里可能混着另一站的马匹条目（id 空间不同），PAT 可能是另一站仓库的细粒度令牌（跨仓推送必 403）。盲迁 = 把错误凭据/脏草稿装进新命名空间，比不迁更难排。改为「**不继承 + 提示**」：`editor.js::legacyTokenNote()` 在当前站未配置 PAT 而旧键 `yj.gh.token` 有值时，在「连接 GitHub」面板显式提示重贴一次；旧 IndexedDB 库 `yj-edit-blobs` 不删（里面可能还有未提交草稿图，留着可人工导出，占用体积小）。
- **验证**：`node --check` 双仓 5 个 public 模块 + gen-site-config.mjs 全过；两仓 `npm run build` 通过（races-bundle round-trip 对账通过）；dist 断言——旧键字面量代码侧零残留（`yj.gh.token` / `yj.edit.drafts.v1` / `yj.edit.port` / `yj-edit-blobs` / `yj:basic:` / `yj:currentHorse` / `caches.open(BUCKET)`），新形态在位（site-config `id` 字段 / `storeKey(` / `function bucket`）；`yj-cache.js` 头注释保留一处旧桶名（说明去向，刻意）。复评补测：node vm 直跑三例（无 site-config → 回退 `yj.*` 旧键；有 `id` → `yunji.*`；桶名惰性求值 `yunji.data-v3` 且加载期 0 次 `caches.open`）；仓库自带冒烟重跑全绿（yj-cache 16/16、stats 205/205、datechart ALL PASS、drill 60/60、result PASS）。
- **复评追补（2026-10-26 二次审阅，用户授权直接改）**：① 惰性求值收口（bus/editor/profile，见上）；② 旧桶清理 `cleanLegacyBucket()`；③ PAT 旧键提示 `legacyTokenNote()`；④ `site.id` 补进配置契约（`docs/REFACTOR.md` §3.3 + README 新项目步骤）与 `AGENTS.md` 硬规（存储键前缀 + 加载期禁求值）；⑤ `gen-site-config.mjs` 对缺省 `id` 构建期告警（新克隆仓最容易漏）；⑥ `data/fetch_log.jsonl` 裁剪改为**计数门控 + 全量按 ts 过滤**（原「只看首行是否过期」在 merge=union 把旧行夹到中间时会永久跳过裁剪，且逐请求全量读 4MB）；⑦ 常驻用例 `scripts/races/verify_races_edits.py`（13 断言）+ `scripts/verify_fetch_log.py`（原 `tests/` 里的临时脚本移出，补 trim/幂等/门控——`tests/` 按约定不入库，挪到 `scripts/` 才留得住）；⑧ `scripts/races/verify_drill.cjs` 的体重档位断言去掉「540-550 / >550 必须为空」的数据绑定（2026-10 已有 554kg，断言随数据过期）。
- **关键结论**：跨站共存的工具链，站点级存储键必须自带命名空间；「origin 判定与路径无关」是本质——本地多项目共用一个端口时，任何未前缀的键都会跨项目互串。bus.js §62「sessionStorage 优于 localStorage」防的是**跨标签页**串扰，本次前缀补上的是**同标签跨站导航残留**这另一半。

### §106 · 编辑台提交链路两修：无比赛配图草稿的 TypeError 崩溃 + PAT 校验网络抖动误清除（2026-10-26）

- **动因（用户实测）**：① 编辑台改马匹图片后「提交到 GitHub」报红条 `Cannot read properties of null (reading 'then')`，草稿箱始终挂着「图片=草稿 2 张」提交不出去；② 第一次保存 PAT 后按钮「没反应」，重贴第二次才提交成功。
- **根因 1（提交崩溃，§104 a2dd6fb 引入）**：`editor.js::submitDrafts` 的 blob 链里 `if (!(d.tl && d.tl.table)) return rmCommit().then(reCommit);`——`rmCommit()` 在**无比赛配图草稿**时按早退约定返回 `null`，对 `null.then` 抛 TypeError 被整链 catch 成提交失败。即 **§104 之后一切「纯马匹字段/图片」的提交（最常见的提交形态）必炸**；当日 17:35 那次提交能成功只因恰好带了「比赛配图 1」（commit 8c14a03）。旧代码（5afb004）是 `return rmCommit();` 作链值，不对其 `.then`，故 §104 加 reCommit 时才暴露。
- **修法 1**：`rmCommit()` / `reCommit()` 早退分支 `return null` → `return Promise.resolve()`（做 `.then` 回调时两者行为一致，671 行 `.then(rmCommit).then(reCommit)` 路径不受影响），两处调用形态从此恒安全。
- **根因 2（PAT「保存了没生效」）**：「提交到 GitHub」按钮的 disabled 只看 `ghBusy || 草稿箱空`，**与 PAT 无关**；真正的坑在 `ghTokenSave` 处理器——保存后 `GET /user` 校验，**校验失败一律 `ghClearToken()`**，网络层抖动（status 0，连不上 api.github.com）也被当「token 无效」把刚贴的 PAT 静默删掉，之后点提交只会弹「先在连接 GitHub 里粘贴 PAT」，体感即「保存了没生效、再贴一次才行」。
- **修法 2**：`ghTestToken()` 失败分支补 `network: r.status === 0`；校验网络失败**保留 token**并明示「GitHub 校验连不上（网络波动），token 已保留」，只有 GitHub 明确拒绝（401 等）才清除。真正 token 贴错的行为不变（照旧清除 + 红字提示）。
- **验证**：`node --check` 过；`npm run build` 过（races-bundle round-trip 对账通过）；dist/editor.js 含两处修复、页面引用 `?v=` 哈希随内容自动更新（强刷即得）。用户当前挂着的「图片=草稿 2 张」草稿在 localStorage/IndexedDB 原样保留，修复生效后直接再点提交即可。
- **关键结论**：promise 链里「有时返回 promise 有时返回 null」的函数**不能被无条件 `.then`**——早退分支一律 `Promise.resolve()` 兜底；外部服务的「校验」要把**网络层失败**与**凭据被拒**分开处置，前者不该惩罚用户已输入的凭据。

### §107 · 编辑台持久化与缓存四修：图片/信息莫名消失 · 改后不及时回显 · 提交后缓存不刷新（2026-10-26）

- **动因（用户实测）**：「信息编辑和提交 GitHub 这一块还有很多问题，本地模拟多测几次」——① 上传图片莫名消失；② 改过的信息莫名消失；③ 修改过的信息不及时回显；④ 更新后浏览器缓存应立即失效、自动拉最新。
- **根因 1（图片消失）**：上传/删图后链路里只有 `renderPhotos`，**不经过** `render → persistHorse`，`state.photos` 的改动只活在内存——此刻切马（`setHorse` 会整块重置 `state.photos`）/ 关页 / shell 里 iframe 换页 = 草稿凭空消失，IndexedDB 里只剩孤儿 blob；上传队列进行中切马更会把已压好的图直接吞掉。
- **修法 1（editor.js）**：① 新增 `persistPhotosOf(id)`，图片态一变（`setDraft`/`addPhoto`/`delPhoto`/`markNoPhoto`/`unpinPhoto`）**立即落箱**，不再等下一次全量 render；② `setHorse` 第一行先 `persistHorse()`（连同图片草稿）再切；③ `uploadOne` 压缩完成时若已切马，按队列入队时的 `owner` 归属直接 `phPut` 记回**原马**草稿（不再挂错马/丢失）。
- **根因 2（信息消失）**：`persistHorse` 用 `state.draft` 整条**替换**草稿箱条目，双开编辑页时后写方会把先写方该匹新写的键整条抹掉；备注-only 的条目（`keys.length === 0 && _note`）更是被 `ovPut` 直接当空删掉——「只写备注」从未真正落箱。
- **修法 2**：① `persistHorse` 改**叠加落箱**：打底 = 箱里现值（`ovGet`），本页 `state` 覆盖其上（备注留空 = 保留旧备注，与 `buildPayload` 同口径）；`ovPut` 保持原语替换语义不动（editor-table.js 批量页的 syncOv/pruneEmpty 依赖它）；② `ovPut` 保留条件放宽为 `keys.length || entry._note`。
- **根因 3（回显不及时）**：编辑台初始马永远 = 马表第 1 匹，重开页面丢上下文；且提交成功后页面数据要等用户手动刷新。
- **修法 3**：① `setHorse` 选马写入 bus（`sessionStorage currentHorse` + postMessage），同标签页的预览/资料页跟随；`init` 起始马优先级 = URL `?h=` → bus 记忆马 → 第 1 匹；② 提交成功挂 `watchCI`：轮询 Actions（30s × 12），Deploy run 对 `head_sha` 成功完成后自动 `YJ.cache.bust() + refresh(true)` 刷新本页马表，报告条提示「CI 已发布 · 本页数据已自动刷新」。
- **根因 4（缓存不刷新）**：全站数据走 `yj-cache`（Cache API + TTL 12h + SWR）+ `selector.js` 的 sessionStorage 1h 路 D；编辑台提交的只是 GitHub 仓库，线上 `basic.json` 要等 CI 重算落库（约 2 分钟）才变——现有缓存层没有任何「外部数据已更新」的失效入口，旧数据最长吃满 12h。
- **修法 4**：① `yj-cache` 新增 `bust()`：`localStorage` 落失效时间戳（`storeKey("data-bust-ts")`）+ 清 Cache API 桶；`fetch()` 读到时间戳后 15 分钟内强制回源且 `cache:"no-store"`（跳过浏览器 HTTP 缓存，GitHub Pages `max-age=600` 也在内），过期条目无视新鲜窗直接硬刷；② `selector.js` 路 D 读到时间戳即弃 sessionStorage 副本；③ 提交成功即 `bust()` + `watchCI` 发布后二次 `bust()`，双保险。
- **验证**：新增 `tests/editor-sim.mjs`（node vm 直跑真 public 六模块 + 打桩 DOM/IndexedDB/fetch/GitHub API，可双页上下文共享存储）：27 断言全绿——T1 上传即落箱+换页回显；T2 备注-only 落箱+回显；T3 字段叠加落箱（外部新键不被抹）+切马往返保留；T4 上传队列中途切马 2 张全记回原马；T5 无 tl/racePh 提交不炸+草稿清空+photo/字段落 blob+tree；T6 bust 后本页与「另一标签页」均立即回源 no-store；T7 watchCI 触发自动刷新；T8 重开回到上次那匹。仓库自带冒烟全绿（yj-cache 16/16 · stats 205/205 · datechart 112 · drill 60/60）；`node --check` 过；`npm run build` 过（字体子集因 public/*.js 注释语料 +5 字重算 2129→2134，属正常连带）。
- **关键结论**：「消失」类症状的共同根源是**持久化只挂在 render 一条链上**——任何旁路（renderPhotos、切马重置、iframe 换页）都能绕过它；存储写入要么在状态变更点即时做（图片），要么先并箱再写（字段）。外部数据更新（CI 发布）要主动向缓存层喊话：失效戳 + 窗口内 no-store 是比改 TTL/加随机参数更可控的失效通道。

### §108 · 草稿箱「ov-only 箱」崩溃：draftRead 统一补形（2026-10-26，双仓同改）

- **动因（用户在 kzn-web 实测，yunji 同款隐患）**：批量表格改值后点「草稿箱」无反应，控制台 `Cannot read properties of undefined (reading '868')`（draftEntriesHTML 的 `d.ph[id]`），草稿箱弹不出来——PAT 都贴不了，整个提交流程卡死。
- **根因**：`draftRead()` 原样返回箱里 JSON——批量表格页只写 `ov`（从未有图片草稿）时箱里**没有 `ph`/`racePh` 键**；渲染/提交侧多处 `d.ph[id]` 直接下标访问，缺键即 `undefined["868"]`。yunji 一直没炸只是箱里恰好一直有图片草稿（`ph` 键存在），隐患相同。
- **修法**：`draftRead()` 读出即补形——`ov`/`ph`/`racePh` 缺失或类型不对一律补默认空对象（`blank()` 每次新对象、不复用引用）；读侧全部安全，下次 `draftWrite` 顺手把旧箱补成完整形态。一处收口覆盖全部下游，比在每个调用点加 `d.ph || {}` 更稳。
- **验证**：`tests/editor-sim.mjs` 新增 T9（预置 `{"ov":{"868":{...}}}` 无 `ph` 键的箱 → 打开草稿箱不炸、未知马以 `#868` 兜底显示、读侧补形后写回即补全键）；模拟台加 `SIM_PUB`/`SIM_REPO` 参数后可直跑另一仓 public——yunji 与 kzn 各 30 断言全绿；`node --check` 过；`npm run build` 过（dist 含「统一补形」标记）。kzn 侧同轮同步了 yunji §106/§107 全量（详见 kzn 仓 `docs/UI优化记录.md` §106）。
- **关键结论**：双仓同源的模块一处修 bug 必须同步另一处；「箱里缺键」属于**形状假设缺陷**，修在读入口一处即可覆盖全部下游下标访问。

### §109 · 批量表格页带草稿重开报「数据加载失败」：hydrateBasic 未声明标识符（2026-10-26，双仓同改）


- **动因（同类排查，yunji 侧未爆但必现）**：§108 修完草稿箱后按同一链路继续查「批量表格 → 草稿箱 → PAT → 提交」——`editor-table.js::hydrateBasic` 第 367 行写的是 `saved == null`（应为局部变量 `sv`），`saved` 在本函数/闭包内**未声明**，严格模式下读取即 `ReferenceError`。因为空箱时循环不执行，用户只在「改过值、箱里已有 ov 条目」的状态下重开本页才触发；异常被 init 的 `.catch` 吞成「数据加载失败：ReferenceError: saved is not defined」，整页表格不渲染。
- **修法**：`saved` → `sv`（同一分支第 366/368 行用的就是 `sv`，仅此处笔误）。yunji 与 kzn 双仓同改。
- **验证**：模拟台新增 T11（预置 ov 草稿 → 加载批量表格页 → `hydrateBasic` 水合）：修复前精确复现「数据加载失败：ReferenceError: saved is not defined」且 `pendOv` 为空；修复后两仓各 **32 断言全绿**（含「草稿值正确水合进待保存层」）；`node --check` 过；双仓 `npm run build` 过，dist/editor-table.js 含修正。
- **关键结论**：`ReferenceError` 类缺陷只在「该分支真被执行」时暴露（空箱/无草稿时不炸），回归测试必须**带着状态**跑（预置草稿再打开页面）；检查脚本的「数据加载失败」吞异常提示本身是线索——这类文案应该带上错误 message，本次即靠它定位。

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

### §113 · 赏金榜 v2：撤 1着/出走/重赏 三列 + 四套图表候选（2026-10-28）

- **用户反馈与定稿**：①榜单 **1着/出走/重赏 三列统计有误 → 直接撤列**（只留 # / 馬名 / 赏金；KPI 同步撤「重赏胜利」，只剩 赏金总额/上榜马数；`w` 仍作并列顺位次序键内部保留、不展示）；②**排名没问题**；③「图表的样式不太对」→ 按名次+赏金出**四套图表候选**交用户选型，选定后并入榜单页并按现有切面（榜别/年份/性别）联动。
- **改动**：`front/pages/leaderboard.html`（删 GRADE/TIER/trophyCell/三列/KPI 重赏项/`race-rows.js` 引入；`COLS` 只剩 赏金）；`tests/leaderboard-sim.mjs` 断言同步（表头唯一数据列=赏金、无 `yj-grade` 残留）。
- **图表候选** `tests/leaderboard-charts.html`（探索版**不进构建**；`?c=A|B|C|D` 只渲染单方案，供截图）：数据口径与榜单页相同（逐场赏金加总、取消/除外不计、赏金>0 共 **139 匹**）——
  **A 横向条形榜**（TOP15，条长∝赏金、前三主色实心，经典排行形态，断层一眼可见）；
  **B 帕累托·集中度**（TOP12 柱 + 累计占比折线 + 80% 参考线；头部 12 匹贡献全库 48.6%，分析向）；
  **C 占比环图**（TOP6 + 其他 133 匹，中心放总额 15亿9,942万、TOP6 占 38.6%，构成向「一图看大盘」）；
  **D 面积榜**（squarified treemap：TOP20 + 其他 119 匹；蓝绿=2023年世代/天蓝=2024年世代/灰=其他，块即马，同档案页面积图语言，一览向）。
- **验证**：`npm run build` 过 + `tests/leaderboard-sim.mjs` 冒烟绿（KPI 两项、表头唯一数据列、四榜序全过）；候选页 vm 冒烟（四方案关键值齐全、A 条数 15、「其他 N 匹」按 139 交叉一致）；Edge 无头截图四方案逐一目检通过（`--headless=new` + 独立 user-data-dir + `Start-Process` 25s 超时保护此路可用；此前 `--dump-dom` 挂起不再追究）；B 初版两处小瑕疵已修：左轴长标签被视口裁掉首位数字（padL 52→88）、注记错字（「化分母」→「作分母」），修后重截确认。
- **待选**：四方案用户选型中。

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

### §116 · 赏金榜 v4.1：条形配色改参照 JBIS sire-rank 样式（2026-10-28）

- **用户反馈**：贴 JBIS 种马排位史「賞金全産 Top-20」截图 → **只改空心/实心的写法，x/y 轴等其余保留现有实现**。改为：总赏金 = **浅青实心条**（`#c9e8e6`，primary 20% 调），重赏赏金 = **主色 `#0aa7a0` 实心段**，两系列同宽（`barMaxWidth` 均 18）、`barGap:-100%` 同槽叠放、两段齐平拼接成一根连续条（深段 0→重赏，浅段重赏→总）——即 JBIS「突出色=重賞」的视觉语法。随之撤掉 v3 遗留的描边空心、top3 描边强调、实心段缩窄嵌内三处写法；圆角只留外端小圆（总赏金右端 `[0,2,2,0]`、重赏段左端 `[2,0,0,2]`，拼缝平直）。
- **其余不动**：类目轴「名次 马名」截断、条尾金额标签（有重赏追加 ◆ 金额）、tooltip 全明细、点击开档案、入场动画、resize 防抖、KPI 三项。图例小样同步换色（`.i-hollow` 描边样 → `.i-total` 浅色实心）。
- **验证**：`npm run build` 过；冒烟改断言（两系列同高 18 + `barGap:-100%`、浅/主色、无 per-item 描边、标签/切面序不变）全绿。

### §117 · 赏金榜 v4.2：KPI 瘦身 + 轴标签中文名/名次徽章（2026-10-28）

- **用户五点反馈**：①**撤「上榜马数」KPI**——KPI 只剩 赏金总额 / 重赏赏金 两项；②轴标签**展示中文译名，港译（香港馬名）优先、无则自译（自译馬名）**（数据源 HORSES.cn 原有，未变）；③条尾金额**只标总赏金**（撤 ◆ 重赏后缀，重赏金额归 tooltip）；④**名次、名字右对齐**（axisLabel `align:"right"` + 定宽 210 截断保护）；⑤**名次加徽章样式**——rich text：top3 主色底白字徽章、其余浅灰底灰字（`{rk3|…}/{rk|…}`），第二行 `〈中文译名〉` 10px 灰字。行距 26→32px（容两行标签），画布高 = 行数×32+42。
- **验证**：`npm run build` 过；冒烟同步（KPI 两项、标签 rich 结构 `{rk3|1} {jp|…}\n{cn|…}`、条尾 formatter 只出总额、画布高 4490px、各切面序）全绿。

### §118 · 赏金榜 v4.3：名次列对齐 + 字号条宽放大（2026-10-28）

- **用户反馈**：①**排名也要右对齐**——截图目检：名字/译名已齐右，但**徽章跟着名字宽度漂移**（名次列不齐）→ 修法 = jp fragment **定宽 172 + `align:"right"`**（rich fragment 支持 width+align），名字框右缘恒定 → 徽章被推到固定 x，名次列竖向对齐；徽章自身定宽 30 居中。②**排名/名字/条形放大 ≥20%**：徽章 11→13（padding [2,6,2,6]）、日文马名 12→15、译名 10→12、条宽 18→22、行距 32→40px（画布 139 行 ≈5602px）、轴标签框 210→260；条尾金额标签维持 11 不动（用户未点名）。
- **验证**：`npm run build` 过 + 冒烟（徽章 width30/center、jp width172/right、barMaxWidth 22、画布高 5602px、KPI 两项）全绿；**Edge 无头截图恢复可用**（今日此前的 0 字节/13KB 空帧 = 虚拟时间预算与单线程 http.server 并发竞态——同参数偶发，循环重试取 >25KB 帧即可），截图目检确认名次列对齐、名字/译名齐右、字号条宽达标（留档 `tests/leaderboard-v4-preview.png`）。

### §119 · 赏金榜 v5：PC「下拉框」chip 标签 + MB 极简化（2026-10-28）

- **用户反馈**（附 MB 截图「还是有点丑」）三条定稿：①PC **排名和名字拼接成一个整体**、全榜**等长**、确保最长名容纳后**尽可能紧凑**、名字用**筛选下拉框的样式**；②**1/2/3 名特殊处理突出**；③**MB 端花哨全撤**——去掉排名，就 名字+条形图，名字采用**比赛记录表格的切换模式**（默认原名，可切中文，依旧港译优先→自译→回退原名）。
- **实现**：马名语言新增 `原名/译名` seg（`lb.nm`，入 storeKey 记忆；译名 labelName = 港译→自译→回退原名，双端生效）。PC 类目标签 = **axisLabel 整体 chip**（白底/#e5e5e5 边/6px 圆角/紧凑内距 = theme.css select 同款；`width` 按当前榜最长名自适应 `20+6+maxLen×13.5+18`，clamp 120–250，全榜等长；`overflow:truncate` 兜底）；chip 内 fragment = `{b1|1}{jp|名}`——1/2/3 名语义色徽章（1=#0aa7a0 / 2=#0f8fd6 / 3=#e8742a，同全站 1着/2着/3着），其余灰名次数字，名字 13px 单行。MB = 纯名字 12.5px 右对齐（width 118 截断），无徽章无 chip。行距 PC 32 / MB 30。断点 = `matchMedia("(max-width:768px)")`，跨断点防抖整体重绘。
- **两个 ECharts 坑（实测踩平）**：①axisLabel `backgroundColor/border/padding` 的 chip 盒宽 **containLabel 估不准**（条形压住 chip）→ `grid.left` 显式 = chip 宽+12，`containLabel:false` 关死；②chip 盒子挂向由 `align` 决定——`"left"` 会把盒子**伸进绘图区**压条形，必须 `"right"`（盒挂轴左，盒内 fragment 仍 LTR：徽章左、名字右）。
- **验证**：`npm run build` 过；冒烟扩到 7 次 setOption（含译名切换断言「通天飞」、chip 结构 `{b1|1}{jp|…}`、chip 白底/#e5e5e5/圆角 6/align right/宽度 120–250、grid.left 显式、KPI 两项、四切面序）全绿；Edge 截图 PC+MB 目检（留档 `tests/leaderboard-v5-pc.png` / `tests/leaderboard-v5-mb.png`）：PC 等长 chip + 语义色徽章 + 条形零重叠，MB 干净的名字+条形。

### §120 · 赏金榜 v6：两行瓦片 chip + 首行标签被吞排查（2026-10-28）

- **用户反馈**（附 PC 截图）：①「pc端没对齐」——§119 的 label `align:"right"` 同时把 chip **盒内内容**也推右 → 参差；②「没有中文名」——PC 默认原名无 CN；③「样式也很丑」。附 KPI 数字核对：用户截图 12亿3,088万/4亿9,553万 = **总榜×牡馬（含骟）**（总额 15亿9,942万 − 牝 3亿6,854万，分毫不差），数据无 bug，是切面状态。
- **实现**：①chip 内三个**定宽 fragment 瓦片**填满整行（名次格 0–26 / 名字格 26–chipW / 译名格第二行通栏），外侧 6px 圆角（名次格左上、名字格右上、译名格下两角）、无中缝，`align:"right"` 只剩盒子挂轴左侧一个作用，内容不再漂移；②PC chip 两行 = 主名（随 原名/译名 切换）+ **互补名小字**（默认原名时第二行即中文名，港译优先→自译→回退；互补名缺失或与主名相同则不渲染），PC 中文名默认可见；③名次格底色 = 1/2/3 名语义色（#0aa7a0/#0f8fd6/#e8742a）、4+ 浅灰 #e9ebee，chip 体 #f4f5f6；行距 42（画布 139 行 = 5880px），chipW = max(42+maxLen×13, 34+maxSub×10.5) clamp 120–260，`grid.left = chipW+12`。
- **ECharts 坑（探针 ?probe=1/2/3 实测定位）**：**axisLabel 级 `backgroundColor`（chip 白底）会让首行标签被整个吞掉**——去掉 width/overflow 无效、grid.top 拉到 80 无效、`--timeout` 真实等待无效；去掉 label 级底色（probe3）首行即回。而 **rich fragment 级底色一直正常**（1/2/3 名徽章全截图都在）→ chip 底色全部下沉到 fragment 瓦片，label 级只留 `align`。另：无头截图条形偏短 = `--timeout` 捕捉在动画中途，实页无碍。
- **验证**：`npm run build` 过；冒烟（chip 结构 `{b1|1}{jp|…}\n{cn|…}`、`{cn|通天飞}`、label 级底色 undefined 断言、名字格定宽、b1/b2/b3 语义色、画布 5880px、译名切换主辅对调、KPI 两项、四切面序）全绿；Edge 截图目检（留档 `tests/leaderboard-v6-pc.png`）：首行完整、全榜 chip 等宽对齐、中文名在名字下方对齐缩进。

### §121 · 赏金榜 v7：label 五套候选评审 → 「彩色名次数字」定稿（2026-10-28）

- **用户反馈**：候选评审页（`tests/leaderboard-labels.html`，静态示例数据 + 同语境条形，五套并列）→ 用户选定「方案 D · 左侧色条」。裁图留档 `tests/lb-label-A~E.png`。
- **「色条」三种实现全部失败（实测）**：①fragment 内容 = 空格、②NBSP `\u00a0`、③与底同色的句点（`backgroundColor` + `color` 同色 + fontSize 5）——**含空白类内容的 fragment 被 ECharts 整个丢弃**，底色块一律不渲染（候选页与实页均未画出，像素采样证实行1纯白）；④方块字符 `▌` 着色依赖字体回退，无头环境不出。评审图与实页里真正显示的形态 = **彩色名次数字**（1/2/3 语义色 #0aa7a0/#0f8fd6/#e8742a 加粗、4+ 中灰）+ 两行名（主名 + 互补名小字）。
- **定稿**：按评审图中用户实际所见落稿——`{r1|1}{jp|主名}\n{cn|互补名}`，名次列定宽 14 居中，jp/cn 定宽填行（等宽防漂移），行距 36（画布 139 行 = 5046px），chipW = max(30+maxLen×13, 30+maxSub×10.5) clamp 120–260，`grid.left = chipW+12`。axisLabel 级 backgroundColor 继续禁用（§120）。探针页归档 `tests/_trash/probe-rich.html`。
- **验证**：`npm run build` 过；冒烟（`{r1|1}{jp|…}\n{cn|…}`、`{cn|通天飞}`、r1/r2/r3 语义色、名字列定宽 78–230、画布 5046px、译名切换主辅对调、KPI 两项、四切面序）全绿；Edge 截图目检（留档 `tests/leaderboard-v7-pc.png`）。
- **备注**：若后续仍要「色条」视觉，唯一稳的路是把名次做成色块徽章（§119 方案 A 形态，fragment + 数字实内容 + 底色——已证可渲染），说一声即可切换。

### §122 · 赏金榜 v8：PC 隐藏译名切换 + 修复切换切面后图表消失 + 图例去括号（2026-10-28）

- **① PC 隐藏 原名/译名 切换**：`nameSeg` 加 `md:hidden`（≥768px 隐藏、窄屏保留——MB 命名切换是 v5 定稿）。核对编译产物 `dist/assets/theme-*.css` 含 `.md\:hidden`。
- **② 切换 总榜/自然年/世代/性别 后图表消失（真凶找到）**：`renderChart` 每次渲染先 `el.innerHTML = ""` 清容器——**把 ECharts 实例持有的 canvas 一并从 DOM 拽走**，随后 `setOption` 画进游离 canvas → 白屏。首屏正常（首次才 init），所以历次截图都没暴露；用户此前「点译名没反应」（v6）同源。修复：容器不再清空——实例复用 `EC.resize()`（行数变化同步高度）+ `notMerge` setOption；仅首次 init 前清一次占位提示；**空切面分支先 `EC.dispose()` 置 null 再写提示**（否则切回数据时同样是孤儿实例白屏）。
- **③ 图例文案**：`重赏赏金（重赏场次所得，含 2-5着）` → `重赏赏金`（KPI 标签本就无括号）。
- **验证**：`npm run build` 过；冒烟全绿（7 次 setOption 全部打在活实例上）；PC 截图（留档 `tests/leaderboard-v8-pc.png`：切换按钮消失、图例无括号、图表正常）+ MB 截图（`tests/leaderboard-v8-mb.png`：切换按钮保留、极简 label 不变）。

### §123 · 赏金榜 v9：PC 中文名居中排原名正下方（2026-10-28）

- **用户反馈**：PC 端中文名应「在原名的正下方、居中排布」；此前中文名整体偏左（顶到名次数字下方）。
- **偏左根因**：两行 fragment **总宽不等**（行1 = 名次16+主名格 = chipW+2，行2 = 缩进16+互补名格 = chipW+14）——`align:"right"` 是**逐行**右锚，短行整体平移 → 行2 左移 14px。教训：**右锚标签的各行 fragment 总宽必须相等**。
- **定稿**：行1 = 名次格(16) + 主名格(2+chipW−18) = chipW；行2 = 缩进(18+pad) + 互补名格(chipW−18−pad) = chipW，两行同宽同锚不漂移。互补名居中：`pad = (measureText(主名) − measureText(互补名))/2`（canvas 2d 实测，jp 字体 600 12.5px / cn 10.5px），逐行生成 `cn<pad>` 片段样式（同 pad 复用），cn 缺失/互补名比主名宽时 pad=0（退化为左对齐于主名起点）；pad 上限 chipW−30 保最小显示宽。
- **冒烟**：DOM 桩补 `getContext().measureText`（每字 12px 近似）；断言改 `{cn<pad>|…}` 结构（缩进=18+pad、宽度=chipW−18−pad、译名切换主辅对调用正则匹配）。
- **验证**：`npm run build` 过、冒烟全绿；截图目检（留档 `tests/leaderboard-v9-pc.png`：通天飞/乘天风/堆状高云/基因王等均居中于原名正下方）。

### §124 · 赏金榜 v10：PC 标签行首加性别色块（参照基本信息列表，2026-10-28）

- **用户反馈**：基本信息页马匹列表每行左缘有性别色条，赏金榜也「在排名前面加多一个色块显示是牝马、牡马还是骟马」。
- **配色沿用搜索列表/徽章语言**（profile.html `sexBadge` 同源）：牡 `#C9EFFE`/`#0B5A8C`♂、牝 `#FFDBD5`/`#B03A30`♀、骟 `#EFEFEF`/`#5A5A5A`⚲；图例追加三枚色样（骟浅灰加边框防与白底混淆）。
- **先探针后落稿**：评审页（`tests/leaderboard-labels.html`）加「方案 F · 色条实现探针」8 种实现并列截图目检——§121 判死的「同色句点」等在**单行**标签里其实全部能渲染；真坑在**多行标签 + 隐形占位内容**（见下）。最终取「底色块 + 深色实字符」最稳形态。
- **两坑实修（首行标签整体被吞，v10 首版复现）**：① **grid.left 预算漏了 axisLabel 的 margin 8**——标签块左缘算出 −4px 探出画布，首行标签整个消失（§120「label 级底色吞首行」的近亲；行 2+ 却正常，极具迷惑性）；修 = `grid.left = chipW + 16`（chipW + margin 8 + 余量 8）。② **隐形占位内容**（色=底色的「0」）在多行标签里同触发首行被吞；修 = 色块内容一律**真实可见字符**（♂/♀/⚲ 深色字，恰是搜索列表徽章原样）。两行标签的色块 = 行1、行2 各一枚 fragment（上 pad 8 下 pad 8）拼通高。
- **定稿结构**：行1 = 性别条(13) + 名次(16) + 主名格(2+chipW−31) = chipW；行2 = 性别条续(13) + 缩进(31+pad) + 互补名格(chipW−31−pad) = chipW（两行同宽防右锚漂移，§123 规则延续）；chipW = max(32+maxLen×13, 32+maxSub×10.5) clamp 120–260；MB 仍极简不加性别条。性别取 `r.m.sex`（牡/牝/セン，YJ.util.sexOf 口径）。
- **冒烟**：断言同步 `{sM|♂}{r1|1}…\n{sMb|♂}{cn<pad>|…}` 结构（sM/sF/sG 底色 + 字色、cn 缩进=31+pad、宽度=chipW−31−pad）。
- **验证**：`npm run build` 过、冒烟全绿（KPI 不变）；截图 + **像素采样三色齐**（牡 3543px / 牝 1076px / 骟 21px，行 1 标签恢复），留档 `tests/leaderboard-v11-pc.png`（§124 内部迭代 v10→v11）。
- **关键结论**：rich fragment 底色块要稳定渲染必须满足——内容为**真实可见字符**（空白/NBSP/与底同色在多行标签里会连带首行被吞）+ 标签块不得探出画布左缘（grid.left 预算必须含 axisLabel margin）。

### §125 · 赏金榜 v12：回滚色块 → 主名按性别着色定稿（2026-10-28）

- **用户反馈（v11 实机复看）**：①「不需要符号」；②「色块没对齐」（两行 fragment 拼的色块与名次列在实机上错位）。**回滚 §124 全部色块方案**（结构、chipW/grid.left 预算、冒烟断言全退回 §123 v9 形态），改**通过名字表达性别**：牝马粉、牡马蓝、骟马灰，色号同基本信息。
- **定稿**：主名片段按性别三份换色（几何完全一致，零对齐负担）——`jpM` 牡蓝 `#0B5A8C` / `jpF` 牝粉 `#B03A30` / `jpG` 骟灰 `#5A5A5A`（= profile.html `sexBadge` 的**字色**；同款底色 `#C9EFFE/#FFDBD5/#EFEFEF` 过浅、当正文看不清，故取字色）；sex 缺失回退 `jp` 黑。图例 PC 加「名字颜色：牡/牝/骟」三个彩色字样（MB 无着色不显示）；互补名小字维持灰 `#a1a1aa`；MB 黑字极简不变。
- **冒烟**：断言改性别键 `{jpM|…}`（`{jp[MFG]?|…}` 正则兼容回退）、`sM/sF/sG === undefined` 防色块方案回潮、三色断言 + 三片段几何一致断言。
- **验证**：`npm run build` 过、冒烟全绿（KPI 不变）；截图像素复检（名字区 蓝字 395px / 粉字 174px，前 26 行无骟马故灰 0），留档 `tests/leaderboard-v12-pc.png`。
- **关键结论**：性别这类「行的固有属性」用**文字着色**表达比加几何元素（色块/徽章）更稳——不参与行宽与对齐预算，也天然免疫 ECharts 多行 fragment 的渲染坑（§120/§121/§124）。

### §126 · 赏金榜 v13：中文名居中真正修好（同盒居中，删 measureText/pad）（2026-10-28）

- **用户反馈**：「中文名又没有居中对齐」（v12 实机截图）。像素剖面复测确认 §123 的 pad 方案**系统性偏左**：主名宽 109/85/73 的行，中文名中心偏左 2/15/23px（此前 v9 目检误判为已居中）。
- **根因（像素实测规律）**：`align:"left"` 在 ECharts rich 里**「名次+主名」多片段行上不生效**——主名实际按自身片段盒子**居中**渲染（六行主名中心全部 ≈185.0±0.5，与名长无关）；而**单片段行（中文名行）真按 align 左对齐**于盒子起点。§123 用 measureText 算 pad 想把中文名推到主名中心，但主名的真实渲染中心根本不是「盒子起点+字宽/2」，pad 因此系统性错位；且 pad 依赖 canvas measureText 的字体度量，与实际渲染字体/加载时序耦合，永远脆弱。
- **定稿（顺着渲染器行为）**：cn 与 jp **同盒子**（`padding:[1,0,0,18]`、`width:chipW−18`）+ **`align:"center"`**，两行在同格居中 → 中文名自动居中于主名正下方。**measureText/pad/动态 `cn<pad>` 键全部删除**（rich 更干净，且零字体依赖）。jp 系片段 align 显式改 `"center"`（与实际渲染行为一致）。两行总宽仍相等（名次16+2 + (chipW−18) ≡ 18 + (chipW−18)），无右锚漂移。
- **验证**：`npm run build` 过、冒烟全绿（断言改固定 `cn` 键 + 同盒/居中断言 + 动态键防回潮）；像素剖面复测五行偏差 **±1px 内**（原 2~23px）；性别着色/名次语义色/KPI 不变，留档 `tests/leaderboard-v13-pc.png`。
- **关键结论**：ECharts rich 多行标签里 fragment 的实际对齐行为与配置字面不符（多片段行居中、单片段行左对齐），**任何「先测字宽再摆位置」的方案都建立在不可靠的布局模型上**；正确姿势是让两行共用同一几何盒子、把对齐交给渲染器，行为自洽且字体无关。

### §127 · 赏金榜 v13.1：MB 标签贴左（containLabel 自适应）（2026-10-28）

- **用户反馈**：MB 端左侧留白太多，「尽可能的贴着左边」。原 MB `grid.left = 130` 写死 + 标签定宽 118 —— 名字短（尤其译名模式 3~5 字）时标签列右侧对齐、左边整段死空白。
- **修法**：MB 标签是**纯文本（无 rich）**，§119 的「containLabel 估不准」只针对 rich 标签 → MB 改 `grid.left = 10, containLabel: true`，由 ECharts 按实际标签宽度留位；标签去 `width:118/overflow/align` 定宽截断（当前数据最长 9 字自然放下，名字短时列宽自动收窄、图区随之变宽）。PC 分支不动（仍 chipW+12 + containLabel:false）。
- **验证**：`npm run build` 过、冒烟全绿（PC 路径不受影响）；MB 截图（留档 `tests/leaderboard-v13-mb.png`）标签起点 ≈ 卡片内 10px，译名模式下列宽自动收窄。
- **备注**：containLabel 的适用边界 = **纯文本标签可用、rich 标签禁用**（估宽偏差，§119 实测），与本节 MB/PC 分工一致。

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


















### §133 · 编辑台：时间线页草稿变动不刷新保存条——5 处 renderTL 漏刷收口全量 render（2026-10-28）

- **动因（用户实测）**：航迹线页上传比赛配图落箱后，「提交到 GitHub」按钮仍灰着不动（草稿箱抽屉却显示 1 处未提交）；F5 刷新后按钮才亮。
- **根因**：保存条按钮/草稿箱计数只在全量 `render()` 里重算（`els.save.disabled = ghBusy || !draftCount()`），而时间线页 5 处草稿变更路径只调了局部 `renderTL()`（只重绘配图面板/节点列表），按钮停在页面打开时的旧状态。首个草稿（0→1）按钮不变亮（本次踩中）；「放弃修改」清箱（1→0）按钮不变灰，点提交才报「草稿箱是空的」（反向同病）。
- **修复（front/public/editor.js，5 处 renderTL → render，render 内含 renderTL）**：① `rmUpload` 完成回调（上传比赛配图落箱）；② 配图面板 `rmdel`（撤销草稿图 1→0 / 标记移除已配置 0→1，双向）；③ `tlApplyEdit`（节点应用，整表快照落箱）；④ `tlDelete`（节点删除确认）；⑤ `tlreset`「放弃修改」（`loadTimeline().then(render)`）。
- **全编辑台状态刷新审计（同批完成，其余无需改）**：马匹页字段行编辑（softRefreshRow）/备注/图片上传队列/外链/删图/拖拽排序/恢复官方值、批量表格页单元格提交/加行/删行/粘贴导入/撤销重做/放弃会话（YJ.editor.render()）、查询页放弃（discardOne）、提交成功/失败/冲突重试——全部已收口全量 render，✅；剩余 `renderTL()` 直调均为草稿数不变场景（面板开关、选马选赛、编辑表单态、预览图水合）。
- **验证**：`npm run build` 过；dist/editor.js 5 处 §133 注释落地（L1901/1978/1988/2858/2869）。
- **追记（2026-10-29）**：已同步 kzn（kzn 侧记 §114）——5 处补丁与注释两仓逐字节一致，对账两仓 editor.js 差异仅剩站名 5 行（絆/云迹、GH_REPO、PAT 注释、线上域名注释、仓库名提示）。