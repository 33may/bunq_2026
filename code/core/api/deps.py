"""FastAPI dependencies — db session + cookie-resolved current user.

`current_user` reads the `bunq_user` cookie set by /auth/bunq/callback and
looks up the user by `bunq_label`. 401 if the cookie is absent, empty, or
points to a label we don't know. No dev fallback — that would mask auth bugs.
"""
from __future__ import annotations

from typing import Iterator

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..data import SessionLocal
from ..data.models import House, HouseMember, User


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    db: Session = Depends(get_db),
    bunq_user: str | None = Cookie(default=None),
) -> User:
    if not bunq_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not signed in")
    user = db.query(User).filter_by(bunq_label=bunq_user).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unknown bunq user")
    return user


def current_house(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> House:
    membership = db.query(HouseMember).filter_by(user_id=user.id).first()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user has no house",
        )
    return db.query(House).filter_by(id=membership.house_id).one()
