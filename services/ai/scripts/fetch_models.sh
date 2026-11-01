#!/usr/bin/env bash
# Fetches every model file the AI service serves, into services/ai/models/.
#   1. Road-damage detector: YOLOv8s trained on RDD2022 → exported to ONNX (needs requirements-train.txt)
#   2. Face detector for privacy redaction: OpenCV ResNet-10 SSD (prototxt + caffemodel)
# If you received roadshield-ai-models.zip, just unzip it into services/ai/models/ instead.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models/face_ssd
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

if [ ! -f models/roadshield-rdd.onnx ]; then
  python scripts/fetch_pretrained.py
  python scripts/export_onnx.py models/YOLOv8_Small_RDD.pt \
    --name roadshield-rdd-yolov8s --dataset "RDD2022 / CRDDC2022 (Japan + India subsets)" \
    --source https://github.com/oracl4/RoadDamageDetection --license "AGPL-3.0 (Ultralytics YOLOv8)"
fi

if [ ! -f models/face_ssd/res10_300x300_ssd_iter_140000.caffemodel ]; then
  git clone --depth 1 --single-branch --branch dnn_samples_face_detector_20170830 \
    https://github.com/opencv/opencv_3rdparty "$tmp/o3p"
  cp "$tmp/o3p/res10_300x300_ssd_iter_140000.caffemodel" models/face_ssd/
fi
if [ ! -f models/face_ssd/deploy.prototxt ]; then
  git clone --depth 1 --branch 4.x --filter=blob:none --sparse https://github.com/opencv/opencv "$tmp/ocv"
  git -C "$tmp/ocv" sparse-checkout set samples/dnn/face_detector
  cp "$tmp/ocv/samples/dnn/face_detector/deploy.prototxt" models/face_ssd/
fi
sha256sum models/roadshield-rdd.onnx models/face_ssd/* 
