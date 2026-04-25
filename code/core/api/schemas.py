"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── shared ──────────────────────────────────────────────────────────────
class HousemateOut(BaseModel):
    id: str
    name: str
    color: str
    is_me: bool


# ── scan ────────────────────────────────────────────────────────────────
class ScanLineItemOut(BaseModel):
    id: str
    position: int
    name: str
    price: Decimal
    quantity: int
    assigned_to: str | None = None


class ScanOut(BaseModel):
    id: str
    status: str
    image_url: str
    merchant: str | None = None
    merchant_suggested: str | None = None
    description: str | None = None
    description_suggested: str | None = None
    receipt_date: date | None = None
    location: str | None = None
    total: Decimal | None = None
    currency: str
    error: str | None = None
    split_id: str | None = None
    created_at: datetime
    updated_at: datetime
    finalized_at: datetime | None = None
    line_items: list[ScanLineItemOut]


# ── PATCH bodies ────────────────────────────────────────────────────────
class ScanPatch(BaseModel):
    merchant: str | None = None
    description: str | None = None
    receipt_date: date | None = None
    location: str | None = None
    total: Decimal | None = None
    currency: str | None = None


class LineItemPatch(BaseModel):
    name: str | None = None
    price: Decimal | None = None
    quantity: int | None = None


# ── assignments ─────────────────────────────────────────────────────────
class AssignmentsIn(BaseModel):
    """Bulk assignment update. Value is a housemate id, 'everyone', or null."""

    assignments: dict[str, str | None] = Field(default_factory=dict)


class AiAssignIn(BaseModel):
    prompt: str


class AiAssignOut(BaseModel):
    assignments: dict[str, str | None]
    explanation: str | None = None


# ── splits ──────────────────────────────────────────────────────────────
class SplitRequestOut(BaseModel):
    id: str
    debtor_id: str
    debtor_name: str | None = None
    amount: Decimal
    currency: str
    status: str  # one of SplitRequestStatus values
    bunq_request_id: int | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class SplitOut(BaseModel):
    id: str
    house_id: str
    payer_id: str
    payer_name: str | None = None
    title: str
    note: str | None = None
    total: Decimal
    currency: str
    parent_post_id: str | None = None
    source_scan_id: str | None = None
    created_at: datetime
    requests: list[SplitRequestOut]
    # Convenience flags computed per-request
    settled: bool = False  # all requests accepted (or no requests)
    n_pending: int = 0
    n_accepted: int = 0
    n_failed: int = 0
