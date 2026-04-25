"""Unit tests for LocalStorage — real filesystem roundtrips (no mocks).

S3Storage needs live AWS or a moto harness, so it's out of scope here;
`local_path` for S3 also isn't covered until we bring that in.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from core.services.storage import LocalStorage


def test_save_writes_file_and_returns_file_uri(tmp_path: Path):
    s = LocalStorage(tmp_path)

    url = s.save("scan-1", b"bytes", "image/jpeg")

    # Pydantic-settings may hand us a Path; LocalStorage resolves it — we
    # only care that the returned URI is a file:// uri under the root.
    assert url.startswith("file://")
    on_disk = Path(url[len("file://"):])
    assert on_disk.exists()
    assert on_disk.read_bytes() == b"bytes"


def test_save_uses_extension_from_content_type(tmp_path: Path):
    s = LocalStorage(tmp_path)

    jpeg = s.save("a", b"\xff\xd8", "image/jpeg")
    png = s.save("b", b"\x89PNG", "image/png")
    heic = s.save("c", b"x", "image/heic")
    unknown = s.save("d", b"x", "application/weird")

    assert jpeg.endswith("a.jpg")
    assert png.endswith("b.png")
    assert heic.endswith("c.heic")
    # Unknown content types fall back to .bin so we never lose the bytes.
    assert unknown.endswith("d.bin")


def test_load_returns_saved_bytes(tmp_path: Path):
    s = LocalStorage(tmp_path)
    url = s.save("x", b"hello there", "image/png")

    assert s.load(url) == b"hello there"


def test_local_path_strips_file_prefix(tmp_path: Path):
    s = LocalStorage(tmp_path)
    url = s.save("x", b"x", "image/jpeg")

    path = s.local_path(url)

    assert not path.startswith("file://")
    assert Path(path).exists()


def test_load_rejects_non_file_uri(tmp_path: Path):
    s = LocalStorage(tmp_path)

    with pytest.raises(AssertionError, match="not a file uri"):
        s.load("s3://bucket/key")


def test_save_creates_root_if_missing(tmp_path: Path):
    """Root dir must be auto-created so first run doesn't crash."""
    nested = tmp_path / "not" / "yet" / "there"
    assert not nested.exists()

    s = LocalStorage(nested)
    url = s.save("x", b"x", "image/jpeg")

    assert nested.is_dir()
    assert Path(url[len("file://"):]).exists()
