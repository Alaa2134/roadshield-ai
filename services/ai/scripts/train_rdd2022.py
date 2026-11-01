"""Train a RoadShield road-damage detector on RDD2022 with Ultralytics YOLOv8.

1. Download RDD2022 from https://github.com/sekilab/RoadDamageDetector (CC BY-SA 4.0) and
   convert the Pascal-VOC labels to YOLO format with classes:
     0 D00 longitudinal crack   1 D10 transverse crack   2 D20 alligator crack   3 D40 pothole
   (the Ultralytics docs and oracl4/RoadDamageDetection notebook 0 show the conversion).
2. Write a dataset YAML, e.g. datasets/rdd2022.yaml:
     path: datasets/rdd2022
     train: images/train
     val: images/val
     names: {0: Longitudinal Crack, 1: Transverse Crack, 2: Alligator Crack, 3: Potholes}
3. Train (a single T4/RTX GPU takes a few hours for yolov8s at 640 px; Colab works):
     python scripts/train_rdd2022.py --data datasets/rdd2022.yaml --model yolov8s.pt --epochs 100
4. Export:  python scripts/export_onnx.py runs/detect/roadshield/weights/best.pt --name roadshield-rdd-yolov8s
"""

from __future__ import annotations

import argparse


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--model", default="yolov8s.pt")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.model)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        name="roadshield",
        patience=20,
        cos_lr=True,
        close_mosaic=10,
        seed=42,
        deterministic=True,
    )
    metrics = model.val(data=args.data, imgsz=args.imgsz)
    print("mAP50-95:", metrics.box.map, "mAP50:", metrics.box.map50)


if __name__ == "__main__":
    main()
