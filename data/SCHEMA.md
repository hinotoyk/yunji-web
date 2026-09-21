# data/SCHEMA.md · 数据产物字段契约（单一出处）

`data/` 各产物的**字段契约与口径**统一写在这里（原来散在 `scripts/**/build_*.py` 文件头，阶段 6a 搬来）。
改字段先改这里 + 对应生成脚本；「管线怎么跑」见 `scripts/README.md`，跨管线代码结构见同文件。
前端只读产物，字段解释以外实现在 `front/`。

---

## 1. basic.json —— 马匹主表（唯一「前合并」数据源）

结构：`{"_meta": {"schema": "basic/v1", "updated": "...", "count": N}, "horses": [ … ]}`
（`_meta` 由 `save_basic` 每次重写；前端只读，勿手改——手改第二天会被 CI 抹掉，人工值走 §3 人工表。）

**字段模板与列序的唯一出处 = `scripts/_shared/basic_io.py::BASIC_FIELDS`（31 键，键序 = 落库列序）**，
两处历史副本（`build_registry.BASIC_TEMPLATE`、`merge_basic.py` 的局部 `ORDER`）已合成它：

- `BASIC_TEMPLATE` = 去掉「管线才写入的列」（`収得賞金`、`母父`、`馬齢`）→ 建档时初始化的模板；
- `BASIC_ORDER` = 去掉「不进固定列序的派生列」（性别_当前 / 通算成績_逐场 由 `merge_races.move_after` 归位到同源字段之后）→ `merge_basic` 重排基准；
- 模板外的键（如人工新增列）在重排时**追加在末尾**，不丢数据；`獲得賞金` / `獲得賞金地方` 是旧字段名，重排时丢弃。

| # | 字段 | 建档默认值 | 建档模板 | 固定列序（merge 重排） | 说明 |
|---|---|---|---|---|---|
| 1 | `id` | `null` | ✓ | ✓ | 自增业务主键，后续所有关联（血统/studbook/netkeiba/races）都用它 |
| 2 | `nk_id` | `""` | ✓ | ✓ |  |
| 3 | `jbis_id` | `""` | ✓ | ✓ |  |
| 4 | `馬名` | `""` | ✓ | ✓ |  |
| 5 | `欧字馬名` | `""` | ✓ | ✓ |  |
| 6 | `香港馬名` | `""` | ✓ | ✓ |  |
| 7 | `自译馬名` | `""` | ✓ | ✓ |  |
| 8 | `母名` | `""` | ✓ | ✓ |  |
| 9 | `母父` | `""` | — | ✓ | merge_basic 由血统图 derive（pedigree.母[1][0].name） |
| 10 | `生年` | `""` | ✓ | ✓ |  |
| 11 | `馬名意味` | `""` | ✓ | ✓ |  |
| 12 | `登録状態` | `""` | ✓ | ✓ |  |
| 13 | `性別` | `""` | ✓ | ✓ |  |
| 14 | `性別_当前` | `""` | ✓ | — | merge_races 3b 派生：官方 性別 是登录值，逐场记录才是当期事实；与官方一致时自动消失 |
| 15 | `毛色` | `""` | ✓ | ✓ |  |
| 16 | `馬齢` | `""` | — | ✓ |  |
| 17 | `生年月日` | `""` | ✓ | ✓ |  |
| 18 | `産地` | `""` | ✓ | ✓ |  |
| 19 | `馬主` | `""` | ✓ | ✓ |  |
| 20 | `調教師` | `""` | ✓ | ✓ |  |
| 21 | `生産牧場` | `""` | ✓ | ✓ |  |
| 22 | `通算成績` | `""` | ✓ | ✓ |  |
| 23 | `通算成績_逐场` | `{}` | ✓ | — | merge_races 3d 派生：全站通算战绩唯一展示源（含海外台账场） |
| 24 | `獲得賞金 (中央)` | `""` | ✓ | ✓ |  |
| 25 | `獲得賞金 (地方)` | `""` | ✓ | ✓ |  |
| 26 | `総賞金` | `""` | ✓ | ✓ |  |
| 27 | `収得賞金` | `""` | — | ✓ | merge_races 由逐场 本賞金 统一计算（平地/障害/Jpn 三档） |
| 28 | `セリ取引価格` | `""` | ✓ | ✓ |  |
| 29 | `photo` | `""` | ✓ | ✓ | 图源 URL/路径；人工钉成数组时 [] = 确无图片 |
| 30 | `races_file` | `""` | ✓ | ✓ | 站点根相对路径 data/races/{id}.json |
| 31 | `pedigree_file` | `""` | ✓ | ✓ | 站点根相对路径 data/pedigree/{id}.json |

抓取来源分工（详见 `scripts/README.md`）：JBIS 建档（id / jbis_id / 馬名 / 母名 / 生年）→ netkeiba 详情（
登録状態 / 性別 / 毛色 / 馬主 / 調教師 / 通算成績 / 獲得賞金 …）→ studbook（馬名意味）→ 血统图（pedigree_file / 母父）
→ 竞赛管线（races_file / 収得賞金 / 性別_当前 / 通算成績_逐场）。

---

## 2. races/{id}.json —— 每匹逐场成绩（数组）

落库列序 = `scripts/races/common.py::RACE_RECORD_ORDER`（写文件时统一重排，模板外未知键追加在末尾）：

1. `日付` · `発走` · `出走馬名` · `性` · `年齢`
6. `開催` · `場名` · `R` · `コース` · `レース名`
11. `格` · `条件` · `距離` · `芝ダ` · `馬場`
16. `天候` · `斤量` · `枠番` · `馬番` · `頭数`
21. `人気` · `単勝` · `結果` · `タイム` · `上り`
26. `着差` · `通過` · `ペース` · `馬体重` · `増減`
31. `賞金` · `本賞金` · `騎手` · `調教師` · `jockey_id`
36. `trainer_id` · `venue_type` · `race_id` · `photo` · `來源`

- **結果三态**（全站口径）：完赛 = 数字着顺；未完赛 = `中止` / `失格`（计出走）；未出走 = `取消` / `除外`（不计出走）。
  历史单字值（中/取/除/失）在写文件时由 `racelib.normalize_result` 归一为全称。
- **來源**：`netkeiba`（成绩页）| `台账`（海外 ledger 补录）。`通算成績` 字符串是 netkeiba 镜像，
  只用于 `check_data.py` 同口径对账；展示一律用 `basic.json` 的 `通算成績_逐场`（含台账场）。
- **去重键**（增量抓取判重用，两条同时生效）：`race:{race_id}` 与 `horse:{馬名归一}|{日付}`，
  见 `scripts/races/common.py::record_keys`；无 race_id 的台账记录靠 馬名+日付（一匹马一天只跑一场）。
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
- ⚠ 本文件会随构建进 `dist/data/`（公网可读），别写私人笔记。

`timeline_manual.json` 同性质：`events[]` 为人工节点，`build_timeline.py` 重算永不覆盖本表，只参与排序。

---

## 4. timeline.json —— 时间线事件产物

以下原文搬自 `scripts/timeline/build_timeline.py` 文件头（1-76 行）：

```text
时间线事件预计算：读 data/basic.json + data/races/*.json → data/timeline.json

规则（自 front/pages/timeline.html 旧 JS 引擎逐条移植，事件语义不变；2026-09-18 标签文案统一「首胜」措辞）：
  1.  级别首胜       —— OP/L/G3/G2/G1/Jpn1/Jpn2/Jpn3 每个级别的产驹史首胜，全局只出现一次
                        （2026-09 确认：级别首胜为全局口径，不再按马；标签「G2首胜」等）
  1b. 世代新马首胜 —— 每个世代（=生年/届）最早的新马战一着，一代只此一条（标签「XXXX年产新马首胜」）
  2.  重赏胜利       —— 所有重赏一着都记录；序数为产驹史全局口径（跨马按日期累计，2026-09 确认）：
                        「重赏首胜 / 重赏第N胜」+ 该级别「G2第N胜」（第1胜=级别首胜，不重复挂）+ 海外全局「海外重赏首胜 / 海外重赏第N胜」；
                        马内不再记同级别序数（G2首胜 等级别首胜仍按马）
  3.  世代重赏首胜   —— 每届产驹在 JRA 中央的首场重赏胜利，一代只此一条（标签「XXXX年产重赏首胜」）
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
      "photo": "图源 URL/路径：race.photo 优先 → 回退马照片；manual 可自带；空串=浅灰占位",
      "tags":  [ { "cat": "标签类别色（同 node 取值）", "label": "徽章文字", "tip": "可选：悬停提示",
                   "crown": true —— 可选：首胜标签（label 以「首胜」结尾）前端在右上角画斜置小皇冠 } ],

      // ── type=race 专属 ──
      "race": {
        "name":   "赛事名（已剥掉「徽章代劳」的格级括号尾缀：テレビ東京杯青葉賞(GII) → テレビ東京杯青葉賞，
                   口径同 race-rows.js raceNameText —— 尾缀与 格 相等且该格有徽章才剥，否则 (1勝クラス) 等原样保留）",
        "grade":  "原始格（GII/JpnI/L/OP…，新马战为 新馬）",
        "glabel": "徽章显示字（G2/G3/L…，无徽章格为空）",
        "gbadge": "徽章 css 类（g1/g2/g3/gl/gop）",
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
  * 比赛级别细分：新马 / 未胜利 / 一胜级~三胜级(1-3勝クラス) / OP / L / Jpn1-3 / G1-3 / 其他
    （桶键即中文标签，展示序见 stats.html TAB_ORDER.grade；下钻同 races.html gradeMatches）。
  * 重赏：GI/GII/GIII/JpnI/JpnII/JpnIII（同 races.html「重赏」筛选 / timeline GRADED 口径）。

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
          "dims": {                    # 每维 = [{k, n, dnf, exc, w, p2, p3}]，按 n 降序
            "surf": [...], "dist": [...], "cond": [...], "turn": [...], "grade": [...],
            "ninki": [...], "sex": [...], "track": [...], "trainer": [...], "jockey": [...],
            "mps": [...]               # 母父（血统图 母の父 格；basic.json 母父字段）
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
（2026-09-14 布局样式定稿，按 UI优化记录 §32.6 接入真实数据）。
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
      "r":    レース名（含格级尾缀，如 札幌2歳S(GIII)）,
      "g":    格（GI/GII/GIII/L/OP/JpnI-3/新馬/未勝利/N勝クラス/''，空串=无徽章）,
      "v":    場名,
      "R":    R 番号（int/str 原样，海外部分为 str；缺失=空串）,
      "hs":   発走（"HH:MM"/''，明细同日発走排序用）,
      "dist": 距離（m，int；缺失=空串）,
      "s":    芝ダ（芝/ダ/障害/AW）,
      "p":    着顺（int 1-18；未完走=原样字符串 中止/取消/除外/失格）,
      "pr":   赏金（円，int；該马该场 賞金 空/非数=0）,
      "vt":   venue_type（中央/地方/海外 —— 前端 JRA/NAR/海外 场地范围筛选用）,
      "bk":   馬場状态（良/稍重/重/不良/''，明细表用）,
      "ki":   斤量（int/str 原样，海外可为 "120lb"；'' 缺失）,
      "nk":   人気（int/''，明细表人气徽章用）,
      "tm":   タイム（字符串，'' 缺失）,
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
