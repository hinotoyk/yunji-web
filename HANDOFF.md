# yunji-web-refactor · 重构交接文档

> 用途：**业务重构专用副本**。目标是让「业务流程节点清晰化、网络请求线性化（不兜兜转转）」。
> 本目录是干净起点：**不含 .git / .idea / __pycache__ / 历史快照 / 数据**。
> 后面的所有重构工作都在**本目录**进行；原项目只读参考，不要改动。

---

## 0. 一句话原则（写给后来人）

> **旧代码能「参考」，不能「照抄」业务逻辑。** 尤其是——请求怎么发、结果怎么解析，这两块可以参考原项目的做法；但整个流程的组织、谁调谁、何时兜底、何时回退，必须按「线性、单链」的思路重新设计，不要继承旧代码里绕来绕去的分支。

---

## 1. 原项目位置

- **原项目根目录：** `Z:\IdeaProjects\yunji-web`（GitHub 仓库 `hinotoyk/yunji-web`，branch `main`）
- **本重构副本：** `C:\Users\hinotoyk\Desktop\yunji-web-refactor`（本目录）
- 原项目是 GitHub Pages 托管的静态站「云迹」：铁鸟翱天（コントレイル，netkeiba id `2017101835`）产驹资料库，供个人查阅/检索。

> 想看原项目的完整 README / 数据契约，直接打开：
> `Z:\IdeaProjects\yunji-web\README.md`
> `Z:\IdeaProjects\yunji-web\HANDOFF.md`
> `Z:\IdeaProjects\yunji-web\docs\data-contracts.md`
> `Z:\IdeaProjects\yunji-web\page\request-path.html`（单匹马请求链路节点图——你现在想重新梳理的就是它）

---

## 2. 原项目目录结构速览

```
yunji-web/  (原项目，只读参考)
├── page/                    # 前端页面（纯静态，浏览器 fetch 本地 JSON）
│   ├── index.html           # 主从分栏 SPA：列表 + 详情（血统/成绩/近况），hash 深链接
│   ├── pedigree.html        # 完整血统图（hash 深链接）
│   ├── request-path.html    # ★ 单匹马「请求链路」节点图（你要重构的对象，参考它）
│   ├── data-util.js         # 前端数据加载/解析工具
│   └── race-ui.js           # 前端「比赛成绩」组件：KPI 卡 + 逐场履历表（过滤/排序）
├── data/                    # 全部为构建产物/抓取缓存，重构时不用照搬
│   ├── basic.json           # 契约C：前端唯一数据源（{_meta, horses}，勿手改）
│   ├── registry.json        # 身份映射表：本地 id ↔ nk_id/jbis_id ↔ 名字历史
│   ├── raw/                 # 抓取原始数据：netkeiba.json / jbis*.json / netkeiba_races.json / fetch_log.csv
│   ├── races/google_ledger.csv   # Google Sheets 比赛台账快照（契约B）
│   ├── racefiles/ pedigree/      # 每匹 races / 血统树 拆分文件（M5.3）
│   └── sync-report.md merge-report.md manifest.json  # 各类报告/版本清单
├── scripts/                 # ★ Python 后端：抓取 → 解析 → 合并（核心逻辑都在这）
│   ├── adapters/            # 数据源适配器（唯一知道源格式的代码）
│   │   ├── sheets_ledger.py     # Google Sheets 台账：下载 CSV → 契约B 记录
│   │   └── netkeiba_races.py    # netkeiba 成绩数据读取（load_races_db/fetch/load_jockeys）
│   ├── racelib.py           # ★ 比赛域公共逻辑：契约B 校验/场地推导/汇总统计/収得賞金规则（与源无关）
│   ├── pull_races.py        # 比赛流水线：适配器 → 契约B → google_ledger.csv + sync-report
│   ├── scrape_netkeiba.py   # ★ netkeiba 主源抓取：列表/详情/血统/成绩（--all/--new/--ped/--races/--horse/--name）
│   ├── scrape_jbis.py       # ★ JBIS 兜底抓取：基础信息 + 5代血统（--all/--horse/--fill）
│   ├── build-data.py        # 唯一构建器：契约A+契约B+registry → basic.json + 拆分文件 + 快照
│   ├── test-data.py         # 抽样校验 + 契约断言
│   └── tools/               # 一次性工具：build_registry.py（身份种子）/ build_jockeys.py（骑手字典）
├── docs/
│   ├── PROJECT.md           # 项目总纲与数据知识库（唯一入口）
│   └── data-contracts.md    # 数据契约定义（A/B/C + 换源规则）
├── .github/workflows/       # deploy.yml / update-data.yml（定时同步+自动部署）
├── history/                 # 历史版本快照（最多 30 个）
├── HANDOFF.md  README.md    # 项目文档
└── run-flow-test.py  mutate_test.py  # 流程/变异测试
```

---

## 3. 原项目的数据契约（理解「谁产出什么」）

> 原项目最核心的设计是「**契约分层**」：每一层只消费约定好的数据格式，与具体数据源解耦。
> 你重构时可以**保留这个好习惯**，但不要让「层」多到流程绕圈。

| 契约 | 内容 | 谁产出 |
|---|---|---|
| 契约A | 马匹基本数据 / 5代血统（`data/raw/*.json`） | `scrape_netkeiba.py` + `scrape_jbis.py` |
| 契约B | 比赛记录（`google_ledger.csv` + `netkeiba_races.json`） | `pull_races.py`（经 adapters） |
| 契约C | 合并产物 `basic.json`（前端唯一数据源） | `build-data.py` |

**数据源：**
- 子嗣清单/基础信息 → **netkeiba**（主源，`horse/list.html?sire_id=2017101835`）
- 5代血统图 → **JBIS**（辅源，`jbis.or.jp/horse/{id}/pedigree/`）
- 比赛数据 → netkeiba 成绩页（主）+ Google Sheets 台账（海外补缺/兜底）

---

## 4. 各文件/方法「是干嘛的」——按请求→解析→合并分三层讲

### 4.1 请求层（怎么发请求 —— 这块**重点参考**）

**`scrape_netkeiba.py`（netkeiba 主源抓取）**

| 方法/函数 | 干嘛的 |
|---|---|
| `fetch(url, retries=3, encoding="euc-jp")` | **核心请求函数**。GET + 按编码解码。netkeiba db 域默认 **EUC-JP**；带 UA/重试/超时；写 fetch_log 风控观测 |
| `jitter(base)` | 请求间隔抖动：`base × 0.8~1.2`，防限流（默认 6.5s） |
| `log_fetch(...)` | 记录最小请求信息到 `data/raw/fetch_log.csv`（风控观测，失败不影响抓取） |
| `soup_of(url)` | fetch + BeautifulSoup(lxml) 便捷封装 |
| `fetch_list_all(limit, sleep)` | 逐页翻 `list.html` 列表页，收集全部子嗣（列表行 → `parse_list_row`） |
| `resolve_by_name(name)` | 按马名扫列表定位 nk_id |
| 入口 `main()` / `run_new()` / `run_races()` | 命令行分派：`--all`(全量) `--new`(新马对账) `--ped`(补血统) `--races`(成绩) `--horse`/`--name`(单匹) |

**`scrape_jbis.py`（JBIS 兜底抓取）**

| 方法/函数 | 干嘛的 |
|---|---|
| `fetch(url, retries=3)` | 请求函数（JBIS 默认 utf-8；403 限流退避 `20+attempt*15`s） |
| `build_id_map(sleep)` | 按 5 个生年逐页扫 JBIS 産駒一覧 → `{馬名: {jbis_id, 生年}}` |
| `search_candidates(name)` | 按马名精确搜索 → 前 5 个 jbis_id 候选 |
| `is_contrail_progeny(ped)` | **防同名异马**：校验血统树父侧 G1 是否为コントレイル |

**`scripts/adapters/sheets_ledger.py`（Google Sheets 台账）**

| 方法 | 干嘛的 |
|---|---|
| `_download(url)` | 下载 CSV（标准 TLS → 失败降级不校验证书） |
| `fetch(url)` | 读 CSV → 按 `COLUMN_MAP` 列名映射 → 契约B 字符串记录（日期规范化为 `YYYY-MM-DD`） |

### 4.2 解析层（怎么解析结果 —— 这块也**重点参考**）

**`scrape_netkeiba.py` 的解析函数**

| 方法 | 干嘛的 |
|---|---|
| `parse_list_row(tr)` | 列表行 → `{nk_id, 馬名, 性別, 生年, 母名, 母父名, 調教師, 馬主, 生産牧場, 総賞金}` |
| `parse_txt01(txt)` | 详情标题文本 → `{status, sex, color, age}`（现役/抹消、牡/牝、毛色、馬齢） |
| `parse_detail(html, nk_id)` | 马详情页 `db_prof_table` → 基础信息（英文名、セリ取引価格 等） |
| `parse_pedigree(html)` | **5代血統表**：netkeiba 是 DFS 先序对角级联表，用 rowspan 重建二叉树 → BFS 分层 → `{父,母}` 各 5 层；另解析 **FNo** 和 **クロス**（`div.blood_cross` 隐藏字段 → JBIS 风格记法） |
| `parse_races(html)` | 成绩页 `db_h_race_results` 表 → 逐场契约B记录（含稳定 id：`race_id`/`jockey_id`） |

**`scrape_jbis.py` 的解析函数**

| 方法 | 干嘛的 |
|---|---|
| `parse_progeny_rows(html)` | 産駒一覧 div → `{馬名: {jbis_id, 生年}}` |
| `parse_detail(html)` | JBIS 详情 `dl.data-4-1` → 基础信息（含総賞金「万円」→ 数字） |
| `parse_pedigree(html)` | JBIS 5代血統（BFS 层序 1+2+4+8+16）→ `{父,母}` 5 层 + fno + cross |

**`scripts/racelib.py`（比赛域公共逻辑，与源无关）**

| 方法 | 干嘛的 |
|---|---|
| `coerce_record(row, issues)` | **契约B 类型化**：字符串行 → 规范化记录（校验日期/結果/距離/場名，非法记入 issues） |
| `venue_type(name)` | 場名 → 中央/地方/海外/未知 |
| `race_meta_from_name(name)` | レース名 → `(格, 条件)`（GI/GII/GIII/Jpn*/L/OP） |
| `compute_stats(recs)` | 逐场履历 → 汇总统计（出赛/胜/连对/胜率/赏金/重赏/距离别…；主口径=中央+地方） |
| `compute_honsho_prize(rec)` | 从 4/5着 赏金反推本賞金（回退用） |
| `compute_shutoku(recs)` / `compute_shutoku_jpn(recs)` | **収得賞金**规则（中央/地方 Jpn 两套） |
| `compute_age(race_date, birth)` | 比赛日实时年龄（JRA 表记） |
| `strip_country_suffix(name)` | 去国家后缀 `(JPN)/(USA)…`（身份归一化） |
| `is_unnamed_name(name)` | 占位名判定（未命名仔） |

### 4.3 合并/组装层（这块**可以少参考**，是流程乱的重灾区）

**`scripts/build-data.py`（唯一构建器）** —— 原项目流程最绕的部分，**重点改造对象**

| 方法 | 干嘛的 | 为什么绕 |
|---|---|---|
| `load_registry()` / `resolve_identity()` | 身份映射：nk_id→jbis_id→(馬名,生年) 逐级解析 | 三层兜底 + 改名簿记 |
| `merge(...)` | netkeiba 主 + JBIS 兜底 + 血统增强合并 | 兜底/回退/补 keys/改名 交织 |
| `_fill_from_jbis(target, j, reg)` | JBIS 记录并入已有 netkeiba 实体 | 5 个分支条件 |
| `attach_races(...)` | 比赛数据关联（netkeiba 主 + 台账海外补缺） | 匹配链 + 合并 + 派生，多路并进 |
| `_match_ledger_to_existing(...)` | 台账海外马匹配已有马 | 又一层匹配链 |
| `compute_shutoku` 组装 | 収得計算 | 挂在 attach 里 |
| `write_split_files` / `build_basic` | races/血统树拆文件，basic.json 只留引用 | 输出结构复杂 |

**`scripts/pull_races.py`** —— 适配器 → 契约B → csv + 报告（相对清爽，可参考其「单链」写法）。

**前端**
- `page/index.html` + `page/data-util.js` + `page/race-ui.js`：纯静态展示，fetch 本地 JSON。重构时前端基本可复用展示层，但请求/数据流逻辑要按新流程重写。

---

## 5. 原项目的「乱」在哪里（重构重点清单）

结合 `request-path.html` 节点图，原流程的复杂点集中在：

1. **同一匹马，netkeiba 和 JBIS 两套源来回兜底**：netkeiba 无马 → JBIS 找 → 找到再校验父系 → 合并时又补 keys/改名 → 还可能再被 netkeiba 补录。来回跳。
2. **比赛数据三个来源三套逻辑**：netkeiba 成绩页（主）+ Google Sheets 台账（海外补缺）+ 収得賞金需要额外抓比赛页（`race.netkeiba.com` / `nar.netkeiba.com`），还要 SP 域解析失败后回退 db 域。**一级一级往回退**。
3. **収得賞金（本賞金）抓取是「事后补刀」**：成绩页拿不到本賞金，要按 race_id 再发请求去比赛结果页抓，还要回退——这是典型的「兜兜转转」。
4. **registry 身份映射 + 改名 + 兜底匹配链**：`resolve_identity` 一层套一层。

**重构目标（你定的）：**
- 业务节点清晰化：每个节点只做一件事，职责单一。
- 网络请求**线性**：一条直链走到底，不做「A 失败回退到 B」的反复绕圈。
- 可复用旧代码的**请求方法**和**解析函数**（4.1 / 4.2 的表格），但**不继承**合并/兜底/回退的业务流程（4.3）。

---

## 6. 重构建议路线（仅供参考）

1. **先定数据流主链**：把「抓取单匹马」定义成一条**单向线性链**，每个环节一个明确输入/输出，避免回退。
2. **请求层复用**：直接搬 `scrape_netkeiba.py` 的 `fetch`/`parse_detail`/`parse_pedigree`、`scrape_jbis.py` 的解析、`racelib.py` 的规则——这些是「怎么请求/怎么解析」的稳定代码。
3. **合并层重写**：用简单的「主源优先、辅源仅补齐缺字段」替代原来的多层兜底/匹配链；砍掉不必要的回退。
4. **数据契约保留但简化**：保留「每层消费固定格式」的好处，但减少层数，让链路更直。
5. **前端**：`index.html`/`race-ui.js` 的展示可以保留，数据加载逻辑按新 basic.json 结构重写。

---

## 7. 常用命令（原项目，供你跑通流程参考）

```bash
# 从原项目根目录运行：
python scripts/scrape_netkeiba.py --name アオイハルカ   # 单匹：请求 netkeiba 详情+血统（参考请求/解析）
python scripts/scrape_netkeiba.py --ped                  # 只补血统
python scripts/scrape_jbis.py --horse アオイハルカ       # JBIS 单匹兜底
python scripts/pull_races.py                             # 比赛台账 → csv
python scripts/build-data.py --note "手动更新"           # 合并 → basic.json
python scripts/test-data.py                              # 契约校验
```

> ⚠ 依赖：`requests`、`beautifulsoup4`、`lxml`。本重构副本**不含数据/缓存**，跑流程前需从原项目拷 `data/` 或重新抓取。

---

## 8. 边界与纪律

- **本目录** = 重构工作区，随便改。
- **原项目** `Z:\IdeaProjects\yunji-web` = **只读参考**，严禁改动。
- 参考的底线：**请求怎么发、结果怎么解析** 可以抄（4.1/4.2）；**业务流程怎么组织** 必须自己重新设计（线性化）。
- 不要在重构副本里复制 `.git`/`.idea`/`__pycache__`/`history` 这类非源码内容，保持干净起点。

---

## 附录 A：基础部分（第一部分）已落地

> 与「竞赛相关（第二部分）」分离。基础部分 = 建档 + 基本信息，已实际搭建在 **`scripts/basic/`** 目录
> （脚本）；**数据统一放在根 `data/`**（两部分的共同产物，见根 README 与附录 C）。

### A.1 目录结构

```
scripts/basic/                # 基础部分脚本
├── common.py            # 共享：请求/解析/basic.json 读写/归一化/缓存（fetch/jitter/log_fetch/load_basic/save_basic/norm_mare/write_cache/read_cache）
├── build_registry.py    # [建档] JBIS 産駒一覧 → basic.json（标准模板初始化 + 自增 id + 罗马统一拉丁）
├── fetch_pedigree.py    # [并发1] JBIS 血統 → data/pedigree/{id}.json + 缓存引用
├── fetch_nk_id.py       # [并发2] netkeiba 列表 → nk_id 缓存（按生年数组过滤 + 罗马归一化匹配）
├── fetch_studbook.py    # [并发3] studbook.jp 意味・由来 → 馬名意味 缓存（按归一化馬名匹配）
├── fetch_detail.py      # [阶段四] netkeiba 详情字段 → 缓存（含欧字馬名）
├── merge_basic.py       # ★ 合并全部缓存 → basic.json → 删缓存（按标准模板重排字段）
├── run_all.py           # 编排：阶段1 并行(血统+nk_id+studbook) → 阶段2 detail → merge
└── README.md            # 基础部分完整说明（含字段/命令/边界/按域名限速）

data/                     # ★ 统一数据根（两部分的共同产物，见根 README）
├── basic.json           # 唯一「前合并」数据源（建档 + 基本信息 + 竞赛字段）
├── pedigree/{id}.json   # 每匹 5 代血统文件（id 引用）
├── races/{id}.json      # 竞赛部分产出：逐场成绩文件
├── _tmp/basic/          # 基础并发脚本的独立缓存（merge 后自动删除）
├── _tmp/races/          # 竞赛环节缓存（merge 后自动删除）
└── fetch_log.csv        # 风控请求日志（基础+竞赛统一，含 host 列）

request-path.html        # ★ 唯一请求·数据流路径图（基础+竞赛 6 场景，浏览器打开）
```

### A.2 核心业务规则（按你说的定的）

1. **唯一性 = (母名, 生年)**：同一母马同年只建一档。母名清洗产地括注 `(GER)/(USA)` 等。
2. **罗马数字统一拉丁**：`コンヴィクションⅡ` → `コンヴィクションII`（Ⅰ/Ⅱ/Ⅲ…→I/II/III…）。建档即归一，保证 netkeiba(拉丁)/JBIS(全角) 两侧一致。
3. **建档只用 JBIS**：`jbis.or.jp/horse/0001237042/sire/progeny/?...&year={year}&items=100`，每页 100 条、翻页到底（2023=131 匹、2024=146 匹，各约 2 次请求）。兼容手动在 basic.json 按格式补马（同 `jbis_id` 或同 `(母名,生年)` 会被跳过）。
4. **建档即按标准字段模板初始化**（全部 `""`，见 A.3）；**年份走数组** `--year 2023,2024` 自由添加（2025/2026 未出赛，暂不加）。
5. **建档后分配自增业务主键 `id`**（从 1 开始），后续所有关联（血统/studbook/netkeiba/竞赛）都用 `id`。
6. **建档后 3 并发 → 缓存 + 合并（无覆盖）**：
   - 每个并发脚本**只写自己独立的 `data/_tmp/<name>.json` 缓存，不直接碰 basic.json** → 可真并行、互不覆盖。
   - 最后 `merge_basic.py` 统一合并进 basic.json 并删缓存。
   - 并发1 血统：JBIS `/horse/{jbis_id}/pedigree/` → `data/pedigree/{id}.json` + 缓存引用
   - 并发2 nk_id：netkeiba `list.html?sire_id=2017101835&limit=100&page=N&sort=age-asc`（不能指定生年，翻遍全页，只取生年在数组的马；匹配键 `(母名归一化,生年)`）
   - 并发3 意味・由来：studbook.jp（hid → 年产駒 → Honba）→ `馬名意味`（按归一化馬名匹配；未登録/未命名仔无法匹配则留空）
7. **阶段四（nk_id 齐了就做，不依赖血统/意味是否完成）**：netkeiba 详情页 → 登録状態/性別/毛色/馬齢/生年月日/産地/馬主/調教師/生産牧場/通算成績/獲得賞金/欧字馬名/セリ取引価格 写缓存（`欧字馬名` = netkeiba 英文名，已去掉旧 `英文名` 字段）。
8. **按域名限速（请求间隔可自由配置）**：`common.py` 的 `DOMAIN_SLEEP` 字典按 host 配置间隔（JBIS 1.5s / netkeiba 6.0s / studbook 1.2s / 兜底 2.0s），脚本一律 `time.sleep(common.sleep_for(url))` 按 URL 的 host 查表再乘 0.8~1.2 抖动。各域名风控强度不同，可据此自由调。
9. **风控日志含 host**：`fetch_log.csv` 增加 `host` 列（ts, script, host, path, status, dur_s, retries, note），可 grep host 统计各域名的 403/失败率，据日志调 `DOMAIN_SLEEP` 值。

### A.3 basic.json 标准字段模板（建档即初始化，默认 ""）

```json
{
  "id": 1, "nk_id": "", "jbis_id": "0001371798",
  "馬名": "アオイハルカ", "欧字馬名": "", "香港馬名": "", "自译馬名": "",
  "母名": "アオイプリンセス",
  "生年": "2023", "馬名意味": "",
  "登録状態": "", "性別": "", "毛色": "", "馬齢": "", "生年月日": "",
  "産地": "", "馬主": "", "調教師": "", "生産牧場": "",
  "通算成績": "", "獲得賞金": "", "セリ取引価格": "",
  "photo": "", "races_file": "", "pedigree_file": ""
}
```

- 建档填：`id, jbis_id, 馬名, 母名, 生年`
- 并发2 填：`nk_id`；并发3 填：`馬名意味`；并发1 填：`pedigree_file`
- 阶段四 填：`登録状態…セリ取引価格` 及 `欧字馬名`（netkeiba 英文名，**已去掉旧 `英文名` 字段**）
- `香港馬名` / `自译馬名`：手工补充字段（建档为空，待人工填写）
- `photo` / `races_file`：基础部分保留空，由后续（图片/竞赛）填

### A.4 当前数据状态（2026-08-28 建档+全量抓取）

- 建档：277 匹（2023=131 + 2024=146），id 1~277
- 血统：277/277 匹齐全（`data/pedigree/{id}.json` + `pedigree_file`）
- nk_id：276/277（1 匹未命名仔 `エスポワール` 2023 未匹配，留空待补）
- 馬名意味：203 匹（其余为未登録/未命名仔，studbook 无名字可匹配）
- 欧字馬名：214 匹；详情字段（登録状態/性別/毛色/生年月日/通算成績/獲得賞金/セリ取引価格）276/276
- `photo`/`races_file` 均空，留待后续填充

### A.5 常用命令（在 `scripts/basic/` 下）

```bash
python build_registry.py                     # 建档 2023+2024
python build_registry.py --year 2025,2026 --dry-run   # 加年份预览
python run_all.py                            # 阶段1 并行(血统+nk_id+studbook) → 阶段2 detail → merge
python run_all.py --skip-detail              # 只做阶段1 + merge
python merge_basic.py                        # 单独合并（调试 --keep 保留缓存）
python fetch_detail.py --id 1,2,3            # 单匹详情（写缓存）
python fetch_studbook.py --year 2023 --limit 12  # 限量验证意味
```

> 依赖与重构副本一致：`requests`、`beautifulsoup4`、`lxml`（netkeiba 详情用 EUC-JP，其余 utf-8）。

### A.6 与竞赛部分（第二部分）的分工

- 本 `scripts/basic/` 只做建档 + 基本信息（含血统/意味・由来/详情）。
- **竞赛相关**（逐场成绩、収得賞金、汇总统计）另立目录，消费 basic.json 的 `id`/`nk_id` 做关联，不在此处。
- 竞赛部分的请求链路要单独设计成线性（参考 §5 的「乱」清单，勿继承 netkeiba 成绩页 + 台账 + 収得賞金三源回退的老路）。
- 按域名限速与风控日志（A.2.8/9）是通用机制，第二部分同样适用（`common.py` 可直接复用或复制）。

---

## 附录 B：第二部分（竞赛相关）待办规划

> ✅ **已实现**：第二部分已按本规划落地在 `scripts/races/` 目录（脚本）+ 根 `data/`（数据），
> 与 `scripts/basic/` 代码完全隔绝。实现细节与命令见 **`scripts/races/README.md`** 与**附录 C**。
> 本附录保留为「设计思路」供对照。

> 这是「还没做」的部分，先把思路写清楚，避免做到一半才发现要绕圈。
> 核心目标：**单链线性**，消费 basic.json 的 `id`/`nk_id`，不再走原项目「netkeiba 成绩页 + Google Sheets 台账 + 収得賞金事后补刀」的三源回退老路。

### B.1 第二部分要产出的字段（回填进 basic.json）

| 字段 | 内容 | 说明 |
|---|---|---|
| `races_file` | 逐场成绩文件路径 | 每匹一个 `data/races/{id}.json`（或拆分文件） |
| `通算成績` / `獲得賞金` | 汇总统计 | 由逐场成绩推导（替代 netkeiba 详情页的展示值） |
| `収得賞金`（新字段，若需要） | 収得賞金 | 规则见原 `racelib.py` 的 `compute_shutoku`/`compute_shutoku_jpn` |

### B.2 建议的线性主链（单链，不来回退）

```
basic.json(id, nk_id)
   │  每匹马 nk_id 已就绪（276/277）
   ▼
[逐场成绩抓取]  netkeiba 成绩页  db.netkeiba.com/horse/{nk_id}/result/
   │  （一个来源；抓不到/无成绩 → 记空，不换源兜底）
   ▼
[解析 + 类型化]  逐场履历 → 稳定记录（race_id/日付/着順/距離/場名/騎手…）
   ▼
[汇总统计]       出赛/胜/连对/胜率/赏金/重赏/距離別…
   ▼
[収得賞金]       按规则计算（复用 racelib 规则，若需要）
   ▼
[合并回 basic.json]  写 races_file + 统计字段
```

### B.3 明确要做 / 不做

**要做：**
- 单源逐场成绩（netkeiba 成绩页）；抓不到就留空 + 记报告，**不**去 Google Sheets 台账补。
- 复用/迁移原 `racelib.py` 的「与源无关」规则函数：`coerce_record`（类型化）、`venue_type`、`race_meta_from_name`、`compute_stats`、`compute_shutoku`。这些是稳定规则，可参考。
- 汇总统计回填 `basic.json`，`races_file` 指向拆分文件。

**不做（避免重蹈 §5 乱象）：**
- ❌ Google Sheets 台账作为「海外补缺」的第二来源 —— 那是回退老路。
- ❌ 収得賞金「事后补刀」：从成绩页拿不到本賞金再按 race_id 另发请求去比赛结果页（`race.netkeiba.com`/`nar.netkeiba.com`）抓并回退 —— 这正是原项目最绕的地方，第二部分**必须**避免；収得賞金若成绩页能算就用算的，不能算就留空。
- ❌ registry 多层身份匹配链 —— 第二部分只消费已就绪的 `nk_id`，不再解析身份。

### B.4 并发/限速（沿用第一部分经验）

- 逐场成绩按 `id` 分片并发，但**每个脚本只写独立缓存** `_tmp/races.json`，最后统一 merge 回 basic.json（与第一部分同套并发模式，无覆盖）。
- 请求间隔走 `common.sleep_for(url)` 按域名限速（netkeiba 6.0s，风控严）；用 `fetch_log.csv` 的 host 列观测 403/失败率再调。
- 尚未开始的第三方来源（若以后加）须各自独立成脚本，只在合并层汇合，绝不跨源回退。

### B.5 第二部分开工清单（建议顺序）

1. 建 `races/` 目录与脚本骨架（`fetch_races.py` + 复用 `common.py` 的 fetch/限速/日志/缓存）。
2. 迁 `racelib.py` 的规则函数到 `races/`（或共享），先跑通「单场解析 → 类型化 → 汇总」。
3. 逐场成绩抓取 + 缓存 + merge 回填 `races_file` / `通算成績` / `獲得賞金`。
4. 决定収得賞金口径：能由成绩页算就实现；不能则明确留空并记录（不引入回退抓取）。
5. 更新 `request-path.html` 加入竞赛链路节点、`README`、本 HANDOFF 附录。

> 数据前提：basic.json 已有 277 匹、nk_id 276/277（1 匹未命名仔待补）。第二部分从 nk_id 就绪的马开始。

---

## 附录 C：第二部分（竞赛相关）已落地 · `scripts/races/`

> 按用户拍板的流水线实现，与 `scripts/basic/`（建档）代码完全隔绝；`data/basic.json` 为唯一
> 共享数据（数据统一放根 `data/`），竞赛部分消费它的 `id`/`nk_id`，回填竞赛字段。
> 完整说明见 **`scripts/races/README.md`**。

### C.1 线性主链（五环，单链不来回退）

```
data/basic.json(id, nk_id)
  │ ① fetch_detail.py   db.netkeiba.com/horse/{nk_id}/（EUC-JP）
  │    会变化字段无条件覆盖：登録状態/性別/馬齢/馬主/調教師/通算成績/獲得賞金
  │    稳定字段非空才覆盖：毛色/生年月日/産地/生産牧場/欧字馬名/セリ取引価格
  │    通算成績判变（两侧去空白后精确比较）→ _tmp/races/changed.json
  ▼
 ② fetch_races.py       db.netkeiba.com/horse/result/{nk_id}/（EUC-JP）
    目标 = 判变马 ∪ 尚无 races 文件（首次全量初始化）∪ 数据缺失（文件出赛数 < 通算战数）∪ --force 全部
    与已有文件按比赛键去重 → 只写新增 → _tmp/races/races.json
  ▼
 ③ fetch_prize.py       race.netkeiba.com（中央）/ nar.netkeiba.com（地方）SP 页
    只拉収得需要的场次：新增记录里 中央重赏 1/2着、地方 Jpn 1/2着
    页内「本賞金:1着,2着,…万円」阶梯取该马自己着順那档 → _tmp/races/prize.json
  ▼
 ④ fetch_ledger.py      Google Sheets 台账 CSV → 只保留海外场 → 按馬名匹配（去国家后缀）→ 增量 → _tmp/races/ledger.json
  ▼
 ⑤ merge_races.py       合并新增记录进 data/races/{id}.json（去重，已有不动）
                        附本賞金 → 由完整履历统一计算 収得賞金（racelib 规则，无网络）
                        回填 basic.json（通算成績/獲得賞金/収得賞金/races_file）
                        → 写 races_report.md → 删 _tmp/races 缓存
```

### C.2 关键决策

1. **脚本隔绝 · 数据统一**：`scripts/races/` 自带 `common.py`（请求/限速/缓存）与 `racelib.py`
   （域规则）副本，不 import scripts/basic/ 的任何代码；但**数据统一放根 `data/`**，
   与基础部分共享 `data/basic.json`，引用零跨目录。基础部分建档完成后基本不再跑，竞赛部分频繁更新。
2. **判变 = 变化 ∪ 缺失**：抓成绩页的马 = 通算成績 变化 ∪ 尚无 races 文件（首次全量初始化）
   ∪ 数据缺失（文件出赛数 < 通算战数，如上次抓取失败落空文件、只并入了台账海外记录）→
   自动补拉，杜绝「先拉通算成績、后面永远拉不到比赛成绩」的盲区。判变比较做了去空白，避免格式噪音造成误判。
3. **本賞金只拉収得需要的场次**（中央重赏 / 地方 Jpn 的 1/2着）；海外不参与収得、非重赏 1着
   用固定额，都不拉。収得計算放在合并环（纯规则），网络只发生在 ①②③④。
4. **台账只留海外场**：netkeiba 成绩页聚合中央+地方+海外，台账仅补海外漏；馬名匹配做
   「去国家后缀」归一（`Grand Warrior(JPN)` ↔ `Grand Warrior`）。
5. **修复**：障害重赏 netkeiba 记法为 `(JG1)` 阿拉伯数字，racelib 已兼容并归一为
   JGI/JGII/JGIII（原项目规则只认罗马数字，会漏算障害重赏）；海外 `(G1)` 同样归一为 GI。
6. **races_file 口径** = `data/races/{id}.json`（站点根相对，与 pedigree_file 一致）；
   实体文件在 `data/races/{id}.json`（根 data/ 即站点根 data/）。

### C.3 常用命令（scripts/races/ 下）

```bash
python run_all.py                  # 完整流水线 ①→②→③→④→⑤
python run_all.py --limit 5        # 调试：每环只处理前 5
python run_all.py --skip-ledger    # 跳过台账环节
python run_all.py --force          # 成绩页全量重抓
python merge_races.py --keep       # 单独合并（保留缓存调试）
```

### C.4 数据状态与验证

- 已做离线自测：详情回填 / 比赛键去重幂等 / 本賞金附着 / 収得計算（含 2歳 GⅢ 固定额、
  Jpn 分段、障害 JG、缺失报告）均验证通过；`py_compile` 全脚本通过。
- **已试跑 20 匹**（2026-08-28）：详情 20/20、成绩新增 111 条、台账海外 8 条（含 Grand Warrior 7 条），
  风控日志 db.netkeiba.com 全 200 无 403；修复了 fetch_log 首次目录不存在丢日志的问题。
- **已完整从 0 测试**（2026-08-28，`run_full_test.py`，97.3 分钟）：277 匹建档 → 血统 277/277 →
  成绩 141 匹（661 条 netkeiba + 8 条台账海外）→ 収得計算 141 匹、缺本賞金 0、失败 0；
  全程 1328 条请求全 200 无 403。修复了未出赛马重复抓取问题（merge 落空文件标记已检查）。
- 遗留：id 129「エスポワール」无 nk_id，无法抓详情/成绩；台账海外场若馬名与 basic 不一致会被跳过（记报告）。

---

## 附录 D：更新策略与 GitHub Actions 定时

> 统一入口 `run_update.py`（根目录）承载 9 种更新策略；GitHub Actions（`.github/workflows/update-data.yml`）
> 每日定时跑 CI 全自动，也可手动触发选策略。数据仓库模式：**`data/` 直接提交进 git**，
> 跑完有变化就 commit+push（需仓库 Settings → Actions → 勾选 Read and write permissions）。

### D.1 策略表

| 策略 | 命令 | 做什么 |
|---|---|---|
| 初始化 | `--init` | 删空 data/ 从 0 全量（= run_full_test.py） |
| 基本增量 | `--basic [--year YYYY,…]` | 新马对账建档（重复自动跳过）+ 补缺（血统/nk_id/意味/详情，已有跳过）+ merge |
| 比赛增量 | `--races` | 详情更新+判变 → 成绩增量 → 本賞金 → 台账海外 → 合并 |
| 定向更新 | `--horse 1,2,3` | 只处理指定 id（详情+成绩+本賞金+合并） |
| 比赛全量刷新 | `--races-force` | 全部马重抓成绩页（覆盖式重建） |
| 数据校验 | `--check [--fix]` | 引用完整性 / 通算战数 vs 文件出赛 / 跨来源重复；`--fix` 自动补跑+清理 |
| 轻量时段增量 | `--races --since N` | 只抓最近 N 天出赛的马 + 无文件马（不跑详情/判变） |
| 仅台账 | `--ledger` | 只拉台账海外并入 |
| CI 全自动 | `--ci [--year …]` | 基本增量 + 比赛增量 + 校验 + git 提交（有变化才提交） |

### D.2 关键机制

- **判变 = 变化 ∪ 缺失**：成绩抓取目标 = 通算成績 变化 ∪ 无 races 文件 ∪ 数据缺失
  （文件出赛数 < 通算战数）。出赛口径 = 结果∈{名次,中止,失格}（取消/除外不算），**全部场地**
  （netkeiba 通算含海外）；兼容历史单字 DNF（中/取/除/失，merge 保存时统一归一为全称）。
- **跨来源重复**：台账海外场与 netkeiba 同场（同日同場）会重复——台账并入用 `(日付,場名)` 宽松键
  去重；`--check` 会检测跨来源重复，`--fix` 自动删台账保留 netkeiba。
- **时段增量**：`--since N` 轻量模式不跑详情/判变，直接抓「最新出赛日在 N 天内 + 无文件」的马，
  适合高频定时；完整判变由定期 `--races`/`--ci` 兜底。
- **git 提交**：`--ci` 内嵌 `git_commit_if_changed()`（data/ 有变化才 commit+push；非 git 仓库时跳过提示）。

### D.3 部署（本次范围外）

- 本阶段只做数据更新脚本 + Actions 定时；GitHub Pages 前端部署后续另配 workflow 监听数据变更触发。
