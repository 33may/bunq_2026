"""OpenAI Whisper → text transcription.

Mirrors the lazy-client shape of ``receipt_parser._get_client``.
"""
from __future__ import annotations

import io

from openai import OpenAI

from ..config import settings


_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set — transcription disabled."
            )
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    language: str | None = None,
) -> str:
    """Send ``audio_bytes`` to Whisper and return the transcript text."""
    client = _get_client()
    buf = io.BytesIO(audio_bytes)
    buf.name = filename

    kwargs: dict = {
        "model": settings.openai_whisper_model,
        "file": buf,
        "response_format": "text",
    }
    if language:
        kwargs["language"] = language

    result = client.audio.transcriptions.create(**kwargs)
    return result if isinstance(result, str) else getattr(result, "text", str(result))
