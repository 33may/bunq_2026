"""Live smoke test — hits the real Whisper API.

Run with:  pytest -m live tests/test_transcribe_live.py
Skipped by default (no marker, or on missing key / missing `say` binary).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


pytestmark = pytest.mark.live


@pytest.fixture(scope="module")
def spoken_clip() -> Path:
    """Generate a short m4a clip via macOS `say` — deterministic input."""
    if shutil.which("say") is None or shutil.which("afconvert") is None:
        pytest.skip("requires macOS `say` + `afconvert`")

    with tempfile.TemporaryDirectory() as td:
        aiff = Path(td) / "clip.aiff"
        out = Path(tempfile.gettempdir()) / "bunq-whisper-smoke.m4a"
        subprocess.run(
            ["say", "-o", str(aiff), "Hello from the bunq flatmate app."],
            check=True,
        )
        subprocess.run(
            ["afconvert", "-f", "m4af", "-d", "aac", str(aiff), str(out)],
            check=True,
        )
        yield out


def test_whisper_transcribes_short_clip(spoken_clip, monkeypatch):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        # Last-resort: pull from the secrets file the user keeps at
        # ~/.config/secrets.env so a dev can run the smoke test without
        # having sourced their shell.
        secrets = Path.home() / ".config" / "secrets.env"
        if secrets.exists():
            for line in secrets.read_text().splitlines():
                line = line.strip().removeprefix("export ")
                if line.startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        pytest.skip("OPENAI_API_KEY not available")

    # Make the lazy client pick up this key on first use.
    from core import config as config_mod
    from core.services import transcribe

    monkeypatch.setattr(config_mod.settings, "openai_api_key", key)
    monkeypatch.setattr(transcribe, "_client", None)

    audio_bytes = spoken_clip.read_bytes()
    transcript = transcribe.transcribe_audio(
        audio_bytes, filename=spoken_clip.name, language="en"
    )

    assert isinstance(transcript, str) and transcript.strip()
    lowered = transcript.lower()
    # Don't over-specify punctuation — Whisper may or may not add a period.
    assert "hello" in lowered
    assert "bunq" in lowered or "flatmate" in lowered
