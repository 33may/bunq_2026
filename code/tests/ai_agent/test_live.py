"""Hits the real model. Run with: pytest -m live tests/ai_agent/test_live.py"""
from __future__ import annotations

import os

import pytest


@pytest.mark.live
@pytest.mark.asyncio
async def test_settle_up_emits_action(db, seeded):
    if not os.getenv("ANTHROPIC_API_KEY"):
        pytest.skip("no ANTHROPIC_API_KEY")
    from core.services.ai_agent.runner import run

    types = []
    async for ev in run(
        message="settle up with lena",
        history=[],
        page_context=None,
        user=seeded["anton"], house=seeded["house"], db=db,
    ):
        types.append(ev.type)
    assert "action" in types or "text_delta" in types
    assert types[-1] == "done"
