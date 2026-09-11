# AGENTS.md · 云迹项目规则（AI 助手必读）

本文件汇总散落在项目各文档中的**硬性规则**，供 AI 助手在任何会话开始时遵守。详细背景与依据见源文档（已注明出处）。

## 0. Git 协作（最高优先级）

- **commit**：仅在用户明确要求提交时执行；未要求不得自行 `git commit`。
  —— `front/README.md`「Git 协作约定」
- **push**：永远不执行 `git push`；推送只能由用户本人操作。
  —— `front/README.md`「Git 协作约定」
- `dist/` 在 `.gitignore` 中，构建产物不入库，由 CI/本地构建生成。

## 1. 工作流程

- 正式源码在 `front/`（Vite 多页 + Tailwind）；修改 → `npm run build` → 产物到项目根 `dist/` → 验证 `dist/` 生效。
- **每次改样式/类名后必须构建并核对** `dist/assets/theme-*.css` 含新类——编译期框架最大坑：改了类但没编译 → 页面无变化。
- 探索/候选版放项目根 `tests/`，废案放 `tests/_trash/`；旧 `testpage/` 已归档 `tests/_trash/testpage-snapshot`，只读勿直接改。
- UI 优化：每改一个模块，先把「最终思路 + 当前成果」写进 `front/UI优化记录.md`（不展开废案），再合并进正式页面。

## 2. 前端架构（必须遵守，不得退回旧方式）

- 架构已定：**Vite 多页构建 + Tailwind CSS v3（编译期）**。禁止手写散落 CSS / CDN 运行时 Tailwind / 无构建直接改页面。
- 样式一律用 Tailwind utility 类；复用组件类在 `front/pages/theme.css` 的 `@layer components` 用 `@apply` 封装；不散落原生 CSS、不写死 hex（指定色块除外）。
- 主题 token 统一在 `front/tailwind.config.js`（primary 青绿 `#0aa7a0`、shadcn Neutral 灰阶、Noto Sans SC + Geist）。
- JS 里拼接的 Tailwind 动态类必须能被 `tailwind.config.js` 的 `content` 扫到（当前 globs 含 `./pages/**/*.js` 与 `./public/**/*.js`）。
- 共享 JS（非 module `<script>`）放 `front/public/`，由 Vite 原样拷到 `dist/` 根，页面用 `../xxx.js` 相对引用。
- 响应式：统一 `max-md:`（768px）单断点，不要写多个碎断点。
- i18n：日文字段/枚举 → 中文全部走 `front/public/i18n.js` 字典（`YJ.i18n.t/e/g`），**不改后端 JSON**。
- 数据语义色（全站一致）：1着/胜=`primary` 青绿、2着=`chart-2` 青、3着=`chart-3` 橙、未完走（中止/取消/除外/失格）=`destructive` 红、重赏徽章（GI/GII/GIII/L/OP）用 `primary`/`chart-*` 分级。
- 跨页联动走 `bus.js`（postMessage + localStorage），不另起机制。

## 3. 数据与路径

- 数据在项目根 `data/`；前端一律经 **`YJ_DATA.url('...')`** 解析（`front/public/data-config.js` 为**唯一数据源映射点**，内部拼 `../../data/...`）。**改数据目录/位置只改该文件 `root` 一行**，禁止散落写死 `../../data/...`。
- 服务器必须服务**项目根**（如 `python -m http.server 8090 --directory 项目根`），否则 `../../data/` 超出服务器根、fetch 404；务必 http 访问（file:// 下 fetch 失败）。
- `data/basic.json` 是后端合并产物，**前端只读，勿手改**。
- 数据更新：`scripts/basic` 与 `scripts/races` 代码隔绝（各自 `common.py` 互不 import），数据统一落根 `data/`；日常/定时统一入口 `python run_update.py <策略>`。⚠ `--init`/`--races-force` 会删空/覆盖 `data/`，`--ci` 会 commit+push（测试必须隔离，见 `TESTING.md` §4.3）。

## 4. 已删除 / 不要复活

- 早期配色方案 A~D、shadcn 探索页、顶部导航布局方案、暗黑模式 已删除，**不要复活**。
- 项目约定：「请求怎么发」可参考旧实现，「业务流程」要自己重新设计。

## 5. 项目定位

- 站点：**云迹 · コントレイル产驹资料库**（个人查阅/检索用）。
- 部署：GitHub Pages 静态站，**站点根 = 仓库根**（`dist/` 与 `data/` 同级），入口 `/dist/index.html`；push main 时 `.github/workflows/deploy.yml` 自动 `npm run build` 并发布。本地预览用服务项目根的静态服务器（`:8090`）。
