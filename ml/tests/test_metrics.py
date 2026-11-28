"""Unit tests for ml/detector/metrics.py with hand-computable synthetic cases."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "detector"))
from metrics import average_precision, evaluate, iou  # noqa: E402

import numpy as np  # noqa: E402

NAMES = ["D00", "D10", "D20", "D40"]


def test_iou():
    assert iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    assert iou([0, 0, 10, 10], [10, 10, 20, 20]) == 0.0
    assert math.isclose(iou([0, 0, 10, 10], [5, 0, 15, 10]), 50 / 150)


def test_perfect_detections_give_map_one():
    gts = [("a", 0, [0, 0, 10, 10]), ("a", 3, [20, 20, 40, 40]), ("b", 2, [5, 5, 50, 50])]
    preds = [(i, c, 0.9, b) for i, c, b in gts]
    r = evaluate(gts, preds, NAMES)
    assert r.map50 == 1.0 and r.map50_95 == 1.0
    assert r.precision_all == 1.0 and r.recall_all == 1.0
    assert r.ap50["D10"] != r.ap50["D10"]  # class without ground truth -> NaN, excluded from mAP


def test_false_positive_and_miss():
    gts = [("a", 0, [0, 0, 10, 10]), ("a", 0, [50, 50, 60, 60])]
    preds = [("a", 0, 0.9, [0, 0, 10, 10]), ("a", 0, 0.8, [100, 100, 110, 110])]
    r = evaluate(gts, preds, NAMES)
    assert r.precision["D00"] == 0.5 and r.recall["D00"] == 0.5
    # one TP then one FP, recall caps at 0.5 -> 101-pt AP = 51/101
    assert math.isclose(r.ap50["D00"], 51 / 101, rel_tol=1e-9)
    cm = np.array(r.confusion)
    assert cm[0, 0] == 1 and cm[0, 4] == 1 and cm[4, 0] == 1


def test_confusion_records_class_swap():
    gts = [("a", 3, [0, 0, 10, 10])]
    preds = [("a", 2, 0.9, [0, 0, 10, 10])]
    cm = np.array(evaluate(gts, preds, NAMES).confusion)
    assert cm[3, 2] == 1


def test_low_confidence_excluded_from_prf_but_not_ap():
    gts = [("a", 1, [0, 0, 10, 10])]
    preds = [("a", 1, 0.1, [0, 0, 10, 10])]
    r = evaluate(gts, preds, NAMES, conf=0.25)
    assert r.ap50["D10"] == 1.0 and r.recall["D10"] == 0.0


def test_ap_empty():
    assert average_precision(np.array([]), 3) == 0.0
