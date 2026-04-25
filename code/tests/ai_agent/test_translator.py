from __future__ import annotations

from types import SimpleNamespace as NS

from core.services.ai_agent.translator import translate_sdk_message


def test_translate_text_block():
    block = NS(text="hello", type="text")
    msg = NS(content=[block])
    out = translate_sdk_message(msg, kind="assistant")
    assert len(out) == 1 and out[0].type == "text_delta"
    assert out[0].text == "hello"


def test_translate_tool_use_block():
    block = NS(name="list_splits", input={"mine_only": True})
    out = translate_sdk_message(NS(content=[block]), kind="tool_use")
    assert out[0].type == "tool_use"
    assert out[0].tool == "list_splits"


def test_translate_tool_result_block_ok():
    block = NS(tool_use_id="x", content="[{...}]", is_error=False)
    out = translate_sdk_message(NS(content=[block]), kind="tool_result",
                                tool_name="list_splits")
    assert out[0].type == "tool_result"
    assert out[0].ok is True


def test_translate_tool_result_block_error():
    block = NS(tool_use_id="x", content="boom", is_error=True)
    out = translate_sdk_message(NS(content=[block]), kind="tool_result",
                                tool_name="list_splits")
    assert out[0].type == "tool_result"
    assert out[0].ok is False


def test_translate_unknown_kind_returns_empty():
    out = translate_sdk_message(NS(content=[]), kind="bogus")
    assert out == []


def test_translate_message_with_no_content_returns_empty():
    out = translate_sdk_message(NS(), kind="assistant")
    assert out == []
