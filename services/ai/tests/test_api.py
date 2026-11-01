import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import SERVICE_ROOT, Settings, get_settings
from app.security import SupabaseVerifier, sign

from .conftest import Keys, jpeg_bytes

BASE = "https://example-ref.supabase.co"
SECRET = "unit-test-secret"


def make_client(settings: Settings, keys: Keys | None = None) -> TestClient:
    main.app.dependency_overrides[get_settings] = lambda: settings
    main.init_state(settings)
    if keys is not None:
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json=keys.jwks))
        main.state.verifier = SupabaseVerifier(settings, client=httpx.Client(transport=transport))
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def _reset():
    yield
    main.app.dependency_overrides.clear()


def settings_for(model, **kw) -> Settings:
    base = dict(
        model_path=model,
        model_card_path=model.parent / "model_card.json",
        labels_path=SERVICE_ROOT / "labels.json",
        signing_secret=SECRET,
        supabase_url=BASE,
        supabase_publishable_key="pk",
    )
    base.update(kw)
    return Settings(**base)


def post(client, token=None, data=None, **params):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    files = {"image": ("road.jpg", data if data is not None else jpeg_bytes(), "image/jpeg")}
    return client.post("/v1/analyze", files=files, headers=headers, params=params)


def test_health_without_model(tmp_path):
    client = make_client(settings_for(tmp_path / "missing.onnx"))
    body = client.get("/health").json()
    assert body["model_loaded"] is False and body["error"]


def test_analyze_is_unavailable_without_model(tmp_path):
    keys = Keys(BASE)
    client = make_client(settings_for(tmp_path / "missing.onnx"), keys)
    res = post(client, keys.token())
    assert res.status_code == 503 and res.json()["detail"] == "model_not_loaded"


def test_requires_a_signed_in_user(fixture_model):
    keys = Keys(BASE)
    client = make_client(settings_for(fixture_model), keys)
    assert post(client).status_code == 401
    assert post(client, "garbage").status_code == 401
    assert post(client, Keys(BASE).token()).status_code == 401  # signed by an unknown key


def test_signed_result_round_trip(fixture_model):
    keys = Keys(BASE)
    client = make_client(settings_for(fixture_model), keys)
    res = post(client, keys.token(sub="user-42"), annotate="true")
    assert res.status_code == 200, res.text
    body = res.json()
    assert sign(body["payload"], SECRET) == body["signature"]
    r = json.loads(body["payload"])
    assert r["requested_by"] == "user-42"
    assert r["model_name"] == "test-fixture" and r["model_version"] == "fixture-1"
    assert r["top_category"] == "pothole" and r["top_confidence"] == pytest.approx(0.91, abs=1e-3)
    assert r["low_confidence"] is False
    assert [d["category"] for d in r["detections"]] == ["pothole", "crack", "surface_damage"]
    assert (r["image_width"], r["image_height"]) == (800, 600)
    assert len(r["image_sha256"]) == 64
    assert body["privacy"] == {"faces": 0, "plates": 0, "applied": False}
    assert body["redacted_image_b64"] is None
    assert body["annotated_image_b64"]


def test_refuses_to_sign_without_secret(fixture_model):
    keys = Keys(BASE)
    client = make_client(settings_for(fixture_model, signing_secret=""), keys)
    res = post(client, keys.token())
    assert res.status_code == 503 and res.json()["detail"] == "signing_not_configured"


def test_bad_and_oversized_images(fixture_model):
    keys = Keys(BASE)
    client = make_client(settings_for(fixture_model, max_upload_bytes=10_000), keys)
    assert post(client, keys.token(), data=b"definitely not a jpeg").status_code == 400
    assert post(client, keys.token(), data=jpeg_bytes(1600, 1200)).status_code == 413


def test_rate_limit(fixture_model):
    keys = Keys(BASE)
    client = make_client(settings_for(fixture_model, rate_limit_per_minute=2), keys)
    tok = keys.token()
    assert [post(client, tok).status_code for _ in range(3)] == [200, 200, 429]
