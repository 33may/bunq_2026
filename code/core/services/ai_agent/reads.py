"""Read-only accessors used by the agent's read tools.

All functions take an explicit (db, house_id, user_id) — no implicit context,
no global state. Tools in tools.py wrap these as @tool definitions.

Returns plain JSON-able dicts (no SQLAlchemy objects leak out).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from ...data.models import (
    HouseMember, Split, SplitRequest, SplitRequestStatus, User,
)


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
