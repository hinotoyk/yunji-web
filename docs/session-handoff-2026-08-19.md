# 会话交接 · 2026-08-19 M1 身份层落地（registry + build-data 身份重构）

> 会话目标：实施数据漏斗 v2 的 M1 里程碑——本地自增 id 身份层（registry 映射表 + build-data 身份解析 + 身份一致性断言）。
> 前置阅读：`docs/data-funnel-v2.md`（§3 身份层）、`docs/data-funnel-v2-exec.md`（M1 步骤）、`docs/session-handoff-2026-08-18.md`
> 状态：**M1 完成并验证**；下一步 = M2（比赛主源切换 netkeiba 适配器 + 骑手字典 + 本賞金）

---

## 1. 会话完成清单

| 项 | 状态 | 说明 |
|---|---|---|
| M1.1 种子生成器 | ✅ | 新建 `scripts/build_registry.py`：crops.json（407 匹）→ `data/registry.json`（id=顺序 1..407 + keys + names + 未命名标记）；已存在则拒绝覆盖（--force 才重建，防丢改名历史） |
| M1.2 build-data 身份重构 | ✅ | `load_registry()`/`save_registry()`/`resolve_identity()`（§3.2 顺序：nk_id→jbis_id→(馬名,生年)；新马 max+1；改名 names 追加 + 未命名同步；补 keys）；merge() 输出每匹带 `id`；台账建档马同样入 registry |
| M1.3 身份一致性断言 | ✅ | `test-data.py::identity_check()`：id 唯一 / registry↔crops 互认（nk_id/jbis_id/当前名/生年）/ 有 races 不许占位名 / 无重复馬名 |
| 字段不变验证 | ✅ | 新 crops 除 id/photo 外逐字段与旧 crops 完全一致（407 匹，0 差异）；races/stats 一致 |
| id 稳定验证 | ✅ | 连跑两次 build-data，id→(馬名,nk,jbis) 完全一致 |
| 边界单测 | ✅ | 新马 408 / 幂等 / 改名（id 保持、names 追加、未命名清除）/ JBIS 马补 nk_id |
| 负向测试 | ✅ | 注入错误 nk_id → test 拦截（exit 1）；恢复后全绿 |

## 2. 关键事实与发现

1. **registry 模型**：`names` 按时间追加、**末位 = 当前名**、其余 = 曾用名（修正了设计文档 §3.1「首位=当前名」的文字矛盾，与 M1.3 / §6.1 示例对齐）。
2. **id 语义 = 生年月日从小到大**（用户拍板）：种子按 `生年月日` 升序分配（`racelib.birth_date_key()` 公共排序键：缺失退 `生年`、再缺排末位、并列按马名），**最年长 = id 1**（Grand Warrior 无完整生日、生年 2023 → id 1）。crops 输出同序（台账建档马在 attach_races 后统一重排，保证 crops 顺序 = id 顺序）。此后新马 `max+1` 落在尾部。
3. **Grand Warrior（台账建档）在种子里**：种子来自 crops 全部 407 匹（含无 nk_id/jbis_id 的台账马），build 时经 (馬名, 生年) 解析回其 id，registry 保持 407 条不增。
4. **build-data 要求 registry.json 必须先存在**：缺失时明确报错「先跑 python scripts/build_registry.py」。registry.json 需随仓库提交（Actions 同样依赖）。
5. **`--no-snapshot` 仍会写 manifest 版本条目**（既有行为）：本次验证跑出 20260819_1407/1408 两条悬空快照引用；最终正式构建 20260819_1419 快照已生成。悬空条目为历史噪音，不影响站点渲染。

## 3. 数据现状

- crops.json：407 匹，**每匹带唯一 id（1–407，按生年月日从小到大，最年长=1）**；字段与 v1 完全一致
- data/registry.json：407 条（id + keys{nk_id,jbis_id} + names + 生年 + 未命名[142]）
- 血统 405/407；台账关联 134 + 建档 1（Grand Warrior，id=1）；test-data 全绿

## 4. 待办 / 下一步（M2，按顺序）

1. **M2.1** `scrape_netkeiba.py::parse_races` 增强：提取 `race_id` / `jockey_id`（链接 id 完整，文字截断免疫）
2. **M2.2** 新建 `scripts/build_jockeys.py`：`data/jockeys.json` = {jockey_id: 全名}（一次性抓完终身有效，当前 ~104 个）
3. **M2.3** 新建 `scripts/adapters/netkeiba_races.py`：成绩页 → 契约B 记录（主源，增量）
4. **M2.4** 比赛页补本賞金：重賞且本方 1/2着 场次，`本賞金 = 4着獲得/0.15 = 5着獲得/0.10`
5. **M2.5** `build-data.py::attach_races` 改：netkeiba 为主 + 台账仅海外补漏；骑手按 jockey_id 解析全名
6. M2 后接 M3（`--new` 对账 + 定时任务）/ M4（収得計算，卡 M2 本賞金）

## 5. 常用命令

```bash
# 身份层
python scripts/build_registry.py              # 生成种子（已存在拒绝）
python scripts/build-data.py --note "说明"     # 构建（registry 缺失会报错提示先跑种子）
python scripts/test-data.py                    # 全量校验（含 ✔ 身份一致性）
```

## 6. 文件变更（本次会话）

```
新增: scripts/build_registry.py, data/registry.json, docs/session-handoff-2026-08-19.md
修改: scripts/build-data.py（身份解析 + 输出 id + 生年月日排序 + 台账马重排）,
      scripts/racelib.py（is_unnamed_name / birth_date_key 公共函数）,
      scripts/test-data.py（identity_check 断言）, data/crops.json（每匹带 id，按生年月日升序）,
      data/merge-report.md, data/manifest.json, history/20260819_1419.json,
      docs/data-funnel-v2.md（§3.1 names 修正 + id 排序语义）, docs/data-funnel-v2-exec.md（M1 勾选）
```
