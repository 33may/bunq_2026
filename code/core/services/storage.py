"""Image storage abstraction.

LocalStorage writes to ``code/.house/uploads/`` and returns ``file://`` URIs;
S3Storage uploads to a configured bucket and returns ``s3://bucket/key`` URIs.

The active backend is selected by ``settings.storage_backend`` and instantiated
via :func:`get_storage`.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..config import settings


class Storage(Protocol):
    """Tiny storage protocol — every backend implements these three."""

    def save(self, scan_id: str, data: bytes, content_type: str) -> str:
        """Persist ``data`` and return a stable URI for later retrieval."""

    def load(self, url: str) -> bytes:
        """Return the bytes previously stored at ``url``."""

    def local_path(self, url: str) -> str:
        """Materialise the bytes on disk and return an absolute path.

        The receipt parser hands this path to the agent's ``Read`` tool. For
        local storage that's a no-op; for S3 we download to a temp file.
        """


# ── local filesystem ────────────────────────────────────────────────────
class LocalStorage:
    """Stores files under ``settings.upload_dir`` keyed by scan id."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _ext(self, content_type: str) -> str:
        return {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png",
            "image/heic": ".heic",
            "image/webp": ".webp",
        }.get(content_type.lower(), ".bin")

    def save(self, scan_id: str, data: bytes, content_type: str) -> str:
        path = self.root / f"{scan_id}{self._ext(content_type)}"
        path.write_bytes(data)
        return f"file://{path.resolve()}"

    def load(self, url: str) -> bytes:
        return Path(self.local_path(url)).read_bytes()

    def local_path(self, url: str) -> str:
        assert url.startswith("file://"), f"not a file uri: {url}"
        return url[len("file://"):]


# ── s3 ──────────────────────────────────────────────────────────────────
class S3Storage:
    """Boto3-backed S3 uploader. Bucket must already exist."""

    def __init__(self, bucket: str, prefix: str = "scans/", region: str | None = None):
        # Imported lazily so dev installs without boto3 still work.
        import boto3

        self.bucket = bucket
        self.prefix = prefix.strip("/") + "/"
        self._s3 = boto3.client("s3", region_name=region)

    def _key(self, scan_id: str, content_type: str) -> str:
        ext = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png",
            "image/heic": ".heic",
            "image/webp": ".webp",
        }.get(content_type.lower(), ".bin")
        return f"{self.prefix}{scan_id}{ext}"

    def save(self, scan_id: str, data: bytes, content_type: str) -> str:
        key = self._key(scan_id, content_type)
        self._s3.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
        )
        return f"s3://{self.bucket}/{key}"

    def load(self, url: str) -> bytes:
        assert url.startswith("s3://"), f"not an s3 uri: {url}"
        _, _, rest = url.partition("s3://")
        bucket, _, key = rest.partition("/")
        obj = self._s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()

    def local_path(self, url: str) -> str:
        # The agent SDK's Read tool needs a real file path. Mirror the s3
        # object to a temp file the first time it's requested.
        import tempfile

        data = self.load(url)
        suffix = Path(url).suffix or ".bin"
        fd, path = tempfile.mkstemp(suffix=suffix, prefix="bunq-scan-")
        with open(fd, "wb") as f:
            f.write(data)
        return path


# ── factory ─────────────────────────────────────────────────────────────
_storage: Storage | None = None


def get_storage() -> Storage:
    """Return a memoised storage backend based on ``settings.storage_backend``."""
    global _storage
    if _storage is not None:
        return _storage
    if settings.storage_backend == "s3":
        _storage = S3Storage(
            bucket=settings.aws_s3_bucket,
            prefix=settings.aws_s3_prefix,
            region=settings.aws_region or None,
        )
    else:
        _storage = LocalStorage(settings.upload_dir)
    return _storage
