"""Object-detection evaluation for RoadShield (pure Python + NumPy, framework independent).

Implements the COCO-style metrics reported in TRAINING_REPORT.md:
  * AP per class with 101-point interpolated precision (COCO), at IoU 0.50 and 0.50:0.95
  * precision / recall / F1 at a fixed confidence threshold (default 0.25) and IoU 0.50
  * confusion matrix (classes + background) at IoU 0.50
Boxes are [x1, y1, x2, y2] in pixels. Predictions: (image_id, class_id, score, box).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

IOU_THRESHOLDS = np.round(np.arange(0.5, 0.96, 0.05), 2)


def iou(a, b) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def average_precision(tp: np.ndarray, n_gt: int) -> float:
    """COCO 101-point interpolated AP from a score-sorted true-positive vector."""
    if n_gt == 0:
        return float("nan")
    if len(tp) == 0:
        return 0.0
    ctp = np.cumsum(tp)
    cfp = np.cumsum(1 - tp)
    recall = ctp / n_gt
    precision = ctp / np.maximum(ctp + cfp, np.finfo(float).eps)
    # precision envelope (monotonically decreasing)
    for i in range(len(precision) - 2, -1, -1):
        precision[i] = max(precision[i], precision[i + 1])
    points = np.linspace(0, 1, 101)
    idx = np.searchsorted(recall, points, side="left")
    return float(np.mean([precision[i] if i < len(precision) else 0.0 for i in idx]))


def _match(preds, gts_by_img, cls: int, thr: float) -> np.ndarray:
    """Greedy matching by descending score; each GT matches at most one prediction."""
    used: dict[str, set[int]] = defaultdict(set)
    tp = np.zeros(len(preds))
    for k, (img, _c, _s, box) in enumerate(preds):
        best, best_j = thr, -1
        for j, (gc, gbox) in enumerate(gts_by_img.get(img, [])):
            if gc != cls or j in used[img]:
                continue
            o = iou(box, gbox)
            if o >= best:
                best, best_j = o, j
        if best_j >= 0:
            used[img].add(best_j)
            tp[k] = 1
    return tp


@dataclass
class Report:
    class_names: list[str]
    ap50: dict[str, float] = field(default_factory=dict)
    ap50_95: dict[str, float] = field(default_factory=dict)
    precision: dict[str, float] = field(default_factory=dict)
    recall: dict[str, float] = field(default_factory=dict)
    f1: dict[str, float] = field(default_factory=dict)
    support: dict[str, int] = field(default_factory=dict)
    confusion: list[list[int]] = field(default_factory=list)
    map50: float = 0.0
    map50_95: float = 0.0
    precision_all: float = 0.0
    recall_all: float = 0.0
    f1_all: float = 0.0

    def as_dict(self) -> dict:
        r = lambda v: None if v != v else round(float(v), 4)  # NaN -> None
        return {
            "mAP50": r(self.map50), "mAP50-95": r(self.map50_95),
            "precision": r(self.precision_all), "recall": r(self.recall_all), "f1": r(self.f1_all),
            "per_class": {c: {"AP50": r(self.ap50[c]), "AP50-95": r(self.ap50_95[c]), "precision": r(self.precision[c]),
                              "recall": r(self.recall[c]), "f1": r(self.f1[c]), "support": self.support[c]} for c in self.class_names},
            "confusion_matrix": {"labels": self.class_names + ["background"], "rows_are": "ground truth", "matrix": self.confusion},
        }


def evaluate(gts, preds, class_names: list[str], conf: float = 0.25) -> Report:
    """gts: [(image_id, class_id, box)], preds: [(image_id, class_id, score, box)]."""
    gts_by_img: dict[str, list] = defaultdict(list)
    for img, c, box in gts:
        gts_by_img[img].append((c, box))
    rep = Report(class_names)
    aps50, aps = [], []
    tot_tp = tot_fp = tot_gt = 0
    for c, name in enumerate(class_names):
        cp = sorted([p for p in preds if p[1] == c], key=lambda p: -p[2])
        n_gt = sum(1 for g in gts if g[1] == c)
        per_thr = [average_precision(_match(cp, gts_by_img, c, t), n_gt) for t in IOU_THRESHOLDS]
        rep.ap50[name] = per_thr[0]
        rep.ap50_95[name] = float(np.mean(per_thr)) if n_gt else float("nan")
        if n_gt:
            aps50.append(per_thr[0]); aps.append(rep.ap50_95[name])
        confident = [p for p in cp if p[2] >= conf]
        tp = _match(confident, gts_by_img, c, 0.5)
        ntp, nfp = int(tp.sum()), int(len(tp) - tp.sum())
        rep.precision[name] = ntp / (ntp + nfp) if ntp + nfp else float("nan")
        rep.recall[name] = ntp / n_gt if n_gt else float("nan")
        p_, r_ = rep.precision[name], rep.recall[name]
        rep.f1[name] = 2 * p_ * r_ / (p_ + r_) if p_ == p_ and r_ == r_ and p_ + r_ > 0 else float("nan")
        rep.support[name] = n_gt
        tot_tp += ntp; tot_fp += nfp; tot_gt += n_gt
    rep.map50 = float(np.mean(aps50)) if aps50 else float("nan")
    rep.map50_95 = float(np.mean(aps)) if aps else float("nan")
    rep.precision_all = tot_tp / (tot_tp + tot_fp) if tot_tp + tot_fp else float("nan")
    rep.recall_all = tot_tp / tot_gt if tot_gt else float("nan")
    rep.f1_all = (2 * rep.precision_all * rep.recall_all / (rep.precision_all + rep.recall_all)
                  if rep.precision_all + rep.recall_all > 0 else float("nan"))
    rep.confusion = confusion_matrix(gts_by_img, [p for p in preds if p[2] >= conf], len(class_names))
    return rep


def confusion_matrix(gts_by_img, preds, n: int, thr: float = 0.5) -> list[list[int]]:
    """Rows = ground truth (n classes + background), columns = prediction (n classes + background)."""
    m = np.zeros((n + 1, n + 1), dtype=int)
    preds_by_img: dict[str, list] = defaultdict(list)
    for img, c, s, box in preds:
        preds_by_img[img].append((c, s, box))
    for img in set(gts_by_img) | set(preds_by_img):
        gts = gts_by_img.get(img, [])
        ps = sorted(preds_by_img.get(img, []), key=lambda p: -p[1])
        used = set()
        for gc, gbox in gts:
            best, best_k = thr, -1
            for k, (pc, _s, pbox) in enumerate(ps):
                if k in used:
                    continue
                o = iou(gbox, pbox)
                if o >= best:
                    best, best_k = o, k
            if best_k >= 0:
                used.add(best_k)
                m[gc, ps[best_k][0]] += 1
            else:
                m[gc, n] += 1
        for k, (pc, _s, _b) in enumerate(ps):
            if k not in used:
                m[n, pc] += 1
    return m.tolist()
