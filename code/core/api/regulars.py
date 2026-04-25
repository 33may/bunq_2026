"""Regulars endpoints — list the house's recurring bills."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..data.models import House, User
from ..services import regulars as regulars_svc
from .deps import current_house, current_user, get_db

router = APIRouter(tags=["regulars"])


@router.get("/regulars")
def list_regulars(
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> list[dict]:
    return regulars_svc.list_regulars(db, house_id=house.id)
