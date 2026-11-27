"""Generate a SYNTHETIC smoke-test fixture in RDD2022 layout (VOC XML + JPEG).

Synthetic asphalt-like images with drawn dark ellipses ("D40") and thin dark lines ("D00").
For pipeline smoke tests ONLY: metrics obtained on it say nothing about real-world accuracy.
  python ml/detector/make_smoke_fixture.py --out /tmp/rs-smoke/RDD2022 --n 48
"""
import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--n", type=int, default=48)
    a = ap.parse_args()
    rnd = random.Random(7)
    for country in ("SyntheticA", "SyntheticB"):
        xd = Path(a.out) / country / "train" / "annotations" / "xmls"; idir = Path(a.out) / country / "train" / "images"
        xd.mkdir(parents=True, exist_ok=True); idir.mkdir(parents=True, exist_ok=True)
        for i in range(a.n // 2):
            w, h = 320, 240
            im = Image.new("RGB", (w, h), (rnd.randint(95, 120),) * 3)
            px = im.load()
            for _ in range(4000):
                x, y = rnd.randrange(w), rnd.randrange(h); v = rnd.randint(70, 150); px[x, y] = (v, v, v)
            d = ImageDraw.Draw(im); objs = []
            for _ in range(rnd.randint(1, 3)):
                if rnd.random() < 0.5:
                    cx, cy, rx, ry = rnd.randint(40, w - 40), rnd.randint(40, h - 40), rnd.randint(12, 30), rnd.randint(8, 20)
                    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(35, 35, 38)); objs.append(("D40", cx - rx, cy - ry, cx + rx, cy + ry))
                else:
                    x = rnd.randint(30, w - 30); y1 = rnd.randint(5, 60); y2 = rnd.randint(h - 80, h - 5)
                    d.line([(x, y1), (x + rnd.randint(-15, 15), y2)], fill=(30, 30, 30), width=3); objs.append(("D00", x - 18, y1, x + 18, y2))
            im = im.filter(ImageFilter.GaussianBlur(0.6))
            name = f"{country}_{i:04d}"
            im.save(idir / f"{name}.jpg", quality=90)
            xml = "".join(f"<object><name>{c}</name><bndbox><xmin>{x1}</xmin><ymin>{y1}</ymin><xmax>{x2}</xmax><ymax>{y2}</ymax></bndbox></object>" for c, x1, y1, x2, y2 in objs)
            (xd / f"{name}.xml").write_text(f"<annotation><size><width>{w}</width><height>{h}</height></size>{xml}</annotation>")
    print("synthetic fixture written to", a.out)


if __name__ == "__main__":
    main()
