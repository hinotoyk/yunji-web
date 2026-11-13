# 克隆后改成自己的应援站 · AI 执行手册

> **给 AI 用**：按 0 → 7 顺序执行，一步做完再下一步；第 8 节是红线，开工前先扫一眼。
> 只改 `config/` 下 5 个 JSON 与第 3 步列出的品牌文件；**不要改 `front/**`、`scripts/**` 的源码**——抓取不通先跑第 5 步的冒烟体测，属上游契约漂移就反馈模板仓（见第 8 节），别在 fork 里自己重写管线。
> 字段看不懂就问人，别猜。
>
> **用法**：clone 之后把下面这段发给 AI，`<...>` 换成你要应援的马。**马页链接必给**——日文名会撞名（同名马、外国产同名），链接是唯一能取准 `netkeiba_id` 的锚：
>
> ```text
> 按 docs/FORK.md 帮我把这个站改成应援 <小马日文名> 的站。
> 马页：https://db.netkeiba.com/horse/<马页 URL 里那串数字>/
> ```
>
> 有现成的中文名就一并写上（如 `シルバーステート / 银州`）；没写就让 AI 用通行译名，拿不准时问人，别自己造。

## 0. 环境与完成标准

- 所有命令在**仓库根**执行（Windows 用 Git Bash）。
- Node 18+（前端构建用 Vite 5）、Python 3.11（与 CI 一致）；**需要 `pip install requests beautifulsoup4 lxml`**——抓取层是惰性导入这三个（`scripts/core/net.py` 第 115、227 行），标准库跑不动；CI 的 workflow 本来就有这一步。
- 完成标准 = 第 4 步自检清单**每一条你都能解释**。「零 ⚠」只有同时填了 `site.repo`、非空 `domains`、至少一项 `analytics` 才可能达成；这三项留空属**合法关闭态**（编辑台关 / 统计关），必然带 ⚠，不算失败（详见 1.2）。

## 1. `config/sire.json` —— 唯一必改的文件

一份文件管两件事：应援的小马档案（`sire` 段）+ 站点身份（`site` 段）。

### 1.1 `sire` 段（应援的小马）

| 字段 | 必填 | 怎么写 | 空/错的后果 |
|---|---|---|---|
| `name_ja` | **必填** | 日文名，如 `コントレイル` | 空 → 父子制覇与报错文案失效 |
| `name_cn` | **必填** | 中文名，如 `飞机云` | 空 → 中文名缺失 |
| `name_en` | 可空 `""` | 英文名 | 只影响展示 |
| `jbis_id` | **必填** | JBIS 马页 URL 里那串数字，如 `0001237042` | 空 → 抓不到产驹列表 |
| `netkeiba_id` | **必填** | netkeiba 马页 URL 里那串数字，如 `2017101835` | 空 → 抓不到成绩 |
| `studbook.name` | **必填** | 与 studbook.jp 上**逐字一致**的马名 | 对不上 → 管线直接退出 |
| `studbook.father` | **必填** | 父马日文名，如 `ディープインパクト` | 空 → 血统匹配失败 |
| `progeny_years` | **必填** | 非空四位数年份数组，如 `[2023, 2024]`；**只写已出生的年份** | 缺 / 空 / 非法 → **直接报错退出** |
| `wins` | 可空 `[]` | 它自己的重赏战绩 | 空 → 父子制覇改由 netkeiba 派生 |

两条容易自己吓自己的情况：

- `studbook.name` 报「未找到」但 studbook.jp 上明明有这匹马 → 多半是**唯一命中的 302 直跳档案页**被误判。先确认与站上逐字一致（全角/半角、长音符、空格），再跑第 5 步冒烟体测的第 4 项。
- `progeny_years` 含**当岁**（今年出生）是对的，但这批马当年还没有 netkeiba 页 → 没有 `data/races/{id}.json` 属数据源现状，不是漏抓。

### 1.2 `site` 段（站点身份）

| 字段 | 必填 | 怎么写 | 空/错的后果 |
|---|---|---|---|
| `id` | **必填** | 小写英文站点标识，如 `"mysite"`（**别用中文**） | 空 → 回退共享前缀，同机多站会串数据 |
| `name` | **必填** | 站名，如 `"云迹"` | 全站没有名字 |
| `subtitle` | **必填** | 副标题，显示成「站名 · 副标题」 | — |
| `tagline` | **必填** | 概览页站点名下那行小字 | — |
| `logo` | **必填** | **一个字**，如 `"雲"`（侧栏徽标） | — |
| `domains` | 可空 `[]` | 自己的域名，如 `["www.example.com"]` | 空 → 不统计来源域名，**且构建必打 1 条 ⚠**（合法关闭态，见 §0） |
| `repo` | 可空 `""` | 必须 `owner/repo` 格式；**先建好这个仓库再填** | **空 = 编辑台整体关闭**（同样必打 ⚠）；格式错 = 构建失败；填了不存在的仓库 → 编辑页门禁能过但 PAT 校验必失败 |
| `analytics` | 可空 `{}` | `{"goatcounter":"账号","vercount":true}` | 空 → 不注入统计脚本；若 `domains` 非空而这里两项皆空，构建会打 ⚠ 提示「白名单过了、统计仍关」 |
| `cross_site` | 可空 `{}` | `{"jbis_rank":"…","racing_calendar":"…"}` 两个别人家的站 | 空 → 对应板块整体不出现 |
| `ledger` 段 `url` | 可空 `""` | Google 表格导出的 CSV 地址 | 空 → 跳过台账环节 |

## 2. 其余 4 个配置 —— 不改也能跑

| 文件 | 怎么处理 |
|---|---|
| `config/features.json` | **删掉整个文件 = 所有页面都开**。只想关某页就写 `{"entries": false}` |
| `config/friend-links.json` | 清成 `{"sites": []}` → 侧栏不显示「站群导航」 |
| `config/video-sources.json` | 把 `"mid"` 置为 `""` → 回放功能关闭。**同时清掉 `space_url` 与 `search.keyword`**：回放关了它们不生效，但留着是原作者的 B 站地址和搜索词，第 7 节会判为残留 |
| `config/grade-table.json` | **必填，别动**（级别归一表，构建会校验非空） |

## 3. 品牌文件（换下面这几处，`workflows` 不用动）

| 文件 | 改什么 |
|---|---|
| `front/public/favicon.svg` | 整个换掉（现在是青绿方块 + 「云」） |
| `front/public/apple-touch-icon.png` | 换成自己的 180×180 图标 |
| `front/public/friend-links.js` | 内置 `LEGACY_SITES` 清空（文件注释已写明 fork 后可整段删）；漏了会把原站群地址带进产物 |
| `front/package.json` | `"name"` |
| `wrangler.jsonc` | `"name"`（Cloudflare Pages 项目名） |
| `serve.config.json` | `"name"`；`"port"` 不能与其它本地站冲突——四兄弟站已占 9090~9093，新站从 **9094** 起 |
| `README.md` / `AGENTS.md` | 站名、应援马、产驹数（照 `data/basic.json` 的实际条数改）。不影响运行，但仓库一公开就指向错站 |
| `.github/workflows/*` | **不用改**——仓库名走 `${{ github.repository }}`，域名只出现在注释里 |

## 4. 先构建看效果（不抓数据）

```bash
cd front && npm install && npm run build && cd ..
python serve.py            # → http://127.0.0.1:9090/index.html
```

构建结尾会打印「本站身份」自检，**逐行核对**：`repo` / `analytics` / `domains` / `friend-links` / `cross-site` / `sire` / `capabilities`。**除 1.2 里那三条「空 = 关闭」的预期 ⚠ 之外，其余任何 ⚠ 都是漏配**，回第 1 步补。

此时页面品牌已经是你的，但**数据还是原作者的**（`data/` 是别人的产物）。

## 5. 首次抓数据（**必须本地跑，别交给 CI**）

> 时间可能很长，先本地跑通再谈自动化。

```bash
python run_update.py --init
```

- ⚠ `--init` 会**删空 `data/`** 再全量重建（`run_full_test.py::wipe_data` 对整个目录 `rmtree`，没有回收站）。跑之前确认这是新站，或先备份 `data/`。
- ⚠ 删掉的不只是 `*.json`：`data/photos/`（写真）和 4 张人工表（`manual_overrides` / `races_manual` / `timeline_manual` / `video_*`）**一并没了** → 档案页降级成占位图标、人工修正全丢。要保留就 `cp -r data data_bak`，抓完再把这几项回填。
- **先花 30 秒跑一次抓取冒烟**：`python scripts/smoke_fetch.py` —— 4~5 个请求，判断上游的编码 / 跳转 / 页面结构今天还认不认这套脚本（只出报告，不动数据、不改退出码）。别等删空 `data/` 之后才发现抓不了（模板仓就踩过：netkeiba 全站转 UTF-8 后，克隆者首刷得到的是全库乱码）。
- 跑完把这一轮的 `test-logs/` 日志留下并一起提交：它是「这批数据是怎么来的」的唯一证据；没有日志，别人（和以后的你）无从判断数据可不可信。
- **耗时**：不需要预先调超时。编排层（`run_update.py` / `run_full_test.py` 的 `run_step`）只按「有没有进度输出」判卡死——连续 20 分钟无任何输出即中止并整轮退出；总时长兜底是 CI 的 job `timeout-minutes`（已设 GitHub 上限 6h）。参考实测：729 匹冷启动 6h02m / 4866 请求，其中 5.1h 是限速等待、1.84h 才是网络。
- 跑挂了就拆开分次跑：`python run_update.py --basic` → `python run_update.py --races`。
- 抓完重新构建：`cd front && npm run build`。
- 可选（只本地能跑）：`python run_update.py --video` 抓 B 站回放。
- ⚠ **本地不要用 `--ci`**：它会自动 commit + push。

## 6. 部署

1. **先把 remote 换成自己的仓库**——clone 来的 `origin` 还指着模板仓，直接 push 要么失败、要么打到别人仓库（后者是事故）：

   ```bash
   git remote -v                    # 看一眼，应该还是模板仓
   # 在 GitHub 上先建好空仓库，再换地址：
   git remote set-url origin https://github.com/<你>/<你的站>.git
   ```

   第 1 步填的 `site.repo` 要和这个地址**一致**，否则编辑台的 PAT 校验必失败。
2. **`data/` 要一起提交**（线上站点直接读仓库里的 `data/*.json`）。
3. push 到 `main` → `.github/workflows/deploy.yml` 自动构建发布。
4. 仓库 Settings 两处必开：
   - Pages → Source = **GitHub Actions**
   - Actions → General → Workflow permissions = **Read and write**

## 7. 收尾检查

- [ ] 构建自检里没有**解释不了**的 ⚠（1.2 那三条空配置提示属预期）
- [ ] `git remote` 已指向自己的仓库，不是模板仓
- [ ] 概览页显示：我的站名 / 我应援的小马 / 自家产驹数
- [ ] `data/basic.json` 里确实是自己应援小马的产驹，且 `data/` 已随代码提交
- [ ] favicon 与 touch-icon 已换
- [ ] `cross_site`、`friend-links.json`、`video-sources.json` 里没有指向原作者站的残留
- [ ] `test-logs/` 里有这一轮全量抓取的日志
- [ ] 读过 `NOTICE`：数据与照片版权不随代码授权，fork 后的合规责任自负

## 8. 已知边界与红线

**别为了「跑通」动这几处**——都能让当次变绿，代价是数据错、被封 IP，或者下次同步模板时全线冲突：

- **不要下调抓取间隔**（各 `common.py` 的 `DOMAIN_SLEEP`）。冷启动 6 小时里有 5 小时是故意的限速等待；频率翻几倍没被封，只是没被抓到。
- **不要放宽 `scripts/**/verify_*.cjs` 的断言**。断言红通常是「本库数据分布与母版不同」，正确做法是确认口径后显式 `skip` 并打印 SKIP，而不是改成 `ok(true)` 或「不着色也算通过」——那会让真正的回归永远看不见。
- **不要在 fork 里大改 `scripts/**`**。抓取失败先跑 `python scripts/smoke_fetch.py`（4 个请求、30 秒、只出报告不动数据）：FAIL 说明是上游契约漂移，反馈模板仓修一次所有 fork 都受益；自己在 fork 里改，下次同步就是硬冲突。
- **`--init` 只在真新站上跑**：它 `rmtree` 整个 `data/`，照片与人工表一起走，没有回收站。

**这些「缺一块」是合法的，别去排查**：1.2 的三条空配置（编辑台/统计/跨站板块整体关闭）、当岁批次没有成绩页、`data/photos` 为空时档案页占位图、`video-sources.mid` 为空时回放列整体消失。
