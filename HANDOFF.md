# 云迹 (yunji-web) · 交接文档

> 更新：2026-08-12（新增数据管理页 + 历史版本 + GitHub Actions 部署）

## 1. 项目定位

GitHub Pages 托管的静态站：**铁鸟翱天（コントレイル）产驹资料库**，个人查阅/检索/管理。

- 站点名：**云迹**
- 仓库：https://github.com/hinotoyk/yunji-web （branch main）
- 托管：GitHub Pages + **Actions 自动部署**（push 即生效，无需手动点部署）

## 2. 目录结构

```
yunji-web/
├── page/
│   ├── index.html       # 主从分栏查看页（fetch 真实数据 + 版本切换下拉）
│   ├── detail.html      # 独立详情页（hash 深链接）
│   └── admin.html       # 数据管理页（编辑/新增/删除/导出/GitHub 提交）
├── data/
│   ├── crops.json       # 当前数据（278 匹）
│   └── manifest.json    # 版本清单 {current, versions[]}
├── history/             # 历史版本快照 history/YYYYMMDD_HHMM.json（最多保留 30 个）
├── scripts/
│   └── build-data.py    # 源数据 → crops.json + 快照 + manifest
├── .github/workflows/deploy.yml   # Pages 自动部署
└── HANDOFF.md
```

## 3. 功能

**查看页 index.html**
- 左侧列表（搜索/年份筛选）+ 右侧详情（照片位/血统树/资料格/近况时间线/血统分析/备考）
- 顶部**版本下拉**：当前版 + 历史版（历史版选中时琥珀色高亮），切换即拉取 `history/xxx.json`
- `#马名` hash 深链接

**管理页 admin.html**
- 左列表 + 右侧编辑表单（基本资料 3×3 + 长文 4 块）
- 新增/删除产驹、修改标记「有未保存修改」
- **保存草稿**：localStorage（`yunji_draft_data`），防意外关闭丢失
- **导出 JSON**：下载 crops_YYYY-MM-DD.json
- **提交到 GitHub**（推荐主路径）：
  1. 配置 owner / repo / Fine-grained Token（Contents: Read and write，存 localStorage `yunji_gh_cfg`）
  2. 一键提交三文件：`data/crops.json`（带 sha 更新）+ `history/<时间戳>.json` 快照 + `data/manifest.json`
  3. Actions 自动部署，约 1 分钟生效
- 提交失败时兜底：导出 JSON → 手动 push

**版本管理**
- 查看端：manifest 列出历史版本，下拉切换
- 快照生成：管理页每次 GitHub 提交自动打一版；也可用 `scripts/build-data.py` 重建
- 保留策略：manifest 最多 30 个版本（管理页提交时裁剪）

## 4. 数据格式（data/crops.json）

```json
[{ "id":"馬名", "馬名":"", "译名":"", "馬主":"", "性別":"", "毛色":"", "母名":"",
   "母父名":"", "生产牧场":"", "管理調教師":"", "_source":"2023|2024", "价格":"",
   "评价":"", "近况更新/近走/牧场评价":"", "血统分析":"", "备考":"" }]
```

- 近况字段按「・」分段 → 查看页自动渲染时间线（日期段琥珀点标「近走」）
- 数据与油猴项目已解耦，由管理页/构建脚本自维护

## 5. 构建脚本

```
python scripts/build-data.py --source <源json> --note "备注" [--no-snapshot]
```
- 默认源：`contrail_progeny/tampermonkey-project/data/ContrailCrops.json`（UTF-8，278 匹）
- 输出：data/crops.json + history/<时间戳>.json + data/manifest.json
- 注意：源编码为 UTF-8（控制台显示乱码是 PowerShell 问题，Python 正常）

## 6. 部署链路（GitHub）

```
管理页编辑 → 提交到 GitHub（token 直写 3 文件）
    ↓
Actions deploy.yml 自动跑（checkout → upload-pages-artifact → deploy-pages）
    ↓
https://hinotoyk.github.io/yunji-web/page/   ← 访问入口
```

- 首次启用：仓库 Settings → Pages → Source 选「GitHub Actions」
- Token 生成：GitHub → Settings → Developer settings → Fine-grained tokens → 授权 yunji-web 仓库 Contents: Read and write
- 本地预览：`python -m http.server 8000`（在 yunji-web 根目录），访问 http://localhost:8000/page/

## 7. 注意事项

- 纯静态托管，无后端；管理页写入依赖浏览器 localStorage + GitHub API
- 管理页多人同时编辑无冲突处理（个人项目够用）
- 免责声明在页面 footer：「数据仅供分享交流，严禁用于赌博或违法行为」；许可证 CC BY-NC-SA 4.0
- 照片：hero 已留 4:5 占位，后续在数据加 photo 字段 + images/ 目录即可
