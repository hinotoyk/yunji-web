"""
云迹数据构建脚本
用法:
    python scripts/build-data.py                          # 从源文件重建 crops.json + manifest + 快照
    python scripts/build-data.py --source <path>          # 指定源文件
"""
import json, os, sys, argparse, io
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
HISTORY = os.path.join(ROOT, "history")
DEFAULT_SOURCE = r"Z:\IdeaProjects\contrail_progeny\tampermonkey-project\data\ContrailCrops.json"

FIELDS = ["馬名", "译名", "馬主", "性別", "毛色", "母名", "母父名",
          "生产牧场", "管理調教師", "近况更新/近走/牧场评价", "血统分析", "备考", "_source"]


def load_source(path):
    if not os.path.exists(path):
        sys.exit(f"❌ 源文件不存在: {path}")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data


def normalize(records):
    out = []
    for r in records:
        h = {}
        for k in FIELDS:
            h[k] = r.get(k, "")
        h["id"] = r.get("馬名", "") or r.get("译名", "")
        if not h["id"]:
            continue
        out.append(h)
    return out


def update_manifest(current_id, count, note="", versions=None):
    mf_path = os.path.join(DATA, "manifest.json")
    mf = {"current": current_id, "versions": []}
    if os.path.exists(mf_path):
        with open(mf_path, encoding="utf-8") as f:
            old = json.load(f)
        mf["versions"] = old.get("versions", [])
    # 去重：同 id 不重复
    mf["versions"] = [v for v in mf["versions"] if v["id"] != current_id]
    mf["versions"].insert(0, {
        "id": current_id,
        "file": f"history/{current_id}.json",
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "count": count,
        "note": note,
    })
    # 最多保留 30 个历史版本
    mf["versions"] = mf["versions"][:30]
    mf["current"] = current_id
    with open(mf_path, "w", encoding="utf-8") as f:
        json.dump(mf, f, ensure_ascii=False, indent=2)
    return mf


def main():
    ap = argparse.ArgumentParser(description="云迹数据构建")
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--note", default="")
    ap.add_argument("--no-snapshot", action="store_true", help="不生成新快照(仅更新当前数据)")
    args = ap.parse_args()

    os.makedirs(HISTORY, exist_ok=True)
    records = normalize(load_source(args.source))
    print(f"✔ 读取 {len(records)} 匹")

    cur_id = datetime.now().strftime("%Y%m%d_%H%M")
    with open(os.path.join(DATA, "crops.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    if not args.no_snapshot:
        with open(os.path.join(HISTORY, f"{cur_id}.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

    mf = update_manifest(cur_id, len(records), args.note)
    print(f"✔ crops.json 已更新 ({len(records)} 匹)")
    print(f"✔ 快照: history/{cur_id}.json")
    print(f"✔ 版本数: {len(mf['versions'])}")


if __name__ == "__main__":
    main()
