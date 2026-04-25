"""POST /ai/chat — SSE streaming endpoint over the AgentRunner."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..data.models import House, User
from ..services.ai_agent import runner as runner_mod
from ..services.ai_agent.events import DoneEvent, ErrorEvent, sse_frame
from .deps import current_house, current_user, get_db

log = logging.getLogger("bunq.ai")

router = APIRouter(tags=["ai"])


class HistoryItem(BaseModel):
    role: str  # 'me' | 'ai' | 'user' (UI sends 'me' for user messages)
    text: str


class PageContext(BaseModel):
    page_id: str
    data: dict[str, Any] = Field(default_factory=dict)


class ChatIn(BaseModel):
    message: str
    history: list[HistoryItem] = Field(default_factory=list)
    page_context: PageContext | None = None
    client_turn_id: str


@router.post("/ai/chat")
async def post_ai_chat(
    body: ChatIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
):
    history = [it.model_dump() for it in body.history]
    ctx = body.page_context.model_dump() if body.page_context else None
    log.info(
        "ai.chat.in client_turn=%s user=%s page=%s history=%d msg=%r",
        body.client_turn_id, me.name, (ctx or {}).get("page_id"),
        len(history), body.message[:80],
    )

    async def gen():
        n = 0
        try:
            async for ev in runner_mod.run(
                message=body.message, history=history, page_context=ctx,
                user=me, house=house, db=db,
            ):
                n += 1
                log.info("ai.chat.frame #%d type=%s", n, ev.type)
                yield sse_frame(ev)
        except Exception:
            log.exception("ai.chat.unhandled client_turn=%s", body.client_turn_id)
            yield sse_frame(ErrorEvent(message="agent failed"))
            yield sse_frame(DoneEvent(turn_id="error"))
        finally:
            log.info("ai.chat.out client_turn=%s frames=%d", body.client_turn_id, n)

    return StreamingResponse(gen(), media_type="text/event-stream")
