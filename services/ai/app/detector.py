"""YOLOv8 road-damage detector running on ONNX Runtime (CPU).

The service never invents a result: if no model file is present, `Detector.load` raises
`ModelUnavailable` and the API answers 503 so the app shows
"AI analysis unavailable — continue manually."
"""

from __future__ import annotations

import ast
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

AppCategory = str  # 'pothole' | 'crack' | 'surface_damage'


class ModelUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class Detection:
    category: AppCategory
    label: str
    confidence: float
    box: tuple[float, float, float, float]  # normalised x1, y1, x2, y2

    def as_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "label": self.label,
            "confidence": round(float(self.confidence), 4),
            "box": [round(float(v), 4) for v in self.box],
        }


@dataclass(frozen=True)
class Letterbox:
    scale: float
    pad_x: float
    pad_y: float


def letterbox(image: np.ndarray, size: int) -> tuple[np.ndarray, Letterbox]:
    """Resize keeping aspect ratio and pad to `size`x`size` with grey (114), like Ultralytics."""
    import cv2

    h, w = image.shape[:2]
    scale = min(size / h, size / w)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR) if (nw, nh) != (w, h) else image
    pad_x, pad_y = (size - nw) / 2, (size - nh) / 2
    top, bottom = int(round(pad_y - 0.1)), int(round(pad_y + 0.1))
    left, right = int(round(pad_x - 0.1)), int(round(pad_x + 0.1))
    out = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return out, Letterbox(scale=scale, pad_x=left, pad_y=top)


def iou(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = (box[2] - box[0]) * (box[3] - box[1])
    area_b = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    return inter / np.maximum(area_a + area_b - inter, 1e-9)


def nms(boxes: np.ndarray, scores: np.ndarray, classes: np.ndarray, iou_thr: float, max_det: int) -> list[int]:
    """Class-aware greedy non-maximum suppression. Returns kept indices, best first."""
    keep: list[int] = []
    order = np.argsort(-scores)
    while order.size and len(keep) < max_det:
        i = int(order[0])
        keep.append(i)
        rest = order[1:]
        if not rest.size:
            break
        same = classes[rest] == classes[i]
        overlap = iou(boxes[i], boxes[rest]) > iou_thr
        order = rest[~(same & overlap)]
    return keep


def decode_yolov8(
    output: np.ndarray,
    lb: Letterbox,
    orig_w: int,
    orig_h: int,
    conf_thr: float,
    iou_thr: float,
    max_det: int,
) -> list[tuple[int, float, tuple[float, float, float, float]]]:
    """Decode a raw YOLOv8 head output of shape (1, 4 + num_classes, anchors).

    Returns (class_index, confidence, normalised_box) tuples after NMS, best first.
    """
    pred = np.asarray(output)
    if pred.ndim != 3 or pred.shape[0] != 1:
        raise ValueError(f"unexpected model output shape {pred.shape}")
    pred = pred[0]
    if pred.shape[0] > pred.shape[1]:  # some exporters emit (anchors, 4 + nc)
        pred = pred.T
    boxes_cxcywh, cls_scores = pred[:4].T, pred[4:].T
    if cls_scores.shape[1] == 0:
        return []
    cls_idx = cls_scores.argmax(axis=1)
    conf = cls_scores[np.arange(cls_scores.shape[0]), cls_idx]
    mask = conf >= conf_thr
    if not mask.any():
        return []
    boxes_cxcywh, cls_idx, conf = boxes_cxcywh[mask], cls_idx[mask], conf[mask]

    xyxy = np.empty_like(boxes_cxcywh)
    xyxy[:, 0] = boxes_cxcywh[:, 0] - boxes_cxcywh[:, 2] / 2
    xyxy[:, 1] = boxes_cxcywh[:, 1] - boxes_cxcywh[:, 3] / 2
    xyxy[:, 2] = boxes_cxcywh[:, 0] + boxes_cxcywh[:, 2] / 2
    xyxy[:, 3] = boxes_cxcywh[:, 1] + boxes_cxcywh[:, 3] / 2
    # Undo the letterbox, then clip to the original image.
    xyxy[:, [0, 2]] = (xyxy[:, [0, 2]] - lb.pad_x) / lb.scale
    xyxy[:, [1, 3]] = (xyxy[:, [1, 3]] - lb.pad_y) / lb.scale
    xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, orig_w)
    xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, orig_h)

    keep = nms(xyxy, conf, cls_idx, iou_thr, max_det)
    results = []
    for i in keep:
        x1, y1, x2, y2 = xyxy[i]
        if x2 - x1 < 1 or y2 - y1 < 1:
            continue
        box = (float(x1) / orig_w, float(y1) / orig_h, float(x2) / orig_w, float(y2) / orig_h)
        results.append((int(cls_idx[i]), float(conf[i]), box))
    return results


def load_label_map(path: Path) -> dict[str, AppCategory]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k.strip().lower(): v for k, v in data["categories"].items()}


def _names_from_metadata(meta: dict[str, str]) -> list[str] | None:
    raw = meta.get("names")
    if not raw:
        return None
    try:
        parsed = ast.literal_eval(raw)  # Ultralytics stores "{0: 'name', ...}"
    except (ValueError, SyntaxError):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if isinstance(parsed, dict):
        return [str(parsed[k]) for k in sorted(parsed, key=lambda x: int(x))]
    if isinstance(parsed, list):
        return [str(x) for x in parsed]
    return None


class Detector:
    def __init__(self, session: Any, class_names: list[str], label_map: dict[str, AppCategory], card: dict[str, Any]):
        self.session = session
        self.class_names = class_names
        self.label_map = label_map
        self.card = card
        inp = session.get_inputs()[0]
        shape = inp.shape
        self.input_name = inp.name
        self.input_size = int(shape[2]) if isinstance(shape[2], int) else int(card.get("imgsz", 640))

    @property
    def name(self) -> str:
        return str(self.card.get("name", "roadshield-rdd"))

    @property
    def version(self) -> str:
        return str(self.card.get("version", "unknown"))

    @classmethod
    def load(cls, model_path: Path, card_path: Path, labels_path: Path, threads: int = 2) -> "Detector":
        if not model_path.is_file():
            raise ModelUnavailable(f"model file not found: {model_path}")
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 1
        session = ort.InferenceSession(str(model_path), sess_options=opts, providers=["CPUExecutionProvider"])
        card: dict[str, Any] = json.loads(card_path.read_text(encoding="utf-8")) if card_path.is_file() else {}
        meta = session.get_modelmeta().custom_metadata_map or {}
        names = card.get("class_names") or _names_from_metadata(meta)
        if not names:
            raise ModelUnavailable("model has no class names (expected Ultralytics metadata or model_card.json)")
        card.setdefault("version", meta.get("version", "unknown"))
        return cls(session, list(names), load_label_map(labels_path), card)

    def detect(self, rgb: np.ndarray, conf_thr: float, iou_thr: float, max_det: int) -> tuple[list[Detection], int]:
        h, w = rgb.shape[:2]
        started = time.perf_counter()
        img, lb = letterbox(rgb, self.input_size)
        tensor = (img.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        output = self.session.run(None, {self.input_name: tensor})[0]
        raw = decode_yolov8(output, lb, w, h, conf_thr, iou_thr, max_det)
        elapsed_ms = int(round((time.perf_counter() - started) * 1000))
        detections: list[Detection] = []
        for cls_i, conf, box in raw:
            label = self.class_names[cls_i] if cls_i < len(self.class_names) else f"class_{cls_i}"
            category = self.label_map.get(label.strip().lower())
            if category is None:
                continue  # unknown class: never guess a category
            detections.append(Detection(category=category, label=label, confidence=conf, box=box))
        return detections, elapsed_ms
