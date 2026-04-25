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

from ...data.models import (
    ChatAttachmentKind, ChatThreadKind,
    FeedPost, House, Split, SplitRequest, SplitRequestStatus, User,
)
from .. import chats as chat_svc
from .. import profiles as profiles_svc
from .. import regulars as regulars_svc
from . import reads
from .events import ActionEvent, PagePatchEvent
from .validators import validate_action_payload, validate_page_patch_payload

log = logging.getLogger("bunq.ai")

_BARE_TOOL_NAMES = [
    "list_splits", "get_split",
    "list_housemates", "get_housemate",
    "get_balance_with", "list_balances",
    "list_requests_with",
    "list_recent_payments", "list_payments_with",
    "get_bunq_balance",
    "list_posts", "get_post",
    "list_unread",
    "list_regulars",
    "read_my_profile",
    "emit_action", "apply_page_patch",
    "send_chat_message",
]

# allowed_tools must use the MCP-qualified form `mcp__<server>__<tool>` for
# the Claude CLI to match the actual MCP tools we register. Without the prefix,
# the CLI silently falls back to its built-in toolbelt (ToolSearch etc.).
ALL_TOOL_NAMES = [f"mcp__bunq__{n}" for n in _BARE_TOOL_NAMES]


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
            # Note: `args` is a reserved LogRecord attribute — never put it
            # in `extra`. Use plain positional formatting instead.
            log.info("tool.call turn=%s tool=%s kwargs=%s", turn_id, name, kwargs)
            try:
                out = fn(**kwargs)
                ms = int((time.monotonic() - t0) * 1000)
                log.info("tool.ok turn=%s tool=%s ms=%d", turn_id, name, ms)
                return out
            except Exception as e:
                log.exception("tool.error turn=%s tool=%s kwargs=%s",
                              turn_id, name, kwargs)
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

    def list_balances():
        return reads.list_balances(db, house_id=house.id, user_id=user.id)

    def list_payments_with(name_or_id: str, count: int = 20):
        return reads.list_payments_with(
            db, house_id=house.id, user_id=user.id,
            name_or_id=name_or_id, count=count,
        )

    def list_posts(limit: int = 10):
        return reads.list_posts(db, house_id=house.id, limit=limit)

    def get_post(post_id: str):
        out = reads.get_post(db, house_id=house.id, post_id=post_id)
        return out or {"error": "post not found"}

    def list_unread():
        return reads.list_unread(db, house_id=house.id, user_id=user.id)

    def list_regulars():
        """All recurring household bills (rent, gas, water, electricity,
        internet, netflix, …) for the current house. Each row carries
        title, amount, currency, billing_day (1-31), next_due (ISO date),
        and days_until_due."""
        return regulars_svc.list_regulars(db, house_id=house.id)

    def read_my_profile():
        """Read the current user's personal profile MD file.

        The profile is a free-form markdown document the agent maintains over
        time as it learns about the user (preferences, dietary needs, schedule
        quirks, anything they've explicitly asked to be remembered). Empty
        string when the file doesn't yet exist — that's the signal to start
        one.
        """
        store = profiles_svc.get_profile_store()
        return {"text": store.load(user.id)}

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

    def get_bunq_balance():
        """Live balance on the user's primary bunq monetary account.

        Returns {balance, currency, iban_last4, account_id, description}.
        Wraps the bunq sandbox call defensively — sandbox often returns TLS
        EOF, in which case we surface the error instead of crashing the turn.
        """
        if not user.bunq_label:
            return {"error": "user has no bunq linkage"}
        try:
            from ..bunq import get_bunq_client
            client = get_bunq_client()
            wrappers = client.list_accounts(user.bunq_label)
        except Exception as e:
            return {"error": f"bunq sandbox error: {e}"}
        for wrap in wrappers:
            for key in ("MonetaryAccountBank", "MonetaryAccountJoint", "MonetaryAccountSavings"):
                acc = wrap.get(key)
                if acc is None:
                    continue
                bal = acc.get("balance") or {}
                iban = None
                for a in acc.get("alias", []) or []:
                    if a.get("type") == "IBAN":
                        iban = a.get("value")
                        break
                return {
                    "balance": str(bal.get("value", "0")),
                    "currency": bal.get("currency") or acc.get("currency") or "EUR",
                    "iban_last4": iban[-4:] if iban else None,
                    "account_id": acc.get("id"),
                    "description": acc.get("description"),
                }
        return {"error": "no monetary account found"}

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
        if kind == "comment":
            p = (db.query(FeedPost)
                 .filter(FeedPost.id == payload["post_id"],
                         FeedPost.house_id == house.id)
                 .first())
            if p is None:
                return {"error": "post_id not found or not in your house"}
        sse_queue.put_nowait(
            ActionEvent(kind=kind, summary=summary, payload=payload)
        )
        return "action requested"

    def send_chat_message(
        name_or_id: str,
        body: str,
        attachment_kind: str | None = None,
        attachment_id: str | None = None,
    ):
        """Send a chat message AS the current user. Use to ask a housemate
        for clarification or to relay info on the user's behalf.

        - `name_or_id` is fuzzy-matched (same as get_housemate).
        - When `attachment_kind`/`attachment_id` are set, the message
          carries an inline reference to that split or split_request and
          the recipient's chat will render an item card above the bubble.
        """
        other = reads.get_housemate(db, house_id=house.id, name_or_id=name_or_id)
        if other is None:
            return {"error": "housemate not found"}
        if other["id"] == user.id:
            return {"error": "cannot DM yourself"}
        att_kind: ChatAttachmentKind | None = None
        if attachment_kind:
            try:
                att_kind = ChatAttachmentKind(attachment_kind)
            except ValueError:
                return {"error": f"unknown attachment_kind: {attachment_kind}"}
        try:
            msg = chat_svc.save_message(
                db,
                house_id=house.id, sender_id=user.id,
                kind=ChatThreadKind.dm,
                key=chat_svc.dm_thread_key(user.id, other["id"]),
                body=body,
                attachment_kind=att_kind,
                attachment_id=attachment_id,
            )
        except (PermissionError, ValueError) as e:
            return {"error": str(e)}
        chat_svc.publish(db, msg, sender_name=user.name)
        return {
            "sent_to": {"id": other["id"], "name": other["name"]},
            "message_id": msg.id,
        }

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
        "list_balances":        _wrap("list_balances", list_balances),
        "list_requests_with":   _wrap("list_requests_with", list_requests_with),
        "list_recent_payments": _wrap("list_recent_payments", list_recent_payments),
        "list_payments_with":   _wrap("list_payments_with", list_payments_with),
        "get_bunq_balance":     _wrap("get_bunq_balance", get_bunq_balance),
        "list_posts":           _wrap("list_posts", list_posts),
        "get_post":             _wrap("get_post", get_post),
        "list_unread":          _wrap("list_unread", list_unread),
        "list_regulars":        _wrap("list_regulars", list_regulars),
        "read_my_profile":      _wrap("read_my_profile", read_my_profile),
        "emit_action":          _wrap("emit_action", emit_action),
        "apply_page_patch":     _wrap("apply_page_patch", apply_page_patch),
        "send_chat_message":    _wrap("send_chat_message", send_chat_message),
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
        name="list_balances",
        description=(
            "Net balances with every housemate (one row per non-flat counterparty). "
            "Use for 'who do I owe?' / 'who owes me?' / 'where do I stand?' — replaces "
            "calling get_balance_with for each housemate. Sorted by absolute amount."
        ),
        input_schema={},
    )
    async def t_list_balances(args):
        return _result(callables["list_balances"]())

    @tool(
        name="get_bunq_balance",
        description=(
            "Live balance on the user's primary bunq monetary account. "
            "Use for 'how much do I have', 'what's my balance', 'can I afford X'. "
            "Returns {balance, currency, iban_last4, account_id, description}. "
            "May return {error: ...} if the bunq sandbox is unreachable."
        ),
        input_schema={},
    )
    async def t_get_bunq_balance(args):
        return _result(callables["get_bunq_balance"]())

    @tool(
        name="list_payments_with",
        description=(
            "Recent SplitRequests between the current user and one counterparty "
            "(both directions, all statuses). Use for 'transactions with X', "
            "'history with X', 'how much have I paid Y this month?'."
        ),
        input_schema={"name_or_id": str, "count": int},
    )
    async def t_list_payments_with(args):
        return _result(callables["list_payments_with"](
            name_or_id=args["name_or_id"],
            count=args.get("count", 20),
        ))

    @tool(
        name="list_posts",
        description=(
            "Recent feed posts in the current house, newest first. Each row has "
            "id, text, author, comment_count. Use for 'what's new in the feed?', "
            "'any new posts?'. Then call get_post(post_id) for full comments."
        ),
        input_schema={"limit": int},
    )
    async def t_list_posts(args):
        return _result(callables["list_posts"](limit=args.get("limit", 10)))

    @tool(
        name="get_post",
        description="One feed post with author + full comment list (each comment has author + text + created_at).",
        input_schema={"post_id": str},
    )
    async def t_get_post(args):
        return _result(callables["get_post"](post_id=args["post_id"]))

    @tool(
        name="list_unread",
        description=(
            "Everything the user hasn't read yet: unread DMs, unread split chats, "
            "unread split-request chats, and new comments on the user's own posts. "
            "Use for 'anything new?', 'did I miss anything?', 'what's the latest?'. "
            "Returns {dms, split_threads, request_threads, post_replies}."
        ),
        input_schema={},
    )
    async def t_list_unread(args):
        return _result(callables["list_unread"]())

    @tool(
        name="list_regulars",
        description=(
            "All recurring household bills (rent, gas, water, electricity, "
            "internet, netflix, …). Each row: {id, title, amount, currency, "
            "billing_day (1-31), cadence, next_due (ISO), days_until_due, "
            "color, emoji}. Sorted soonest-first. Use for 'what's coming up', "
            "'when's rent due', 'how much do we pay for utilities monthly'."
        ),
        input_schema={},
    )
    async def t_list_regulars(args):
        return _result(callables["list_regulars"]())

    @tool(
        name="read_my_profile",
        description=(
            "Read the current user's personal profile (a markdown file you "
            "maintain as you learn about them — dietary preferences, schedule "
            "quirks, anything they've asked to be remembered). Returns "
            "{text: <md>}; text is empty when the profile hasn't been started "
            "yet. Always read before proposing an update so you can preserve "
            "existing content."
        ),
        input_schema={},
    )
    async def t_read_my_profile(args):
        return _result(callables["read_my_profile"]())

    @tool(
        name="emit_action",
        description=(
            "Render an action card in chat. Kinds: request, split, pay_request, scan, "
            "settle_up, comment, update_profile. The card opens an existing pre-filled "
            "page when the user taps it. Provide a one-line `summary` for the card. "
            "comment payload: {post_id, text} — opens the thread with the comment "
            "field pre-filled, user taps send. "
            "update_profile payload: {add: <one short bullet line>} — appends that "
            "single line to the user's memory MD. The card shows the proposed line; "
            "the sheet appends to existing content and lets the user edit before "
            "saving. NEVER pass full MD or multi-line content here."
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
        name="send_chat_message",
        description=(
            "Send a chat message AS the current user to one housemate. Use this to ask "
            "for clarification (e.g. 'what was the receipt for?') or to relay info on the "
            "user's behalf. The recipient sees it instantly in their bunq DM with the user. "
            "Optionally attach a split or split_request id; the recipient's chat will then "
            "render an item card stacked above the bubble."
        ),
        input_schema={
            "name_or_id": str, "body": str,
            "attachment_kind": str, "attachment_id": str,
        },
    )
    async def t_send_chat_message(args):
        return _result(callables["send_chat_message"](
            name_or_id=args["name_or_id"],
            body=args["body"],
            attachment_kind=args.get("attachment_kind"),
            attachment_id=args.get("attachment_id"),
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
        t_get_balance_with, t_list_balances,
        t_list_requests_with,
        t_list_recent_payments, t_list_payments_with,
        t_get_bunq_balance,
        t_list_posts, t_get_post,
        t_list_unread,
        t_list_regulars,
        t_read_my_profile,
        t_emit_action, t_apply_page_patch, t_send_chat_message,
    ])
