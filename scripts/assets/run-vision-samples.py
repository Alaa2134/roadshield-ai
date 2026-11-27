"""Run the production RoadShield Vision detector on the website photos and store the REAL
outputs used by the website overlays (apps/web/src/lib/vision-samples.json).

  python scripts/assets/run-vision-samples.py --model services/ai/models/roadshield-rdd.onnx \
      --card services/ai/models/model_card.json --credits /path/to/credits.json [--credits ...]

Photos are read from apps/web/public/photos/*.webp; credits.json files come from
fetch-commons-photos.py (licence, author, source). Keys map website file → Commons file stem.
"""
import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "ai"))
from app.detector import Detector  # noqa: E402

SOURCES = {
    "scan-road-fl": "wildlife-lane-hernando-county-fl-3", "field-road-ua": "ukraine-krym-zaozerne-sadove-wmid4974533",
    "alligator-cracking": "deteriorated-asphalt", "pothole": "potholes-on-asphalt-road-20171023",
    "cracks-closeup": "asphalt-cracks-42291397720", "repair-crew": "asphalt-repairs-49525069893",
    "wheelpath-damage": "road-surface-deterioration-by-pavement-markings", "crack-star": "it-starts-with-a-crack-35815932072",
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--card", required=True); ap.add_argument("--credits", action="append", required=True)
    a = ap.parse_args()
    card = json.loads(Path(a.card).read_text())
    det = Detector.load(Path(a.model), Path(a.card), ROOT / "services" / "ai" / "labels.json")
    credits = {}
    for f in a.credits:
        credits.update({c["file"].rsplit(".", 1)[0]: c for c in json.loads(Path(f).read_text())})
    out = {"model": card["name"], "version": card["version"], "onnx_sha256": card["onnx_sha256"], "conf_threshold": 0.25, "iou_threshold": 0.45,
           "device": "CPU (ONNX Runtime)", "run_at": datetime.now(timezone.utc).isoformat(), "photos": {}}
    for name, stem in SOURCES.items():
        im = Image.open(ROOT / "apps/web/public/photos" / f"{name}.webp").convert("RGB")
        dets, ms = det.detect(np.asarray(im), 0.25, 0.45, 20)
        c = credits[stem]
        out["photos"][name] = {"src": f"/photos/{name}.webp", "width": im.width, "height": im.height, "inference_ms": ms,
            "detections": [{k: d.as_dict()[k] for k in ("label", "category", "confidence", "box")} for d in dets],
            "credit": {"title": c["title"], "author": c["author"], "licence": c["licence"], "licence_url": c["licence_url"], "source": c["source"],
                       "changes": "cropped, colour-graded and re-encoded by RoadShield"}}
    for dest in (ROOT / "apps/web/src/lib/vision-samples.json", ROOT / "docs/test-results/website-vision-samples.json"):
        dest.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print({n: [(d["label"], round(d["confidence"], 2)) for d in v["detections"]] for n, v in out["photos"].items()})

main()
