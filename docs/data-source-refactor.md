# 数据源重构对接文档 v2

> 会话日期：2026-08-14（v1）· 2026-08-16（v2）· 仓库：yunji-web
> v2 变更：血统主源由 JBIS 切换为 **netkeiba（全量 404 匹）**，JBIS 降级为兜底 + クロス增强
> 目标：替换不可靠的 Google Sheets 人工数据，建立可信的自动抓取管道

---

## 1. 背景

原数据链：Tampermonkey 油猴脚本读 **Google Sheets 人工录入**（2023/2024 两个 sheet）→ `ContrailCrops.json` → `convert_crops.py` → `data/crops.json`。

问题：字段不全（大量「未登録」、缺生年月日/毛色/産地/調教師）、人肉录入易错、无权威校验。

目标需求：
1. 检索コントレイル全部子嗣
2. 子嗣基础信息（性別/生年月日/毛色/産地/馬主/生産牧場/調教師）
3. 子嗣 5 代血统图

候选源：JBIS（jbis.or.jp）+ netkeiba（db.netkeiba.com）

---

## 2. 数据源调研（实测结论）

### 两站关键 URL

| 用途 | JBIS | netkeiba |
|---|---|---|
| 父马页面 | `/horse/0001237042/` | `/horse/2017101835/` |
| 子嗣列表 | `/horse/0001237042/sire/progeny/?year=YYYY&items=100&page=N` | `/horse/list.html?sire_id=2017101835&range=all&page=N` |
| 每匹详情 | `/horse/{id}/` | `/horse/{id}/` |
| 5代血统 | `/horse/{id}/pedigree/` | `/horse/ped/{id}/` |
| 按名搜索 | `/horse/result/?keyword={name}&match=exact` | （无，需扫列表） |

### 实测对比（v2 关键发现）

| 维度 | JBIS | netkeiba |
|---|---|---|
| 反爬 | 连发 10 req 0 拦截；密集后 403 限流 | 连发 21 req 0 拦截；**血统页深层格子 id 混淆为十六进制**（名字/年份/毛色完好） |
| 速度 | 200-3500ms/页 | 160-220ms/页 |
| 编码 | UTF-8 | **EUC-JP**（`r.encoding="euc-jp"` 解决） |
| 子嗣总数 | 産駒一覧 203 匹（现役为主，登记滞后） | **404 匹全量**（含引退/未命名仔） |
| 详情字段 | 性別/生年月日/毛色/産地/馬主/生産牧場/調教師 一次全给 | 同字段，但性別+毛色在标题区 `p.txt_01`，需另解析 |
| 血统 | 5代 + FNo + クロス | **5代全量（含未命名仔）+ FNo**，无クロス |

### 覆盖矩阵（2026-08-16 实测）

| 组合 | 基础数据 | 血统图 | 说明 |
|---|---|---|---|
| A: JBIS有 + netkeiba有 | 200 匹 | 200 匹 | 两站都有，netkeiba 优先 |
| B: JBIS无 + netkeiba有 | 204 匹 | 204 匹 | 已命名 62 匹（JBIS 登记滞后）+ 未命名仔 142 匹 |
| C: JBIS有 + netkeiba无 | 2 匹 | 2 匹 | `Hazey Jane`、`Grand Warrior(JPN)`（JBIS 刚登记，netkeiba 列表未收录，已扫全部 21 页核实）；另有 2026 未命名仔跳过 |

**结论**：netkeiba 全覆盖，JBIS 兜底只需处理 2 匹。

### 决策（用户拍板）

- netkeiba 为主源（子嗣全 + 血统全）
- **血统图：netkeiba 优先，netkeiba 无记录才用 JBIS**（v2 变更，此前 JBIS 做血统源）
- 更新不自动，**按钮触发**（Actions workflow_dispatch）：支持全局更新 + 单匹更新
- 人工注释数据（译名/近况/血统分析/备考/价格）**弃用**（后续可按需找回）
- 血统存**结构化 JSON**，前端渲染

---

## 3. 架构与数据流（v2）

```
netkeiba（主源：基础 + 血统）              JBIS（兜底 + 增强）
  list.html?sire_id=2017101835             産駒一覧（各年生）→ 马名→jbis_id 映射
  ├─ 列表 21 页 → 404 匹基础字段            └─ 与 netkeiba 比对，找出 netkeiba 无记录的马
  ├─ 每匹详情页 → 生年月日/産地等               （系统化判定，无需逐匹搜索）→ 2 匹
  └─ 每匹血统页 ped/{id} → 5代树 + FNo          ├─ /horse/{id}/ → 基础信息兜底
        │                                       └─ /horse/{id}/pedigree/ → 血统兜底
        ▼                                       │
   data/raw/netkeiba.json                  data/raw/jbis.json（兜底 2 匹）
        │                                   data/raw/jbis_pedigree.json（旧版 200 匹，クロス 增强）
        └───────────┬──────────────────────────┘
                    ▼
        scripts/build-data.py（netkeiba 主 + jbis 兜底 + クロス增强）
                    ▼
        data/crops.json + history/快照 + manifest.json
                    ▼
        push → deploy.yml → GitHub Pages
```

### 合并规则（build-data.py）

1. **基础信息**：netkeiba 优先；netkeiba 无记录 → JBIS 兜底（jbis.json）
2. **血统图**：netkeiba 优先（404 匹）；netkeiba 无记录 → JBIS（2 匹）
3. **FNo/クロス**：FNo 取 netkeiba（或 JBIS）；クロス只有 JBIS 有 → jbis.json / jbis_pedigree.json 增强（177 匹）

### 数据格式（crops.json 单条）

```json
{
  "nk_id": "2023106068", "jbis_id": "0001371798",
  "馬名": "アオイハルカ", "性別": "牝", "生年月日": "2023年2月5日",
  "毛色": "青鹿毛", "産地": "新ひだか町", "馬主": "新谷正子",
  "生産牧場": "チャンピオンズファーム", "調教師": "大久保龍 (栗東)",
  "通算成績": "5戦1勝 [ 1-0-0-4 ]", "総賞金": "580.0", "生年": "2023",
  "登録状態": "現役", "馬齢": "3歳",
  "pedigree": { "父": [[G1...],[G2...],[G3...],[G4...],[G5...]], "母": [...] },
  "fno": "F5-g", "cross": "Halo(USA) ：S4×M5"
}
```

血统节点：`{name, sex(牡/牝), year, color, id}`。每侧 5 层，层序 1+2+4+8+16=31 项。JBIS 兜底马无 `nk_id`（如 Hazey Jane），前端只显示 JBIS 链接。

---

## 4. 工作流程（执行顺序）

```
① 调研现有数据链（README/HANDOFF/油猴项目源码/ContrailCrops.json 结构）
   → 确认"不可靠"根源 = Google Sheets 人肉录入
② 抓取两站样板页（webfetch）→ 摸清页面结构
③ 写探针脚本 probe_sources.py（temp 目录）→ 实测反爬/编码/字段/分页/速度/总量
④ 关键决策问答（question 工具，用户拍板）
⑤ 实现脚本（v1）：
   scrape_netkeiba.py → 列表+详情（含 txt_01 标题区解析）
   scrape_jbis.py     → 映射表+血统解析（BFS 层序重建，--fill 补漏带校验）
   build-data.py      → 重写合并逻辑（FIELDS 换新 schema）
⑥ 单匹冒烟测试 → 修解析 bug（性別"牝3歳"连写、母名"[ ]"后缀）
⑦ v1 全量抓取：netkeiba 404 匹 → JBIS 203 匹（部分 403 限流退避）
⑧ 缺口分析 → 前端改造 → Playwright 验证 → workflow 按钮（update-data.yml）
⑨ 【v2 会话】覆盖矩阵分析：netkeiba 血统全量可用（404/404 实测）→ 用户拍板血统主源切换
⑩ 【v2】netkeiba 血统解析（DFS 重建）+ --ped 模式 + 全量抓取
⑪ 【v2】scrape_jbis.py 改造：兜底模式（详情+血统，仅 netkeiba 无记录的马）
⑫ 【v2】build-data.py 新合并 + 前端五代全量展示 + 数据源提示
⑬ 【v2】小样本测试脚本 scripts/test-data.py（每类 2-3 匹抽样）
```

---

## 5. 命令手册

```bash
# 全量更新（推荐 Actions 按钮，或本地）
python scripts/scrape_netkeiba.py --all --sleep 0.6   # 列表+详情+血统（约 15 分钟，829 请求）
python scripts/scrape_netkeiba.py --ped --sleep 0.5   # 只补血统（404 请求，约 8 分钟）
python scripts/scrape_jbis.py --all --sleep 1.5       # 兜底：産駒一覧 → netkeiba 无记录的马
python scripts/build-data.py --note "更新说明"

# 单匹更新
python scripts/scrape_netkeiba.py --name アオイハルカ
python scripts/scrape_jbis.py --horse アオイハルカ
python scripts/build-data.py --note "单匹更新"

# 测试（重要：小样本，勿全量）
python scripts/test-data.py            # 本地数据校验（每类抽样 3 匹）
python scripts/test-data.py --smoke    # 网络冒烟（实抓 4-5 匹验证）

# 调试
--limit N     # 只抓前 N 匹（--ped 模式同样生效）
--force       # 重抓已存在数据
--sleep X     # 请求间隔秒（JBIS 限流时加大到 2-3s）
```

### 参数速查

| 参数 | 说明 |
|---|---|
| `--all`（netkeiba） | 全量：列表+详情+血统 |
| `--ped`（netkeiba） | 只补血统（读现有 netkeiba.json 的 nk_id） |
| `--all`（jbis） | 全量兜底：産駒一覧 → netkeiba 无记录的马 → 详情+血统 |
| `--horse`（jbis） | 单匹：按名搜索（带コントレイル产驹校验）→ 详情+血统 |
| `--force` | 覆盖已存在记录 |
| `--no-snapshot` | build 时不生成历史快照 |
| ~~`--fill`~~ | **已废弃**（v2 删除）：新流程按産駒一覧判定兜底，无需逐匹搜索 |

---

## 6. 测试原则（重要）

> **全量抓取由人工触发**（Actions 按钮或本地命令行）。开发/测试阶段**禁止全量跑**，
> 每类情况抽样 2-3 匹验证即可，避免触发源站限流、浪费时间和流量。

1. 本地数据校验：`python scripts/test-data.py` — 对 crops.json 按类抽样
   （命名马 / 未命名仔 / JBIS兜底 各 3 匹），校验血统行数（2^d）、关键字段、覆盖率统计。
2. 网络冒烟：`python scripts/test-data.py --smoke` — 实抓 4-5 匹（netkeiba 血统 3 + JBIS 兜底 2），
   只解析验证，**不写库**。
3. 解析器改动后：先用 `--limit 3`（或 `--name` 单匹）跑冒烟，确认后再交给人工跑全量。
4. 前端改动后：起本地 http.server + Playwright 截图抽查 2-3 类页面（命名马/兜底马/未命名仔），
   检查 console 无错误。

---

## 7. 踩坑记录（解析要点）

| 坑 | 现象 | 解法 |
|---|---|---|
| netkeiba EUC-JP | 乱码 | `r.encoding = "euc-jp"` |
| 性別/毛色不在详情表 | `p.txt_01` = "現役　牝3歳　青鹿毛" | 正则 `(牡\|牝\|セン)`、12 色枚举、`(\d+)歳` |
| 列表母名/母父名带 `[ ]` | "アオイプリンセス [ ]" | `clean_cell()` 去 `[...]` |
| 详情表用 th/td 非 dt/dd | 解析 0 字段 | 按 `tr>th/td` 遍历 |
| netkeiba 调教师截断 | "大久保龍"（JBIS 作"大久保龍志"） | **源站差异，接受 netkeiba 为准** |
| JBIS 403 限流 | 约 200 请求后 Forbidden | fetch 退避 20s+15s×attempt 重试；仍失败 ⚠ 跳过 |
| JBIS 産駒一覧不全 | 2023 年只 126 匹、2024 只 79 匹 | 仅登记马；v2 由 netkeiba 全覆盖，JBIS 只兜底 |
| 同名异马 | ノートルダム 搜到 0000996018（2017 年別马） | 校验血统父侧 G1=コントレイル |
| **netkeiba 血统表结构** | **rowspan 级联表，非普通三角表** | **DFS 先序重建**：文档序 = 先父系后母系递归，rowspan = 子树占行数（根 16 → 叶子 1），递归对半切行数，重建二叉树后 BFS 分层 |
| **netkeiba 血统 id 混淆** | **深层格子 href 为十六进制（`000a00033a`）**，名字/年份/毛色完好 | 正则 `\w+` 不跳过；前端不依赖节点 id，无影响 |
| 未命名仔血统 | 误以为只 4 格 | 实际 62 格全量（早期探针被 decimal-only 正则骗了） |
| JBIS 2026 未命名仔 | `＿＿＿＿＿＿＿＿＿` | 兜底时跳过含 `＿` 的名字 |
| 前端 esc(undefined) | 无调教师马匹渲染崩溃 | `esc` 加 `s??""` 防护 |
| 2025 未命名仔 | netkeiba 名 = "母名の2025" | 列表照抓；`--fill` 跳过；血统 netkeiba 全量有 |
| **stdout 二次包装** | 测试脚本 import 抓取脚本时 `I/O operation on closed file` | TextIOWrapper 被 GC 会关闭共享 buffer；脚本内包装改为**幂等**（已是 utf-8 则跳过） |

---

## 8. 验证结果（2026-08-16 v2 全量）

| 指标 | 值 |
|---|---|
| netkeiba 子嗣 | 404 匹（2023:130 / 2024:146 / 2025:128） |
| 性別/生年月日/毛色/産地/馬主/生産牧場/調教師 | 全字段覆盖（性別 3 匹空属源站） |
| **血统覆盖** | **405/406**（netkeiba 源 403 + JBIS 兜底 2；仅 イリデの2025 源站血统页空白） |
| 血统行结构 | 全量 2^d 行数校验通过，0 异常 |
| JBIS 兜底 | Hazey Jane / Grand Warrior(JPN)：详情+血统+クロス 齐 |
| クロス增强 | 177 匹（来自 jbis_pedigree.json） |
| 前端 | 五代全量展示（横向滚动）、命名/兜底/未命名仔 3 类截图验证、无 console 错误 |
| 数据体积 | crops.json ≈ 4.3 MB（含全量血统） |

---

## 9. 已知限制与后续

- **イリデの2025**：netkeiba 血统页源站空白（无名字无链接），全库唯一无血统马。待源站补数据后 `--ped --name` 单匹补。
- **JBIS 限流**：全量抓取需 sleep ≥1.2s；Actions runner 若被限流，重跑或加大 sleep。
- **单匹更新链路**：Actions `single` 模式 + 马名（需日文原名，如 `アオイハルカ`）。
- **人工注释字段**（译名/近况/血统分析/备考）：已弃用，管理页仍可补录，但下次 `--all` 抓取会覆盖事实字段（人工字段保留，因 build 只取 netkeiba 事实键）。
- **照片**：hero 占位待补（photo 字段 + images/ 目录）。
- **netkeiba 反爬**：血统页 id 混淆已见；若升级为硬拦截（非 200），降低频率或换 IP。
- **netkeiba 血统 id 为十六进制时**：节点 id 不可用于外链，仅展示用途无碍。
- **convert_crops.py 已废弃**（旧 Google Sheets 链路），未删除，勿再用。
- **JBIS 新登记的马**（如 2024 年生刚命名）：産駒一覧自动收录，重跑 `scrape_jbis.py --all` 即自动识别是否需兜底（已在 netkeiba 的会被跳过）。
