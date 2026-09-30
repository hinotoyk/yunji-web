# 云迹 · 交接文档（HANDOFF）

> 本文件是项目**唯一交接文档**，覆盖前端 + 数据管线 + 编码规范 + 关键决策 + 当前状态（历史背景不展开，一律以最新状态为准）。
> 配套文档：`README.md`（项目介绍/快速开始）、`data/SCHEMA.md`（数据契约单一出处）、`scripts/README.md`（管线怎么跑）、`TESTING.md`（测试与排查）、`front/UI优化记录.md`（各模块 UI 最终方案与成果）。

---

## 0. 项目一句话

**云迹 · コントレイル产驹资料库**：铁鸟翱天（Contrail，netkeiba id `2017101835`）产驹的个人查阅/检索静态站，GitHub Pages 部署，`dist/` 自包含数据副本。

## 1. 当前状态（最新）

| 维度 | 状态 |
|---|---|
| 数据规模 | `data/basic.json` 建档 **277 匹**（2023=131 + 2024=146，id 1~277）；血统 277/277；成绩 276 个 `races/{id}.json` |
| 前端页面 | 8 个页面**全部实现**：`profile`（基本信息/云崽档案）、`races`（比赛记录）、`stats`（统计总览）、`datechart`（日期统计）、`timeline`（航迹线）、`pedigree`（血统，profile 内嵌）、`edit` + `edit-timeline`（编辑台，mb 不开放） |
| 构建 | `front/` `npm run build` → 根 `dist/`（含 `dist/data/` 副本 + races 压缩包 + 字体子集） |
| 数据更新 | 统一入口 `python run_update.py <策略>`；GitHub Actions 每日 UTC 22:00 跑 `--ci` 自动提交 data/ |
| 部署 | push main → `deploy.yml` 自动构建并发布仓库根，入口 `/dist/index.html` |
| 数据一致性 | `--check` + 4 个断言脚本（verify_result / verify_drill / verify_stats / verify_datechart）全绿 |

## 2. 目录结构

```
yunji-web/
├── data/                  # ★ 全部数据产物（basic.json / pedigree/ / races/ / timeline.json / datechart.json / stats.json / 人工表）
│   └── SCHEMA.md          # 数据产物字段契约（单一出处，改字段先改这里）
├── scripts/               # Python 数据管线
│   ├── _shared/           #   中立共享层（net/paths/basic_io/manual/text，不 import 任一管线）
│   ├── basic/             #   基础管线：建档（JBIS）→ 血统/nk_id/意味（并发）→ 详情（netkeiba）→ merge
│   ├── races/             #   竞赛管线：详情+判变 → 成绩增量（SP 页回填格/条件/調教師/本賞金）→ 台账海外 → merge
│   ├── timeline/ datechart/ stats/   # 前端预计算产物（build_*.py → data/*.json）
│   ├── check_data.py      #   数据一致性校验（--fix 补跑）
│   └── README.md + basic/README.md + races/README.md   # 管线说明
├── front/                 # ★ 前端正式源码（Vite 多页 + Tailwind，产物 → 根 dist/）
│   ├── index.html         #   外壳：左侧导航 + iframe 内容区（单断点 768px）
│   ├── pages/             #   8 个功能子页 + theme.css（唯一 Tailwind 输入）
│   ├── public/            #   共享 JS：data-config / i18n / selector / race-rows / yj-cache / yj-util / bus / device / pedigree / editor / race-bundle / loading
│   ├── scripts/           #   构建期工具：gen-font.mjs（字体子集）+ subset_font.py + build-races-bundle.mjs（races 压缩包）
│   └── UI优化记录.md      #   各模块 UI 优化最终方案 + 当前成果（文首含全站编码约定）
├── dist/                  # 构建产物（gitignore，CI 现场构建；dist 已自包含 data/ 副本）
├── run_update.py          # 数据更新统一入口（9 种策略，见 README.md 表格）
├── run_full_test.py       # 从 0 全量自测（= --init 实际载体，~2 小时）
├── request-path.html      # 请求·数据流路径图（基础+竞赛 3 视图）
├── AGENTS.md              # AI 助手工作规则（硬性约定汇总）
├── README.md              # 项目介绍 + 快速开始 + 部署
├── HANDOFF.md             # 本文件（交接）
└── TESTING.md             # 更新策略验证点 / 回归清单 / 排查指南
```

## 3. 前端架构（已定稿，勿回退）

| 项 | 决策 |
|---|---|
| **构建** | **Vite 5 多页**（`front/` 为源，产物根 `dist/`）；`base:'./'` 可部署任意子目录 |
| **样式** | **Tailwind CSS v3（编译期）**：utility 类为主；共享组件类在 `pages/theme.css` 的 `@layer components` 用 `@apply` 封装；禁止散落原生 CSS / CDN 运行时 Tailwind |
| **主题 token** | `tailwind.config.js`：primary 青绿 `#0aa7a0`、shadcn Neutral 灰阶、Noto Sans SC + Geist；不写死 hex（指定色块除外） |
| **JS 动态类** | 拼接的 Tailwind 类必须能被 `content` 扫到（当前含 `./pages/**/*.js` 与 `./public/**/*.js`）；`.yj-g*` 等动态拼类名必须放 `@layer` 之外 |
| **共享 JS** | 放 `front/public/`，Vite 原样拷到 `dist/` 根，页面用 `../xxx.js` 相对引用 |
| **数据路径** | 一律 `YJ_DATA.url()`（`public/data-config.js` 唯一映射点，`prefix:'..'` → `../data/...`）；改数据目录只改该文件 |
| **数据缓存** | 一律走 `front/public/yj-cache.js`（`YJ.cache.fetch(name[,opts])`）：注册表按产物 TTL（默认 12h，10min 新鲜期 0 请求 + SWR 软过期）；桶 `yj-data-v2`，字段口径升级 +1 整体作废 |
| **比赛数据** | 构建期由 `build-races-bundle.mjs` 打成 `dist/data/races-bundle.json`（替换式，1 请求 ~44KB gzip 替代 276 个小文件）；解码单一出处 `public/race-bundle.js` |
| **字体** | 构建期按需全量子集（`gen-font.mjs` → `assets/fonts/noto-sc-subset.woff2` ~589KB + `noto-sc.css` 1 条 @font-face）；wght 300–700；fail-soft（CI 无 python 时沿用已提交产物）；开关 `FONT_GEN=skip|force`、严格报错 `YJ_FONT_STRICT=1` |
| **响应式** | 单断点 768px（`max-md:`）；JS 端统一 `public/device.js`（`YJ.device.isMb/isPc/mode/onChange`，matchMedia），断点翻转可实时重渲染 |
| **跨页联动** | `public/bus.js`：postMessage + **sessionStorage**（按标签页隔离，防跨标签互顶）共享选中马 |
| **i18n** | 日文字段/枚举 → 中文统一走 `public/i18n.js`（`YJ.i18n.t/e/g`），**不改后端 JSON** |
| **旧目录处置** | 旧 `page/` 已删除；`testpage/` 归档 `tests/_trash/testpage-snapshot`；探索/候选版放 `tests/`，废案放 `tests/_trash/` |

**数据语义色（全站一致）**：1着/胜=`primary` 青绿、2着=`chart-2` 青、3着=`chart-3` 橙、未完走（中止/取消/除外/失格）=`destructive` 红、重赏徽章（GI/GII/GIII/L/OP）用 `primary`/`chart-*` 分级。着顺浅色三件套：JS 侧 `race-rows.js` 的 `PLACE_BG`、CSS 侧 `theme.css` 的 `.yj-nkm*`，两处互指、改色必须同步。

## 4. 前端编码规范（必须遵守）

1. **样式一律 Tailwind**：新增/修改样式优先 utility 类；需要复用的组件类在 `theme.css` `@layer components` 用 `@apply` 封装；`@layer` 内不放 JS 动态拼类名（会被 Tailwind 按候选裁剪，如 `.yj-g*` 必须在 @layer 之外）。
2. **改完必须构建验证**：每次改样式/类名后 `npm run build`，再到 `dist/assets/theme-*.css` 核对新类真的编译进去（编译期框架最大坑：改了类没编译 → 页面无变化）。快速迭代可 `COPY_DATA=skip npm run build`。
3. **共享工具单一出处**：公共工具（esc 等）→ `front/public/yj-util.js`（`YJ.util.*`），页面只写薄别名，**禁止复制函数体**。
4. **业务语义组件单一出处**：比赛行/徽章/格式化（`gradeBadge/placeBadge/ninki*/G/GLABEL/weightOf/venueR…`）一律复用 `front/public/race-rows.js`，新页面直接引入，禁止本地重写映射表或徽章 HTML。
5. **收录门槛**：只有全站统一数据语义或 ≥3 处使用才抽离；仅 2 处且行为有分叉的不动。
6. **零影响红线**：复用收口只做等值搬移/纯删除；改完必跑 build + 核对 dist。
7. **教训速记**：① JS 动态类必须确认被 content 扫描并验证编译产物；② 预览/探索页 ≠ 正式版，交互行为以正式版为准；③ 同一实体的「显示名」逻辑单点维护。

> 复用收口的完整细则（含反例清单与隐藏耦合案例）见 `front/UI优化记录.md` 文首「★ 全站编码约定 · 复用抽离」。

## 5. 数据管线

- **两条管线代码隔绝**：`scripts/basic/` 与 `scripts/races/` **互不 import**，只共用中立层 `scripts/_shared`（不认识管线；限速表/缓存目录/剥前缀等差异由各 `common.py` 以形参注入）。`basic.json` 是两管线共同产物（唯一「前合并」数据源），引用零跨目录。
- **线性单链**（无跨源来回兜底）：基础 = JBIS 建档 → 血统/nk_id/意味 并发 → netkeiba 详情 → merge；竞赛 = 详情+判变 → 成绩增量（SP 页一次回填 格/条件/調教師/本賞金）→ 台账海外 → merge。
- **缓存 + 合并模式**：抓取脚本只写 `data/_tmp/{basic,races}/` 独立缓存，merge 时统一写 basic.json 并删缓存 → 可并发、无覆盖。
- **风控**：按域名限速（`DOMAIN_SLEEP`，0.8~1.2 抖动）+ `data/fetch_log.csv` 统一日志（含 host 列），据此调间隔。
- **离线脚本零第三方依赖**（硬规）：`_shared/*` 与 `common.py` 模块顶层**禁止 import 第三方包**（requests/bs4 只在真正发请求处惰性导入，PEP 562 `__getattr__` 重导出）——GitHub runner 不再预装 requests，顶层导入会炸掉 Pages deploy 的 merge 步。
- **人工值**：`data/manual_overrides.json`（马字段钉住）、`data/timeline_manual.json`（时间线人工节点）、`data/races_manual.json`（比赛人工配图）——两条管线的合并收尾都套 `manual.apply_overrides`，直接改 basic.json 会被次日 CI 抹掉。
- **判变 = 变化 ∪ 缺失**：成绩抓取目标 = 通算成績变化 ∪ 无 races 文件 ∪ 数据缺失（文件出赛 < 通算战数），自动补拉，杜绝盲区。
- **门禁**：`scripts/check_data.py` + 4 个断言脚本（`node scripts/races/verify_result.cjs` / `verify_drill.cjs` / `node scripts/stats/verify_stats.cjs` / `node scripts/datechart/verify_datechart.cjs`）。改数据或改生成脚本后都要跑绿，并断言 `data/` diff 为空。
- 详细机制见 `scripts/README.md`（跨管线）、`scripts/basic/README.md`、`scripts/races/README.md`。

## 6. 数据契约

**所有产物字段契约与口径的单一出处 = `data/SCHEMA.md`**（生成脚本文件头只留一行指路）。要点：

- `basic.json`：`{"_meta":{...}, "horses":[…]}`，字段模板与列序 = `scripts/_shared/basic_io.py::BASIC_FIELDS`（31 键）。**前端只读，勿手改**（手改次日被 CI 抹掉，人工值走人工表）。
- `races/{id}.json`：逐场成绩数组，列序 = `scripts/races/common.py::RACE_RECORD_ORDER`；**結果三态** = 完赛（数字着顺）/ 未完赛（中止·失格，计出走）/ 未出走（取消·除外，不计出走）。
- `timeline.json` / `datechart.json` / `stats.json`：前端预计算产物，内容无变化时跳过写入（避免 `--ci` 每轮空 diff 提交）。
- ⚠ 人工表会随构建进 `dist/data/` **公网可读**（含 `_note` 编辑备注）：备注只写业务理由。

## 7. 编辑台（草稿箱模式）

- **恒为草稿箱模式**：本地编辑服务 `edit_server.py` 已于 2026-09-30 **删除**；编辑台把改动存浏览器本地（localStorage/IndexedDB）→ 「提交到 GitHub」走 GitHub Data API **单原子 commit** → push main 后 CI 构建约 2 分钟生效。
- 页面：`pages/edit.html`（马字段，B 稿「常开直改工作表」）+ `pages/edit-timeline.html`（航迹线人工节点）；`mb 端不开放`（窄屏只显「请在电脑端使用」）。
- 图片：上传/外链本地化走 `front/public/editor.js`，照片随 commit 落 `data/photos/`，经人工表钉 `photo` 字段；比赛人工配图走 `data/races_manual.json`（race_id → photo，台账场用虚拟键 `@马id@日付`）。
- 安全边界：`manual_overrides.json` 等人工表公网可读 → 备注只写业务理由；`_note`/`_orig` 等 `_` 前缀键不参与套用。

## 8. Git 协作约定（必须遵守）

- **commit**：仅在用户明确要求提交时执行；未要求不得自行 `git commit`。
- **push**：永远不执行 `git push`；推送只能由用户本人操作。
- **git 身份**：仓库级固定为 GitHub noreply 邮箱 `36542325+hinotoyk@users.noreply.github.com`；历史已整体清洗重建（单一根提交），仓库内不得再出现公司邮箱、公司私有 npm 源（`npm.efun.com`）、任何 token；装包必须走项目级 `front/.npmrc` 的官方 registry。
- `dist/`、`tests/`、`test-logs/`、`data/_tmp/` 在 `.gitignore`（构建/探索/日志不入库）；`data/` 是数据仓库模式（直接提交进 git）。

## 9. 已知遗留 / 注意事项

- `id 129「エスポワール」` 未命名仔无 nk_id，无法抓详情/成绩（建档缺 nk_id 1/277）。
- 台账海外场若馬名与 basic 不一致会被跳过（记入报告）；海外场不参与収得。
- 障害重赏记法 `(JG1)` 阿拉伯数字已归一为 JGI/JGII/JGIII；海外 `(G1)` 归一为 GI。
- 编辑台草稿若与远端完全一致会生成同内容 tree 的空 commit（无害）；防重复属于体验优化，未做。
- `tests/` 是探索/候选版区（gitignored），`tests/_trash/` 为淘汰归档（只读勿直接改）；历史快照可从 git 取回。

## 10. 关键决策时间线（最新为准）

- 配色/布局：方案 F 青绿 × shadcn Neutral（仅亮色，无暗黑）+ 左侧导航外壳 + iframe 内嵌 + 单断点 768px。
- 统计拆分：统计总览 / 日期统计 / 航迹线 三页独立。
- 数据提速：races 压缩包 + 全站统一缓存控制器（2026-09-28）。
- 编辑台：草稿箱模式 + 线上一次性提交 + 页面拆分（2026-09-29/30）。
- 全站措辞：侧边栏「日期图」→「日期统计」、「时间线」→「航迹线」、「XXXX年产」→「XXXX年世代」、「下钻」→「跳转」。
- 字体：101 片 Google 分片 → 构建期按需全量子集 1 片（2026-09-20 定稿）。
