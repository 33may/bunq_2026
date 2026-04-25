from __future__ import annotations

from core.services.ai_agent.prompts import (
    render_system_prompt, render_user_msg,
)


class _U:
    def __init__(self, **kw): self.__dict__.update(kw)


def test_system_prompt_includes_user_identity():
    u = _U(id="usr_1", name="anton", bunq_label="anton")
    h = _U(name="oak st")
    s = render_system_prompt(user=u, house=h)
    assert "anton" in s
    assert "usr_1" in s
    assert "oak st" in s
    # Load-bearing rules must be present
    assert "emit_action" in s
    assert "apply_page_patch" in s
    assert "page context" in s.lower()


def test_user_msg_with_page_context_inlines_json():
    msg = render_user_msg(
        message="hi",
        page_context={"page_id": "home", "data": {"balance": 100}},
        history=[],
    )
    assert "[page: home]" in msg
    assert '"balance"' in msg
    assert "hi" in msg


def test_user_msg_without_context_omits_page_block():
    msg = render_user_msg(message="hi", page_context=None, history=[])
    assert "[page:" not in msg
    assert "hi" in msg
