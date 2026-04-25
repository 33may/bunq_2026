"""POST /splits should accept and round-trip parent_post_id."""
from __future__ import annotations

from core.data.models import User


def test_post_split_with_parent_post_id(plain_client, signed_in_cookie):
    from core.api.deps import SessionLocal

    db = SessionLocal()
    users = db.query(User).all()
    db.close()

    me = next(u for u in users if u.bunq_label == "anton")
    others = [u.id for u in users if u.bunq_label != "anton"][:2]

    r = plain_client.post("/splits", json={
        "payer_user_id": me.id,
        "participant_user_ids": others,
        "total": "30.00",
        "title": "ah run",
        "parent_post_id": "post_abc",
    }, cookies=signed_in_cookie)
    assert r.status_code == 200, r.text
    assert r.json()["parent_post_id"] == "post_abc"
