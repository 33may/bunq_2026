"""Audio transcription endpoint — thin FastAPI wrapper around Whisper.

POST /transcribe  (multipart/form-data)
  • audio:     file       — recorded clip (webm/m4a/mp3/wav/ogg)
  • language:  form field — optional ISO-639-1 hint (e.g. "en", "nl")

Response: {"text": "<transcript>"}
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..config import settings
from ..services.transcribe import transcribe_audio

log = logging.getLogger(__name__)

router = APIRouter(tags=["transcribe"])


class TranscribeOut(BaseModel):
    text: str


_ALLOWED_CT_PREFIXES = ("audio/", "video/")  # Safari's MediaRecorder emits video/mp4 for audio-only


@router.post("/transcribe", response_model=TranscribeOut)
async def transcribe_endpoint(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> TranscribeOut:
    content_type = (audio.content_type or "").lower()
    if not content_type.startswith(_ALLOWED_CT_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported content_type: {audio.content_type!r}",
        )

    raw = await audio.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(raw) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"audio larger than {settings.max_upload_mb}MB",
        )
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="empty upload",
        )

    try:
        text = await run_in_threadpool(
            transcribe_audio,
            raw,
            filename=audio.filename or "audio.webm",
            language=language or None,
        )
    except RuntimeError as e:
        # Missing OPENAI_API_KEY or SDK rejection — surface as 503 so the
        # frontend can show a friendly "voice input unavailable" toast.
        log.warning("transcribe failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e

    return TranscribeOut(text=text.strip())
