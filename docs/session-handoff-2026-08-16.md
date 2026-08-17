# 会话交接 · 2026-08-16 数据源 v2（netkeiba 血统全量 + JBIS 兜底）

> 会话目标：血统图数据源从 JBIS（200/404 覆盖）切换为 netkeiba（404/404 全量），JBIS 降级为兜底；前端五代完整展示；测试改小样本。
> 前置阅读：`docs/data-source-refactor.md`（v2 已同步更新）
> 状态：**代码全部完成，全量数据已构建（406 匹，405 血统），待用户人工复核**

---

## 1. 会话完成清单

| 项 | 状态 | 说明 |
|---|---|---|
| 覆盖矩阵分析 | ✅ | 基础数据/血统图 各 3 类组合，全量名单在 `C:\Users\hinotoyk\AppData\Local\Temp\opencode\coverage_report.md`（临时） |
| netkeiba 血统解析 | ✅ | `scrape_netkeiba.py::parse_pedigree`（DFS 重建） |
| `--ped` 模式 | ✅ | 只补血统，`--limit` 生效 |
| 全量血统抓取 | ✅ | 404 匹 62 格全量 + FNo（399 匹本次跑，5 匹之前） |
| scrape_jbis.py 兜底化 | ✅ | 産駒一覧 → 与 netkeiba 比对 → 详情+血统；`--fill` 废弃 |
| JBIS 兜底抓取 | ✅ | Hazey Jane / Grand Warrior(JPN) 2 匹 |
| build-data.py 新合并 | ✅ | netkeiba 主 + jbis 兜底 + jbis_pedigree クロス增强 |
| crops.json 构建 | ✅ | 406 匹，血统 405/406，快照 20260816_1136 |
| 前端五代全量展示 | ✅ | index/detail 横向滚动树 + 数据源提示更新 |
| 前端验证 | ✅ | Playwright 截图 3 类 + glm-vision 看图确认，无 console 错误 |
| 小样本测试脚本 | ✅ | `scripts/test-data.py`（每类抽样 3 匹，--smoke 网络冒烟） |
| 文档更新 | ✅ | data-source-refactor.md v2（含测试原则） |

## 2. 数据现状（全量已由本次会话跑完）

- netkeiba.json：404 匹（含血统+fno）· jbis.json：2 匹兜底 · crops.json：406 匹
- 血统覆盖 405/406，唯一缺口：**イリデの2025**（netkeiba 源站血统页空白，非代码问题）
- クロス增强 177 匹

## 3. 卡点记录（重点：问题 + 解决思路）

### 卡点 1：netkeiba 血统表结构诡异（最大卡点，耗时最长）

**现象**：5代血統表不是普通 rowspan 三角表。列不对应代，行不对应层；同代单元格 rowspan 不一致（Halo rs2 但 Cosmah rs1、Wishing Well rs2 但サンデー rs4）——按 rowspan 定代/行号定索引的常规思路全部失败。

**推演过程**（踩过的坑）：
1. 先试「rowspan → 代」映射 → 同代 rowspan 冲突，放弃
2. 再试「行起始位置 → 索引」→ Cosmah/Gana Facil 等位置对不上
3. 网格模拟 → 列号乱（fallback 赋值不可靠）
4. 最终从 tr 逐行 dump + 已知谱系交叉验证 → 发现规律

**本质**：文档序 = **DFS 先序（父系优先）递归**；每格 rowspan = 其子树占**表格行数**（根 16 → 逐层对半 → 叶子 1，与深度无关，与是否展示子代有关）；格子在 HTML 中的行 = DFS 访问顺序的行。

**解法**：按文档序收集 cell（rowspan, node）→ 递归 `dfs(idx, rows)`：取根，`rows//2` 对半切给父系/母系子树 → 重建二叉树（左=牡，右=牝）→ BFS 分层 → `[[G1],[G2],[G3],[G4],[G5]]`。

**验证**：アオイハルカ 父系 G2=[ディープ,ロードクロサイト]、G4=[Halo,Cosmah,Understanding,...] 全对；全量 406 匹行数 2^d 校验 0 异常。

### 卡点 2：netkeiba 血统页 id 混淆（十六进制）

**现象**：深层格子 `<a href>` 是 `000a00033a` 这类假 id，只有前 1-2 格是真十进制。曾导致正则 `\d+` 过滤后只解析出 8 格。

**判定**：非限流（响应 200 正常、未访问过的马也如此），是源站持久行为。名字/年份/毛色完好，仅 id 无效。

**解决**：正则改 `\w+` 不跳过；前端不依赖节点 id → 无影响。若未来要外链节点，需另想办法（源站无解，或映射表）。

### 卡点 3：`--ped --limit 5` 全量跑了

**现象**：--ped 分支没接 --limit，`--ped --limit 5` 直接跑全部 404 匹，把 bash 超时杀掉了（无输出）。

**解决**：--ped 分支加上 `if args.limit: ids = ids[:args.limit]`。

**教训**（用户提出，已入文档 §6 测试原则）：**开发测试禁止全量，每类抽样 2-3 匹**；全量由人工触发。

### 卡点 4：测试脚本 import 抓取脚本时 stdout 崩

**现象**：`ValueError: I/O operation on closed file`。原因：TextIOWrapper 被 GC 时关闭共享底层 buffer；test-data 包装 stdout 后 load 模块，模块再包装 → 前一个 wrapper 失去引用被 GC → buffer 关闭。

**解决**：抓取脚本 stdout 包装改为**幂等**（`encoding` 已是 utf-8 则跳过，try/except 包裹）；test-data 保持自己的 utf-8 wrapper 存活，exec 模块时不重置 stdout。

### 卡点 5：未命名仔血统误判

**现象**：早期探针显示未命名仔（母名の2025）血统只有 4 格 → 误以为源站限制。

**真相**：4 格是探针正则只匹配绝对 URL + 十进制 id 的假象；实际 62 格全量（混淆 id 同样存在）。

### 卡点 6：イリデの2025 血统空白

**现象**：该马血统页 32 行但格子全空（无名字无链接），title 也空。

**判定**：源站数据洞（可能是未登记仔的异常页），非代码 bug。全库唯一无血统马，待源站补数据后 `--name イリデの2025` 单匹补。

## 4. 遗留事项 / 下一步（给下个会话）

1. **人工复核全量数据**：重点看 2 匹兜底马（Hazey Jane / Grand Warrior）在列表和详情页的表现；イリデの2025 无血统的展示（前端已容错「暂无血统数据」）。
2. **Actions workflow 检查**：`update-data.yml` 的 `single` 模式命令是否与新参数兼容（--fill 已删，确认 workflow 里没引用）。
3. **README.md / HANDOFF.md 更新**：本次只更新了 docs/data-source-refactor.md；README 命令段与 HANDOFF 仍指向 v1 流程。
4. **旧 jbis_pedigree.json 处置**：保留作クロス增强；若未来クロス不必要可删。
5. **crops.json 体积**：4.3 MB（血统全量后增大），GitHub Pages 直接静态服务没问题；如需优化可压缩。
6. **2026 年生**：netkeiba 列表目前不含 2026（母名の2026 未出现），JBIS 産駒一覧已有 2026 未命名仔（跳过）。2026 数据链后续按需补。

## 5. 常用命令速查

```bash
# 小样本测试（开发阶段用这个！）
python scripts/test-data.py             # 本地抽样校验
python scripts/test-data.py --smoke     # 网络冒烟 4-5 匹

# 人工全量更新（用户触发）
python scripts/scrape_netkeiba.py --ped --sleep 0.5    # 血统（8 分钟）
python scripts/scrape_jbis.py --all --sleep 1.5        # 兜底
python scripts/build-data.py --note "说明"

# 单匹补漏
python scripts/scrape_netkeiba.py --name イリデの2025
python scripts/build-data.py --note "补血统"
```
