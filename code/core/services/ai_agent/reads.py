"""Read-only accessors used by the agent's read tools.

All functions take an explicit (db, house_id, user_id) — no implicit context,
no global state. Tools in tools.py wrap these as @tool definitions.

Returns plain JSON-able dicts (no SQLAlchemy objects leak out).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ...data.models import (
    ChatMessage, ChatThreadKind, FeedComment, FeedPost,
    HouseMember, Split, SplitRequest, SplitRequestStatus, User,
)
from ..chats import dm_thread_key, parse_dm_thread_key


def _split_dict(split: Split, name_by_id: dict[str, str]) -> dict:
    pending = accepted = failed = 0
    requests = []
    for r in split.requests:
        if r.status == SplitRequestStatus.pending:
            pending += 1
        elif r.status == SplitRequestStatus.accepted:
            accepted += 1
        elif r.status in (SplitRequestStatus.failed, SplitRequestStatus.rejected,
                          SplitRequestStatus.revoked):
            failed += 1
        requests.append({
            "id": r.id,
            "debtor": {"id": r.debtor_id, "name": name_by_id.get(r.debtor_id, "?")},
            "amount": str(r.amount),
            "currency": r.currency,
            "status": r.status.value,
        })
    settled = bool(split.requests) and pending == 0 and failed == 0
    return {
        "id": split.id,
        "title": split.title,
        "note": split.note,
        "payer": {"id": split.payer_id,
                  "name": name_by_id.get(split.payer_id, "?")},
        "total": str(split.total),
        "currency": split.currency,
        "parent_post_id": split.parent_post_id,
        "source_scan_id": split.source_scan_id,
        "requests": requests,
        "settled": settled,
        "n_pending": pending,
        "n_accepted": accepted,
        "n_failed": failed,
        "created_at": split.created_at.isoformat() if split.created_at else None,
    }


def _name_lookup(db: Session, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = db.query(User).filter(User.id.in_(ids)).all()
    return {u.id: u.name for u in rows}


def list_splits(
    db: Session, *, house_id: str, user_id: str, mine_only: bool = True,
) -> list[dict]:
    q = db.query(Split).filter(Split.house_id == house_id)
    if mine_only:
        my_ids = {
            r.split_id for r in db.query(SplitRequest)
            .filter(SplitRequest.debtor_id == user_id).all()
        }
        q = q.filter((Split.payer_id == user_id) | Split.id.in_(my_ids))
    splits = q.order_by(Split.created_at.desc()).all()
    ids: set[str] = set()
    for s in splits:
        ids.add(s.payer_id)
        for r in s.requests:
            ids.add(r.debtor_id)
    names = _name_lookup(db, ids)
    return [_split_dict(s, names) for s in splits]


def get_split(db: Session, *, house_id: str, split_id: str) -> dict | None:
    s = db.query(Split).filter_by(id=split_id, house_id=house_id).first()
    if s is None:
        return None
    ids = {s.payer_id} | {r.debtor_id for r in s.requests}
    return _split_dict(s, _name_lookup(db, ids))


def list_housemates(db: Session, *, house_id: str) -> list[dict]:
    rows = (
        db.query(User)
        .join(HouseMember, HouseMember.user_id == User.id)
        .filter(HouseMember.house_id == house_id)
        .all()
    )
    return [{"id": u.id, "name": u.name, "bunq_label": u.bunq_label} for u in rows]


def get_housemate(
    db: Session, *, house_id: str, name_or_id: str,
) -> dict | None:
    n = (name_or_id or "").strip()
    if not n:
        return None
    candidates = list_housemates(db, house_id=house_id)
    # exact id first, then case-insensitive name
    for m in candidates:
        if m["id"] == n:
            return m
    nl = n.lower()
    for m in candidates:
        if m["name"].lower() == nl:
            return m
    return None


def get_balance_with(
    db: Session, *, house_id: str, user_id: str, name_or_id: str,
) -> dict | None:
    """Net amount with one counterparty (positive = they owe me).

    Excludes accepted/settled requests so the balance reflects what's still
    open — same convention the home Requests section uses.
    """
    other = get_housemate(db, house_id=house_id, name_or_id=name_or_id)
    if other is None:
        return None
    breakdown: list[dict] = []
    net = Decimal("0.00")
    splits = (
        db.query(Split)
        .filter(Split.house_id == house_id)
        .filter((Split.payer_id == user_id) | (Split.payer_id == other["id"]))
        .all()
    )
    for s in splits:
        for r in s.requests:
            if r.status in (SplitRequestStatus.accepted, SplitRequestStatus.revoked,
                            SplitRequestStatus.rejected):
                continue
            if s.payer_id == user_id and r.debtor_id == other["id"]:
                net += r.amount
                breakdown.append({"split_id": s.id, "title": s.title,
                                  "amount": str(r.amount), "direction": "incoming"})
            elif s.payer_id == other["id"] and r.debtor_id == user_id:
                net -= r.amount
                breakdown.append({"split_id": s.id, "title": s.title,
                                  "amount": str(r.amount), "direction": "outgoing"})
    return {
        "counterparty": {"id": other["id"], "name": other["name"]},
        "net_amount": str(net.quantize(Decimal("0.01"))),
        "currency": "EUR",
        "breakdown": breakdown,
    }


def list_balances(
    db: Session, *, house_id: str, user_id: str,
) -> list[dict]:
    """One row per housemate with non-zero net.

    Positive `net_amount` ⇒ they owe me; negative ⇒ I owe them.
    Skips housemates with a flat balance and the current user.
    """
    mates = list_housemates(db, house_id=house_id)
    out: list[dict] = []
    for m in mates:
        if m["id"] == user_id:
            continue
        bal = get_balance_with(
            db, house_id=house_id, user_id=user_id, name_or_id=m["id"],
        )
        if bal is None:
            continue
        net = Decimal(bal["net_amount"])
        if net == 0:
            continue
        out.append({
            "counterparty": bal["counterparty"],
            "net_amount": bal["net_amount"],
            "currency": bal["currency"],
            "direction": "they_owe_me" if net > 0 else "i_owe_them",
        })
    out.sort(key=lambda r: abs(Decimal(r["net_amount"])), reverse=True)
    return out


def list_payments_with(
    db: Session, *, house_id: str, user_id: str, name_or_id: str,
    count: int = 20,
) -> list[dict]:
    """Recent settled SplitRequests between me and the named counterparty.

    Backend bunq `payment` endpoint is rate-limited and flaky; for the agent
    flow the more useful "transactions with X" answer is the per-request
    history (which is local DB data and always available).
    """
    other = get_housemate(db, house_id=house_id, name_or_id=name_or_id)
    if other is None:
        return []
    rows = (
        db.query(SplitRequest, Split)
        .join(Split, Split.id == SplitRequest.split_id)
        .filter(Split.house_id == house_id)
        .filter(or_(
            and_(Split.payer_id == user_id, SplitRequest.debtor_id == other["id"]),
            and_(Split.payer_id == other["id"], SplitRequest.debtor_id == user_id),
        ))
        .order_by(SplitRequest.created_at.desc())
        .limit(count)
        .all()
    )
    out: list[dict] = []
    for r, s in rows:
        out.append({
            "request_id": r.id,
            "split_title": s.title,
            "direction": "incoming" if s.payer_id == user_id else "outgoing",
            "amount": str(r.amount),
            "currency": r.currency,
            "status": r.status.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return out


def list_posts(db: Session, *, house_id: str, limit: int = 10) -> list[dict]:
    rows = (
        db.query(FeedPost)
        .filter(FeedPost.house_id == house_id)
        .order_by(FeedPost.created_at.desc())
        .limit(max(1, min(int(limit or 10), 50)))
        .all()
    )
    if not rows:
        return []
    author_ids = {p.author_id for p in rows}
    names = _name_lookup(db, author_ids)
    out: list[dict] = []
    for p in rows:
        out.append({
            "id": p.id,
            "text": p.text,
            "author": {"id": p.author_id, "name": names.get(p.author_id, "?")},
            "comment_count": len(p.comments) if p.comments is not None else 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return out


def get_post(db: Session, *, house_id: str, post_id: str) -> dict | None:
    p = (
        db.query(FeedPost)
        .filter(FeedPost.id == post_id, FeedPost.house_id == house_id)
        .first()
    )
    if p is None:
        return None
    ids = {p.author_id} | {c.author_id for c in p.comments}
    names = _name_lookup(db, ids)
    return {
        "id": p.id,
        "text": p.text,
        "author": {"id": p.author_id, "name": names.get(p.author_id, "?")},
        "comments": [{
            "id": c.id,
            "author": {"id": c.author_id, "name": names.get(c.author_id, "?")},
            "text": c.text,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        } for c in p.comments],
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def list_unread(
    db: Session, *, house_id: str, user_id: str,
) -> dict:
    """Unread DMs + split chats + feed comments for the current user.

    Returns:
      {
        "dms":             [{peer:{id,name}, last_text, count, last_at}],
        "split_threads":   [{split_id, title, last_text, count, last_at}],
        "request_threads": [{request_id, split_title, last_text, count, last_at}],
        "post_replies":    [{post_id, post_text, comments:[{author,text,at}]}]
      }

    DM/split: uses ChatMessage.read flag for messages NOT sent by me.
    Feed comments: returns posts where I'm the author and someone else
    commented after my own latest comment (no read-state stored — best
    effort for the catch-up flow).
    """
    out: dict[str, list] = {
        "dms": [], "split_threads": [],
        "request_threads": [], "post_replies": [],
    }

    # 1. DM unread — group by peer
    dm_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.house_id == house_id)
        .filter(ChatMessage.thread_kind == ChatThreadKind.dm)
        .filter(ChatMessage.read.is_(False))
        .filter(ChatMessage.sender_id != user_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    by_peer: dict[str, list[ChatMessage]] = {}
    for m in dm_rows:
        pair = parse_dm_thread_key(m.thread_key)
        if pair is None or user_id not in pair:
            continue
        peer_id = pair[0] if pair[1] == user_id else pair[1]
        by_peer.setdefault(peer_id, []).append(m)
    if by_peer:
        names = _name_lookup(db, set(by_peer.keys()))
        for peer_id, msgs in by_peer.items():
            last = msgs[-1]
            out["dms"].append({
                "peer": {"id": peer_id, "name": names.get(peer_id, "?")},
                "count": len(msgs),
                "last_text": last.body[:160],
                "last_at": last.created_at.isoformat() if last.created_at else None,
            })

    # 2. Split-thread unread — only if I'm a participant of the split
    split_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.house_id == house_id)
        .filter(ChatMessage.thread_kind == ChatThreadKind.split)
        .filter(ChatMessage.read.is_(False))
        .filter(ChatMessage.sender_id != user_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    by_split: dict[str, list[ChatMessage]] = {}
    for m in split_rows:
        by_split.setdefault(m.thread_key, []).append(m)
    if by_split:
        splits = (
            db.query(Split)
            .filter(Split.id.in_(set(by_split.keys())))
            .all()
        )
        for s in splits:
            participants = {s.payer_id} | {r.debtor_id for r in s.requests}
            if user_id not in participants:
                continue
            msgs = by_split.get(s.id, [])
            if not msgs:
                continue
            last = msgs[-1]
            out["split_threads"].append({
                "split_id": s.id,
                "title": s.title,
                "count": len(msgs),
                "last_text": last.body[:160],
                "last_at": last.created_at.isoformat() if last.created_at else None,
            })

    # 3. Split-request unread — payer + debtor only
    sr_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.house_id == house_id)
        .filter(ChatMessage.thread_kind == ChatThreadKind.split_request)
        .filter(ChatMessage.read.is_(False))
        .filter(ChatMessage.sender_id != user_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    by_req: dict[str, list[ChatMessage]] = {}
    for m in sr_rows:
        by_req.setdefault(m.thread_key, []).append(m)
    if by_req:
        reqs = (
            db.query(SplitRequest, Split)
            .join(Split, Split.id == SplitRequest.split_id)
            .filter(SplitRequest.id.in_(set(by_req.keys())))
            .all()
        )
        for r, s in reqs:
            if user_id not in (s.payer_id, r.debtor_id):
                continue
            msgs = by_req.get(r.id, [])
            if not msgs:
                continue
            last = msgs[-1]
            out["request_threads"].append({
                "request_id": r.id,
                "split_title": s.title,
                "count": len(msgs),
                "last_text": last.body[:160],
                "last_at": last.created_at.isoformat() if last.created_at else None,
            })

    # 4. Feed-comment replies on my posts since my last interaction.
    my_posts = (
        db.query(FeedPost)
        .filter(FeedPost.house_id == house_id, FeedPost.author_id == user_id)
        .all()
    )
    for p in my_posts:
        # Boundary: my own latest activity in this thread (post creation OR
        # any comment I've made since). Anything by others after that is unread.
        my_last = p.created_at
        for c in p.comments:
            if c.author_id == user_id and c.created_at and c.created_at > my_last:
                my_last = c.created_at
        new_comments = [
            c for c in p.comments
            if c.author_id != user_id and c.created_at and c.created_at > my_last
        ]
        if not new_comments:
            continue
        ids = {c.author_id for c in new_comments}
        names = _name_lookup(db, ids)
        out["post_replies"].append({
            "post_id": p.id,
            "post_text": p.text[:120],
            "comments": [{
                "author": {"id": c.author_id, "name": names.get(c.author_id, "?")},
                "text": c.text[:160],
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in new_comments],
        })

    return out


def list_requests_with(
    db: Session, *, house_id: str, user_id: str, name_or_id: str,
    status: str = "pending",
) -> list[dict]:
    other = get_housemate(db, house_id=house_id, name_or_id=name_or_id)
    if other is None:
        return []
    out: list[dict] = []
    splits = (
        db.query(Split)
        .filter(Split.house_id == house_id)
        .filter((Split.payer_id == user_id) | (Split.payer_id == other["id"]))
        .all()
    )
    for s in splits:
        for r in s.requests:
            if status == "pending" and r.status != SplitRequestStatus.pending:
                continue
            if s.payer_id == user_id and r.debtor_id == other["id"]:
                direction = "incoming"
            elif s.payer_id == other["id"] and r.debtor_id == user_id:
                direction = "outgoing"
            else:
                continue  # not between user and other
            out.append({
                "request_id": r.id,
                "split_id": s.id,
                "split_title": s.title,
                "direction": direction,
                "counterparty": {"id": other["id"], "name": other["name"]},
                "amount": str(r.amount),
                "currency": r.currency,
                "status": r.status.value,
                "settled": r.status == SplitRequestStatus.accepted,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
    return out
