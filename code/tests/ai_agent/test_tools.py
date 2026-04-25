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
