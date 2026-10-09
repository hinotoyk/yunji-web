# docs/pipeline.md · 后端数据管线说明

> 本文件由 P5 文档整理（REFACTOR.md §11 / D11）合并而来：原 `scripts/` 下三份管线 README（跨管线总说明 +
> 基础管线 + 竞赛管线）合一，源文件已删除。
> **分工**：本文件讲「怎么跑 / 两条管线各自流程 / 设计原则 / 校验编排 / 离线红线」；
> **产物字段契约与口径不在本文**，单一出处见 [`docs/SCHEMA.md`](SCHEMA.md)。

---

## 1. 总览

### 1.1 目录结构

```
scripts/
  core/           中立核心层（两条管线都依赖，本层永不 import 任一管线）
    constants.py  ROOT / DATA_DIR / BASIC_JSON / OVERRIDES_JSON / tmp_dir(管线名) / 站点 URL(NK/JBIS/STUD/SP) / COLORS / HEADERS / DEFAULT_SLEEP   # 常量单源
    net.py        domain_of / sleep_for / fetch / log_fetch / jitter / soup_of / bind()   # 限速/风控日志；管线口径形参注入
    basic_io.py   load_basic / save_basic / next_id / BASIC_FIELDS(模板+列序合一) / 缓存四件套
    manual.py     load_overrides / apply_overrides（两条管线收尾共用）
    text.py       norm / norm_mare / ROMAN_FULL / fw2hw(全量) / fw2hw_narrow(仅０-９（）)   # R7 全角转换收口
    runtime.py    install_utf8_stdout / make_lazy_getattr / install_lazy_http   # UTF-8 stdout + PEP 562 惰性导入（requests/bs4）收口，R1
    sire_config.py  读 config/sire.json（种马 ID/姓名/品牌/台账开关，纯 stdlib，中立）
    grade.py      load_grade() 读 config/grade-table.json（格→显示文案/徽章类单源，GRADED 由徽章类派生，R6）
  basic/          基础管线：build_registry → fetch_pedigree / fetch_nk_id / fetch_studbook → fetch_detail → merge_basic
  races/          竞赛管线：fetch_detail / fetch_races / fetch_ledger → merge_races（racelib = 解析与规则库）
  timeline/       build_timeline.py  → data/timeline.json
  datechart/      build_datechart.py → data/datechart.json
  stats/          build_stats.py     → data/stats.json
  check_data.py   数据一致性校验（--fix 补跑对应环节）
```

### 1.2 怎么跑

- 直跑即可，不需要 `python -m`：`python scripts/basic/merge_basic.py`、`python scripts/races/merge_races.py`、
  `python scripts/timeline/build_timeline.py`、`python scripts/check_data.py`。
  各 `common.py` 头部有一行 `sys.path` 注入（把 `scripts/` 放进去），所以 `python scripts/<管线>/xxx.py`
  这种直跑方式零改动就能 `from core import …`——**不要**改成 `python -m`（会动 `run_update.py` 的调用语义）。
- 日常/定时更新统一走项目根 `python run_update.py <策略>`（9 种策略表见根 `README.md`，验证与排查见
  `docs/TESTING.md`）；`run_all.py` 是各管线的并发编排（抓取 → 合并 → 删缓存）。
- ⚠ `fetch_*` / `run_update.py` 会联网；`--init` / `--races-force` 会删空或覆盖 `data/`；
  `--ci` 会 commit+push（测试必须隔离，见 `docs/TESTING.md` §4.3）。
  纯本地可跑：`merge_basic.py`、`merge_races.py`、三个 `build_*.py`、`check_data.py`、`verify_*.cjs`。
- **台账是可选环节**（2026-10 起按 `config/sire.json` 门控）：
  `ledger.url` 为空 = 不启用——`fetch_ledger.py` 打印「台账未启用，跳过」并 exit 0（不联网、不写缓存，
  顺带清掉残留旧缓存）；`races/run_all.py` 默认按配置开关跳过该环节，`--skip-ledger` 语义保留
  （显式跳过优先）。URL 解析优先级：`fetch_ledger.py --url` CLI 参数 > `config/sire.json` 的 `ledger.url` > 空（跳过）。
  台账启用时只补**海外场**（详见 §3.2 主链 ③）。

### 1.3 设计原则（线性流）

- 每个脚本只负责一条独立业务链路，无跨源来回兜底。
- 请求统一走 `fetch()`：重试 + 风控日志（`data/fetch_log.csv`）+ 按域名限速（`DOMAIN_SLEEP`，带 0.8~1.2 抖动）。
- `basic.json` 是唯一「前合并」数据源，各并发脚本**不直接碰它**，只写自己的独立缓存
  `data/_tmp/<管线>/<name>.json`（键均为 `str(id)`），因此可真正并行、互不覆盖；
  最后由该管线的 `merge_*.py` 统一合并进 `basic.json` 并删除缓存（`--keep` 保留缓存调试）。
- 竞赛管线只消费 `basic.json` 的 `id` / `nk_id`，回填竞赛字段
  （`races_file` / `通算成績_逐场` / `収得賞金` / `性別_当前`）。
- 派生产物（timeline / stats / datechart）在内容无变化时**跳过写入**：`generated_at` 每次都变，
  照写会让 `--ci` 每轮产生空 diff 提交。

### 1.4 两管线边界与中立层

- `scripts/basic` 与 `scripts/races` **业务隔离、代码抽离复用**（2026-xx 用户决策）：业务模块互不 import
  对方；共享逻辑统一下沉中立层 `scripts/core`——路径/站点/颜色等字面量常量单源 =
  `core/constants.py`（原 `paths.py` 扩展），两个 `common.py` 只做薄再导出。
- `core` 里没有「某条管线」的概念：凡两管线取值不同的**风控口径**（限速表 `DOMAIN_SLEEP`、`log_fetch`
  剥前缀的 `STRIP_BASES`），一律由各自的 `common.py` 持有并以形参注进中立层
  （`net.bind(domain_sleep, strip_bases)` → 具名 partial 集），不在中立层写死。
- 各 `common.py` 只保留本管线特有的东西：基础管线 = 限速表 `DOMAIN_SLEEP`/`STRIP_BASES` + 种马 ID
  （`sire_config` 配置驱动）；竞赛管线 = 限速表/`STRIP_BASES` + 比赛记录键
  （`race_key` / `record_keys` / `order_record` / `RACE_RECORD_ORDER`）与 `racelib` 依赖。
- `basic.json` 的字段模板与落库列序 = `scripts/core/basic_io.py::BASIC_FIELDS` 单一出处
  （建档模板 `BASIC_TEMPLATE` 与重排列序 `BASIC_ORDER` 都由它投影得到）。
- 原项目 `Z:\IdeaProjects\yunji-web` 为只读参考，业务逻辑不照抄。

### 1.5 人工值（脚本永不写）

人工钉住的字段只活在 `data/manual_overrides.json`（时间线节点在 `data/timeline_manual.json`）；
直接改 `data/basic.json` 会被第二天 CI 抹掉。两条管线的合并收尾**都**要套一次
`manual.apply_overrides`（`merge_basic.py` 写回前、`merge_races.py` 全部派生之后），否则只跑 `--basic`
就会把人工的 `馬主` / `調教師` / `登録状態` 抓取值整片覆盖。契约与 `_` 前缀键（`_orig` / `_note`）口径见
[`docs/SCHEMA.md`](SCHEMA.md) §3。

### 1.6 编辑服务（已删除）

- 原 `edit_server.py`（本机直连保存：静态 :8090 + 编辑 API + 保存即生效管道）**已于 2026-09-30 删除**
  （docs/UI优化记录.md §82.4/§82.14）：编辑台恒为**草稿箱模式**，线上提交统一走
  草稿箱 → 「提交到 GitHub」（GitHub Data API 单原子 commit）→ CI 构建约 2 分钟生效，
  本机不再需要任何编辑服务。`<owner>-<n>.<ext>` 图片命名法等约定由 front/public/editor.js 沿用。
- ⚠ 人工表会随构建进 `dist/data/` **公网可读**（含 `_note` 编辑备注）：备注只写业务理由。

---

## 2. basic 管线（建档 + 基本信息）

拉取コントレイル（鉄鳥翱天）子嗣的建档与基本信息，与「竞赛相关」分离。
脚本在 `scripts/basic/`，**数据统一放在根 `data/`**（与竞赛部分共用，见根 README）。

### 2.1 目录结构

```
scripts/basic/                 # 基础部分脚本（建档，更新少）
├── common.py            # 共享：请求/解析/basic.json 读写/归一化/缓存（指向根 data/）
├── build_registry.py    # [建档] JBIS 産駒一覧 → basic.json（标准模板初始化）
├── fetch_pedigree.py    # [并发1] JBIS 血統 → data/pedigree/{id}.json + 缓存引用
├── fetch_nk_id.py       # [并发2] netkeiba 列表 → nk_id 缓存
├── fetch_studbook.py    # [并发3] studbook.jp 意味・由来 → 馬名意味 缓存
├── fetch_detail.py      # [阶段四] netkeiba 详情字段 → 缓存
├── merge_basic.py       # ★ 合并全部缓存 → basic.json → 删缓存
└── run_all.py           # 编排：并行抓取 → 合并

data/                      # 统一数据根（根目录，两部分的共同产物）
├── basic.json           # 唯一「前合并」数据源（建档 + 基本信息）
├── pedigree/{id}.json   # 每匹马 5 代血统文件（id 引用）
├── _tmp/basic/          # 基础并发脚本的独立缓存（merge 后自动删除）
└── fetch_log.csv        # 风控请求日志（基础+竞赛统一记录，script 列区分）
```

### 2.2 业务流程（线性）

#### 0. 并发架构：缓存 + 合并（避免 basic.json 覆盖）

> 4 个抓取脚本（pedigree / nk_id / studbook / detail）各自**只写独立缓存文件**
> `data/_tmp/basic/<name>.json`，**不直接碰 basic.json** → 可真正并行、互不覆盖。
> 最后 `merge_basic.py` 统一把缓存合并进 basic.json，并删除缓存。

| 缓存文件 | 内容（key=str(id)） |
|---|---|
| `_tmp/basic/pedigree.json` | `{id: "data/pedigree/{id}.json"}` |
| `_tmp/basic/nk_id.json` | `{id: nk_id}` |
| `_tmp/basic/studbook.json` | `{id: 馬名意味}` |
| `_tmp/basic/detail.json` | `{id: {登録状態, 性別, ..., 欧字馬名, ...}}` |

#### 1. 建档 `build_registry.py`
- 唯一性 = **(母名, 生年)**：同一母马同年只建一档。
  - 母名清洗产地括注 `(GER)/(USA)` 等。
  - **罗马数字统一拉丁**：`コンヴィクションⅡ` → `コンヴィクションII`（Ⅰ/Ⅱ/Ⅲ…→I/II/III…）。
- 建档即按**标准字段模板**初始化全部字段（默认 `""`，见下「字段模板」）。
- 年份走数组（`--year 2023,2024` 自由添加）。
- 数据源 **只用 JBIS**（兼容手动在 basic.json 按格式补马：同 `jbis_id` 或同 `(母名,生年)` 会被跳过）。
- 每个年份约 2 次请求（`items=100` 翻页，2023=131 匹、2024=146 匹）。
- 建档后分配**自增业务主键 `id`**（从 1 开始），后续所有关联都用 `id`。

```bash
python build_registry.py                 # 建档 2023+2024
python build_registry.py --year 2025,2026 --dry-run   # 后续加年份（预览）
```

#### 2. 建档后并发三件套

| 并发 | 脚本 | 来源 | 产出（缓存） |
|------|------|------|------|
| 1 | `fetch_pedigree.py` | JBIS `/horse/{jbis_id}/pedigree/` | `data/pedigree/{id}.json` + `_tmp/basic/pedigree.json` 引用 |
| 2 | `fetch_nk_id.py` | netkeiba `list.html?sire_id=...&sort=age-asc` | `_tmp/basic/nk_id.json`（按生年数组过滤 + 罗马数字归一化匹配）；另写 `_tmp/basic/总赏金.json`（列表页 `総賞金(万円)` 列） |
| 3 | `fetch_studbook.py` | studbook.jp `Honba?sid=` | `_tmp/basic/studbook.json`（按归一化馬名匹配） |

> 并发2：netkeiba 列表不能指定生年，需翻遍全部分页，只取生年在数组的马；
> 匹配键 `(母名归一化, 生年)` —— 建档时母名已统一拉丁，两端天然一致。
> 并发3：studbook 无母名，只能按馬名关联；未登録/未命名仔无法匹配则留空并记报告。

#### 3. 阶段四 `fetch_detail.py`
- **依赖 nk_id**：读取 `_tmp/basic/nk_id.json` 缓存（或 basic.json 的 nk_id）。
- **不依赖**血统/意味・由来是否完成——nk_id 齐了就能跑。
- 抓 `db.netkeiba.com/horse/{nk_id}/` → 写 `_tmp/basic/detail.json`（登録状態/性別/毛色/馬齢/生年月日/産地/馬主/調教師/生産牧場/通算成績/獲得賞金 (中央)/獲得賞金 (地方)/欧字馬名/セリ取引価格）。

#### 4. 合并 `merge_basic.py`
```bash
python merge_basic.py        # 合并全部缓存 → basic.json → 删缓存
python merge_basic.py --keep # 合并但保留缓存（调试）
```

#### 一键编排
```bash
python run_all.py                     # 阶段1 并行(pedigree+nk_id+studbook) → 阶段2 detail → merge
python run_all.py --skip-detail       # 只做阶段1 + merge（不抓详情）
```

### 2.3 basic.json 标准字段模板（一条马）

字段清单、键序与派生口径 = `docs/SCHEMA.md` §1（单一出处 `scripts/core/basic_io.py::BASIC_FIELDS`）；
建档即初始化模板字段为 `""`，各脚本按 id 回填。本部分相关：

- 建档填：`id, jbis_id, 馬名, 母名, 生年`
- 并发2 填：`nk_id`；并发3 填：`馬名意味`；并发1 填：`pedigree_file`
- 阶段四 填：`登録状態…セリ取引価格` 及 `欧字馬名`（netkeiba 英文名）
- `香港馬名` / `自译馬名`：手工补充字段（建档为空，待人工填写）
- `races_file` / `収得賞金` 由竞赛部分（§3）回填；`photo` 可人工钉住。

### 2.4 按域名限速（请求间隔）

各脚本的请求间隔**按域名配置**（`common.py` 的 `DOMAIN_SLEEP`），再乘以 0.8~1.2 抖动。不同网站风控强度不同，可自由调：

```python
DOMAIN_SLEEP = {
    "www.jbis.or.jp": 1.5,       # JBIS 建档/血统
    "db.netkeiba.com": 6.0,      # netkeiba 列表/详情（风控严，保守）
    "www.studbook.jp": 1.2,      # studbook 産駒/意味
}
DEFAULT_SLEEP = 2.0              # 未匹配域名的兜底
```

- 脚本里 `time.sleep(common.sleep_for(url))` 自动按 URL 的 host 查表取间隔。
- **风控观测**：每次请求写 `data/fetch_log.csv`（含 `host` 列），运行后可统计各域名的 403/失败率，据此调整上面的值。

### 2.5 常用命令

```bash
# 在 scripts/basic/ 下运行：
python build_registry.py                       # 建档
python run_all.py                              # 并行抓取 + 合并
python merge_basic.py                          # 单独合并（调试 --keep）
python fetch_pedigree.py --id 1,2,3            # 只抓指定 id 血统
python fetch_studbook.py --year 2023 --limit 12
python fetch_nk_id.py --year 2023,2024
python fetch_detail.py --limit 5
```

### 2.6 边界 / 纪律

- 本部分是**建档 + 基本信息**，**不含竞赛**（竞赛在 §3，数据同样在根 `data/`）。
- 数据源分工：**建档只用 JBIS**；nk_id/详情用 netkeiba；意味・由来用 studbook。
- 无跨源来回兜底（线性流）；未匹配/抓取失败记报告，不阻塞。
- 并发脚本写独立缓存 `data/_tmp/basic/`，basic.json 只在 merge 时写一次 → 无覆盖风险。
- 两管线边界与中立层共用规则（互不 import、差异形参注入）见 §1.4。
- `basic.json` 写回前会套一次 `data/manual_overrides.json`（人工值优先），字段契约见 `docs/SCHEMA.md`。

---

## 3. races 管线（逐场成绩 · 収得賞金）

消费 `data/basic.json` 的 `id` / `nk_id`，产出逐场成绩文件与竞赛字段，回填 basic.json。
脚本在 `scripts/races/`，**数据统一放在根 `data/`**（与基础部分共用，见根 README）。
与基础部分（§2）**业务隔离、代码抽离复用**（2026-xx 用户决策，见 §1.4）：业务模块互不 import 对方，
共享代码统一下沉中立层 `scripts/core/`；各自独立维护脚本与限速配置，
基础部分建档完成后基本不再跑，本部分要频繁更新（每次出赛日/海外赛后可跑）。

### 3.1 目录结构

```
scripts/races/                 # 竞赛部分脚本（成绩/収得，更新频繁）
├── common.py            # 共享：请求/限速/风控日志/basic.json 读写/缓存（独立副本，指向根 data/）
├── racelib.py           # 竞赛域规则：场地分类/格推导/収得賞金/本賞金判定（与源无关）
├── fetch_detail.py      # ① 详情更新 + 通算成績判变（全部有 nk_id 的马）
├── fetch_races.py       # ② 成绩页增量（只抓 判变/无文件 的马；SP 页一次回填 格/条件/調教師/本賞金；骑手页归一骑手名）
├── fetch_ledger.py      # ③ 台账海外场增量（可选：按 config/sire.json 的 ledger.url 门控，见 §1.2）
├── merge_races.py       # ④ 合并 → data/races/{id}.json + basic.json → 删缓存
└── run_all.py           # 编排：①→②→③→④ 线性单链

data/                      # 统一数据根（根目录，两部分的共同产物）
├── basic.json           # 唯一数据源（竞赛回填 通算成績/獲得賞金 (中央)/獲得賞金 (地方)/総賞金/収得賞金/races_file）
├── races/{id}.json      # 每匹逐场成绩（持久，增量只增不覆盖）
├── _tmp/races/          # 各环独立缓存（merge 后自动删除）
├── races_report.md      # 每次合并的更新报告（脚本生成产物，留 data/）
└── fetch_log.csv        # 风控请求日志（基础+竞赛统一记录，script 列区分）
```

### 3.2 线性主链（单链，不来回退）

```
data/basic.json (id, nk_id)
   │  ① fetch_detail：db.netkeiba.com/horse/{nk_id}/（EUC-JP）
   │     会变化字段无条件覆盖：登録状態/性別/馬齢/馬主/調教師/通算成績/獲得賞金 (中央)/獲得賞金 (地方)
   │     稳定字段非空才覆盖：毛色/生年月日/産地/生産牧場/欧字馬名/セリ取引価格
   │     通算成績 判变（两侧去空白后精确比较）→ _tmp/races/changed.json
   ▼
   ② fetch_races：db.netkeiba.com/horse/result/{nk_id}/（EUC-JP）
     目标 = 判变马 ∪ 尚无 races 文件（首次全量初始化）
     与已有文件按比赛键去重 → 只写新增 → _tmp/races/races.json
     每条新增记录再抓一次 SP 比赛结果页（race/nar.netkeiba.com，同场多马共享页缓存）一次回填：
       格/条件（Icon_GradeType + RaceData02）→ 厩舎列 → 調教師(+调教师_id，厩舎名可能截断)
       → 本賞金（中央重赏 1/2着 / 地方 Jpn 1/2着 时，页内「本賞金:1着,2着,…万円」阶梯取该马着順那档）
     调教师正式名：按 trainer_id 抓 db.netkeiba.com/trainer/result/recent/{id}/（<title>）取全名，
     按 id 缓存建映射 → _tmp/races/trainers.json（台账记录匹配用）
     骑手正式名：成绩页「骑手」列是简名（佐々木大 vs 佐々木大輔、外国骑手缺首字母前缀），
     按 jockey_id 抓 db.netkeiba.com/jockey/result/recent/{id}/（<title>）取全名，
     按 id 缓存建映射 → _tmp/races/jockeys.json（运行前先读该缓存作初始映射，可跳过已抓过的骑手页）
   ▼
   ③ fetch_ledger：Google Sheets 台账 CSV → 只保留海外场 → 增量 → _tmp/races/ledger.json
     （海外 調教師 = 台账 管理調教師 值；台账未启用时整环节跳过，见 §1.2）
   ▼
   ④ merge_races：
     合并新增记录进 data/races/{id}.json（按比赛键去重，已有不动）
     台账海外记录与调教师映射比对，一致则附 调教师_id（不一致直接用台账值）
     由完整履历统一计算 収得賞金（racelib 规则，无网络，円 → 'xx万円'/'xx億xx万円'，零值保留 0）
     回填 basic.json（通算成績/獲得賞金 (中央)/獲得賞金 (地方)/収得賞金/races_file）→ 写报告 → 删缓存
```

### 3.3 常用命令（在 scripts/races/ 下）

```bash
python run_all.py                  # 完整流水线
python run_all.py --limit 5        # 调试：每环只处理前 5
python run_all.py --skip-ledger    # 跳过台账环节
python run_all.py --force          # 成绩页全量重抓
python run_all.py --keep           # 合并后保留缓存（调试）
python fetch_detail.py --id 1,2,3  # 只更新指定 id 详情
python fetch_races.py --limit 5    # 只抓前 5 匹成绩
python merge_races.py --keep       # 单独合并（保留缓存调试）
```

### 3.4 关键规则

- **增量只增不覆盖**：已有逐场记录不动，只追加比赛键（race_id，无则 日付+場名+R）不存在的记录。
  未出赛的马会落一个**空 races 文件**标记「已检查无成绩」，避免每次全量跑重复抓。
- **判变 = 通算成績 变化 ∪ 数据缺失**：除了「通算成績 去空白后精确比较」外，还做**数据完整性校验**——
  文件里 中央+地方 实际出赛数（結果为名次/中止/失格）必须 ≥ 通算成績 的应有战数；
  不足（如上次抓取失败落了空文件、或只并入了台账海外记录）→ 自动补拉，**杜绝「永远拉不到成绩」**。
  首次运行时所有马都没有 races 文件 → 全量初始化，不依赖判变。
- **収得賞金口径**（racelib）：中央重赏 1/2着 = 该马着順本賞金×50%（2歳 GⅢ 固定 1600/600万）；
  非重赏 1着 固定额（新馬/未勝利 400万、1勝 500万、2勝 600万、オープン 600万、3勝 900万）；
  地方 Jpn 1/2着 分段规则；障害归障害表；海外不计入。缺本賞金按 0 暂计并写入报告。
- **本賞金 = SP 页解析**（② 内完成，不再有独立 ③ fetch_prize 环节）：中央重赏 1/2着 + 地方 Jpn 1/2着
  才需要，海外/非重赏不拉；与 格/条件/厩舎 同一 URL，同场多马共享页缓存。
- **調教師 = SP 页厩舎列 + 调教师页正式名**：厩舎名可能截断（手塚久 vs 手塚貴久），
  按 trainer_id 抓调教师页 <title> 取正式全名（按 id 缓存建映射）；海外 = 台账 管理調教師 值，
  与映射比对一致才附 调教师_id，不一致直接用台账值。
- **騎手 = 成绩页骑手列 + 骑手页正式名**：成绩页骑手列是简名（佐々木大 vs 佐々木大輔、
  外国骑手缺首字母前缀 ルメール vs Ｃ．ルメール），按 jockey_id 抓骑手页 <title> 取正式全名
  （按 id 缓存建映射，_tmp/jockeys.json 可预置跳过重抓）；台账海外记录无 jockey_id 保持台账值。
  ⚠ 骑手/调教师的 id 命名空间有重叠（同数字可能分属两人），两个映射必须分文件、按页面类型取。
- **台账只留海外场**：netkeiba 成绩页聚合中央+地方+海外，台账仅补海外漏；海外场不参与収得。
  馬名匹配做「去国家后缀」归一（`Grand Warrior(JPN)` ↔ `Grand Warrior`）。

### 3.5 按域名限速（common.py 的 DOMAIN_SLEEP）

| 域名 | 间隔 | 用途 |
|---|---|---|
| db.netkeiba.com | 6.0s | 详情 / 成绩页 / 调教师页（风控严） |
| race.netkeiba.com | 2.0s | 中央 比赛结果页（SP 域，格/条件/厩舎/本賞金） |
| nar.netkeiba.com | 2.0s | 地方 比赛结果页（SP 域） |

每次请求写 `data/fetch_log.csv`（含 host 列），可统计各域名 403/失败率后调整间隔。

### 3.6 边界 / 纪律

- 本部分是**竞赛相关**，只做逐场成绩 + 収得，不碰建档/血统（那些在 §2）。
- 单源线性：成绩只走 netkeiba 成绩页，台账只补海外；任何环节失败记报告，**不跨源回退**。
- 抓取脚本只写 `data/_tmp/races/` 独立缓存，`basic.json` 只在 merge 时写一次 → 无覆盖风险。
- 两管线边界与中立层共用规则（互不 import、`race_key`/`record_keys`/限速表/剥前缀形参注入）见 §1.4。
- 人工表 `data/manual_overrides.json` 在**全部派生之后**套用（`merge_basic.py` 写回前也套同一份），
  字段契约见 `docs/SCHEMA.md` §3。
- `races_file` 引用口径与 `pedigree_file` 一致：`data/races/{id}.json`（站点根相对）。

---

## 4. 校验与编排

- **门禁**：`python scripts/check_data.py`（退出码 0）+ 四个断言脚本
  `node scripts/races/verify_result.cjs` / `verify_drill.cjs` / `node scripts/stats/verify_stats.cjs` /
  `node scripts/datechart/verify_datechart.cjs`。改数据或改生成脚本后都要跑绿，并断言 `data/` diff 为空。
- **统一入口**：`python run_update.py <策略>`（9 种策略表见根 `README.md`「数据更新」；
  各策略的测试验证点 / 回归清单 / 排查指南见 `docs/TESTING.md`）。
  `run_update.py` 各数据策略末尾自动重算派生产物（timeline / datechart / stats），内容签名比对、
  无变化跳过写入。
- `check_data.py --fix` 可补跑对应环节修复数据不一致（详见脚本头说明）。

---

## 5. 离线脚本零第三方依赖（红线，2026-10-01 定稿）

requests/bs4 只在真正发请求处惰性导入（`core/net.py` 的 `fetch()`/`soup_of()` 函数内、
两个 `common.py` 走 PEP 562 `__getattr__` 重导出——统一收口见 `core/runtime.py::install_lazy_http`）——
GitHub runner 不再预装 requests，顶层 import 曾把 Pages deploy 的 merge 步炸掉（deploy 步按设计纯 stdlib）。

**新增共享工具时保持这条线：不要在 `core/*` 或 `common.py` 模块顶层 import 第三方包。**
（`core/runtime.py` / `core/sire_config.py` / `core/grade.py` 等后续新增模块一律纯 stdlib。）
