"""Export an Ultralytics YOLOv8 .pt detector to ONNX and write models/model_card.json.

Requires requirements-train.txt (PyTorch + Ultralytics). The serving container only needs
the resulting .onnx file and model card.

Usage:
  python scripts/export_onnx.py models/YOLOv8_Small_RDD.pt \
      --name roadshield-rdd-yolov8s --dataset "RDD2022 (Japan+India)" \
      --source https://github.com/oracl4/RoadDamageDetection --license AGPL-3.0
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

MODELS = Path(__file__).resolve().parent.parent / "models"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("weights", type=Path)
    ap.add_argument("--name", default="roadshield-rdd-yolov8")
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--dataset", default="RDD2022")
    ap.add_argument("--source", default="")
    ap.add_argument("--license", default="AGPL-3.0")
    ap.add_argument("--out", type=Path, default=MODELS / "roadshield-rdd.onnx")
    args = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    exported = Path(model.export(format="onnx", imgsz=args.imgsz, opset=12, simplify=True, dynamic=False))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(exported), args.out)

    weights_sha = hashlib.sha256(args.weights.read_bytes()).hexdigest()
    names = model.names
    card = {
        "name": args.name,
        "version": f"{args.weights.stem}@{weights_sha[:12]}",
        "architecture": "YOLOv8 (Ultralytics)",
        "imgsz": args.imgsz,
        "class_names": [names[i] for i in sorted(names)],
        "dataset": args.dataset,
        "source": args.source,
        "license": args.license,
        "weights_sha256": weights_sha,
        "onnx_sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (args.out.parent / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    print(json.dumps(card, indent=2))


if __name__ == "__main__":
    main()
