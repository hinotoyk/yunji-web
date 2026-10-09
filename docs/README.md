# docs/ · 文档索引

> 全部人工文档收在本目录（docs/REFACTOR.md §11 / D11）；仓库根只留 `README.md`（项目介绍）与 `AGENTS.md`（AI 助手规则）。
> 自动生成报告 `data/check_report.md` / `data/races_report.md` / `data/studbook_report.md` 是脚本产物，留在 `data/`，不属人工文档。

| 文档 | 说明 |
|---|---|
| `docs/HANDOFF.md` | 交接文档：当前状态 / 架构 / 编码规范 / 关键决策 / Git 协作约定 |
| `docs/TESTING.md` | 更新策略测试与排查手册（`run_update.py` 9 种策略的验证点 / 回归清单 / 排查指南） |
| `docs/REFACTOR.md` | 重构方案：种马配置化（P1）/ 复用收口（P2）/ 品牌与格级注入（P3）/ docs 目录整理（P5） |
| `docs/SCHEMA.md` | 数据产物字段契约与口径（单一出处；改字段先改这里） |
| `docs/pipeline.md` | 后端数据管线说明（怎么跑 / basic 管线 / races 管线 / 校验编排 / 离线红线；原 `scripts/` 三份 README 合并） |
| `docs/UI优化记录.md` | 各模块 UI 优化的最终方案与成果（文首 = 「★ 全站编码约定 · 复用抽离」） |
| `docs/request-path.html` | 请求·数据流路径图（基础 + 竞赛 3 视图，浏览器打开） |

相关入口（仓库根）：[../README.md](../README.md)（项目介绍 / 快速开始 / 数据更新 / 部署）· [../AGENTS.md](../AGENTS.md)（AI 助手硬性规则汇总）。
