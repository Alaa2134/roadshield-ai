# AI service — verification results (2026-10-31)

## 1. Automated tests — `services/ai/tests` (pytest)

**33 passed.** Covers: HMAC signature identical to Postgres `extensions.hmac()` (reference value computed
in the live database), canonical payload JSON, ES256 JWT verification against a JWKS (wrong audience,
issuer, expiry, role and signing key all rejected; legacy HS256 tokens confirmed with `/auth/v1/user`),
rate limiting, YOLOv8 output decoding (letterbox inversion, class-aware NMS, thresholds, transposed
outputs), category mapping that ignores unknown classes instead of guessing, EXIF/GPS removal and
orientation, bad/oversized uploads, 401/413/429/503 behaviour, and the full signed round trip.

## 2. Real trained model

| Item | Value |
|---|---|
| Model | `roadshield-rdd-yolov8s`, version `YOLOv8_Small_RDD@7f2ceb8f6f3d` |
| Architecture | YOLOv8s (Ultralytics), exported to ONNX (opset 12, 42.7 MB), served with ONNX Runtime on CPU |
| Training data | RDD2022 / CRDDC2022, Japan + India subsets (by the weights' authors) |
| Classes → app categories | Longitudinal Crack, Transverse Crack → `crack` · Alligator Crack → `surface_damage` · Potholes → `pothole` |
| Source / licence | github.com/oracl4/RoadDamageDetection · AGPL-3.0 (Ultralytics YOLOv8 weights) |
| Weights SHA-256 | `7f2ceb8f6f3dfcc8fffd98cb488281be725150aed0f06cf21c4db72b5cd0a62b` |

### Sanity run on 112 held-out real crack photos (Ultralytics *crack-seg* test split)

These images were never used to train this model. They are mostly **close-up** concrete and asphalt
cracks, whereas the model was trained on **dash-camera road views**, so this is a domain-shift check,
not an accuracy benchmark.

| Metric | Result |
|---|---|
| Images with ≥1 detection (conf ≥ 0.25) | 42 / 112 (37.5 %) |
| Detections by category | crack 29 · surface_damage 13 · pothole 29 |
| Median top confidence | 0.41 |
| Inference latency (CPU, 2 threads) | median 153 ms · p95 185 ms |

Observations: crack and alligator-crack boxes are well placed; on close-ups the model sometimes
labels a dark, wide crack as "Potholes" (all images here are cracks). This is exactly why the app
always lets the user review and correct the category, flags results below 50 % confidence, and
records `user_accepted_category`. **Before production, fine-tune on local (Egyptian) dash-camera
photos** with `scripts/train_rdd2022.py` and report mAP on a labelled split with `yolo val`.

Sample outputs: `ai-real-model-detections.jpg` · per-image results: `ai-crack-seg-eval.json`.

### Privacy redaction

| Detector | False positives on 112 crack photos | Faces found on 2 sample street/people photos |
|---|---|---|
| Haar frontal cascade (minNeighbors 6) | 2 | missed a three-quarter profile face |
| Haar frontal cascade (minNeighbors 8) | 0 | missed the same profile face |
| **ResNet-10 SSD (now default)**, full frame + tiles | **0** | **all visible faces** (incl. the profile) |

Licence plates use OpenCV's plate cascade and over-redact on signage text (privacy-safe). Because no
detector is perfect, photos also need staff "privacy approval" before other users can see them.

## 3. End-to-end: real model → signed result → live database

1. A real crack photo was analysed by the service with the real model (`Alligator Crack`, 0.78,
   219 ms), for a caller whose ES256 token carried user id `7a0e1c52-…`.
2. The exact `payload` + `signature` were passed to `submit_hazard_report` in the live Supabase
   database, as that user, inside a transaction that is rolled back.
3. Result: `ai_verified=true`, report `RS-2610-00014`, `ai_detections` row stored with
   `model_version=YOLOv8_Small_RDD@7f2ceb8f6f3d`, `top_category=surface_damage`,
   `top_confidence=0.7834`, `signature_verified=true`, 1 bounding box.
