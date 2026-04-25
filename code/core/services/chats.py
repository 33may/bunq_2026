"""Chat service — DB writes + in-process pub/sub broker for WebSocket fan-out.

Three thread shapes share one table; this module hides that detail behind
a small API:

    save_message(...)                   → ChatMessage
    list_thread(...)                    → [ChatMessage]
    mark_read(...)                      → int (rows updated)
    recipients_for(...)                 → [user_id]   # for fan-out
    dm_thread_key(a_id, b_id)           → str        # canonical key

Broker:
    subscribe(user_id) → asyncio.Queue
    unsubscribe(user_id, queue)
    publish(message, *, sender_name)    # fans out to recipients + sender

The broker is process-local — fine for a single-process dev/demo; swap
for redis pub/sub if we ever scale out.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from ..data.models import (
    ChatAttachmentKind,
    ChatMessage,
    ChatThreadKind,
    Split,
    SplitRequest,
    User,
)

log = logging.getLogger(__name__)


# ── thread keys ────────────────────────────────────────────────────────
def dm_thread_key(user_a_id: str, user_b_id: str) -> str:
    """Canonical key for a 1:1 DM — sorted user ids joined by '|'.

    Both directions resolve to the same key so a single thread holds the
    whole conversation regardless of who opened it first.
    """
    a, b = sorted([user_a_id, user_b_id])
    return f"{a}|{b}"


def parse_dm_thread_key(key: str) -> tuple[str, str] | None:
    parts = key.split("|")
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


# ── ACL ─────────────────────────────────────────────────────────────────
def _is_participant(
    db: Session, *, kind: ChatThreadKind, key: str, user_id: str,
) -> bool:
    """True iff `user_id` is allowed to read/write this thread."""
    if kind == ChatThreadKind.dm:
        ids = parse_dm_thread_key(key)
        return bool(ids and user_id in ids)
    if kind == ChatThreadKind.split:
        s = db.query(Split).filter_by(id=key).first()
        if s is None:
            return False
        if s.payer_id == user_id:
            return True
        return any(r.debtor_id == user_id for r in s.requests)
    if kind == ChatThreadKind.split_request:
        r = db.query(SplitRequest).filter_by(id=key).first()
        if r is None:
            return False
        s = db.query(Split).filter_by(id=r.split_id).first()
        if s is None:
            return False
        return user_id in (s.payer_id, r.debtor_id)
    return False


def recipients_for(
    db: Session, *, kind: ChatThreadKind, key: str, sender_id: str,
) -> list[str]:
    """Everyone who should receive the WS push for this message — excludes
    the sender (they get an echo separately so their own client updates).
    """
    if kind == ChatThreadKind.dm:
        ids = parse_dm_thread_key(key)
        if not ids:
            return []
        return [uid for uid in ids if uid != sender_id]
    if kind == ChatThreadKind.split:
        s = db.query(Split).filter_by(id=key).first()
        if s is None:
            return []
        out = {s.payer_id}
        out.update(r.debtor_id for r in s.requests)
        out.discard(sender_id)
        return list(out)
    if kind == ChatThreadKind.split_request:
        r = db.query(SplitRequest).filter_by(id=key).first()
        if r is None:
            return []
        s = db.query(Split).filter_by(id=r.split_id).first()
        if s is None:
            return []
        return [uid for uid in (s.payer_id, r.debtor_id) if uid != sender_id]
    return []


# ── reads / writes ──────────────────────────────────────────────────────
def save_message(
    db: Session,
    *,
    house_id: str,
    sender_id: str,
    kind: ChatThreadKind,
    key: str,
    body: str,
    attachment_kind: ChatAttachmentKind | None = None,
    attachment_id: str | None = None,
) -> ChatMessage:
    """Persist a message after ACL'ing the sender. Returns the row."""
    if not _is_participant(db, kind=kind, key=key, user_id=sender_id):
        raise PermissionError("sender is not a participant of this thread")
    if not body or not body.strip():
        raise ValueError("body is empty")
    msg = ChatMessage(
        house_id=house_id,
        sender_id=sender_id,
        thread_kind=kind,
        thread_key=key,
        body=body.strip(),
        attachment_kind=attachment_kind,
        attachment_id=attachment_id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def list_thread(
    db: Session,
    *,
    house_id: str,
    user_id: str,
    kind: ChatThreadKind,
    key: str,
    limit: int = 200,
) -> list[ChatMessage]:
    """All messages in this thread, oldest → newest. ACL'd."""
    if not _is_participant(db, kind=kind, key=key, user_id=user_id):
        raise PermissionError("user is not a participant of this thread")
    q = (
        db.query(ChatMessage)
        .filter(ChatMessage.house_id == house_id)
        .filter(ChatMessage.thread_kind == kind)
        .filter(ChatMessage.thread_key == key)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return list(q)


def mark_read(
    db: Session,
    *,
    house_id: str,
    user_id: str,
    kind: ChatThreadKind,
    key: str,
) -> int:
    """Flip `read=True` on every incoming message in this thread (sender !=
    user_id). Returns rows updated. No-op if not a participant.
    """
    if not _is_participant(db, kind=kind, key=key, user_id=user_id):
        return 0
    q = (
        db.query(ChatMessage)
        .filter(ChatMessage.house_id == house_id)
        .filter(ChatMessage.thread_kind == kind)
        .filter(ChatMessage.thread_key == key)
        .filter(ChatMessage.sender_id != user_id)
        .filter(ChatMessage.read.is_(False))
    )
    count = q.update({ChatMessage.read: True}, synchronize_session=False)
    db.commit()
    return count


# ── broker ──────────────────────────────────────────────────────────────
# subscribers: user_id → set[asyncio.Queue]. Each open WebSocket gets one
# queue. publish() drops the message into every queue for every recipient
# (and the sender, so their other devices update too).
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)


def subscribe(user_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=256)
    _subscribers[user_id].add(q)
    return q


def unsubscribe(user_id: str, q: asyncio.Queue) -> None:
    _subscribers.get(user_id, set()).discard(q)
    if not _subscribers.get(user_id):
        _subscribers.pop(user_id, None)


def publish(
    db: Session,
    msg: ChatMessage,
    *,
    sender_name: str | None = None,
) -> None:
    """Compute recipients and push the wire envelope into every subscriber
    queue. Safe to call from sync code (queues are bounded; full → drop).
    """
    targets = set(recipients_for(
        db, kind=msg.thread_kind, key=msg.thread_key, sender_id=msg.sender_id,
    ))
    targets.add(msg.sender_id)  # echo to sender's own other tabs
    envelope = _to_wire(msg, sender_name=sender_name)
    for uid in targets:
        for q in list(_subscribers.get(uid, ())):
            try:
                q.put_nowait(envelope)
            except asyncio.QueueFull:
                log.warning("chat: dropping push for user=%s (queue full)", uid)


def _to_wire(msg: ChatMessage, *, sender_name: str | None) -> dict:
    return {
        "type": "chat.new",
        "message": {
            "id": msg.id,
            "house_id": msg.house_id,
            "sender_id": msg.sender_id,
            "sender_name": sender_name,
            "thread_kind": msg.thread_kind.value if isinstance(msg.thread_kind, ChatThreadKind) else msg.thread_kind,
            "thread_key": msg.thread_key,
            "body": msg.body,
            "read": msg.read,
            "attachment_kind": (
                msg.attachment_kind.value
                if isinstance(msg.attachment_kind, ChatAttachmentKind)
                else msg.attachment_kind
            ),
            "attachment_id": msg.attachment_id,
            "created_at": _iso(msg.created_at),
        },
    }


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# ── name helpers (for wire envelope) ───────────────────────────────────
def name_for(db: Session, user_id: str) -> str | None:
    u = db.query(User).filter_by(id=user_id).first()
    return u.name if u else None


def names_for(db: Session, ids: Iterable[str]) -> dict[str, str]:
    rows = db.query(User).filter(User.id.in_(set(ids))).all()
    return {u.id: u.name for u in rows}
