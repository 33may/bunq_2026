"""Runner integration test with claude_agent_sdk.query monkey-patched."""
from __future__ import annotations

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
