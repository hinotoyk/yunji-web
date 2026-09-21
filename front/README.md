# front/ · 云迹正式前端（Vite + Tailwind）

「云迹 · Contrail 产驹资料库」的正式前端工程。**Vite 多页构建 + Tailwind CSS**。

> 数据源在项目根 `data/`（由 `scripts/` 抓取维护）：构建时由 `vite.config.js` 的 `copy-data` 插件复制进 `dist/data/`（跳过 `_tmp/` 与 `*.md`/`*.csv`），dist 自包含。
> 运行时统一经 `public/data-config.js` 的 `YJ_DATA.url()` 解析（唯一数据源映射点，内部拼 `../data/...`，相对 `dist/pages/` 指向 `dist/data/`）。改数据目录/位置只改 `data-config.js` 的 `prefix`/`root`。

---

## 架构与编码规范（必须遵守）

本项目前端**架构已定：Vite 多页构建 + Tailwind CSS v3（编译期）**。所有后续开发**必须**遵循以下规则，不得退回旧方式（手写散落 CSS / CDN 运行时 Tailwind / 无构建直接改 `page/`）：

| 规则 | 说明 |
|---|---|
| **样式一律用 Tailwind** | 新增/修改样式优先用 HTML 里的 utility 类；需要复用的组件类在 `pages/theme.css` 的 `@layer components` 里用 `@apply` 封装。**不得散落写原生 CSS** |
| **动态类必须能被扫描** | 在 JS 里拼接的 Tailwind 类（如 `text-[12.5px]`、`bg-[#E0F5F4]`、`max-md:px-1.5`）必须能被 `tailwind.config.js` 的 `content` 扫到。**JS 文件所在目录必须已在 content globs 里**（当前含 `./pages/**/*.js` 与 `./public/**/*.js`） |
| **改完必须构建验证** | 每次改样式/类名后 `npm run build`，再到 `dist/assets/theme-*.css` 核对新类真的编译进去了。这是编译期框架最容易踩的坑：**改了类但没编译 → 页面无变化** |
| **共享 JS 放 `public/`** | 普通 `<script>`（非 module）放 `front/public/`，由 Vite 原样拷贝到 `dist/` 根，页面用 `../xxx.js` 相对引用 |
| **数据路径经映射层** | 页面/JS 一律用 `YJ_DATA.url('...')`（`public/data-config.js` 唯一映射点，内部拼 `../data/...`）；构建时数据复制为 `dist/data/`，构建后相对 `dist/pages/` 指向它。改数据目录/位置只改该文件 `prefix`/`root`；`scripts/` 更新数据后需重新构建（或临时 `COPY_DATA=skip` 复用上次数据） |
| **主题 token 走 config** | 颜色/字体统一映射在 `tailwind.config.js`（primary 青绿 `#0aa7a0`、shadcn Neutral 灰阶、Noto Sans SC + Geist）；新增颜色进 config，不在 HTML 里写死 hex（指定色块除外） |
| **构建命令** | `npm run build` → 输出到项目根 `dist/`（`vite.config.js` 的 `outDir:'../dist'`），并把 `data/` 复制为 `dist/data/`；快速迭代可 `COPY_DATA=skip npm run build` 跳过复制 |

> ⚠ **教训速记**：① JS 动态类必须确认被 `content` 扫描并验证编译产物；② 预览/探索页 ≠ 正式版，交互行为以正式版为准；③ 同一实体的「显示名」逻辑要单点维护，下拉与回填共用同一函数。

## Git 协作约定（必须遵守）

- **commit**：仅在用户明确要求提交时执行；未要求不得自行 `git commit`。
- **push**：永远不执行 `git push`；推送只能由用户本人操作。
- **git 身份**：本项目仓库级身份固定为 GitHub noreply 邮箱 `36542325+hinotoyk@users.noreply.github.com`（`git config user.name/user.email` 已在项目内设置）；2026-09-11 历史已整体清洗重建（单一根提交），仓库内**不得再出现**公司邮箱、公司私有 npm 源（`npm.efun.com`）、任何 token。装包必须走项目级 `front/.npmrc` 的官方 registry，禁止引入私有源地址。

## 目录结构

```
front/
├─ index.html            # 外壳：左侧导航 + iframe 内容区（含手机抽屉）
├─ vite.config.js        # 多页入口 + 产物输出到 ../dist
├─ tailwind.config.js    # 设计 token（青绿 × shadcn Neutral 色阶 + 字体栈）
├─ postcss.config.js     # tailwindcss + autoprefixer
├─ package.json
├─ pages/                # 功能子页面（iframe 内嵌；Tailwind 共享样式 theme.css）
│  ├─ theme.css          # ★ Tailwind 输入：@tailwind 指令 + 字体 + 通用组件类（编译后所有页面共享）
│  ├─ profile.html       #   基本信息（已完成，接真实数据）
│  ├─ races.html         #   比赛记录（已完成，独立/内嵌双模式）
│  ├─ pedigree.html      #   血统图（已完成，独立/内嵌双模式；侧边栏暂不挂入口）
│  ├─ stats.html         #   统计总览（占位）
│  ├─ datechart.html     #   日期图（占位）
│  └─ timeline.html      #   时间线（占位）
├─ public/               # 原样拷贝到 dist/ 根的静态资源（共享 JS）
│  ├─ data-config.js     #   ★ 数据源映射（YJ_DATA.url()，改数据目录只改这里）
│  ├─ i18n.js            #   i18n 字典（日文字段/枚举 → 中文）
│  ├─ bus.js             #   postMessage + localStorage 跨页联动
│  ├─ selector.js        #   选马器（搜索+下拉，fetch basic.json 缓存）
│  └─ pedigree.js        #   血统图渲染（简约 2 代 + 完整 5 代）
├─ scripts/              # 构建期工具（非页面代码，Vite/Tailwind 不扫）
│  ├─ gen-font.mjs       #   ★ 字体子集生成入口：现算语料 → 调 python → 写 assets/fonts/noto-sc.css
│  ├─ subset_font.py     #   fontTools 子集化 + wght 轴裁剪 + 漏字断言（COVERAGE/VERIFY）
│  └─ brotli-shim/       #   ctypes 包系统 libbrotlienc（本机没 pip 装 brotli 时才有 woff2 编码）
├─ assets/fonts/         # 本地自托管字体：noto-sc-subset.woff2（1 片按需子集，构建期生成）+ noto-sc.css（生成）+ Geist
│                        #   旧 101 片 Google 导出物已退役归档到 tests/_trash/font-101-slices/（不进 dist）
└─ HANDOFF.md                # 设计决策与交接文档
```

## 命令

```bash
# 安装依赖（首次；需要网络）
npm install

# 开发模式（热更新）
npm run dev

# 构建 → 输出到项目根 dist/
npm run build

# 预览构建产物
npm run preview
```

## 访问

dist 已自包含（数据在 `dist/data/`），服务项目根或直接服务 `dist/` 均可：

- 服务项目根：`python -m http.server 8090` → `http://127.0.0.1:8090/dist/index.html`
- 或直接服务 dist：`python -m http.server 8091 --directory dist` → `http://127.0.0.1:8091/`
- 或开发模式：Vite dev server 默认 `http://localhost:5173/`（dev 模式取不到数据，预览请用上面两种）

## 说明

- **Tailwind 编译**：`pages/theme.css` 是唯一 Tailwind 输入，所有页面 `<link>` 它共享编译产物（`dist/assets/theme-*.css`）。新增页面不需要建样式文件，直接在 HTML 里用 utility 类即可；要抽公共组件则在 `theme.css` 的 `@layer components` 里用 `@apply` 封装。
- **字体子集（构建期生成，方案 b · 2026-09-20 定稿）**：`vite.config.js` 的 `gen-font` 插件在 `buildStart` 跑 `scripts/gen-font.mjs`——**每次 build 现算**语料字符集（`data/` 全部 .json（排除 `_tmp/`）∪ `index.html`/`pages/*.html`/`public/*.js`，含 i18n 字典），字符集变了才调 `subset_font.py`（fontTools 子集化 + `wght` 轴限 300–700）重写 `assets/fonts/noto-sc.css` 与 `noto-sc-subset.woff2`（当前 1,965 字符 / 2,644 字形 / 589KB / 1 片，替换旧 101 片 4.5MB；每页字体请求 30–66 → 1~2）。语料不许写死：每天 CI 更新数据会带新汉字。
  - 依赖：`python` + `fontTools` + 一个 brotli 编码器（`pip install brotli` 正解；本机没装，故子进程 PYTHONPATH 上临时挂 `scripts/brotli-shim`，它用 ctypes 包 Git 自带的 `libbrotlienc.dll`，不改环境）+ 源字体 `C:/Windows/Fonts/NotoSansSC-VF.ttf`（可用 `YJ_FONT_SRC` 覆盖）。
  - **fail-soft**：Pages 的 `deploy.yml` 只有 node、没有 python → 打 WARN 并沿用仓库里已提交的 `noto-sc-subset.woff2`，构建不失败；此时新汉字由 body 字体栈尾（`PingFang SC`/`Microsoft YaHei`）兜住，不出豆腐块。本地要严格报错用 `YJ_FONT_STRICT=1`。
  - 开关：`FONT_GEN=skip`（跳过检测，最快）/ `FONT_GEN=force`（字符集没变也重生成）；`node scripts/gen-font.mjs --check` 只看语料与是否需要重建、不写文件。
- **共享 JS 在 public/**：因各子页是普通 `<script>`（非 module），放入 `front/public/` 由 Vite 原样拷贝到 `dist/` 根，页面用 `../i18n.js` 等相对路径引用。
- **数据引用**：页面/JS 一律经 `YJ_DATA.url()`，构建后解析为 `../data/...`（相对 `dist/pages/`）指向 `dist/data/`；`scripts/` 更新数据后重新 `npm run build` 才会进 dist。
- **探索/废案**：未定稿版本与废案统一放项目根 `tests/`（`_trash/` 为淘汰归档）。
