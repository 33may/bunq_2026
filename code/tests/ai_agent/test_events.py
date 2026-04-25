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
