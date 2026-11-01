"""Run the deployed detector over a folder of photos and summarise what it finds.

This is a sanity check of the real model on real images, not a benchmark: it reports how many
images produced at least one detection, the categories found, confidence and latency. For a
proper mAP evaluation use `yolo val` on a labelled RDD2022 split (see scripts/train_rdd2022.py).

Usage: python scripts/evaluate.py <image_dir> [--out report.json] [--conf 0.25]
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.detector import Detector  # noqa: E402
from app.imaging import decode_image, redact  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("images", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--conf", type=float, default=None)
    args = ap.parse_args()

    s = get_settings()
    det = Detector.load(s.model_path, s.model_card_path, s.labels_path, s.onnx_threads)
    conf = args.conf if args.conf is not None else s.conf_threshold
    files = sorted(p for p in args.images.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    rows, latencies, cats, labels = [], [], Counter(), Counter()
    faces = plates = 0
    for f in files:
        img = decode_image(f.read_bytes())
        dets, ms = det.detect(img.rgb, conf, s.iou_threshold, s.max_detections)
        priv = redact(img.rgb)
        faces += priv.faces
        plates += priv.plates
        latencies.append(ms)
        dets.sort(key=lambda d: d.confidence, reverse=True)
        for d in dets:
            cats[d.category] += 1
            labels[d.label] += 1
        rows.append({
            "file": f.name,
            "width": img.width,
            "height": img.height,
            "detections": len(dets),
            "top": dets[0].as_dict() if dets else None,
            "inference_ms": ms,
            "faces_blurred": priv.faces,
            "plates_blurred": priv.plates,
        })
    hit = sum(1 for r in rows if r["detections"])
    tops = [r["top"]["confidence"] for r in rows if r["top"]]
    summary = {
        "model": {"name": det.name, "version": det.version, "classes": det.class_names},
        "images": len(rows),
        "conf_threshold": conf,
        "images_with_detection": hit,
        "detection_rate": round(hit / len(rows), 3) if rows else 0,
        "detections_by_category": dict(cats),
        "detections_by_label": dict(labels),
        "top_confidence_median": round(statistics.median(tops), 3) if tops else None,
        "latency_ms_median": statistics.median(latencies) if latencies else None,
        "latency_ms_p95": sorted(latencies)[int(0.95 * (len(latencies) - 1))] if latencies else None,
        "faces_blurred": faces,
        "plates_blurred": plates,
    }
    print(json.dumps(summary, indent=2))
    if args.out:
        args.out.write_text(json.dumps({"summary": summary, "images": rows}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
