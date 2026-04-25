"""Unit tests for the Whisper transcription service.

All tests here stub the OpenAI client — the live smoke test that actually
hits the API lives in ``test_transcribe_live.py`` under the ``live`` marker.
"""
from __future__ import annotations

import pytest


def test_transcribe_audio_returns_text(monkeypatch):
    """Happy path: bytes in → transcript string out."""
    from core.services import transcribe

    captured: dict = {}

    class FakeTranscriptions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return "hello world"

    class FakeAudio:
        transcriptions = FakeTranscriptions()

    class FakeClient:
        audio = FakeAudio()

    monkeypatch.setattr(transcribe, "_client", FakeClient())

    result = transcribe.transcribe_audio(b"\x00\x01\x02", filename="clip.webm")

    assert result == "hello world"
    assert captured["model"] == "whisper-1"
    assert captured["response_format"] == "text"
    # SDK needs a file-like with a name so it can infer mime type
    assert getattr(captured["file"], "name", None) == "clip.webm"


def test_transcribe_audio_raises_without_key(monkeypatch):
    """No OPENAI_API_KEY → clear RuntimeError, not a cryptic SDK error."""
    from core import config as config_mod
    from core.services import transcribe

    monkeypatch.setattr(config_mod.settings, "openai_api_key", "")
    monkeypatch.setattr(transcribe, "_client", None)

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        transcribe.transcribe_audio(b"\x00")


def test_transcribe_audio_forwards_language_hint(monkeypatch):
    """Passing language='nl' should reach the SDK call."""
    from core.services import transcribe

    captured: dict = {}

    class FakeClient:
        class audio:  # noqa: D106
            class transcriptions:  # noqa: D106
                @staticmethod
                def create(**kwargs):
                    captured.update(kwargs)
                    return "hoi"

    monkeypatch.setattr(transcribe, "_client", FakeClient())

    transcribe.transcribe_audio(b"\x00", filename="a.m4a", language="nl")

    assert captured["language"] == "nl"


def test_transcribe_audio_omits_language_when_none(monkeypatch):
    """No language hint → SDK is not called with language=None."""
    from core.services import transcribe

    captured: dict = {}

    class FakeClient:
        class audio:  # noqa: D106
            class transcriptions:  # noqa: D106
                @staticmethod
                def create(**kwargs):
                    captured.update(kwargs)
                    return "x"

    monkeypatch.setattr(transcribe, "_client", FakeClient())

    transcribe.transcribe_audio(b"\x00", filename="a.wav")

    assert "language" not in captured
