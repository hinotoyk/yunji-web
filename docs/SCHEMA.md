# docs/SCHEMA.md · 数据产物字段契约（单一出处）

`data/` 各产物的**字段契约与口径**统一写在这里（原来散在 `scripts/**/build_*.py` 文件头，阶段 6a 搬来）。
改字段先改这里 + 对应生成脚本；「管线怎么跑」见 `docs/pipeline.md`，跨管线代码结构见同文件。
前端只读产物，字段解释以外实现在 `front/`。

---

## 1. basic.json —— 马匹主表（唯一「前合并」数据源）

结构：`{"_meta": {"schema": "basic/v1", "updated": "...", "count": N}, "horses": [ … ]}`
（`_meta` 由 `save_basic` 每次重写；前端只读，勿手改——手改第二天会被 CI 抹掉，人工值走 §3 人工表。）

**字段模板与列序的唯一出处 = `scripts/core/basic_io.py::BASIC_FIELDS`（36 键，键序 = 落库列序）**，
两处历史副本（`build_registry.BASIC_TEMPLATE`、`merge_basic.py` 的局部 `ORDER`）已合成它：

- `BASIC_TEMPLATE` = 去掉「管线才写入的列」（`収得賞金`、`母父`、`馬齢`）→ 建档时初始化的模板；
- `BASIC_ORDER` = 去掉「不进固定列序的派生列」（性別_当前 / 通算成績_逐场 / 主勝鞍 由 `merge_races.move_after` 归位到同源字段之后）→ `merge_basic` 重排基准；
- 模板外的键（如人工新增列）在重排时**追加在末尾**，不丢数据；`獲得賞金` / `獲得賞金地方` 是旧字段名，重排时丢弃。

| # | 字段 | 建档默认值 | 建档模板 | 固定列序（merge 重排） | 说明 |
|---|---|---|---|---|---|
| 1 | `id` | `null` | ✓ | ✓ | 自增业务主键，后续所有关联（血统/studbook/netkeiba/races）都用它 |
| 2 | `nk_id` | `""` | ✓ | ✓ |  |
| 3 | `jbis_id` | `""` | ✓ | ✓ |  |
| 4 | `kb_id` | `""` | ✓ | ✓ | 2026-10 新增：keibabook 马页 id（status 任务写入，直连近況履歴补抹消日；三源对照键） |
| 5 | `馬名` | `""` | ✓ | ✓ | 2026-10 起支持 studbook 空名回填：`_tmp/studbook_name.json`（只补「空→有」、不覆盖已有真名；出口马 英文名 vs studbook 日文名 不一致只进命名环冲突报告） |
| 6 | `欧字馬名` | `""` | ✓ | ✓ | netkeiba 详情页英文名；缺失时由 studbook Honba 兜底（`_tmp/studbook_eu.json`），merge 只在为空时写入、不覆盖 netkeiba 值 |
| 7 | `香港馬名` | `""` | ✓ | ✓ |  |
| 8 | `自译馬名` | `""` | ✓ | ✓ |  |
| 9 | `母名` | `""` | ✓ | ✓ |  |
| 10 | `母父` | `""` | — | ✓ | merge_basic 由血统图 derive（pedigree.母[1][0].name） |
| 11 | `生年` | `""` | ✓ | ✓ |  |
| 12 | `馬名意味` | `""` | ✓ | ✓ |  |
| 13 | `登録状態` | `""` | ✓ | ✓ | JRA 登录状态（現役/抹消/…）；写入者 = status 任务 / 人工表 / netkeiba 详情（带空值与現役回退守卫，见 §3） |
| 14 | `抹消日` | `""` | ✓ | ✓ | 2026-10 新增：JRA 抹消日（YYYY-MM-DD）；写入者 = scripts/status 任务（NAR/抹消馬簿/近況履歴）与人工表，抓取管线不写 |
| 15 | `抹消_去向種別` | `""` | ✓ | ✓ | 2026-10 新增：抹消后去向，枚举 `地方競馬\|繁殖\|乗馬\|種馬\|死亡\|海外`；**只有确认去向才写入**（推定/猜测不落库），展示文案走 i18n。写入者 = status 任务（NAR 所属/抹消馬簿事由）+ **studbook 繁殖登録确认**（父馬別繁殖登録馬 kubun=1→種馬 / kubun=2→繁殖，是繁殖登録的权威证据；CI 出口 IP 被 studbook 拦时降级只留报告，本机经 scripts/studbook_sync.py 补跑） |
| 16 | `抹消_去向場所` | `""` | ✓ | ✓ | 2026-10 新增：去向场所 = NAR 所属場原文（兵庫/北海道/高知/大井/船橋/浦和/金沢/愛知/岩手…）或抹消馬簿行き先（園田等）；**不做映射，存哪个源就是哪个原文** |
| 17 | `性別` | `""` | ✓ | ✓ |  |
| 18 | `性別_当前` | `""` | ✓ | — | merge_races 3b 派生：官方 性別 是登录值，逐场记录才是当期事实；与官方一致时自动消失 |
| 19 | `毛色` | `""` | ✓ | ✓ |  |
| 20 | `馬齢` | `""` | — | ✓ |  |
| 21 | `生年月日` | `""` | ✓ | ✓ |  |
| 22 | `産地` | `""` | ✓ | ✓ |  |
| 23 | `馬主` | `""` | ✓ | ✓ |  |
| 24 | `調教師` | `""` | ✓ | ✓ |  |
| 25 | `生産牧場` | `""` | ✓ | ✓ |  |
| 26 | `通算成績` | `""` | ✓ | ✓ |  |
| 27 | `通算成績_逐场` | `{}` | ✓ | — | merge_races 3d 派生：全站通算战绩唯一展示源（含海外台账场） |
| 28 | `主勝鞍` | `[]` | ✓ | — | merge_races 3e 派生：主胜鞍展示精选（规则见下），数组元素 `{日付, レース名, 格, 場名}` |
| 29 | `獲得賞金 (中央)` | `""` | ✓ | ✓ |  |
| 30 | `獲得賞金 (地方)` | `""` | ✓ | ✓ |  |
| 31 | `総賞金` | `""` | ✓ | ✓ |  |
| 32 | `収得賞金` | `""` | — | ✓ | merge_races 由逐场 本賞金 统一计算（平地/障害/Jpn 三档） |
| 33 | `セリ取引価格` | `""` | ✓ | ✓ |  |
| 34 | `photo` | `""` | ✓ | ✓ | 图源 URL/路径；人工钉成数组时 [] = 确无图片 |
| 35 | `races_file` | `""` | ✓ | ✓ | 站点根相对路径 data/races/{id}.json |
| 36 | `pedigree_file` | `""` | ✓ | ✓ | 站点根相对路径 data/pedigree/{id}.json |

**`主勝鞍` 派生口径（2026-10-21 用户定稿）**：只认 `結果=1` 且带 `日付` 的胜场，按「命中最高一级」取，层级数字越小越优先：

1. **重赏**：`GI > JpnI > GII > JpnII > GIII > JpnIII`（障害 `JGI/JGII/JGIII` 分别与 `GI/GII/GIII` 同层）——最多 4 条，同级按日期近者优先；
2. 无重赏、有 **`OP`/`L`**（`L` 高于 `OP`）——只取这一类，最多 4 条，同级日期近者优先；
3. 无 OP/L、有**班赛**——只取最高班（`3勝クラス > 2勝クラス > 1勝クラス`）1 条；
4. 只剩**新馬/未勝利**——取最近 1 条；
5. `格` 为空（地方竞马 / 海外台账行）无级别信息 → **不进榜**（这些马即使有胜场也显示 `[]`）。

「最多 4 条」的常数 = `scripts/races/merge_races.py::MAJOR_MAX`，层级表 = 同文件 `MAJOR_TIER`；改规则先改这里。

抓取来源分工（详见 `docs/pipeline.md`）：JBIS 建档（id / jbis_id / 馬名 / 母名 / 生年）→ netkeiba 详情（
登録状態 / 性別 / 毛色 / 馬主 / 調教師 / 通算成績 / 獲得賞金 …）→ studbook（馬名意味）→ 血统图（pedigree_file / 母父）
→ 竞赛管线（races_file / 収得賞金 / 性別_当前 / 通算成績_逐场 / 主勝鞍）。

---

## 2. races/{id}.json —— 每匹逐场成绩（数组）

落库列序 = `scripts/races/common.py::RACE_RECORD_ORDER`（写文件时统一重排，模板外未知键追加在末尾）：

1. `日付` · `発走` · `出走馬名` · `性` · `年齢`
6. `開催` · `場名` · `R` · `コース` · `レース名`
11. `格` · `条件` · `距離` · `芝ダ` · `馬場`
16. `天候` · `斤量` · `枠番` · `馬番` · `頭数`
21. `人気` · `単勝` · `結果` · `タイム` · `上り`
26. `末脚` · `着差` · `通過` · `ペース` · `馬体重`
31. `増減` · `賞金` · `本賞金` · `騎手` · `調教師`
36. `jockey_id` · `trainer_id` · `venue_type` · `race_id` · `photo`
41. `來源`

- **末脚**（2026-10-21 新增）：`金` / `银` / `铜` / `""` —— 该场全场「上がり3F（上り）」按不同用时**密集排名**
  （1/2/3 名；并列共用同一名次，如 1 着与 4 着同为 34.5 → 两匹都是铜），直接取 netkeiba 成绩页 `上り`
  单元格的 `rank_1/2/3` class（与 SP 结果页 `BgYellow/BgBlue02/BgOrange` 同义）。**只读已抓取页面上的
  class，不新增任何请求**；台账海外场无此信息 → 键缺省（前端 falsy 等同无 medal）。派生逻辑 = `scripts/races/fetch_races.py::AGARI_MEDALS`。
- **結果三态**（全站口径）：完赛 = 数字着顺；未完赛 = `中止` / `失格`（计出走）；未出走 = `取消` / `除外`（不计出走）。
  历史单字值（中/取/除/失）在写文件时由 `racelib.normalize_result` 归一为全称。
- **來源**：`netkeiba`（成绩页）| `台账`（海外 ledger 补录）。`通算成績` 字符串是 netkeiba 镜像，
  只用于 `check_data.py` 同口径对账；展示一律用 `basic.json` 的 `通算成績_逐场`（含台账场）。
- **去重键**（增量抓取判重用，两条同时生效）：`race:{race_id}` 与 `horse:{馬名归一}|{日付}`，
  见 `scripts/races/common.py::record_keys`；无 race_id 的台账记录靠 馬名+日付（一匹马一天只跑一场）。
- **格** → 显示文案 / 徽章类 / 重赏判定的单一出处 = `config/grade-table.json`（REFACTOR.md §12 / R6；
  Python 端经 `scripts/core/grade.py` 消费，前端经构建注入 `window.YJ_GRADE`）。
- 文件按 `日付` 倒序（新赛在前）。

---

## 3. manual_overrides.json —— 人工钉住表（脚本只读，永不写）

用途：官方源（netkeiba / JBIS）滞后或缺失时，人工钉住展示/统计字段，例：海外去赛马的登录 性別 仍写「牡」
而逐场记录已是「セ」。契约：

```json
{ "130": { "性別_当前": "セ", "_note": "2026-05-31 起台账为セ", "_orig": { "性別_当前": "牡" } } }
```

- 键 = 马 id（字符串），值 = `{字段名: 值}`；生效位置：**两条管线**的合并收尾（`merge_basic.py` 重排后写回前、
  `merge_races.py` 全部派生之后）都套用 → 人工值优先级最高，不会被下一次数据更新覆盖。
- `_` 前缀键一律忽略、不参与套用：`_readme` / `_examples`（写法示范）、`_note`（钉住理由）、
  `_orig`（首次钉住时由编辑服务快照的官方抓取原值，只服务编辑态灰字对照）。
- 值为 `null` / `""` 跳过（不套空值）；数组照常生效 → `photo: []` 表示人工判定「确无图片」。
- 编辑台开放的可钉字段（§94 定稿 + 同日用户两次修正；2026-10 增抹消组）= 核心四字段（登録状態/馬主/調教師/性別）
  + 名号二字段（香港馬名/自译馬名）+ 赏金成绩五字段（通算成績/セリ取引価格/獲得賞金 (中央)/(地方)/総賞金）
  + 抹消组三字段（抹消日/抹消_去向種別/抹消_去向場所；種別枚举 `地方競馬|繁殖|乗馬|種馬|死亡|海外`，
  登録状態=抹消 或 为空（未登録/空值）时在编辑台展开）+ photo；★ kb_id 等技术键不开放（2026-10 用户定稿）；
  ★ 種別编辑台下拉 = `地方競馬|繁殖|乗馬|種馬|死亡`（新增 种马；2026-xx 死亡 加回人工下拉——此前移出=抹消馬簿斃死
  自动映射，现允许空状态马手工选；海外 仍预留不入下拉；展示枚举仍全量，现值不在下拉时 controlHTML 追加显示防误写）；
  ★ 抹消组 + 地方马的 調教師 为**双写入者**（2026-10 定稿）：`scripts/status` 任务直写 `data/basic.json`
  （唯一自动写入层；調教師 = NAR 馬详情页覆盖，仅限所属場=地方 的马；kb_id 为任务唯一写入层），
  本表为唯一人工写入层。`apply_overrides` 对抹消组**逐键合并**：条目里出现的键人工值覆盖（值为空 = 显式清空），
  条目里没有的键 → basic.json 已有值原样保留（任务值跨合并存活）；任务对人工钉的
  抹消日/種別/場所/調教師/kb_id 一律不碰（kb_id 人工钉仅限直接改 JSON 的场景，补查优先用人工值）。
  ★ 用户定稿：只有「确认去向」才写 種別/場所——推定/猜测一律不落库、
  不确定就只留抹消日（調查底稿 = tests/keibabook_masyoba_202610.csv）；抹消前的地方出走是交流战
  （JRA所属马出张），不构成移籍证据——移籍确认依据 = NAR 竞走馬一覧所属場（原文直存）或马页厩舎栏变为
  地方调教师或近況履歴移籍备注；人工表钉了 種別/場所 → 任务不碰该马去向（防乒乓），钉了抹消日 → 日期不碰；
  毛色（禁止修改）与档案性字段（馬名意味/生年/生年月日/産地/母名/生産牧場）、派生列（収得賞金/母父/馬齢/
  性別_当前/通算成績_逐场）与技术键（nk_id/jbis_id/kb_id 等）不开放手改。性別显示 牡/牝/骟，落库仍是原值 牡/牝/セ。
- ⚠ 本文件会随构建进 `dist/data/`（公网可读），别写私人笔记。

`timeline_manual.json` 同性质：`events[]` 为人工节点，`build_timeline.py` 重算永不覆盖本表，只参与排序。
人工节点可选携带**比赛样式字段**（§92）：`rank`（着顺）· `time`（タイム）· `agari`（上り）· `pop`（人気）·
`jockey` · `trainer` · `grade`（原始格，构建期经 grade-table 派生 `gbadge`/`glabel`）· `meta`（场次一行）·
`hero`（馬名）· `hero_cn`（副名）——全部字符串可选、空值不写；带任一字段即按比赛卡样式渲染，否则走素格式（📌）。

---

## 4. timeline.json —— 时间线事件产物

以下原文搬自 `scripts/timeline/build_timeline.py` 文件头（1-76 行）：

```text
时间线事件预计算：读 data/basic.json + data/races/*.json → data/timeline.json

规则（自 front/pages/timeline.html 旧 JS 引擎逐条移植，事件语义不变；2026-09-18 标签文案统一「首胜」措辞；2026-09-28 世代措辞终稿「XXXX年世代」——历「届 → 年产 → 年世代」两轮统一）：
  1.  级别首胜       —— OP/L/G3/G2/G1/JG3/JG2/JG1/Jpn1/Jpn2/Jpn3 每个级别的产驹史首胜，全局只出现一次
                        （2026-09 确认：级别首胜为全局口径，不再按马；标签「G2首胜」等）
  1b. 世代新马首胜 —— 每个年世代（=生年）最早的新马战一着，一代只此一条（标签「XXXX年世代新马首胜」）
  2.  重赏胜利       —— 所有重赏一着都记录；序数为产驹史全局口径（跨马按日期累计，2026-09 确认）：
                        「重赏首胜 / 重赏第N胜」+ 该级别「G2第N胜」（第1胜=级别首胜，不重复挂）+ 海外全局「海外重赏首胜 / 海外重赏第N胜」；
                        马内不再记同级别序数（G2首胜 等级别首胜仍按马）
  3.  世代重赏首胜   —— 每个年世代的产驹在 JRA 中央的首场重赏胜利，一代只此一条（标签「XXXX年世代重赏首胜」）
  4.  父子制覇       —— 产驹赢下コントレイル（飞机云）赢过的重赏（常量内置，
                        レース名去格级括号尾缀后精确匹配）
  5.  受赏           —— basic.json 受賞歴（预留字段，兼容对象/字符串）
一场比赛 = 一条事件（绝不按标签拆行），该场触发的所有里程碑以标签并列；节点类别取
最高优先级标签（sire > gen > first > graded > award）。

事件按日期升序输出；同日按発走升序（缺失视为最大），同日同発走按着順降序
（= 前端倒序展示后：最新在顶、同日发走晚者在顶、同场 1着 在上未完走殿后，同 races.html 模块 33）。
前端 front/pages/timeline.html 只做渲染，不再实时计算。

═══ data/timeline.json 字段模板（产物，前端只读；人工节点编辑 data/timeline_manual.json）═══
{
  "meta": {
    "generated_at": "产物生成时间(ISO)，仅标识新鲜度；内容无变化时连文件都不重写",
    "source":       "数据来源说明",
    "stats": {
      "events":      总事件数（含人工节点），
      "horses":      覆盖产驹数（不含人工节点——它们不挂马），
      "graded_wins": 重赏一着事件数，
      "sire_wins":   父子制覇事件数
    }
  },
  "events": [   // 按日期升序；同日按発走升序（缺失视为最大）→ 前端倒序后同日发走晚者在顶；
                // 同日同発走（同场两产驹均触发）按着順降序（1着显示在上）；受赏/人工节点按発走缺失处理（同日置顶）
    {
      "date":  "YYYY-MM-DD —— 排序与年份分组依据（缺失排最后）",
      "type":  "race（比赛胜利）| award（受赏）| manual（人工节点）",
      "node":  "轴上圆点颜色类别：sire红 / gen橙 / first青绿 / graded深蓝 / award金 / manual灰；"
               "自动事件 = 本事件最高优先级标签的类别（sire>gen>first>graded>award），manual 固定 manual",
      "horse": { "id": 产驹id（profile 跳转用）, "name": 馬名, "cn": 〈港译/自译〉 },
               // race/award 才有；manual 无此键
      "photo": "图源：比赛人工配图优先（data/races_manual.json，§4.5）→ race.photo（历史抓取值兼容，
                 抓取管线已不产生该字段）→ 回退马照片；manual 可自带；空串=浅灰占位。
                 路径口径 = 页相对 ../data/…（timeline.html 直读 src 不经 YJ_DATA，编辑台人工节点
                 照片同款约定）或外链 URL；仓库相对 data/…（basic.json 马照片形式）由
                 build_timeline 统一补 ../ 前缀（2026-10-01 修 /pages/data/… 404）",
      "tags":  [ { "cat": "标签类别色（同 node 取值）", "label": "徽章文字", "tip": "可选：悬停提示",
                   "crown": true —— 可选：首胜标签（label 以「首胜」结尾）前端在右上角画斜置小皇冠 } ],

      // ── type=race 专属 ──
      "race": {
        "name":   "赛事名（已剥掉「徽章代劳」的格级括号尾缀：テレビ東京杯青葉賞(GII) → テレビ東京杯青葉賞，
                   口径同 race-rows.js raceNameText —— 尾缀与 格 相等且该格有徽章才剥，否则 (1勝クラス) 等原样保留）",
        "grade":  "原始格（GII/JpnI/L/OP…，新马战为 新馬）",
        "glabel": "徽章显示字（G2/G3/L…，无徽章格为空）",
        "gbadge": "徽章 css 类（g1/g2/g3/listed/open；见 config/grade-table.json）",
        "meta":   "「東京11R · 芝2400m · 良」场地一行",
        "time":   "タイム（缺失=—）",
        "agari":  "上り（缺失=—）",
        "pop":    "人気（如 4番；缺失=—）",
        "team":   "「騎手 武豊 · 57kg ｜ 調教師 大久保龍志」单串（前端按 ｜ 拆为一人一行；缺失整行不渲染）"
      },

      // ── type=award 专属 ──
      "award": { "賞名": 奖项名, "cn": "可选中文名", "備考": "可选备注" },

      // ── type=manual 专属（来自 data/timeline_manual.json，重算永不覆盖，只参与排序）──
      "title":  "节点标题（必填）",
      "cn":     "可选：中文副题",
      "note":   "可选：一行补充说明",
      "link":   "可选：点击标题跳转的 URL",
      // §92 比赛样式可选字段（全部字符串、空值不写；带任一字段 → 按比赛卡样式渲染，gbadge/glabel 构建期派生）
      "rank":   "可选：着顺（「1」= 金 1着徽章 / 「2」「3」= 蓝 / 铜底；非数字如「中止」无底色）",
      "time":   "可选：タイム（如 2:23.0；KPI 条首格青绿加粗）",
      "agari":  "可选：上り",
      "pop":    "可选：人気（如 4番）",
      "jockey": "可选：騎手一行（如「武豊 · 57kg」，格式自由）",
      "trainer":"可选：調教師",
      "grade":  "可选：原始格（GI/GII/L/OP…，同 races 台账 格 值域；未知格不出徽章）",
      "meta":   "可选：场次一行（如「東京11R · 芝2400m · 良」）",
      "hero":   "可选：馬名（比赛卡头马行主名）",
      "hero_cn":"可选：馬名副名（〈港译/自译〉）",
      "tags":   "人工节点标签类别可自选六色（D9）：cat 取白名单 sire/gen/first/graded/award/manual"
                "（= node 同源取值，build_timeline.py MANUAL_CATS）→ 命中则原样透传，缺失/非法回退 manual；"
                "注意 node 仍固定 manual（轴上圆点为中性灰），六色只作用于标签",
      "manual": true
    }
  ]
}

用法:  python scripts/timeline/build_timeline.py
```

---

## 4.5 races_manual.json —— 比赛人工配图（人工表，2026-09-29 定稿 §82.9）

**定位**：`race.photo` 的唯一维护入口。用户定稿：比赛节点配图属**人工配置**（race_id → photo），
抓取管线**不产不写** race.photo；`build_timeline.py` 只读本表，**永不覆盖**（与 timeline_manual.json
同一哲学）。编辑台入口 = `edit-timeline.html` 工具栏「比赛配图」（选马 → 选场 → 上传，图压缩口径同
马照片 ≤1280px/≤100KB webp），提交链 = 草稿箱「提交到 GitHub」单原子 commit（图落
`data/photos/<race_id>-<n>.<ext>`，与本马图同一命名法）。

```jsonc
{
  "<race_id>": { "photo": "../data/photos/<race_id>-<n>.<ext>" }   // 值亦兼容纯字符串路径
}
```

- 键 = races 数据的 `race_id`（netkeiba 全局唯一）；**无 race_id 的台账场**（海外等，§82.22 起可配图）
  用虚拟键 `"<@马id>@<日付>"`（如 `"@130@2026-08-31"`；一马一天只跑一场，§3 去重键同口径，
  `@`/`-` 文件名安全，故图文件名 `<@马id>@<日付>-<n>.<ext>` 同法成立）。编辑台 STEP2 与
  `build_timeline.py` 用同一规则生成键；`build_timeline.py` 取图优先级：
  **本表 photo > race.photo（历史兼容）> 马照片**；编辑台删除条目 = 删键（节点回退马照片）。
- 无此文件 / 读取失败 = 无比赛人工配图，管线照常（告警不中断）。

---

## 5. stats.json —— 统计总览产物

以下原文搬自 `scripts/stats/build_stats.py` 文件头（17-51 行）：

```text
统计总览数据预计算：读 data/basic.json + data/races/*.json → data/stats.json

页面 front/pages/stats.html 只做渲染：fetch 本产物 → 选场地范围 + 年份切面 → 计数合并 → 各统计块。
产物按 场地类型（中央/地方/海外）× 统计切面（scopes）二维聚合：
  * "all"    全部记录
  * "yYYYY"  自然年切面（比赛日历年份，1月1日–12月31日）
  * "gYYYY"  生产年切面（产驹出生年份，即 生年）
前端把勾选场地在同一切面下的计数相加、比率重算 —— 任意 场地×年份 组合无需重新拉数据。

口径约定（与比赛记录页 races.html 完全一致，改动必须同步）：
  * 三态：完赛=数字着顺；未完赛=中止/失格（计出走）；
          未出走=取消/除外（不计出走）。比率分母=出走数（完赛+未完赛，同 races.html 模块 34）。
  * 距离四档：短距离≤1400 / 英里 1401-1800 / 中距离 1801-2400 / 长距离>2400（同 distBucket）。
  * 人气：逐一 1-18人気（同 races.html ninkiBucket）。
  * 回り：コース 前缀 右/左（其余不入桶）。
  * 性别：当前性别（性別_当前 优先，回退官方 性別 登录值）归一 セ→セン（同前端 YJ.util.sexOf）。
  * 比赛级别细分：新马 / 未胜利 / 一胜级~三胜级(1-3勝クラス) / OP / L / Jpn1-3 / G1-3 / JG1-3 / 其他
    （桶键即中文标签，展示序见 stats.html TAB_ORDER.grade；下钻同 races.html gradeMatches）。
  * 重赏：GI/GII/GIII/JGI/JGII/JGIII/JpnI/JpnII/JpnIII（同 races.html「重赏」筛选 / timeline GRADED 口径；
    2026-10 起障害重赏 JGI~JGIII 计入，L/OP 仍不计）。
  * 增补四维（2026-09，页签序：体重·牡/体重·牝在性别后，生产牧场/马主在调教师后）：
    体重 = 该场比赛登记的 馬体重（记录级当日值；按性别拆 weight_m=牡含セン / weight_f=牝 两维；
    400-550 每 10kg 一档 + <400 / >550，550 归 540-550，空体重/空性别不入桶，前端按档位升序展示）；
    生产牧场 / 马主 = basic.json 生産牧場/馬主 现值（马属性，空值不入桶，按出赛数降序）。
    四者 races.html 无对应筛选键 → 矩阵行不下钻。

═══════ data/stats.json 字段模板（产物，前端只读）═══════
{
  "meta": {
    "generated_at": "...",            # 仅标识新鲜度；内容无变化时不重写
    "source": "basic.json + races/*.json",
    "stats": {                        # 全库（三场地合计）
      "runs": 记录总数, "finished": 完赛数, "dnf": 未完赛数, "exc": 未出走数,
      "horses": 出走过的产驹数, "wins": 一着数,
      "trophy_wins": 重赏一着数, "prize_total": 赏金合计(円),
      "first_date": "YYYY-MM-DD", "last_date": "YYYY-MM-DD"
    }
  },
  "by_venue": {                       # 键=venue_type：中央/地方/海外
    "中央": {
      "scopes": {                     # 键="all" / "yYYYY"(自然年) / "gYYYY"(生产年)
        "all": {
          "base": { "n": 记录数, "dnf": 未完赛, "exc": 未出走, "w": 一着, "p2": 二着, "p3": 三着,
                    "pr": 赏金合计(円) },
          "dims": {                    # 每维 = [{k, n, dnf, exc, w, p2, p3}]，按 n 降序（weight_m/f 前端按档位升序重排）
            "surf": [...], "dist": [...], "cond": [...], "turn": [...], "grade": [...],
            "ninki": [...], "sex": [...], "track": [...], "trainer": [...], "jockey": [...],
            "mps": [...],              # 母父（血统图 母の父 格；basic.json 母父字段）
            "weight_m": [...], "weight_f": [...],   # 当日 馬体重 档（<400 / 400-410…540-550 / >550）；牡含セン / 牝
            "breeder": [...], "owner": [...]   # 生产牧场 / 马主（basic.json 现值）
          },
          "curve": [ { "gen": "2023", "a": 月龄, "n":..,"dnf":..,"exc":..,"w":..,"p2":..,"p3":.. } ],
          "trophies": [ { "d","id","h","r","g","v","R","jk","tr" } ]   # 重赏一着明细，按日期升序
        },
        "y2025": { ... }, "y2026": { ... }, "g2023": { ... }, "g2024": { ... }
      }
    }
  }
}

接入：run_update.py 各数据策略末尾自动重算；内容签名比对，无变化跳过写入（同 datechart/timeline）。
用法:  python scripts/stats/build_stats.py
```

---

## 6. datechart.json —— 日期图产物

以下原文搬自 `scripts/datechart/build_datechart.py` 文件头（20-55 行）：

```text
日期图数据预计算：读 data/basic.json + data/races/*.json → data/datechart.json

页面 front/pages/datechart.html 只做渲染：fetch 本产物 → RUNS → 天/周/月/年 日历聚合
（2026-09-14 布局样式定稿，按 docs/UI优化记录.md §32.6 接入真实数据）。
产物 runs[] 与页面字段完全同构（布局稿 RUNS 契约），本脚本只做
「字段抽取 + 类型归一 + 排序」，不做任何聚合口径计算——进板数 6 段、🏆 计数、
赏金合计等全部由前端在 runs[] 上聚合，保证单一事实源（data/races）与页面零换算。

═══ data/datechart.json 字段模板（产物，前端只读）═══
{
  "meta": {
    "generated_at": "产物生成时间(ISO)，仅标识新鲜度；内容无变化时连文件都不重写",
    "source":       "数据来源说明",
    "stats": {
      "runs":        逐场记录总数（含未出走行；前端 KPI「出走」按三态口径剔除 取消/除外）,
      "horses":      出走过的产驹数,
      "wins":        一着数（全部口径）,
      "trophy_wins": 重赏一着数（GI/GII/GIII/JpnI-3，同 races.html 重赏口径 = 🏆 计数）,
      "prize_total": 赏金合计（円，各条 pr 相加）,
      "first_date":  最早出走日（YYYY-MM-DD，无记录为空串）,
      "last_date":   最晚出走日（同上）
    }
  },
  "runs": [   // 按 日付 → 马id → R 升序（同日同马按 R）
    {
      "d":    "YYYY-MM-DD —— 日付",
      "id":   产驹id（profile.html?horse=id 跳转用）,
      "h":    馬名（日文名，显示用；空则回退 出走馬名/欧字馬名）,
      "hc":   中文名（香港馬名 → 自译馬名，明细「切换马名」用；两者皆无=空串，前端回退 h）,
      "sx":   当场比赛 性（牡/牝/セ/''，明细 性齢 列用）,
      "ya":   当场比赛 年齢（int/str 原样，'' 缺失）,
      "rid":  netkeiba 赛事 id（race_id 原样，'' = 台账等无 id 记录；明细赛事名 → race.netkeiba.com SP 比赛页 race/result.html?race_id={rid} 新标签页跳转用，§80）,
      "r":    レース名（含格级尾缀，如 札幌2歳S(GIII)）,
      "g":    格（GI/GII/GIII/L/OP/JpnI-3/新馬/未勝利/N勝クラス/''，空串=无徽章）,
      "v":    場名,
      "R":    R 番号（int/str 原样，海外部分为 str；缺失=空串）,
      "hs":   発走（"HH:MM"/''，明细同日発走排序用）,
      "dist": 距離（m，int；缺失=空串）,
      "s":    芝ダ（芝/ダ/障/AW；「障害」记法一律归一为 障）,
      "p":    着顺（int 1-18；未完走=原样字符串 中止/取消/除外/失格）,
      "pr":   赏金（円，int；該马该场 賞金 空/非数=0）,
      "vt":   venue_type（中央/地方/海外 —— 前端 JRA/NAR/海外 场地范围筛选用）,
      "bk":   馬場状态（良/稍重/重/不良/''，明细表用）,
      "ki":   斤量（int/str 原样，海外可为 "120lb"；'' 缺失）,
      "nk":   人気（int/''，明细表人气徽章用）,
      "tm":   タイム（字符串，'' 缺失）,
      "ag":   上り/後3F（字符串，'' 缺失；明细 后3F 列用，金银铜徽章化 §100/§101）,
      "ms":   末脚（金/银/铜/''——仅作 后3F 值徽章配色判断，不单独成列；台账海外缺键=空串）,
      "bw":   馬体重（int/''）,
      "dz":   増減（"+2" 等/''）,
      "jk":   騎手,
      "tr":   調教師
    }
  ]
}

接入：run_update.py 各数据策略（basic/races/horse/races-force/ledger/ci）末尾自动重算；
内容签名比对，无变化跳过写入（避免 --ci 每轮空 diff 提交，同 build_timeline.py 约定）。

用法:  python scripts/datechart/build_datechart.py
```

---

## 7. pedigree/{id}.json —— 血统图

`scripts/basic/fetch_pedigree.py` 抓 JBIS 血统页 → `data/pedigree/{id}.json`，`basic.json` 里以
`pedigree_file` 引用。`pedigree.母[1][0].name` = 母父（`merge_basic.damsire_of` 每次合并全量重 derive，
口径同 `front/public/pedigree.js` 的母线取格逻辑）。

## 8. races-bundle.json —— 全库比赛压缩包（构建期派生，源 data/ 不落盘）

**2026-09-28 立项（路 B，D11 替换式；决策与处置记录 = docs/UI优化记录.md §72）**：`data/races/*.json` 276 个逐马文件
（minified 353KB，站点上为 276 次请求）在 **vite 构建期** 打成单文件
`dist/data/races-bundle.json`（149.6KB → gzip ≈44KB）。**D11 替换式**：打包成功则 dist
不再拷贝 `data/races/*.json`；打包失败告警并退回拷贝（叠加形态兜底）。`data/` 仓库永远
不持有本产物；`run_update.py` 与编辑台保存管线不经过它——**每轮数据更新后重新 `npm run build` 即得新 bundle**。

### 格式 v2（2026-10-21：马级字段新增 `末脚`，23 → 24；编解码单一出处 = `front/public/race-bundle.js`，`YJ.raceBundle.pack/decode`）

```json
{ "v": 2, "dict": ["字符串字典…"], "xk": ["模板外键…"], "races": ["[场次行]…"], "by": { "264": ["[马264出场行]…"] } }
```

- **`by` 键 = 文件名主干 = 马 id**（`data/races/{id}.json` → `"264"`；basic.json 的
  `races_file` 带 `data/` 前缀，页面侧取 `split("/").pop()` 归一）。未出道马的空文件 → 空数组，保留键。
- **场次行**：17 个场次级字段按固定顺序（日付,発走,開催,場名,R,コース,レース名,格,条件,距離,芝ダ,馬場,天候,頭数,race_id,venue_type,來源），
  距離/頭数/race_id 存原始值，其余字符串走 `dict` 下标。
- **出场行** = `[场次下标, 马级字段…]`：马级 24 字段（出走馬名,性,年齢,斤量,枠番,馬番,人気,単勝,結果,タイム,上り,末脚,着差,通過,ペース,馬体重,増減,賞金,本賞金,騎手,調教師,jockey_id,trainer_id,photo）
  同序编码；`null` = 源里该键缺席（decode 还原为省略，不产出 `null` 值键）。
- **台账记录**（同马同日多赛事，如 `130.json` 8 条）不与出场行合并：以伪分组键
  `"\u0001{马id}\u0001{日付}"` 独立成组；其中 `race_id:""`（键在但空串）按原值保真，`race_id` 缺失/`null` 才省略。
- **未知键**（当前仅 `130.json` 的 `Rt`，值可为 `null`）：记入 `xk`，行尾以 `[xk下标, 值, …]` 对追加，decode 按键还原。
- **确定性**：马 id 数值序、dict 按首见序、无时间戳 → **同输入字节级稳定 → ETag 稳定 → SWR 304 生效**。
- **版本联动（审计 2.4）**：格式/字段升级时**三处同步**——① 数据 `v` 字段（+ 实际数据重打，人工核对）；
  ② `race-bundle.js` 的解码逻辑、③ `yj-cache.js` 缓存桶名 `<site>.data-vN`（§105 站点前缀；桶升级令全部旧缓存条目整体作废）
  都编进 JS 内容 → 构建期内容哈希戳（`vite.config.js` 的 auto-version 插件）会随内容变化自动换 URL，
  **②③ 已自动化、无需手工 bump**。仍须人工核对的是 ①，漏 ① 会出现「新 JS 读旧 bundle 或旧缓存」的错读。
- 打包器 `front/scripts/build-races-bundle.mjs` 自带 **round-trip 断言**
  （`decode(pack(src))` 逐字段与源全等，`null ≡ 缺席`），不等即 `exit 1` 拒绝构建。

### 消费端

- **比赛记录页（races.html）**：内嵌单马 `renderHorse` → `YJ.cache.fetch("bundle")` →
  `decode(b)[马id]`；独立模式 `initLibrary` → basic 马表 × `by[races_file 主干]` 组装 `LIB`。
  两处均保留逐马 `fetch('races/{id}.json')` 回退（源树模式/旧 dist 兜底）。
- **12h 缓存**：统一走 `front/public/yj-cache.js`（`YJ.cache`，桶 `yunji.data-v3`——§105 站点前缀；新鲜期 10min
  0 请求，软过期秒开 + SWR 后台 `If-None-Match/If-Modified-Since` 校验，304 续期 / 200 更新+onUpdate，
  硬过期同步取、失败回退旧缓存；`caches` 不可用降级直连）。同控制器还管理 basic/stats/datechart/timeline/pedigree。

## 9. races_edits.json —— 比赛记录人工编辑表（§104 批量表格）

**写入者唯一 = 编辑台**（批量表格页 `edit-table.html` 草稿提交，GitHub API 原子 commit）；抓取管线**永不写它**。
作用 = 让「比赛记录」支持人工 增/删/改：`merge_races.py` 每轮 **fetch 合并后、派生前** 重新套用（`apply_race_edits`，
纯函数）——del/mod **不烙死在 `races/{id}.json` 里**（下轮重抓原样回来，靠每轮重套用压制），套用在派生前 →
収得賞金 / 通算成績_逐场 / 主勝鞍 / 性別_当前 全部按编辑后履历计算。

```json
{
  "del": [ { "id": 33, "race_id": "202608040607", "日付": "2026-10-17", "馬名": "ココロヅヨサ" } ],
  "mod": [ { "id": 33, "race_id": "202608040607", "日付": "2026-10-17", "馬名": "ココロヅヨサ",
             "set": { "人気": 2, "タイム": null } } ],
  "add": [ { "id": 33, "日付": "2026-10-24", "出走馬名": "ココロヅヨサ", "場名": "京都", "R": 5,
             "レース名": "2歳新馬", "結果": 1, "來源": "人工", "…": "（记录字段同 races/{id}.json 契约）" } ]
}
```

- **`id`**：马 id（路由键，指向 `data/races/{id}.json`；add 落库时剥掉——逐马记录本身不带 id）。
- **匹配键 = `common.record_keys` 对称双键**（`race:{race_id}` / `horse:{name_key}|{日付}`）：del/mod 命中
  组内**全部**记录（台账同马同日多场同组一起删/一起改）；`race_id` 缺失（台账）走 馬名+日付
  （条目 馬名 由 `merge_races.entry_match_keys` 归一映射到记录字段 出走馬名——2026-10-26 双仓同改，
  此前条目只带 馬名 而实现读 出走馬名、键集为空，台账行 del/mod 静默无效）。
- **`mod.set`**：字段 → 新值；**值 `null` = 删键**（恢复未抓取状态）。场次级字段改动会落到组内所有记录。
- **`add`**：整条记录（字段同 §2 记录契约）；按双键去重（与文件已有/本表 add 重复即跳过）；缺省补
  `來源:"人工"`、`本賞金:0`；落库时同样过 结果/格/芝ダ 归一 + `order_record` 重排 + 日期排序。
- **前端草稿段**：编辑台草稿箱 `d.rc`（形状同本表三段），提交时叠加远端（同组键草稿覆盖远端、del 连带清 mod、
  重建行自动撤 del、add 双键去重），合并逻辑单源 = `front/public/editor.js::mergeRaceEdits`。
