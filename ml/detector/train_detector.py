"""Train and evaluate the RoadShield road-damage detector (torchvision Faster R-CNN).

Licence-compatible default: torchvision detection models are BSD-3-Clause, so the trained
weights can ship in a proprietary product. (Ultralytics YOLO is AGPL-3.0; see
services/ai/scripts/train_rdd2022.py if you accept those terms.)

  python ml/detector/train_detector.py --data datasets/rdd2022 --raw datasets/raw/rdd2022/RDD2022 \
      --epochs 24 --batch 8 --out runs/rs-frcnn-mbv3 [--pretrained] [--onnx]

Smoke test (CPU, minutes):  ... --epochs 1 --max-images 16 --no-pretrained --out runs/smoke
Outputs in --out: model.pt (best candidate), last.pt (resumable epoch checkpoint),
history.json, metrics.json (test set: P/R/F1, mAP50, mAP50-95, per class,
per country, confusion matrix, latency), and model.onnx with --onnx.
Resume an interrupted training session using the same arguments and --resume; persist the
--out directory across notebook sessions (e.g. Google Drive or a mounted Kaggle dataset).
"""
from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import torch
import torchvision
from PIL import Image
from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.transforms.functional import to_tensor

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import evaluate  # noqa: E402

CLASSES = ["D00", "D10", "D20", "D40"]


class RDD(torch.utils.data.Dataset):
    def __init__(self, items: list[dict], raw: Path, train: bool):
        self.items, self.raw, self.train = items, raw, train

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i: int):
        it = self.items[i]
        img = Image.open(self.raw / it["image"]).convert("RGB")
        boxes = torch.tensor([b["bbox"] for b in it["boxes"]], dtype=torch.float32).reshape(-1, 4)
        labels = torch.tensor([b["cls"] + 1 for b in it["boxes"]], dtype=torch.int64)  # 0 = background
        t = to_tensor(img)
        if self.train and torch.rand(1).item() < 0.5:  # horizontal flip
            t = t.flip(-1)
            if len(boxes):
                w = t.shape[-1]
                boxes = torch.stack([w - boxes[:, 2], boxes[:, 1], w - boxes[:, 0], boxes[:, 3]], 1)
        return t, {"boxes": boxes, "labels": labels}, i


def collate(batch):
    return tuple(zip(*batch))


def build_model(pretrained: bool):
    model = fasterrcnn_mobilenet_v3_large_fpn(weights="DEFAULT" if pretrained else None, weights_backbone=None)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, len(CLASSES) + 1)
    return model


@torch.no_grad()
def predict(model, ds: RDD, device, batch: int):
    model.eval()
    gts, preds, latencies = [], [], []
    loader = torch.utils.data.DataLoader(ds, batch_size=1, collate_fn=collate)
    for imgs, targets, idx in loader:
        t0 = time.perf_counter()
        out = model([im.to(device) for im in imgs])[0]
        if device.type == "cuda":
            torch.cuda.synchronize()
        latencies.append((time.perf_counter() - t0) * 1000)
        img_id = ds.items[idx[0]]["image"]
        for b, l in zip(targets[0]["boxes"].tolist(), targets[0]["labels"].tolist()):
            gts.append((img_id, l - 1, b))
        for b, l, s in zip(out["boxes"].tolist(), out["labels"].tolist(), out["scores"].tolist()):
            preds.append((img_id, l - 1, s, b))
    return gts, preds, latencies


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="output dir of prepare_rdd2022.py")
    ap.add_argument("--raw", required=True, help="RDD2022 root that image paths are relative to")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=24)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=0.01)
    ap.add_argument("--max-images", type=int, default=0, help="limit images per split (smoke tests)")
    ap.add_argument("--pretrained", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--onnx", action="store_true")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--resume", action="store_true", help="resume from --out/last.pt (same configuration and data)")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    data, raw, out = Path(args.data), Path(args.raw), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    load = lambda s: json.loads((data / f"{s}.json").read_text())[: args.max_images or None]
    train_items, val_items, test_items = load("train"), load("val"), load("test")
    manifest = json.loads((data / "MANIFEST.json").read_text()) if (data / "MANIFEST.json").exists() else {}
    print(f"device={device} train={len(train_items)} val={len(val_items)} test={len(test_items)} dataset_version={manifest.get('version')}")

    # Checkpoint resume must not re-download pretrained COCO weights.
    model = build_model(args.pretrained and not args.resume).to(device)
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.SGD(params, lr=args.lr, momentum=0.9, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs))
    loader = torch.utils.data.DataLoader(RDD(train_items, raw, True), batch_size=args.batch, shuffle=True, collate_fn=collate, num_workers=2)

    history, best, start_epoch = [], -1.0, 1
    latest_path = out / "last.pt"
    config = {"dataset_version": manifest.get("version"), "seed": args.seed,
              "lr": args.lr, "batch": args.batch, "epochs": args.epochs,
              "max_images": args.max_images, "pretrained": args.pretrained,
              "classes": CLASSES}
    if args.resume:
        if not latest_path.is_file():
            raise SystemExit(f"No resumable checkpoint found: {latest_path}. Start a new run without --resume.")
        checkpoint = torch.load(latest_path, map_location=device, weights_only=True)
        if checkpoint.get("config") != config:
            raise SystemExit("Checkpoint config/dataset mismatch: refusing to resume with different split, seed, or hyperparameters.")
        model.load_state_dict(checkpoint["model"])
        opt.load_state_dict(checkpoint["optimizer"])
        sched.load_state_dict(checkpoint["scheduler"])
        history = checkpoint["history"]
        best = float(checkpoint["best"])
        start_epoch = int(checkpoint["epoch"]) + 1
        torch.set_rng_state(checkpoint["rng_cpu"].cpu())
        if device.type == "cuda" and checkpoint.get("rng_cuda"):
            torch.cuda.set_rng_state_all(checkpoint["rng_cuda"])
        print(f"Resuming from completed epoch {start_epoch - 1} (next epoch: {start_epoch})")

    for epoch in range(start_epoch, args.epochs + 1):
        model.train()
        losses, t0 = [], time.time()
        for imgs, targets, _ in loader:
            imgs = [i.to(device) for i in imgs]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]
            loss = sum(model(imgs, targets).values())
            opt.zero_grad(); loss.backward(); opt.step()
            losses.append(loss.item())
        sched.step()
        g, p, _ = predict(model, RDD(val_items, raw, False), device, 1)
        val = evaluate(g, p, CLASSES)
        rec = {"epoch": epoch, "train_loss": round(statistics.mean(losses), 4) if losses else None,
               "val_mAP50": val.as_dict()["mAP50"], "val_mAP50-95": val.as_dict()["mAP50-95"], "seconds": round(time.time() - t0, 1)}
        history.append(rec); print(rec)
        (out / "history.json").write_text(json.dumps(history, indent=2))
        score = val.map50 if val.map50 == val.map50 else 0.0
        if score >= best:
            best = score
            torch.save({"model": model.state_dict(), "classes": CLASSES, "epoch": epoch}, out / "model.pt")
        # Atomic per-epoch snapshot: keep last valid checkpoint if the runtime stops mid-save.
        snapshot = {"model": model.state_dict(), "optimizer": opt.state_dict(),
                    "scheduler": sched.state_dict(), "history": history,
                    "epoch": epoch, "best": best, "config": config,
                    "rng_cpu": torch.get_rng_state(),
                    "rng_cuda": torch.cuda.get_rng_state_all() if device.type == "cuda" else []}
        tmp_checkpoint = out / "last.pt.part"
        torch.save(snapshot, tmp_checkpoint)
        tmp_checkpoint.replace(latest_path)

    model.load_state_dict(torch.load(out / "model.pt", map_location=device)["model"])
    test_ds = RDD(test_items, raw, False)
    g, p, lat = predict(model, test_ds, device, 1)
    rep = evaluate(g, p, CLASSES).as_dict()
    per_country = {}
    for c in sorted({it["country"] for it in test_items}):
        ids = {it["image"] for it in test_items if it["country"] == c}
        r = evaluate([x for x in g if x[0] in ids], [x for x in p if x[0] in ids], CLASSES).as_dict()
        per_country[c] = {"images": len(ids), "mAP50": r["mAP50"], "mAP50-95": r["mAP50-95"], "f1": r["f1"]}
    lat_sorted = sorted(lat)
    metrics = {
        "model": "fasterrcnn_mobilenet_v3_large_fpn", "framework": f"torchvision {torchvision.__version__} / torch {torch.__version__}",
        "licence": "BSD-3-Clause (torchvision)", "pretrained_coco": args.pretrained, "dataset_version": manifest.get("version"),
        "split_sizes": {"train": len(train_items), "val": len(val_items), "test": len(test_items)}, "epochs": args.epochs,
        "smoke_test": bool(args.max_images), "test": rep, "per_country": per_country,
        "latency_ms": {"median": round(statistics.median(lat), 1) if lat else None, "p95": round(lat_sorted[int(0.95 * (len(lat) - 1))], 1) if lat else None,
                       "device": str(device), "cpu": platform.processor() or platform.machine()},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps({k: metrics[k] for k in ("smoke_test", "split_sizes")} | {"mAP50": rep["mAP50"], "mAP50-95": rep["mAP50-95"], "latency_ms": metrics["latency_ms"]}, indent=2))
    if args.onnx:
        model.eval().cpu()
        torch.onnx.export(model, ([torch.rand(3, 640, 640)],), out / "model.onnx", opset_version=17, dynamo=False,
                          input_names=["image"], output_names=["boxes", "labels", "scores"], dynamic_axes={"image": {1: "h", 2: "w"}})
        print("exported", out / "model.onnx")


if __name__ == "__main__":
    main()
