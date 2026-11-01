"""Download the YOLOv8s road-damage weights published by oracl4/RoadDamageDetection.

The model was trained on the CRDDC/RDD2022 dataset (Japan + India subsets) for four classes:
Longitudinal Crack, Transverse Crack, Alligator Crack, Potholes.

Licensing: the weights were produced with Ultralytics YOLOv8 (AGPL-3.0) from RDD2022
(CC BY-SA 4.0). Serving them makes this service AGPL-3.0 — keep its source public, credit the
authors, and prefer training your own model with scripts/train_rdd2022.py for production.

Usage:  python scripts/fetch_pretrained.py            (writes models/YOLOv8_Small_RDD.pt)
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

URL = "https://github.com/oracl4/RoadDamageDetection/raw/main/models/YOLOv8_Small_RDD.pt"
DEST = Path(__file__).resolve().parent.parent / "models" / "YOLOv8_Small_RDD.pt"


def main() -> int:
    DEST.parent.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        print(f"already present: {DEST}")
    else:
        print(f"downloading {URL}")
        with urllib.request.urlopen(URL, timeout=120) as res, open(DEST, "wb") as out:  # noqa: S310 - fixed https URL
            while chunk := res.read(1 << 20):
                out.write(chunk)
    digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
    print(f"sha256 {digest}  size {DEST.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
