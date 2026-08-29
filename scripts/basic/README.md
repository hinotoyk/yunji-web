# 基础部分（建档 + 基本信息）

拉取コントレイル（鉄鳥翱天）子嗣的建档与基本信息，与「竞赛相关」分离。
脚本在 `scripts/basic/`，**数据统一放在根 `data/`**（与竞赛部分共用，见根 README）。

## 目录结构

```
scripts/basic/                 # 基础部分脚本（建档，更新少）
├── common.py            # 共享：请求/解析/basic.json 读写/归一化/缓存（指向根 data/）
├── build_registry.py    # [建档] JBIS 産駒一覧 → basic.json（标准模板初始化）
├── fetch_pedigree.py    # [并发1] JBIS 血統 → data/pedigree/{id}.json + 缓存引用
├── fetch_nk_id.py       # [并发2] netkeiba 列表 → nk_id 缓存
├── fetch_studbook.py    # [并发3] studbook.jp 意味・由来 → 馬名意味 缓存
├── fetch_detail.py      # [阶段四] netkeiba 详情字段 → 缓存
├── merge_basic.py       # ★ 合并全部缓存 → basic.json → 删缓存
├── run_all.py           # 编排：并行抓取 → 合并
└── README.md

data/                      # 统一数据根（根目录，两部分的共同产物）
├── basic.json           # 唯一「前合并」数据源（建档 + 基本信息）
├── pedigree/{id}.json   # 每匹马 5 代血统文件（id 引用）
├── _tmp/basic/          # 基础并发脚本的独立缓存（merge 后自动删除）
└── fetch_log.csv        # 风控请求日志（基础+竞赛统一记录，script 列区分）
```

## 业务流程（线性）

### 0. 并发架构：缓存 + 合并（避免 basic.json 覆盖）

> 4 个抓取脚本（pedigree / nk_id / studbook / detail）各自**只写独立缓存文件**
> `data/_tmp/basic/<name>.json`，**不直接碰 basic.json** → 可真正并行、互不覆盖。
> 最后 `merge_basic.py` 统一把缓存合并进 basic.json，并删除缓存。

| 缓存文件 | 内容（key=str(id)） |
|---|---|
| `_tmp/basic/pedigree.json` | `{id: "data/pedigree/{id}.json"}` |
| `_tmp/basic/nk_id.json` | `{id: nk_id}` |
| `_tmp/basic/studbook.json` | `{id: 馬名意味}` |
| `_tmp/basic/detail.json` | `{id: {登録状態, 性別, ..., 欧字馬名, ...}}` |

### 1. 建档 `build_registry.py`
- 唯一性 = **(母名, 生年)**：同一母马同年只建一档。
  - 母名清洗产地括注 `(GER)/(USA)` 等。
  - **罗马数字统一拉丁**：`コンヴィクションⅡ` → `コンヴィクションII`（Ⅰ/Ⅱ/Ⅲ…→I/II/III…）。
- 建档即按**标准字段模板**初始化全部字段（默认 `""`，见下「字段」）。
- 年份走数组（`--year 2023,2024` 自由添加；2025/2026 未出赛，暂不加）。
- 数据源 **只用 JBIS**（兼容手动在 basic.json 按格式补马：同 `jbis_id` 或同 `(母名,生年)` 会被跳过）。
- 每个年份约 2 次请求（`items=100` 翻页，2023=131 匹、2024=146 匹）。
- 建档后分配**自增业务主键 `id`**（从 1 开始），后续所有关联都用 `id`。

```bash
python build_registry.py                 # 建档 2023+2024
python build_registry.py --year 2025,2026 --dry-run   # 后续加年份（预览）
```

### 2. 建档后并发三件套

| 并发 | 脚本 | 来源 | 产出（缓存） |
|------|------|------|------|
| 1 | `fetch_pedigree.py` | JBIS `/horse/{jbis_id}/pedigree/` | `data/pedigree/{id}.json` + `_tmp/basic/pedigree.json` 引用 |
| 2 | `fetch_nk_id.py` | netkeiba `list.html?sire_id=...&sort=age-asc` | `_tmp/basic/nk_id.json`（按生年数组过滤 + 罗马数字归一化匹配） |
| 3 | `fetch_studbook.py` | studbook.jp `Honba?sid=` | `_tmp/basic/studbook.json`（按归一化馬名匹配） |

> 并发2：netkeiba 列表不能指定生年，需翻遍全部分页，只取生年在数组的马；
> 匹配键 `(母名归一化, 生年)` —— 建档时母名已统一拉丁，两端天然一致。
> 并发3：studbook 无母名，只能按馬名关联；未登録/未命名仔无法匹配则留空并记报告。

### 3. 阶段四 `fetch_detail.py`
- **依赖 nk_id**：读取 `_tmp/basic/nk_id.json` 缓存（或 basic.json 的 nk_id）。
- **不依赖**血统/意味・由来是否完成——nk_id 齐了就能跑。
- 抓 `db.netkeiba.com/horse/{nk_id}/` → 写 `_tmp/basic/detail.json`（登録状態/性別/毛色/馬齢/生年月日/産地/馬主/調教師/生産牧場/通算成績/獲得賞金/欧字馬名/セリ取引価格）。

### 4. 合并 `merge_basic.py`
```bash
python merge_basic.py        # 合并全部缓存 → basic.json → 删缓存
python merge_basic.py --keep # 合并但保留缓存（调试）
```

### 一键编排
```bash
python run_all.py                     # 阶段1 并行(pedigree+nk_id+studbook) → 阶段2 detail → merge
python run_all.py --skip-detail       # 只做阶段1 + merge（不抓详情）
```

## basic.json 标准字段模板（一条马）

建档即初始化全部字段为 `""`，各脚本按 id 回填：

```json
{
  "id": 1, "nk_id": "", "jbis_id": "0001371798",
  "馬名": "アオイハルカ", "欧字馬名": "", "香港馬名": "", "自译馬名": "",
  "母名": "アオイプリンセス",
  "生年": "2023", "馬名意味": "",
  "登録状態": "", "性別": "", "毛色": "", "生年月日": "",
  "産地": "", "馬主": "", "調教師": "", "生産牧場": "",
  "通算成績": "", "獲得賞金": "", "セリ取引価格": "",
  "photo": "", "races_file": "", "pedigree_file": ""
}
```

- 建档填：`id, jbis_id, 馬名, 母名, 生年`
- 并发2 填：`nk_id`；并发3 填：`馬名意味`；并发1 填：`pedigree_file`
- 阶段四 填：`登録状態…セリ取引価格` 及 `欧字馬名`（netkeiba 英文名）
- `香港馬名` / `自译馬名`：手工补充字段（建档为空，待人工填写）
- `races_file` / `収得賞金` 由竞赛部分（scripts/races/）回填；`photo` 留待后续。

## 按域名限速（请求间隔）

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

## 常用命令

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

## 边界 / 纪律
- 本部分是**建档 + 基本信息**，**不含竞赛**（竞赛在 `scripts/races/`，数据同样在根 `data/`）。
- 数据源分工：**建档只用 JBIS**；nk_id/详情用 netkeiba；意味・由来用 studbook。
- 无跨源来回兜底（线性流）；未匹配/抓取失败记报告，不阻塞。
- 并发脚本写独立缓存 `data/_tmp/basic/`，basic.json 只在 merge 时写一次 → 无覆盖风险。
- 原项目 `Z:\IdeaProjects\yunji-web` 为只读参考，业务逻辑不照抄。
