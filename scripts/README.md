# scripts/ · 数据管线说明

阶段 6a 把两个 `common.py` 顶部的大段散文收在这里（代码里只留一行 WHY + 指路）。
**分工**：本文件讲跨管线（怎么跑 / 设计原则 / 中立层边界）；单管线内部流程见 `basic/README.md` 与
`races/README.md`；**产物字段契约与口径不在本文**，见 [`data/SCHEMA.md`](../data/SCHEMA.md)。

## 1. 目录结构

```
scripts/
  _shared/        中立共享层（两条管线都依赖，本层永不 import 任一管线）
    net.py        HEADERS / COLORS / DEFAULT_SLEEP / domain_of / sleep_for / fetch / log_fetch / jitter / soup_of
    paths.py      ROOT / DATA_DIR / BASIC_JSON / OVERRIDES_JSON / tmp_dir(管线名)
    basic_io.py   load_basic / save_basic / next_id / BASIC_FIELDS(模板+列序合一) / 缓存四件套
    manual.py     load_overrides / apply_overrides（两条管线收尾共用）
    text.py       norm / norm_mare / ROMAN_FULL
  basic/          基础管线：build_registry → fetch_pedigree / fetch_nk_id / fetch_studbook → fetch_detail → merge_basic
  races/          竞赛管线：fetch_detail / fetch_races / fetch_ledger → merge_races（racelib = 解析与规则库）
  timeline/       build_timeline.py  → data/timeline.json
  datechart/      build_datechart.py → data/datechart.json
  stats/          build_stats.py     → data/stats.json
  check_data.py   数据一致性校验（--fix 补跑对应环节）
  edit_server.py  本地编辑服务：静态 :8090 + 编辑 API + 保存即生效管道（详见 §6）
```

## 2. 怎么跑

- 直跑即可，不需要 `python -m`：`python scripts/basic/merge_basic.py`、`python scripts/races/merge_races.py`、
  `python scripts/timeline/build_timeline.py`、`python scripts/check_data.py`。
  各 `common.py` 头部有一行 `sys.path` 注入（把 `scripts/` 放进去），所以 `python scripts/<管线>/xxx.py`
  这种直跑方式零改动就能 `from _shared import …`——**不要**改成 `python -m`（会动 `run_update.py` 的调用语义）。
- 日常/定时更新统一走项目根 `python run_update.py <策略>`；`run_all.py` 是各管线的并发编排（抓取 → 合并 → 删缓存）。
- ⚠ `fetch_*` / `run_update.py` 会联网；`--init` / `--races-force` 会删空或覆盖 `data/`。
  纯本地可跑：`merge_basic.py`、`merge_races.py`、三个 `build_*.py`、`check_data.py`、`verify_*.cjs`。
- 门禁：`python scripts/check_data.py`（退出码 0）+ 四个断言脚本
  `node scripts/races/verify_result.cjs` / `verify_drill.cjs` / `node scripts/stats/verify_stats.cjs` /
  `node scripts/datechart/verify_datechart.cjs`。改数据或改生成脚本后都要跑绿，并断言 `data/` diff 为空。

## 3. 设计原则（线性流）

- 每个脚本只负责一条独立业务链路，无跨源来回兜底。
- 请求统一走 `fetch()`：重试 + 风控日志（`data/fetch_log.csv`）+ 按域名限速（`DOMAIN_SLEEP`，带 0.8~1.2 抖动）。
- `basic.json` 是唯一「前合并」数据源，各并发脚本**不直接碰它**，只写自己的独立缓存
  `data/_tmp/<管线>/<name>.json`（键均为 `str(id)`），因此可真正并行、互不覆盖；
  最后由该管线的 `merge_*.py` 统一合并进 `basic.json` 并删除缓存（`--keep` 保留缓存调试）。
- 竞赛管线只消费 `basic.json` 的 `id` / `nk_id`，回填竞赛字段
  （`races_file` / `通算成績_逐场` / `収得賞金` / `性別_当前`）。
- 派生产物（timeline / stats / datechart）在内容无变化时**跳过写入**：`generated_at` 每次都变，
  照写会让 `--ci` 每轮产生空 diff 提交。

## 4. 两管线边界与中立层

- `scripts/basic` 与 `scripts/races` **互不 import**；可共用中立层 `scripts/_shared`。
- `_shared` 里没有「某条管线」的概念：凡两管线取值不同的（限速表 `DOMAIN_SLEEP`、`log_fetch` 剥前缀的
  `STRIP_BASES`、缓存目录 `TMP_DIR`），一律由各自的 `common.py` 用形参注进中立层（`functools.partial`），
  不在中立层写死。
- 各 `common.py` 只保留本管线特有的东西：基础管线 = JBIS/NK/STUD 站点常量与限速表；
  竞赛管线 = 比赛记录键（`race_key` / `record_keys` / `order_record` / `RACE_RECORD_ORDER`）与 `racelib` 依赖。
- `basic.json` 的字段模板与落库列序 = `scripts/_shared/basic_io.py::BASIC_FIELDS` 单一出处
  （建档模板 `BASIC_TEMPLATE` 与重排列序 `BASIC_ORDER` 都由它投影得到）。

## 5. 人工值（脚本永不写）

人工钉住的字段只活在 `data/manual_overrides.json`（时间线节点在 `data/timeline_manual.json`）；
直接改 `data/basic.json` 会被第二天 CI 抹掉。两条管线的合并收尾**都**要套一次
`manual.apply_overrides`（`merge_basic.py` 写回前、`merge_races.py` 全部派生之后），否则只跑 `--basic`
就会把人工的 `馬主` / `調教師` / `登録状態` 抓取值整片覆盖。契约与 `_` 前缀键（`_orig` / `_note`）口径见
[`data/SCHEMA.md`](../data/SCHEMA.md) §3。

## 6. 编辑服务（edit_server.py）

- **启动**：`python scripts/edit_server.py`（`--port` 默认 8090，`--root` 可指向副本树供沙箱测试）。
  单进程同时服务静态站点（项目根）与编辑 API，**替代** `python -m http.server 8090 --directory 项目根`；
  只监听 `127.0.0.1`，无鉴权（本机口径），但校验 `Host` 头（防 DNS rebinding）且 CORS 只对本机 Origin 回显。
- **路由**：`GET /*` 静态（服务项目根）；`GET /healthz`（编辑台在线探测）；`POST /file` 只收白名单两张人工表
  （`data/manual_overrides.json` / `data/timeline_manual.json`，写前整备校验，`.bak` 备份落 `data/_tmp/edit_backups/`）；
  `POST /photo` multipart 收**浏览器端已压缩**的图片（魔数验图、服务端生成 `<id>-<n>.<ext>`、5MB 上限，
  落 `data/photos/` 并同步 dist）。
- **保存即生效管道（D5）**：写源表 → 子进程 `merge_basic.py --keep` → 把改动文件镜像进 `dist/data/`
  （`.json` 与 vite copy-data 同口径 minify；时间线表**不自动重算**，要手动跑 `python scripts/timeline/build_timeline.py`）。
- **降级**：edit_server 未启动时编辑台红条提示并禁用表单（浏览页不受影响，读 dist/data 只读展示）。
- ⚠ 人工表会随构建进 `dist/data/` **公网可读**（含 `_note` 编辑备注）：备注只写业务理由。
