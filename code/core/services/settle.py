"""Settle-up — net all open SplitRequests between two users, replace with one.

The intent: "settle with X" should NOT create a new request that overlaps
amounts already pending. Instead:

1. Find every open SplitRequest (status pending / failed / draft) where the
   pair is {me, peer} regardless of direction.
2. Compute the signed net from the user's POV (positive = peer owes me;
   negative = I owe peer).
3. Mark every open one as ``revoked`` locally — this hides them from the
   home Requests section / per-mate list / balance compute (which all
   exclude accepted/revoked/rejected).
   (We don't yet call bunq to revoke the live RequestInquiry; for the demo
   the local state is what drives the UI. A future improvement could fire
   bunq cancellations in a best-effort loop.)
4. Create exactly one new SplitRequest (via the existing ``create_split``
   path) for the net amount in the correct direction — this fires a real
   bunq RequestInquiry the recipient can accept.

Result shape (also what the API returns):
    {
      "net_amount":     "84.00",        # always >= 0
      "direction":      "incoming" | "outgoing" | "even",
      "closed":         3,              # how many old requests were revoked
      "new_split_id":   "<uuid>" | None,
      "new_request_id": "<uuid>" | None,
      "peer":           {"id": ..., "name": ...},
    }
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import TypedDict

from sqlalchemy.orm import Session

from ..data.models import (
    House, Split, SplitRequest, SplitRequestStatus, User,
)
from .splits import create_split

log = logging.getLogger(__name__)

_OPEN = (
    SplitRequestStatus.pending,
    SplitRequestStatus.failed,
    SplitRequestStatus.draft,
)


class SettleResult(TypedDict):
    net_amount: str
    direction: str
    closed: int
    new_split_id: str | None
    new_request_id: str | None
    peer: dict


def _open_pair(
    db: Session, *, house_id: str, me_id: str, peer_id: str,
) -> list[tuple[Split, SplitRequest, Decimal]]:
    """Returns (split, request, signed_amount_from_my_pov) for every open
    request between me and peer, in either direction."""
    splits = (
        db.query(Split)
        .filter(Split.house_id == house_id)
        .filter((Split.payer_id == me_id) | (Split.payer_id == peer_id))
        .all()
    )
    out: list[tuple[Split, SplitRequest, Decimal]] = []
    for s in splits:
        for r in s.requests:
            if r.status not in _OPEN:
                continue
            if s.payer_id == me_id and r.debtor_id == peer_id:
                out.append((s, r, Decimal(r.amount)))            # peer owes me
            elif s.payer_id == peer_id and r.debtor_id == me_id:
                out.append((s, r, -Decimal(r.amount)))           # I owe peer
    return out


def settle_up(
    db: Session, *, house: House, me: User, peer: User,
) -> SettleResult:
    if peer.id == me.id:
        raise ValueError("cannot settle with yourself")

    rows = _open_pair(db, house_id=house.id, me_id=me.id, peer_id=peer.id)
    closed = len(rows)
    net = sum((amt for _, _, amt in rows), Decimal("0.00"))

    # Already even → nothing to do beyond surfacing the no-op.
    if closed == 0 or net == Decimal("0.00"):
        # If pair has zero net but multiple non-cancelling rows still open
        # (e.g. +20 / -20 split between two requests), still revoke them so
        # the books are clean and the UI clears.
        for _, r, _ in rows:
            r.status = SplitRequestStatus.revoked
        db.commit()
        return {
            "net_amount": "0.00", "direction": "even", "closed": closed,
            "new_split_id": None, "new_request_id": None,
            "peer": {"id": peer.id, "name": peer.name},
        }

    # 1) revoke every open one in the pair — single source of truth before
    #    we create the replacement so balance compute is consistent if a
    #    later step throws.
    for _, r, _ in rows:
        r.status = SplitRequestStatus.revoked
    db.flush()

    # 2) create the replacement split — direction follows sign(net)
    if net > 0:
        new_payer, new_debtor, amount = me, peer, net
        direction = "incoming"
    else:
        new_payer, new_debtor, amount = peer, me, -net
        direction = "outgoing"

    title = f"settle up · {peer.name if new_payer is me else me.name}"
    description = f"net of {closed} request(s)"
    new_split = create_split(
        db,
        house_id=house.id,
        payer=new_payer,
        participants=[new_debtor],
        total=amount,
        title=title,
        description=description,
    )
    new_request = new_split.requests[0] if new_split.requests else None
    return {
        "net_amount": str(amount.quantize(Decimal("0.01"))),
        "direction": direction,
        "closed": closed,
        "new_split_id": new_split.id,
        "new_request_id": new_request.id if new_request else None,
        "peer": {"id": peer.id, "name": peer.name},
    }


# ── preview-only (no writes) — used by the UI to label the confirm sheet
#    and by the agent's emit_action card. Same signed-net convention.
def preview(
    db: Session, *, house: House, me: User, peer: User,
) -> dict:
    rows = _open_pair(db, house_id=house.id, me_id=me.id, peer_id=peer.id)
    net = sum((amt for _, _, amt in rows), Decimal("0.00"))
    if net > 0:
        direction = "incoming"
    elif net < 0:
        direction = "outgoing"
    else:
        direction = "even"
    return {
        "net_amount": str(abs(net).quantize(Decimal("0.01"))),
        "direction": direction,
        "open_count": len(rows),
        "peer": {"id": peer.id, "name": peer.name},
    }
