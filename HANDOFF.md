# 云迹 (yunji-web) · 交接文档

> 生成时间：2026-08-11 · 会话来源：contrail_progeny 项目设计讨论
> 更新：2026-08-11 · 平台改 GitHub Pages，数据管道已落地

## 1. 项目定位

GitHub Pages 托管的静态站：**铁鸟翱天（コントレイル）产驹资料库**，供个人查阅检索。

- 站点名：**云迹**
- 英文名：候选 Contrail / Cloudtrace / Yunji（未最终定，目前仓库名 yunji-web）
- 平台约束：GitHub Pages 仅静态托管，无后端；**自动构建部署**（push 即生效，约 1 分钟），免实名

## 2. 已确认决策（本会话结论）

| 事项 | 结论 |
|---|---|
| 技术栈 | 原生 HTML+JS 单页，零依赖，无构建 |
| 布局 | **主从分栏**：左列表（380px）+ 右详情，点击即看无跳转（原 C 方案布局） |
| 配色 | 简约温暖：暖米白底 `#f7f4ee` + 白卡 + 柔绿主色 `#3f8f78` + 琥珀点缀 `#c98a3d` |
| 详情页 | 照片位(4:5) + 徽章行 + 血统树(父/母/母父) + 2×2 资料格 + 近况时间线 + 血统分析 + 备考 |
| 数据来源 | 复用油猴脚本数据（Excel → JSON 转换），以谁为主待定 |
| 图片 | 暂缓，数据预留照片位（占位虚线框+首字） |
| 否决 | 其余 10+ 套风格（竞马绿/报纸/星际/卡牌/票根/瑞士/大屏/昭和/拍卖…）全部否决 |

## 3. 当前文件状态

```
yunji-web/
├── data/crops.json          ← 站点数据（278 匹，由转换脚本生成，勿手改）
├── page/
│   ├── index.html           ← 主从分栏 SPA（fetch ../data/crops.json，hash 深链接）
│   └── detail.html          ← 独立详情页（深链接落地页，与 index 右侧同构，动态渲染）
├── scripts/convert_crops.py ← 源数据 → data/crops.json 转换脚本
└── README.md
```

- 预览地址：`python -m http.server 8000` 后访问 `http://localhost:8000/page/`
- 数据：278 匹真实产驹（2023×131 / 2024×147），字段含马名/译名/性别/毛色/母名/母父/牧场/调教师/马主/价格/评价/近况/血统分析/备考/_source
- 空字段容错：译名缺失显示日文名、近况/血统分析/备考缺失隐藏或占位

## 4. 页面功能规格

- **index.html**：
  - 左侧：搜索框（马名/译名/母父/牧场/调教师/马主）、年份 pills（全部/2023/2024）、列表项含缩略头像位（38px 圆角方）
  - 右侧：详情视图，`#马名` hash 深链接，history.replaceState 同步
  - 近况自动解析：按「・」分条，首行作标题，日期正则 `DATE_RE=/^(\d{1,2}月\d{1,2}|2[0-9]|1[0-9]|[0-9]+\.[0-9]+)/` 判为「近走」条目（琥珀点），其余标「来源」（绿点）
- **detail.html**：hero（照片位+名字+徽章+概览）→ 血统树 → 资料格 → 时间线 → 血统分析 → 备考
- 响应式：左侧 380px 固定，无移动端特化（后续可加）

## 5. 数据层现状（重要）

源数据在 `Z:\IdeaProjects\contrail_progeny\tampermonkey-project\data\ContrailCrops.json`：

- **278 匹**，`_source` 分 2023/2024 两世代
- **编码陷阱**：文件为 UTF-8（早前疑似 GBK 的判断是控制台显示问题，Python `encoding='utf-8'` 读取正常）
- 字段：馬名/译名/馬主/性別/毛色/母名/母父名/生产牧场/管理調教師/近况更新/近走/牧场评价（**源文件合并为单键 `近况更新/近走/牧场评价`**）/血统分析/备考/_source
- 转换脚本：`scripts/convert_crops.py`（本仓库，从源 ContrailCrops.json → data/crops.json）
- 上游脚本：`tampermonkey-project/src/clean_excel_merged_cells_to_json.py`（Google Sheets CSV → JSON，支持 `--local` 读 Excel）
- 近况字段含「・」分段（育成评价/马主/调教师/日期近走），详情页时间线即解析此结构
- 派生字段：`价格` 从备考正则提取（「精选拍卖会 X亿」/「募集 X亿/万」），`评价` 取近况首个非日期段

**数据质量现状**：278 匹中血统分析缺 233、近况缺 158、译名缺 149、调教师缺 123、备考缺 42，页面已全部容错

## 6. 下一步（按序）

1. ✅ **定数据管道**：`scripts/convert_crops.py` → `page/data/crops.json`，index/detail 均 fetch 加载
2. **GitHub 发布**（待执行）：
   - GitHub 新建仓库 `yunji-web`（Public，不勾 README）
   - remote 已配：`origin → https://github.com/hinotoyk/yunji-web.git`，首次提交：`git add` → commit → `git push -u origin main`（注意先补 .gitignore 排除 .idea/）
   - 仓库 Settings → Pages → Source 选 `main` / root → Save
   - 访问 `https://<用户名>.github.io/yunji-web/page/`
   - 每次更新：改源数据 → `python scripts/convert_crops.py` → push（自动部署，约 1 分钟）
3. **照片方案**：数据留 `photo` 字段，空则显示占位（结构已预留）
4. **后续增强候选**（未排期）：移动端适配、照片懒加载、按年拆 JSON（过千匹时）

## 7. 备注

- 免责声明文案已在页面 footer：「数据仅供分享交流，严禁用于赌博或违法行为」
- 许可证 CC BY-NC-SA 4.0（沿用原项目）
- 本仓库 git 已初始化，branch main，remote 已连 `origin → github.com/hinotoyk/yunji-web.git`（代码尚未首次提交）
