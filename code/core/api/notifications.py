"""Notifications — derived feed of recent events for the current user.

No new tables. Each call joins the last few events touching the caller from
posts, comments, splits, and split-requests, then merges them into a single
chronological list.

Read-only. Unread state lives client-side (localStorage `lastSeenNotifAt`).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..data.models import (
    FeedComment,
    FeedPost,
    House,
    Split,
    SplitRequest,
    SplitRequestStatus,
    User,
)
from .deps import current_house, current_user, get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── schemas ────────────────────────────────────────────────────────────
NotifKind = Literal["post", "reply", "request", "paid"]


class ActorOut(BaseModel):
    id: str
    name: str
    color: str
    initial: str


class NotifTarget(BaseModel):
    type: Literal["post", "split", "request"]
    id: str
    # For 'request' we also pass the parent split so the UI can route to the
    # split detail and highlight the line.
    split_id: str | None = None


class NotificationOut(BaseModel):
    id: str
    kind: NotifKind
    actor: ActorOut
    title: str
    sub: str | None = None
    created_at: datetime
    target: NotifTarget | None = None


# ── helpers ────────────────────────────────────────────────────────────
def _actor(u: User) -> ActorOut:
    return ActorOut(
        id=u.id,
        name=u.name,
        color=u.color,
        initial=(u.name[:1] or "?").upper(),
    )


def _money(amount, currency: str = "EUR") -> str:
    sym = "€" if currency.upper() == "EUR" else f"{currency} "
    # Decimal -> "12,34" in EU style to match the mock copy
    s = f"{float(amount):.2f}".replace(".", ",")
    return f"{sym}{s}"


# ── endpoint ───────────────────────────────────────────────────────────
@router.get("", response_model=list[NotificationOut])
def list_notifications(
    limit: int = 50,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> list[NotificationOut]:
    notifs: list[NotificationOut] = []

    # Cache user lookups (small house — fine to load all).
    users_by_id: dict[str, User] = {
        u.id: u for u in db.query(User).all()
    }

    def get_user(uid: str) -> User | None:
        return users_by_id.get(uid)

    # ── posts in my house, not by me ────────────────────────────────
    posts = (
        db.query(FeedPost)
        .filter(FeedPost.house_id == house.id, FeedPost.author_id != user.id)
        .order_by(FeedPost.created_at.desc())
        .limit(20)
        .all()
    )
    for p in posts:
        author = get_user(p.author_id)
        if author is None:
            continue
        snippet = (p.text or "").strip().replace("\n", " ")
        if len(snippet) > 80:
            snippet = snippet[:77] + "…"
        notifs.append(NotificationOut(
            id=f"post:{p.id}",
            kind="post",
            actor=_actor(author),
            title="started a new post",
            sub=snippet or None,
            created_at=p.created_at,
            target=NotifTarget(type="post", id=p.id),
        ))

    # ── comments on my posts (replies to me), not by me ─────────────
    my_post_ids = [
        pid for (pid,) in db.query(FeedPost.id)
        .filter(FeedPost.house_id == house.id, FeedPost.author_id == user.id)
        .all()
    ]
    if my_post_ids:
        comments = (
            db.query(FeedComment, FeedPost)
            .join(FeedPost, FeedComment.post_id == FeedPost.id)
            .filter(
                FeedComment.post_id.in_(my_post_ids),
                FeedComment.author_id != user.id,
            )
            .order_by(FeedComment.created_at.desc())
            .limit(20)
            .all()
        )
        for c, p in comments:
            author = get_user(c.author_id)
            if author is None:
                continue
            ptext = (p.text or "").strip().replace("\n", " ")
            if len(ptext) > 40:
                ptext = ptext[:37] + "…"
            csnip = (c.text or "").strip().replace("\n", " ")
            if len(csnip) > 80:
                csnip = csnip[:77] + "…"
            notifs.append(NotificationOut(
                id=f"reply:{c.id}",
                kind="reply",
                actor=_actor(author),
                title=f'replied to "{ptext}"' if ptext else "replied to your post",
                sub=csnip or None,
                created_at=c.created_at,
                target=NotifTarget(type="post", id=p.id),
            ))

    # ── split requests where I'm the debtor (someone asks me) ───────
    debtor_reqs = (
        db.query(SplitRequest, Split)
        .join(Split, SplitRequest.split_id == Split.id)
        .filter(
            Split.house_id == house.id,
            SplitRequest.debtor_id == user.id,
            SplitRequest.status.in_([
                SplitRequestStatus.pending,
                SplitRequestStatus.accepted,
                SplitRequestStatus.rejected,
            ]),
        )
        .order_by(SplitRequest.created_at.desc())
        .limit(20)
        .all()
    )
    for r, s in debtor_reqs:
        payer = get_user(s.payer_id)
        if payer is None:
            continue
        amount_str = _money(r.amount, r.currency)
        if r.status == SplitRequestStatus.pending:
            title = f"requested {amount_str}"
            kind: NotifKind = "request"
        elif r.status == SplitRequestStatus.accepted:
            title = f"you paid {payer.name} {amount_str}"
            kind = "paid"
        else:  # rejected — surface as a request still
            title = f"requested {amount_str}"
            kind = "request"
        sub = s.note or s.title
        notifs.append(NotificationOut(
            id=f"req:{r.id}:{r.status.value}",
            kind=kind,
            actor=_actor(payer),
            title=title,
            sub=sub,
            # Use updated_at for accepted so the "paid" event time is
            # when the debtor actually accepted, not when split was made.
            created_at=r.updated_at if r.status == SplitRequestStatus.accepted else r.created_at,
            target=NotifTarget(type="request", id=r.id, split_id=s.id),
        ))

    # ── split requests where I'm the payer and a debtor accepted ─────
    payer_reqs = (
        db.query(SplitRequest, Split)
        .join(Split, SplitRequest.split_id == Split.id)
        .filter(
            Split.house_id == house.id,
            Split.payer_id == user.id,
            SplitRequest.debtor_id != user.id,
            SplitRequest.status == SplitRequestStatus.accepted,
        )
        .order_by(SplitRequest.updated_at.desc())
        .limit(20)
        .all()
    )
    for r, s in payer_reqs:
        debtor = get_user(r.debtor_id)
        if debtor is None:
            continue
        amount_str = _money(r.amount, r.currency)
        notifs.append(NotificationOut(
            id=f"paid:{r.id}",
            kind="paid",
            actor=_actor(debtor),
            title=f"paid you {amount_str}",
            sub=s.note or s.title,
            created_at=r.updated_at,
            target=NotifTarget(type="request", id=r.id, split_id=s.id),
        ))

    # Newest first, deduped, capped.
    notifs.sort(key=lambda n: n.created_at, reverse=True)
    seen: set[str] = set()
    out: list[NotificationOut] = []
    for n in notifs:
        if n.id in seen:
            continue
        seen.add(n.id)
        out.append(n)
        if len(out) >= limit:
            break
    return out
