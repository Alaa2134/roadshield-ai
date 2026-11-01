import httpx
import pytest

from app.config import Settings
from app.security import AuthError, RateLimiter, SupabaseVerifier, canonical_json, sign

from .conftest import Keys

BASE = "https://example-ref.supabase.co"


def test_signature_matches_postgres_hmac():
    # Reference value computed in the live Supabase database with
    #   select encode(extensions.hmac(<payload>, 'roadshield-test-secret', 'sha256'), 'hex')
    payload = '{"detection_id":"8f0c2a6e-0000-4000-8000-000000000001","top_category":"pothole","top_confidence":0.91}'
    assert sign(payload, "roadshield-test-secret") == "06cb156ee529154e492dd5ff3a1e7c4b21a284bd4caef6ecbdb1dc9cc77a6ebf"


def test_canonical_json_is_stable_and_compact():
    a = canonical_json({"b": 1, "a": [1, 2], "c": None})
    b = canonical_json({"c": None, "a": [1, 2], "b": 1})
    assert a == b == '{"a":[1,2],"b":1,"c":null}'


def test_any_edit_breaks_the_signature():
    payload = canonical_json({"top_category": "crack", "top_confidence": 0.4})
    tampered = payload.replace("0.4", "0.9")
    assert sign(payload, "k") != sign(tampered, "k")


def _verifier(keys: Keys, user_status: int = 200) -> SupabaseVerifier:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/jwks.json"):
            return httpx.Response(200, json=keys.jwks)
        if req.url.path.endswith("/auth/v1/user"):
            return httpx.Response(user_status, json={"id": "legacy-user"} if user_status == 200 else {})
        return httpx.Response(404)

    settings = Settings(supabase_url=BASE, supabase_publishable_key="pk")
    return SupabaseVerifier(settings, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_valid_es256_token_is_accepted():
    keys = Keys(BASE)
    caller = _verifier(keys).verify(keys.token(sub="abc"))
    assert caller.user_id == "abc"


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "something-else"},
        {"iss": "https://evil.example/auth/v1"},
        {"exp": 1},
        {"role": "anon"},
    ],
)
def test_bad_claims_are_rejected(overrides):
    keys = Keys(BASE)
    with pytest.raises(AuthError):
        _verifier(keys).verify(keys.token(**overrides))


def test_token_from_another_key_is_rejected():
    keys, other = Keys(BASE), Keys(BASE)
    with pytest.raises(AuthError):
        _verifier(keys).verify(other.token())


def test_legacy_hs256_token_is_checked_with_supabase():
    import jwt

    token = jwt.encode({"sub": "x", "aud": "authenticated"}, "legacy-secret", algorithm="HS256")
    assert _verifier(Keys(BASE)).verify(token).user_id == "legacy-user"
    with pytest.raises(AuthError):
        _verifier(Keys(BASE), user_status=401).verify(token)


def test_garbage_and_unsigned_tokens_are_rejected():
    import jwt

    v = _verifier(Keys(BASE))
    with pytest.raises(AuthError):
        v.verify("not-a-jwt")
    with pytest.raises(AuthError):
        v.verify(jwt.encode({"sub": "x"}, None, algorithm="none"))


def test_rate_limiter_sliding_window():
    rl = RateLimiter(per_minute=2)
    assert rl.allow("u", now=0) and rl.allow("u", now=1)
    assert not rl.allow("u", now=2)
    assert rl.allow("other", now=2)
    assert rl.allow("u", now=61)
