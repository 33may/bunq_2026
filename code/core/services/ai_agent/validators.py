"""Pure-function validation for emit_action and apply_page_patch payloads.

Validators return None on success or a short error message string on failure.
No DB access. Cross-page checks (e.g. line_id ∈ line_items) take page_context
as an argument and skip those checks when page_context is None (hash-
suppressed turn — see design doc).
"""
from __future__ import annotations

from decimal import Decimal


_VALID_ACTION_KINDS = {
    "request", "split", "pay_request", "scan", "settle_up", "comment",
    "update_profile",
}
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

    if kind == "settle_up":
        if "peer_id" not in payload or not payload["peer_id"]:
            return _err("settle_up: peer_id is required")
        return None

    if kind == "comment":
        if "post_id" not in payload or not payload["post_id"]:
            return _err("comment: post_id is required")
        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            return _err("comment: text must be a non-empty string")
        return None

    if kind == "update_profile":
        add = payload.get("add")
        if not isinstance(add, str) or not add.strip():
            return _err("update_profile: add must be a non-empty string")
        if len(add) > 500:
            return _err("update_profile: add too long (max 500 chars — one line)")
        return None

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
