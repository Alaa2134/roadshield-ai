"""Tests for ml/datasets/prepare_rdd2022.py using a tiny synthetic VOC tree (test fixture)."""
import json
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "datasets"))
from prepare_rdd2022 import group_duplicates, parse_voc, split_groups  # noqa: E402

VOC = """<annotation><size><width>100</width><height>80</height></size>
<object><name>D40</name><bndbox><xmin>10</xmin><ymin>10</ymin><xmax>40</xmax><ymax>30</ymax></bndbox></object>
<object><name>D44</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>5</xmax><ymax>5</ymax></bndbox></object>
<object><name>D00</name><bndbox><xmin>90</xmin><ymin>70</ymin><xmax>500</xmax><ymax>700</ymax></bndbox></object>
</annotation>"""


def _img(path: Path, seed: int):
    rnd = random.Random(seed)
    im = Image.new("L", (100, 80))
    im.putdata([rnd.randrange(256) for _ in range(100 * 80)])
    im.convert("RGB").save(path)


def test_parse_voc_maps_and_drops(tmp_path):
    x = tmp_path / "a.xml"; x.write_text(VOC)
    w, h, boxes, dropped = parse_voc(x)
    assert (w, h) == (100, 80)
    assert [b["cls"] for b in boxes] == [3, 0]          # D40 -> 3, D00 -> 0
    assert boxes[1]["bbox"] == [90.0, 70.0, 100.0, 80.0]  # clipped to image
    assert dropped["D44"] == 1                           # unsupported class counted, not remapped


def test_near_duplicates_never_span_splits():
    items = [{"sha256": f"{i:064d}", "dhash": (i // 2) << 50} for i in range(40)]  # pairs share a hash
    groups = group_duplicates(items)
    assert all(len(g) == 2 for g in groups)
    s = split_groups(groups, seed=1)
    where = {it["sha256"]: k for k, v in s.items() for it in v}
    for g in groups:
        assert len({where[it["sha256"]] for it in g}) == 1
    assert sum(len(v) for v in s.values()) == 40


def test_end_to_end_cli(tmp_path):
    raw = tmp_path / "RDD2022"
    for country in ("Japan", "India"):
        xd = raw / country / "train" / "annotations" / "xmls"; idir = raw / country / "train" / "images"
        xd.mkdir(parents=True); idir.mkdir(parents=True)
        for i in range(10):
            (xd / f"{country}_{i}.xml").write_text(VOC)
            _img(idir / f"{country}_{i}.jpg", seed=hash((country, i)) % 10_000)
    out = tmp_path / "out"
    r = subprocess.run([sys.executable, str(ROOT / "datasets" / "prepare_rdd2022.py"), "--raw", str(raw), "--out", str(out), "--yolo"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    m = json.loads((out / "MANIFEST.json").read_text())
    assert sum(m["counts"].values()) == 20 and set(m["per_country"]) == {"Japan", "India"}
    assert m["dropped_labels"]["D44"] == 20
    assert len(list((out / "labels").rglob("*.txt"))) == 20
