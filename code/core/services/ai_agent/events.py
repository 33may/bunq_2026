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
