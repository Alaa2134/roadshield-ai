import io

import numpy as np
import pytest
from PIL import Image

from app.imaging import BadImage, decode_image, encode_jpeg, redact

from .conftest import jpeg_bytes


def test_metadata_is_stripped_on_reencode():
    src = jpeg_bytes(exif_gps=True)
    assert Image.open(io.BytesIO(src)).getexif()  # sanity: the source carries EXIF
    out = encode_jpeg(decode_image(src).rgb)
    im = Image.open(io.BytesIO(out))
    assert not im.getexif()
    assert "exif" not in im.info and "xmp" not in im.info


def test_exif_orientation_applied():
    arr = np.zeros((100, 200, 3), dtype=np.uint8)
    buf = io.BytesIO()
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90° CW on display
    Image.fromarray(arr).save(buf, format="JPEG", exif=exif)
    d = decode_image(buf.getvalue())
    assert (d.width, d.height) == (100, 200)


@pytest.mark.parametrize("data", [b"", b"not an image", b"GIF89a" + b"\0" * 40])
def test_bad_uploads_rejected(data):
    with pytest.raises(BadImage):
        decode_image(data)


def test_tiny_image_rejected():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, format="PNG")
    with pytest.raises(BadImage):
        decode_image(buf.getvalue())


def test_redact_without_findings_keeps_pixels():
    rgb = (np.random.default_rng(1).random((300, 400, 3)) * 255).astype(np.uint8)
    res = redact(rgb)
    assert res.faces == 0 and res.plates == 0 and not res.applied
    assert np.array_equal(res.rgb, rgb)
