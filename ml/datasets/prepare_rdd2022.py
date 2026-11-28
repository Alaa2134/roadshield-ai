"""Prepare RDD2022 (Pascal VOC) for training and evaluation.

  python ml/datasets/prepare_rdd2022.py --raw datasets/raw/rdd2022/RDD2022 --out datasets/rdd2022 \
      [--countries Japan,India,Czech,Norway,United_States,China_MotorBike,China_Drone] [--seed 42]

* Classes follow the RDD2022 annotation guide: D00 longitudinal crack, D10 transverse crack,
  D20 alligator crack, D40 pothole. Other labels present in some countries (e.g. D43, D44,
  D50, Repair, Block crack) are NOT remapped; they are counted in the report and dropped.
* Only the official *train* folders carry labels, so the held-out test split is carved from
  them. Splits target 80/10/10 per country with grouped near-duplicates; deterministic for a seed.\n  They are NOT class-stratified, and do not by themselves establish a geography-independent test.
* Duplicate / near-duplicate images (64-bit difference hash, Hamming ≤ 4) are kept together in
  one split so the test set never contains a near-copy of a training image (no leakage).
* Output: <out>/{train,val,test}.json, <out>/labels/*.txt (YOLO format, optional),
  <out>/MANIFEST.json (file hashes, split membership, per-country/class counts, version id).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import xml.etree.ElementTree as ET  # input is the official dataset; expat guards entity expansion
from collections import Counter, defaultdict
from pathlib import Path

CLASSES = ["D00", "D10", "D20", "D40"]
CLASS_INDEX = {c: i for i, c in enumerate(CLASSES)}


def dhash(path: Path, size: int = 8) -> int:
    from PIL import Image

    with Image.open(path) as im:
        g = im.convert("L").resize((size + 1, size))
        px = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] > px[r * (size + 1) + c + 1])
    return bits


def parse_voc(xml_path: Path) -> tuple[int, int, list[dict], Counter]:
    root = ET.parse(xml_path).getroot()
    size = root.find("size")
    w = int(float(size.findtext("width", "0"))) if size is not None else 0
    h = int(float(size.findtext("height", "0"))) if size is not None else 0
    boxes, dropped = [], Counter()
    for obj in root.iter("object"):
        name = (obj.findtext("name") or "").strip()
        bb = obj.find("bndbox")
        if bb is None:
            continue
        x1, y1, x2, y2 = (float(bb.findtext(k, "0")) for k in ("xmin", "ymin", "xmax", "ymax"))
        if name not in CLASS_INDEX:
            dropped[name] += 1
            continue
        x1, x2 = max(0.0, min(x1, x2)), min(float(w or x2), max(x1, x2))
        y1, y2 = max(0.0, min(y1, y2)), min(float(h or y2), max(y1, y2))
        if x2 - x1 < 1 or y2 - y1 < 1:
            dropped["degenerate_box"] += 1
            continue
        boxes.append({"cls": CLASS_INDEX[name], "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]})
    return w, h, boxes, dropped


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def group_duplicates(items: list[dict], threshold: int = 4) -> list[list[dict]]:
    """Transitively group every pair with 64-bit dHash Hamming distance <= threshold.

    Complete multi-index hashing: split the hash into threshold+1 disjoint blocks.
    By the pigeonhole principle, a pair with <=threshold differing bits must have
    at least one IDENTICAL block. We compare every candidate that shares any block.

    Unlike bucketing only by the top 16 bits, this cannot overlook near-duplicates
    merely because their highest hash bits differ. It does not guarantee that every
    semantically similar road/video frame has a close dHash; source video/site
    grouping and separate held-out geographical validation still matter.
    """
    if not 0 <= threshold < 64:
        raise ValueError("threshold must be between 0 and 63 bits")
    parent = list(range(len(items)))
    sizes = [1] * len(items)

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri == rj:
            return
        if sizes[ri] < sizes[rj]:
            ri, rj = rj, ri
        parent[rj] = ri
        sizes[ri] += sizes[rj]

    blocks = threshold + 1
    base_width, extra = divmod(64, blocks)
    spans = []
    offset = 0
    for k in range(blocks):
        width = base_width + (1 if k < extra else 0)
        spans.append((offset, (1 << width) - 1))
        offset += width

    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, item in enumerate(items):
        h = int(item["dhash"])
        keys = [(b, (h >> offset) & mask) for b, (offset, mask) in enumerate(spans)]
        candidate_ids: set[int] = set()
        for key in keys:
            candidate_ids.update(buckets[key])
        for j in candidate_ids:
            if (h ^ int(items[j]["dhash"])).bit_count() <= threshold:
                union(i, j)
        for key in keys:
            buckets[key].append(i)

    groups: dict[int, list[dict]] = defaultdict(list)
    for i, item in enumerate(items):
        groups[find(i)].append(item)
    return list(groups.values())


def split_groups(groups: list[list[dict]], seed: int, ratios=(0.8, 0.1, 0.1)) -> dict[str, list[dict]]:
    rng = random.Random(seed)
    groups = sorted(groups, key=lambda g: g[0]["sha256"])
    rng.shuffle(groups)
    total = sum(len(g) for g in groups)
    out = {"train": [], "val": [], "test": []}
    for g in groups:
        n_val, n_test = len(out["val"]), len(out["test"])
        if n_test < ratios[2] * total:
            out["test"].extend(g)
        elif n_val < ratios[1] * total:
            out["val"].extend(g)
        else:
            out["train"].extend(g)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--countries", default="")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--yolo", action="store_true", help="also write YOLO txt labels")
    args = ap.parse_args()
    raw, out = Path(args.raw), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    wanted = {c.strip() for c in args.countries.split(",") if c.strip()}

    splits: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    dropped_total, report = Counter(), {}
    for country_dir in sorted(p for p in raw.iterdir() if p.is_dir()):
        if wanted and country_dir.name not in wanted:
            continue
        xml_dir = country_dir / "train" / "annotations" / "xmls"
        img_dir = country_dir / "train" / "images"
        if not xml_dir.is_dir():
            continue
        items = []
        for xml in sorted(xml_dir.glob("*.xml")):
            img = img_dir / (xml.stem + ".jpg")
            if not img.exists():
                continue
            w, h, boxes, dropped = parse_voc(xml)
            dropped_total.update(dropped)
            items.append({"image": str(img.relative_to(raw)), "country": country_dir.name, "width": w, "height": h,
                          "boxes": boxes, "sha256": sha256(img), "dhash": dhash(img)})
        # exact duplicates collapse first, then near-duplicates are grouped
        by_hash = {it["sha256"]: it for it in items}
        groups = group_duplicates(list(by_hash.values()))
        s = split_groups(groups, args.seed)
        for k in splits:
            splits[k].extend(s[k])
        report[country_dir.name] = {k: {"images": len(s[k]), "boxes": Counter(CLASSES[b["cls"]] for it in s[k] for b in it["boxes"])}
                                    for k in s}
        report[country_dir.name]["exact_duplicates_removed"] = len(items) - len(by_hash)
        report[country_dir.name]["near_duplicate_groups"] = sum(1 for g in groups if len(g) > 1)

    for k, items in splits.items():
        (out / f"{k}.json").write_text(json.dumps([{x: v for x, v in it.items() if x != "dhash"} for it in items]))
        if args.yolo:
            lab = out / "labels" / k
            lab.mkdir(parents=True, exist_ok=True)
            for it in items:
                if not it["width"] or not it["height"]:
                    continue
                lines = [f"{b['cls']} {((b['bbox'][0] + b['bbox'][2]) / 2) / it['width']:.6f} {((b['bbox'][1] + b['bbox'][3]) / 2) / it['height']:.6f} "
                         f"{(b['bbox'][2] - b['bbox'][0]) / it['width']:.6f} {(b['bbox'][3] - b['bbox'][1]) / it['height']:.6f}" for b in it["boxes"]]
                (lab / (Path(it["image"]).stem + ".txt")).write_text("\n".join(lines))
    membership = sorted(f"{k}:{it['sha256']}" for k, items in splits.items() for it in items)
    manifest = {
        "dataset": "RDD2022", "classes": CLASSES, "seed": args.seed,
        "version": hashlib.sha256("\n".join(membership).encode()).hexdigest()[:16],
        "counts": {k: len(v) for k, v in splits.items()}, "per_country": report,
        "dropped_labels": dict(dropped_total),
        "leakage_check": "near-duplicate groups never span splits",
    }
    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, default=dict))
    print(json.dumps({"version": manifest["version"], "counts": manifest["counts"], "dropped": manifest["dropped_labels"]}, indent=2))


if __name__ == "__main__":
    main()
