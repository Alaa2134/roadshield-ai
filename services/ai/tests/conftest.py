"""Shared fixtures.

`fixture_model` builds a tiny ONNX graph that ignores its input and always emits the same
YOLOv8-shaped tensor. It exists ONLY to exercise the loading/decoding/signing pipeline in
tests; it is written to a temp directory and is never used by the running service.
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path

import numpy as np
import pytest

SERVICE = Path(__file__).resolve().parent.parent
CLASS_NAMES = ["Longitudinal Crack", "Transverse Crack", "Alligator Crack", "Potholes", "Manhole"]


def yolo_tensor(rows: list[tuple[float, float, float, float, int, float]], num_classes: int, anchors: int = 64) -> np.ndarray:
    """rows: (cx, cy, w, h, class_index, score) in 640x640 letterboxed pixels."""
    out = np.zeros((1, 4 + num_classes, anchors), dtype=np.float32)
    for i, (cx, cy, w, h, c, s) in enumerate(rows):
        out[0, 0:4, i] = (cx, cy, w, h)
        out[0, 4 + c, i] = s
    return out


@pytest.fixture
def fixture_model(tmp_path: Path) -> Path:
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    # Five synthetic boxes on a 640x640 input:
    #  - pothole 0.91 and an overlapping pothole 0.60 (NMS must drop the second)
    #  - transverse crack 0.72, alligator crack 0.30
    #  - "Manhole" 0.95, a class the label map does not know -> must be ignored, not guessed
    #  - a 0.10 crack below threshold
    tensor = yolo_tensor(
        [
            (320, 320, 100, 80, 3, 0.91),
            (325, 322, 100, 80, 3, 0.60),
            (120, 500, 200, 40, 1, 0.72),
            (520, 140, 120, 120, 2, 0.30),
            (60, 60, 40, 40, 4, 0.95),
            (400, 600, 50, 20, 0, 0.10),
        ],
        num_classes=len(CLASS_NAMES),
    )
    images = helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 640, 640])
    output = helper.make_tensor_value_info("output0", TensorProto.FLOAT, list(tensor.shape))
    const = helper.make_node("Constant", [], ["output0"], value=numpy_helper.from_array(tensor, "c"))
    graph = helper.make_graph([const], "fixture", [images], [output])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    names = {i: n for i, n in enumerate(CLASS_NAMES)}
    for key, value in (("names", str(names)), ("imgsz", "[640, 640]")):
        model.metadata_props.add(key=key, value=value)
    onnx.checker.check_model(model)
    path = tmp_path / "fixture.onnx"
    onnx.save(model, path)
    (tmp_path / "model_card.json").write_text(json.dumps({"name": "test-fixture", "version": "fixture-1"}))
    return path


def jpeg_bytes(w: int = 800, h: int = 600, exif_gps: bool = False) -> bytes:
    from PIL import Image

    rng = np.random.default_rng(0)
    arr = (rng.random((h, w, 3)) * 255).astype(np.uint8)
    im = Image.fromarray(arr)
    buf = io.BytesIO()
    if exif_gps:
        exif = Image.Exif()
        exif[0x0110] = "SecretPhone 12"  # Model
        exif[0x8825] = {1: "N", 2: (31.0, 25.0, 0.0)}  # GPS IFD
        im.save(buf, format="JPEG", exif=exif)
    else:
        im.save(buf, format="JPEG")
    return buf.getvalue()


class Keys:
    """An ES256 key pair + JWKS mimicking a Supabase project with asymmetric JWT keys."""

    def __init__(self, base_url: str):
        import jwt
        from cryptography.hazmat.primitives.asymmetric import ec

        self.base_url = base_url
        self.private = ec.generate_private_key(ec.SECP256R1())
        jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(self.private.public_key()))
        jwk.update({"kid": "test-kid", "alg": "ES256", "use": "sig"})
        self.jwks = {"keys": [jwk]}

    def token(self, sub: str = "11111111-2222-3333-4444-555555555555", **overrides: object) -> str:
        import jwt

        now = int(time.time())
        claims = {
            "sub": sub,
            "aud": "authenticated",
            "role": "authenticated",
            "iss": f"{self.base_url}/auth/v1",
            "iat": now,
            "exp": now + 3600,
        }
        claims.update(overrides)
        return jwt.encode(claims, self.private, algorithm="ES256", headers={"kid": "test-kid"})
