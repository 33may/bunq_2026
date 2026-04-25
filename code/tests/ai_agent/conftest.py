"""Shared fixtures for ai_agent tests — seeded sqlite in-memory DB."""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.data.db import Base
from core.data.models import (
    House, HouseMember, Split, SplitRequest, SplitRequestStatus, User,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def seeded(db):
    """Returns a dict with house, anton (me), lena, alex, and 2 splits."""
    house = House(name="oak st")
    db.add(house); db.flush()

    anton = User(name="anton", bunq_label="anton", email="anton@x")
    lena = User(name="lena", bunq_label="lena", email="lena@x")
    alex = User(name="alex", bunq_label="alex", email="alex@x")
    for u in (anton, lena, alex):
        db.add(u); db.flush()
        db.add(HouseMember(house_id=house.id, user_id=u.id))

    # split: anton paid €30 pizza, lena owes €15, alex owes €15 (both pending)
    s1 = Split(house_id=house.id, payer_id=anton.id, title="pizza",
               total=Decimal("30.00"))
    db.add(s1); db.flush()
    db.add(SplitRequest(split_id=s1.id, debtor_id=lena.id,
                        amount=Decimal("15.00"),
                        status=SplitRequestStatus.pending,
                        bunq_request_id=101))
    db.add(SplitRequest(split_id=s1.id, debtor_id=alex.id,
                        amount=Decimal("15.00"),
                        status=SplitRequestStatus.pending,
                        bunq_request_id=102))

    # split: lena paid €20 cleaning, anton owes €10 (pending — anton owes lena)
    s2 = Split(house_id=house.id, payer_id=lena.id, title="cleaning",
               total=Decimal("20.00"))
    db.add(s2); db.flush()
    db.add(SplitRequest(split_id=s2.id, debtor_id=anton.id,
                        amount=Decimal("10.00"),
                        status=SplitRequestStatus.pending,
                        bunq_request_id=201))
    db.commit()
    return {"house": house, "anton": anton, "lena": lena, "alex": alex,
            "s1": s1, "s2": s2}
