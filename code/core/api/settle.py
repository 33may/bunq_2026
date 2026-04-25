"""Settle-up endpoint.

POST /settle-up/{peer_id}            → run settle_up, return result
GET  /settle-up/{peer_id}/preview    → cheap preview for the confirm sheet
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..data.models import House, User
from ..services import settle as settle_svc
from .deps import current_house, current_user, get_db

log = logging.getLogger(__name__)

router = APIRouter(tags=["settle"])


def _resolve_peer(db: Session, *, house: House, peer_id: str) -> User:
    user = db.query(User).filter_by(id=peer_id).first()
    if user is None:
        raise HTTPException(404, "peer not found")
    # Same-house check via membership
    from ..data.models import HouseMember  # local to avoid an import cycle
    in_house = (
        db.query(HouseMember)
        .filter_by(house_id=house.id, user_id=user.id)
        .first()
    ) is not None
    if not in_house:
        raise HTTPException(404, "peer not in your house")
    return user


@router.get("/settle-up/{peer_id}/preview")
def settle_preview(
    peer_id: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> dict:
    if peer_id == me.id:
        raise HTTPException(400, "cannot settle with yourself")
    peer = _resolve_peer(db, house=house, peer_id=peer_id)
    return settle_svc.preview(db, house=house, me=me, peer=peer)


@router.post("/settle-up/{peer_id}")
async def do_settle(
    peer_id: str,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> dict:
    if peer_id == me.id:
        raise HTTPException(400, "cannot settle with yourself")
    peer = _resolve_peer(db, house=house, peer_id=peer_id)
    try:
        result = await run_in_threadpool(
            settle_svc.settle_up, db, house=house, me=me, peer=peer,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result
