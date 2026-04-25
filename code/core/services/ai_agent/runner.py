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
from .events import (
    DoneEvent, ErrorEvent, Event, TextDeltaEvent,
    ToolResultEvent, ToolUseEvent,
)
from .logging import get_logger, new_turn_id
from .prompts import render_system_prompt, render_user_msg
from .tools import ALL_TOOL_NAMES, build_mcp_server

log = get_logger()


# Hooks for tests to monkey-patch — keep these as module-level names.
def _make_sse_queue() -> asyncio.Queue:
    return asyncio.Queue()


def _sdk_query(prompt: str, options: Any):
    """Indirection over claude_agent_sdk.query so tests can substitute.

    Returns the SDK's async generator directly — DO NOT wrap it in another
    `async def ... yield ...` here. Wrapping introduces an extra anyio cancel
    scope layer that, inside FastAPI's StreamingResponse context, gets
    cancelled at the first internal await before the subprocess CLI lookup
    completes. Returning the bare generator avoids that layer.
    """
    from claude_agent_sdk import query  # lazy import
    log.info("_sdk_query: returning query() generator")
    return query(prompt=prompt, options=options)


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
    h = history or []
    if not h:
        return current
    transcript = "\n".join(
        f"{('user' if it['role'] == 'me' else it['role'])}: {it['text']}"
        for it in h[-20:]
    )
    return f"previous turns:\n{transcript}\n\ncurrent:\n{current}"


def _walk_blocks(msg: Any, tool_id_map: dict[str, str]) -> list[Event]:
    """Map an SDK message's content blocks to typed events.

    Block dispatch by class name (duck-typed so tests don't import the SDK):
      TextBlock        → TextDeltaEvent
      ToolUseBlock     → ToolUseEvent (record id→name in tool_id_map)
      ToolResultBlock  → ToolResultEvent (look up name from tool_id_map)
      ThinkingBlock    → ignored
    """
    out: list[Event] = []
    blocks = getattr(msg, "content", None) or []
    for b in blocks:
        cls = type(b).__name__

        # ToolResultBlock — check first (has tool_use_id but no .name/.input)
        if cls == "ToolResultBlock" or (
            hasattr(b, "tool_use_id")
            and not hasattr(b, "name")
            and not hasattr(b, "input")
        ):
            uid = getattr(b, "tool_use_id", None)
            tool = tool_id_map.get(uid, "?")
            ok = not getattr(b, "is_error", False)
            out.append(ToolResultEvent(tool=tool, ok=ok))
            continue

        # ToolUseBlock — has both .name and .input
        if cls == "ToolUseBlock" or (hasattr(b, "name") and hasattr(b, "input")):
            name = getattr(b, "name", None)
            args = getattr(b, "input", None) or {}
            uid = getattr(b, "id", None)
            if name:
                if uid:
                    tool_id_map[uid] = name
                out.append(ToolUseEvent(tool=name, args=args))
            continue

        # TextBlock — has .text
        if cls == "TextBlock" or hasattr(b, "text"):
            # Skip ThinkingBlock (has .thinking, not .text as primary attr)
            if cls == "ThinkingBlock":
                continue
            text = getattr(b, "text", None)
            if text:
                out.append(TextDeltaEvent(text=text))
            continue

        # ThinkingBlock and anything else — ignore

    return out


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
    log.info(
        "turn.start id=%s user=%s page=%s msg_chars=%d history=%d model=%s",
        turn_id, user.name, (page_context or {}).get("page_id"),
        len(message), len(history or []), settings.anthropic_model,
    )

    sse_queue = _make_sse_queue()
    page_ref = {"v": page_context}
    mcp = build_mcp_server(
        user=user, house=house, db=db,
        sse_queue=sse_queue,
        current_page_context_ref=lambda: page_ref["v"],
        turn_id=turn_id,
    )
    options = _build_options(user=user, house=house, mcp_server=mcp)
    log.info("turn.%s built mcp + options", turn_id)

    user_turn = render_user_msg(message=message, page_context=page_context, history=history)
    full_prompt = _fold_history(history, user_turn)
    log.info("turn.%s prompt_chars=%d", turn_id, len(full_prompt))

    n_events = 0
    tool_id_map: dict[str, str] = {}
    sdk_msgs = 0
    try:
        log.info("turn.%s entering sdk_query loop", turn_id)
        async for sdk_msg in _sdk_query(full_prompt, options):
            sdk_msgs += 1
            cls = type(sdk_msg).__name__
            log.info("turn.%s sdk_msg #%d %s", turn_id, sdk_msgs, cls)
            if cls == "ResultMessage":
                continue
            for ev in _walk_blocks(sdk_msg, tool_id_map):
                log.info("turn.%s yield %s", turn_id, ev.type)
                n_events += 1
                yield ev
            while not sse_queue.empty():
                ev = sse_queue.get_nowait()
                log.info("turn.%s yield (queued) %s", turn_id, ev.type)
                n_events += 1
                yield ev
        log.info("turn.%s sdk_query loop ended cleanly sdk_msgs=%d", turn_id, sdk_msgs)
    except BaseException as e:
        log.exception("turn.%s error: %s: %s", turn_id, type(e).__name__, e)
        if not isinstance(e, Exception):
            # GeneratorExit / CancelledError — re-raise after logging.
            raise
        yield ErrorEvent(message=f"agent failed: {e}")
    finally:
        log.info("turn.%s end sdk_msgs=%d events=%d", turn_id, sdk_msgs, n_events)
        yield DoneEvent(turn_id=turn_id)
