# 脚本执行策略 · 测试与排查指南

> 用途：验证 `run_update.py` 的 9 种更新策略在**真实联网端到端**下都正常，作为新增策略、
> 改代码后回归、以及排查数据/流程问题时的可复用手册。
> 实测基线来自 2026-08-31 一次完整验证（`--init` 全量重建 + 其余策略逐一真实联网）。
> 本文件是对 `README.md`（策略表）与 `HANDOFF.md`（附录 D）的**可执行测试补充**。

---

## 0. 一页速览

| 策略 | 命令 | 是否联网 | 是否动数据 | 实测耗时 | 成功判据 |
|---|---|---|---|---|---|
| 初始化 | `--init` | ✅ | **删空重建** | ~128 分钟 | 建档 277 + 基础 277 + 竞赛全部 OK |
| 数据校验 | `--check` | ❌ | 只读 | <1 秒 | 问题合计 0 |
| 定向更新 | `--horse 1,2,3` | ✅ | 增量 | <1 分钟/匹 | 4 步 OK，单匹数据更新 |
| 仅台账 | `--ledger` | ✅ | 增量 | <1 分钟 | 台账拉取 + 合并 OK |
| 轻量时段 | `--races --since N` | ✅ | 增量 | ~3 分钟 | 抓最近 N 天出赛马 + 合并 |
| 基本增量 | `--basic` | ✅ | 增量 | <1 分钟(已全) | 建档 0 新增、补缺跳过 |
| 比赛全量刷新 | `--races-force` | ✅ | **覆盖成绩** | ~59 分钟 | 全量重抓 + 判变 + 幂等 |
| CI 全自动 | `--ci` | ✅ | 增量 + git | 视数据而定 | 5 步编排按序 OK |
| （底层流程） | `run_full_test.py` | ✅ | **删空重建** | ~128 分钟 | 3 段全部 OK + 汇总 |

> ⚠ 耗时基线在**数据已全、网络正常**时测得；首次全量 / 数据缺失多时会更久。
> ⚠ `--init` 与 `--races-force` 会**删空/覆盖 data/**，`--ci` 会 **git 提交**——详见 §4。

---

## 1. 各策略详细验证点

### 1.1 `--init` 初始化（从 0 全量重建）
实际调用 `run_full_test.py`，流程：
```
删空 data/ → ① 建档 build_registry(JBIS) → ② 基础 run_all(并发血统/nk_id/studbook + 详情 + 合并)
         → ③ 竞赛 run_all(详情+判变 → 成绩 → 本賞金 → 台账 → 合并) → 汇总
```
**成功判据**（对照 full 日志「汇总」段）：
- 建档：277 匹（2023=131 + 2024=146），新增数 = 预期
- 血统 `pedigree_file`：277/277
- `nk_id`：276/277（1 匹未命名仔无 nk_id，预期）
- `races_file` / `収得賞金`：276/277
- 収得缺本賞金 0 场 · 抓取失败 0 匹
- 风控：`fetch_log.csv` 各 host 非 200 = 0

### 1.2 `--check` 数据校验
校验：引用完整性 / 通算战数 vs 文件出赛 / 跨来源重复 / 字段填充统计。
**成功判据**：`data/check_report.md` 中「问题合计: 0」，且可修复项均为 0（`nk_id` 可修复 1 是已知未命名仔，非缺陷）。
**`--fix` 模式**：对可修复项自动补跑对应脚本（pedigree / nk_id / races）。

### 1.3 `--horse <id>` 定向更新
```
fetch_detail --id → fetch_races --id → fetch_prize → merge_races
```
**成功判据**：4 步均 OK；该 id 的 `races/{id}.json` 与 `basic.json` 字段更新；本賞金/収得正确。

### 1.4 `--ledger` 仅台账
```
fetch_ledger(Google Sheets CSV → 海外场) → merge_races
```
**成功判据**：台账拉取 OK + 合并 OK；海外场增量并入；匹配不上馬名数应可控（可查日志）。

### 1.5 `--races --since N` 轻量时段增量
实际走 `fetch_races --since N` + `merge_races`（**不跑详情/判变**）。
**成功判据**：识别「最近 N 天出赛 ∪ 无文件」的马并逐匹抓成绩；合并 OK；已抓全的马新增 0（幂等）。

### 1.6 `--basic` 基本增量
```
build_registry(建档对账) → run_all(并发补缺 + 详情 + 合并)
```
**成功判据**：建档新增数符合预期（无新马 = 0）；血统/nk_id/studbook/详情按「已有跳过」补缺；合并回写正确。

### 1.7 `--races-force` 比赛全量刷新
```
run_all --force：详情(全) → 成绩(force 全量重抓) → 本賞金 → 台账 → 合并
```
**成功判据**：详情全抓并检测**判变**（通算成績变化）；`fetch_races` 目标 = 276（force=True）；成绩按比赛键去重幂等；本賞金 0 场（无新增）；収得缺本賞金 0。

### 1.8 `--ci` CI 全自动
```
build_registry → basic run_all → races run_all → check_data → git_commit_if_changed()
```
**成功判据**：5 步按序执行且各 OK；`--limit N` 可缩短 races 环节做快速验证；git 提交在 data/ 无变化时安全跳过。
> ⚠ git 提交会真实 commit+push，**测试时必须隔离**（见 §4.3）。

### 1.9 `run_full_test.py` 完整自测
同 `--init`，是 `--init` 的实际载体；`--dry-run` 只打印计划不执行。

---

## 2. 完整回归测试清单（改代码后跑一遍）

> 目标：确认「代码有轻微改动，流程不受影响」。按成本从低到高排列，可随时中断。

### 2.1 快速（< 5 分钟，不动数据、不删数据）
```bash
# 语法自检：全部脚本能否编译
python -m py_compile run_update.py run_full_test.py scripts/basic/*.py scripts/races/*.py scripts/check_data.py

# 数据校验（只读）
python run_update.py --check

# 定向更新 1 匹（真实联网，验证 详情→成绩→本賞金→合并 链路）
python run_update.py --horse 1

# 轻量时段增量（真实联网，验证 fetch_races --since + 合并）
python run_update.py --races --since 7
```
**通过标准**：全部 exit 0；`--check` 问题 0；`fetch_log` 无新增 403。

### 2.2 中等（真实联网，不删数据）
```bash
# 基本增量幂等（建档 0 新增 + 补缺跳过）
python run_update.py --basic

# 仅台账
python run_update.py --ledger

# CI 链路（--limit 3 缩短比赛环节；记得先按 §4.3 隔离 git 提交）
python run_update.py --ci --limit 3
```
**通过标准**：各步 OK；`--basic` 建档新增 0；`--ci` 5 步按序。

### 2.3 完整（覆盖式/耗时，仅确需时）
```bash
# 比赛全量刷新（~59 分钟，覆盖式重抓成绩页）
python run_update.py --races-force

# 从 0 全量重建（~128 分钟，删空 data/）
python run_update.py --init
```
**通过标准**：见 §1.1 / §1.7 判据。

---

## 3. 排查指南（出问题时看什么）

### 3.1 日志在哪
| 场景 | 日志文件 |
|---|---|
| `run_update.py` 每次运行 | `test-logs/update-<时间戳>.log`（每步一行状态 + 详细输出） |
| `--init` / `run_full_test.py` 内部 | `test-logs/full-<时间戳>.log`（含汇总段） |
| 风控观测 | `data/fetch_log.csv`（列：`ts,script,host,path,status,dur_s,retries,note`） |
| 校验报告 | `data/check_report.md` |
| 比赛合并报告 | `data/races_report.md` |
| 意味匹配报告 | `data/studbook_report.md` |

> 日志都落在 `test-logs/`，按时间戳排序；排查时取**最新的对应策略日志**。

### 3.2 风控 / 限速问题
- 若 `fetch_log.csv` 某 host **非 200 增多 / 出现 403**：调 `scripts/{basic,races}/common.py` 的 `DOMAIN_SLEEP` 字典（按域名间隔，已带 0.8~1.2 抖动）。
- 用 fetch_log 统计各 host 失败率：`Import-Csv data/fetch_log.csv | Group-Object host | % { $bad=($_.Group|?{$_.status -ne '200'}).Count; "$($_.Name): $($_.Count) 条, 非200: $bad" }`。

### 3.3 数据缺失 / 判变盲区
- 判变 = 通算成績变化 ∪ 数据缺失（文件出赛 < 通算战数）∪ 无文件。
- 若某马「拉了通算成績却永远拉不到成绩」：跑 `--check` 看是否报「比赛数据缺失」，用 `--fix` 自动补拉，或手动 `scripts/races/fetch_races.py --id <id>` + `merge_races.py`。

### 3.4 合并 / 幂等
- 抓取脚本只写 `data/_tmp/{basic,races}/` 独立缓存，`basic.json` 只在 merge 时写一次 → 并发无覆盖。
- 增量只增不覆盖：按比赛键（race_id，无则 日付+場名+R）去重；海外场用 `(日付,場名)` 宽松键。
- 未出赛马落**空 races 文件**标记「已检查无成绩」，避免每次全量重复抓。

### 3.5 定向排查单匹
```bash
python scripts/races/fetch_detail.py --id 1,2,3   # 详情 + 判变
python scripts/races/fetch_races.py --id 1,2,3    # 成绩
python scripts/races/fetch_prize.py               # 本賞金
python scripts/races/merge_races.py --keep        # 合并（--keep 保留缓存调试）
```

---

## 4. 测试安全注意事项（务必读）

### 4.1 会删空 / 覆盖数据的策略
- `--init`：**删空整个 data/** 从 0 重建。
- `--races-force`：**覆盖式重抓全部成绩页**。
- 跑这两者前确认 data/ 可重建（或先备份），否则会丢失现有数据。

### 4.2 真实联网成本
- 全部策略会发真实请求（JBIS / netkeiba / studbook / Google Sheets），有风控风险。
- 全量相关策略耗时数十分钟到 ~2 小时，建议后台运行并定期看日志。
- 快速验证优先用 `--limit N` / `--horse` / `--since`，避免无谓全量。

### 4.3 `--ci` 的 git 提交隔离（★ 关键）
`--ci` 末尾的 `git_commit_if_changed()` 会真实 **commit + push** 到 `origin`（本仓库 remote 是 `hinotoyk/yunji-web`）。
**测试 `--ci` 时务必隔离**，避免意外推送。两种方式：
1. **打桩**：临时把 `run_update.py` 里 `git_commit_if_changed` 函数体替换为只打日志后 `return`（加 `# TEST-HARNESS` 标记），测完**必须还原**，并 `git diff run_update.py` 确认零 diff。
2. **先确认 data/ 无变化**：若 data/ 幂等无变化，git 提交会自动安全跳过（"data/ 无变化，跳过提交"）。

> 还原检查：`git diff --stat run_update.py` 应为空；`git log --oneline -1` 不应出现新提交。

### 4.4 沙箱 / 权限（若在受限环境跑）
- 若遇到 `PermissionError` 写日志/data，可能是文件沙箱为只读——需以写权限运行（本测试用 `workspace-write`）。
- `--ci` 涉及 git，运行环境需有 git 与 remote 权限；CI 里由 GitHub Actions 提供。

---

## 5. 新增策略 / 改动时的检查清单

新增一种策略或改动流程后，对照本清单确认没破坏既有行为：
1. `python -m py_compile` 全部脚本通过（§2.1）。
2. `--check` 问题 0（数据一致性不回归）。
3. `--horse 1` 单匹链路 OK（详情→成绩→本賞金→合并）。
4. 若改了增量/判变逻辑：`--races --since 7` + `--basic` 幂等（无多余新增）。
5. 若改了合并/収得：跑 `--races-force --limit 3` 或局部 `merge_races.py --keep` 验证幂等。
6. 若改了入口分派（`run_update.py` main）：分别冒烟 1 个增量 + 1 个只读策略，确认分派与参数传递正确。
7. 全量确需时再跑 `--init` / `--races-force` 做端到端回归。

---

## 6. 参考

- 策略设计说明：根 `README.md`（更新策略表）、`HANDOFF.md` 附录 D
- 基础部分实现：`scripts/basic/README.md`
- 竞赛部分实现：`scripts/races/README.md`
- 请求·数据流路径图：`request-path.html`
