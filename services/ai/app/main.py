"""RoadShield AI inference service.

POST /v1/analyze  — signed road-damage detection for a signed-in RoadShield user
GET  /health      — liveness + whether a trained model is loaded

The response's `payload` is a canonical JSON string and `signature` its HMAC-SHA256. The
mobile app forwards both, unchanged, to the `submit_hazard_report` database function, which
re-computes the HMAC with the same secret and only stores the AI result if it matches. A
client therefore cannot fabricate or edit a detection.
"""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Any

import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .detector import Detection, Detector, ModelUnavailable
from .imaging import BadImage, decode_image, encode_jpeg, face_detector_name, redact, sha256_hex, to_b64
from .security import AuthError, Caller, RateLimiter, SupabaseVerifier, canonical_json, sign

log = logging.getLogger("roadshield.ai")


class State:
    detector: Detector | None = None
    load_error: str | None = None
    verifier: SupabaseVerifier | None = None
    limiter: RateLimiter | None = None


state = State()


def init_state(settings: Settings) -> None:
    try:
        state.detector = Detector.load(settings.model_path, settings.model_card_path, settings.labels_path, settings.onnx_threads)
        state.load_error = None
        log.info("model loaded: %s %s classes=%s", state.detector.name, state.detector.version, state.detector.class_names)
    except ModelUnavailable as exc:
        state.detector = None
        state.load_error = str(exc)
        log.warning("AI model unavailable: %s", exc)
    state.verifier = SupabaseVerifier(settings) if settings.supabase_url else None
    state.limiter = RateLimiter(settings.rate_limit_per_minute)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_state(get_settings())
    yield


app = FastAPI(title="RoadShield AI", version="1.0.0", lifespan=lifespan)
_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
if _origins:
    app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"], allow_headers=["Authorization"])


@app.exception_handler(BadImage)
async def _bad_image(_: Request, exc: BadImage) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "bad_image", "message": str(exc)})


def current_caller(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> Caller:
    if not settings.require_auth:
        return Caller(user_id="00000000-0000-0000-0000-000000000000")
    if state.verifier is None:
        raise HTTPException(status_code=503, detail="auth_not_configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    try:
        return state.verifier.verify(authorization.split(" ", 1)[1].strip())
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="invalid_token") from exc


@app.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    d = state.detector
    return {
        "status": "ok",
        "model_loaded": d is not None,
        "model_name": d.name if d else None,
        "model_version": d.version if d else None,
        "classes": d.class_names if d else [],
        "face_detector": face_detector_name(),
        "signing_configured": bool(settings.signing_secret),
        "auth_configured": state.verifier is not None or not settings.require_auth,
        "error": None if d else state.load_error,
    }


def _annotate(rgb: np.ndarray, detections: list[Detection]) -> bytes:
    import cv2

    colors = {"pothole": (240, 68, 82), "crack": (255, 155, 53), "surface_damage": (0, 214, 255)}
    out = rgb.copy()
    h, w = out.shape[:2]
    thick = max(2, int(round(min(h, w) / 300)))
    for det in detections:
        x1, y1, x2, y2 = (int(det.box[0] * w), int(det.box[1] * h), int(det.box[2] * w), int(det.box[3] * h))
        c = colors.get(det.category, (40, 123, 255))
        cv2.rectangle(out, (x1, y1), (x2, y2), c, thick)
        text = f"{det.label} {det.confidence:.0%}"
        scale = max(0.5, min(h, w) / 900)
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, max(1, thick - 1))
        cv2.rectangle(out, (x1, max(0, y1 - th - 8)), (x1 + tw + 8, y1), c, -1)
        cv2.putText(out, text, (x1 + 4, max(th, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, scale, (7, 15, 30), max(1, thick - 1), cv2.LINE_AA)
    return encode_jpeg(out, quality=80)


@app.post("/v1/analyze")
async def analyze(
    settings: Annotated[Settings, Depends(get_settings)],
    caller: Annotated[Caller, Depends(current_caller)],
    image: Annotated[UploadFile, File(description="JPEG/PNG/HEIC photo of the road")],
    annotate: Annotated[bool, Query(description="Also return an annotated JPEG")] = False,
) -> dict[str, Any]:
    if state.limiter and not state.limiter.allow(caller.user_id):
        raise HTTPException(status_code=429, detail="rate_limited")
    if state.detector is None:
        raise HTTPException(status_code=503, detail="model_not_loaded")
    if not settings.signing_secret:
        raise HTTPException(status_code=503, detail="signing_not_configured")

    data = await image.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="image_too_large")
    decoded = decode_image(data)

    try:
        detections, inference_ms = state.detector.detect(
            decoded.rgb, settings.conf_threshold, settings.iou_threshold, settings.max_detections
        )
    except Exception as exc:  # noqa: BLE001 — surface as an honest failure, never a guess
        log.exception("inference failed")
        raise HTTPException(status_code=500, detail="inference_failed") from exc

    detections.sort(key=lambda d: d.confidence, reverse=True)
    top = detections[0] if detections else None
    privacy = redact(decoded.rgb, faces=settings.redact_faces, plates=settings.redact_plates)

    result = {
        "detection_id": str(uuid.uuid4()),
        "requested_by": caller.user_id,
        "model_name": state.detector.name,
        "model_version": state.detector.version,
        "image_sha256": sha256_hex(data),
        "image_width": decoded.width,
        "image_height": decoded.height,
        "top_category": top.category if top else None,
        "top_confidence": round(top.confidence, 4) if top else None,
        "low_confidence": bool(top is None or top.confidence < settings.low_confidence),
        "conf_threshold": settings.conf_threshold,
        "detections": [d.as_dict() for d in detections],
        "inference_ms": inference_ms,
        "analyzed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    payload = canonical_json(result)
    body: dict[str, Any] = {
        "payload": payload,
        "signature": sign(payload, settings.signing_secret),
        "privacy": {"faces": privacy.faces, "plates": privacy.plates, "applied": privacy.applied},
        "redacted_image_b64": to_b64(encode_jpeg(privacy.rgb)) if privacy.applied else None,
    }
    if annotate:
        body["annotated_image_b64"] = to_b64(_annotate(privacy.rgb, detections))
    return body
