# 克隆后改成自己的应援站 · AI 执行手册

> **给 AI 用**：按 0 → 7 顺序执行，一步做完再下一步。
> 只改 `config/` 下 5 个 JSON 与第 3 步列出的品牌文件；**不要改 `front/**`、`scripts/**` 的源码**。
> 字段看不懂就问人，别猜。
>
> 用法：clone 之后把这句话发给 AI ——「按 `docs/FORK.md` 帮我改成应援 <小马日文名> 的站」。

## 0. 环境与完成标准

- 所有命令在**仓库根**执行（Windows 用 Git Bash）。
- Node 18+（前端构建用 Vite 5）、Python 3.11（与 CI 一致）；Python 只用标准库，**不需要 `pip install`**。
- 完成标准 = 第 4 步构建自检**零 ⚠**。

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

### 1.2 `site` 段（站点身份）

| 字段 | 必填 | 怎么写 | 空/错的后果 |
|---|---|---|---|
| `id` | **必填** | 小写英文站点标识，如 `"mysite"`（**别用中文**） | 空 → 回退共享前缀，同机多站会串数据 |
| `name` | **必填** | 站名，如 `"云迹"` | 全站没有名字 |
| `subtitle` | **必填** | 副标题，显示成「站名 · 副标题」 | — |
| `tagline` | **必填** | 概览页站点名下那行小字 | — |
| `logo` | **必填** | **一个字**，如 `"雲"`（侧栏徽标） | — |
| `domains` | 可空 `[]` | 自己的域名，如 `["www.example.com"]` | 空 → 不统计来源域名 |
| `repo` | 可空 `""` | 必须 `owner/repo` 格式 | **空 = 编辑台整体关闭**；格式错 = 构建失败 |
| `analytics` | 可空 `{}` | `{"goatcounter":"账号","vercount":true}` | 空 → 不注入统计脚本 |
| `cross_site` | 可空 `{}` | `{"jbis_rank":"…","racing_calendar":"…"}` 两个别人家的站 | 空 → 对应板块整体不出现 |
| `ledger` 段 `url` | 可空 `""` | Google 表格导出的 CSV 地址 | 空 → 跳过台账环节 |

## 2. 其余 4 个配置 —— 不改也能跑

| 文件 | 怎么处理 |
|---|---|
| `config/features.json` | **删掉整个文件 = 所有页面都开**。只想关某页就写 `{"entries": false}` |
| `config/friend-links.json` | 清成 `{"sites": []}` → 侧栏不显示「站群导航」 |
| `config/video-sources.json` | 把 `"mid"` 置为 `""` → 回放功能关闭（其余字段别动） |
| `config/grade-table.json` | **必填，别动**（级别归一表，构建会校验非空） |

## 3. 品牌文件（5 个要换，`workflows` 不用动）

| 文件 | 改什么 |
|---|---|
| `front/public/favicon.svg` | 整个换掉（现在是青绿方块 + 「云」） |
| `front/public/apple-touch-icon.png` | 换成自己的 180×180 图标 |
| `front/package.json` | `"name"` |
| `wrangler.jsonc` | `"name"`（Cloudflare Pages 项目名） |
| `serve.config.json` | `"name"`；`"port"` 若与你其它本地站冲突则改 |
| `.github/workflows/*` | **不用改**——仓库名走 `${{ github.repository }}`，域名只出现在注释里 |

## 4. 先构建看效果（不抓数据）

```bash
cd front && npm install && npm run build && cd ..
python serve.py            # → http://127.0.0.1:9090/index.html
```

构建结尾会打印「本站身份」自检，**逐行核对**：`repo` / `analytics` / `domains` / `friend-links` / `cross-site` / `sire` / `capabilities`。出现 ⚠ 就是漏配，回第 1 步补。

此时页面品牌已经是你的，但**数据还是原作者的**（`data/` 是别人的产物）。

## 5. 首次抓数据（**必须本地跑，别交给 CI**）

> 时间可能很长，先本地跑通再谈自动化。

```bash
python run_update.py --init
```

- ⚠ `--init` 会**删空 `data/`** 再全量重建。跑之前确认这是新站，或先备份 `data/`。
- **耗时**：单步默认超时 3 小时（`run_update.py` 第 69 行 `STEP_TIMEOUT`）。产驹 500 匹以上建议先调大（如 `28800` = 8 小时）。
- 跑挂了就拆开分次跑：`python run_update.py --basic` → `python run_update.py --races`。
- 抓完重新构建：`cd front && npm run build`。
- 可选（只本地能跑）：`python run_update.py --video` 抓 B 站回放。
- ⚠ **本地不要用 `--ci`**：它会自动 commit + push。

## 6. 部署

1. **`data/` 要一起提交**（线上站点直接读仓库里的 `data/*.json`）。
2. push 到 `main` → `.github/workflows/deploy.yml` 自动构建发布。
3. 仓库 Settings 两处必开：
   - Pages → Source = **GitHub Actions**
   - Actions → General → Workflow permissions = **Read and write**

## 7. 收尾检查

- [ ] 构建自检零 ⚠
- [ ] 概览页显示：我的站名 / 我应援的小马 / 自家产驹数
- [ ] `data/basic.json` 里确实是自己应援小马的产驹
- [ ] favicon 与 touch-icon 已换
- [ ] `cross_site`、`friend-links.json` 里没有指向原作者站的残留
- [ ] 读过 `NOTICE`：数据与照片版权不随代码授权，fork 后的合规责任自负
