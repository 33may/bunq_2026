"""Fire a fresh REAL bunq request-inquiry where anton is the debtor.

Re-runnable: each invocation creates a new Split with one SplitRequest and
fires a real bunq request-inquiry from the payer → anton, so accepting in
the UI moves real sandbox money.

Run from the `code/` directory:
    ./.venv/bin/python -m scripts.mock_anton_request
or:
    python -m scripts.mock_anton_request
"""
from __future__ import annotations

import random
from decimal import Decimal

from core.data import SessionLocal
from core.data.models import House, User
from core.services.splits import create_split

TITLES = [
    ("coffee run",       "lot sixty one, oat flat white", "4.50"),
    ("pizza",            "new york pizza, late night",    "9.20"),
    ("uber",             "centraal → home, rainy",        "12.80"),
    ("groceries",        "albert heijn, weekly haul",     "18.40"),
    ("beers",            "café de prins, 4 rounds",       "14.00"),
    ("ramen",            "fou fow, tonkotsu + gyoza",     "16.50"),
    ("netflix",          "monthly · split 4 ways",         "4.99"),
    ("cleaning supplies","dm, sponges + spray",            "6.30"),
]


def main() -> None:
    db = SessionLocal()
    try:
        anton = db.query(User).filter_by(bunq_label="anton").first()
        if anton is None:
            raise SystemExit("no anton user — seed sandbox users first")

        house = db.query(House).first()
        if house is None:
            raise SystemExit("no house — run the API once to seed")

        candidates = (
            db.query(User)
            .filter(User.bunq_label.in_(["alex", "lena", "marco"]))
            .all()
        )
        if not candidates:
            raise SystemExit("no non-anton sandbox users found")

        payer = random.choice(candidates)
        title, note, amount = random.choice(TITLES)

        split = create_split(
            db,
            house_id=house.id,
            payer=payer,
            participants=[anton],
            total=Decimal(amount),
            title=title,
            description=note,
        )
        sr = split.requests[0]
        ok = sr.bunq_request_id is not None
        print(
            f"{'ok ' if ok else 'FAIL '}— split {split.id[:8]}: "
            f"{payer.bunq_label} → anton €{amount} ({title}) "
            f"bunq_id={sr.bunq_request_id} err={sr.error}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
