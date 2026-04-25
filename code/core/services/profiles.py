"""Per-user profile MD file storage.

Mirrors :mod:`storage` (image storage) — one ``Profile`` Protocol with two
backends: ``LocalProfileStore`` writes to ``settings.profile_dir`` and
``S3ProfileStore`` uploads under ``aws_s3_profile_prefix``. The active
backend is selected by ``settings.storage_backend`` and instantiated via
:func:`get_profile_store`.

The agent reads the file via the ``read_my_profile`` MCP tool and proposes
edits via the ``update_profile`` emit_action kind. The actual write happens
when the user confirms in the UI (``PUT /me/profile``), at which point the
backend route calls :func:`save`.

Files are keyed by ``user.id`` (a UUID string), so renaming a bunq label
does not orphan the profile.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..config import settings


class ProfileStore(Protocol):
    """Tiny per-user profile protocol."""

    def load(self, user_id: str) -> str:
        """Return the user's profile MD text. Empty string if not yet written."""

    def save(self, user_id: str, text: str) -> str:
        """Persist ``text`` and return a stable URI."""


# ── local filesystem ────────────────────────────────────────────────────
class LocalProfileStore:
    """Stores files under ``settings.profile_dir`` as ``<user_id>.md``."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, user_id: str) -> Path:
        return self.root / f"{user_id}.md"

    def load(self, user_id: str) -> str:
        p = self._path(user_id)
        if not p.exists():
            return ""
        return p.read_text(encoding="utf-8")

    def save(self, user_id: str, text: str) -> str:
        p = self._path(user_id)
        p.write_text(text, encoding="utf-8")
        return f"file://{p.resolve()}"


# ── s3 ──────────────────────────────────────────────────────────────────
class S3ProfileStore:
    """Boto3-backed S3 store for per-user MD profiles."""

    def __init__(self, bucket: str, prefix: str = "profiles/", region: str | None = None):
        import boto3

        self.bucket = bucket
        self.prefix = prefix.strip("/") + "/"
        self._s3 = boto3.client("s3", region_name=region)

    def _key(self, user_id: str) -> str:
        return f"{self.prefix}{user_id}.md"

    def load(self, user_id: str) -> str:
        try:
            obj = self._s3.get_object(Bucket=self.bucket, Key=self._key(user_id))
        except Exception:
            return ""
        return obj["Body"].read().decode("utf-8")

    def save(self, user_id: str, text: str) -> str:
        key = self._key(user_id)
        self._s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=text.encode("utf-8"),
            ContentType="text/markdown",
        )
        return f"s3://{self.bucket}/{key}"


# ── factory ─────────────────────────────────────────────────────────────
_store: ProfileStore | None = None


def get_profile_store() -> ProfileStore:
    """Return a memoised store based on ``settings.storage_backend``."""
    global _store
    if _store is not None:
        return _store
    if settings.storage_backend == "s3":
        _store = S3ProfileStore(
            bucket=settings.aws_s3_bucket,
            prefix=settings.aws_s3_profile_prefix,
            region=settings.aws_region or None,
        )
    else:
        _store = LocalProfileStore(settings.profile_dir)
    return _store
