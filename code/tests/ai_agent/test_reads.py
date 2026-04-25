"""Tests for the agent's read accessors."""
from __future__ import annotations

from decimal import Decimal

from core.services.ai_agent.reads import (
    list_splits,
    get_split,
    list_housemates,
    get_housemate,
    get_balance_with,
    list_requests_with,
)


def test_list_splits_filters_to_house(db, seeded):
    out = list_splits(db, house_id=seeded["house"].id, user_id=seeded["anton"].id,
                     mine_only=True)
    assert len(out) == 2
    titles = {s["title"] for s in out}
    assert titles == {"pizza", "cleaning"}


def test_list_splits_mine_only_excludes_unrelated(db, seeded):
    # Both seeded splits involve anton, so mine_only=True returns both.
    out = list_splits(db, house_id=seeded["house"].id, user_id=seeded["anton"].id,
                     mine_only=True)
    assert len(out) == 2


def test_get_split_detail(db, seeded):
    s = get_split(db, house_id=seeded["house"].id, split_id=seeded["s1"].id)
    assert s["title"] == "pizza"
    assert s["payer"]["name"] == "anton"
    assert len(s["requests"]) == 2


def test_get_split_wrong_house(db, seeded):
    s = get_split(db, house_id="not-a-house", split_id=seeded["s1"].id)
    assert s is None


def test_list_housemates(db, seeded):
    out = list_housemates(db, house_id=seeded["house"].id)
    names = {m["name"] for m in out}
    assert names == {"anton", "lena", "alex"}


def test_get_housemate_by_name_fuzzy(db, seeded):
    m = get_housemate(db, house_id=seeded["house"].id, name_or_id="LENA")
    assert m and m["name"] == "lena"


def test_get_housemate_by_id(db, seeded):
    m = get_housemate(db, house_id=seeded["house"].id,
                      name_or_id=seeded["alex"].id)
    assert m and m["name"] == "alex"


def test_get_housemate_missing(db, seeded):
    m = get_housemate(db, house_id=seeded["house"].id, name_or_id="zoe")
    assert m is None


def test_get_balance_with_lena_owes_anton_5(db, seeded):
    # lena owes anton 15 (pizza), anton owes lena 10 (cleaning) → net +5
    bal = get_balance_with(db, house_id=seeded["house"].id,
                           user_id=seeded["anton"].id, name_or_id="lena")
    assert bal["counterparty"]["name"] == "lena"
    assert Decimal(str(bal["net_amount"])) == Decimal("5.00")
    # both contributing splits should appear
    assert len(bal["breakdown"]) == 2


def test_list_requests_with_lena_pending(db, seeded):
    out = list_requests_with(db, house_id=seeded["house"].id,
                             user_id=seeded["anton"].id, name_or_id="lena",
                             status="pending")
    # anton is in two pending requests with lena (one each direction)
    assert len(out) == 2
    directions = {r["direction"] for r in out}
    assert directions == {"incoming", "outgoing"}
