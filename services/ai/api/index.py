"""Vercel FastAPI entrypoint. Download authenticated model release on cold starts.

A released model_card.json declares the exact ONNX SHA256 and class provenance.
Fail closed if release assets disagree, model download fails or inputs exceed limits.
No credentials are embedded in source or passed to external model hosts.
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
cache = Path("/tmp/roadshield-vercel")
model = cache / "roadshield-rdd.onnx"
card_path = cache / "model_card.json"
os.environ.setdefault("AI_MODEL_PATH", str(model))
os.environ.setdefault("AI_MODEL_CARD_PATH", str(card_path if card_path.is_file() else root / "models" / "model_card.json"))
os.environ.setdefault("AI_LABELS_PATH", str(root / "labels.json"))
RELEASE = "https://github.com/Alaa2134/roadshield-ai/releases/download/ai-models"

def download_asset(name: str, destination: Path, max_bytes: int) -> str:
    temp = destination.with_suffix(destination.suffix + ".part")
    digest = hashlib.sha256()
    total = 0
    try:
        with urlopen(f"{RELEASE}/{name}", timeout=40) as response, temp.open("wb") as out:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("Published release asset exceeds safe size cap")
                out.write(chunk)
                digest.update(chunk)
        temp.replace(destination)
        return digest.hexdigest()
    finally:
        temp.unlink(missing_ok=True)

def ensure_model() -> None:
    cache.mkdir(parents=True, exist_ok=True)
    try:
        if card_path.is_file() and model.is_file() and model.stat().st_size > 1024:
            card = json.loads(card_path.read_text(encoding="utf-8"))
            if hashlib.sha256(model.read_bytes()).hexdigest().lower() == card.get("onnx_sha256", "").lower():
                os.environ["AI_MODEL_CARD_PATH"] = str(card_path)
                return
        download_asset("model_card.json", card_path, 128 * 1024)
        card = json.loads(card_path.read_text(encoding="utf-8"))
        sha = card.get("onnx_sha256", "").lower()
        if not isinstance(sha, str) or len(sha) != 64 or not all(c in "0123456789abcdef" for c in sha):
            raise ValueError("Published model card lacks valid ONNX SHA256")
        if card.get("name") != "roadshield-rdd-yolov8s" or len(card.get("class_names", [])) != 4:
            raise ValueError("Unexpected release model identity/classes")
        digest = download_asset("roadshield-rdd.onnx", model, 200 * 1024 * 1024)
        if digest.lower() != sha:
            raise ValueError("Published ONNX SHA-256 does not match its release model card")
        os.environ["AI_MODEL_CARD_PATH"] = str(card_path)
        log.info("RoadShield published ONNX model verified using release card")
    except (OSError, ValueError, TimeoutError, json.JSONDecodeError) as exc:
        model.unlink(missing_ok=True)
        log.warning("RoadShield published ONNX model unavailable: %s", str(exc)[:150])

ensure_model()
from app.main import app  # noqa: E402
