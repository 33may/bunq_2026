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
