"""Split + per-debtor SplitRequest endpoints.

  POST /splits          → manual form (payer + N participants)
  POST /requests        → ergonomic single-debtor wrapper around POST /splits
  GET  /splits          → list every split in the current house
  GET  /splits/{id}     → detail view
  POST /splits/{id}/refresh → re-poll bunq for each request's status

The ``request-inquiry`` POST is fired inside ``services.splits.create_split``
so every split-creation entrypoint produces the same shape on disk.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..data.models import House, HouseMember, Split, SplitRequest, SplitRequestStatus, User
from ..services.bunq import get_bunq_client
from ..services.splits import create_split as _create_split
from .deps import current_house, current_user, get_db
from .schemas import SplitOut, SplitRequestOut

log = logging.getLogger(__name__)

router = APIRouter(tags=["splits"])


# ── shared serializer ──────────────────────────────────────────────────
def split_to_out(split: Split, *, name_by_id: dict[str, str] | None = None) -> SplitOut:
    """Materialise a Split + children into the SplitOut wire shape."""
    n_pending = n_accepted = n_failed = 0
    requests_out: list[SplitRequestOut] = []
    for r in split.requests:
        if r.status == SplitRequestStatus.pending:
            n_pending += 1
        elif r.status == SplitRequestStatus.accepted:
            n_accepted += 1
        elif r.status in (SplitRequestStatus.failed, SplitRequestStatus.rejected,
                          SplitRequestStatus.revoked):
            n_failed += 1
        requests_out.append(SplitRequestOut(
            id=r.id,
            debtor_id=r.debtor_id,
            debtor_name=name_by_id.get(r.debtor_id) if name_by_id else None,
            amount=r.amount, currency=r.currency,
            status=r.status.value,
            bunq_request_id=r.bunq_request_id,
            error=r.error,
            created_at=r.created_at, updated_at=r.updated_at,
        ))
    settled = (
        bool(split.requests) and n_pending == 0 and n_failed == 0
    ) or not split.requests
    return SplitOut(
        id=split.id, house_id=split.house_id,
        payer_id=split.payer_id,
        payer_name=name_by_id.get(split.payer_id) if name_by_id else None,
        title=split.title, note=split.note,
        total=split.total, currency=split.currency,
        parent_post_id=split.parent_post_id,
        source_scan_id=split.source_scan_id,
        created_at=split.created_at,
        requests=requests_out,
        settled=settled,
        n_pending=n_pending,
        n_accepted=n_accepted,
        n_failed=n_failed,
    )


def _name_lookup(db: Session, user_ids: set[str]) -> dict[str, str]:
    if not user_ids:
        return {}
    rows = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: u.name for u in rows}


# ── POST /splits ───────────────────────────────────────────────────────
class CreateSplitIn(BaseModel):
    payer_user_id: str = Field(..., description="Who fronted the money")
    participant_user_ids: list[str] = Field(..., min_length=1)
    total: Decimal = Field(..., gt=0)
    title: str | None = None
    description: str | None = None
    currency: str = "EUR"
    parent_post_id: str | None = None


@router.post("/splits", response_model=SplitOut)
async def post_split(
    body: CreateSplitIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    payer = db.query(User).filter_by(id=body.payer_user_id).first()
    if payer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "payer not found")
    if not payer.bunq_label:
        raise HTTPException(status.HTTP_409_CONFLICT, "payer has no bunq linkage")

    # Resolve participants (deduped) and verify they share the house.
    participants = (
        db.query(User).filter(User.id.in_(set(body.participant_user_ids))).all()
        if body.participant_user_ids else []
    )
    if len(participants) != len(set(body.participant_user_ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "one or more participants not found")
    member_ids = {
        m.user_id for m in db.query(HouseMember).filter_by(house_id=house.id).all()
    }
    for p in participants:
        if p.id not in member_ids:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"{p.name} isn't in your house")

    title = (body.title or body.description or "house split").strip() or "house split"
    split = await run_in_threadpool(
        _create_split,
        db,
        house_id=house.id, payer=payer, participants=participants,
        total=body.total, title=title, description=body.description,
        currency=body.currency,
        parent_post_id=body.parent_post_id,
    )
    return split_to_out(
        split,
        name_by_id=_name_lookup(db, {split.payer_id} | {r.debtor_id for r in split.requests}),
    )


# ── POST /requests ─────────────────────────────────────────────────────
class CreateRequestIn(BaseModel):
    """Single-debtor convenience wrapper. The signed-in user is the payer
    (i.e. the one being paid TO — they'll receive the money when accepted)."""
    to_user_id: str
    amount: Decimal = Field(..., gt=0)
    title: str | None = None
    description: str | None = None
    currency: str = "EUR"


@router.post("/requests", response_model=SplitOut)
async def post_request(
    body: CreateRequestIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    if not me.bunq_label:
        raise HTTPException(status.HTTP_409_CONFLICT, "you have no bunq linkage")
    debtor = db.query(User).filter_by(id=body.to_user_id).first()
    if debtor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "recipient not found")

    # Reuse the shared service — a request is just a 1-debtor split.
    title = (body.title or body.description or "house request").strip() or "house request"
    split = await run_in_threadpool(
        _create_split,
        db,
        house_id=house.id, payer=me, participants=[debtor],
        total=body.amount, title=title, description=body.description,
        currency=body.currency,
    )
    return split_to_out(
        split,
        name_by_id=_name_lookup(db, {split.payer_id} | {r.debtor_id for r in split.requests}),
    )


# ── GET /splits ────────────────────────────────────────────────────────
@router.get("/splits", response_model=list[SplitOut])
def list_splits(
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
    mine_only: bool = False,
) -> list[SplitOut]:
    q = db.query(Split).filter(Split.house_id == house.id)
    if mine_only:
        # Splits where I'm the payer, or a debtor on at least one request.
        my_split_ids = {
            r.split_id for r in db.query(SplitRequest).filter_by(debtor_id=me.id).all()
        }
        q = q.filter((Split.payer_id == me.id) | Split.id.in_(my_split_ids))
    splits = q.order_by(Split.created_at.desc()).all()

    # Single batched name lookup so SplitOut.payer_name + debtor_name work.
    user_ids: set[str] = set()
    for s in splits:
        user_ids.add(s.payer_id)
        for r in s.requests:
            user_ids.add(r.debtor_id)
    names = _name_lookup(db, user_ids)
    return [split_to_out(s, name_by_id=names) for s in splits]


# ── GET /splits/{id} ───────────────────────────────────────────────────
@router.get("/splits/{split_id}", response_model=SplitOut)
def get_split(
    split_id: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    split = db.query(Split).filter_by(id=split_id, house_id=house.id).first()
    if split is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "split not found")
    user_ids = {split.payer_id} | {r.debtor_id for r in split.requests}
    return split_to_out(split, name_by_id=_name_lookup(db, user_ids))


# ── GET /requests/{id} ─────────────────────────────────────────────────
# Returns the parent Split for a given SplitRequest id. Used by the AI flow:
# the agent emits `pay_request` with a request_id, and the client looks up
# the surrounding split fresh from the DB rather than relying on a cache.
@router.get("/requests/{request_id}", response_model=SplitOut)
def get_request(
    request_id: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    row = (
        db.query(SplitRequest)
        .join(Split, Split.id == SplitRequest.split_id)
        .filter(SplitRequest.id == request_id, Split.house_id == house.id)
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    split = row.split
    user_ids = {split.payer_id} | {r.debtor_id for r in split.requests}
    return split_to_out(split, name_by_id=_name_lookup(db, user_ids))


# ── POST /splits/{id}/refresh ──────────────────────────────────────────
# Re-polls bunq for each child request and updates local status. Cheap to
# call on demand from the UI when a tile is opened.
def _refresh_one(payer_label: str, request_id: int) -> str | None:
    """Returns the new status string or None on lookup failure."""
    if not request_id:
        return None
    client = get_bunq_client()
    try:
        # bunq's incoming/outgoing list is the cheapest way to inspect status.
        # The request-response side carries the accept/reject decision; the
        # request-inquiry side stays in REVOKED/PENDING/ACCEPTED.
        outgoing = client.list_outgoing_requests(payer_label)
    except Exception as e:
        log.warning("refresh: bunq list_outgoing_requests failed: %s", e)
        return None
    for w in outgoing:
        ri = w.get("RequestInquiry") or {}
        if ri.get("id") == request_id:
            s = (ri.get("status") or "").upper()
            return {
                "PENDING": "pending",
                "ACCEPTED": "accepted",
                "REJECTED": "rejected",
                "REVOKED": "revoked",
            }.get(s, "pending")
    return None


@router.post("/splits/{split_id}/refresh", response_model=SplitOut)
async def refresh_split(
    split_id: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    split = db.query(Split).filter_by(id=split_id, house_id=house.id).first()
    if split is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "split not found")
    payer = db.query(User).filter_by(id=split.payer_id).first()
    if payer is None or not payer.bunq_label:
        raise HTTPException(status.HTTP_409_CONFLICT, "payer not bunq-linked")

    for r in split.requests:
        if r.bunq_request_id is None:
            continue
        new_status = await run_in_threadpool(
            _refresh_one, payer.bunq_label, r.bunq_request_id,
        )
        if new_status:
            r.status = SplitRequestStatus(new_status)
    db.commit()
    db.refresh(split)
    user_ids = {split.payer_id} | {r.debtor_id for r in split.requests}
    return split_to_out(split, name_by_id=_name_lookup(db, user_ids))


# ── POST /splits/{id}/requests/{rid}/{accept|decline} ──────────────────
# The debtor's side of the flow. For a real bunq-backed request we look up
# the matching request-response on the debtor's monetary-account and PUT
# ACCEPTED/REJECTED there. For local mocks (bunq_request_id is None) we just
# flip the status — useful for demo seed + the mock_anton_request script.
def _find_request_response_id(
    *, debtor_label: str, amount: Decimal, description: str | None,
) -> int | None:
    """Match a pending request-response on the debtor's side. Bunq doesn't
    expose a direct id link from the inquiry to the response, so we match
    by ``amount_inquired.value`` + ``description`` + ``status=PENDING``.
    The (amount, description) pair is unique in practice because we always
    generate a non-empty description on the inquiry side.
    """
    client = get_bunq_client()
    try:
        incoming = client.list_incoming_requests(debtor_label)
    except Exception as e:
        log.warning("accept: list_incoming_requests failed: %s", e)
        return None

    target_amount = f"{amount:.2f}"  # bunq stores as string with 2 decimals
    candidates: list[tuple[int, str | None]] = []
    for w in incoming:
        rr = w.get("RequestResponse") or {}
        if (rr.get("status") or "").upper() != "PENDING":
            continue
        amt = (rr.get("amount_inquired") or {}).get("value")
        if amt != target_amount:
            continue
        candidates.append((rr.get("id"), rr.get("description")))

    if not candidates:
        return None
    # Exact description match wins; otherwise just take the most recent one
    # (bunq returns newest-first).
    if description:
        for rid, desc in candidates:
            if desc == description:
                return rid
    return candidates[0][0]


def _resolve_response(
    *, split_id: str, rid: str, me: User, house: House, db: Session,
) -> tuple[Split, SplitRequest]:
    split = db.query(Split).filter_by(id=split_id, house_id=house.id).first()
    if split is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "split not found")
    sr = db.query(SplitRequest).filter_by(id=rid, split_id=split.id).first()
    if sr is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    if sr.debtor_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "you're not the debtor on this request")
    if sr.status != SplitRequestStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"request already {sr.status.value}")
    return split, sr


def _apply_decision(
    sr: SplitRequest, *, debtor_label: str | None,
    description: str | None, accept: bool,
) -> None:
    """Mutates `sr.status` (+ `sr.error` on failure). Real-bunq path tries to
    PUT ACCEPTED/REJECTED on the debtor's request-response; local-mock path
    just flips local state. Either way we end in the desired terminal state.
    """
    new_status = SplitRequestStatus.accepted if accept else SplitRequestStatus.rejected

    if sr.bunq_request_id is None or not debtor_label:
        # Local mock — no bunq inquiry to accept, so no money moves.
        log.info("accept local-only: split_request=%s (no bunq linkage)", sr.id)
        sr.status = new_status
        sr.error = "local mock — no money movement"
        return

    rr_id = _find_request_response_id(
        debtor_label=debtor_label,
        amount=sr.amount,
        description=description,
    )
    if rr_id is None:
        # Bunq side not found (sandbox quirk, or lookup race). Update locally
        # so the UI doesn't get stuck — refresh_split can reconcile later.
        log.warning(
            "accept: no matching pending RequestResponse for sr=%s "
            "(amt=%s, desc=%r) on debtor %s — applying locally",
            sr.id, sr.amount, description, debtor_label,
        )
        sr.status = new_status
        sr.error = "bunq response not found — applied locally"
        return

    try:
        get_bunq_client().respond_to_request(debtor_label, rr_id, accept=accept)
        log.info(
            "accept ok: split_request=%s, debtor=%s, rr_id=%s, accept=%s",
            sr.id, debtor_label, rr_id, accept,
        )
        sr.error = None
    except Exception as e:
        log.warning("respond_to_request failed: %s", e)
        sr.error = str(e)[:512]
        # Still flip local state — better than leaving "pending" forever.
    sr.status = new_status


@router.post("/splits/{split_id}/requests/{rid}/accept", response_model=SplitOut)
async def accept_request(
    split_id: str, rid: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    split, sr = _resolve_response(
        split_id=split_id, rid=rid, me=me, house=house, db=db,
    )
    description = (split.note or split.title or "")[:140]
    await run_in_threadpool(
        _apply_decision, sr,
        debtor_label=me.bunq_label, description=description, accept=True,
    )
    db.commit()
    db.refresh(split)
    user_ids = {split.payer_id} | {r.debtor_id for r in split.requests}
    return split_to_out(split, name_by_id=_name_lookup(db, user_ids))


@router.post("/splits/{split_id}/requests/{rid}/decline", response_model=SplitOut)
async def decline_request(
    split_id: str, rid: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    split, sr = _resolve_response(
        split_id=split_id, rid=rid, me=me, house=house, db=db,
    )
    description = (split.note or split.title or "")[:140]
    await run_in_threadpool(
        _apply_decision, sr,
        debtor_label=me.bunq_label, description=description, accept=False,
    )
    db.commit()
    db.refresh(split)
    user_ids = {split.payer_id} | {r.debtor_id for r in split.requests}
    return split_to_out(split, name_by_id=_name_lookup(db, user_ids))
