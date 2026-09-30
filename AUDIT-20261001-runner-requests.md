# 临时审计 · GitHub Pages 部署失败（runner 不再预装 requests）

> **性质**：临时文档，仅供审计；审毕可删或移 `tests/_trash/`。
> **范围**：deploy 工作流一次性失败 + 代码层修复。不含本轮前端功能改动（另有 commit 与 UI优化记录 §82.19–82.22）。
> **状态**：✅ 已修复并本地验证，待 push 后 CI 复核。

---

## 1. 事故档案

| 项 | 内容 |
|---|---|
| 现象 | push main 后「Deploy to GitHub Pages」job 失败，站点停留在上一次成功部署版本 |
| 失败步 | `Apply manual overrides + rebuild timeline` → `python scripts/basic/merge_basic.py --keep` |
| 报错 | `ModuleNotFoundError: No module named 'requests'`（`scripts/basic/common.py:13`） |
| 影响面 | 仅 Pages 部署链路；`update-data` 工作流不受影响（自带 `pip install`）；数据无损 |
| 触发方式 | 外部环境变化——**GitHub runner 镜像移除了预装的 `requests`**，本仓库代码与 push 内容无责 |

## 2. 根因链（逐环可验）

1. `deploy.yml` 的 merge 步按设计**纯 stdlib**（工作流注释明示「两步均纯 stdlib、秒级、幂等」），runner 上从未装过第三方包。
2. `merge_basic.py` 顶部 `import common`。
3. `scripts/basic/common.py` 顶层 `import requests` + `from bs4 import BeautifulSoup`（供抓取脚本以 `common.requests` 共用）。
4. 同时 `common.py` 顶层 `from _shared import … net …`，而 `scripts/_shared/__init__.py` re-export `net` → **任何** import `_shared` 的离线脚本都被连坐。
5. `scripts/_shared/net.py` 顶层 `import requests`。
6. 旧 runner 镜像预装 requests → 此链一直侥幸存活；镜像砍掉预装包后第 3/5 环即炸。
7. `update-data.yml` 之所以没事：第 61 行有 `pip install requests beautifulsoup4 lxml fonttools brotli`。

**定性**：潜伏的结构问题（离线脚本隐式依赖第三方包）× 外部环境变更（runner 预装包收缩）= 部署失败。不是本次 push 引入的回归。

## 3. 修复方案（已实施）

原则：**恢复「离线脚本零第三方依赖」的设计意图**，而不是给 deploy 塞 PyPI 安装。

| # | 文件 | 改动 |
|---|---|---|
| 1 | `scripts/_shared/net.py` | `requests` / `bs4` 从模块顶层移入 `fetch()` / `soup_of()` **函数内惰性导入**（真正发请求时才需要） |
| 2 | `scripts/basic/common.py` | 顶层 import 改 **PEP 562 模块 `__getattr__`** 惰性重导出；抓取脚本的 `common.requests` / `common.BeautifulSoup` 用法一字不变 |
| 3 | `scripts/races/common.py` | 同 #2（两管线同口径，互不 import 的约定不变） |
| 4 | `scripts/README.md` | 沉淀硬规：`_shared/*` 与 `common.py` **模块顶层禁止 import 第三方包** |
| 5 | `deploy.yml` | **不改**（设计本意即纯 stdlib，修代码而非加依赖） |

## 4. 落选方案与理由

- **deploy.yml 加 `pip install requests beautifulsoup4`**：能好，但①给部署 job 引入 PyPI 网络依赖（多了个偶发失败点）；②与工作流注释「纯 stdlib」的设计相悖；③掩盖结构问题，下次换个包再炸一次。
- **`merge_basic.py` 绕过 common 直连 `_shared`**：改动面大（load_basic/read_cache/BASIC_ORDER/overrides 等八个符号要改绑定），且 `_shared/__init__` 仍会拉起 net，治标不治本——必须切断 net 的顶层导入才算修。
- **vendor requests / 换 urllib 重写**：牵动全部抓取脚本，收益为零。

## 5. 验证证据（本机全部复跑通过）

| 验证 | 命令 | 结果 |
|---|---|---|
| 无第三方导入 | `python -X importtime scripts/basic/merge_basic.py --keep` + `build_timeline.py`，grep import 日志 | `requests`/`bs4`/`lxml` **零出现** ✓ |
| CI 两步本地复现 | 同上（退出码） | merge `exit=0`、timeline `exit=0`（timeline 报「内容无变化，跳过写入」）✓ |
| 合并幂等/等值 | merge 后 `git diff data/basic.json` + 语义比对 | 277 匹**值零差异**（仅键序归一 + 时间戳），basic.json 已还原保持 diff 最小 ✓ |
| 抓取契约保持 | `import common`（两管线）后取 `common.requests` / `common.BeautifulSoup` | 均正常解析，`fetch`/`soup_of` 可调用 ✓ |
| 语法 | `py_compile` merge_basic / build_timeline | OK ✓ |

## 6. 残留风险与建议

1. **纪律依赖**：修复靠「顶层禁第三方」约定维持（已写入 scripts/README.md）。若要机械化，可加一条 CI lint（如 `python -c "import …"` 后断言 `sys.modules` 无 requests）——本轮未做，避免过度工程。
2. `update-data.yml` 的 `pip install` 保持原样（抓取管线真需要），不受本次影响。
3. deploy 失败期间 Pages 一直服务旧版本（GitHub Pages 行为），push 本修复后自动恢复，无需手动 re-run。
4. 仓库根有未跟踪的 `.ci-check/`（历史遗留整仓拷贝 scratch），本次**未**提交；建议审计后删除或入 `.gitignore`。

## 7. 变更清单（本次 commit）

- `fix(ci)`：`scripts/_shared/net.py`、`scripts/basic/common.py`、`scripts/races/common.py`、`scripts/README.md` + 本审计文档
- `front`（同批上线的功能改动，见 UI优化记录 §82.19–82.22）：`front/pages/profile.html`、`front/pages/edit.html`、`front/pages/edit-timeline.html`、`front/public/editor.js`、`front/public/selector.js`、`front/assets/fonts/noto-sc*.{css,woff2}`、`scripts/timeline/build_timeline.py`、`data/SCHEMA.md`、`data/timeline.json`、`front/UI优化记录.md`

---

## 8. 补充审计 · push 前复核新发现（同批修复，2026-10-01）

push 时被远端拒绝（non-fast-forward）→ fetch 发现远端多了两个**编辑台草稿提交**
（`edit: 编辑台草稿一次性提交（0 匹人工值 · 比赛配图 1）`）——用户已在真实使用编辑台的
GitHub 提交链路，顺势深挖出**第二个 bug**：

### 8.1 编辑台提交的照片从未进入 git tree（严重，马图/比赛图两条路径同中）

- **证据**：远端 `data/races_manual.json` = `{"4":{"photo":"../data/photos/4-1.webp"}}`，
  但 `git ls-tree origin/main -- data/photos/` **没有 `4-1.webp`**（只有 §82.17 走本地管线
  提交的三张马图）。照片 blob POST `/git/blobs` 成功（代码里 `if (!r.ok) throw`），
  但 `tree` 数组只装了三个表（manual_overrides / timeline_manual / races_manual），
  `uploads`（blob sha 清单）**只用于成功报告的文件列表，从不进 tree** → 每张经编辑台
  提交的照片都是孤儿 blob，表里引用 404。
- **为何此前没暴露**：§82.17 的马图本地化走的是本地管线 commit；编辑台 GitHub 提交链路
  本次是第一次被真实端到端使用。
- **修复**：`submitDrafts()` 的 tree 组装处（`jobs2.then` 内）把 `uploads` 逐条
  `tree.push({path, mode:"100644", type:"blob", sha})`，与表 blob 同一次原子 commit 落库。

### 8.2 悬空数据清理

- 远端那条 `races_manual["4"]` 是**修复前的下标键**（§82.21）+ 指向不存在文件的引用，
  双重无效：build_timeline 查的是 race_id，"4" 永远匹配不上；即便匹配上，图也是 404。
- 照片 blob 在 GitHub 侧已成孤儿（不可达、无法取回）→ 需用修复后的编辑台**重新上传**
  （新链路：真 race_id 键 + 照片随 commit 落库）。本地已把 `data/races_manual.json`
  重置为 `{}`（SCHEMA：空表 = 无配图，管线照常）。
- 编辑台 UI 看不到 "4" 这条脏键（`rmCurrent` 按 race_id 查）→ 只能数据侧清理，已做。

### 8.3 观察项（不修，留档）

- 远端出现一个**空提交**（`4546705`，与 `20730d9` 同文案零 diff）：疑似连续两次点「提交」，
  第二次草稿内容与远端已完全一致 → 生成同内容 tree 的空 commit。无害（无数据影响）；
  防重复属于体验优化，本轮不加（`ghBusy` 护栏已在，实际风险低）。
- `manual_overrides.json` 被编辑台重写为紧凑 JSON + 键序变化（内容等值），无害。
