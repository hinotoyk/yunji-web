# 会话交接 · 2026-08-18 比赛数据校验链 + 差异审核页 + 风控实测（阶段0-2 完成，审核与防覆盖待办）

> 会话目标：完整跑通"台账为主、netkeiba 校验"的比赛数据链：契约分层 → 全量抓取实测 → 比赛记录校验比对 → 差异审核页。
> 前置阅读：`docs/data-contracts.md`、`docs/design-race-verification.md`（2/3/4 需求方案，已确认）、`docs/session-handoff-2026-08-17.md`
> 状态：**阶段0-2 完成、比对与审核页就绪；等待用户审核差异 → 之后做防覆盖层（overrides）**

---

## 1. 会话完成清单

| 项 | 状态 | 说明 |
|---|---|---|
| 需求澄清 + 规格书 v2 | ✅ | 9 轮问答 → 桌面 `云迹项目.md`（七章规格） |
| 阶段0：台账摸底/数据核验 | ✅ | Google Sheets 649 条/135 匹；交叉核对差异清零 |
| **契约分层重构** | ✅ | adapters/sheets_ledger.py + racelib.py + pull_races 重写 + build-data 唯一构建器 + data-contracts.md + test-data 契约断言 |
| 阶段1：定时同步 workflow | ✅ | update-data.yml：schedule 每天UTC22:00 + 手动 races/all/single |
| git 提交 | ✅ 本地 | `35c7b95` + `0609c67`（**未推送**，沙箱无法 push） |
| 阶段2：UI 改版 | ✅ | race-ui.js（KPI+履历表）、index 筛选/迷你战绩、detail 接入、admin 别名维护 |
| 风控调整 | ✅ | netkeiba 间隔 **5-8s 档**（base 6.5×0.8~1.2），JBIS 15s 档；fetch_log 请求日志；risk-report.py |
| **全量抓取实测（全量之战）** | ✅ | netkeiba 404/404 + JBIS 2 匹；事故→恢复→修复→重跑成功 |
| 比赛记录抓取（契约D） | ✅ | `--races` 模式：`/horse/result/{id}/` 成绩页，增量跳过；134 匹已抓 |
| 差异比对 | ✅ | compare-races.py：414 条差异已分类（行级4 / 数值~98 / 命名~303 / 骑手截断101） |
| **差异审核页** | ✅ | page/review.html：分类/批量/逐条裁决/导出/本地持久化 |
| 本地服务器 | ✅ 运行中 | pwsh-6 @ 127.0.0.1:8000 |

## 2. 关键事实与发现（重要）

1. **netkeiba 马页是 tab 结构**：基础信息在 `/horse/{id}/`（静态），比赛记录在**独立成绩页** `/horse/result/{id}/`（"戦績"tab，JS 加载，静态抓取拿不到主页里的成绩）——"抓基本信息顺带抓成绩"不成立，每马 +1 请求（增量后仅新比赛马）。
2. **比对结论**：134 匹已出赛马**场次数与 netkeiba 全一致**；字段差异 414 条，其中：
   - **行级 4 条 = 2 个真实数据问题**：`ラパンドール` 日期差一天（02-16 vs 02-15）；`シーラス` R 差 1（5 vs 4）
   - 骑手 101 条 = netkeiba 截断外籍名（台账更全）
   - 命名惯例 211 条（メイクデビュー vs 2歳新馬；赛名 (L) 后缀）
   - 数值类 ~98 条（赏金 17 / 头数 15 / 天气 13 / 着差 10 / オッズ 10 …）需逐条确认
3. **风控实测**：失控段（bug 意外）843 请求 @0.9s 全 200 无封禁 → netkeiba 容忍度高；规范段 15s/5-8s 档 0 异常。5-8s 档全量 ≈50min。
4. **事故教训**（已修复）：`is_contrail_progeny` 嵌套层级与调用处不一致 → 全量误杀删数据；`continue` 跳过 sleep → 无间隔请求。**教训：测试必须与真实调用路径同一嵌套层级**。
5. 归一化规则（compare 内置）：状態 稍→稍重、不→不良；賞金 netkeiba 万円×10000→円；骑手/命名惯例为系统性差异非错误。

## 3. 数据现状

- crops.json：407 匹（netkeiba 404 + JBIS 2 + 台账建档 Grand Warrior 1），血统 405/407
- 契约D：`data/raw/netkeiba_races.json` 134 匹成绩记录（全 200 抓取，含台账缺列 馬番/通過/ペース）
- 差异：`data/race-diffs.json`（414 条，action=pending）+ `data/race-diffs-report.md`

## 4. 待办 / 下一步（按顺序）

1. **【等你】审核差异**：`http://localhost:8000/page/review.html` → 重点：行级 4 条（2 个真实问题）→ 数值类逐条 → 骑手/命名惯例批量。裁决导出 `race-diffs_decided_*.json`
2. **防覆盖层（overrides）**：`data/overrides.json` 接入 build-data（用户权威层，最高优先级，永不覆盖）+ 人工字段（译名/近况/血统分析/备考）一次性迁移
3. **review 裁决 → overrides**：审核页导出的裁决 → 自动生成 overrides 条目
4. **admin.html 改造**：写入目标从 crops.json 改为 overrides.json
5. **定时链路**：update-data.yml 加 `--races` 增量抓取 + compare（步骤F）
6. **git 提交 + 推送**：当前 16 个文件未提交（见下）；2 个 commit 未推送（需用户终端 `git push origin main`）
7. **阶段3 数据大盘** dashboard.html（ECharts 本地 vendored）
8. **阶段4 图片上传**；preview.html 处置

## 5. git 状态

已提交（本地未推送）：
```
0609c67  feat: 阶段2 UI改版 + 别名维护 + 会话交接
35c7b95  feat: 比赛数据接入 — 契约分层 + 台账 + 定时同步
```

工作区未提交（16 个文件）：
```
M  .github/workflows/update-data.yml      M  .gitignore
M  HANDOFF.md                             M  data/crops.json
M  data/manifest.json                     M  data/merge-report.md
M  data/raw/netkeiba.json                 M  scripts/scrape_jbis.py
M  scripts/scrape_netkeiba.py
?? data/race-diffs-report.md              ?? data/race-diffs.json
?? data/raw/netkeiba_races.json           ?? docs/design-race-verification.md
?? history/20260818_0145.json             ?? page/review.html
?? scripts/compare-races.py               ?? scripts/risk-report.py
```
（`data/raw/fetch_log.csv` 已 gitignore）

## 6. 常用命令

```bash
# 比赛记录抓取（契约D，增量）→ 比对 → 审核
python scripts/scrape_netkeiba.py --races [--force] [--limit N]
python scripts/compare-races.py [--limit N]
# 本地预览
python -m http.server 8000   # review.html / index.html / detail.html
# 全量/构建/测试（低频人工）
python scripts/scrape_netkeiba.py --all
python scripts/scrape_jbis.py --all
python scripts/build-data.py --note "说明"
python scripts/test-data.py
# 风控观测
python scripts/risk-report.py
```
