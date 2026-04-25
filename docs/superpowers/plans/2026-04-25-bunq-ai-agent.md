# bunq AI Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app AI agent designed in `docs/superpowers/specs/2026-04-25-bunq-ai-agent-design.md` — per-turn streaming SSE backend, in-process tool agent, page-context multimodality, existing-page pre-fill via `emit_action` and `apply_page_patch`.

**Architecture:** New `code/core/services/ai_agent/` package with `runner.py`, `tools.py`, `prompts.py`, `validators.py`, `events.py`, `logging.py`. New endpoint `POST /ai/chat` returning SSE. New frontend `code/ui/src/ai/` package: `aiClient.js` (SSE parser), `pageContextRegistry.js`, `pagePatchBus.js`, `log.js`. The existing `aiMockReply` block in `App.jsx` is replaced with a real streaming controller. `AIActionCard` is extended with the 4 new preview kinds; pages register context getters on mount.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, `claude-agent-sdk==0.1.66`, pytest. React 19 (Vite), no extra frontend deps.

---

## Phase A — Backend: package skeleton, validators, read tools

The read tools come first because they are pure SQL queries the agent needs, are independently testable, and don't depend on `claude_agent_sdk` at all. Validators come second so the emitter tools have something concrete to wrap.

### Task A1: Create the `ai_agent` package skeleton

**Files:**
- Create: `code/core/services/ai_agent/__init__.py`
- Create: `code/core/services/ai_agent/logging.py`

- [ ] **Step 1: Create `__init__.py` (empty placeholder, exports added later)**

```python
"""AI agent — per-turn streaming runner over claude-agent-sdk.

Module layout:
  prompts.py    — system prompt template + page-context renderer
  validators.py — payload schemas for emit_action / apply_page_patch
  events.py     — typed SSE event dataclasses + serializer
  tools.py      — @tool definitions + per-request mcp server factory
  runner.py     — AgentRunner.run async generator
  logging.py    — structured logger helpers
"""
```

- [ ] **Step 2: Create `logging.py`**

```python
"""Structured logging helpers for the AI agent.

Usage:
    log = get_logger()
    log.info("turn.start", extra={"turn_id": tid, ...})
"""
from __future__ import annotations

import logging
import uuid


def get_logger() -> logging.Logger:
    return logging.getLogger("bunq.ai")


def new_turn_id() -> str:
    return uuid.uuid4().hex[:8]
```

- [ ] **Step 3: Commit**

```bash
git add code/core/services/ai_agent/
git commit -m "feat(ai): scaffold ai_agent package"
```

---

### Task A2: Validators — action and page_patch payload schemas

**Files:**
- Create: `code/core/services/ai_agent/validators.py`
- Create: `code/tests/ai_agent/__init__.py`
- Create: `code/tests/ai_agent/test_validators.py`

The validators are pure functions returning `None` on success or `str` (error message) on failure. No DB access — kept pure so they're trivially testable. Cross-checks against the page (line_id ∈ line_items, etc.) live here too, taking the page data as an argument.

- [ ] **Step 1: Write failing tests**

```python
# code/tests/ai_agent/test_validators.py
"""Pure validation of emit_action / apply_page_patch payloads."""
from __future__ import annotations

import pytest

from core.services.ai_agent.validators import (
    validate_action_payload,
    validate_page_patch_payload,
)


# ── action: request ──────────────────────────────────────────────────────
def test_action_request_ok():
    err = validate_action_payload("request", {
        "to_user_id": "u1", "amount": 12.50, "title": "pizza",
    })
    assert err is None


def test_action_request_missing_to_user_id():
    err = validate_action_payload("request", {"amount": 5})
    assert err and "to_user_id" in err


def test_action_request_negative_amount():
    err = validate_action_payload("request", {
        "to_user_id": "u1", "amount": -1,
    })
    assert err and "amount" in err


# ── action: split ────────────────────────────────────────────────────────
def test_action_split_ok():
    err = validate_action_payload("split", {
        "payer_user_id": "u1",
        "participant_user_ids": ["u2", "u3"],
        "total": 30.0,
        "parent_post_id": "p1",
    })
    assert err is None


def test_action_split_empty_participants():
    err = validate_action_payload("split", {
        "payer_user_id": "u1",
        "participant_user_ids": [],
        "total": 30,
    })
    assert err and "participant_user_ids" in err


# ── action: pay_request ──────────────────────────────────────────────────
def test_action_pay_request_ok():
    err = validate_action_payload("pay_request", {"request_id": "r1"})
    assert err is None


def test_action_pay_request_missing_id():
    err = validate_action_payload("pay_request", {})
    assert err and "request_id" in err


# ── action: scan ─────────────────────────────────────────────────────────
def test_action_scan_ok():
    err = validate_action_payload("scan", {})
    assert err is None


def test_action_unknown_kind():
    err = validate_action_payload("nuke", {})
    assert err and "unknown action kind" in err


# ── page_patch: receipt_assignments ──────────────────────────────────────
PAGE_RECEIPT = {
    "page_id": "receipt_review",
    "data": {
        "scan_id": "s1",
        "line_items": [{"id": "l1", "name": "milk", "price": 1.0},
                       {"id": "l2", "name": "beer", "price": 5.0}],
        "roster": [{"id": "u1", "name": "lena"}, {"id": "u2", "name": "alex"}],
    },
}


def test_patch_receipt_assignments_ok():
    err = validate_page_patch_payload(
        "receipt_assignments",
        {"assignments": {"l1": "u1", "l2": "everyone"}},
        page_context=PAGE_RECEIPT,
    )
    assert err is None


def test_patch_receipt_assignments_unknown_line():
    err = validate_page_patch_payload(
        "receipt_assignments",
        {"assignments": {"l99": "u1"}},
        page_context=PAGE_RECEIPT,
    )
    assert err and "l99" in err


def test_patch_receipt_assignments_unknown_assignee():
    err = validate_page_patch_payload(
        "receipt_assignments",
        {"assignments": {"l1": "u9999"}},
        page_context=PAGE_RECEIPT,
    )
    assert err and "u9999" in err


def test_patch_receipt_assignments_null_ok():
    err = validate_page_patch_payload(
        "receipt_assignments",
        {"assignments": {"l1": None}},
        page_context=PAGE_RECEIPT,
    )
    assert err is None


def test_patch_receipt_assignments_no_context_structural_only():
    """When page_context is None (hash-suppressed), only shape checks run."""
    err = validate_page_patch_payload(
        "receipt_assignments",
        {"assignments": {"l1": "u1"}},
        page_context=None,
    )
    assert err is None


# ── page_patch: request_form_fill ────────────────────────────────────────
def test_patch_request_form_fill_ok():
    err = validate_page_patch_payload(
        "request_form_fill",
        {"mode": "request", "payer_id": "u1", "total": 30.0,
         "debtors": [{"id": "u2", "amount": 30.0}]},
        page_context={"page_id": "request_form", "data": {}},
    )
    assert err is None


def test_patch_request_form_fill_bad_mode():
    err = validate_page_patch_payload(
        "request_form_fill",
        {"mode": "weird"},
        page_context={"page_id": "request_form", "data": {}},
    )
    assert err and "mode" in err


def test_patch_unknown_kind():
    err = validate_page_patch_payload("nuke", {}, page_context=None)
    assert err and "unknown page_patch kind" in err
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd code && pytest tests/ai_agent/test_validators.py -v
```

Expected: ALL FAIL with `ModuleNotFoundError: core.services.ai_agent.validators`

- [ ] **Step 3: Implement `validators.py`**

```python
# code/core/services/ai_agent/validators.py
"""Pure-function validation for emit_action and apply_page_patch payloads.

Validators return None on success or a short error message string on failure.
No DB access. Cross-page checks (e.g. line_id ∈ line_items) take page_context
as an argument and skip those checks when page_context is None (hash-
suppressed turn — see design doc).
"""
from __future__ import annotations

from decimal import Decimal


_VALID_ACTION_KINDS = {"request", "split", "pay_request", "scan"}
_VALID_PATCH_KINDS = {"receipt_assignments", "request_form_fill"}


def _err(msg: str) -> str:
    return msg


def _is_pos_number(v) -> bool:
    try:
        return Decimal(str(v)) > 0
    except Exception:
        return False


def validate_action_payload(kind: str, payload: dict) -> str | None:
    if kind not in _VALID_ACTION_KINDS:
        return _err(f"unknown action kind: {kind!r}")
    if not isinstance(payload, dict):
        return _err("payload must be an object")

    if kind == "request":
        if "to_user_id" not in payload or not payload["to_user_id"]:
            return _err("request: to_user_id is required")
        if "amount" not in payload or not _is_pos_number(payload["amount"]):
            return _err("request: amount must be > 0")
        return None

    if kind == "split":
        if "payer_user_id" not in payload or not payload["payer_user_id"]:
            return _err("split: payer_user_id is required")
        ids = payload.get("participant_user_ids") or []
        if not isinstance(ids, list) or not ids:
            return _err("split: participant_user_ids must be a non-empty list")
        if "total" not in payload or not _is_pos_number(payload["total"]):
            return _err("split: total must be > 0")
        return None

    if kind == "pay_request":
        if "request_id" not in payload or not payload["request_id"]:
            return _err("pay_request: request_id is required")
        return None

    if kind == "scan":
        return None  # empty payload is fine

    return _err(f"unknown action kind: {kind!r}")  # unreachable


def validate_page_patch_payload(
    kind: str,
    payload: dict,
    *,
    page_context: dict | None,
) -> str | None:
    if kind not in _VALID_PATCH_KINDS:
        return _err(f"unknown page_patch kind: {kind!r}")
    if not isinstance(payload, dict):
        return _err("payload must be an object")

    if kind == "receipt_assignments":
        assignments = payload.get("assignments")
        if not isinstance(assignments, dict):
            return _err("receipt_assignments: assignments must be an object")
        # Structural-only when no page_context this turn.
        if page_context is None:
            return None
        if page_context.get("page_id") != "receipt_review":
            return _err("receipt_assignments only applies on receipt_review page")
        data = page_context.get("data") or {}
        line_ids = {li["id"] for li in data.get("line_items") or []}
        roster_ids = {m["id"] for m in data.get("roster") or []}
        valid_assignees = roster_ids | {"everyone"}
        for line_id, assignee in assignments.items():
            if line_id not in line_ids:
                return _err(f"unknown line id: {line_id}")
            if assignee is None:
                continue
            if assignee not in valid_assignees:
                return _err(f"unknown assignee: {assignee}")
        return None

    if kind == "request_form_fill":
        mode = payload.get("mode")
        if mode is not None and mode not in ("request", "split"):
            return _err("request_form_fill: mode must be 'request' or 'split'")
        debtors = payload.get("debtors")
        if debtors is not None:
            if not isinstance(debtors, list):
                return _err("request_form_fill: debtors must be a list")
            for d in debtors:
                if not isinstance(d, dict) or "id" not in d:
                    return _err("request_form_fill: each debtor needs an id")
        if "total" in payload and payload["total"] is not None:
            if not _is_pos_number(payload["total"]):
                return _err("request_form_fill: total must be > 0")
        if page_context is None:
            return None
        if page_context.get("page_id") != "request_form":
            return _err("request_form_fill only applies on request_form page")
        return None

    return _err(f"unknown page_patch kind: {kind!r}")  # unreachable
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd code && pytest tests/ai_agent/test_validators.py -v
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add code/core/services/ai_agent/validators.py code/tests/ai_agent/
git commit -m "feat(ai): action + page_patch payload validators"
```

---

### Task A3: Read tools — pure data accessors over the DB

**Files:**
- Create: `code/core/services/ai_agent/reads.py`
- Create: `code/tests/ai_agent/test_reads.py`
- Create: `code/tests/ai_agent/conftest.py`

The read functions live in `reads.py` rather than `tools.py` so they can be tested without the agent SDK. `tools.py` (Task B1) will wrap each read as an `@tool`.

- [ ] **Step 1: Write the conftest fixture (seeded in-memory DB)**

```python
# code/tests/ai_agent/conftest.py
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
```

- [ ] **Step 2: Write failing tests for `reads.py`**

```python
# code/tests/ai_agent/test_reads.py
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
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
cd code && pytest tests/ai_agent/test_reads.py -v
```

Expected: ALL FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement `reads.py`**

```python
# code/core/services/ai_agent/reads.py
"""Read-only accessors used by the agent's read tools.

All functions take an explicit (db, house_id, user_id) — no implicit context,
no global state. Tools in tools.py wrap these as @tool definitions.

Returns plain JSON-able dicts (no SQLAlchemy objects leak out).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from ...data.models import (
    HouseMember, Split, SplitRequest, SplitRequestStatus, User,
)


def _split_dict(split: Split, name_by_id: dict[str, str]) -> dict:
    pending = accepted = failed = 0
    requests = []
    for r in split.requests:
        if r.status == SplitRequestStatus.pending:
            pending += 1
        elif r.status == SplitRequestStatus.accepted:
            accepted += 1
        elif r.status in (SplitRequestStatus.failed, SplitRequestStatus.rejected,
                          SplitRequestStatus.revoked):
            failed += 1
        requests.append({
            "id": r.id,
            "debtor": {"id": r.debtor_id, "name": name_by_id.get(r.debtor_id, "?")},
            "amount": str(r.amount),
            "currency": r.currency,
            "status": r.status.value,
        })
    settled = bool(split.requests) and pending == 0 and failed == 0
    return {
        "id": split.id,
        "title": split.title,
        "note": split.note,
        "payer": {"id": split.payer_id,
                  "name": name_by_id.get(split.payer_id, "?")},
        "total": str(split.total),
        "currency": split.currency,
        "parent_post_id": split.parent_post_id,
        "source_scan_id": split.source_scan_id,
        "requests": requests,
        "settled": settled,
        "n_pending": pending,
        "n_accepted": accepted,
        "n_failed": failed,
        "created_at": split.created_at.isoformat() if split.created_at else None,
    }


def _name_lookup(db: Session, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = db.query(User).filter(User.id.in_(ids)).all()
    return {u.id: u.name for u in rows}


def list_splits(
    db: Session, *, house_id: str, user_id: str, mine_only: bool = True,
) -> list[dict]:
    q = db.query(Split).filter(Split.house_id == house_id)
    if mine_only:
        my_ids = {
            r.split_id for r in db.query(SplitRequest)
            .filter(SplitRequest.debtor_id == user_id).all()
        }
        q = q.filter((Split.payer_id == user_id) | Split.id.in_(my_ids))
    splits = q.order_by(Split.created_at.desc()).all()
    ids: set[str] = set()
    for s in splits:
        ids.add(s.payer_id)
        for r in s.requests:
            ids.add(r.debtor_id)
    names = _name_lookup(db, ids)
    return [_split_dict(s, names) for s in splits]


def get_split(db: Session, *, house_id: str, split_id: str) -> dict | None:
    s = db.query(Split).filter_by(id=split_id, house_id=house_id).first()
    if s is None:
        return None
    ids = {s.payer_id} | {r.debtor_id for r in s.requests}
    return _split_dict(s, _name_lookup(db, ids))


def list_housemates(db: Session, *, house_id: str) -> list[dict]:
    rows = (
        db.query(User)
        .join(HouseMember, HouseMember.user_id == User.id)
        .filter(HouseMember.house_id == house_id)
        .all()
    )
    return [{"id": u.id, "name": u.name, "bunq_label": u.bunq_label} for u in rows]


def get_housemate(
    db: Session, *, house_id: str, name_or_id: str,
) -> dict | None:
    n = (name_or_id or "").strip()
    if not n:
        return None
    candidates = list_housemates(db, house_id=house_id)
    # exact id first, then case-insensitive name
    for m in candidates:
        if m["id"] == n:
            return m
    nl = n.lower()
    for m in candidates:
        if m["name"].lower() == nl:
            return m
    return None


def get_balance_with(
    db: Session, *, house_id: str, user_id: str, name_or_id: str,
) -> dict | None:
    """Net amount with one counterparty (positive = they owe me).

    Excludes accepted/settled requests so the balance reflects what's still
    open — same convention the home Requests section uses.
    """
    other = get_housemate(db, house_id=house_id, name_or_id=name_or_id)
    if other is None:
        return None
    breakdown: list[dict] = []
    net = Decimal("0.00")
    splits = (
        db.query(Split)
        .filter(Split.house_id == house_id)
        .filter((Split.payer_id == user_id) | (Split.payer_id == other["id"]))
        .all()
    )
    for s in splits:
        for r in s.requests:
            if r.status in (SplitRequestStatus.accepted, SplitRequestStatus.revoked,
                            SplitRequestStatus.rejected):
                continue
            if s.payer_id == user_id and r.debtor_id == other["id"]:
                net += r.amount
                breakdown.append({"split_id": s.id, "title": s.title,
                                  "amount": str(r.amount), "direction": "incoming"})
            elif s.payer_id == other["id"] and r.debtor_id == user_id:
                net -= r.amount
                breakdown.append({"split_id": s.id, "title": s.title,
                                  "amount": str(r.amount), "direction": "outgoing"})
    return {
        "counterparty": {"id": other["id"], "name": other["name"]},
        "net_amount": str(net.quantize(Decimal("0.01"))),
        "currency": "EUR",
        "breakdown": breakdown,
    }


def list_requests_with(
    db: Session, *, house_id: str, user_id: str, name_or_id: str,
    status: str = "pending",
) -> list[dict]:
    other = get_housemate(db, house_id=house_id, name_or_id=name_or_id)
    if other is None:
        return []
    out: list[dict] = []
    splits = (
        db.query(Split)
        .filter(Split.house_id == house_id)
        .filter((Split.payer_id == user_id) | (Split.payer_id == other["id"]))
        .all()
    )
    for s in splits:
        for r in s.requests:
            if status == "pending" and r.status != SplitRequestStatus.pending:
                continue
            if s.payer_id == user_id and r.debtor_id == other["id"]:
                direction = "incoming"
            elif s.payer_id == other["id"] and r.debtor_id == user_id:
                direction = "outgoing"
            else:
                continue  # not between user and other
            out.append({
                "request_id": r.id,
                "split_id": s.id,
                "split_title": s.title,
                "direction": direction,
                "counterparty": {"id": other["id"], "name": other["name"]},
                "amount": str(r.amount),
                "currency": r.currency,
                "status": r.status.value,
                "settled": r.status == SplitRequestStatus.accepted,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
    return out
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
cd code && pytest tests/ai_agent/test_reads.py -v
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add code/core/services/ai_agent/reads.py code/tests/ai_agent/conftest.py code/tests/ai_agent/test_reads.py
git commit -m "feat(ai): read accessors (splits, housemates, balance, requests)"
```

---

## Phase B — Backend: events, prompts, tools, runner

### Task B1: Typed SSE events

**Files:**
- Create: `code/core/services/ai_agent/events.py`
- Create: `code/tests/ai_agent/test_events.py`

- [ ] **Step 1: Write failing tests**

```python
# code/tests/ai_agent/test_events.py
from __future__ import annotations

from core.services.ai_agent.events import (
    ActionEvent, DoneEvent, ErrorEvent, PagePatchEvent, TextDeltaEvent,
    ToolResultEvent, ToolUseEvent, sse_frame,
)


def test_text_delta_serialization():
    ev = TextDeltaEvent(text="hi")
    s = sse_frame(ev)
    assert "event: text_delta" in s
    assert '"text": "hi"' in s
    assert s.endswith("\n\n")


def test_action_serialization_includes_payload():
    ev = ActionEvent(kind="request", summary="settle €5",
                     payload={"to_user_id": "u1", "amount": 5})
    s = sse_frame(ev)
    assert "event: action" in s
    assert '"kind": "request"' in s


def test_done_event_carries_turn_id():
    ev = DoneEvent(turn_id="abc1234", stop_reason="end_turn")
    s = sse_frame(ev)
    assert "event: done" in s
    assert '"turn_id": "abc1234"' in s


def test_error_event():
    s = sse_frame(ErrorEvent(message="boom"))
    assert "event: error" in s and '"message": "boom"' in s


def test_log_dict_redacts_nothing_useful():
    ev = ToolUseEvent(tool="list_splits", args={"mine_only": True})
    d = ev.log_dict()
    assert d["type"] == "tool_use"
    assert d["tool"] == "list_splits"
```

- [ ] **Step 2: Run, verify fail**

```bash
cd code && pytest tests/ai_agent/test_events.py -v
```

- [ ] **Step 3: Implement `events.py`**

```python
# code/core/services/ai_agent/events.py
"""Typed SSE events emitted by the agent runner.

Each event has a stable `type` string that becomes the SSE event name.
`sse_frame(ev)` returns the wire-format string ending with the required
double-newline separator.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass
class _Event:
    def to_data(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("type", None)
        return d

    def log_dict(self) -> dict[str, Any]:
        d = self.to_data()
        d["type"] = self.type  # type: ignore[attr-defined]
        return d


@dataclass
class TextDeltaEvent(_Event):
    text: str
    type: Literal["text_delta"] = "text_delta"


@dataclass
class ToolUseEvent(_Event):
    tool: str
    args: dict[str, Any] = field(default_factory=dict)
    type: Literal["tool_use"] = "tool_use"


@dataclass
class ToolResultEvent(_Event):
    tool: str
    ok: bool
    ms: int = 0
    summary: str | None = None
    type: Literal["tool_result"] = "tool_result"


@dataclass
class ActionEvent(_Event):
    kind: str
    summary: str
    payload: dict[str, Any] = field(default_factory=dict)
    type: Literal["action"] = "action"


@dataclass
class PagePatchEvent(_Event):
    kind: str
    payload: dict[str, Any] = field(default_factory=dict)
    type: Literal["page_patch"] = "page_patch"


@dataclass
class ErrorEvent(_Event):
    message: str
    type: Literal["error"] = "error"


@dataclass
class DoneEvent(_Event):
    turn_id: str
    stop_reason: str = "end_turn"
    type: Literal["done"] = "done"


Event = (
    TextDeltaEvent | ToolUseEvent | ToolResultEvent | ActionEvent
    | PagePatchEvent | ErrorEvent | DoneEvent
)


def sse_frame(ev: _Event) -> str:
    """Wire format:  event: <type>\\ndata: <json>\\n\\n"""
    return f"event: {ev.type}\ndata: {json.dumps(ev.to_data())}\n\n"


def sse_keepalive() -> str:
    """SSE comment line — keeps proxies from idling the connection."""
    return ": ping\n\n"
```

- [ ] **Step 4: Run, verify pass; commit**

```bash
cd code && pytest tests/ai_agent/test_events.py -v
git add code/core/services/ai_agent/events.py code/tests/ai_agent/test_events.py
git commit -m "feat(ai): typed SSE events"
```

---

### Task B2: System prompt + page-context renderer

**Files:**
- Create: `code/core/services/ai_agent/prompts.py`
- Create: `code/tests/ai_agent/test_prompts.py`

- [ ] **Step 1: Write failing tests**

```python
# code/tests/ai_agent/test_prompts.py
from __future__ import annotations

from core.services.ai_agent.prompts import (
    render_system_prompt, render_user_msg,
)


class _U:
    def __init__(self, **kw): self.__dict__.update(kw)


def test_system_prompt_includes_user_identity():
    u = _U(id="usr_1", name="anton", bunq_label="anton")
    h = _U(name="oak st")
    s = render_system_prompt(user=u, house=h)
    assert "anton" in s
    assert "usr_1" in s
    assert "oak st" in s
    # Load-bearing rules must be present
    assert "emit_action" in s
    assert "apply_page_patch" in s
    assert "page context" in s.lower()


def test_user_msg_with_page_context_inlines_json():
    msg = render_user_msg(
        message="hi",
        page_context={"page_id": "home", "data": {"balance": 100}},
        history=[],
    )
    assert "[page: home]" in msg
    assert '"balance"' in msg
    assert "hi" in msg


def test_user_msg_without_context_omits_page_block():
    msg = render_user_msg(message="hi", page_context=None, history=[])
    assert "[page:" not in msg
    assert "hi" in msg
```

- [ ] **Step 2: Run, fail**

```bash
cd code && pytest tests/ai_agent/test_prompts.py -v
```

- [ ] **Step 3: Implement `prompts.py`**

```python
# code/core/services/ai_agent/prompts.py
"""System prompt template and user message renderer.

`render_system_prompt(user, house)` produces the per-turn system prompt with
the current user baked in. The text is identical across turns for the same
user, so prompt caching hits automatically.

`render_user_msg(message, page_context, history)` inlines page_context (when
present) into the user turn body so historical context persists naturally
through the conversation history.
"""
from __future__ import annotations

import json
from typing import Any

_SYSTEM_TEMPLATE = """\
You are the bunq flatmate copilot — an in-app AI agent inside a house-finance
app for housemates splitting expenses via bunq RequestInquiries.

Voice: short, casual lowercase. No emojis. Match the app tone.

Current user: {user_name} (id: {user_id}, bunq_label: {bunq_label})
This is the person typing to you. "I", "me", "my" in the user's messages refer
to this person. The read tools you call are already scoped to this user and
their house — you cannot and need not pass a user id or house id to them.

Current house: {house_name}

You may receive PAGE CONTEXT describing what the user currently sees, formatted
inside the user's message as:

  [page: <page_id>]
  {{...page data json...}}

  <user message>

Use page context ONLY if the user's message references the screen. Do not
narrate the page unprompted. If no [page: ...] block is present, treat the
last context you saw in history as still current.

You have read tools (cheap — call as needed) and TWO emitter tools that
produce UI side-effects:

  emit_action(kind, payload, summary):
    Renders a card in chat with a button. Tapping the card opens an existing
    page already pre-filled with `payload`. Use this when the user is NOT
    already on the matching form. `summary` is a one-line label rendered on
    the card (e.g. "settle €80,20 with lena").

    Kinds:
      - request:     {{to_user_id, amount, currency?, title?, description?}}
      - split:       {{payer_user_id, participant_user_ids:[...], total,
                      currency?, parent_post_id?, title?, description?}}
      - pay_request: {{request_id}}              ← settle ONE specific pending request
      - scan:        {{}}                         ← opens the camera

  apply_page_patch(kind, payload):
    Mutates the screen the user is already on. Use this only when the
    [page: ...] block indicates the matching page is open.

    Kinds:
      - receipt_assignments  (page_id == 'receipt_review')
        {{assignments: {{ <line_id>: <user_id> | "everyone" | null }}}}
      - request_form_fill    (page_id == 'request_form')
        {{mode?, payer_id?, debtors?, total?, title?, description?}}   ← sparse merge

Decision rules:
- Settling: compute net via get_balance_with. If user is owed → emit_action
  'request'. If user owes → emit_action 'pay_request' with the specific
  request_id from list_requests_with. For "pay the X for Y" prefer
  pay_request with that specific request_id.
- Receipt-from-post matching: when receipt_review page data contains
  post_context, use the post text + comments to match line items to
  commenters before falling back to "everyone" or null.
- When you create a `split` action and the page is `feed_post_detail` or the
  receipt's post_context is present, include `parent_post_id` so the split
  links back to the post.
- Never invent ids or amounts — only use values returned by tools or values
  visible in the page block.
- After emit_action or apply_page_patch, stop. One short text line is fine;
  do not restate the payload — the card / page does that.
- If a tool errors, surface the error briefly and stop. Do not retry blindly.
"""


def render_system_prompt(*, user: Any, house: Any) -> str:
    return _SYSTEM_TEMPLATE.format(
        user_id=getattr(user, "id", ""),
        user_name=getattr(user, "name", ""),
        bunq_label=getattr(user, "bunq_label", "") or "",
        house_name=getattr(house, "name", ""),
    )


def render_user_msg(
    *, message: str, page_context: dict | None, history: list[dict] | None,
) -> str:
    """Build the user-turn body. The conversation history is passed to the
    SDK separately via `query()`'s prompt argument; this function only
    formats the *current* user turn."""
    # Note: history is currently NOT inlined here — claude-agent-sdk's
    # query() takes the current message; multi-turn state is provided via
    # the SDK's own resumption mechanism. For v1 we send only the last user
    # message and rely on the agent to ask follow-up questions in-turn.
    if page_context:
        page_id = page_context.get("page_id", "?")
        data = page_context.get("data", {})
        return f"[page: {page_id}]\n{json.dumps(data, default=str)}\n\n{message}"
    return message
```

> Note: in v1 `render_user_msg` does not inline history because the SDK's
> `query()` does not accept history natively. **History handling is wired in
> Task B5** via the SDK's resume / prompt-stitch mechanism — the runner
> joins history into a single string passed to `query()`. Until then,
> single-turn behaviour is correct.

- [ ] **Step 4: Run, pass; commit**

```bash
cd code && pytest tests/ai_agent/test_prompts.py -v
git add code/core/services/ai_agent/prompts.py code/tests/ai_agent/test_prompts.py
git commit -m "feat(ai): system prompt + user-msg renderer with page-context inline"
```

---

### Task B3: Tools — wrap reads + add emitter tools

**Files:**
- Create: `code/core/services/ai_agent/tools.py`
- Create: `code/tests/ai_agent/test_tools.py`

The tools module exposes `build_mcp_server(*, user, house, db, sse_queue, current_page_context)` which returns an MCP server with all tools registered. Tool functions close over the DB session and the `sse_queue` (an `asyncio.Queue` the runner drains).

> **Important for the implementer:** verify the exact `claude-agent-sdk` API
> for `@tool` and `create_sdk_mcp_server` against the installed version
> (`claude-agent-sdk==0.1.66`) before starting. The SDK has had API tweaks;
> the symbols imported below are correct as of writing but should be
> double-checked. Use `python -c "import claude_agent_sdk; print(dir(claude_agent_sdk))"`
> if anything fails.

- [ ] **Step 1: Write failing tests**

```python
# code/tests/ai_agent/test_tools.py
"""Tests for the tool implementations themselves (not the @tool wrapper).

We test the bodies via small wrapper functions that mirror the @tool
closures' behaviour, so we don't need to spin up the SDK.
"""
from __future__ import annotations

import asyncio
from decimal import Decimal

from core.services.ai_agent.tools import (
    build_tool_callables,
)


def test_tool_list_splits_returns_array(db, seeded):
    tools = build_tool_callables(db=db, user=seeded["anton"], house=seeded["house"],
                                 sse_queue=asyncio.Queue(),
                                 current_page_context_ref=lambda: None)
    out = tools["list_splits"](mine_only=True)
    assert isinstance(out, list) and len(out) == 2


def test_tool_get_balance_with_lena(db, seeded):
    tools = build_tool_callables(db=db, user=seeded["anton"], house=seeded["house"],
                                 sse_queue=asyncio.Queue(),
                                 current_page_context_ref=lambda: None)
    bal = tools["get_balance_with"](name_or_id="lena")
    assert Decimal(bal["net_amount"]) == Decimal("5.00")


def test_tool_emit_action_request_validates_and_queues(db, seeded):
    q = asyncio.Queue()
    tools = build_tool_callables(db=db, user=seeded["anton"], house=seeded["house"],
                                 sse_queue=q,
                                 current_page_context_ref=lambda: None)
    res = tools["emit_action"](
        kind="request", summary="settle €5",
        payload={"to_user_id": seeded["lena"].id, "amount": 5},
    )
    assert res == "action_emitted"
    ev = q.get_nowait()
    assert ev.type == "action"
    assert ev.kind == "request"


def test_tool_emit_action_invalid_returns_error(db, seeded):
    q = asyncio.Queue()
    tools = build_tool_callables(db=db, user=seeded["anton"], house=seeded["house"],
                                 sse_queue=q,
                                 current_page_context_ref=lambda: None)
    res = tools["emit_action"](kind="request", summary="x", payload={})
    assert isinstance(res, dict) and "error" in res
    assert q.empty()


def test_tool_emit_action_pay_request_unknown_id(db, seeded):
    q = asyncio.Queue()
    tools = build_tool_callables(db=db, user=seeded["anton"], house=seeded["house"],
                                 sse_queue=q,
                                 current_page_context_ref=lambda: None)
    res = tools["emit_action"](kind="pay_request", summary="x",
                                payload={"request_id": "does-not-exist"})
    assert isinstance(res, dict) and "error" in res


def test_tool_apply_page_patch_receipt_assignments(db, seeded):
    q = asyncio.Queue()
    page = {
        "page_id": "receipt_review",
        "data": {
            "scan_id": "s1",
            "line_items": [{"id": "l1", "name": "milk", "price": 1}],
            "roster": [{"id": seeded["lena"].id, "name": "lena"}],
        },
    }
    tools = build_tool_callables(
        db=db, user=seeded["anton"], house=seeded["house"], sse_queue=q,
        current_page_context_ref=lambda: page,
    )
    res = tools["apply_page_patch"](
        kind="receipt_assignments",
        payload={"assignments": {"l1": seeded["lena"].id}},
    )
    assert res == "patch_emitted"
    ev = q.get_nowait()
    assert ev.type == "page_patch"
    assert ev.kind == "receipt_assignments"


def test_tool_apply_page_patch_validates_against_current_page(db, seeded):
    q = asyncio.Queue()
    page = {
        "page_id": "receipt_review",
        "data": {"line_items": [{"id": "l1"}], "roster": [{"id": "u1", "name": "x"}]},
    }
    tools = build_tool_callables(
        db=db, user=seeded["anton"], house=seeded["house"], sse_queue=q,
        current_page_context_ref=lambda: page,
    )
    res = tools["apply_page_patch"](
        kind="receipt_assignments",
        payload={"assignments": {"l99": "u1"}},
    )
    assert isinstance(res, dict) and "error" in res
```

- [ ] **Step 2: Run, fail**

```bash
cd code && pytest tests/ai_agent/test_tools.py -v
```

- [ ] **Step 3: Implement `tools.py`**

```python
# code/core/services/ai_agent/tools.py
"""Tool implementations + per-request MCP server factory.

`build_mcp_server(...)` returns a claude-agent-sdk MCP server with all tools
registered. Tools close over (user, house, db, sse_queue, page-ref) so they
have everything they need without taking extra args from the model.

`build_tool_callables(...)` returns the same tool functions as plain
callables — used by tests so we don't need to spin up the SDK for unit
testing.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable

from sqlalchemy.orm import Session

from ...data.models import House, Split, SplitRequest, SplitRequestStatus, User
from . import reads
from .events import ActionEvent, PagePatchEvent, ToolResultEvent, ToolUseEvent
from .validators import validate_action_payload, validate_page_patch_payload

log = logging.getLogger("bunq.ai")

ALL_TOOL_NAMES = [
    "list_splits", "get_split",
    "list_housemates", "get_housemate",
    "get_balance_with", "list_requests_with",
    "list_recent_payments",
    "emit_action", "apply_page_patch",
]


def build_tool_callables(
    *,
    db: Session,
    user: User,
    house: House,
    sse_queue: asyncio.Queue,
    current_page_context_ref: Callable[[], dict | None],
    turn_id: str = "?",
) -> dict[str, Callable[..., Any]]:
    """Returns a dict of bare callables, one per tool name. Used both by the
    @tool wrappers (built in build_mcp_server) and by unit tests."""

    def _wrap(name: str, fn: Callable[..., Any]):
        def inner(**kwargs):
            t0 = time.monotonic()
            log.debug("tool.call", extra={"turn_id": turn_id, "tool": name, "args": kwargs})
            try:
                out = fn(**kwargs)
                ms = int((time.monotonic() - t0) * 1000)
                log.debug("tool.result", extra={"turn_id": turn_id, "tool": name,
                                                "ok": True, "ms": ms})
                return out
            except Exception as e:
                log.exception("tool.error", extra={"turn_id": turn_id,
                                                    "tool": name, "args": kwargs})
                return {"error": str(e)}
        return inner

    # ── reads ────────────────────────────────────────────────────────────
    def list_splits(mine_only: bool = True):
        return reads.list_splits(db, house_id=house.id, user_id=user.id,
                                  mine_only=mine_only)

    def get_split(split_id: str):
        out = reads.get_split(db, house_id=house.id, split_id=split_id)
        return out or {"error": "split not found"}

    def list_housemates():
        return reads.list_housemates(db, house_id=house.id)

    def get_housemate(name_or_id: str):
        out = reads.get_housemate(db, house_id=house.id, name_or_id=name_or_id)
        return out or {"error": "housemate not found"}

    def get_balance_with(name_or_id: str):
        out = reads.get_balance_with(
            db, house_id=house.id, user_id=user.id, name_or_id=name_or_id,
        )
        return out or {"error": "housemate not found"}

    def list_requests_with(name_or_id: str, status: str = "pending"):
        return reads.list_requests_with(
            db, house_id=house.id, user_id=user.id,
            name_or_id=name_or_id, status=status,
        )

    def list_recent_payments(count: int = 20):
        # Agent reads recent bunq payments via the existing client. Wrapped
        # here for surface symmetry; full implementation can stay thin since
        # bunq calls already return JSON-able dicts.
        from ..bunq import get_bunq_client
        try:
            client = get_bunq_client()
            return client.list_payments(user.bunq_label, count=count)
        except Exception as e:
            return {"error": f"bunq unavailable: {e}"}

    # ── emitters ─────────────────────────────────────────────────────────
    def emit_action(kind: str, summary: str, payload: dict):
        err = validate_action_payload(kind, payload)
        if err:
            log.warning("action.invalid", extra={
                "turn_id": turn_id, "kind": kind, "payload": payload, "err": err})
            return {"error": err}
        # Cross-DB checks per kind
        if kind == "pay_request":
            r = (db.query(SplitRequest)
                 .join(Split, Split.id == SplitRequest.split_id)
                 .filter(SplitRequest.id == payload["request_id"],
                         Split.house_id == house.id,
                         SplitRequest.status == SplitRequestStatus.pending)
                 .first())
            if r is None:
                return {"error": "request_id not found, not in your house, or not pending"}
        sse_queue.put_nowait(
            ActionEvent(kind=kind, summary=summary, payload=payload)
        )
        return "action_emitted"

    def apply_page_patch(kind: str, payload: dict):
        page = current_page_context_ref()
        err = validate_page_patch_payload(kind, payload, page_context=page)
        if err:
            log.warning("patch.invalid", extra={
                "turn_id": turn_id, "kind": kind, "payload": payload, "err": err})
            return {"error": err}
        sse_queue.put_nowait(PagePatchEvent(kind=kind, payload=payload))
        return "patch_emitted"

    return {
        "list_splits":          _wrap("list_splits", list_splits),
        "get_split":            _wrap("get_split", get_split),
        "list_housemates":      _wrap("list_housemates", list_housemates),
        "get_housemate":        _wrap("get_housemate", get_housemate),
        "get_balance_with":     _wrap("get_balance_with", get_balance_with),
        "list_requests_with":   _wrap("list_requests_with", list_requests_with),
        "list_recent_payments": _wrap("list_recent_payments", list_recent_payments),
        "emit_action":          _wrap("emit_action", emit_action),
        "apply_page_patch":     _wrap("apply_page_patch", apply_page_patch),
    }


def build_mcp_server(**kw):
    """Wrap build_tool_callables(...) into a claude-agent-sdk MCP server.

    The exact import path / decorator may differ across SDK versions —
    confirm against the installed claude-agent-sdk before tweaking.
    """
    from claude_agent_sdk import create_sdk_mcp_server, tool  # type: ignore

    callables = build_tool_callables(**kw)

    # Each @tool needs a Pydantic-style input schema. We use plain dicts —
    # the SDK accepts either a dict schema or a TypedDict class. Inputs are
    # lightweight on purpose; the agent passes named args.
    schemas: dict[str, dict] = {
        "list_splits":          {"mine_only": (bool, True)},
        "get_split":            {"split_id": (str, ...)},
        "list_housemates":      {},
        "get_housemate":        {"name_or_id": (str, ...)},
        "get_balance_with":     {"name_or_id": (str, ...)},
        "list_requests_with":   {"name_or_id": (str, ...), "status": (str, "pending")},
        "list_recent_payments": {"count": (int, 20)},
        "emit_action":          {"kind": (str, ...), "summary": (str, ...),
                                 "payload": (dict, ...)},
        "apply_page_patch":     {"kind": (str, ...), "payload": (dict, ...)},
    }

    @tool(name="list_splits",  description="List splits in the current user's house. Set mine_only=False to include splits the user isn't on. Returns array.")
    def t_list_splits(args): return callables["list_splits"](**args)

    @tool(name="get_split",    description="Get one split's full detail (payer, total, all child requests, statuses).")
    def t_get_split(args): return callables["get_split"](**args)

    @tool(name="list_housemates", description="List everyone in the current user's house: id, name, bunq_label.")
    def t_list_housemates(args): return callables["list_housemates"]()

    @tool(name="get_housemate", description="Resolve a fuzzy name (e.g. 'lena') or id to one housemate.")
    def t_get_housemate(args): return callables["get_housemate"](**args)

    @tool(name="get_balance_with", description="Net amount with one counterparty (positive = they owe me) plus the breakdown of contributing splits.")
    def t_get_balance_with(args): return callables["get_balance_with"](**args)

    @tool(name="list_requests_with", description="Open or all SplitRequests between the current user and one counterparty, with direction and status.")
    def t_list_requests_with(args): return callables["list_requests_with"](**args)

    @tool(name="list_recent_payments", description="Recent bunq payments on the current user's account. Use sparingly.")
    def t_list_recent_payments(args): return callables["list_recent_payments"](**args)

    @tool(name="emit_action", description="Render an action card in chat. Kinds: request, split, pay_request, scan. The card opens an existing pre-filled page when the user taps it. Provide a one-line `summary` for the card.")
    def t_emit_action(args): return callables["emit_action"](**args)

    @tool(name="apply_page_patch", description="Mutate the screen the user is currently on. Kinds: receipt_assignments, request_form_fill. Only valid when the matching page is open.")
    def t_apply_page_patch(args): return callables["apply_page_patch"](**args)

    return create_sdk_mcp_server(name="bunq", tools=[
        t_list_splits, t_get_split, t_list_housemates, t_get_housemate,
        t_get_balance_with, t_list_requests_with, t_list_recent_payments,
        t_emit_action, t_apply_page_patch,
    ])
```

- [ ] **Step 4: Run tools tests, pass**

```bash
cd code && pytest tests/ai_agent/test_tools.py -v
```

- [ ] **Step 5: Commit**

```bash
git add code/core/services/ai_agent/tools.py code/tests/ai_agent/test_tools.py
git commit -m "feat(ai): tool definitions + per-request mcp server factory"
```

---

### Task B4: Translator — claude-agent-sdk messages → SSE events

**Files:**
- Create: `code/core/services/ai_agent/translator.py`
- Create: `code/tests/ai_agent/test_translator.py`

The translator is a pure function from one SDK message object to a list of
typed events. Tested with stub objects mirroring the SDK's shapes — no SDK
import needed in the test.

- [ ] **Step 1: Write failing tests**

```python
# code/tests/ai_agent/test_translator.py
from __future__ import annotations

from types import SimpleNamespace as NS

from core.services.ai_agent.translator import translate_sdk_message


def test_translate_text_block():
    block = NS(text="hello", type="text")
    msg = NS(content=[block], __class__=type("AssistantMessage", (), {}))
    msg.__class__.__name__ = "AssistantMessage"
    out = translate_sdk_message(msg, kind="assistant")
    assert len(out) == 1 and out[0].type == "text_delta"
    assert out[0].text == "hello"


def test_translate_tool_use_block():
    block = NS(name="list_splits", input={"mine_only": True})
    out = translate_sdk_message(NS(content=[block]), kind="tool_use")
    assert out[0].type == "tool_use"
    assert out[0].tool == "list_splits"


def test_translate_tool_result_block_ok():
    block = NS(tool_use_id="x", content="[{...}]", is_error=False)
    out = translate_sdk_message(NS(content=[block]), kind="tool_result",
                                tool_name="list_splits")
    assert out[0].type == "tool_result"
    assert out[0].ok is True
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement `translator.py`**

```python
# code/core/services/ai_agent/translator.py
"""Map claude-agent-sdk message objects → list of typed SSE events.

We accept duck-typed objects so tests don't need to import the SDK. The
runner passes real SDK messages here at runtime.

Three message kinds we care about:
  - assistant: blocks with `text` are emitted as text_delta
  - tool_use:  blocks with `name` + `input` are tool_use events
  - tool_result: result for a tool — ok/error + ms (filled by the runner)
"""
from __future__ import annotations

from typing import Any

from .events import (
    Event, TextDeltaEvent, ToolResultEvent, ToolUseEvent,
)


def translate_sdk_message(msg: Any, *, kind: str = "assistant",
                          tool_name: str | None = None) -> list[Event]:
    out: list[Event] = []
    blocks = getattr(msg, "content", None) or []
    for b in blocks:
        if kind == "assistant":
            text = getattr(b, "text", None)
            if text:
                out.append(TextDeltaEvent(text=text))
        elif kind == "tool_use":
            name = getattr(b, "name", None) or tool_name or "?"
            args = getattr(b, "input", None) or {}
            out.append(ToolUseEvent(tool=name, args=args))
        elif kind == "tool_result":
            ok = not getattr(b, "is_error", False)
            out.append(ToolResultEvent(tool=tool_name or "?", ok=ok))
    return out
```

- [ ] **Step 4: Pass + commit**

```bash
cd code && pytest tests/ai_agent/test_translator.py -v
git add code/core/services/ai_agent/translator.py code/tests/ai_agent/test_translator.py
git commit -m "feat(ai): SDK message → SSE event translator"
```

---

### Task B5: AgentRunner — orchestrates a turn

**Files:**
- Create: `code/core/services/ai_agent/runner.py`
- Create: `code/tests/ai_agent/test_runner.py`

The runner spins up an in-process MCP server, calls `claude_agent_sdk.query()`,
async-iterates messages, drains the side-effect queue between SDK messages,
and yields SSE events. History is folded into the prompt as a transcript
prefix because the SDK's `query()` accepts a single `prompt`.

- [ ] **Step 1: Write failing tests (with SDK monkey-patched)**

```python
# code/tests/ai_agent/test_runner.py
"""Runner integration test with claude_agent_sdk.query monkey-patched."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace as NS

import pytest

from core.services.ai_agent import runner as runner_mod


class _AssistantMsg:
    """Mimic claude_agent_sdk.AssistantMessage."""
    def __init__(self, *blocks): self.content = list(blocks)


class _ResultMsg:
    """Mimic claude_agent_sdk.ResultMessage."""
    def __init__(self, stop_reason="end_turn"): self.stop_reason = stop_reason


@pytest.mark.asyncio
async def test_runner_emits_text_then_done(monkeypatch, db, seeded):
    async def fake_query(prompt, options):
        yield _AssistantMsg(NS(text="hi", type="text"))
        yield _ResultMsg()

    monkeypatch.setattr(runner_mod, "_sdk_query", fake_query)

    events = []
    async for ev in runner_mod.run(
        message="hi", history=[], page_context=None,
        user=seeded["anton"], house=seeded["house"], db=db,
    ):
        events.append(ev)
    types = [e.type for e in events]
    assert "text_delta" in types
    assert types[-1] == "done"


@pytest.mark.asyncio
async def test_runner_drains_side_effect_queue_after_each_msg(monkeypatch, db, seeded):
    """When a tool calls emit_action, the runner must surface the action
    event in the SSE stream (not silently swallow it)."""
    sse_queue_ref = {}

    async def fake_query(prompt, options):
        # Simulate the agent calling emit_action by reaching into the
        # sse_queue the runner created.
        from core.services.ai_agent.events import ActionEvent
        sse_queue_ref["q"].put_nowait(
            ActionEvent(kind="request", summary="settle €5",
                        payload={"to_user_id": "u1", "amount": 5}))
        yield _AssistantMsg(NS(text="done.", type="text"))
        yield _ResultMsg()

    # Patch the runner's queue-creation so the fake can grab a reference.
    real_queue_factory = runner_mod._make_sse_queue
    def spy(): q = real_queue_factory(); sse_queue_ref["q"] = q; return q
    monkeypatch.setattr(runner_mod, "_make_sse_queue", spy)
    monkeypatch.setattr(runner_mod, "_sdk_query", fake_query)

    events = [ev async for ev in runner_mod.run(
        message="settle up", history=[], page_context=None,
        user=seeded["anton"], house=seeded["house"], db=db,
    )]
    types = [e.type for e in events]
    assert "action" in types


@pytest.mark.asyncio
async def test_runner_swallows_sdk_exception(monkeypatch, db, seeded):
    async def fake_query(prompt, options):
        if False: yield  # type: ignore
        raise RuntimeError("boom")

    monkeypatch.setattr(runner_mod, "_sdk_query", fake_query)
    events = [ev async for ev in runner_mod.run(
        message="hi", history=[], page_context=None,
        user=seeded["anton"], house=seeded["house"], db=db,
    )]
    types = [e.type for e in events]
    assert "error" in types
    assert types[-1] == "done"
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement `runner.py`**

```python
# code/core/services/ai_agent/runner.py
"""AgentRunner.run — async generator of SSE events for one user turn.

Stateless per turn. History is folded into the prompt as a transcript
prefix. The MCP server is built per request with closures over the
resolved (user, house, db) — there is no way for the agent to switch
identity mid-turn.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

from sqlalchemy.orm import Session

from ...config import settings
from ...data.models import House, User
from .events import DoneEvent, ErrorEvent, Event
from .logging import get_logger, new_turn_id
from .prompts import render_system_prompt, render_user_msg
from .tools import ALL_TOOL_NAMES, build_mcp_server
from .translator import translate_sdk_message

log = get_logger()


# Hooks for tests to monkey-patch — keep these as module-level names so
# `monkeypatch.setattr(runner, "_sdk_query", fake)` works cleanly.
def _make_sse_queue() -> asyncio.Queue:
    return asyncio.Queue()


async def _sdk_query(prompt: str, options: Any):
    """Indirection over claude_agent_sdk.query so tests can substitute."""
    from claude_agent_sdk import query  # lazy import — avoids hard dep at test import
    async for msg in query(prompt=prompt, options=options):
        yield msg


def _build_options(*, user: User, house: House, mcp_server: Any):
    from claude_agent_sdk import ClaudeAgentOptions
    return ClaudeAgentOptions(
        system_prompt=render_system_prompt(user=user, house=house),
        model=settings.anthropic_model,
        mcp_servers={"bunq": mcp_server},
        allowed_tools=ALL_TOOL_NAMES,
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=8,
        env={"ANTHROPIC_API_KEY": settings.anthropic_api_key},
    )


def _fold_history(history: list[dict] | None, current: str) -> str:
    """Inline history into the user-turn prompt as a transcript prefix.

    Each item is `{role: 'user'|'ai', text: str}`. Output:

        previous turns:
        user: ...
        ai: ...

        current:
        <current user msg with optional [page: ...] block>
    """
    h = history or []
    if not h:
        return current
    transcript = "\n".join(f"{('user' if it['role'] == 'me' else it['role'])}: {it['text']}"
                           for it in h[-20:])
    return f"previous turns:\n{transcript}\n\ncurrent:\n{current}"


def _classify_msg(msg: Any) -> str:
    """Map an SDK message to its kind label for the translator."""
    n = type(msg).__name__
    if n == "AssistantMessage":
        return "assistant"
    if n == "ToolUseMessage" or n == "ToolUseBlock":
        return "tool_use"
    if n == "ToolResultMessage" or n == "ToolResultBlock":
        return "tool_result"
    if n == "ResultMessage":
        return "result"
    return "unknown"


async def run(
    *,
    message: str,
    history: list[dict] | None,
    page_context: dict | None,
    user: User,
    house: House,
    db: Session,
) -> AsyncIterator[Event]:
    turn_id = new_turn_id()
    log.info("turn.start", extra={
        "turn_id": turn_id, "user_id": user.id, "user_name": user.name,
        "page_id": (page_context or {}).get("page_id"),
        "msg_chars": len(message),
        "history_n": len(history or []),
    })

    sse_queue = _make_sse_queue()
    page_ref = {"v": page_context}
    mcp = build_mcp_server(
        user=user, house=house, db=db,
        sse_queue=sse_queue,
        current_page_context_ref=lambda: page_ref["v"],
        turn_id=turn_id,
    )
    options = _build_options(user=user, house=house, mcp_server=mcp)

    user_turn = render_user_msg(message=message, page_context=page_context, history=history)
    full_prompt = _fold_history(history, user_turn)

    n_events = 0
    try:
        async for sdk_msg in _sdk_query(full_prompt, options):
            kind = _classify_msg(sdk_msg)
            if kind == "result":
                continue  # we emit our own done event below
            for ev in translate_sdk_message(sdk_msg, kind=kind):
                log.debug("event.sent", extra={"turn_id": turn_id, **ev.log_dict()})
                n_events += 1
                yield ev
            # Drain any side-effect events (action / page_patch) the tools queued.
            while not sse_queue.empty():
                ev = sse_queue.get_nowait()
                log.debug("event.sent", extra={"turn_id": turn_id, **ev.log_dict()})
                n_events += 1
                yield ev
    except Exception:
        log.exception("turn.error", extra={"turn_id": turn_id})
        yield ErrorEvent(message="agent failed")
    finally:
        log.info("turn.end", extra={"turn_id": turn_id, "n_events": n_events})
        yield DoneEvent(turn_id=turn_id)
```

- [ ] **Step 4: Run, pass**

```bash
cd code && pytest tests/ai_agent/test_runner.py -v
```

- [ ] **Step 5: Commit**

```bash
git add code/core/services/ai_agent/runner.py code/tests/ai_agent/test_runner.py
git commit -m "feat(ai): AgentRunner — per-turn SSE generator"
```

---

### Task B6: SSE endpoint `POST /ai/chat`

**Files:**
- Create: `code/core/api/ai.py`
- Modify: `code/core/api/main.py` (add `from . import ai as ai_mod` + `app.include_router(ai_mod.router)`)
- Create: `code/tests/api/__init__.py`
- Create: `code/tests/api/test_ai_chat.py`

- [ ] **Step 1: Write failing test (HTTP-level integration with mocked runner)**

```python
# code/tests/api/test_ai_chat.py
"""Integration test for POST /ai/chat — exercises the FastAPI route, SSE
streaming, and dependency wiring with a mocked AgentRunner."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    """App + a fake runner that yields a known event sequence."""
    from core.services.ai_agent import events as ev_mod
    from core.services.ai_agent import runner as runner_mod

    async def fake_run(*, message, history, page_context, user, house, db):
        yield ev_mod.TextDeltaEvent(text="hi")
        yield ev_mod.ActionEvent(
            kind="request", summary="settle €5",
            payload={"to_user_id": "u_lena", "amount": 5})
        yield ev_mod.DoneEvent(turn_id="t12345")

    monkeypatch.setattr(runner_mod, "run", fake_run)

    # Pull the app late so the patched runner is in place.
    from core.api.main import app
    return TestClient(app)


def test_post_ai_chat_streams_events(client, signed_in_cookie):
    """`signed_in_cookie` fixture sets the auth cookie matching a seeded user."""
    r = client.post(
        "/ai/chat",
        json={"message": "settle up with lena", "history": [],
              "page_context": None, "client_turn_id": "abc"},
        cookies=signed_in_cookie,
    )
    assert r.status_code == 200
    body = r.text
    assert "event: text_delta" in body
    assert "event: action" in body
    assert "event: done" in body
    # action payload preserved
    action_line = next(l for l in body.splitlines()
                       if l.startswith("data:") and '"kind"' in l)
    payload = json.loads(action_line[len("data:"):].strip())
    assert payload["kind"] == "request"


def test_post_ai_chat_requires_auth(client):
    r = client.post("/ai/chat", json={"message": "x", "history": [],
                                       "client_turn_id": "abc"})
    assert r.status_code == 401
```

> The `signed_in_cookie` fixture needs to exist; if the project doesn't have
> one yet, create it in `code/tests/api/conftest.py`. It should seed the same
> sandbox user the lifespan creates and return `{"bunq_user": "anton"}`.
> Examine `code/core/api/auth.py` and `_seed_bunq_users` in `main.py` for the
> exact cookie format.

- [ ] **Step 2: Create the conftest if needed**

```python
# code/tests/api/conftest.py
"""Shared HTTP-test fixtures."""
from __future__ import annotations

import pytest

from core.api.main import _seed_bunq_users


@pytest.fixture(autouse=True)
def _ensure_seeded():
    _seed_bunq_users()


@pytest.fixture
def signed_in_cookie():
    return {"bunq_user": "anton"}
```

- [ ] **Step 3: Implement `code/core/api/ai.py`**

```python
# code/core/api/ai.py
"""POST /ai/chat — SSE streaming endpoint over the AgentRunner."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..data.models import House, User
from ..services.ai_agent import runner as runner_mod
from ..services.ai_agent.events import sse_frame, sse_keepalive
from .deps import current_house, current_user, get_db

log = logging.getLogger("bunq.ai")

router = APIRouter(tags=["ai"])


class HistoryItem(BaseModel):
    role: str  # 'me' | 'ai' | 'user' (we accept 'me' from the existing UI)
    text: str


class PageContext(BaseModel):
    page_id: str
    data: dict[str, Any] = Field(default_factory=dict)


class ChatIn(BaseModel):
    message: str
    history: list[HistoryItem] = Field(default_factory=list)
    page_context: PageContext | None = None
    client_turn_id: str


@router.post("/ai/chat")
async def post_ai_chat(
    body: ChatIn,
    me: User = Depends(current_user),
    house: House = Depends(current_house),
    db: Session = Depends(get_db),
):
    async def gen():
        # Keepalive co-routine — interleaves comments while no events are flowing.
        last_emit_ms = [0.0]
        async def keepalive():
            while True:
                await asyncio.sleep(15)
                yield sse_keepalive()

        history = [it.model_dump() for it in body.history]
        ctx = body.page_context.model_dump() if body.page_context else None
        try:
            async for ev in runner_mod.run(
                message=body.message, history=history, page_context=ctx,
                user=me, house=house, db=db,
            ):
                yield sse_frame(ev)
        except Exception:
            log.exception("ai.chat.unhandled", extra={
                "client_turn_id": body.client_turn_id})
            # Still close cleanly so the frontend doesn't hang.
            from ..services.ai_agent.events import DoneEvent, ErrorEvent
            yield sse_frame(ErrorEvent(message="agent failed"))
            yield sse_frame(DoneEvent(turn_id="error"))

    return StreamingResponse(gen(), media_type="text/event-stream")
```

> **Implementer note:** the keepalive coroutine in the snippet is illustrative.
> A simpler approach for v1: skip keepalive entirely and revisit if proxies
> ever cause issues. The current users hit FastAPI directly via the Vite dev
> proxy, which doesn't time out fast streams. If you need keepalive later,
> use `asyncio.Queue` + a `select()`-style merge over the runner generator
> and a 15 s timer.

- [ ] **Step 4: Wire into `main.py`**

```python
# code/core/api/main.py — add to existing imports
from . import ai as ai_mod
# … and after the other app.include_router calls:
app.include_router(ai_mod.router)
```

- [ ] **Step 5: Run tests**

```bash
cd code && pytest tests/api/test_ai_chat.py -v
```

- [ ] **Step 6: Commit**

```bash
git add code/core/api/ai.py code/core/api/main.py code/tests/api/
git commit -m "feat(ai): POST /ai/chat SSE endpoint"
```

---

### Task B7: Allow `parent_post_id` on `POST /splits`

**Files:**
- Modify: `code/core/api/splits.py:84-128` (extend `CreateSplitIn` and forward to `create_split`)
- Modify: `code/tests/` — add a test for the new field

The split-action card eventually opens `RequestSplitForm` in 'split' mode
pre-filled with `parent_post_id`. The form must be able to POST it through.
The DB column already exists and `create_split` already accepts the kwarg
(`code/core/services/splits.py:79`).

- [ ] **Step 1: Add field to `CreateSplitIn`**

```python
# code/core/api/splits.py:84
class CreateSplitIn(BaseModel):
    payer_user_id: str = Field(..., description="Who fronted the money")
    participant_user_ids: list[str] = Field(..., min_length=1)
    total: Decimal = Field(..., gt=0)
    title: str | None = None
    description: str | None = None
    currency: str = "EUR"
    parent_post_id: str | None = None     # ← new
```

- [ ] **Step 2: Forward to `create_split`** (around line 122):

```python
split = await run_in_threadpool(
    _create_split,
    db,
    house_id=house.id, payer=payer, participants=participants,
    total=body.total, title=title, description=body.description,
    currency=body.currency,
    parent_post_id=body.parent_post_id,    # ← new
)
```

- [ ] **Step 3: Test**

```python
# code/tests/api/test_splits_parent_post.py
def test_post_split_with_parent_post_id(client, signed_in_cookie):
    # listHousemates first to get ids
    mates = client.get("/housemates", cookies=signed_in_cookie).json()
    others = [m["id"] for m in mates if m["bunq_label"] != "anton"][:2]

    r = client.post("/splits", json={
        "payer_user_id": next(m["id"] for m in mates if m["bunq_label"] == "anton"),
        "participant_user_ids": others,
        "total": 30.00,
        "title": "ah run",
        "parent_post_id": "post_abc",
    }, cookies=signed_in_cookie)
    assert r.status_code == 200
    # parent_post_id should round-trip via the SplitOut serializer
    assert r.json()["parent_post_id"] == "post_abc"
```

- [ ] **Step 4: Run, commit**

```bash
cd code && pytest tests/api/test_splits_parent_post.py -v
git add code/core/api/splits.py code/tests/api/test_splits_parent_post.py
git commit -m "feat(splits): accept parent_post_id on POST /splits"
```

---

## Phase C — Frontend: ai/ modules + integration into App.jsx

### Task C1: Add `ai/` package — log + bus + registry

**Files:**
- Create: `code/ui/src/ai/log.js`
- Create: `code/ui/src/ai/pageContextRegistry.js`
- Create: `code/ui/src/ai/pagePatchBus.js`

These modules have no SSE / agent surface — they're pure utility. Trivially
testable manually in the browser console.

- [ ] **Step 1: Implement `log.js`**

```js
// code/ui/src/ai/log.js
const enabled = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem('ai_debug') !== '0'

const tag = '[ai]'

export const log = {
  send:        (turn, text, page, ctxSent) => enabled() && console.debug(tag, 'send', { turn, text, page, ctx: ctxSent ? 'sent' : 'skipped' }),
  event:       (turn, ev)                  => enabled() && console.debug(tag, 'event', turn, ev),
  actionTap:   (a)                          => enabled() && console.debug(tag, 'action.tap', a),
  patchApply:  (kind, page, ok)             => enabled() && console.debug(tag, 'page_patch.apply', { kind, page, ok }),
  error:       (turn, err)                  => enabled() && console.error(tag, 'error', turn, err),
}
```

- [ ] **Step 2: Implement `pageContextRegistry.js`**

```js
// code/ui/src/ai/pageContextRegistry.js
// One active page at a time — the topmost-open one. Pages call register on
// mount; later registrations overwrite earlier ones (ordering matches DOM
// stacking since later-mounted overlay sheets register last).

let active = null  // { pageId, getContext }
const order = []   // stack of registered pages

export function register(pageId, getContext) {
  // remove any prior entry for this page
  const i = order.findIndex(p => p.pageId === pageId)
  if (i >= 0) order.splice(i, 1)
  order.push({ pageId, getContext })
  active = order[order.length - 1]
}

export function unregister(pageId) {
  const i = order.findIndex(p => p.pageId === pageId)
  if (i >= 0) order.splice(i, 1)
  active = order[order.length - 1] || null
}

export function snapshot() {
  if (!active) return null
  try {
    const data = active.getContext() || {}
    return { page_id: active.pageId, data }
  } catch (e) {
    console.error('[ai] context.error', active.pageId, e)
    return null
  }
}

// stable JSON-stringify: sorted keys at every level. Used for hash-dedupe.
export function stableHash(value) {
  const seen = new WeakSet()
  const stringify = (v) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '"[circular]"'
      seen.add(v)
      if (Array.isArray(v)) return '[' + v.map(stringify).join(',') + ']'
      const keys = Object.keys(v).sort()
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stringify(v[k])).join(',') + '}'
    }
    return JSON.stringify(v)
  }
  return stringify(value)
}
```

- [ ] **Step 3: Implement `pagePatchBus.js`**

```js
// code/ui/src/ai/pagePatchBus.js
// Tiny pub/sub for AI-driven page patches. Pages subscribe to the kinds
// they accept; the AI controller calls emit() when a page_patch event
// arrives over the SSE stream.

const handlers = new Map()  // kind → Set<fn>

export function on(kind, fn) {
  if (!handlers.has(kind)) handlers.set(kind, new Set())
  handlers.get(kind).add(fn)
  return () => off(kind, fn)
}

export function off(kind, fn) {
  handlers.get(kind)?.delete(fn)
}

export function emit(kind, payload) {
  const set = handlers.get(kind)
  if (!set || set.size === 0) {
    console.warn('[ai] page_patch unhandled', kind, payload)
    return false
  }
  for (const fn of set) {
    try { fn(payload) }
    catch (e) { console.error('[ai] page_patch handler error', kind, e) }
  }
  return true
}
```

- [ ] **Step 4: Commit**

```bash
git add code/ui/src/ai/
git commit -m "feat(ui): ai/ — log + page context registry + patch bus"
```

---

### Task C2: SSE client (`aiClient.js`)

**Files:**
- Create: `code/ui/src/ai/aiClient.js`

The client uses native `fetch` with a streaming `ReadableStream`. There's no
EventSource because we need POST + cookies. Frame parser handles the SSE
format: lines beginning with `event:` / `data:`, blank line ends a frame.

- [ ] **Step 1: Implement `aiClient.js`**

```js
// code/ui/src/ai/aiClient.js
// Async iterator over POST /ai/chat. Yields { type, ... } events.

import { API_BASE } from '../api'

export async function* chat({ message, history, page_context, client_turn_id, signal } = {}) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify({
      message, history: history || [],
      page_context: page_context || null,
      client_turn_id,
    }),
    signal,
  })
  if (!res.ok) {
    const err = new Error(`POST /ai/chat → ${res.status}`)
    err.status = res.status
    try { err.body = await res.json() } catch {}
    throw err
  }
  if (!res.body) throw new Error('no response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const ev = parseFrame(frame)
      if (ev) yield ev
    }
  }
}

function parseFrame(frame) {
  // Skip comment lines (": ping").
  let type = null, dataLines = []
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) type = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!type || dataLines.length === 0) return null
  let data
  try { data = JSON.parse(dataLines.join('\n')) }
  catch { return null }
  return { type, ...data }
}
```

- [ ] **Step 2: Commit**

```bash
git add code/ui/src/ai/aiClient.js
git commit -m "feat(ui): SSE client for /ai/chat"
```

---

### Task C3: Replace `aiMockReply` send path with the real client

**Files:**
- Modify: `code/ui/src/App.jsx` — delete `aiMockReply` (around line 3198), rewrite the `onSend` handler in `BunqFlatmateApp` (around line 3344-3392), extend `handleAiAction` (around line 3395).

- [ ] **Step 1: Delete `aiMockReply` (lines ~3198-3224)**

Remove the entire function body. The new path doesn't use it.

- [ ] **Step 2: Rewrite the `useEffect` that wires `bunq:ai-send`**

Replace the existing effect (lines ~3344-3392) with:

```jsx
import * as aiClient from './ai/aiClient'
import * as registry from './ai/pageContextRegistry'
import * as bus from './ai/pagePatchBus'
import { log } from './ai/log'

// inside BunqFlatmateApp, replace the `useEffect` that listens for bunq:ai-send

const lastCtxHashRef = React.useRef(null)
const abortRef = React.useRef(null)

React.useEffect(() => {
  const toggle = () => setAiOpen(o => !o)

  const onSend = async (e) => {
    const text = e?.detail?.text?.trim()
    if (!text) return

    // record the user message
    setAiMessages(m => [...m, { role: 'me', text }])
    setAiPreviewHidden(false)
    setAiTail({ kind: 'thinking' })

    // cancel any previous in-flight stream
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const turnId = crypto.randomUUID()
    const snap = registry.snapshot()
    const hash = snap ? registry.stableHash(snap) : null
    const sendCtx = hash !== lastCtxHashRef.current
    lastCtxHashRef.current = hash

    log.send(turnId, text, snap?.page_id, sendCtx)

    let textBuf = ''
    let pendingAction = null

    try {
      for await (const ev of aiClient.chat({
        message: text,
        history: aiMessages.slice(-20),
        page_context: sendCtx ? snap : null,
        client_turn_id: turnId,
        signal: controller.signal,
      })) {
        log.event(turnId, ev)
        switch (ev.type) {
          case 'text_delta':
            textBuf += ev.text
            setAiTail({ kind: 'streaming', text: textBuf })
            break
          case 'tool_use':
            setAiTail(t => ({ ...(t || {}), status: friendlyStatus(ev.tool) }))
            break
          case 'tool_result':
            setAiTail(t => ({ ...(t || {}), status: null }))
            break
          case 'action':
            pendingAction = ev
            break
          case 'page_patch':
            bus.emit(ev.kind, ev.payload)
            log.patchApply(ev.kind, snap?.page_id, true)
            break
          case 'error':
            setAiTail({ kind: 'error', text: ev.message || 'agent error' })
            break
          case 'done': {
            const wired = pendingAction
              ? wireAction(pendingAction, (a) => handleAiAction(a))
              : null
            setAiMessages(m => [...m, { role: 'ai', text: textBuf, action: wired }])
            setAiTail({ kind: 'done', text: textBuf, action: wired })
            break
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return  // expected on next-message cancellation
      log.error(turnId, err)
      setAiTail({ kind: 'error', text: 'agent failed — try again' })
    }
  }

  window.addEventListener('bunq:ai-toggle', toggle)
  window.addEventListener('bunq:ai-send', onSend)
  return () => {
    window.removeEventListener('bunq:ai-toggle', toggle)
    window.removeEventListener('bunq:ai-send', onSend)
    abortRef.current?.abort()
  }
}, [aiMessages])  // re-bind so history slice is current
```

- [ ] **Step 3: Add helpers near the top of `App.jsx` (or in a small helper module)**

```js
function friendlyStatus(tool) {
  switch (tool) {
    case 'list_splits':         return 'checking splits…'
    case 'get_split':           return 'reading split…'
    case 'list_housemates':     return 'looking up housemates…'
    case 'get_housemate':       return 'finding housemate…'
    case 'get_balance_with':    return 'computing balance…'
    case 'list_requests_with':  return 'reading requests…'
    case 'list_recent_payments':return 'checking payments…'
    case 'emit_action':         return 'preparing…'
    case 'apply_page_patch':    return 'updating page…'
    default:                    return `${tool}…`
  }
}

function wireAction(ev, onClick) {
  // ev: { type:'action', kind, summary, payload }
  return {
    kind: ev.kind,
    label: actionLabel(ev),
    summary: ev.summary,
    payload: ev.payload,
    preview: actionPreview(ev),
    onClick: () => onClick({ kind: ev.kind, payload: ev.payload, summary: ev.summary }),
  }
}

function actionLabel(ev) {
  switch (ev.kind) {
    case 'request':     return 'review'
    case 'split':       return 'review split'
    case 'pay_request': return 'open'
    case 'scan':        return 'open camera'
    default:            return 'open'
  }
}

function actionPreview(ev) {
  // Renderable shape for AIActionCard. Each kind maps to its own preview
  // (see Task C4 for the render code).
  return { kind: ev.kind, ...ev.payload, summary: ev.summary }
}
```

- [ ] **Step 4: Extend `handleAiAction`**

```jsx
const handleAiAction = (a) => {
  log.actionTap(a)
  switch (a.kind) {
    case 'request':     openForm('request', { prefill: a.payload }); break
    case 'split':       openForm('split',   { prefill: a.payload }); break
    case 'pay_request': openItemForRequest(a.payload.request_id); break
    case 'scan':        setScanPhase('camera'); break
    default:            setAiOpen(true)
  }
}
```

- [ ] **Step 5: Implement `openItemForRequest`**

```jsx
const openItemForRequest = (requestId) => {
  // Resolve the parent split locally from the splits list.
  const split = splits?.find(s => s.requests?.some(r => r.id === requestId))
  if (!split) {
    setAiOpen(true)  // fallback — open the chat for context
    return
  }
  openItem({
    id: split.id, type: split.requests.length === 1 ? 'request' : 'bill',
    // pass the focused request id for ItemPage to scroll to
    focusRequestId: requestId,
    title: split.title, total: split.total,
    raw: split,
  })
}
```

- [ ] **Step 6: Extend `openForm` to accept a prefill**

Find `openForm` (~line 3332):

```jsx
const [formMode, setFormMode] = React.useState(null)
const [formOpen, setFormOpen] = React.useState(false)
const [formPrefill, setFormPrefill] = React.useState(null)
const openForm = (m, opts = {}) => {
  setFormMode(m)
  setFormPrefill(opts.prefill || null)
  requestAnimationFrame(() => setFormOpen(true))
}
const closeForm = () => {
  setFormOpen(false)
  setTimeout(() => { setFormMode(null); setFormPrefill(null) }, 400)
}
```

And pass it to `RequestSplitForm`:

```jsx
<RequestSplitForm
  mode={formMode}
  open={formOpen}
  onClose={closeForm}
  housemates={housemates}
  prefill={formPrefill}
  onSubmit={...}
/>
```

- [ ] **Step 7: Manual smoke**

Start the backend and frontend; from the chat bar type "settle up with lena".
Confirm an action card appears, tapping it opens `RequestSplitForm` with
`to_user_id` and `amount` filled. Hit submit and verify a request lands.

- [ ] **Step 8: Commit**

```bash
git add code/ui/src/App.jsx
git commit -m "feat(ui): replace aiMockReply with real /ai/chat client"
```

---

### Task C4: Extend `AIActionCard` with the four new preview kinds

**Files:**
- Modify: `code/ui/src/components.jsx:654-711` (`AIActionCard`)

Existing kinds in the file: `settle` (legacy). New kinds to render:
`request`, `split`, `pay_request`, `scan`. Remove `settle`.

- [ ] **Step 1: Replace the `AIActionCard` body**

```jsx
// code/ui/src/components.jsx — replace AIActionCard
export function AIActionCard({ action }) {
  const p = action.preview || {}
  const onClick = (e) => { e.stopPropagation(); action.onClick?.() }

  if (p.kind === 'request') {
    return (
      <CardRow
        title={action.summary || 'request'}
        amount={p.amount}
        cta={action.label || 'review'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'split') {
    return (
      <CardRow
        title={action.summary || `split €${Number(p.total).toFixed(2)}`}
        sub={`${(p.participant_user_ids || []).length} people`}
        cta={action.label || 'review split'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'pay_request') {
    return (
      <CardRow
        title={action.summary || 'pay request'}
        cta={action.label || 'open'}
        onClick={onClick}
      />
    )
  }

  if (p.kind === 'scan') {
    return (
      <CardRow
        title={action.summary || 'scan a receipt'}
        cta={action.label || 'open camera'}
        onClick={onClick}
      />
    )
  }

  // generic fallback
  return (
    <button onClick={onClick} style={{
      height: 38, borderRadius: 19, border: 'none',
      background: BF_COLORS.lime, color: '#000',
      fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
      cursor: 'pointer',
    }}>{action.label || 'open'}</button>
  )
}

function CardRow({ title, sub, amount, cta, onClick }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '0.5px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: 10,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SF, fontSize: 13, fontWeight: 600, color: BF_COLORS.text,
          letterSpacing: -0.1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{title}</div>
        {sub && <div style={{
          fontFamily: SF, fontSize: 11, color: BF_COLORS.sub, marginTop: 2,
        }}>{sub}</div>}
        {amount != null && (
          <div style={{
            fontFamily: SFR, fontSize: 15, fontWeight: 800, color: BF_COLORS.lime,
            letterSpacing: -0.3, marginTop: 2,
          }}>€{Number(amount).toFixed(2).replace('.', ',')}</div>
        )}
      </div>
      <button onClick={onClick} style={{
        flexShrink: 0, height: 36, padding: '0 14px', borderRadius: 18,
        background: BF_COLORS.lime, color: '#000', border: 'none',
        fontFamily: SF, fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
        cursor: 'pointer',
      }}>{cta}</button>
    </div>
  )
}
```

- [ ] **Step 2: Manual smoke** — same prompt as Task C3, confirm the new
preview rendering looks correct.

- [ ] **Step 3: Commit**

```bash
git add code/ui/src/components.jsx
git commit -m "feat(ui): AIActionCard kinds for request, split, pay_request, scan"
```

---

### Task C5: Per-page `register()` calls

**Files (all in `code/ui/src/`):**
- Modify: `App.jsx` — `HomeScreen` (look for `function HomeScreen` definition, register on mount).
- Modify: `App.jsx` — `MatePage` (search for `MatePage` def).
- Modify: `ItemPage.jsx` — register on open.
- Modify: `App.jsx` — `ThreadPage` def (post detail).
- Modify: `App.jsx` — `RequestSplitForm` integration (handler + register). The form lives in `RequestSplitForm.jsx`; modify there.
- Modify: `App.jsx` or scan flow file — receipt review screen.

For each page, the pattern is identical:

```jsx
React.useEffect(() => {
  registry.register('<page_id>', () => ({ /* serialize current state */ }))
  return () => registry.unregister('<page_id>')
}, [/* deps that affect the serialized shape */])
```

- [ ] **Step 1: HomeScreen (page_id = 'home')**

In `HomeScreen`:

```jsx
import * as registry from '../ai/pageContextRegistry'  // adjust path if HomeScreen lives in App.jsx itself

React.useEffect(() => {
  registry.register('home', () => ({
    balance: me?.balance ?? null,
    pending_in_count: (splits || []).filter(s => s.payer_id === me?.id && !s.settled).length,
    pending_out_count: (splits || []).reduce((n, s) =>
      n + (s.requests || []).filter(r => r.debtor_id === me?.id && r.status === 'pending').length, 0),
    unsettled_total: (splits || []).reduce((n, s) =>
      n + (s.settled ? 0 : Number(s.total || 0)), 0),
  }))
  return () => registry.unregister('home')
}, [me?.id, splits])
```

- [ ] **Step 2: MatePage (page_id = 'mate_detail')**

```jsx
React.useEffect(() => {
  if (!open || !mate) return
  registry.register('mate_detail', () => ({
    mate: { id: mate.id, name: mate.name },
    net_balance: mate.netBalance ?? null,
    recent_items: (mate.items || []).slice(0, 8).map(it => ({
      id: it.id, kind: it.type, title: it.title, amount: it.amount,
    })),
  }))
  return () => registry.unregister('mate_detail')
}, [open, mate?.id])
```

- [ ] **Step 3: ItemPage (page_id = 'item_detail')**

```jsx
// in ItemPage.jsx
import * as registry from './ai/pageContextRegistry'

React.useEffect(() => {
  if (!open || !item) return
  registry.register('item_detail', () => ({
    split: {
      id: item.id, title: item.title,
      payer: item.raw?.payer_id ? { id: item.raw.payer_id, name: item.raw.payer_name } : null,
      total: item.total, currency: item.raw?.currency || 'EUR',
      requests: (item.raw?.requests || []).map(r => ({
        id: r.id,
        debtor: { id: r.debtor_id, name: r.debtor_name },
        amount: r.amount, status: r.status,
      })),
      settled: item.raw?.settled,
    },
  }))
  return () => registry.unregister('item_detail')
}, [open, item?.id])
```

- [ ] **Step 4: ThreadPage (page_id = 'feed_post_detail')**

In `ThreadPage`:

```jsx
React.useEffect(() => {
  if (!open || !post) return
  registry.register('feed_post_detail', () => ({
    post_id: post.id,
    post_text: post.text,
    author: { id: post.author?.id, name: post.author?.name },
    comments: (post.comments || []).map(c => ({
      author: { id: c.author?.id, name: c.author?.name },
      text: c.text,
    })),
  }))
  return () => registry.unregister('feed_post_detail')
}, [open, post?.id])
```

- [ ] **Step 5: RequestSplitForm — register + accept page patches**

In `RequestSplitForm.jsx`:

```jsx
import * as registry from './ai/pageContextRegistry'
import * as bus from './ai/pagePatchBus'
import { log } from './ai/log'

// inside the component, after the draft state is set up:
React.useEffect(() => {
  if (!open) return
  registry.register('request_form', () => ({
    mode,
    draft: {
      payer_id: draft.payerId,
      debtors: (draft.debtors || []).map(d => ({ id: d.id, amount: d.amount })),
      total: draft.total,
      title: draft.title,
      description: draft.description,
    },
  }))
  return () => registry.unregister('request_form')
}, [open, mode, draft.payerId, draft.debtors, draft.total, draft.title, draft.description])

React.useEffect(() => {
  if (!open) return
  return bus.on('request_form_fill', (payload) => {
    log.patchApply('request_form_fill', 'request_form', true)
    // sparse merge
    setDraft(d => ({
      ...d,
      ...(payload.payer_id !== undefined ? { payerId: payload.payer_id } : {}),
      ...(payload.total !== undefined ? { total: payload.total } : {}),
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.debtors !== undefined ? { debtors: payload.debtors } : {}),
    }))
    if (payload.mode) onModeChange?.(payload.mode)  // if the form supports it
  })
}, [open])
```

Also wire `prefill`:

```jsx
const [draft, setDraft] = React.useState(() => initialDraft(mode, prefill))
React.useEffect(() => {
  if (open && prefill) setDraft(initialDraft(mode, prefill))
}, [open])  // only on open transition

function initialDraft(mode, prefill) {
  // existing init logic, layered with prefill values
}
```

- [ ] **Step 6: Receipt review (page_id = 'receipt_review') + patch handler**

The receipt review screen lives inside `ScanFlow` in `App.jsx`. Find the
review-phase render path and add:

```jsx
React.useEffect(() => {
  if (phase !== 'review' || !scan) return
  registry.register('receipt_review', () => ({
    scan_id: scan.id,
    total: scan.total,
    currency: scan.currency,
    line_items: (scan.line_items || []).map(li => ({
      id: li.id, name: li.name, price: li.price,
      assignee_id: assignments[li.id] ?? li.assigned_to ?? null,
    })),
    roster: housemates || [],
    uploader_id: scan.user_id,
    post_context: scan.post_context || null,  // see Task C6
  }))
  return () => registry.unregister('receipt_review')
}, [phase, scan?.id, assignments, housemates])

React.useEffect(() => {
  if (phase !== 'review') return
  return bus.on('receipt_assignments', (payload) => {
    setAssignments(prev => ({ ...prev, ...payload.assignments }))
    log.patchApply('receipt_assignments', 'receipt_review', true)
  })
}, [phase])
```

- [ ] **Step 7: Manual smoke** — open each page, type a generic prompt, watch the network panel: `page_context.page_id` should match.

- [ ] **Step 8: Commit**

```bash
git add code/ui/src/App.jsx code/ui/src/ItemPage.jsx code/ui/src/RequestSplitForm.jsx
git commit -m "feat(ui): per-page registration of context + patch handlers"
```

---

### Task C6: Thread `parent_post_id` from feed post → camera → review

**Files:**
- Modify: `code/ui/src/App.jsx` — `ThreadPage` (the "scan for this post" entrypoint), and the `ScanFlow` component.

The post → camera entry exists in some form already (or will be added).
The agent uses `post_context` from `receipt_review`. We thread it via the
scan-flow's local state.

- [ ] **Step 1: Add a `postContext` prop to `ScanFlow`**

```jsx
// in App.jsx — ScanFlow signature
function ScanFlow({ phase, setPhase, onClose, postContext, /*...*/ }) {
  // ... existing state ...

  // attach postContext to the scan once parsed
  React.useEffect(() => {
    if (scan && postContext && !scan.post_context) {
      // mutate locally so the registry getter sees it
      scan.post_context = postContext
    }
  }, [scan, postContext])
  // ... rest unchanged
}
```

- [ ] **Step 2: When ThreadPage triggers scan, pass postContext**

```jsx
// in ThreadPage
const startScanForPost = () => {
  setScanPostContext({
    post_id: post.id,
    post_text: post.text,
    author: { id: post.author?.id, name: post.author?.name },
    comments: (post.comments || []).map(c => ({
      author: { id: c.author?.id, name: c.author?.name }, text: c.text,
    })),
  })
  setScanPhase('camera')
  onClose()
}
```

`scanPostContext` is new state on `BunqFlatmateApp`, reset to `null` on scan close.

- [ ] **Step 3: Pre-fill `parent_post_id` in the finalize call**

The existing `services/finalize.py` already accepts an optional
`parent_post_id` (verify in code). On the frontend, when the receipt comes
from a post, set the field so the created Split links back. Find `finalizeScan`
or its call site and ensure `parent_post_id` flows through.

If `services/finalize.py` doesn't accept `parent_post_id` yet, extend it:

```python
# code/core/services/finalize.py — add kwarg, forward to create_split
def finalize_scan(db, *, scan, payer, parent_post_id: str | None = None):
    # ... existing logic up to create_split call ...
    split = create_split(
        db,
        house_id=scan.house_id, payer=payer, participants=...,
        total=scan.total, title=scan.merchant or "scan",
        description=scan.description,
        parent_post_id=parent_post_id,
        source_scan_id=scan.id,
        shares=...,
    )
    return split
```

And in `code/core/api/scans.py`, accept it on the body of `POST /scans/{id}/finalize`.

- [ ] **Step 4: Smoke**

From a feed post → start scan → upload → on review, type "split per the comments".
Confirm assignments populate matching commenters; on finalize, the Split row in
the DB has `parent_post_id` set. (Inspect with sqlite3 if needed.)

- [ ] **Step 5: Commit**

```bash
git add code/ui/src/App.jsx code/core/services/finalize.py code/core/api/scans.py
git commit -m "feat: thread parent_post_id post → camera → review → split"
```

---

## Phase D — Cleanup + smoke

### Task D1: Live-model smoke test (gated)

**Files:**
- Create: `code/tests/ai_agent/test_live.py` (marked `live`)

- [ ] **Step 1: Write the test**

```python
# code/tests/ai_agent/test_live.py
"""Hits the real model. Run with: pytest -m live tests/ai_agent/test_live.py"""
from __future__ import annotations

import os

import pytest


@pytest.mark.live
@pytest.mark.asyncio
async def test_settle_up_emits_action(db, seeded):
    if not os.getenv("ANTHROPIC_API_KEY"):
        pytest.skip("no ANTHROPIC_API_KEY")
    from core.services.ai_agent.runner import run

    types = []
    async for ev in run(
        message="settle up with lena",
        history=[],
        page_context=None,
        user=seeded["anton"], house=seeded["house"], db=db,
    ):
        types.append(ev.type)
    assert "action" in types or "text_delta" in types
    assert types[-1] == "done"
```

- [ ] **Step 2: Commit**

```bash
git add code/tests/ai_agent/test_live.py
git commit -m "test(ai): live-model smoke (gated)"
```

---

### Task D2: Update `IMPLEMENTED.md`

**Files:**
- Modify: `IMPLEMENTED.md`

Add a section noting the AI agent integration: `code/ui/src/ai/` modules,
new SSE endpoint, per-page registration, action/page_patch protocol.

- [ ] **Step 1: Append**

```markdown
### AI agent integration (2026-04-25)

- Backend: `code/core/services/ai_agent/` — runner, tools, prompts, validators,
  events. New endpoint `POST /ai/chat` (SSE).
- Frontend: `code/ui/src/ai/` — `aiClient.js` (SSE async iterator),
  `pageContextRegistry.js`, `pagePatchBus.js`, `log.js`.
- Each page registers `getContext()` on mount. Snapshot is hash-deduped
  across turns so unchanged pages don't re-send context.
- Action kinds: `request`, `split`, `pay_request`, `scan`. Page-patch kinds:
  `receipt_assignments`, `request_form_fill`. Spec in
  `docs/superpowers/specs/2026-04-25-bunq-ai-agent-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add IMPLEMENTED.md
git commit -m "docs: note ai agent integration"
```

---

## Self-review notes (already applied)

- Spec coverage: every spec section maps to a task above.
  - Architecture diagram → Tasks A–C as a whole.
  - Backend file layout → A1–A3, B1–B5, B6.
  - Endpoint shape → B6.
  - AgentRunner pseudocode → B5.
  - Read tools list → A3 + B3.
  - Emitter tools → A2 (validators) + B3 (tools).
  - System prompt → B2.
  - SSE event types → B1.
  - Auth → B6 (deps wired through).
  - Logging contract → A1 (helpers), threaded through every other task.
  - Page context contract → C5.
  - Snapshot suppression → C1 (hash) + C3 (handler).
  - Frontend modules → C1, C2.
  - Send handler → C3.
  - Action dispatch → C3 (`handleAiAction`).
  - AIActionCard kinds → C4.
  - Per-page wiring → C5.
  - parent_post_id thread → B7 (backend accept) + C6 (frontend thread).
  - Error handling matrix → covered in B5 (try/except), B6 (route-level), C3 (client).
  - Testing approach → A2/A3/B1–B5 unit tests + B6 integration test + D1 live smoke.

- Placeholder scan: no TBDs in code blocks. Two implementer notes flagged
  (SDK API verification, keepalive simplification) but these are guidance,
  not gaps in the plan.

- Type consistency: validators / tools / events use the same kind names
  throughout (`request`, `split`, `pay_request`, `scan`,
  `receipt_assignments`, `request_form_fill`). `current_page_context_ref`
  is the same name in `tools.py` and `runner.py`. Tool names listed in
  `ALL_TOOL_NAMES` match those defined in `build_mcp_server`.
