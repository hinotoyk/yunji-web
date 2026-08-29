# yunji-web-refactor · 重构工作区

「云迹」业务重构专用副本：**业务流程节点清晰化 + 网络请求线性化**（不兜兜转转）。
原项目 `Z:\IdeaProjects\yunji-web` 只读参考，本目录是全部重构工作的落脚点。

## 目录结构

```
yunji-web-refactor/
├── scripts/
│   ├── basic/                 # 基础部分脚本（建档 + 基本信息，更新少）
│   │   ├── common.py          #   共享：请求/限速/缓存（指向根 data/）
│   │   ├── build_registry.py  #   建档：JBIS 産駒一覧 → basic.json
│   │   ├── fetch_pedigree.py  #   并发1：JBIS 血統
│   │   ├── fetch_nk_id.py     #   并发2：netkeiba 列表 → nk_id
│   │   ├── fetch_studbook.py  #   并发3：studbook 意味・由来
│   │   ├── fetch_detail.py    #   阶段四：netkeiba 详情字段
│   │   ├── merge_basic.py     #   合并 → basic.json → 删 _tmp/basic/
│   │   ├── run_all.py         #   基础编排
│   │   └── README.md          #   基础部分说明
│   └── races/                 # 竞赛部分脚本（逐场成绩 + 収得，更新频繁）
│       ├── common.py          #   共享：请求/限速/缓存（独立副本，指向根 data/）
│       ├── racelib.py         #   域规则：场地分类/格推导/収得賞金
│       ├── fetch_detail.py    #   ① 详情更新 + 通算成績判变
│       ├── fetch_races.py     #   ② 成绩页增量
│       ├── fetch_prize.py     #   ③ 本賞金（race/nar SP 域）
│       ├── fetch_ledger.py    #   ④ 台账海外
│       ├── merge_races.py     #   ⑤ 合并回写 → 删 _tmp/races/
│       ├── run_all.py         #   竞赛编排
│       └── README.md          #   竞赛部分说明
├── data/                      # ★ 全部数据统一存放（两部分的共同产物）
│   ├── basic.json             #   唯一数据源（建档 + 基本信息 + 竞赛字段）
│   ├── pedigree/{id}.json     #   基础产出：5 代血统拆分文件
│   ├── races/{id}.json        #   竞赛产出：逐场成绩文件
│   ├── _tmp/
│   │   ├── basic/             #   基础并发缓存（merge_basic 后删）
│   │   └── races/             #   竞赛环节缓存（merge_races 后删）
│   ├── fetch_log.csv          #   风控请求日志（基础+竞赛统一记录，script 列区分）
│   ├── studbook_report.md     #   基础：意味匹配报告
│   └── races_report.md        #   竞赛：每次合并更新报告
├── request-path.html          # ★ 唯一「请求·数据流」路径图（基础+竞赛 6 场景）
├── README.md                  # 本文件（总览）
└── HANDOFF.md                 # 交接文档（含数据契约与历史）
```

## 设计要点

1. **脚本分开 · 数据统一**：`scripts/basic/` 与 `scripts/races/` 代码完全隔绝（各自独立
   `common.py`，互不 import）；但**全部数据都落在根 `data/`**，两个部分共享同一个
   `data/basic.json`，引用零跨目录。
2. **引用口径 = 站点根相对**：basic.json 里的 `pedigree_file = "data/pedigree/{id}.json"`、
   `races_file = "data/races/{id}.json"`，`data/` 整体就是将来站点根的 `data/`，无需改写。
3. **两条线性单链**（详见 request-path.html）：
   - 基础：JBIS 建档 → 并发三件套（血统/nk_id/意味）→ netkeiba 详情 → merge_basic
   - 竞赛：详情更新+判变 → 成绩增量 → 本賞金 → 台账海外 → merge_races
4. **缓存 + 合并模式**：抓取脚本只写 `data/_tmp/{basic,races}/` 独立缓存，merge 时统一写
   basic.json 并删缓存 → 可并发、无覆盖。
5. **按域名限速 + 统一风控日志**：`data/fetch_log.csv` 含 `script/host` 列，可全局观测
   各域名 403/失败率，据此调 `DOMAIN_SLEEP`。

## 运行流程

```bash
# 基础部分（建档，一般只跑一次）—— scripts/basic/ 下
python run_all.py                          # 并行抓取(血统/nk_id/意味) + 详情 + 合并

# 竞赛部分（每次出赛日/海外赛后跑）—— scripts/races/ 下
python run_all.py                          # ①详情+判变 → ②成绩增量 → ③本賞金 → ④台账 → ⑤合并
python run_all.py --limit 20               # 试跑（看风控）
python run_all.py --force                  # 成绩页全量重抓
```

依赖：`requests`、`beautifulsoup4`、`lxml`。

## 更新策略（统一入口 `python run_update.py <策略>`）

日常更新与 GitHub Actions 定时都走这一个入口（详细输出进 `test-logs/update-<时间戳>.log`，stdout 每步一行状态）：

| 策略 | 命令 | 做什么 | 适用 |
|---|---|---|---|
| 初始化 | `--init` | 删空 data/ 从 0 全量（= run_full_test.py 完整自测流程） | 首次部署 / 重建 |
| 基本增量 | `--basic [--year 2025,2026]` | 新马对账建档（同 jbis_id/(母名,生年) 自动跳过）+ 补缺（血统/nk_id/意味/详情，已有跳过）+ merge | 日常基本数据 |
| 比赛增量 | `--races` | 详情更新+判变 → 成绩增量(判变∪缺失∪无文件) → 本賞金 → 台账海外 → 合并 | 赛后日常 |
| 定向更新 | `--horse 1,2,3` | 只处理指定 id 的马（详情+成绩+本賞金+合并） | 手动补单匹 |
| 比赛全量刷新 | `--races-force` | 全部马重抓成绩页（覆盖式重建） | 规则变更 / 历史数据修正 |
| 数据校验 | `--check [--fix]` | 引用完整性 + 通算战数 vs 文件出赛 + 重复检测；`--fix` 自动补跑/清理 | 健康检查 / CI 收尾 |
| 轻量时段增量 | `--races --since N` | 只抓最近 N 天内出赛的马 + 无文件马（不跑详情/判变） | 高频定时轻量跑 |
| 仅台账 | `--ledger` | 只拉台账海外并入 | 台账更新频繁时 |
| CI 全自动 | `--ci [--year …]` | 基本增量 + 比赛增量 + 校验 + git 提交（data/ 有变化才提交） | GitHub Actions 每日 |

> GitHub Actions：`.github/workflows/update-data.yml` 每天 UTC 22:00 定时跑 `--ci`，也支持手动触发选策略。
> 数据仓库模式：`data/` 直接提交进 git，跑完有变化就 commit+push（需仓库开启 Actions 读写权限）。
> 部署（GitHub Pages 前端）不在本次范围内，后续另配 workflow 监听数据变更触发。

## 边界 / 纪律

- **本目录** = 重构工作区，随便改；**原项目** `Z:\IdeaProjects\yunji-web` = 只读参考，严禁改动。
- 参考底线：请求怎么发、结果怎么解析可以抄；业务流程怎么组织必须自己重新设计（线性化）。
- 两个部分的 `common.py` 各自独立维护，不要互相 import（保持代码隔绝，仅数据层汇合）。
- 缓存命名空间已按 `_tmp/basic/`、`_tmp/races/` 分开，两部分的 `detail.json` 等缓存不会互踩。
