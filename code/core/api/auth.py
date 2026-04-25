"""Auth endpoints — bunq-style OAuth, faked with the 4 on-disk sandbox users.

Flow:
  GET  /users                 → list the sandbox users available for the picker
  POST /auth/bunq/callback    → body {label}; sets cookie bunq_user=<label>
  GET  /me                    → current user (401 if no/invalid cookie)
  POST /session/logout        → clears cookie (returns 204)

Cookie shape: `bunq_user=<label>; HttpOnly; SameSite=Lax; Max-Age=30d`.
In production this is where the real bunq OAuth code-exchange would land:
frontend receives an auth code, posts it to /auth/bunq/callback, we hit
bunq's /v1/token, and the resulting access_token replaces the sandbox label
as the thing we look up per user. The rest of the app stays unchanged.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..data.models import User
from .deps import current_user, get_db

router = APIRouter(tags=["auth"])

COOKIE_NAME = "bunq_user"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


class UserOut(BaseModel):
    id: str
    name: str
    color: str
    bunq_label: str | None
    email: str | None


class ConnectIn(BaseModel):
    label: str


class ConnectOut(BaseModel):
    user: UserOut


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    """Public — no auth. Populates the account-picker in the consent screen."""
    rows = db.query(User).filter(User.bunq_label.isnot(None)).order_by(User.name).all()
    return [UserOut(
        id=u.id, name=u.name, color=u.color,
        bunq_label=u.bunq_label, email=u.email,
    ) for u in rows]


@router.post("/auth/bunq/callback", response_model=ConnectOut)
def bunq_callback(
    body: ConnectIn,
    response: Response,
    db: Session = Depends(get_db),
) -> ConnectOut:
    """Binds the browser to a bunq sandbox user by setting a cookie.

    The incoming ``label`` is our stand-in for the OAuth authorization code.
    """
    user = db.query(User).filter_by(bunq_label=body.label).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown bunq user: {body.label!r}",
        )
    response.set_cookie(
        key=COOKIE_NAME,
        value=user.bunq_label,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,  # dev: http://localhost — Secure would drop the cookie
        path="/",
    )
    return ConnectOut(user=UserOut(
        id=user.id, name=user.name, color=user.color,
        bunq_label=user.bunq_label, email=user.email,
    ))


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(current_user)) -> UserOut:
    return UserOut(
        id=user.id, name=user.name, color=user.color,
        bunq_label=user.bunq_label, email=user.email,
    )


@router.post("/session/logout", status_code=204, response_class=Response)
def logout() -> Response:
    # Build the actual response we return + set delete_cookie on IT.
    # Setting it on a separately-injected Response that we then discard
    # (which is what the previous version did) drops the Set-Cookie
    # header on the floor and the browser keeps the session.
    resp = Response(status_code=204)
    resp.delete_cookie(key=COOKIE_NAME, path="/")
    return resp
