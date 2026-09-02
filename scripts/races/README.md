# 竞赛部分（逐场成绩 · 収得賞金）

消费 `data/basic.json` 的 `id` / `nk_id`，产出逐场成绩文件与竞赛字段，回填 basic.json。
脚本在 `scripts/races/`，**数据统一放在根 `data/`**（与基础部分共用，见根 README）。
与基础部分（`scripts/basic/`）**代码完全隔绝**：各自独立维护脚本与限速配置，
基础部分建档完成后基本不再跑，本部分要频繁更新（每次出赛日/海外赛后可跑）。

## 目录结构

```
scripts/races/                 # 竞赛部分脚本（成绩/収得，更新频繁）
├── common.py            # 共享：请求/限速/风控日志/basic.json 读写/缓存（独立副本，指向根 data/）
├── racelib.py           # 竞赛域规则：场地分类/格推导/収得賞金（与源无关）
├── fetch_detail.py      # ① 详情更新 + 通算成績判变（全部有 nk_id 的马）
├── fetch_races.py       # ② 成绩页增量（只抓 判变/无文件 的马）
├── fetch_prize.py       # ③ 重赏 1/2着 本賞金（race/nar SP 域）
├── fetch_ledger.py      # ④ 台账海外场增量
├── merge_races.py       # ⑤ 合并 → data/races/{id}.json + basic.json → 删缓存
├── run_all.py           # 编排：①→②→③→④→⑤ 线性单链
└── README.md

data/                      # 统一数据根（根目录，两部分的共同产物）
├── basic.json           # 唯一数据源（竞赛回填 通算成績/獲得賞金 (中央)/獲得賞金 (地方)/総賞金/収得賞金/races_file）
├── races/{id}.json      # 每匹逐场成绩（持久，增量只增不覆盖）
├── _tmp/races/          # 各环独立缓存（merge 后自动删除）
├── races_report.md      # 每次合并的更新报告
└── fetch_log.csv        # 风控请求日志（基础+竞赛统一记录，script 列区分）
```

## 线性主链（单链，不来回退）

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
   ▼
  ③ fetch_prize：race.netkeiba.com（中央）/ nar.netkeiba.com（地方）
     只处理新增记录里 収得 需要本賞金的场次（中央重赏 1/2着、地方 Jpn 1/2着）
     页内「本賞金:1着,2着,…万円」阶梯取该马自己着順那档 → _tmp/races/prize.json
   ▼
  ④ fetch_ledger：Google Sheets 台账 CSV → 只保留海外场 → 增量 → _tmp/races/ledger.json
   ▼
  ⑤ merge_races：
     合并新增记录进 data/races/{id}.json（按比赛键去重，已有不动）
     附本賞金 → 由完整履历统一计算 収得賞金（racelib 规则，无网络，円 → 'xx万円'/'xx億xx万円'，零值保留 0）
     回填 basic.json（通算成績/獲得賞金 (中央)/獲得賞金 (地方)/収得賞金/races_file）→ 写报告 → 删缓存
```

## 常用命令（在 scripts/races/ 下）

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

## 关键规则

- **增量只增不覆盖**：已有逐场记录不动，只追加比赛键（race_id，无则 日付+場名+R）不存在的记录。
  未出赛的马会落一个**空 races 文件**标记「已检查无成绩」，避免每次全量跑重复抓。
- **判变 = 通算成績 变化 ∪ 数据缺失**：除了「通算成績 去空白后精确比较」外，还做**数据完整性校验**——
  文件里 中央+地方 实际出赛数（結果为名次/中止/失格）必须 ≥ 通算成績 的应有战数；
  不足（如上次抓取失败落了空文件、或只并入了台账海外记录）→ 自动补拉，**杜绝「永远拉不到成绩」**。
  首次运行时所有马都没有 races 文件 → 全量初始化，不依赖判变。
- **収得賞金口径**（racelib）：中央重赏 1/2着 = 该马着順本賞金×50%（2歳 GⅢ 固定 1600/600万）；
  非重赏 1着 固定额（新馬/未勝利 400万、1勝 500万、2勝 600万、オープン 600万、3勝 900万）；
  地方 Jpn 1/2着 分段规则；障害归障害表；海外不计入。缺本賞金按 0 暂计并写入报告。
- **本賞金只拉収得需要的场次**：中央重赏 1/2着 + 地方 Jpn 1/2着；海外/非重赏不拉。
- **台账只留海外场**：netkeiba 成绩页聚合中央+地方+海外，台账仅补海外漏；海外场不参与収得。
  馬名匹配做「去国家后缀」归一（`Grand Warrior(JPN)` ↔ `Grand Warrior`）。

## 按域名限速（common.py 的 DOMAIN_SLEEP）

| 域名 | 间隔 | 用途 |
|---|---|---|
| db.netkeiba.com | 6.0s | 详情 / 成绩页（风控严） |
| race.netkeiba.com | 2.0s | 中央 比赛结果页（SP 域） |
| nar.netkeiba.com | 2.0s | 地方 比赛结果页（SP 域） |

每次请求写 `data/fetch_log.csv`（含 host 列），可统计各域名 403/失败率后调整间隔。

## 边界 / 纪律

- 本部分是**竞赛相关**，只做逐场成绩 + 収得，不碰建档/血统（那些在 `scripts/basic/`）。
- 单源线性：成绩只走 netkeiba 成绩页，台账只补海外；任何环节失败记报告，**不跨源回退**。
- 抓取脚本只写 `data/_tmp/races/` 独立缓存，`basic.json` 只在 merge 时写一次 → 无覆盖风险。
- `races_file` 引用口径与 `pedigree_file` 一致：`data/races/{id}.json`（站点根相对）。
- 原项目 `Z:\IdeaProjects\yunji-web` 为只读参考，业务逻辑不照抄。
