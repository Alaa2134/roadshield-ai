import numpy as np
import pytest

from app.config import SERVICE_ROOT
from app.detector import Detector, Letterbox, ModelUnavailable, decode_yolov8, letterbox, nms

from .conftest import CLASS_NAMES, yolo_tensor

LABELS = SERVICE_ROOT / "labels.json"


def test_letterbox_keeps_aspect_and_centres():
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    out, lb = letterbox(img, 640)
    assert out.shape == (640, 640, 3)
    assert lb.scale == pytest.approx(1.0)
    assert lb.pad_x == 0 and lb.pad_y == 80
    assert out[0, 0, 0] == 114  # padding colour


def test_decode_undoes_letterbox_and_normalises():
    # A 1280x960 photo is scaled by 0.5 and padded 80 px top/bottom into 640x640.
    lb = Letterbox(scale=0.5, pad_x=0, pad_y=80)
    t = yolo_tensor([(320, 320, 64, 48, 0, 0.8)], num_classes=4)
    [(cls, conf, box)] = decode_yolov8(t, lb, 1280, 960, 0.25, 0.45, 10)
    assert cls == 0 and conf == pytest.approx(0.8)
    # centre (320, 320-80=240)/0.5 = (640, 480) -> normalised (0.5, 0.5); size 128x96 px
    assert box == pytest.approx((0.45, 0.45, 0.55, 0.55), abs=1e-6)


def test_threshold_and_empty_outputs():
    lb = Letterbox(1.0, 0, 0)
    t = yolo_tensor([(100, 100, 20, 20, 1, 0.2)], num_classes=4)
    assert decode_yolov8(t, lb, 640, 640, 0.25, 0.45, 10) == []
    with pytest.raises(ValueError):
        decode_yolov8(np.zeros((8, 10)), lb, 640, 640, 0.25, 0.45, 10)


def test_transposed_output_is_accepted():
    lb = Letterbox(1.0, 0, 0)
    t = yolo_tensor([(100, 100, 20, 20, 2, 0.9)], num_classes=4)
    assert len(decode_yolov8(np.transpose(t, (0, 2, 1)), lb, 640, 640, 0.25, 0.45, 10)) == 1


def test_nms_is_class_aware():
    boxes = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [0, 0, 10, 10]], dtype=np.float32)
    scores = np.array([0.9, 0.8, 0.7], dtype=np.float32)
    classes = np.array([0, 0, 1])
    assert nms(boxes, scores, classes, 0.45, 10) == [0, 2]


def test_missing_model_is_reported_not_faked(tmp_path):
    with pytest.raises(ModelUnavailable):
        Detector.load(tmp_path / "nope.onnx", tmp_path / "card.json", LABELS)


def test_fixture_model_pipeline_maps_categories(fixture_model):
    det = Detector.load(fixture_model, fixture_model.parent / "model_card.json", LABELS)
    assert det.class_names == CLASS_NAMES
    assert det.name == "test-fixture" and det.version == "fixture-1"
    rgb = np.zeros((640, 640, 3), dtype=np.uint8)
    results, ms = det.detect(rgb, 0.25, 0.45, 50)
    assert ms >= 0
    got = sorted((d.category, d.label, round(d.confidence, 2)) for d in results)
    # Overlapping pothole suppressed, unknown "Manhole" ignored, 0.10 crack below threshold.
    assert got == [("crack", "Transverse Crack", 0.72), ("pothole", "Potholes", 0.91), ("surface_damage", "Alligator Crack", 0.3)]
    for d in results:
        x1, y1, x2, y2 = d.box
        assert 0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1
