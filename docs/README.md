# docs/ · 文档索引

> 全部人工文档收在本目录；仓库根只留 `README.md`（项目介绍 / 配置 / 维护与排障）与 `AGENTS.md`（AI 助手硬规则）。
> 自动生成报告 `data/check_report.md` / `data/races_report.md` / `data/studbook_report.md` / `data/video_report.md` 是脚本产物，留在 `data/`，不属人工文档。

| 文档 | 说明 |
|---|---|
| `docs/SCHEMA.md` | 数据产物字段契约与口径（**单一出处**；改字段先改这里） |
| `docs/DESIGN.md` | **架构与约定的唯一出处**：当前状态 / 前端架构 / 编码约定（含冒烟断言红线）/ 数据管线 / 数据契约要点 / 编辑台 / Git 协作 / 遗留 / 决策时间线 / UI 规格 §索引 |
| `docs/request-path.html` | 请求·数据流路径图（基础 + 竞赛 3 视图，浏览器打开） |

## 已并入 DESIGN（2026-11-12 合并）

原来的 `HANDOFF.md`（架构 / 决策 / Git 约定）、`UI优化记录.md`（UI 规格 + 编码约定）、`开源化改造清单.md`（开源化改造记录）**已合并为 [docs/DESIGN.md](./DESIGN.md)**：

- 架构、编码约定、数据管线、编辑台、决策时间线 → DESIGN §1–§10；
- UI 各条目的**正文**归档在 git（`git show 7e48d69:docs/UI优化记录.md`），DESIGN §11 只保留**按页面的 § 索引**与仍生效的两条跨页规则；
- 源码注释里的 `§N` 引用按 §11 的表定位到页面。

## 已并入 README（2026-11-12 精简）

原来的 `TESTING.md`（测试验证点 / 排查）、`pipeline.md`（管线流程 / 设计原则 / 离线红线）、`MAINTAINING.md`（日常流水线 / 发版检查 / 疑难速查）**已合并进 [README「维护与排障」](../README.md#维护与排障)**，不再单独维护 —— 同一件事写两处必然漂移。

## 已删除（2026-11-12，内容待维护者重新起草）

| 文档 | 原内容 | 现状 |
|---|---|---|
| `子项目复制与同步指南.md` | 子项目复制 / 同步规程 / 品牌保留清单 | 删除；同步规则暂时只留在 `AGENTS.md`「子项目（模板站身份）」一条，**正式指南待补** |
| `换种马实战.md` | 真实种马走路径 B 的实测记录 | 删除；换站步骤以 README「三条上手路径」为准 |
| `友情跳转方案.md` | 四站互跳组件方案 | 删除；现状 = 注册表 `config/friend-links.json` → `window.YJ_FRIENDS`，渲染 `front/public/friend-links.js` |
| `CONTRIBUTING.md` + `.github/ISSUE_TEMPLATE` + `pull_request_template.md` | 贡献指南与 Issue/PR 模板 | 删除；本仓单人维护，不接外部 issue/PR |

## 已归档文档（2026-11 清理，磁盘已删，git 历史可查）

源码注释里若出现下列文件名，属**历史出处指认**，不必再找文件：

| 已删文档 | 内容 | 现存替身 |
|---|---|---|
| `REFACTOR.md` | 种马配置化 / 复用收口 / docs 目录整理的重构方案与决策（P1-P5 已落地） | 配置契约 → `config/*.json` 内字段注释 + `config/grade-table.json` 的 `about` 键；复用约定 → `docs/DESIGN.md` §4 |
| `审计报告-工作区全量改动.md` | 上述重构的落地审计（逐项对照表） | 结论已进 `AGENTS.md` / `docs/DESIGN.md` |
| `重复代码审计.md` | 复用收口清单（P1/F1 已收口、P2/F2 故意保留） | `docs/DESIGN.md` §4「前端编码约定」 |
| `UI审查报告-2026-10-30.md` | 2026-10-30 UI 审查的逐项记录（含 9 条被否建议） | `docs/DESIGN.md` §11 索引 §139（截图已删除，正文见 git 归档） |
