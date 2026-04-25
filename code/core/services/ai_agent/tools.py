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
import json
import logging
import time
from typing import Any, Callable

from sqlalchemy.orm import Session

from ...data.models import House, Split, SplitRequest, SplitRequestStatus, User
from . import reads
from .events import ActionEvent, PagePatchEvent
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
        # Uses the existing bunq client — wrap defensively since bunq may be
        # unreachable in dev / sandbox tests.
        try:
            from ..bunq import get_bunq_client
            client = get_bunq_client()
            if not user.bunq_label:
                return {"error": "user has no bunq linkage"}
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


def _result(value: Any) -> dict[str, Any]:
    """Wrap a plain Python value into the MCP tool result envelope."""
    text = json.dumps(value) if not isinstance(value, str) else value
    return {"content": [{"type": "text", "text": text}]}


def build_mcp_server(**kw) -> Any:
    """Wrap build_tool_callables(...) into a claude-agent-sdk MCP server.

    The @tool decorator (SDK 0.1.66) signature:
        @tool(name, description, input_schema)
        async def handler(args: dict) -> {"content": [...]}

    input_schema is a dict mapping param names to types, or a TypedDict.
    """
    from claude_agent_sdk import create_sdk_mcp_server, tool  # type: ignore

    callables = build_tool_callables(**kw)

    @tool(
        name="list_splits",
        description="List splits in the current user's house. Set mine_only=False to include splits the user isn't on. Returns array.",
        input_schema={"mine_only": bool},
    )
    async def t_list_splits(args):
        return _result(callables["list_splits"](mine_only=args.get("mine_only", True)))

    @tool(
        name="get_split",
        description="Get one split's full detail (payer, total, all child requests, statuses).",
        input_schema={"split_id": str},
    )
    async def t_get_split(args):
        return _result(callables["get_split"](split_id=args["split_id"]))

    @tool(
        name="list_housemates",
        description="List everyone in the current user's house: id, name, bunq_label.",
        input_schema={},
    )
    async def t_list_housemates(args):
        return _result(callables["list_housemates"]())

    @tool(
        name="get_housemate",
        description="Resolve a fuzzy name (e.g. 'lena') or id to one housemate.",
        input_schema={"name_or_id": str},
    )
    async def t_get_housemate(args):
        return _result(callables["get_housemate"](name_or_id=args["name_or_id"]))

    @tool(
        name="get_balance_with",
        description="Net amount with one counterparty (positive = they owe me) plus the breakdown of contributing splits.",
        input_schema={"name_or_id": str},
    )
    async def t_get_balance_with(args):
        return _result(callables["get_balance_with"](name_or_id=args["name_or_id"]))

    @tool(
        name="list_requests_with",
        description="Open or all SplitRequests between the current user and one counterparty, with direction and status.",
        input_schema={"name_or_id": str, "status": str},
    )
    async def t_list_requests_with(args):
        return _result(callables["list_requests_with"](
            name_or_id=args["name_or_id"],
            status=args.get("status", "pending"),
        ))

    @tool(
        name="list_recent_payments",
        description="Recent bunq payments on the current user's account. Use sparingly.",
        input_schema={"count": int},
    )
    async def t_list_recent_payments(args):
        return _result(callables["list_recent_payments"](count=args.get("count", 20)))

    @tool(
        name="emit_action",
        description=(
            "Render an action card in chat. Kinds: request, split, pay_request, scan. "
            "The card opens an existing pre-filled page when the user taps it. "
            "Provide a one-line `summary` for the card."
        ),
        input_schema={"kind": str, "summary": str, "payload": dict},
    )
    async def t_emit_action(args):
        return _result(callables["emit_action"](
            kind=args["kind"],
            summary=args["summary"],
            payload=args.get("payload", {}),
        ))

    @tool(
        name="apply_page_patch",
        description=(
            "Mutate the screen the user is currently on. "
            "Kinds: receipt_assignments, request_form_fill. "
            "Only valid when the matching page is open."
        ),
        input_schema={"kind": str, "payload": dict},
    )
    async def t_apply_page_patch(args):
        return _result(callables["apply_page_patch"](
            kind=args["kind"],
            payload=args.get("payload", {}),
        ))

    return create_sdk_mcp_server(name="bunq", tools=[
        t_list_splits, t_get_split, t_list_housemates, t_get_housemate,
        t_get_balance_with, t_list_requests_with, t_list_recent_payments,
        t_emit_action, t_apply_page_patch,
    ])
