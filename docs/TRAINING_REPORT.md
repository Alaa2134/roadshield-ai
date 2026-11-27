# Training report

**Bottom line: no RoadShield-trained detector or cost model exists yet.** The training
pipelines are implemented, tested and executed end to end as a *smoke test*. A real training run
needs the RDD2022 download and a GPU, which this build environment does not have (see "Blockers").
The detector in production is third-party pretrained (`MODEL_CARD.md` §1).

## 1. Environment used (27 Nov 2026)

| | |
|---|---|
| Hardware | 4 vCPU x86_64, 15 GB RAM, **no GPU** |
| Software | Python 3.13, torch 2.15.0, torchvision 0.29.2, scikit-learn 1.9.1, onnxruntime (from `services/ai/requirements-dev.txt`) |
| Network | figshare.com, download.pytorch.org, huggingface.co: not reachable. PyPI reachable |

## 2. Detector pipeline smoke test (executed)

Purpose: prove that download → prepare → train → evaluate → export → ONNX Runtime inference
works mechanically. **Data: a synthetic fixture** (`ml/detector/make_smoke_fixture.py`: 48
procedurally drawn 320×240 "asphalt" images with ellipse/line "defects", two pseudo-countries).
Its metrics say nothing about real-world accuracy and must not be quoted as model performance.

```
python ml/detector/make_smoke_fixture.py --out $S/RDD2022 --n 48
python ml/datasets/prepare_rdd2022.py --raw $S/RDD2022 --out $S/prepared
python ml/detector/train_detector.py --data $S/prepared --raw $S/RDD2022 --out $S/run2 \
       --epochs 3 --batch 4 --no-pretrained --max-images 40 --onnx
```

| Step | Result |
|---|---|
| Prepare | dataset version `7c2c61f9644c0a48`; train 36 / val 6 / test 6 images; 0 labels dropped |
| Train (CPU, from scratch, no COCO weights) | loss 1.609 → 0.863 → 0.781 over 3 epochs (~57 s/epoch) |
| Test evaluation | mAP50 = 0.0, mAP50-95 = 0.0 (expected: randomly initialised backbone, 36 images, 3 epochs) |
| Latency (CPU, this model) | median 401.5 ms, p95 428.1 ms per image |
| Export | ONNX opset 17 (TorchScript exporter); loads in ONNX Runtime with outputs `boxes`, `labels`, `scores` |

Evidence: `docs/test-results/detector-smoke-test-{metrics,history,manifest}.json`.

The first attempt failed at ONNX export: the new `torch.export` path cannot trace torchvision's
data-dependent NMS. The script now uses the TorchScript exporter (`dynamo=False`), which succeeded.

Unit tests: `ml/tests` (9 passed): IoU, 101-point AP, P/R/F1 thresholds, confusion matrix,
VOC parsing and class mapping, near-duplicate grouping that never spans splits, and the CLI end to end.

## 3. Real training run (to do on a GPU)

Use `ml/detector/RoadShield_RDD2022_training.ipynb` (Colab T4) or any CUDA machine:

1. `download_rdd2022.py` re-reads the licence from Figshare and verifies MD5s.
2. `prepare_rdd2022.py`: per-country 80/10/10 split, near-duplicate grouping, versioned manifest.
3. `train_detector.py --pretrained --epochs 24 --batch 8 --onnx`: checkpoints the best validation
   mAP50, then evaluates once on the held-out test split.
4. Record `metrics.json` here (overall, per class, per country, confusion matrix, latency, dataset
   version) and register the model as a candidate. Deployment needs platform-admin approval.

Expected cost: the full RDD2022 is ~47k images. A T4 typically needs several hours for 24 epochs
of a MobileNetV3 Faster R-CNN at default resolution. Restricting `--match`/countries reduces this.

## 4. Cost model

`services/cost-intelligence/train_cost_model.py` was **not run on real data**. There are no verified
completed projects yet, and the trainer refuses fewer than 30. Pipeline tests (3 passed) use a
synthetic fixture with a known unit-cost structure. They check refusal on insufficient data, refusal
of mixed currencies, chronological ordering (training period ends before the test period), and that
the learner beats the median baseline on that fixture.

## 5. Blockers

| Blocker | Effect | Resolution |
|---|---|---|
| figshare.com unreachable from the build sandbox | RDD2022 not downloaded | Run the notebook on Colab or a machine with internet |
| download.pytorch.org unreachable | No COCO-pretrained weights for the smoke test | Same; `--pretrained` downloads them automatically |
| No GPU | Full training impractical | Colab T4 / cloud GPU |
| No verified completed projects | Cost ML cannot be trained honestly | Comes with pilot operations; the comparables estimator says "insufficient data" until then |
