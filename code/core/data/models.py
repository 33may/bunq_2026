"""Domain models for the receipt-processing slice.

Tables (sqlite):
- users           : minimal stub (id, name, color, is_me)
- houses          : minimal stub (id, name)
- house_members   : link table user ↔ house
- scans           : a single receipt upload + parsed payload
- scan_line_items : individual receipt lines + per-line assignment
- items           : finalized expense (split, request, etc.) — receipt slice
                    only creates `split` items
- item_members    : per-user share inside an item (paid / payer flags)
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ── enums ───────────────────────────────────────────────────────────────
class ScanStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    parsed = "parsed"
    failed = "failed"
    finalized = "finalized"


class SplitRequestStatus(str, enum.Enum):
    """Mirrors bunq's request-inquiry / request-response status values plus
    a ``draft`` for the brief window before the bunq call returns."""
    draft = "draft"
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    revoked = "revoked"
    failed = "failed"  # bunq call errored, see SplitRequest.error


# ── identity stubs ──────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(64))
    color: Mapped[str] = mapped_column(String(16), default="#B8F04A")
    # bunq linkage — 1:1 with a sandbox user on disk
    bunq_label: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    bunq_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class House(Base):
    __tablename__ = "houses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    # Optional address — shown in the home greeting ("oak st · 4 housemates")
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)  # ISO-3166 alpha-2
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class HouseMember(Base):
    __tablename__ = "house_members"

    house_id: Mapped[str] = mapped_column(ForeignKey("houses.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


# ── scans ───────────────────────────────────────────────────────────────
class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    house_id: Mapped[str] = mapped_column(ForeignKey("houses.id"))

    # Storage url returned by the storage backend (local path or s3:// uri)
    image_url: Mapped[str] = mapped_column(String(512))

    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus, native_enum=False), default=ScanStatus.pending, index=True
    )

    # Editable fields (user can override post-parse)
    merchant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receipt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")

    # AI's first guesses, kept separately from user edits for traceability
    merchant_suggested: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description_suggested: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Full claude tool-call payload, for debug + reprocessing
    raw_extraction: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Set on finalize → links to the created Split (which carries the
    # request-inquiries fired against each non-payer participant).
    split_id: Mapped[str | None] = mapped_column(ForeignKey("splits.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    line_items: Mapped[list["ScanLineItem"]] = relationship(
        back_populates="scan",
        cascade="all, delete-orphan",
        order_by="ScanLineItem.position",
    )


class ScanLineItem(Base):
    __tablename__ = "scan_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    scan_id: Mapped[str] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)

    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    # Either a user_id (housemate), the literal string "everyone", or NULL
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True)

    scan: Mapped[Scan] = relationship(back_populates="line_items")


# ── splits + their request-inquiries ────────────────────────────────────
# A "split" is the parent grouping; each child SplitRequest is bound 1:1
# to a bunq request-inquiry. A "request" (one person asks one person) is
# just a Split with a single SplitRequest. Same code path, same DB shape.
class Split(Base):
    __tablename__ = "splits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    house_id: Mapped[str] = mapped_column(ForeignKey("houses.id"))
    payer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))

    title: Mapped[str] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(8), default="EUR")

    # Optional source links — feed post that spawned this split, or the
    # receipt scan it was finalized from.
    parent_post_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_scan_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    requests: Mapped[list["SplitRequest"]] = relationship(
        back_populates="split",
        cascade="all, delete-orphan",
    )


class SplitRequest(Base):
    __tablename__ = "split_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    split_id: Mapped[str] = mapped_column(ForeignKey("splits.id", ondelete="CASCADE"))
    debtor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(8), default="EUR")

    # bunq linkage. ``bunq_request_id`` is null until the call succeeds.
    bunq_request_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[SplitRequestStatus] = mapped_column(
        Enum(SplitRequestStatus, native_enum=False),
        default=SplitRequestStatus.draft,
        index=True,
    )
    error: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    split: Mapped[Split] = relationship(back_populates="requests")


# ── feed posts + comments ──────────────────────────────────────────────
# A FeedPost is a thread starter in the house feed. Replies are FeedComments.
# A post can spawn at most one split (Item.parent_id == post.id) — enforced
# at the application layer so the same `parent_id` mechanism can later carry
# request items spawned from posts as well.
class FeedPost(Base):
    __tablename__ = "feed_posts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    house_id: Mapped[str] = mapped_column(ForeignKey("houses.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))

    text: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )

    comments: Mapped[list["FeedComment"]] = relationship(
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="FeedComment.created_at",
    )


class FeedComment(Base):
    __tablename__ = "feed_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    post_id: Mapped[str] = mapped_column(
        ForeignKey("feed_posts.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))

    text: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    post: Mapped[FeedPost] = relationship(back_populates="comments")


# ── chat messages ──────────────────────────────────────────────────────
# A single table for three thread shapes, discriminated by `thread_kind`:
#   • dm            — 1:1 between two users; thread_key = "minId|maxId"
#   • split         — group chat for a Split; thread_key = split.id; visible
#                     to every participant of the split
#   • split_request — pair chat for one SplitRequest; thread_key = req.id;
#                     visible to payer + debtor of that request
#
# A message MAY carry an `attachment_kind/id` referencing a Split or
# SplitRequest. Attachments are only meaningful in DM threads — the UI
# renders them as an item card stacked above the bubble. In split/sr
# threads the thread itself already references the item, so we ignore.
#
# `read` is a single bit per message. For 1:1 threads this is meaningful —
# the recipient flips it on open. For split (group) threads it's lossy and
# we leave it false. If we ever need true per-user read receipts, add a
# separate `chat_message_reads` join table.
class ChatThreadKind(str, enum.Enum):
    dm = "dm"
    split = "split"
    split_request = "split_request"


class ChatAttachmentKind(str, enum.Enum):
    split = "split"
    split_request = "split_request"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    house_id: Mapped[str] = mapped_column(ForeignKey("houses.id"), index=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)

    thread_kind: Mapped[ChatThreadKind] = mapped_column(
        Enum(ChatThreadKind, native_enum=False), index=True,
    )
    thread_key: Mapped[str] = mapped_column(String(120), index=True)

    body: Mapped[str] = mapped_column(String(4000))
    read: Mapped[bool] = mapped_column(Boolean, default=False)

    attachment_kind: Mapped[ChatAttachmentKind | None] = mapped_column(
        Enum(ChatAttachmentKind, native_enum=False), nullable=True,
    )
    attachment_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True,
    )
