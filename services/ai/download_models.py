"""Download any missing model files at image build time (used by the Dockerfile).

The ONNX detector, its model card and the face-detector files are published as assets of the
GitHub Release `ai-models` by .github/workflows/ai-models.yml. Files already present in models/
(e.g. copied in locally) are kept.
"""

import os
import sys
import urllib.request
from pathlib import Path

BASE = os.environ.get("MODEL_BASE_URL", "https://github.com/Alaa2134/roadshield-ai/releases/download/ai-models")
FILES = {
    "roadshield-rdd.onnx": "models/roadshield-rdd.onnx",
    "model_card.json": "models/model_card.json",
    "deploy.prototxt": "models/face_ssd/deploy.prototxt",
    "res10_300x300_ssd_iter_140000.caffemodel": "models/face_ssd/res10_300x300_ssd_iter_140000.caffemodel",
}

for asset, dest in FILES.items():
    path = Path(dest)
    if path.is_file() and path.stat().st_size > 0:
        print(f"present  {dest}")
        continue
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"{BASE}/{asset}"
    print(f"download {url}")
    try:
        urllib.request.urlretrieve(url, path)  # noqa: S310 - fixed https URL
    except Exception as exc:  # noqa: BLE001
        print(f"warning: could not download {asset}: {exc}", file=sys.stderr)
