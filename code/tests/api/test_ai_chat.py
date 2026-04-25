"""Integration test for POST /ai/chat — exercises the FastAPI route, SSE
streaming, and dependency wiring with a mocked AgentRunner."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    """App + a fake runner that yields a known event sequence."""
    from core.services.ai_agent import events as ev_mod
    from core.services.ai_agent import runner as runner_mod

    async def fake_run(*, message, history, page_context, user, house, db):
        yield ev_mod.TextDeltaEvent(text="hi")
        yield ev_mod.ActionEvent(
            kind="request", summary="settle €5",
            payload={"to_user_id": "u_lena", "amount": 5})
        yield ev_mod.DoneEvent(turn_id="t12345")

    monkeypatch.setattr(runner_mod, "run", fake_run)

    from core.api.main import app
    return TestClient(app)


def test_post_ai_chat_streams_events(client, signed_in_cookie):
    r = client.post(
        "/ai/chat",
        json={"message": "settle up with lena", "history": [],
              "page_context": None, "client_turn_id": "abc"},
        cookies=signed_in_cookie,
    )
    assert r.status_code == 200
    body = r.text
    assert "event: text_delta" in body
    assert "event: action" in body
    assert "event: done" in body
    # action payload preserved
    action_line = next(l for l in body.splitlines()
                       if l.startswith("data:") and '"kind"' in l)
    payload = json.loads(action_line[len("data:"):].strip())
    assert payload["kind"] == "request"


def test_post_ai_chat_requires_auth(client):
    r = client.post("/ai/chat", json={"message": "x", "history": [],
                                       "client_turn_id": "abc"})
    assert r.status_code == 401
