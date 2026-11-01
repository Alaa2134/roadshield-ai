"""Image decoding, metadata removal and privacy redaction.

Decoding applies the EXIF orientation and then drops all metadata: the JPEG the service
returns is re-encoded from raw pixels, so GPS tags, device model and timestamps never survive.

Faces: OpenCV's ResNet-10 SSD face detector (models/face_ssd, fetched by
scripts/fetch_models.sh) run on the whole photo and on overlapping tiles so small faces in large
photos are found; if those files are absent, OpenCV's bundled frontal-face Haar cascade is used.
Licence plates: OpenCV's bundled plate cascade. No detector is perfect — angled, tiny or
occluded faces and plates can be missed — so the database also keeps a staff
"privacy approved" flag that must be set before any photo becomes visible to other users.
"""

from __future__ import annotations

import base64
import hashlib
import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "MPO"}
FACE_MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "face_ssd"
FACE_CONFIDENCE = 0.6
MAX_PIXELS = 40_000_000


class BadImage(ValueError):
    pass


@dataclass
class DecodedImage:
    rgb: np.ndarray
    width: int
    height: int


def decode_image(data: bytes) -> DecodedImage:
    if not data:
        raise BadImage("empty upload")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.format not in ALLOWED_FORMATS:
                raise BadImage(f"unsupported image format: {im.format}")
            im = ImageOps.exif_transpose(im)  # honour orientation before metadata is dropped
            rgb = np.asarray(im.convert("RGB"), dtype=np.uint8).copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise BadImage(f"could not decode image: {exc}") from exc
    h, w = rgb.shape[:2]
    if w < 32 or h < 32:
        raise BadImage("image too small")
    return DecodedImage(rgb=rgb, width=w, height=h)


def encode_jpeg(rgb: np.ndarray, quality: int = 85) -> bytes:
    """Re-encode from raw pixels. No EXIF/XMP/ICC metadata is written."""
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


@lru_cache
def _cascades() -> dict[str, object]:
    import cv2

    root = cv2.data.haarcascades
    out: dict[str, object] = {}
    for key, fname in (("face", "haarcascade_frontalface_default.xml"), ("plate", "haarcascade_russian_plate_number.xml")):
        clf = cv2.CascadeClassifier(root + fname)
        if not clf.empty():
            out[key] = clf
    return out


def _detect(kind: str, gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    clf = _cascades().get(kind)
    if clf is None:
        return []
    h, w = gray.shape[:2]
    min_side = max(20, int(min(h, w) * (0.03 if kind == "face" else 0.02)))
    if kind == "face":
        found = clf.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=8, minSize=(min_side, min_side))
    else:
        found = clf.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(min_side * 2, min_side))
    return [tuple(int(v) for v in r) for r in (found if len(found) else [])]


@lru_cache
def _face_net() -> object | None:
    import cv2

    proto, weights = FACE_MODEL_DIR / "deploy.prototxt", FACE_MODEL_DIR / "res10_300x300_ssd_iter_140000.caffemodel"
    # OpenCV 5 removed the Caffe importer; fall back to the Haar cascade instead of failing.
    if not (proto.is_file() and weights.is_file()) or not hasattr(cv2.dnn, "readNetFromCaffe"):
        return None
    try:
        return cv2.dnn.readNetFromCaffe(str(proto), str(weights))
    except cv2.error:
        return None


def face_detector_name() -> str:
    return "opencv-res10-ssd" if _face_net() is not None else "opencv-haar-frontal"


def _dnn_faces(rgb: np.ndarray) -> list[tuple[int, int, int, int]]:
    """ResNet-10 SSD on the full frame plus a 2x2 grid of overlapping tiles, merged with NMS."""
    import cv2

    net = _face_net()
    h, w = rgb.shape[:2]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    regions = [(0, 0, w, h)]
    if max(h, w) > 700:
        tw, th = int(w * 0.6), int(h * 0.6)
        regions += [(x, y, tw, th) for x in (0, w - tw) for y in (0, h - th)]
    boxes: list[list[int]] = []
    scores: list[float] = []
    for rx, ry, rw, rh in regions:
        crop = bgr[ry : ry + rh, rx : rx + rw]
        blob = cv2.dnn.blobFromImage(cv2.resize(crop, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
        net.setInput(blob)
        out = net.forward()
        for i in range(out.shape[2]):
            conf = float(out[0, 0, i, 2])
            if conf < FACE_CONFIDENCE:
                continue
            x1, y1, x2, y2 = (out[0, 0, i, 3:7] * np.array([rw, rh, rw, rh])).tolist()
            x1, y1 = max(0, int(x1) + rx), max(0, int(y1) + ry)
            x2, y2 = min(w, int(x2) + rx), min(h, int(y2) + ry)
            bw, bh = x2 - x1, y2 - y1
            # Reject slivers and boxes that cover most of the frame (texture false positives).
            if bw < 8 or bh < 8 or not (0.5 <= bw / bh <= 2.0) or bw * bh > 0.5 * w * h:
                continue
            boxes.append([x1, y1, bw, bh])
            scores.append(conf)
    if not boxes:
        return []
    keep = cv2.dnn.NMSBoxes(boxes, scores, FACE_CONFIDENCE, 0.3)
    return [tuple(boxes[int(i)]) for i in np.array(keep).flatten()]


def _pixelate(rgb: np.ndarray, x: int, y: int, w: int, h: int) -> None:
    import cv2

    pad = int(0.15 * max(w, h))
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(rgb.shape[1], x + w + pad), min(rgb.shape[0], y + h + pad)
    roi = rgb[y0:y1, x0:x1]
    if roi.size == 0:
        return
    blocks = max(4, min(roi.shape[:2]) // 12)
    small = cv2.resize(roi, (max(1, roi.shape[1] // blocks), max(1, roi.shape[0] // blocks)), interpolation=cv2.INTER_LINEAR)
    rgb[y0:y1, x0:x1] = cv2.GaussianBlur(cv2.resize(small, (roi.shape[1], roi.shape[0]), interpolation=cv2.INTER_NEAREST), (0, 0), 3)


@dataclass
class PrivacyResult:
    rgb: np.ndarray
    faces: int
    plates: int

    @property
    def applied(self) -> bool:
        return (self.faces + self.plates) > 0


def redact(rgb: np.ndarray, faces: bool = True, plates: bool = True) -> PrivacyResult:
    import cv2

    out = rgb.copy()
    # Run detection on a bounded-size copy for speed, then map regions back.
    h, w = rgb.shape[:2]
    scale = min(1.0, 1280 / max(h, w))
    small = cv2.resize(rgb, (int(w * scale), int(h * scale))) if scale < 1 else rgb
    gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_RGB2GRAY))
    counts = {"face": 0, "plate": 0}
    regions: list[tuple[str, tuple[int, int, int, int]]] = []
    if faces:
        found = _dnn_faces(small) if _face_net() is not None else _detect("face", gray)
        regions += [("face", r) for r in found]
    if plates:
        regions += [("plate", r) for r in _detect("plate", gray)]
    for kind, (x, y, bw, bh) in regions:
        _pixelate(out, int(x / scale), int(y / scale), int(bw / scale), int(bh / scale))
        counts[kind] += 1
    return PrivacyResult(rgb=out, faces=counts["face"], plates=counts["plate"])
