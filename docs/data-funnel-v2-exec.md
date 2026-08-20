# 数据漏斗 v2 · 实施文档（可执行）

> 日期：2026-08-18 · 前置设计：[data-funnel-v2.md](data-funnel-v2.md)（本文件只讲**怎么落地**）
> 基线：407 匹 / 135 匹已出赛 / 血统覆盖 405 / crops.json 为裸数组（无 id、无 facet）
> 铁律：每步独立可验证，改完立刻跑 `python scripts/test-data.py`；契约分层不可破坏；crops.json 只由 build-data 产出

---

## 0. 总览

### 里程碑与依赖

```
M1 身份层（registry + build-data 重构）        ← 一切的地基，先做
  │
  ├─ M2 比赛主源切换（netkeiba 适配器 + 骑手字典 + 本賞金）
  │     └─ M4 収得計算 依赖 M2 的本賞金字段
  ├─ M3 新马对账 + 定时任务                     ← 依赖 M1 的 registry
  └─ M5 crops.json v2 + 前端迁移                 ← 最后，一次性搬
```

实施顺序：**M1 → M2 → M3 → M4 → M5**（M2 与 M3 可并行；M4 卡 M2 的本賞金）。

### 每步验收一句话

| 里程碑 | 验收 |
|---|---|
| M1 | ✅ 407 匹字段不变、只多 `id`；重跑两次 id 稳定；同名不同源解析到同一 id（**2026-08-19 完成**） |
| M2 | ✅ races 全部来自 netkeiba（台账仅海外补漏）；骑手无截断残留；重赏场次带本賞金（**2026-08-19 完成**） |
| M3 | ✅ 每日自动发现新马/改名；Actions 定时跑通（**2026-08-19 实现并本地验证**；Actions 实跑待用户 push） |
| M4 | 収得直接上线；test-data `shutoku_check` 库内 5 匹真值 ≤10% |
| M5 | 大盘可检索/过滤；admin 补录不丢；旧页面零回归 |

---

## M1. 身份层：registry + build-data 重构

> ✅ **已实现（2026-08-19）**：`scripts/build_registry.py`（M1.1 种子）+ `build-data.py` 身份解析（M1.2）+ `test-data.py` 身份一致性断言（M1.3）。
> **id 排序**：按 `生年月日` 从小到大分配（缺失退 `生年`，最年长 = id 1；`racelib.birth_date_key()` 公共排序键），crops 输出同序（台账建档马在 attach_races 后统一重排）。
> 验证：407 匹字段不变只多 id、id 唯一且 = 1..407 与生年月日升序一致、重跑两次 id 稳定、registry↔crops 互认、`test-data.py` 全绿（含负向：错误 nk_id 被拦截）。

### M1.1 生成 registry 种子

**做什么**：从现有 crops.json（407 匹）一次性生成 `data/registry.json` 身份映射表。

**怎么做**：新建 `scripts/build_registry.py`（可独立跑，也可并入 build-data）：

```
输入: data/crops.json（裸数组，现有顺序）
处理:
  for i, h in enumerate(crops, 1):
      entry = {
        "id": i,
        "keys": {"nk_id": h.nk_id or "", "jbis_id": h.jbis_id or ""},
        "names": [h.馬名],              # 首位=当前名
        "生年": h.生年,
        "created": 今天, "updated": 今天,
      }
      若 馬名 匹配 占位名（的(19|20)\d\d$ 或含 ＿）→ 记 未命名: true（可选字段）
输出: data/registry.json {"horses": [...], "updated": 今天}
```

**验证**：`python scripts/build_registry.py` → 407 条；`jq length data/registry.json` = 1（根对象）；抽查 id 唯一（`len(set(ids))==407`）。

### M1.2 build-data.py 身份解析

**做什么**：`merge()` 从"按规范化马名合并"改为"按 registry 解析身份合并"；输出每匹带 `id`。

**怎么做**（改 `scripts/build-data.py`）：

1. `load_registry()`：读 registry.json，建三个索引：
   - `by_nk = {nk_id: id}`、`by_jbis = {jbis_id: id}`、`by_name_year = {(norm(馬名), 生年): id}`
2. `resolve_identity(record)`：按 §3.2 顺序 nk_id → jbis_id → (馬名, 生年) 查 id；
   - 未命中 → 新 id = max(现有 id)+1，写回 registry（含 keys/names/生年/created）
   - 命中但 馬名 与 registry 当前名不同 → **改名**：names append 新名（旧名=曾用名），updated=今天，记入 merge-report
   - 命中且该 registry 条目的 keys 缺 nk_id（JBIS 兜底马被 netkeiba 收录）→ 补 keys
3. `merge()` 输出每匹加 `"id"`；`FIELDS` 加 `"id"`（放最前）
4. 构建结束把 registry 写回 `data/registry.json`

**验证**：
```bash
python scripts/build-data.py --no-snapshot   # 安全重建
python scripts/test-data.py                  # 必须 0 失败
```
手动断言：crops 每匹有 id 且唯一；`diff <(python -c "读取crops ids") <(python -c "读取registry ids")` 一致；重跑一次 build-data，id 不变（max+1 不重复分配）。

### M1.3 test-data.py 断言扩展

**做什么**：加"身份一致性"断言组（`identity_check()`）。

**怎么做**（改 `scripts/test-data.py`，在 `contract_check()` 后追加）：
- id 全库唯一、非空
- registry ↔ crops 一致：crops 的 id ⊆ registry；同 id 的 (nk_id/jbis_id/当前名/生年) 匹配
- 占位名断言：**有 races 的马不允许 `未命名` 标记**；无重复 馬名（normalized）
- 改名记录：registry 的 names 长度>1 时，当前名 = names[-1]

**验证**：`python scripts/test-data.py` → 输出含 `✔ 身份一致性`。

---

## M2. 比赛主源切换（netkeiba 成绩为主，台账仅海外）

> ✅ **已实现（2026-08-19）**：M2.1（parse_races 提取 race_id/jockey_id）+ M2.2（build_jockeys.py → jockeys.json 103 骑手全名）+ M2.3（adapters/netkeiba_races.py 契约B 适配器）+ M2.4（本賞金 4 场全回填，缺失 0）+ M2.5（build-data 比赛主源切换 netkeiba + 台账仅海外）。
> 验证：`test-data.py` 全绿（新增 `契约C 比赛主源` 断言组：650 条无重复/來源正确/骑手全名 0 截断/重赏 1/2着 全带本賞金）；`pull_races.py --adapter netkeiba_races --no-write` 契约校验 0 异常；两次构建幂等（id 映射一致）；抽查 佐々木大→佐々木大輔 全名 11 场零截断残留。
> **本賞金**：青葉賞/京都新聞杯 = 5400万、レパードS = 3700万（与设计一致）；**札幌2歳S = 3100万**（SP 接口直接读数，2026-08-19 双源一致：SP `本賞金` 字段 + 5着/0.10 反推均 3100万；设计文档 §4.1 拟合用的 3000万 系误设 → **100万 差异已定案 = 3100万**）。副作用：ジーネキング 収得复算 400+620=1020 vs JRA 真值 1000（差 20万 = 2%），由 test-data shutoku_check 快照断言覆盖（≤10% 通过）。
> **说明**：比赛记录统一不记录 管理調教師（用户拍板：严格执行 exec，台账中央/地方丢弃，netkeiba 无调教师字段）。**海外场次（2026-08-19 修订）**：netkeiba 视为"可能没存这场"——netkeiba 有该场 → netkeiba 优先（來源=netkeiba），台账只补空缺（`OVERSEAS_FILL_FIELDS=["賞金"]`）；netkeiba 无该场 → 台账展示（來源=ledger）。netkeiba 海外场 R 为空 → 同 (日付,場名) 松散匹配。**增量双轨制**：Track A 台账辅助检测（中央/地方 7 天、海外 30 天窗口）+ Track B 轮换兜底（循环队列每天 50 匹全量，含全部有 nk_id 的马，约 8 天一轮），两趟去重（见 M2.3）。

### M2.1 parse_races 增强：race_id / jockey_id

**做什么**：让成绩页解析带上两个稳定 id（截断免疫的关键）。

**怎么做**（改 `scripts/scrape_netkeiba.py::parse_races`）：
- レース名单元格：`<a href="/race/{race_id}/">` → 正则提取 `race_id`，写入记录
- 騎手单元格：`<a href="/jockey/result/{jockey_id}/">` → 提取 `jockey_id`，写入记录（**文字截断但链接 id 完整**，这是全站截断的解法）
- 兼容旧数据：缺失时为空串

**验证**：`python scripts/fetch_race_probe.py 2023101050` → 输出含 `race_id` 与 `jockey_id`；抽查 佐々木大 那场 jockey_id 存在。

### M2.2 jockeys.json 骑手字典

**做什么**：建 `data/jockeys.json` = `{jockey_id: 全名}`，一次性抓完终身有效。

**怎么做**：新建 `scripts/build_jockeys.py`：
1. 扫 `data/raw/netkeiba_races.json` 全部记录 → distinct jockey_id 集合（当前 ~104 个）
2. 对每个 id 抓一次 `/jockey/result/{id}/`，从页头提取全名（2026-08-18 已验证：佐々木大→佐々木大輔）
3. 写 `data/jockeys.json`；已有的跳过（增量）
4. 输出报告：`{截断名: 全名}` 对照表（如 佐々木大→佐々木大輔）供人工核对

**验证**：`python scripts/build_jockeys.py` → 104 条左右；抽查 5 个 5 字名骑手全部解析成功；重跑不重复抓。

### M2.3 adapters/netkeiba_races.py（契约B 适配器）

**做什么**：netkeiba 成绩页 → 契约B 记录（主源），增量抓取。

**怎么做**：新建 `scripts/adapters/netkeiba_races.py`，实现 `fetch() -> 契约B记录列表`（契约要求）：
1. 遍历 crops（全部有 nk_id 的马）→ 抓 `/horse/result/{id}/`
2. 复用 `parse_races` → 转契约B 字段（补 `race_id`/`jockey_id`/`來源="netkeiba"`/`本賞金` 占位）
3. **增量双轨制（2026-08-19 用户拍板）**：
   - **Track A 台账辅助检测（快）**：`ledger.csv` 全量行驱动——台账有 netkeiba 尚缺的场次、且比赛日在窗口内 → 抓该马；窗口 **中央/地方 7 天、海外 30 天**（`LEDGER_WINDOW`，从比赛日起算，状态可重入：窗口内天天重抓直到 netkeiba 补上；超窗口 → 停快通道）
   - **Track B 轮换兜底（慢但全）**：循环队列 `data/raw/rotation_queue.json`（含全部有 nk_id 的马，现约 406 匹），每天取 head 起 **50 匹**（`ROTATION_BATCH`）抓全量成绩页，head 前进 50（模长，约 8 天一轮）；新马自动追加尾部；兜住台账没记的新场次
   - 两趟**去重**（同一马一天只抓一次）
4. 输出 `data/raw/netkeiba_races.json`（nk_id → 记录列表，兼容现格式）+ `rotation_queue.json`

**验证**：`python scripts/adapters/netkeiba_races.py` → Track A 台账检测数正确、Track B 队列推进与去重正确；`_ledger_detection`/`_ledger_covered`/`_load_queue`/`_next_batch`/`_advance` 单元用例通过（含 7/30 天窗口边界、循环取批）；`fetch_log.csv` 有记录。

### M2.4 比赛页补全：本賞金（収得的前置）

**做什么**：对"重賞且本方 1/2着"的场次抓 **SP 接口比赛结果页**，直接读本賞金（付加賞-free，2026-08-19 实测 13/13 场含 `本賞金` 字样）。

**怎么做**：在 M2.3 适配器内加第二趟（按 race_id 去重）：
1. 筛选：`格 ∈ {GI,GII,GIII,JGI,JGII,JGIII}` 且 本方结果 ∈ {1,2} 的场次
2. 抓 `race.netkeiba.com/race/result.html?race_id={id}`（**UTF-8**，`scrape_netkeiba.fetch(..., encoding="utf-8")`）→ `parse_sp_honsho()` 正则 `本賞金:([\d,]+(?:,[\d,]+)*)万円` 取**首值 = 1着本賞金** ×10000
3. **回退**：SP 解析失败 → db 域 `/race/{id}/` 全表 4着/5着 反推（旧法 `racelib.compute_honsho_prize`，付加賞不派给 4/5着）
4. 写入该记录的 `本賞金` 字段；抓不到的标记 `本賞金缺失`（収得时跳过并记报告）
5. 存量一次性回填（手动跑），之后每日只补新场次

**验证**（2026-08-19 完成）：3 匹重赏马 SP 回填 = 京都新聞杯 5400万 / 青葉賞 5400万 / レパードS 3700万（与设计真值一致），札幌2歳S 2着 = **3100万**（定案，见 M2 头注）；缺失 0；build + test-data 全绿。

### M2.5 build-data 比赛合并改造

**做什么**：比赛合并改为 **netkeiba 为主 + 台账海外补缺/兜底**；骑手按 jockey_id 解析全名。

**怎么做**（改 `scripts/build-data.py::attach_races` / `merge_horse_races`）：
1. 主记录源从 `load_ledger()` 换为 `netkeiba_races.json`（契约B 适配器输出）
2. 台账（ledger.csv）**只保留 venue_type=海外** 的行，其余丢弃（中央/地方由 netkeiba 覆盖）
3. 合并键 `(日付, 場名, R)`：netkeiba 优先；**海外场 netkeiba 有 → netkeiba 为主、台账只补空缺**（`_merge_gap`，`OVERSEAS_FILL_FIELDS=["賞金"]`），**netkeiba 无 → 台账展示**（來源=ledger）；netkeiba 海外 R 空 → 同 (日付,場名) 唯一时按补缺处理；每条带 `來源`
4. 骑手字段：契约B 记录存 `jockey_id`，构建时 `jockeys.json[id]` 解析全名；无 id 的用原值
5. `racelib.coerce_record()` 保持不动（适配器输出已是契约B）

**验证**（2026-08-19）：build + test 通过（test 新增"海外策略"断言：netkeiba 有该场 → 來源=netkeiba，无 → 來源=ledger）；スウィッチインラヴ 海外场（デルマー BCJF）netkeiba 有 → 來源=netkeiba、竞走名用 netkeiba 完整名 `BCJフィリーズターフ(GI)`；Grand Warrior（无 nk_id）海外场 → 來源=ledger。

---

## M3. 新马对账 + 定时任务

> ✅ **已实现（2026-08-19）**：M3.1（`scrape_netkeiba.py --new` 对账模式）+ M3.2（update-data.yml 每日/每周任务改造）。
> 验证：首次 `--new` 对账 → 列表 384 匹 · **新马 0** · **改名 4**（アンブラッセモワの2024→ポルティマン 等占位名转正式名）· 消失忽略；改名经 build-data 传播 → registry names 追加曾用名、id 不变、未命名标记清除（抽查 4 匹全对）；改名检测单元验证（新马/改名/消失三态）；test-data 全绿。
> **注意**：netkeiba 列表页 ~419 匹中仅解析出 384 行（parse_list_row 过滤了部分无标准马链接的行，预存在行为）——`--new` 只对解析出的行对账，未解析行的新增/改名不会被发现，属已知局限。
> **台账刷新（2026-08-19 修订）**：exec 的每日自动路径已把 `pull_races.py`（Google Sheets → ledger.csv）**前移到适配器之前**——台账全量行供 Track A 检测（中央/地方 7 天、海外 30 天窗口），显示仍只海外参与合并（见 M2.3 适配器）。拉取失败沿用上次 ledger.csv（容错）。

### M3.1 scrape_netkeiba.py --new 模式

**做什么**：每日廉价对账——列表页 diff 三态（新马/改名/消失忽略），新马建档。

**怎么做**（改 `scripts/scrape_netkeiba.py`，新增 `--new` 分支）：
1. `fetch_list_all()` 扫列表（~5 页）→ 按 nk_id 与 registry/现有 raw 对比：
   - **新 nk_id** → 建 stub（列表行字段已有：性別/生年/調教師/母名/母父名/馬主/生産牧場）→ 抓详情页补全基本信息 → 写入 `data/raw/netkeiba.json`；血统留待周 `--ped`
   - **nk_id 相同、名字不同** → 更新 馬名 + 追加到 registry names（曾用名），不改 id；打印"改名: 旧 → 新"
   - nk_id 消失 → 忽略（已拍板）
2. 输出对账报告（新增/改名清单，写 `data/merge-report.md` 或单独 `data/new-horses-report.md`）
3. 增量语义：只对新增/改名马抓详情，其余零请求

**验证**：
```bash
python scripts/scrape_netkeiba.py --new   # 第一次跑：0 新增（列表与现有一致）
# 改名模拟：把 registry 里某马 names 改旧名后重跑 → 检测为改名而非新马
python scripts/test-data.py
```

### M3.2 update-data.yml 改造

**做什么**：每日任务 = 对账 + 成绩增量 + 构建；每周 = 血统重试。

**怎么做**（改 `.github/workflows/update-data.yml`）：
- **每日（schedule 默认路径）**：
  ```
  scrape_netkeiba.py --new       # 对账 + 新马建档（分钟级）
  scrape_netkeiba.py --races     # 成绩页双轨制（M2 适配器：Track A 台账检测 7/30 天 + Track B 轮换 50匹/天）
  build_jockeys.py               # 新骑手补字典（增量）
  pull_races.py                  # 台账（Google Sheets → ledger.csv），海外数据先落盘（容错：失败沿用上次）
  build-data.py --note "每日同步"
  test-data.py
  ```
- **每周（新加 schedule cron，如周日）**：追加 `scrape_netkeiba.py --ped` + `scrape_jbis.py --fill`
- 手动模式保留 `races / all / single`；`all` 仍可全量重抓
- 60 天闲置停摆提示保留

**验证**：Actions 手动 Run 一次 `races` 模式成功；产物 diff 无异常；`test-data` 绿。

---

## M4. 収得計算 + 快照闸门

> ✅ **已实现（2026-08-19）**：M4.1（racelib.py 规则表 + `compute_shutoku()`）+ M4.2（正式闸门 = `test-data.py::shutoku_check` 快照断言）+ M4.3（build-data 写入 `stats.収得賞金`）。`scripts/reconcile_shutoku.py` **已恢复但仅测试用**（2026-08-20：拟合期/临时复核工具，不进生产、不进 CI）。
> **口径变更（2026-08-19 用户拍板）**：① 快照断言阈值 **5% → 10%**；② **库外 8 匹不再拉取**（拟合期已完成，规则已定），闸门只对**库内 5 匹**对答案（本地 crops 直接算）；③ 不做 `--no-shutoku` 开关——规则确定直接上线，収得直接写入 crops。
> 验证：test-data 快照 库内 5 匹全 ≤10%（コンジェスタス/ゴーイントゥスカイ/チェリヴェント/テルヒコウ = 0%，ジーネキング = 2.0% 已知差异）；build + test 全绿（新增 `✔ 収得快照: 407 匹全带 stats.収得賞金 · 5 匹真值复算 ≤10%`）；全库 49 匹有収得，障害収得 0。
> **注意（口径边界）**：収得仅中央，与 JRA 马页"含地方ダートグレード算入"口径不一致（2026-08-19 实测：ミックファイア 式样本 JRA 真值 1億1220万 vs 仅中央 1000万）。库外 8 匹的已知差异（リアライズ 150万 / ジーネキング 20万）中，ジーネキング 由库内闸门覆盖（2.0%），リアライズ 库外不再校验——日后若要把 Jpn 算入，需另行实现规则（见 data-funnel-v2.md §8）。

### M4.1 racelib.py 规则表 + compute_shutoku()

**做什么**：按 §4.1 闭环规则表实现収得计算（平地/障害同表）。

**怎么做**（改 `scripts/racelib.py`）：
```python
SHUTOKU_FIXED = {          # 1着 固定额（万円）
    "新馬": 400, "未勝利": 400, "1勝": 500,
    "2勝": 600, "オープン": 600, "3勝": 900,
}
SHUTOKU_GRADE_WIN = 0.50   # 重賞 1着 = 本賞金×50%
SHUTOKU_GRADE_2ND = 0.20   # 重賞 2着 = 本賞金×20%
HALVE_2YO = False          # 2歳折半：默认关（13 匹拟合无需）

def race_shutoku_class(name):   # レース名 → クラス键
    # 含 (GI)/(GII)/(GIII)/(JGI)… → "重賞"
    # 含 新馬 → 新馬；未勝利 → 未勝利；1勝クラス → 1勝；2勝クラス → 2勝；3勝クラス → 3勝；(OP)/(L) → オープン

def compute_shutoku(recs):
    flat = sho = 0
    for r in recs:
        if r["venue_type"] != "中央": continue
        cls = race_shutoku_class(r["競走名"] or r["レース名"])
        if r["結果"] == 1:
            v = r.get("本賞金") * SHUTOKU_GRADE_WIN if cls == "重賞" else SHUTOKU_FIXED[cls]
        elif r["結果"] == 2 and cls == "重賞":
            v = r.get("本賞金") * SHUTOKU_GRADE_2ND
        else:
            v = 0
        if r["馬場"] == "障害": sho += v
        else: flat += v
    return {"平地": int(flat), "障害": int(sho)}
```
- 重賞但 `本賞金` 缺失（M2.4 未抓到）→ 记 `収得缺失` 报告，该场按 0 暂计
- 规则表常量加注释：来源 = 13 匹 JRA 真值拟合（2026-08-18），详见设计文档 §4.1

**验证**：`python scripts/test-data.py` 中 `✔ 収得快照…` → 库内 5 匹全部 ≤10%（ジーネキング/テルヒコウ/チェリヴェント/コンジェスタス/ゴーイントゥスカイ）。

### M4.2 収得闸门：正式 = test-data 快照；独立脚本仅测试

**做什么**：把"计算值 vs JRA 真值"做成**常驻可重复**的校验，偏差 >10% 报错。

**怎么做（双轨）**：
- **正式闸门（生产/CI 唯一入口）** = `scripts/test-data.py::shutoku_check()`：
  - 内置夹具：库内 5 匹真值表 `{馬名: (平地, 障害)}`（源自用户 2026-08-18 提供的 13 匹真值）
  - **只对库内 5 匹对答案**（本地 crops 直接算）；库外 8 匹跳过（拟合期已完成，不拉取）
  - 单匹偏差 >10% → 该匹列 ✗ 并 exit 1（指出怀疑字段：付加赏/本賞金/クラス推导）
- **独立脚本 `scripts/reconcile_shutoku.py` 已恢复，但仅测试用**（2026-08-20）：拟合期/临时复核工具，供人工抽查，**不进生产工作流、不参与 CI**；夹具与 test-data 同源（13 匹真值）。

**验证**：`python scripts/test-data.py` → `✔ 収得快照: 407 匹全带 stats.収得賞金 · 5 匹真值复算 ≤10%`；`python scripts/reconcile_shutoku.py`（仅测试，库内样本）→ 全部 ✓；故意改错一个规则数值 → 两处都立即报错（证明闸门有效）。

### M4.3 build-data 接入 + 前端字段

**做什么**：`stats` 增加 `収得賞金: {平地, 障害}`；直接写入（无 --no-shutoku 开关）。

**怎么做**：
- `build-data.py`：`racelib.compute_stats()` 之后调 `compute_shutoku(races)`，`_shutoku_of()` 剥离缺失报告后写入 stats（现有马 + 台账建档马两处）
- test-data：加 `shutoku_check()` 収得快照断言（5 匹真值 ≤10%）

**验证**：build + test 全绿；crops 里 5 匹库内马的 stats.収得賞金 = JRA 真值 ±10%。

---

## M5. crops.json v2 + 前端迁移

### M5.1 输出结构 {_meta, horses}

**做什么**：crops.json 顶层从裸数组 → `{_meta, horses[]}`（schema 版本化）。

**怎么做**（改 `scripts/build-data.py` 输出段）：
```json
{ "_meta": { "schema": "crops/v2", "built": "...", "count": 407,
             "sources": {"netkeiba": "...", "jbis": "...", "ledger": "..."},
             "manifest": "..." },
  "horses": [ /* 每匹带 id + 全部字段 + 人工字段合并 */ ] }
```

### M5.2 facet 生成 + 人工字段独立存储

**做什么**：每匹生成 `facet`（检索索引）；人工字段移出抓取路径。

**怎么做**：
1. `data/notes.json`（新）：`{id: {译名, 近况, 血统分析, 备考, 馬名意味, photo}}`——admin 写、build 合并、抓取器永不碰（overrides 保护）
2. `build_facet(h)`（racelib 或 build-data）：
   - `search_text`：馬名+曾用名+译名+調教師+馬主+生産牧場+騎手+競走名+場名 拼接（NFKC+小写）
   - 强匹配字段：馬名/曾用名/性別/生年/登録状態/調教師/馬主/生産牧場/fno（等值）
   - 集合字段：騎手/場名/格/血统祖先（5 代树 62 节点扁平化去重）/主要場地
   - 布尔：has_races/has_win/has_graded_win/有地方/有海外
   - 人工字段只进 search_text，不进强匹配（§6.3）

**验证**：`python -c` 抽查一匹：facet.search_text 含曾用名；血统祖先含 Northern Dancer；值全部小写无全角空格。

### M5.3 前端迁移

**做什么**：四个页面读 `{_meta, horses}`；检索走两段式（精确置顶 + 模糊）。

**怎么做**：
- `index.html`：`loadData` 后取 `d.horses`；搜索框先对 馬名/曾用名 精确等值（命中置顶）再 search_text 模糊；深链接/版本切换按 id 兼容
- `detail.html`/`pedigree.html`/`preview.html`：`→ d.horses` 一行迁移
- `admin.html`：读 `d.horses`；写回 `{_meta, horses}`；人工字段写 `data/notes.json`（不再是整个 crops 覆盖）
- 大盘页（另行排期）：用 facet 做分面过滤/计数

**验证**：本地 `python -m http.server 8000` + 浏览器：列表/详情/血统/检索（精确+模糊+强匹配组合过滤）无 console 错误；admin 补录一条 → commit → 重载不丢。

---

## 6. 风险与回滚

| 风险 | 对策 |
|---|---|
| M1 身份解析误配 | 生成 registry 后先 diff 对比（旧按名合并 vs 新按 id 合并的 馬名 集合一致）；test 断言 id 稳定 |
| M2 成绩增量漏场次 | 增量跳过条件严格（最新日付+条数双条件）；test 断言 契约B 全量无重复 |
| 骑手字典不全 | test 断言所有 jockey_id 可解析；缺失的记报告并回退原值 |
| 収得 偏差 >10% | test-data 快照断言（库内 5 匹真值）超限报错，修规则表后重建 |
| 台账海外丢失 | 台账适配器只过滤不删数据（ledger.csv 保留全量，仅合并时筛海外） |
| 前端迁移破坏 | `_meta.schema` 版本兼容；迁移前后截图对比（Playwright，仓库已有先例） |
| 回滚 | 每里程碑独立 commit；回滚 = `git revert` 该 commit；crops.json 由 build 重建，无手工状态 |

## 7. 验收总清单（DoD）

- [x] M1：407 匹带唯一稳定 id；registry↔crops 一致；test-data 全绿
- [x] M2：比赛主源 = netkeiba；台账仅海外（netkeiba 优先 + 台账补缺/兜底）；增量双轨制（Track A 台账检测 7/30 天 + Track B 轮换 50匹/天循环队列）；骑手全名 0 截断残留；重赏场次带本賞金（SP 接口直接读，**2026-08-19 完成**）
- [x] M3：`--new` 对账正确（新增/改名）；Actions 每日/每周定时跑通（**2026-08-19 实现并本地验证**；Actions 实跑需用户 push 后触发）
- [x] M4：test-data shutoku_check 库内 5 匹 ≤10%（阈值 2026-08-19 放宽）；収得賞金入 stats；直接上线无开关（**2026-08-19 完成**）
- [ ] M5：crops v2 结构上线；检索/过滤可用；admin 人工字段经 notes.json 不丢
- [ ] 全程：`python scripts/test-data.py` 零失败；`data-funnel-v2.md` 无待决项（除 リアライズ 150万 由闸门覆盖）
