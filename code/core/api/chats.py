"""Chat endpoints — REST + WebSocket.

REST:
    GET  /chats?peer_id=...                            → DM history with peer
    GET  /chats?kind=split&key=<split_id>              → split thread history
    GET  /chats?kind=split_request&key=<req_id>        → request thread history
    POST /chats   { body, peer_id?, kind?, key?, attachment_kind?, attachment_id? }
    POST /chats/read { kind, key }                     → mark thread read

WebSocket:
    WS   /ws/chats   (cookie-authed)                   → push every new message
                                                          for any thread the
                                                          user participates in.

Wire envelope (server → client):
    { type: "chat.new", message: { ...message fields, sender_name } }
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from fastapi import (
    APIRouter, Cookie, Depends, HTTPException, Query, WebSocket,
    WebSocketDisconnect, status,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..data import SessionLocal
from ..data.models import (
    ChatAttachmentKind, ChatMessage, ChatThreadKind, House, HouseMember, User,
)
from ..services import chats as chat_svc
from .deps import current_house, current_user, get_db

log = logging.getLogger("bunq.chat")

router = APIRouter(tags=["chat"])


# ── schemas ────────────────────────────────────────────────────────────
class ChatMessageOut(BaseModel):
    id: str
    house_id: str
    sender_id: str
    sender_name: str | None = None
    thread_kind: str
    thread_key: str
    body: str
    read: bool
    attachment_kind: str | None = None
    attachment_id: str | None = None
    created_at: datetime


class ChatSendIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    # exactly one of these two routes must be specified
    peer_id: str | None = None
    kind: str | None = None        # 'split' | 'split_request'
    key: str | None = None
    # optional inline attachment (DM only — UI ignores in ref threads)
    attachment_kind: str | None = None  # 'split' | 'split_request'
    attachment_id: str | None = None


class ChatMarkReadIn(BaseModel):
    kind: str          # 'dm' | 'split' | 'split_request'
    key: str           # for dm: peer_id (we canonicalize); else thread key


# ── helpers ────────────────────────────────────────────────────────────
def _resolve_thread(
    db: Session, *, me: User, peer_id: str | None, kind: str | None, key: str | None,
) -> tuple[ChatThreadKind, str]:
    """Pick (kind, key) from caller's request shape. peer_id wins if set."""
    if peer_id is not None:
        if peer_id == me.id:
            raise HTTPException(400, "cannot DM yourself")
        # peer must share a house with me
        my_house_ids = [
            r.house_id for r in
            db.query(HouseMember).filter(HouseMember.user_id == me.id).all()
        ]
        peer_in_my_house = (
            db.query(HouseMember)
            .filter(HouseMember.user_id == peer_id)
            .filter(HouseMember.house_id.in_(my_house_ids))
            .first()
        ) is not None
        if not peer_in_my_house:
            raise HTTPException(404, "peer not in your house")
        return ChatThreadKind.dm, chat_svc.dm_thread_key(me.id, peer_id)
    if not kind or not key:
        raise HTTPException(400, "must supply peer_id, or kind+key")
    try:
        tk = ChatThreadKind(kind)
    except ValueError:
        raise HTTPException(400, f"unknown kind: {kind}")
    if tk == ChatThreadKind.dm:
        # DM via raw key — peer_id should have been used; reject for safety.
        raise HTTPException(400, "use peer_id for dm threads")
    return tk, key


def _msg_out(m: ChatMessage, *, sender_name: str | None) -> ChatMessageOut:
    return ChatMessageOut(
        id=m.id,
        house_id=m.house_id,
        sender_id=m.sender_id,
        sender_name=sender_name,
        thread_kind=m.thread_kind.value if isinstance(m.thread_kind, ChatThreadKind) else m.thread_kind,
        thread_key=m.thread_key,
        body=m.body,
        read=m.read,
        attachment_kind=(
            m.attachment_kind.value
            if isinstance(m.attachment_kind, ChatAttachmentKind)
            else m.attachment_kind
        ),
        attachment_id=m.attachment_id,
        created_at=m.created_at,
    )


# ── REST ───────────────────────────────────────────────────────────────
@router.get("/chats", response_model=list[ChatMessageOut])
def list_chats(
    peer_id: Optional[str] = Query(default=None),
    kind: Optional[str] = Query(default=None),
    key: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> list[ChatMessageOut]:
    tk, tkey = _resolve_thread(db, me=me, peer_id=peer_id, kind=kind, key=key)
    try:
        msgs = chat_svc.list_thread(
            db, house_id=house.id, user_id=me.id, kind=tk, key=tkey, limit=limit,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e))
    name_by_id = chat_svc.names_for(db, [m.sender_id for m in msgs])
    return [_msg_out(m, sender_name=name_by_id.get(m.sender_id)) for m in msgs]


@router.post("/chats", response_model=ChatMessageOut, status_code=201)
def send_chat(
    body: ChatSendIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> ChatMessageOut:
    tk, tkey = _resolve_thread(db, me=me, peer_id=body.peer_id, kind=body.kind, key=body.key)
    att_kind = None
    if body.attachment_kind:
        try:
            att_kind = ChatAttachmentKind(body.attachment_kind)
        except ValueError:
            raise HTTPException(400, f"unknown attachment_kind: {body.attachment_kind}")
    try:
        msg = chat_svc.save_message(
            db,
            house_id=house.id, sender_id=me.id, kind=tk, key=tkey,
            body=body.body,
            attachment_kind=att_kind, attachment_id=body.attachment_id,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    chat_svc.publish(db, msg, sender_name=me.name)
    return _msg_out(msg, sender_name=me.name)


@router.post("/chats/read", status_code=204)
def mark_read(
    body: ChatMarkReadIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
):
    if body.kind == "dm":
        # Caller passes the peer_id as `key`; canonicalize on the way in.
        if body.key == me.id:
            raise HTTPException(400, "cannot mark a self-thread")
        tk = ChatThreadKind.dm
        tkey = chat_svc.dm_thread_key(me.id, body.key)
    else:
        try:
            tk = ChatThreadKind(body.kind)
        except ValueError:
            raise HTTPException(400, f"unknown kind: {body.kind}")
        tkey = body.key
    chat_svc.mark_read(db, house_id=house.id, user_id=me.id, kind=tk, key=tkey)
    return  # 204


# ── WebSocket ──────────────────────────────────────────────────────────
@router.websocket("/ws/chats")
async def ws_chats(
    websocket: WebSocket,
    bunq_user: str | None = Cookie(default=None),
):
    """Single user-level socket. Pushes every chat.new event for any thread
    the connected user participates in. Auth via the same `bunq_user`
    cookie REST uses.
    """
    if not bunq_user:
        await websocket.close(code=1008)  # policy violation
        return
    db = SessionLocal()
    try:
        me = db.query(User).filter_by(bunq_label=bunq_user).first()
        if me is None:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        q = chat_svc.subscribe(me.id)
        log.info("ws.connect user=%s", me.id)
        try:
            while True:
                # Race the broker queue against an inbound client message
                # (we currently ignore inbound — sends go via REST). This
                # also lets us notice the client closing.
                receive_task = asyncio.create_task(websocket.receive_text())
                push_task = asyncio.create_task(q.get())
                done, pending = await asyncio.wait(
                    {receive_task, push_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                if push_task in done:
                    envelope = push_task.result()
                    await websocket.send_json(envelope)
                if receive_task in done:
                    # If the receive raised, the client is gone.
                    try:
                        receive_task.result()
                    except WebSocketDisconnect:
                        break
                    except Exception:
                        break
        finally:
            chat_svc.unsubscribe(me.id, q)
            log.info("ws.disconnect user=%s", me.id)
    finally:
        db.close()
