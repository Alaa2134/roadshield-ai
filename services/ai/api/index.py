"""Vercel demo entrypoint for the existing RoadShield AI FastAPI service.

Downloads the published third-party ONNX model to ephemeral /tmp on cold start.
If the release is missing or verification fails, /health says model_loaded=false
and /v1/analyze returns 503; no synthetic inference or demo response is invented.
The existing Supabase JWT + HMAC validation remains mandatory.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from urllib.request import urlopen

log = logging.getLogger("roadshield.vercel")
root = Path(__file__).resolve().parents[1]
model = Path("/tmp/roadshield-vercel/roadshield-rdd.onnx")
os.environ.setdefault("AI_MODEL_PATH", str(model))
os.environ.setdefault("AI_MODEL_CARD_PATH", str(root / "models" / "model_card.json"))
os.environ.setdefault("AI_LABELS_PATH", str(root / "labels.json"))

def _ensure_model() -> None:
    if model.is_file() and model.stat().st_size > 1024:
        return
    card = json.loads((root / "models" / "model_card.json").read_text())
    expected = card.get("onnx_sha256", "").lower()
    if len(expected) != 64:
        log.warning("Model card SHA-256 missing; refusing unverified download")
        return
    model.parent.mkdir(parents=True, exist_ok=True)
    target = model.with_suffix(".part")
    url = ("https://github.com/Alaa2134/roadshield-ai/"
           "releases/download/ai-models/roadshield-rdd.onnx")
    digest = hashlib.sha256()
    total = 0
    try:
        with urlopen(url, timeout=40) as response, target.open("wb") as out:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 200 * 1024 * 1024:
                    raise ValueError("Published model exceeds 200 MiB download cap")
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest().lower() != expected:
            raise ValueError("Published model SHA-256 does not match repository model card")
        target.replace(model)
        log.info("Verified ONNX model loaded from published release")
    except (OSError, ValueError, TimeoutError) as exc:
        log.warning("AI model not available: %s", type(exc).__name__)
        target.unlink(missing_ok=True)

_ensure_model()
from app.main import app  # noqa: E402
