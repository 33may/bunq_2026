"""Runtime config — env-driven via pydantic-settings.

Reads from ``code/.env`` if present, falling back to process env. Defaults are
chosen so the app boots with zero config (local storage, no AI calls).
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


CODE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(CODE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── ai ─────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-7"
    openai_api_key: str = ""
    openai_whisper_model: str = "whisper-1"

    # ── storage ────────────────────────────────────────────────────────
    storage_backend: Literal["local", "s3"] = "local"
    upload_dir: Path = CODE_DIR / ".house" / "uploads"
    aws_s3_bucket: str = ""
    aws_s3_prefix: str = "scans/"
    aws_region: str = ""

    # ── upload limits ──────────────────────────────────────────────────
    max_upload_mb: int = 12

    # ── api ────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
