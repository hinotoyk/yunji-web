# 会话交接 · 2026-08-17 比赛数据接入 + 契约分层 + UI 改版（阶段0-2）

> 会话目标：比赛数据接入（Google Sheets 台账为权威源）+ 数据流通与数据源无关的契约分层 + 定时自动同步 + UI 展示逐场履历
> 前置阅读：`docs/data-contracts.md`（契约定义，本项目地基）、`README.md`、`HANDOFF.md`、`云迹项目.md`（桌面规格书 v2）
> 状态：**代码全部完成、本地数据已构建（407 匹 / 135 匹带履历）、本地预览可看；尚未推送 GitHub（沙箱无法 push，需用户终端执行）**

---

## 1. 会话完成清单

| 项 | 状态 | 说明 |
|---|---|---|
| 需求澄清（9 轮问答） | ✅ | 比赛数据粒度/范围/同步节奏/大盘视角/图片来源/设备/UI 风格/技术底座 全部确认 |
| 规格书 v2 | ✅ | 桌面 `C:\Users\hinotoyk\Desktop\云迹项目.md` 重写为七章规格（含实施路线） |
| 台账摸底 | ✅ | Google Sheets 649 条 / 135 匹，字段全摸清，中央 605 / 地方 36 / 海外 8 |
| **契约分层** | ✅ | `docs/data-contracts.md`：契约A(raw) / 契约B(ledger.csv) / 契约C(crops.json)；换源只改适配器 |
| 适配器模式 | ✅ | `scripts/adapters/sheets_ledger.py` 唯一知道 Google Sheets；`pull_races.py --adapter` 可换源 |
| racelib 公共逻辑 | ✅ | `scripts/racelib.py`：契约B 类型化/场地级别推导/汇总统计/建档推导（与源无关） |
| pull_races 重写 | ✅ | 适配器 → 校验/去重 → `data/races/ledger.csv` + `sync-report.md`（不再碰 crops） |
| build-data 改造 | ✅ | 唯一构建器：契约A + 契约B → crops.json + `merge-report.md`（关联/覆盖/待校准） |
| 别名/自动建档 | ✅ | `data/aliases.json`：映射 / `action=create` 自动建档（Grand Warrior 海外云崽 7战2胜） |
| 契约校验 | ✅ | `test-data.py` 增契约B/C 全量断言 + "台账建档"分类；全绿 |
| 定时同步 workflow | ✅ | `update-data.yml`：schedule 每天 UTC22:00 + 手动 races/all/single 三模式 + 构建后契约测试 |
| **UI 改版（阶段2）** | ✅ | `page/race-ui.js` 共享组件：KPI 卡 + 过滤/排序履历表；index 加筛选+迷你战绩；detail 接入；admin 加别名维护 |
| 前端验证 | ✅ | node 语法检查 4 文件全过 + 407 匹无头运行时测试 0 错误 |
| git 提交 | ✅ | `35c7b95`（数据+脚本+workflow）+ 阶段2 提交（本次） |

## 2. 数据现状

- crops.json：**407 匹**（netkeiba 404 + JBIS 兜底 2 + 台账建档 1），带逐场履历 **135 匹**
- ledger.csv：649 条（中央 605 / 地方 36 / 海外 8），异常 0；重赏 29（GI×6 GII×11 GIII×12）+ L×9
- 血统覆盖 405/407；クロス增强 177 匹
- 自动建档：Grand Warrior（性別=セ、生年=2023 由性齢推导，海外 7战2胜）
- 交叉校验：台账 vs netkeiba 通算成績 差异 0（レヴァンターセ漏记场已由台账补上，7/16 门别）

## 3. 卡点记录

### 卡点 1：aliases.json 落盘位置 bug
`pull_races.py` 先在"加载别名"处写盘（空 {}），未匹配马的内存条目没写出去 → 报告谎称"已写入别名表"。
**解决**：写盘挪到未匹配处理之后。

### 卡点 2：别名表新旧格式不兼容
旧格式 value 是目标名字符串，新格式是 `{action,target,note}` 字典 → `for src,tgt in aliases.items()` 解包崩溃。
**解决**：`tgt = entry.get("target") if isinstance(entry,dict) else entry`，兼容两种。

### 卡点 3：created 列表存了显示名，取值按归一化键 → KeyError 'Grand Warrior'
**解决**：存归一化键，展示时再转显示名。

### 卡点 4：Grand Warrior 性別推导为"空"
台账性齢：2025 年 `牡2` → 2026 年 `セン3`（被阉割），"多值则留空"规则保守失败。
**解决**：性别取**最近一场**的性齢（当前状态最准确）；生年做一致性推导。

### 卡点 5：test-data 把台账建档马误判为 JBIS 兜底 → "无血统"误报
**解决**：classify 增 `ledger_created` 类（无 nk_id/jbis_id 且有 races），单独校验（只要求有履历）。

### 卡点 6：沙箱无法 git push（环境边界，非代码问题）
git commit 正常，但 push 时凭据助手（Git Credential Manager）子进程管道被沙箱禁 → `couldn't create signal pipe` / `could not read Username`。
**结论**：不绕过；**推送需用户在自有终端执行**：`cd Z:\IdeaProjects\yunji-web && git push origin main`。

## 4. 待确认 / 遗留（给下个会话）

1. **本地人工复核 UI（当前最重要）**：
   - `http://localhost:8000/page/index.html` — 筛选（年份/性别/状态）、列表迷你战绩、详情 KPI 卡 + 履历表过滤排序
   - `http://localhost:8000/page/detail.html#スウィッチインラヴ` — 独立详情
   - `http://localhost:8000/page/admin.html` → 右上「别名」弹窗
2. **推送**：用户终端 `git push origin main`（含 35c7b95 + 阶段2 提交）；推送后 Pages 自动部署 + 定时任务激活；首次可手动 Run workflow（`races`）验证链路
3. **台账需保持公开可读**；仓库闲置 60 天定时任务暂停 → 手动触发一次恢复
4. **阶段3：数据大盘 dashboard.html**（种马维度 KPI + 图表 + 下钻，ECharts 本地 vendored）
5. **阶段4：图片上传**（管理页 → `data/images/<馬名>/` + `photo` 字段，`data/images/` 目录已预留）
6. **preview.html 处置**：临时核验页，阶段3 后建议移除（或并入 dashboard）
7. **旧 jbis_pedigree.json**：保留作クロス增强（沿用 8/16 结论）
8. **2026 年生产驹**：netkeiba 列表暂无 2026（母名の2026 未出现），后续按需补
9. **管理页提交链路注意**：admin 提交会整体覆盖 crops.json（含 races/stats 会被下次 build 重算覆盖，事实字段以抓取/台账为准，符合契约）

## 5. 常用命令速查

```bash
# 比赛数据（快，定时任务主路径）
python scripts/pull_races.py                        # 适配器→ledger.csv+sync-report
python scripts/pull_races.py --adapter 新适配器名    # 换数据源

# 马匹/血统数据（重，人工触发）
python scripts/scrape_netkeiba.py --all --sleep 1.0
python scripts/scrape_jbis.py --all --sleep 1.2

# 构建 + 校验
python scripts/build-data.py --note "说明"           # 契约A+契约B → crops.json + merge-report
python scripts/test-data.py                          # 抽样 + 契约B/C 全量断言

# 本地预览
python -m http.server 8000                           # http://localhost:8000/page/index.html

# 推送（用户终端）
git add -A && git commit -m "说明" && git push origin main
```
