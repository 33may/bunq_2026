"""Regulars — recurring household bills (rent, utilities, subs).

Read helpers + computed `next_due` per row. The model is dumb (just a
billing_day + cadence); this module turns that into ISO date strings the
UI can sort and label by.
"""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import Iterable

from sqlalchemy.orm import Session

from ..data.models import House, Regular, User


def _clamp_day(year: int, month: int, day: int) -> int:
    last = calendar.monthrange(year, month)[1]
    return min(day, last)


def next_due_for(billing_day: int, *, today: date | None = None) -> date:
    """Next occurrence of `billing_day`. If today is on/before this month's
    billing day → this month; else next month."""
    today = today or date.today()
    this_month_day = _clamp_day(today.year, today.month, billing_day)
    if today.day <= this_month_day:
        return date(today.year, today.month, this_month_day)
    if today.month == 12:
        ny, nm = today.year + 1, 1
    else:
        ny, nm = today.year, today.month + 1
    return date(ny, nm, _clamp_day(ny, nm, billing_day))


def to_dict(r: Regular, *, today: date | None = None) -> dict:
    nd = next_due_for(r.billing_day, today=today)
    today = today or date.today()
    days_until = (nd - today).days
    return {
        "id": r.id,
        "title": r.title,
        "amount": str(Decimal(r.amount).quantize(Decimal("0.01"))),
        "currency": r.currency,
        "billing_day": r.billing_day,
        "cadence": r.cadence,
        "color": r.color,
        "emoji": r.emoji,
        "payer_id": r.payer_id,
        "next_due": nd.isoformat(),
        "days_until_due": days_until,
    }


def list_regulars(db: Session, *, house_id: str) -> list[dict]:
    """All regulars in the house, sorted by next due (soonest first)."""
    rows = (
        db.query(Regular)
        .filter(Regular.house_id == house_id)
        .all()
    )
    out = [to_dict(r) for r in rows]
    out.sort(key=lambda d: d["days_until_due"])
    return out


# ── seed ──────────────────────────────────────────────────────────────
# Six classic shared-house bills. Idempotent: only fires when the house
# has zero regulars yet.
_SEED: list[dict] = [
    {"title": "rent",        "amount": Decimal("1850.00"), "billing_day": 1,
     "color": "#FF6A4E", "emoji": "🏠"},
    {"title": "gas",         "amount": Decimal("48.00"),   "billing_day": 5,
     "color": "#FFB020", "emoji": "🔥"},
    {"title": "water",       "amount": Decimal("22.00"),   "billing_day": 10,
     "color": "#19C4C1", "emoji": "💧"},
    {"title": "electricity", "amount": Decimal("96.00"),   "billing_day": 15,
     "color": "#FFB020", "emoji": "💡"},
    {"title": "internet",    "amount": Decimal("38.00"),   "billing_day": 20,
     "color": "#3E9BFF", "emoji": "📡"},
    {"title": "netflix",     "amount": Decimal("17.99"),   "billing_day": 25,
     "color": "#9B6CFF", "emoji": "🎬"},
]


def seed_defaults(db: Session, *, house: House) -> int:
    """Insert the canonical 6 regulars if the house has none. Returns the
    number inserted (0 = idempotent no-op)."""
    if db.query(Regular).filter(Regular.house_id == house.id).first() is not None:
        return 0
    for s in _SEED:
        db.add(Regular(
            house_id=house.id,
            title=s["title"],
            amount=s["amount"],
            billing_day=s["billing_day"],
            cadence="monthly",
            color=s["color"],
            emoji=s["emoji"],
            payer_id=None,
        ))
    db.commit()
    return len(_SEED)
