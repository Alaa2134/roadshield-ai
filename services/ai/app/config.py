"""Runtime configuration, read from environment variables (see .env.example)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", env_file=".env", extra="ignore")

    # --- Model -----------------------------------------------------------------------------
    model_path: Path = Field(default=SERVICE_ROOT / "models" / "roadshield-rdd.onnx")
    """ONNX file exported from a YOLOv8 detector trained on road damage (see scripts/)."""
    model_card_path: Path = Field(default=SERVICE_ROOT / "models" / "model_card.json")
    """JSON with name, version, class names and provenance, written by scripts/export_onnx.py."""
    labels_path: Path = Field(default=SERVICE_ROOT / "labels.json")
    """Maps the model's own class names to RoadShield categories (pothole/crack/surface_damage)."""

    conf_threshold: float = 0.25
    """Detections below this confidence are discarded."""
    iou_threshold: float = 0.45
    low_confidence: float = 0.5
    """Top results below this are flagged so the app asks the user to double-check."""
    max_detections: int = 50
    onnx_threads: int = 2

    # --- Security ---------------------------------------------------------------------------
    signing_secret: str = ""
    """HMAC key shared ONLY with the database (app_private.settings.ai_signing_secret)."""
    supabase_url: str = ""
    """e.g. https://<ref>.supabase.co — used to verify the caller's session JWT."""
    supabase_publishable_key: str = ""
    """Publishable/anon key, used only for the /auth/v1/user fallback check."""
    jwt_audience: str = "authenticated"
    require_auth: bool = True
    """Never disable in production. Tests and local demos may set AI_REQUIRE_AUTH=false."""

    rate_limit_per_minute: int = 12
    max_upload_bytes: int = 8 * 1024 * 1024
    cors_origins: str = ""
    """Comma-separated. Native apps do not need CORS; leave empty unless a web client calls this."""

    # --- Privacy ----------------------------------------------------------------------------
    redact_faces: bool = True
    redact_plates: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
