"""Current-user's bunq view: accounts, balances, IBAN aliases, payments.

  GET /me/bunq            →  {primary: {...}, accounts: [{...}]}
  GET /me/bunq/payments   →  recent Payment events (real money movement)

The heavy lifting lives in ``BunqClient``; this file just maps the current
cookie-authed app user → their bunq label → one or more live API calls.
"""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..data.models import User
from ..services.bunq import get_bunq_client
from .deps import current_user

log = logging.getLogger(__name__)

router = APIRouter(tags=["bunq"])


class BunqAccountOut(BaseModel):
    id: int
    description: str | None
    iban: str | None
    balance: Decimal
    currency: str
    status: str | None


class BunqMeOut(BaseModel):
    primary: BunqAccountOut | None
    accounts: list[BunqAccountOut]


def _extract_account(wrapper: dict) -> BunqAccountOut | None:
    """Unwrap ``{MonetaryAccountBank|Joint|Savings: {...}}`` into a flat model."""
    for key in ("MonetaryAccountBank", "MonetaryAccountJoint", "MonetaryAccountSavings"):
        acc = wrapper.get(key)
        if acc is None:
            continue
        iban = None
        for a in acc.get("alias", []) or []:
            if a.get("type") == "IBAN":
                iban = a.get("value")
                break
        balance_obj = acc.get("balance") or {}
        try:
            balance = Decimal(str(balance_obj.get("value", "0")))
        except Exception:
            balance = Decimal("0")
        return BunqAccountOut(
            id=acc.get("id"),
            description=acc.get("description"),
            iban=iban,
            balance=balance,
            currency=balance_obj.get("currency") or acc.get("currency") or "EUR",
            status=acc.get("status"),
        )
    return None


class BunqPaymentOut(BaseModel):
    """A Payment that has actually moved money on this user's account.

    Sign convention follows bunq's: positive = money in, negative = money out.
    """
    id: int
    amount: Decimal
    currency: str
    description: str | None
    counterparty_name: str | None
    counterparty_iban: str | None
    counterparty_email: str | None
    created: datetime | None
    type: str | None  # bunq's `type` (e.g. BUNQ, EBA_SCT)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    # bunq returns "YYYY-MM-DD HH:MM:SS.ffffff" (naive UTC).
    try:
        return datetime.fromisoformat(s.replace(" ", "T"))
    except ValueError:
        return None


def _extract_payment(wrapper: dict) -> BunqPaymentOut | None:
    p = wrapper.get("Payment")
    if p is None:
        return None
    amt = p.get("amount") or {}
    try:
        value = Decimal(str(amt.get("value", "0")))
    except Exception:
        value = Decimal("0")
    cp = p.get("counterparty_alias") or {}
    cp_label = cp.get("display_name") or (cp.get("label_user") or {}).get("display_name")
    cp_iban = None
    cp_email = None
    for a in cp.get("alias_lookup", []) or []:
        if a.get("type") == "IBAN" and not cp_iban:
            cp_iban = a.get("value")
        elif a.get("type") == "EMAIL" and not cp_email:
            cp_email = a.get("value")
    if cp_iban is None and (cp.get("iban")):
        cp_iban = cp.get("iban")
    return BunqPaymentOut(
        id=p.get("id"),
        amount=value,
        currency=amt.get("currency") or "EUR",
        description=p.get("description"),
        counterparty_name=cp_label,
        counterparty_iban=cp_iban,
        counterparty_email=cp_email,
        created=_parse_dt(p.get("created")),
        type=p.get("type"),
    )


@router.get("/me/bunq", response_model=BunqMeOut)
async def me_bunq(me: User = Depends(current_user)) -> BunqMeOut:
    if not me.bunq_label:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="user has no bunq_label — re-run bootstrap",
        )
    client = get_bunq_client()
    try:
        wrappers = await run_in_threadpool(client.list_accounts, me.bunq_label)
    except Exception as e:
        log.warning("bunq list_accounts failed for %s: %s", me.bunq_label, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"bunq: {e}",
        ) from e

    accounts = [a for a in (_extract_account(w) for w in wrappers) if a is not None]
    # "Primary" = first MonetaryAccountBank that's active, else first active, else first
    primary = next(
        (a for a in accounts if a.status == "ACTIVE"),
        accounts[0] if accounts else None,
    )
    return BunqMeOut(primary=primary, accounts=accounts)


@router.get("/me/bunq/payments", response_model=list[BunqPaymentOut])
async def me_bunq_payments(
    me: User = Depends(current_user),
    count: int = 50,
) -> list[BunqPaymentOut]:
    """Recent settled payments (real money movements) for the current user.

    Drives the home-screen "Completed" section. Negative ``amount`` = outgoing.
    """
    if not me.bunq_label:
        raise HTTPException(status.HTTP_409_CONFLICT, "user has no bunq_label")
    client = get_bunq_client()
    try:
        rows = await run_in_threadpool(client.list_payments, me.bunq_label, count)
    except Exception as e:
        log.warning("bunq list_payments failed for %s: %s", me.bunq_label, e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"bunq: {e}") from e
    return [p for p in (_extract_payment(w) for w in rows) if p is not None]
