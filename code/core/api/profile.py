"""Per-user profile MD endpoints.

The profile is a free-form markdown document the agent maintains as it learns
about the user. Read at ``GET /me/profile``, written at ``PUT /me/profile``.

Writes always go through these routes — the agent itself proposes edits via
the ``update_profile`` emit_action kind, which renders a confirmation card in
the UI; the user reviews the proposed text and the frontend then calls PUT
here. There is no agent-side write tool, so the user always has the final
say on what gets persisted.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..data.models import User
from ..services import profiles as profiles_svc
from .deps import current_user

router = APIRouter(prefix="/me", tags=["profile"])


class ProfileOut(BaseModel):
    text: str


class ProfileIn(BaseModel):
    text: str = Field(..., max_length=50_000)


@router.get("/profile", response_model=ProfileOut)
def get_profile(user: User = Depends(current_user)) -> ProfileOut:
    store = profiles_svc.get_profile_store()
    return ProfileOut(text=store.load(user.id))


@router.put("/profile", response_model=ProfileOut)
def put_profile(
    body: ProfileIn,
    user: User = Depends(current_user),
) -> ProfileOut:
    store = profiles_svc.get_profile_store()
    store.save(user.id, body.text)
    return ProfileOut(text=body.text)
