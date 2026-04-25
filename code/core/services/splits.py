"""Shared 'create a split' service.

Used by every entry point that materialises a Split + its request-inquiries:
  • POST /splits              — manual form
  • POST /requests            — single-debtor wrapper
  • POST /scans/{id}/finalize — receipt-driven
  • POST /posts/{id}/split    — feed-driven

Behaviour:
  1. Persist a ``Split`` with the given metadata.
  2. Insert one ``SplitRequest`` per non-payer participant in ``draft``.
  3. Try to fire a bunq request-inquiry per draft. On success, stamp
     ``bunq_request_id`` + status=pending. On failure, status=failed +
     ``error``. Per-request failures don't abort siblings.
  4. Commit and return the Split (caller can inspect ``requests[*].status``
     to decide whether to surface a partial-failure toast).
"""
from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

from sqlalchemy.orm import Session

from ..bunq_client import BunqClient
from ..data.models import Split, SplitRequest, SplitRequestStatus, User
from .bunq import get_bunq_client

log = logging.getLogger(__name__)


def equal_shares(total: Decimal, n: int) -> list[Decimal]:
    """Split ``total`` into ``n`` 2-dp shares; rounding residue → index 0."""
    if n <= 0:
        return []
    per = (total / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    shares = [per] * n
    residue = total - per * n
    shares[0] = (shares[0] + residue).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return shares


def _send_request_inquiry(
    *,
    client: BunqClient,
    payer: User,
    debtor: User,
    amount: Decimal,
    description: str,
) -> tuple[int | None, str | None]:
    """Returns (bunq_request_id, error_message). Exactly one is None."""
    if not payer.bunq_label:
        return None, "payer has no bunq_label"
    if not debtor.email:
        return None, "debtor has no bunq email alias"
    try:
        res = client.send_payment_request(
            from_label=payer.bunq_label,
            to_email=debtor.email,
            amount_eur=float(amount),
            description=description,
        )
        for item in res.get("Response", []):
            if "Id" in item:
                return item["Id"].get("id"), None
        return None, "bunq response missing Id wrapper"
    except Exception as e:
        log.warning("bunq request-inquiry failed (%s → %s): %s",
                    payer.bunq_label, debtor.email, e)
        return None, str(e)


def create_split(
    db: Session,
    *,
    house_id: str,
    payer: User,
    participants: Iterable[User],
    total: Decimal,
    title: str,
    description: str | None = None,
    currency: str = "EUR",
    parent_post_id: str | None = None,
    source_scan_id: str | None = None,
    shares: dict[str, Decimal] | None = None,
) -> Split:
    """Persist a ``Split`` + N ``SplitRequest``s and fire bunq for each.

    ``participants`` may include the payer — they're filtered out before
    requests are issued. ``shares`` (optional) is a map ``user_id → amount``
    overriding the equal-split default (used by finalize_scan, where line
    items dictate per-person totals).
    """
    # 1) dedup participants, drop payer (no self-request)
    seen: set[str] = set()
    debtors: list[User] = []
    for u in participants:
        if u.id == payer.id or u.id in seen:
            continue
        seen.add(u.id)
        debtors.append(u)

    if not debtors:
        # Nothing to bill — caller probably wanted to log an expense paid
        # entirely by the payer; we still create a Split so it appears in
        # history with total + zero requests.
        pass

    # 2) compute per-debtor amounts
    if shares is None:
        amounts = equal_shares(total, len(debtors))
        per_debtor = {d.id: a for d, a in zip(debtors, amounts)}
    else:
        per_debtor = {d.id: shares.get(d.id, Decimal("0.00")) for d in debtors}

    # 3) insert rows in `draft`
    note = (description or title or "").strip() or None
    split = Split(
        house_id=house_id,
        payer_id=payer.id,
        title=title.strip() or "split",
        note=note,
        total=total,
        currency=currency,
        parent_post_id=parent_post_id,
        source_scan_id=source_scan_id,
    )
    db.add(split)
    db.flush()

    drafts: list[tuple[SplitRequest, User]] = []
    for d in debtors:
        sr = SplitRequest(
            split_id=split.id,
            debtor_id=d.id,
            amount=per_debtor[d.id],
            currency=currency,
            status=SplitRequestStatus.draft,
        )
        db.add(sr)
        drafts.append((sr, d))
    db.flush()

    # 4) fire bunq one by one. (Sync — caller already runs us in a thread
    # pool when invoked from an async route. Keeping it sync makes finalize
    # / posts / CLI uses straightforward.)
    client = get_bunq_client()
    desc_for_bunq = (note or split.title)[:140]  # bunq enforces a length cap
    for sr, debtor in drafts:
        if sr.amount <= 0:
            sr.status = SplitRequestStatus.failed
            sr.error = "non-positive amount"
            continue
        bunq_id, err = _send_request_inquiry(
            client=client, payer=payer, debtor=debtor,
            amount=sr.amount, description=desc_for_bunq,
        )
        if bunq_id is not None:
            sr.bunq_request_id = bunq_id
            sr.status = SplitRequestStatus.pending
        else:
            sr.status = SplitRequestStatus.failed
            sr.error = err

    db.commit()
    db.refresh(split)
    return split
