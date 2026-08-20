# 会话交接 · 2026-08-19 M2 比赛主源切换 + M3 对账/定时任务

> 会话目标：实施数据漏斗 v2 的 **M2**（比赛主源切到 netkeiba 成绩页 + 骑手字典 + 本賞金）与 **M3**（`--new` 对账 + Actions 定时任务）。
> 前置阅读：`docs/data-funnel-v2.md`（§5 比赛聚合、§4.1 収得）、`docs/data-funnel-v2-exec.md`（M2/M3 步骤）、`docs/session-handoff-2026-08-19.md`（M1 交接）
> 状态：**M2 + M3 完成并验证**；下一步 = M4（収得計算，卡 M2 本賞金，已就绪）

---

## 1. 会话完成清单

| 项 | 状态 | 说明 |
|---|---|---|
| M2.1 parse_races 增强 | ✅ | `scrape_netkeiba.py::parse_races` 提取 `race_id`（レース名链接）+ `jockey_id`（騎手链接，`/jockey/result/(recent/)?` 两形态），缺失空串；`fetch_race_probe.py 2023101050` 输出含 race_id/jockey_id（佐々木大 那场 jockey_id=01197，文字截断但链接 id 完整） |
| M2.2 骑手字典 | ✅ | 新建 `scripts/build_jockeys.py`：扫 netkeiba_races.json → 103 个 distinct jockey_id → 抓 `/jockey/result/{id}/` 从 `<title>` 提取全名（`(.+?)の(年度別成績|騎手成績)`）；`data/jockeys.json` 103 条全名，0 失败；增量跳过已有 |
| M2.3 契约B 适配器 | ✅ | 新建 `scripts/adapters/netkeiba_races.py`：`fetch()`（本地转换，适配器契约）、`update()`（成绩页增量 + 本賞金第二趟）、`convert_to_contract_b()`（賞金 万円→円、DNF 单字规范化、条件/格 从レース名推导、jockey_id → 全名、附 來源/race_id/本賞金）；`pull_races.py --adapter netkeiba_races --no-write` → 643 条 / 134 匹，契约B 校验 **0 异常** |
| M2.4 本賞金 | ✅ | 重赏 1/2着 4 场全回填（缺失 0）：青葉賞 5400万 / 京都新聞杯 5400万 / レパードS 3700万 / **札幌2歳S 3100万**；公式 = 5着/0.10（主）4着/0.15（备），付加赏不派 4/5着 |
| M2.5 build-data 改造 | ✅ | `attach_races()` 主源换 netkeiba_races.json（按 nk_id），台账仅 venue_type=海外 补漏/覆盖；合并键 (日付,場名,R) netkeiba 优先；海外同场台账权威（netkeiba 海外 R 为空 → 同(日付,場名)唯一覆盖）；`來源` 每条标注；自动建档马同样盖章 |
| test-data 断言 | ✅ | 新增 `races_check()`：來源 合法 / 单马无重复场次 / 骑手全名 0 截断（jockey_id 解析 + 无 id 时前缀检查）/ 重赏 1/2着 全带本賞金（重赏集排除 L） |
| M3.1 --new 对账 | ✅ | `scrape_netkeiba.py --new`：列表 diff 三态（新马建档 / 改名更新馬名 / 消失忽略），只对新增/改名马发请求；首次实跑：列表 384 匹 · **新马 0 · 改名 4**（占位名转正式名）→ 报告 data/new-horses-report.md；改名经 build-data 传播 registry（names 追加曾用名、id 不变、未命名清除，抽查 4 匹全对） |
| M3.2 定时任务 | ✅ | `.github/workflows/update-data.yml`：每日 = `--new` + 适配器成绩增量 + `build_jockeys` + build + test；每周日 = 追加 `--ped` + `jbis --fill`；保留手动 races/all/single；YAML 结构校验通过（Actions 实跑需用户 push 后触发） |
| 幂等验证 | ✅ | 两次构建（1511/1513 快照）id 映射完全一致，races 数 650 不变 |

## 2. 关键事实与发现

1. **netkeiba 成绩页天然聚合中央+地方+海外**（一条 nk_id、一种格式），海外场 R 列常为空（如 デルマー GI）→ 合并时按 (日付, 場名) 唯一台账场次覆盖。**海外赛事 netkeiba 赏金为空**（デルマー 场实测空）→ 台账是海外唯一来源，符合设计 §5。
2. **本賞金反推：5着/0.10 最干净**。实测 4 场中 4着 普遍有 +5万 系统偏差（札幌2歳S 4着 470万 → 470/0.15=3133 而非 3100；レパードS 4着 560 → 3733 而非 3700），而 5着/0.10 全部是干净整数（3100/5400/5400/3700）。故主用 5着，4着仅兜底。
3. **札幌2歳S 本賞金 = 3100万 ≠ 设计文档 §4.1 的 3000万**。设计拟合 ジーネキング=1000万 用了 3000×20%=600，若用 3100 则 2着=620 → 合计 1020 万（差 2%，在 M4 reconcile 5% 闸门内）。留待 M4 判定，**未改设计文档**，此处如实记录。
4. **骑手截断全站 4 字**：netkeiba 成绩页骑手文字截断（佐々木大/永島まな/柴田裕一…），但链接 jockey_id 完整 → jockeys.json 103 全名一次抓完终身有效（含外国骑手 Ｃ．ルメール/Ｊ．モレイラ 等）。截断对照表 21 处，全名化后 crops 内 0 截断残留。
5. **比赛记录不记录 管理調教師**（用户拍板）：netkeiba 无调教师列、台账中央/地方丢弃，台账海外行的调教师也统一清空 → 前端履历「调教师」列整体留空，马档案「調教師」字段不受影响。
6. **数据差异提示**：サンライズレマ netkeiba 成绩 6 场 vs 台账 5 场（netkeiba 更全，merge-report 待校准 0——校验以 netkeiba 通算成績 为基准，一致）。
7. **契约B 校验全程通过**：netkeiba 记录的 除/中/取 单字 DNF 已规范化 除外/中止/取消；海外 GI（非 1/2着）与地方赛无 race_id/jockey_id 属正常（无链接），不触发失败。
8. **adapter fetch 命名坑**：适配器内自定义 `fetch()` 曾遮蔽 `scrape_netkeiba.fetch`，网络调用须用 `nk_fetch` 别名（已修）。
9. **build-data 依赖**：现在主源是 netkeiba_races.json（缺则跳过比赛数据并提示先跑适配器 update）；jockeys.json 缺则骑手回退截断名（test 会红，正常）。

## 3. 数据现状

- crops.json：407 匹，races 全部来自 netkeiba（642 条，中央 605 / 地方 36 / 海外 1）+ 台账海外 8 条（Grand Warrior 7 + スウィッチインラヴ デルマー 1），合计 650 条，每场带 `來源`/`race_id`/`jockey_id`（重赏带 `本賞金`）
- data/jockeys.json：103 条 {jockey_id: 全名}
- data/raw/netkeiba_races.json：134 匹 / 643 条（含 race_id/jockey_id/本賞金）
- registry.json：407 条不变；血统 405/407；test-data 全绿（含新增比赛主源断言）

## 4. 待办 / 下一步

1. **M4** 収得計算：`racelib.SHUTOKU_*` 规则表 + `compute_shutoku()` + `reconcile_shutoku.py` 闸门（**依赖 M2 本賞金，已就绪**）；札幌2歳S 3100 vs 设计 3000 由此判定
2. **M5** crops.json v2 {_meta, horses} + facet + 前端迁移
3. 运维：用户 `git add -A && git commit && git push origin main`（大量 M1/M2/M3 文件待提交）；push 后 Actions 首次实跑验证定时任务
4. 已知局限：netkeiba 列表页 384/419 解析缺口 → `--new` 只对账已解析行；台账海外刷新需手动 `pull_races.py`

## 5. 常用命令

```bash
# M2 比赛数据（netkeiba 主源）
python scripts/adapters/netkeiba_races.py --force   # 全量重抓成绩页 + 本賞金回填（增量默认跳过）
python scripts/build_jockeys.py                     # 骑手字典（增量，新骑手自动补）
python scripts/pull_races.py --adapter netkeiba_races --no-write   # 适配器契约冒烟（勿省 --no-write，否则覆盖 ledger.csv）
python scripts/build-data.py --note "说明"          # 构建（netkeiba 主 + 台账海外）
python scripts/test-data.py                         # 全量校验（含 ✔ 契约C 比赛主源）
```

## 6. 文件变更（本次会话）

```
新增: scripts/build_jockeys.py, scripts/adapters/netkeiba_races.py, data/jockeys.json,
      docs/session-handoff-2026-08-19-M2.md, data/new-horses-report.md
修改: scripts/scrape_netkeiba.py（parse_races + race_id/jockey_id + --new 对账模式）,
      scripts/racelib.py（race_meta_from_name / normalize_result / compute_honsho_prize / DNF_ABBR）,
      scripts/build-data.py（attach_races 主源切换 + merge_horse_races + 來源/管理調教師 盖章）,
      scripts/test-data.py（races_check 断言组）, data/crops.json（races 换 netkeiba 源 + 4 匹改名）,
      data/raw/netkeiba_races.json（全量重抓带 id/本賞金）, data/raw/netkeiba.json（4 匹改名）,
      data/registry.json（4 条改名簿记 names 追加）, data/merge-report.md, data/manifest.json,
      history/20260819_1511/1513/1638.json, .github/workflows/update-data.yml（每日/每周）,
      docs/data-funnel-v2-exec.md（M2/M3 勾选 + 本賞金差异备注）
```
