"""Finalize a parsed scan into a Split + per-debtor SplitRequests.

Validates that every line item has an assignment, computes per-user totals
across line items (handling the literal ``"everyone"`` token), then calls
``services.splits.create_split`` which:
  • inserts the Split + draft SplitRequests
  • fires one bunq request-inquiry per non-payer
  • commits

The Scan is flipped to finalized + linked to the new Split. Per-request
failures land on ``SplitRequest.status = failed`` and don't abort the others.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from ..data.models import Scan, ScanLineItem, ScanStatus, Split, User
from .splits import create_split


class FinalizeError(ValueError):
    """Raised when the scan can't be finalized (e.g. missing assignments)."""


def _round(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _compute_shares(
    *,
    line_items: list[ScanLineItem],
    payer_id: str,
) -> tuple[dict[str, Decimal], list[str]]:
    """Return ``(shares, participant_ids)`` — shares includes the payer's own
    portion (used for total reconciliation) but ``participant_ids`` lists
    every user the receipt touches, including the payer.
    """
    explicit = {
        li.assigned_to for li in line_items
        if li.assigned_to and li.assigned_to != "everyone"
    }
    participants = sorted(explicit | {payer_id})

    shares: dict[str, Decimal] = {uid: Decimal("0.00") for uid in participants}

    for li in line_items:
        line_total = _round(Decimal(li.price) * Decimal(li.quantity or 1))
        if li.assigned_to == "everyone":
            per = _round(line_total / Decimal(len(participants)))
            for uid in participants:
                shares[uid] += per
            allocated = per * Decimal(len(participants))
            shares[payer_id] += line_total - allocated
        elif li.assigned_to:
            shares[li.assigned_to] += line_total
        else:
            shares[payer_id] += line_total

    return {uid: _round(amt) for uid, amt in shares.items()}, participants


def finalize_scan(session: Session, scan: Scan, *, parent_post_id: str | None = None) -> Split:
    """Turn ``scan`` into a persisted ``Split`` + bunq requests. Commits."""
    if scan.status != ScanStatus.parsed:
        raise FinalizeError(f"scan is {scan.status.value}, expected parsed")

    line_items = list(scan.line_items)
    if not line_items:
        raise FinalizeError("scan has no line items")

    unassigned = [li for li in line_items if not li.assigned_to]
    if unassigned:
        raise FinalizeError(f"{len(unassigned)} line item(s) still unassigned")

    shares, participant_ids = _compute_shares(
        line_items=line_items, payer_id=scan.user_id,
    )
    total = _round(sum(shares.values(), Decimal("0.00")))

    payer = session.query(User).filter_by(id=scan.user_id).one()
    participants = (
        session.query(User).filter(User.id.in_(participant_ids)).all()
    )

    split = create_split(
        session,
        house_id=scan.house_id,
        payer=payer,
        participants=participants,
        total=total,
        title=scan.merchant or scan.merchant_suggested or "expense",
        description=scan.description or scan.description_suggested,
        currency=scan.currency,
        source_scan_id=scan.id,
        shares=shares,
        parent_post_id=parent_post_id,
    )

    scan.status = ScanStatus.finalized
    scan.split_id = split.id
    scan.finalized_at = datetime.utcnow()
    session.commit()
    session.refresh(split)
    return split
