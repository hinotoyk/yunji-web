# yunji-web · 云迹

铁鸟翱天（コントレイル）产驹资料库 · GitHub Pages 静态站，供个人查阅检索。

## 在线访问

`https://hinotoyk.github.io/yunji-web/page/`

## 本地预览

```bash
python -m http.server 8000
```

## 更新数据

源数据在 `contrail_progeny/tampermonkey-project/data/ContrailCrops.json`，转换后入库：

```bash
python scripts/convert_crops.py
git add -A && git commit -m "update data" && git push
```

push 后 GitHub Actions 自动部署（约 1 分钟）。

## 结构

```
page/
├── index.html           主从分栏 SPA（列表 + 详情）
├── detail.html          独立详情页（hash 深链接）
└── data/crops.json      站点数据（由转换脚本生成，勿手改）
scripts/convert_crops.py 源数据 → page/data/crops.json
```

## 数据说明

- 数据仅供分享交流，严禁用于任何违法行为

License: CC BY-NC-SA 4.0
