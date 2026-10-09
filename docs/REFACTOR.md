# 通用单种马资料库 · 重构方案（REFACTOR）

> 状态：**v2.3 · 复用自检扩展 + R6 定案 + 统一阶段统筹，可进入 P1 实施**（2026-xx-xx）
> 目标读者：项目维护者 + 审计者。本文档是「大方向 + 改动点清单」，不是逐行 diff。
> 结论先给：把种马相关的一切收进 **`config/sire.json`** 单一配置源；台账做成**非必填**；
> 其余只做**等值搬移式复用收口**，业务逻辑零改动。
>
> 修订记录：
> - v2：按审计意见修正 E1/E2 两处事实错误；补 M1-M4 盘点遗漏；定死 8 项设计决策（见 §9）。
> - v2.1：按第二轮复核落实 3 项微调（a/b/c）——R4 动态 title 保持原顺序；site-config.js 生成器 domains 归一；
>   loader 对 sire.name_cn/name_ja 空值兜底；§9 补 D9/D10。
> - v2.2：新增 §11 文档目录整理（docs/ 单目录，决策 D11）；复用自检扩展——§5 补 R7（全角转换）、R8（ROOT/DATA），
>   R6 强化为跨 4 处（重赏口径）；§9 补 D11。
> - v2.3：R6 定案（§12，`config/grade-table.json` 单源）并**并入 P3 统一统筹**（原 P4 取消）；场地列表观察项**延后**
>   （P5 之后）；§9 补 D12/D13；中立层改名已定并执行（D14：`scripts/_shared/` → `scripts/core/`）。
> - v2.4：按第三轮复核修正——R6 **补第 5 处 Python 表 `build_stats.py:24`**（§5.2/§12 全覆盖，消灭 4 处表 → 5 处表）；
>   R7 定**字符作用域双版**（全量 / ０-９（）窄版，防 3歳Ａ 折叠行为变化触 C1）+ 补 `fetch_races.py:308` 外部直调点
>   + racelib 引导说明；N4 前向引用改「现行路径（P5 迁址后）」写法；计数修正（P5 移 9、sys.path 引导 12 处、
>   NAR_VENUES 16 场、A4 行号 :206）；`request-path.html` 8 处 `_shared` 残留已随 D14 一并清理。
> - v2.5：品牌基线拍板（**D15**）——以**前端现状品牌「云迹 · 云崽档案」**为准（构建核对时发现文档仍写
>   「云迹 · コントレイル产驹资料库」）；README / AGENTS / HANDOFF 品牌句已同步；「コントレイル」是业务/数据对象，
>   随 `config/sire.json` 走，不在品牌注入范围。

---

## 1. 目标与硬约束

### 1.1 目标

把「云迹 · 云崽档案」（前端现状品牌，见 D15）重构成**通用单个种马资料库**：
新建项目 = 复制仓库 + 修改 `config/sire.json` 中的种马 ID/姓名（+ 可选品牌文案），
其余代码、脚本、页面零改动即可跑起来。

### 1.2 硬约束（审计时逐条核对）

| # | 约束 | 验收方式 |
|---|---|---|
| C1 | **不改业务逻辑**：字段口径、去重键、収得规则、事件生成规则全部保持 | 改前/改后跑同一批脚本，`data/` 产物 diff 为空 |
| C2 | 只做**等值搬移 / 纯删除 / 读配置**三种改动，禁止顺手重构无关代码 | 代码 review |
| C3 | 台账**非必填**：配置缺 URL 时全链路（`--init`/`--ci`/`--check`）照常跑通 | 清空 ledger 配置跑 `--races` + `--check` 全绿；`--init`（`run_full_test.py:173`）经 `races/run_all.py` 继承同一门控，一并验证；`update-data.yml:21,78` 的 `--ledger` 策略在关闭态下优雅 no-op |
| C4 | 新项目换 ID 后，后端抓取链路可自举（建档/血统/成绩/统计） | 见 §6.3（**真离线**验证，非 dry-run） |
| C5 | 前端构建产物 `dist/` 行为不变（品牌文案除外，见 §5.4） | `npm run build` + 页面冒烟 |

> 注：`deploy.yml` / `update-data.yml` 已核对**无种马硬编码**，无需改动（仅 `deploy.yml` 注释提及统计域名，属 site 配置，见 M3）。

---

## 2. 现状盘点

### 2.1 种马强相关硬编码（必须抽离）

#### 后端（代码级，7 处）

| # | 文件:行 | 硬编码内容 | 归属段 |
|---|---|---|---|
| S1 | `scripts/basic/common.py:44` | `JBIS_SIRE_ID = "0001237042"` | `sire.jbis_id` |
| S2 | `scripts/basic/common.py:50` | `NK_SIRE_ID = "2017101835"` | `sire.netkeiba_id` |
| S3 | `scripts/basic/fetch_studbook.py:58,145` | `get_hid(name="コントレイル", father="ディープインパクト")` 默认参；报错文案「未找到コントレイル」 | `sire.studbook.{name,father}` |
| S4 | `scripts/timeline/build_timeline.py:46-54` | `SIRE_WINS`（父子制覇：飞机云生涯重赏一着 7 场 + 注释） | `sire.wins[]`（可空数组） |
| S5 | `scripts/races/fetch_ledger.py:31` | 台账 Google Sheets `DEFAULT_URL` | `ledger.url`（可空） |
| S6 | `scripts/timeline/build_timeline.py:206-207` | 父子制覇事件 `tip` 前缀**「飞机云同胜：」**（代码级，非注释；全量 grep 确认 scripts/ 下仅此一处 + 注释） | `sire.name_cn` |
| S7 | `scripts/races/fetch_ledger.py:108` | `--url` CLI 覆盖参的 `default=DEFAULT_URL` | 优先级见 §4.2（`--url` > 配置 > 空） |

说明：

- `scripts/basic/build_registry.py:77`、`fetch_nk_id.py:110` 已通过 `common.JBIS_SIRE_ID / NK_SIRE_ID` 引用，
  只要 S1/S2 改读配置，这两处自动跟随，**不需要动**。
- `data/pedigree/*.json` 里的 `コントレイル / 0001237042` 是**管线产物数据**，不是代码；
  换种马后重建数据即变，代码层不感知。
- **S4 字段消费语义**：`wins[]` 当前只消费 `name`（`:181` 按 `norm_race(name)` 做匹配键）与 `cn`
  （`:206-207` tip 文案）；`grade` 字段**不参与任何逻辑**，契约中保留作留档，但注明「匹配键 = name」。
- 各处注释里的「コントレイル」等仅文档性文字，不强制改（审计口径：改配置相关的注释，不动无关注释）。

#### 前端（品牌/站点级，见 M3 扩充清单）

| # | 文件:行 | 内容 | 归属段 |
|---|---|---|---|
| F1 | `front/index.html:24,26,30,63` | logo 字「雲」、副标题「云崽档案」、分组标题「云崽档案」、页脚「云迹 · 数据仅供分享交流」 | `site.*` |
| F2 | `front/index.html` + 8 页 `<title>` | 各页标题「… · 云迹」 | `site.name`（构建注入） |
| F3 | `front/pages/profile.html:231-232,388` | 「云迹 · 云崽档案」「沿着飞机云的轨迹…」；`:388` **动态 title** `document.title = title+' · 基本信息 · 云迹'` | `site.*`（`:388` 直读 `YJ_SITE`，见 §5.1 R4 决策） |
| F4 | `front/public/editor.js:820,821,827` | 编辑台报头「雲」标 + 「云迹编辑台」 | `site.*` |
| F5 | `front/public/yj-visit.js:24` | `HOSTS = ['www.yunji.xyz']` —— **站点级配置**（统计域名白名单，非文案）。不收进配置就违反 C4（新项目要么没统计、要么手改代码） | `site.domains[]`（可空数组，注入 site-config.js） |

**手动替换资产（不做配置化，写进新项目手册）**：`front/public/favicon.svg`、`apple-touch-icon.png`（视觉品牌）；
`front/package.json` 的 `name`/`description`（npm 元数据）。

### 2.2 台账现状（关键：合并/校验环节已经容错）

| 环节 | 现状 | 台账可选化影响 |
|---|---|---|
| `fetch_ledger.py` | 硬编码 `DEFAULT_URL`（`--url` 可覆盖，:108），**永远尝试下载**，失败即 `SystemExit` | 入口改读配置 + CLI 优先级（§4.2）；URL 为空 → 跳过（exit 0，不写缓存） |
| `run_all.py:57-60` | 默认**必跑** fetch_ledger（有 `--skip-ledger` 逃生） | 默认改按配置开关；`--skip-ledger` 保留兼容 |
| `run_update.py:191-196` | `--ledger` 策略硬跑 fetch_ledger | 未启用时**只跳 fetch_ledger 环节**，merge/派生照跑（空缓存下均为 no-op，行为差异最小） |
| `merge_races.py:162` | `ledger = common.read_cache("ledger") or {}` | **零改动**（无缓存 = 空跑） |
| `check_data.py:119-144` | 台账场次对账；空台账 = 空报告 | **零改动** |
| `fetch_races.py:503-511` | 去重对象 = **磁盘 races 文件**（含已入库的台账记录），`record_keys` 双键 | 零改动（无台账记录即无交叉） |
| `fetch_ledger.py:143-149` | 读 `_tmp/races.json` 缓存与磁盘文件做**交叉去重**（防同 run 内双源入库） | 零改动（整环节跳过时无此路径） |

> 更正说明（E2）：与台账缓存交叉去重的逻辑在 `fetch_ledger.py:143-149`（读 `_tmp/races.json`）；
> `fetch_races.py:503-511` 的去重对象是磁盘 races 文件（其中可能含历史台账记录）。
> 两条路径结论都是「台账可选化零改动」。

### 2.3 已通用、明确**不动**的清单（防过度重构）

- `scripts/core/` 全部：`constants.py / net.py / basic_io.py / manual.py / text.py`（已无管线概念）
- `scripts/races/racelib.py`：场次/格/収得/馬名键等竞赛域规则（已与数据源解耦）
- 前端 `public/` 通用模块：`data-config.js / yj-cache.js / i18n.js / race-rows.js / yj-util.js / bus.js / selector.js / pedigree.js`（`editor.js`、`yj-visit.js` 例外，见 F4/F5）
- `basic_io.BASIC_FIELDS`（basic.json 字段契约唯一出处）、`net.DOMAIN_SLEEP` 注入机制
- 数据契约 `docs/SCHEMA.md`（= 原 `data/SCHEMA.md`，字段契约单一出处，内容不动、仅迁址，已随 P5 完成；P1-P4 执行期间以 `data/SCHEMA.md` 为准——P5 后一律指 `docs/SCHEMA.md`）
- `vite.config.js`：`gen-font` 插件、`copy-data` 插件（内含 `buildRacesBundle()` 调用——**races-bundle 是 copy-data 内的一次调用，不是独立插件**，措辞以这里为准）

---

## 3. 目标架构与文件分类

### 3.1 分层总览

```
yunji-web/
├─ config/
│  └─ sire.json              ★ 新增 · 全站唯一事实源（种马 + 品牌 + 台账）
├─ docs/                     ★ 新增 · 全部文档单目录（README/AGENTS 留根，见 §11）
│  ├─ HANDOFF.md / TESTING.md / REFACTOR.md / request-path.html
│  ├─ UI优化记录.md / SCHEMA.md / pipeline.md / README.md(索引)
├─ scripts/
│  ├─ core/
│  │  ├─ constants.py / net.py / basic_io.py / manual.py / text.py   （常量单源 = constants.py，2026-xx 由 paths.py 扩展）
│  │  ├─ runtime.py          ★ 新增 · UTF-8 stdout + PEP562 惰性导入 收口（§5.1 R1）
│  │  └─ sire_config.py      ★ 新增 · 读 config/sire.json（中立，无管线概念，纯 stdlib）
│  ├─ basic/                 基本信息域（改：从 sire_config 取 ID/姓名）
│  ├─ races/                 比赛信息域（改：fetch_ledger 读配置；merge 不动）
│  ├─ timeline/ datechart/ stats/  统计/派生域（改：timeline 的 SIRE_WINS/tip 读配置，可空）
│  └─ check_data.py / run_update.py / run_full_test.py   校验与编排（台账按配置门控）
├─ front/
│  ├─ vite.config.js         ★ 新增「sire 注入」插件：transformIndexHtml 占位符替换 + emit site-config.js 到 dist 根
│  ├─ public/                ★ 手写源码树不动（site-config.js 不落这里，见 §5.4 决策 D1）
│  └─ pages/*.html           title/品牌文案改占位符，构建期注入
├─ data/                     数据（换种马后整体重建）
└─ dist/
   ├─ site-config.js         ★ 构建产物（emit 到 dist 根，与 public 拷贝同形态）
   └─ …（其余构建产物）
```

### 3.2 分层原则（对应需求「互不干扰但共享复用」）

1. **配置层** `config/sire.json` —— 唯一的「这一个种马是谁」的答案
2. **中立层** `scripts/core/` —— 无管线概念的通用能力（路径/网络/IO/配置加载）
3. **三个业务域**（互不 import，只依赖中立层与配置）：
   - `basic/` = 基本信息域
   - `races/` = 比赛信息域
   - `timeline|datechart|stats/` = 统计/派生域（只消费 basic.json + races/*.json 产物）

   > 追补（2026-xx 用户决策）：§3 原先的「两管线代码隔绝（common.py 互不 import）」硬限制已**取消**，
   > 改为「业务隔离、代码抽离复用」——业务模块仍互不 import，但共享代码统一下沉中立层（见 §5.5 追补）。
4. **前端** `public/` 通用模块 + 构建 emit 的 `site-config.js`（运行期品牌/域名字典）

### 3.3 配置字段契约 `config/sire.json`

```jsonc
{
  "sire": {
    "name_ja": "コントレイル",        // 日文名（S3 默认参、日志）
    "name_cn": "飞机云",              // 中文名（S6 tip 前缀、前端展示）
    "name_en": "Contrail",            // 拉丁名（留档/未来用）
    "jbis_id": "0001237042",          // S1 —— JBIS 産駒一覧
    "netkeiba_id": "2017101835",      // S2 —— netkeiba 産駒列表
    "studbook": {                     // S3 —— studbook.jp 检索
      "name": "コントレイル",
      "father": "ディープインパクト"
    },
    "wins": [                         // S4 —— 父子制覇（可空数组 = 关闭该徽章）
      // 消费语义：name = norm_race 匹配键（必须与 races 记录中レース名一致）、cn = tip 文案；
      // grade 仅留档，不参与逻辑
      { "date": "2019-11-16", "name": "東京スポーツ杯2歳S", "grade": "G3", "cn": "东京体育杯2岁S" }
    ]
  },
  "site": {                          // F1-F4 —— 前端品牌（构建期注入）
    "name": "云迹",
    "subtitle": "云崽档案",
    "tagline": "沿着飞机云的轨迹，记录每一匹云崽。",
    "domains": ["www.yunji.xyz"]     // F5 —— 统计域名白名单（可空数组 = 关闭统计）
  },
  "ledger": {                        // S5/S7 —— 台账（可选）
    "url": ""                        // 为空 = 不启用；填 Google Sheets CSV 导出 URL 即启用
  }
}
```

**新项目操作手册（写进 README/文档）**：复制仓库 → 改 `config/sire.json` 的
`jbis_id` / `netkeiba_id` / `sire.name_*` / `studbook` / `wins` / `site`（含 `domains`）→
`python run_update.py --init` → `npm run build` → **手动替换** `front/public/favicon.svg` / `apple-touch-icon.png`
并更新 `front/package.json` 元数据 → 完成。

### 3.4 中立层加载器设计 `sire_config.py`

- 只做一件事：`load() -> dict`（缓存结果，进程内只读一次）
- 定位：`config/sire.json` 由 `constants.ROOT` 解析（`ROOT / "config" / "sire.json"`）
- **纯 stdlib**（json + pathlib），遵守「离线脚本零第三方依赖」红线（现行 `scripts/README.md` §2，P5 迁址后 = `docs/pipeline.md`）
- 缺失文件 → `sys.exit` 带明确报错（新项目漏配置时第一时间暴露）；字段缺失 → 按 §4 语义降级
- **字段最小校验（复核 c）**：`sire.name_cn` / `sire.name_ja` 为空 → 打印 warning，并**视为 `wins` 整体为空**
  （即父子制覇徽章不启用），避免半成品配置拼出「飞机云同胜：」这类孤悬冒号
- 不 import 任何管线，管线 import 它（与 `constants.py` 同级地位）

---

## 4. 台账非必填方案（决策：URL 为空即不跑）

### 4.1 语义

| 配置 | 行为 |
|---|---|
| `ledger.url` 为空 / 无 `ledger` 段 | 台账环节**跳过**：`fetch_ledger.py` 打印「台账未启用，跳过」并 exit 0，**不写** `_tmp/ledger.json`；顺带删除可能残留的 `_tmp/ledger.json`（见决策 D6） |
| `ledger.url` 非空 | 现行行为不变（下载 → 规范化 → 只留海外场 → 写缓存） |

不引入 `enabled` 字段（少一个可漂移的状态）。

### 4.2 URL 解析优先级（M2 定死）

```
--url CLI 参数（fetch_ledger.py:108，保留既有人口） > config/sire.json 的 ledger.url > 空（跳过）
```

- `update-data.yml:21,78` 的 `--ledger` 策略走无参路径 → 依赖配置，天然跟随开关
- 实施时 `fetch_ledger.py` 内部改为：`args.url or sire_config.ledger_url or skip`

### 4.3 改动点

| 文件 | 改动 |
|---|---|
| `scripts/races/fetch_ledger.py` | 删除 `DEFAULT_URL`；`args.url or 配置.url or 空`；空则打印提示、清理残留缓存、exit 0 |
| `scripts/races/run_all.py` | 台账环节默认 = `sire_config` 开关；`--skip-ledger` 语义保留（显式跳过优先） |
| `run_update.py` | `--ledger` 策略：未启用 → 打印提示，**只跳过 fetch_ledger 环节**，merge/派生照跑（D5）；`--races`/`--ci` 链路的台账环节跟随 `run_all.py` 行为 |
| `scripts/check_data.py` | 仅补注释/文档（逻辑已容错） |
| `scripts/races/merge_races.py` | **零改动**（`read_cache or {}` 已容错） |
| 现行 `scripts/README.md` / `data/SCHEMA.md`（P5 迁址后 = `docs/pipeline.md` / `docs/SCHEMA.md`） | 台账「可选环节」写进文档 |

---

## 5. 常量/方法复用收口清单

### 5.1 本期收口（等值搬移，行为不变）

| # | 复用点 | 现状 | 收口动作 |
|---|---|---|---|
| R1 | UTF-8 stdout 包装 + PEP 562 惰性 `__getattr__`（requests/bs4） | **9 处重复**（M4 修正）：`basic/common.py:31`、`races/common.py:33`、`basic/run_all.py:24`、`races/run_all.py:29`、`check_data.py:35`、`build_timeline.py:16`、`build_datechart.py:15`、`build_stats.py:16`（scripts/ 内 8 处）+ 根 `run_update.py:40` | 收进 `core/runtime.py`（`install_utf8_stdout()` / `lazy_getattr` 工厂），**9 处全部改 1-2 行调用**。收口依据 = **逐字重复的防漂移**，与「≥3 处才抽」约定是两套口径（见决策 D7）；惰性导入重导出仅两个 common.py 有，一并收 |
| R2 | `race_key`（比赛唯一键） | `races/common.py:90-96` 与 `timeline/build_timeline.py:79-83` 各一份；**实现有差**：timeline 版带 `(r or {})` 防护 + `str()` 包裹（防御版），races 版裸用 | 收进 `racelib.py`（竞赛域公共规则，纯 stdlib）；**统一取防御版**（timeline 版），A6 验收点名靠 §6.1-2 diff 兜底确认键等值 |
| R3 | 排序键 `posttime_key` / `place_desc_key` / `event_sort_key` | 仅 `timeline/build_timeline.py` 内聚 | **不抽**（单一消费方，违反「≥3 处才抽」约定） |
| R4 | 页码标题拼装 | 8 个页面静态 `<title>` + `profile.html:388` 动态 title | **决策（D3）：选占位符方案，不抽 setTitle**——占位符覆盖 8 页静态 title 后，`profile.html:388` 是唯一动态消费点，按「仅 2 处不动」约定**不抽**，直接改 `document.title = title+' · 基本信息 · '+YJ_SITE.name`（读 site-config.js；**保持 马名·页面·站点 原顺序**，与静态 title 的 `<page> · <site>` 同构，复核 a）；两机制不并存 |
| R5 | 品牌文案 | F1-F4 散落 | 全部改读占位符 / `site-config.js`（见 §5.4） |
| R7 | 全角→半角转换 | **3 份实现 + 1 个外部直调**：`fetch_studbook.py:38-48 full2half`（0x3000 + FF01-FF5E 全量）、`racelib.py:174 _FW_ASCII`（FF01-FF5E，只喂 `normalize_grade` :185，其后 `_GRADE_NOISE_RE` 连 \u3000 一起剥）、`racelib.py:195 _FULLWIDTH`（仅 ０-９（），供 `_fold_fullwidth` :198 的 4 处内部消费（:211/:281/:287/:383）+ **`fetch_races.py:308` 外部直调**（解析 SP 页单元格） | 收进 `core/text.py`，**双作用域、消费方保持原样**（v2.4 定，R7-α）：`fw2hw()` 全量版给 studbook / `normalize_grade`（换超集等值 ✅）；**窄版（仅 ０-９（）给 `_fold_fullwidth` 系**——全角字母 ＡＺ 等不折叠，防 3歳Ａ→3歳A 行为变化触 C1。racelib 顶部自带一行 sys.path 引导（当前零 core import，不依赖隐式顺序，R7-β）；**fetch_races.py:308 直调点一并迁移**（R7-γ） |
| R8 | ROOT/DATA 路径 | **4 处手工重算**：`check_data.py:39-40`、`build_timeline.py:20-21`、`build_datechart.py:19-20`、`build_stats.py:20-21`，而 `core/constants.py` 已有 `ROOT`/`DATA_DIR` | 4 个独立脚本统一走 `constants.ROOT` / `constants.DATA_DIR`（需补一行 sys.path 引导，纯 stdlib，值等价） |

### 5.2 升级为实施项（R6，v2.3 定案，不再标「可选」；方案见 §12）

| # | 复用点 | 现状 | 动作 |
|---|---|---|---|
| R6 | `GRADE/GLBL/GBADGE/GRADED` 表 + 重赏口径 | **跨 6 处**（v2.4 补第 5 处）：`build_timeline.py:27-35` GRADE 表 + `:35` GRADED / `build_datechart.py:24` TROPHY_GRADES / **`build_stats.py:24` TROPHY_GRADES（v2.3 漏——自注「同 timeline GRADED 口径」）** / `front/public/race-rows.js` GRADE 表 / `datechart.html:207` GRADED / SCHEMA 口径——同一重赏集合 **Python 3 处 + JS 2 处 + SCHEMA** 手同步互指 | `config/grade-table.json` 单源（§12）：Python 经 `core/grade.py` 读（timeline / datechart / **stats** 三消费端），JS 经 P3 插件注入 `window.YJ_GRADE`；GRADED 由徽章类派生（g1/g2/g3），一处规则消灭 **5 处表** |

### 5.3 明确不抽（遵守「仅 2 处不动 / ≥3 处才抽」约定）

- `record_keys`（`races/common.py`）：timeline 用不到，无第二消费方，不动
- `net.py` 限速注入、`basic_io` 缓存四件套：已是单一出处，不动
- R3 排序键：单一消费方，不抽
- R4 setTitle：占位符落地后仅剩 1 个动态消费点，不抽（profile.html:388 直读 `YJ_SITE`）
- **场地列表（v2.2 观察项，v2.3 决定延后）**：`races.html:418 TRACK_CENTRAL`（10 场）与 `racelib.py JRA_VENUES` 完全同集；`TRACK_LOCAL` 是 UI 筛选子集（7/**16**——`racelib.py:11-12 NAR_VENUES` 实为 16 场，v2.4 修正分母）。仅 2 处 → 按约定不动；**延后到 P5 之后单独评估**（用户 2026-xx 决定），新场地加入 racelib 时 JS 筛选不自动跟随的风险同期处理
- **`sys.path.insert + import common` 引导（12 处，v2.4 修正）**：10 处 `rsplit` 式 + 2 处 `pathlib` 式（两个 common.py:16）。1 行惯用语，收口收益低，不动

### 5.4 前端品牌注入方案（决策 D1/D2/D3 定死）

- **D1：`site-config.js` 不写入 `front/public/`**（受管源码树，构建期写入会 git 脏）。
  改为构建时 **emit 到 dist 根**（`generateBundle`/`closeBundle`，与 `copy-data` 同模式），
  页面以 `../site-config.js` 相对引用（与既有 `public/` 拷贝产物同形态）。
- **D2：占位符替换走 Vite `transformIndexHtml` 钩子**（dev + build 通用），不做 post-build 正则。
  9 个 HTML 入口 = `index.html` + `vite.config.js:8` 的 `PAGES` 8 个，清单直接复用，
  §8.1「漏页」风险随之消解。
- **D3：R4 与占位符二选一 → 占位符**（§5.1 R4 行），动态 title 单独处理。
- `yj-visit.js` 的 `HOSTS` 改读 `YJ_SITE.domains`（可空数组 = 不加载统计脚本），
  F5 就此配置化，C4 成立。
- **site-config.js 生成器归一（复核 b）**：生成器须把缺省/非数组的 `domains` 归一为空数组
  （`Array.isArray(d) && d.length ? d : []`），否则 `yj-visit.js` 的 `HOSTS.indexOf(...)`
  对 `undefined` 抛 TypeError。

### 5.5 复用收口追补（2026-xx 用户决策，替代 §3.2/§5.3 的「仅 2 处不动」口径）

用户本轮明确放宽复用门槛：「业务隔离、代码抽离复用」——凡是 **2~3 处使用但高度相似** 的代码
都先归档成文档（`docs/重复代码审计.md`）再统一处理，不再受「≥3 处才抽」限制。

已执行（等值搬移，行为不变，数据 diff 为空）：
1. **`core/paths.py` → `core/constants.py`**：扩展为路径 + 站点 URL（NK/JBIS/STUD/SP）+ 颜色
   （`COLORS`）+ 网络默认（`HEADERS`/`DEFAULT_SLEEP`）的**常量单源**；两条管线 common.py 的
   字面量常量全部改从这里再导出，不再各持一份拷贝。品牌字段（site.*）仍配置驱动（sire_config）。
2. **取消「两管线代码隔绝」硬限制**（AGENTS.md §3 / pipeline.md §1.4 / HANDOFF.md §5 同步改）：
   业务模块仍互不 import 对方，但共享代码统一下沉 core。
3. **`net.bind(domain_sleep, strip_bases)`**：收口两 common.py 相同的「五连 functools.partial」
   样板；`DOMAIN_SLEEP`/`STRIP_BASES`（各管线风控口径）仍由各 common.py 持有注入，不进 core。
4. **`runtime.install_lazy_http()`**：收口两 common.py 相同的惰性导出块（`__getattr__` 一行调用）。

明确**不合并**（用户 2026-xx 采纳原建议）：`DOMAIN_SLEEP`/`STRIP_BASES` 属各管线风控口径，
合并反而把两个域的站点耦合，保持形参注入。

其余 2~3 处相似代码的完整清单与处理决策见 `docs/重复代码审计.md`。

---

## 6. 行为零变化保证与验收（每条改动必须过）

### 6.1 后端

1. 改配置读取链路（S1-S7）后，**不动数据**跑：
   `python run_update.py --check` + 四个断言脚本
   `node scripts/races/verify_result.cjs / verify_drill.cjs / scripts/stats/verify_stats.cjs / scripts/datechart/verify_datechart.cjs` → 全绿
2. 离线重建对比（最硬验收）：把当前 `data/` 备份 → 跑
   `merge_basic.py / merge_races.py / build_timeline.py / build_datechart.py / build_stats.py` →
   `data/` 与备份 **diff 为空**（允许 `_meta.updated` 等时间戳字段，按各产物签名口径判断）
3. 台账开关矩阵：
   - `ledger.url` 置空 → `python run_all.py`（或 `run_update.py --races` / `--ledger` / `--init`）→
     日志显示跳过、exit 0、merge/派生照跑、残留 `_tmp/ledger.json` 被清
   - `ledger.url` 恢复 → 行为与改前一致

### 6.2 前端

1. `npm run build` 成功，`dist/` 与改前基线 diff 仅限：品牌文案对应产物、新增 `dist/site-config.js`
2. `dist/assets/theme-*.css` 含全部在用类（Tailwind 编译期坑，AGENTS.md §1）
3. 本地 `python -m http.server 8090` 冒烟 8 页：标题、侧栏、标语、数据加载、编辑台入口正常；
   编辑台报头（editor.js）、profile 动态 title 显示配置品牌

### 6.3 新项目模拟（C4，**真离线**）

> E1 更正：`build_registry.py --dry-run`（:124-126）只跳过写盘，`fetch_progeny`（:77-88）**仍会真实联网抓 JBIS**，
> 用假 ID 跑 dry-run 不是离线验证。改为以下真离线手段之一：
> 1. 实施时给 `build_registry.py` 加 `--print-urls`（打印 `JBIS_PROGENY_URL.format(sid=…)` /
>    `NK_LIST_URL.format(sid=…)` 后直接 return，不联网）——首选，可进 P1 验收；
> 2. 或在临时片段里手工 `print(URL.format(sid="<假ID>", year="2023"))` 核对拼装。

---

## 7. 分阶段实施（每阶段独立验收、可单独回滚）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P1 配置化** | 建 `config/sire.json` + `core/sire_config.py`；S1-S7 改读配置（含 `--print-urls` 或等价离线验证手段）；台账开关化（§4） | §6.1 全部 + §6.3 |
| **P2 复用收口** | R1 UTF-8/惰性导入 9 处收口；R2 race_key 入 racelib（取防御版）；**R7 全角转换收进 `core/text.py`**；**R8 ROOT/DATA 统一走 paths** | 同 §6.1 + review 确认纯搬移 |
| **P3 配置注入（前端 + 跨语言表）** | R5 + F1-F5：transformIndexHtml 占位符 + emit site-config.js 到 dist 根 + profile:388/editor.js/yj-visit.js 读 `YJ_SITE`；**R6 一并做**：`config/grade-table.json` 单源 → `window.YJ_GRADE` 注入 + race-rows.js/datechart.html 改读 + 3 页 script 标签 + verify stub 注入（§12） | §6.2 全部 + §12 验收 |
| ~~P4 二期（可选）~~ | **取消**：R6 已并入 P3（v2.3 统一统筹） | — |
| **P5 文档整理** | 建 `docs/`，**移 6 个文档（HANDOFF/TESTING/REFACTOR/request-path.html/UI优化记录/SCHEMA）+ 合并删 3 个管线 README = 9 个**（v2.4 修正），同步 ~30 处引用（§11） | 引用 grep 零残留 + 各文档可读 |
| **P5+ 场地列表（延后）** | races.html TRACK_CENTRAL/LOCAL 与 racelib 场地表联动评估（R-d 观察项，§5.3） | 单独评估，不在本期 |

顺序理由：P1 是「换 ID 即新项目」的命脉，先落地并验证零变化；P2/P3 是增量优化，
不阻塞 P1 的可用性。

---

## 8. 风险与不做清单

### 8.1 风险

| 风险 | 缓解 |
|---|---|
| 读配置改动引入行为差异（如 studbook 默认参、SIRE_WINS 空数组语义） | §6.1-2 的 diff 验收兜底；SIRE_WINS 空数组 = 不产生父子制覇标签（等价于原逻辑无命中） |
| 台账开关与 CI 流程（`--ci`/`--init`/`update-data.yml --ledger`）交互 | `--ci`/`--init` 走 `run_all.py`，跟随同一开关；`--ledger` 关闭态下只跳抓取、merge 照跑；文档写明 |
| `config/sire.json` 遗漏/损坏导致管线静默跑错 | 加载器缺文件即 `sys.exit` 显式报错；字段按 §4 语义降级并打警告 |
| 前端占位符替换漏页 | D2 用 `transformIndexHtml` 统一处理 9 个入口（index + PAGES 8 个）；冒烟覆盖 8 页 title |
| 台账关闭后残留 `_tmp/ledger.json` 被 merge 消费 | D6：fetch_ledger 跳过时顺带删除该缓存（影响低：record_keys 去重使重复合并无害） |
| R2 两版 race_key 合并引入键差异 | 取防御版（timeline 版），§6.1-2 diff 兜底 |

### 8.2 不做清单（明确拒绝，防范围膨胀）

- ❌ 不改 `docs/SCHEMA.md` 字段契约、不改 `basic.json` 结构
- ❌ 不动 `net.py` 限速/风控机制、不动 `yj-cache.js` 缓存策略
- ❌ 不引入框架/依赖（保持纯 stdlib + 现有 Vite/Tailwind 栈）
- ❌ 不重写页面 UI、不改样式（属 `docs/UI优化记录.md` 的事，不在本方案）
- ❌ 不做多品种马支持（本方案只做「单种马参数化」，多品种是另一课题）
- ❌ 不迁移 git 历史 / 不改部署拓扑（GitHub Pages 根目录托管不变）
- ❌ 不做品牌资产配置化（favicon / touch-icon / package.json 元数据走手册手动替换，M3）

---

## 9. 设计决策记录（v2 定死，实施不再议）

| 决策 | 内容 |
|---|---|
| D1 | `site-config.js` **emit 到 dist 根**（构建产物），不写入 `front/public/` 源码树 |
| D2 | 占位符替换走 **`transformIndexHtml` 钩子**，不做 post-build 正则；入口 = index + PAGES 8 个 |
| D3 | R4 setTitle **不抽**：占位符覆盖静态 title，`profile.html:388` 直读 `YJ_SITE`；两机制不并存 |
| D4 | R2 race_key 统一取**防御版**（timeline 版：`(r or {})` + `str()` 包裹） |
| D5 | `--ledger` 关闭态：**只跳 fetch_ledger**，merge/派生照跑（空缓存 no-op） |
| D6 | 台账关闭时 fetch_ledger **顺带删除残留 `_tmp/ledger.json`** |
| D7 | R1 收口依据 = **逐字重复防漂移**，与「≥3 处才抽」约定是两套口径，需在 §5.1 注明避免自相矛盾 |
| D8 | 台账 URL 优先级：**`--url` CLI > config > 空（跳过）**；不引入 `enabled` 字段 |
| D9 | `profile.html:388` 动态 title 保持 **`title · 页面 · YJ_SITE.name` 原顺序**（与静态 title `<page> · <site>` 同构，复核 a） |
| D10 | site-config.js 生成器把缺省 `domains` 归一为 `[]`；loader 对 `sire.name_cn`/`name_ja` 空值 → warning + `wins` 视为空（复核 b/c） |
| D11 | 文档单目录 `docs/`：README/AGENTS 留根；管线 README 3→1 合并为 `docs/pipeline.md`；`data/*_report.md` 是生成产物**留 `data/`**；全站引用同步到 docs/ 路径（§11） |
| D12 | R6 定案（§12）：`config/grade-table.json` 单源；Python 经 `core/grade.py` 读；JS 经 P3 插件注入 `window.YJ_GRADE`（随 site-config.js 一并生成）；3 页 script 标签 + verify stub 同步；GRADED 由徽章类派生 |
| D13 | 场地列表观察项**延后**：P5 之后单独评估（§5.3），本期不做 |
| D14 | **中立层改名（已定并执行）**：`scripts/_shared/` → **`scripts/core/`**（用户选定；避开与 `basic/common.py`/`races/common.py` 撞名的 sys.modules 劫持，见 §13） |
| D15 | **品牌基线 = 「云迹 · 云崽档案」**（前端现状，用户拍板）：P3 的 site-config 注入默认品牌即此；README/AGENTS/HANDOFF 品牌句已同步（v2.5）；「コントレイル」等是业务/数据对象，随 `config/sire.json` 走，不在品牌注入范围 |

---

## 10. 审计对照表（供多方审计逐条打勾）

| 编号 | 改动 | 文件 | 期望行为（改后） | 验收 |
|---|---|---|---|---|
| A1 | 种马 ID 配置化 | `config/sire.json` + `basic/common.py` | `JBIS_SIRE_ID`/`NK_SIRE_ID` 改读配置；URL 拼装不变 | §6.3 离线拼装验证 |
| A2 | studbook 检索参数化 | `fetch_studbook.py` | 默认参改读配置；未找到报错带配置名 | §6.1 联网/离线 |
| A3 | 父子制覇配置化 | `build_timeline.py` | `SIRE_WINS` 改读配置；空数组 = 无该徽章 | 产物 diff |
| A4 | 父子制覇 tip 前缀参数化 | `build_timeline.py:206`（v2.4 修正行号） | 「飞机云同胜：」改读 `sire.name_cn` | 产物 diff + grep 确认无残留 |
| A5 | 台账可选 | `fetch_ledger.py` + `run_all.py` + `run_update.py` | URL 空 → 跳过不失败（D5/D6）；`--url` > config（D8）；非空 → 原行为 | §6.1-3 |
| A6 | 复用收口 R1 | `core/runtime.py` + 9 处调用点 | 行为等价，删重复（D7 口径） | review + 全量脚本重跑 |
| A7 | 复用收口 R2 | `racelib.py` + `build_timeline.py` | `race_key` 单源（防御版，D4） | review + 产物 diff |
| A8 | 前端品牌注入 | `vite.config.js` + 页面占位符 + dist `site-config.js`（D1/D2）+ profile:388/editor.js/yj-visit.js | 品牌文案单源；8 页 title 正常；统计域名读 `site.domains` | §6.2 冒烟 |
| A9 | 文档同步 | `README.md` / `docs/pipeline.md` / `docs/SCHEMA.md` / `AGENTS.md` | 新项目操作手册（含资产手动替换、`--print-urls` 用法）+ 台账可选说明 | 文档 review |
| A10 | 文档目录整理 | `docs/` + **9 个文档处理（移 6 + 合并删 3）** + ~30 处引用 | 引用 grep 零残留；根目录只剩 README/AGENTS + 配置；各文档路径可读（§11） | §11 清单逐条 |

---

## 11. 文档目录整理（docs/ 单目录，决策 D11）

> 独立于种马重构的整理工作流（P5）。目标：根目录除 `README.md` / `AGENTS.md`（+ 配置文件）外不再散落文档；
> 全部人工文档收进 `docs/`；自动生成报告留在 `data/`。

### 11.1 目标树

```
docs/
  README.md           （可选）文档索引
  HANDOFF.md          交接文档（架构/规范/关键决策）
  TESTING.md          更新策略测试与排查手册
  REFACTOR.md         本文件
  request-path.html   请求·数据流路径图（原样搬）
  UI优化记录.md        各模块 UI 优化最终方案与成果
  SCHEMA.md           数据产物字段契约（单一出处）
  pipeline.md         后端管线说明（= scripts/README + basic/README + races/README 合并）
```

### 11.2 归属与处理

| 现位置 | 文档 | 处理 |
|---|---|---|
| 根 | `README.md` / `AGENTS.md` | **留根** |
| 根 | `HANDOFF.md` / `TESTING.md` / `REFACTOR.md` / `request-path.html` | → `docs/` |
| `front/` | `UI优化记录.md` | → `docs/` |
| `data/` | `SCHEMA.md` | → `docs/` |
| `scripts/` | `README.md` + `basic/README.md` + `races/README.md` | **合并** → `docs/pipeline.md`，删 3 个源文件 |
| `data/` | `check_report.md` / `races_report.md` / `studbook_report.md` | **留 `data/`**（脚本每次运行生成的产物，非人工文档） |

### 11.3 引用同步范围（移动的真正成本，~30 处）

- `AGENTS.md`（留根）：HANDOFF / UI优化记录 / SCHEMA / 管线 README / TESTING 引用 ~10 处
- `README.md`：目录树图 + 文档表整段重写
- 代码注释 ~20 处：`common.py`×2、`fetch_races.py`、`build_timeline/datechart/stats.py`、`manual.py`、
  `vite.config.js`、`race-bundle.js`、`bus.js`、`selector.js`、`verify_*.cjs`、页面注释等
- 被移动文档之间的互引（HANDOFF ↔ TESTING ↔ UI优化记录 ↔ SCHEMA ↔ pipeline）
- 本文件自身引用已按目标态更新（`docs/X.md` 形式）

### 11.4 执行清单（P5 验收）

1. `git mv` 各文档 → `docs/`（保留历史）
2. 合并 3 个管线 README 为 `docs/pipeline.md`（保留 §2 离线红线等关键段），删除源文件
3. 同步 AGENTS.md / README.md / 代码注释引用（grep 清单）
4. 更新被移动文档内部互引
5. 收尾：`grep -rn "scripts/README\|data/SCHEMA\|front/UI优化记录" --include=*.{md,py,js,cjs,yml}` 应为空（除历史 CHANGELOG 类）
6. 可选：`docs/README.md` 索引

---

## 12. R6 实施方案：`config/grade-table.json` 单一出处（v2.3 定案）

### 12.1 为什么能单源

「格 → 显示文案/徽章类」是**纯展示域知识**，与数据源无关：一处定义，两端（Python 构建脚本 + JS 渲染）消费。
GRADED（重赏判定）可从徽章类派生：**徽章类 ∈ {g1,g2,g3} 即重赏**（L/OP 是 listed/open）——一条派生规则
同时覆盖 `build_timeline.GRADED`、`build_datechart.TROPHY_GRADES`、**`build_stats.TROPHY_GRADES`（v2.4 补，自注「同 timeline GRADED 口径」）**、`datechart.html GRADED`、`race-rows.js` 键集。

### 12.2 单一出处与消费链

```jsonc
// config/grade-table.json —— 唯一出处（展示域，非种马相关，独立于 config/sire.json）
{
  "GRADE": {
    "GI": ["G1", "g1"], "GII": ["G2", "g2"], "GIII": ["G3", "g3"],
    "JGI": ["JG1", "g1"], "JGII": ["JG2", "g2"], "JGIII": ["JG3", "g3"],
    "JpnI": ["Jpn1", "g1"], "JpnII": ["Jpn2", "g2"], "JpnIII": ["Jpn3", "g3"],
    "L": ["L", "listed"], "OP": ["OP", "open"]
  }
}
```

| 消费端 | 现状 | 改后 |
|---|---|---|
| `build_timeline.py:27-35` GRADE / GLBL / GBADGE / GRADED | 本地表 | 删本地表，改 `core/grade.py::load_grade()`（GRADED 由徽章类派生） |
| `build_datechart.py:24` TROPHY_GRADES | 本地表 | 删本地表，改 `load_grade()["GRADED"]` |
| `build_stats.py:24` TROPHY_GRADES（v2.4 补） | 本地表（重赏计数/重赏胜利桶，:283/:319） | 删本地表，改 `load_grade()["GRADED"]` |
| `race-rows.js:49-56` GRADE（派生 G/GLABEL） | 本地表 | 改读 `window.YJ_GRADE`（P3 插件注入）；派生 G/GLABEL 保留 |
| `datechart.html:207` GRADED | 本地表 | 改由 `window.YJ_GRADE` 徽章类派生 |
| SCHEMA 口径说明 | 文字 | 指路 `config/grade-table.json` |

### 12.3 注入机制（并入 P3，与 site-config 同一插件）

- P3 的「config 注入」插件读 `config/sire.json` + `config/grade-table.json`：
  生成 `dist/site-config.js` = `window.YJ_SITE = {...}; window.YJ_GRADE = {...}`（D1：emit 到 dist 根）
- 加载顺序：**`site-config.js` 必须先于 `race-rows.js`**。新增 script 标签的页面：
  `races.html:120` / `datechart.html:183` / `stats.html:184` 三页（race-rows.js 直接消费方）
  + 使用 `YJ_SITE` 的全部页面（index + 8 页，P3 既有范围）
- `race-rows.js` 改造：`var GRADE = window.YJ_GRADE`，缺失即显式 console.error（fail-fast，防漏注入静默跑错）

### 12.4 verify 脚本联动（关键风险点）

`verify_drill.cjs` / `verify_result.cjs` / `verify_datechart.cjs` / `verify_stats.cjs` 在 **node stub 环境**里
eval 页面内联脚本 + yj-util.js + race-rows.js（loading.js:13 有说明）。race-rows.js 改读 `window.YJ_GRADE` 后，
**每个 verify 脚本的 stub 必须在 eval 前注入** `window.YJ_SITE` / `window.YJ_GRADE`（node 侧 fs 读 config 两个 JSON）。

### 12.5 行为保证与验收

1. 表值逐项与现表一致（GI→["G1","g1"] … 全 11 键核对）
2. 派生 GRADED 集合 == 现 GRADED 集合（{GI,GII,GIII,JGI,JGII,JGIII,JpnI,JpnII,JpnIII}）
3. §6.1-2 离线重建 data/ diff 为空（timeline / datechart / **stats** 三产物不变）
4. `npm run build` + 3 页冒烟（徽章渲染同改前）；4 个 verify 脚本全绿
5. 现库无 JG/Jpn 场次 → 产物无变化（UI优化记录 §509 先例），回归面小

---

## 13. 中立层改名（D14，已定并执行：`scripts/_shared/` → `scripts/core/`）

### 13.1 为什么不能用 `common`

`scripts/core/` 若叫 `scripts/common/`，与既有 `scripts/basic/common.py`、`scripts/races/common.py` 冲突：
直跑脚本时 `import common` 把 `sys.modules["common"]` 绑定到同目录管线文件，管线 `common.py` 内再
`from common import paths` 会解析到自身 → ImportError（sys.modules 劫持）。**必须避开这两个名字**。

### 13.2 决策与执行（用户选定 `core`，2026-xx）

- **选定**：`scripts/core/`——短、语义明确（核心通用能力）、不撞名
- **已执行**：`git mv scripts/_shared scripts/core`（保留历史）
- **已同步引用**：代码 `from core import …`（2 处）、`constants.py::CORE_DIR`（原 `SHARED_DIR`）与注释
  （net.py / merge_basic / merge_races / build_registry / basic·races common.py）；
  文档 AGENTS.md / HANDOFF.md / scripts README×3 / data/SCHEMA.md / **request-path.html（8 处，v2.4 补清）** / 本文件全篇
- **后续**：新增共享模块一律落 `scripts/core/`（runtime / sire_config / grade / text 等全部随层走）

---

## 附：与项目既有规则的相容性

- `AGENTS.md §0`：本方案**不 commit、不 push**，改动由用户确认后分阶段提交
- `AGENTS.md §1`：前端样式改动走「改 → build → 核对 dist」流程（P3 涉及 HTML/JS，不涉及 theme.css 类）
- `AGENTS.md §3`：`config/sire.json` 属于代码配置非数据产物，**不复制进 `dist/data/`**（copy-data 只拷 `data/`）
- `docs/pipeline.md §2`：新增 `core/sire_config.py` / `runtime.py` 保持纯 stdlib，不破坏离线部署红线
- `AGENTS.md §2`：`front/public/` 是受管源码树——故 D1 把 `site-config.js` 定为构建产物而非源码，两者相容
- 本方案只做结构性重构，UI/样式层面零改动，故不进 `docs/UI优化记录.md`；重构过程记录建议追加到 `docs/HANDOFF.md` 或本文件
