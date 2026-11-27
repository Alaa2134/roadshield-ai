# Model cards

## 1. RoadShield Vision detector in production — `roadshield-rdd-yolov8s`

| | |
|---|---|
| Version | `YOLOv8_Small_RDD@7f2ceb8f6f3d` (weights SHA-256 `7f2ceb8f…0a62b`; served ONNX from the `ai-models` release, SHA-256 `9eb29882…8ae7`) |
| Provenance | **Third-party pretrained.** Trained on the RDD2022 Japan + India subsets by [oracl4/RoadDamageDetection](https://github.com/oracl4/RoadDamageDetection). Not trained or fine-tuned by RoadShield |
| Architecture | YOLOv8s (Ultralytics), exported to ONNX opset 12, served with ONNX Runtime on CPU |
| Licence | AGPL-3.0 (Ultralytics weights). `services/ai` is therefore AGPL-3.0. Proprietary closed-source deployment of these weights needs an Ultralytics Enterprise licence or a replacement model (see §2) |
| Classes | Longitudinal crack (D00), transverse crack (D10), alligator crack (D20), pothole (D40) |
| Intended use | Suggest a damage class and boxes on a citizen or inspector photo, **for human review** |
| Not for | Engineering severity, dimensions, structural assessment, automated work orders or payments |
| Measured by RoadShield | Domain-shift sanity run on 112 close-up crack photos (Ultralytics crack-seg test split): 37.5 % of images had ≥1 detection at conf ≥ 0.25; median top confidence 0.41; CPU latency median 153 ms, p95 185 ms. See `docs/test-results/ai-service-results.md` |
| Not measured | mAP / precision / recall on RDD2022 test data or on Egyptian roads. **No accuracy claim is made** |
| Known failure modes | Dark wide cracks labelled as potholes on close-ups; trained on dash-camera viewpoints from Japan and India, so road surfaces, markings and lighting in Egypt may differ |
| Safeguards | Results below 50 % confidence are flagged; the user confirms or corrects the category; staff verify before a report is public; results are HMAC-signed |

## 2. Licence-compatible replacement — `rs-frcnn-mbv3` (pipeline ready, not trained yet)

| | |
|---|---|
| Architecture | torchvision Faster R-CNN MobileNetV3-Large-FPN, 4 classes + background |
| Licence | BSD-3-Clause (torchvision code). COCO-pretrained backbone weights from torchvision. Fine-tuned weights can ship in a proprietary product. RDD2022 is CC BY-SA 4.0: attribution is required, and ShareAlike applies to redistributed *dataset* adaptations |
| Training data | RDD2022 (official Figshare record), per-country 80/10/10 split with near-duplicate grouping (`ml/datasets/prepare_rdd2022.py`) |
| Evaluation | COCO AP@0.5 and AP@0.5:0.95 (101-point), precision/recall/F1 at conf 0.25, confusion matrix, per-country mAP, CPU/GPU latency (`ml/detector/metrics.py`) |
| Status | **Not trained.** RDD2022 and COCO weights are not downloadable from the build sandbox, and there is no GPU. The pipeline ran end to end on a synthetic smoke fixture (see `TRAINING_REPORT.md`). Run `ml/detector/RoadShield_RDD2022_training.ipynb` on a GPU |
| Deployment rule | Registered as `candidate` with its metrics and their source. A platform admin approves deployment in the AI Model Center. The database refuses deployment without recorded metrics |

## 3. Cost model — `rs-cost-comparables-v1` (in production, statistical)

An explainable comparables estimator in SQL (see `FINANCIAL_MODEL.md` §5). It produces no output
with fewer than 5 verified comparable projects of the same organisation and currency. There is no
training step and no learned parameters.

## 4. Cost model — ML candidates (pipeline ready, not trained)

`services/cost-intelligence/train_cost_model.py` (ridge, random forest, gradient boosting vs. a
median baseline; chronological hold-out). **Status:** not trained. It needs ≥ 30 verified completed
projects in one currency, and none exist yet.
