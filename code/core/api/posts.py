"""Feed posts API — threads, comments, and the (max 1) spawned split.

Each post can spawn at most one Split. The link is ``Split.parent_post_id``;
splits themselves now live in the ``splits`` + ``split_requests`` tables and
fire bunq request-inquiries via ``services.splits.create_split``.
"""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..data.models import FeedComment, FeedPost, House, Split, User
from ..services.splits import create_split as _create_split
from .deps import current_house, current_user, get_db
from .schemas import SplitOut
from .splits import split_to_out

router = APIRouter(prefix="/posts", tags=["posts"])


# ── schemas (request bodies + responses) ───────────────────────────────
class AuthorOut(BaseModel):
    id: str
    name: str
    color: str
    is_me: bool = False


class FeedCommentOut(BaseModel):
    id: str
    post_id: str
    author: AuthorOut
    text: str
    created_at: object


class FeedPostOut(BaseModel):
    id: str
    house_id: str
    author: AuthorOut
    text: str
    created_at: object
    comment_count: int
    split: SplitOut | None = None
    comments: list[FeedCommentOut] = Field(default_factory=list)


class FeedPostCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class FeedCommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class SplitMemberIn(BaseModel):
    user_id: str
    share: Decimal | None = None  # if None, equal-split among non-payer members


class PostSplitCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    note: str | None = None
    total: Decimal
    currency: str = "EUR"
    payer_id: str | None = None      # defaults to current user
    members: list[SplitMemberIn]     # must include the payer


# ── helpers ────────────────────────────────────────────────────────────
def _author(user: User, me_id: str) -> AuthorOut:
    return AuthorOut(id=user.id, name=user.name, color=user.color, is_me=user.id == me_id)


def _split_for_post(db: Session, post_id: str) -> Split | None:
    return db.query(Split).filter(Split.parent_post_id == post_id).first()


def _name_lookup(db: Session, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    return {u.id: u.name for u in db.query(User).filter(User.id.in_(ids)).all()}


def _post_out(db: Session, post: FeedPost, me_id: str, *, include_comments: bool = False) -> FeedPostOut:
    author = db.get(User, post.author_id)
    split = _split_for_post(db, post.id)
    split_out = None
    if split is not None:
        names = _name_lookup(db, {split.payer_id} | {r.debtor_id for r in split.requests})
        split_out = split_to_out(split, name_by_id=names)
    return FeedPostOut(
        id=post.id,
        house_id=post.house_id,
        author=_author(author, me_id),
        text=post.text,
        created_at=post.created_at,
        comment_count=len(post.comments),
        split=split_out,
        comments=[
            FeedCommentOut(
                id=c.id, post_id=c.post_id, text=c.text, created_at=c.created_at,
                author=_author(db.get(User, c.author_id), me_id),
            )
            for c in (post.comments if include_comments else [])
        ],
    )


def _get_post(db: Session, post_id: str, house: House) -> FeedPost:
    post = db.query(FeedPost).filter_by(id=post_id, house_id=house.id).first()
    if post is None:
        raise HTTPException(404, f"post {post_id} not found")
    return post


# ── endpoints ──────────────────────────────────────────────────────────
@router.get("", response_model=list[FeedPostOut])
def list_posts(
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> list[FeedPostOut]:
    rows = (
        db.query(FeedPost)
        .filter(FeedPost.house_id == house.id)
        .order_by(FeedPost.created_at.desc())
        .all()
    )
    return [_post_out(db, p, user.id) for p in rows]


@router.post("", response_model=FeedPostOut, status_code=201)
def create_post(
    body: FeedPostCreate,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> FeedPostOut:
    post = FeedPost(house_id=house.id, author_id=user.id, text=body.text)
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_out(db, post, user.id, include_comments=True)


@router.get("/{post_id}", response_model=FeedPostOut)
def get_post(
    post_id: str,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> FeedPostOut:
    return _post_out(db, _get_post(db, post_id, house), user.id, include_comments=True)


@router.post("/{post_id}/comments", response_model=FeedCommentOut, status_code=201)
def add_comment(
    post_id: str,
    body: FeedCommentCreate,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> FeedCommentOut:
    post = _get_post(db, post_id, house)
    comment = FeedComment(post_id=post.id, author_id=user.id, text=body.text)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return FeedCommentOut(
        id=comment.id, post_id=comment.post_id, text=comment.text,
        created_at=comment.created_at,
        author=_author(user, user.id),
    )


@router.post("/{post_id}/split", response_model=SplitOut, status_code=201)
async def spawn_split(
    post_id: str,
    body: PostSplitCreate,
    user: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
) -> SplitOut:
    post = _get_post(db, post_id, house)
    if _split_for_post(db, post.id) is not None:
        raise HTTPException(409, "post already has a split")

    payer_id = body.payer_id or user.id
    member_ids = [m.user_id for m in body.members]
    if payer_id not in member_ids:
        raise HTTPException(400, "payer must be in members list")
    if len(set(member_ids)) != len(member_ids):
        raise HTTPException(400, "duplicate member")

    payer = db.query(User).filter_by(id=payer_id).first()
    if payer is None:
        raise HTTPException(404, "payer not found")
    if not payer.bunq_label:
        raise HTTPException(409, "payer has no bunq linkage")
    members = (
        db.query(User).filter(User.id.in_(set(member_ids))).all()
    )
    if len(members) != len(set(member_ids)):
        raise HTTPException(404, "one or more members not found")

    explicit_shares = {m.user_id: m.share for m in body.members if m.share is not None}
    if explicit_shares and set(explicit_shares) != set(member_ids):
        raise HTTPException(400, "either all or no member shares must be set")

    split = await run_in_threadpool(
        _create_split,
        db,
        house_id=house.id,
        payer=payer,
        participants=members,
        total=body.total,
        title=body.title,
        description=body.note,
        currency=body.currency,
        parent_post_id=post.id,
        shares=explicit_shares or None,
    )
    names = _name_lookup(db, {split.payer_id} | {r.debtor_id for r in split.requests})
    return split_to_out(split, name_by_id=names)
