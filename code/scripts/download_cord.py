"""Download naver-clova-ix/cord-v2 and materialize it as files on disk.

Layout produced:
    vault/datasets/cord-v2/images/{train,validation,test}/NNNN.jpg
    vault/datasets/cord-v2/gt/{train,validation,test}.jsonl

Each jsonl line: {"id": "train-0001", "image": "images/train/0001.jpg", "gt": {...}}
where `gt` is the parsed CORD JSON (menu/sub_total/total).
"""
from __future__ import annotations

import json
from pathlib import Path

from datasets import load_dataset

ROOT = Path(__file__).resolve().parents[2] / "vault" / "datasets" / "cord-v2"
SPLITS = ["train", "validation", "test"]


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    ds = load_dataset("naver-clova-ix/cord-v2")

    for split in SPLITS:
        img_dir = ROOT / "images" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        gt_path = ROOT / "gt" / f"{split}.jsonl"
        gt_path.parent.mkdir(parents=True, exist_ok=True)

        with gt_path.open("w") as f:
            for i, row in enumerate(ds[split]):
                stem = f"{i:04d}"
                img_rel = f"images/{split}/{stem}.jpg"
                row["image"].convert("RGB").save(ROOT / img_rel, "JPEG", quality=92)

                gt = json.loads(row["ground_truth"])
                f.write(json.dumps({"id": f"{split}-{stem}", "image": img_rel, "gt": gt}) + "\n")

        print(f"{split}: {len(ds[split])} receipts → {gt_path}")


if __name__ == "__main__":
    main()
