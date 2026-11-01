"""Caller authentication, rate limiting and result signing."""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

from .config import Settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class Caller:
    user_id: str


class SupabaseVerifier:
    """Verifies Supabase Auth access tokens.

    Projects using asymmetric signing keys (ES256/RS256) are verified locally against the
    project's JWKS, cached for 10 minutes. Tokens signed with the legacy shared secret (HS256)
    cannot be checked locally without that secret, so they are confirmed with Supabase's
    /auth/v1/user endpoint instead. The service never needs the service-role key.
    """

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.settings = settings
        self.base = settings.supabase_url.rstrip("/")
        self.client = client or httpx.Client(timeout=5.0)
        self._jwks: dict[str, Any] | None = None
        self._jwks_at = 0.0
        self._lock = threading.Lock()

    def _get_jwks(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            if force or self._jwks is None or time.time() - self._jwks_at > 600:
                res = self.client.get(f"{self.base}/auth/v1/.well-known/jwks.json")
                res.raise_for_status()
                self._jwks = res.json()
                self._jwks_at = time.time()
            return self._jwks

    def _key_for(self, kid: str | None) -> Any:
        for force in (False, True):
            for k in self._get_jwks(force).get("keys", []):
                if kid is None or k.get("kid") == kid:
                    return jwt.PyJWK(k).key
        raise AuthError("unknown signing key")

    def verify(self, token: str) -> Caller:
        if not self.base:
            raise AuthError("auth not configured")
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise AuthError("malformed token") from exc
        alg = header.get("alg")
        if alg in ("ES256", "RS256", "EdDSA"):
            try:
                claims = jwt.decode(
                    token,
                    self._key_for(header.get("kid")),
                    algorithms=[alg],
                    audience=self.settings.jwt_audience,
                    issuer=f"{self.base}/auth/v1",
                    options={"require": ["exp", "sub"]},
                )
            except (jwt.PyJWTError, httpx.HTTPError) as exc:
                raise AuthError(f"invalid token: {exc}") from exc
            if claims.get("role") != "authenticated":
                raise AuthError("not a signed-in user")
            return Caller(user_id=str(claims["sub"]))
        if alg == "HS256":
            return self._verify_remote(token)
        raise AuthError("unsupported token algorithm")

    def _verify_remote(self, token: str) -> Caller:
        try:
            res = self.client.get(
                f"{self.base}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": self.settings.supabase_publishable_key},
            )
        except httpx.HTTPError as exc:
            raise AuthError("auth server unreachable") from exc
        if res.status_code != 200:
            raise AuthError("invalid session")
        uid = res.json().get("id")
        if not uid:
            raise AuthError("invalid session")
        return Caller(user_id=str(uid))


class RateLimiter:
    """Sliding one-minute window per caller. In-process: run one limiter per replica and keep
    the database's own per-user report limits as the authoritative control."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] >= 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            return True


def canonical_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=True, sort_keys=True)


def sign(payload: str, secret: str) -> str:
    """HMAC-SHA256 hex digest — identical to Postgres
    encode(extensions.hmac(payload, secret, 'sha256'), 'hex') used by submit_hazard_report."""
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
