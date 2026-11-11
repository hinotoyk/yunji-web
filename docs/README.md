# docs/ · 文档索引

> 全部人工文档收在本目录；仓库根只留 `README.md`（项目介绍）与 `AGENTS.md`（AI 助手规则）。
> 自动生成报告 `data/check_report.md` / `data/races_report.md` / `data/studbook_report.md` / `data/video_report.md` 是脚本产物，留在 `data/`，不属人工文档。

| 文档 | 说明 |
|---|---|
| `docs/HANDOFF.md` | 交接文档：当前状态 / 架构 / 编码规范 / 关键决策 / Git 协作约定 |
| `docs/TESTING.md` | 更新策略测试与排查手册（`run_update.py` 各策略的验证点 / 回归清单 / 排查指南） |
| `docs/SCHEMA.md` | 数据产物字段契约与口径（单一出处；改字段先改这里） |
| `docs/pipeline.md` | 后端数据管线说明（怎么跑 / basic / races / status / video 各管线流程 / 校验编排 / 离线红线） |
| `docs/UI优化记录.md` | 各模块 UI 优化的最终方案与成果（文首 = 「★ 全站编码约定 · 复用抽离」） |
| `docs/子项目复制与同步指南.md` | 模板站身份：`config/sire.json` 字段契约（§1.1）/ 品牌保留清单 / 同步规程 / 冒烟断言改写红线 |
| `docs/友情跳转方案.md` | 四兄弟站互跳（`front/public/friend-links.js`）的方案与站点清单 |
| `docs/request-path.html` | 请求·数据流路径图（基础 + 竞赛 3 视图，浏览器打开） |
| `docs/开源化改造清单.md` | 对外开源（MIT + 数据声明）的执行清单：逐项决策 / 缺口证据 / P0-P2 分档 / 验收命令（落地完成后可归档） |
| `docs/assets/` | 文档插图（如 `ui-review-2026-10-30/` 的 7 张对照截图，被 `UI优化记录.md` §139 引用） |

相关入口（仓库根）：[../README.md](../README.md)（项目介绍 / 快速开始 / 数据更新 / 部署）· [../AGENTS.md](../AGENTS.md)（AI 助手硬性规则汇总）。

## 已归档文档（2026-11 清理，磁盘已删，git 历史可查）

项目进入完成期后，一批「过程文档」已删除；源码注释里若出现下列文件名，属**历史出处指认**，不必再找文件：

| 已删文档 | 内容 | 现存替身 |
|---|---|---|
| `REFACTOR.md` | 种马配置化 / 复用收口 / docs 目录整理的重构方案与决策（P1-P5 已全部落地） | 配置契约 → `子项目复制与同步指南.md` §1.1；格口径 → `config/grade-table.json` 的 `about` 键 + `SCHEMA.md`；复用约定 → `UI优化记录.md` 文首 |
| `审计报告-工作区全量改动.md` | 上述重构的落地审计（逐项对照表） | 结论已进 `AGENTS.md` / `pipeline.md` / `HANDOFF.md` |
| `重复代码审计.md` | 复用收口清单（P1/F1 已收口、P2/F2 故意保留） | `UI优化记录.md` 文首「★ 全站编码约定 · 复用抽离」 |
| `UI审查报告-2026-10-30.md` | 2026-10-30 UI 审查的逐项记录（含 9 条被否建议） | `UI优化记录.md` §139（结论 + 截图路径） |
