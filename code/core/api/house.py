"""House endpoints — read the current household the signed-in user belongs to."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..data.models import House, HouseMember, User
from .deps import current_house, current_user, get_db

router = APIRouter(tags=["house"])


class HouseMemberOut(BaseModel):
    id: str
    name: str
    color: str
    bunq_label: str | None
    email: str | None
    is_me: bool


class HouseOut(BaseModel):
    id: str
    name: str
    address: str | None
    city: str | None
    country: str | None
    member_count: int
    members: list[HouseMemberOut]


@router.get("/house", response_model=HouseOut)
def get_house(
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> HouseOut:
    rows = (
        db.query(User)
        .join(HouseMember, HouseMember.user_id == User.id)
        .filter(HouseMember.house_id == house.id)
        .order_by(User.name)
        .all()
    )
    return HouseOut(
        id=house.id,
        name=house.name,
        address=house.address,
        city=house.city,
        country=house.country,
        member_count=len(rows),
        members=[
            HouseMemberOut(
                id=u.id, name=u.name, color=u.color,
                bunq_label=u.bunq_label, email=u.email,
                is_me=(u.id == me.id),
            ) for u in rows
        ],
    )
