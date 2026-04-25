"""Map claude-agent-sdk message objects → list of typed SSE events.

Pure function. Accepts duck-typed objects so tests don't need to import the
SDK. The runner classifies the SDK message type and passes `kind` here.

Block types we care about (across SDK message kinds):
  - TextBlock        → TextDeltaEvent
  - ToolUseBlock     → ToolUseEvent
  - ToolResultBlock  → ToolResultEvent

ThinkingBlock and other internal blocks are ignored — they don't surface to
the user. ResultMessage / SystemMessage are handled by the runner directly
(it emits its own DoneEvent), not here.
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
