"""Claude (via claude-agent-sdk) → structured receipt fields.

The agent is given the image's local path and the ``Read`` tool. We force a
strict JSON schema via ``output_format``; the parsed dict comes back on
``ResultMessage.structured_output``.

This keeps a single SDK across the codebase (the conversational AI will use
the same library) at the cost of a tiny indirection through the local file.
"""
from __future__ import annotations

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    query,
)

from ..config import settings


SYSTEM_PROMPT = """You are a receipt parser. Read the image at the path given to
you using the Read tool, then output strictly the JSON described by the
output schema.

Be precise: do not invent prices, do not merge line items, copy product names
verbatim (lower-case if all-caps). If a field is not present, omit it.
Currency defaults to EUR for European-looking receipts. Date is ISO YYYY-MM-DD.
Description is a 2–4 word category, e.g. 'groceries · tue eve'."""


RECEIPT_SCHEMA = {
    "type": "object",
    "required": ["merchant", "total", "currency", "line_items"],
    "additionalProperties": False,
    "properties": {
        "merchant": {"type": "string"},
        "date": {"type": "string"},
        "location": {"type": "string"},
        "description": {"type": "string"},
        "total": {"type": "number"},
        "currency": {"type": "string"},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "price"],
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "price": {"type": "number"},
                    "quantity": {"type": "integer"},
                },
            },
        },
    },
}


async def parse_receipt_image(image_path: str) -> dict:
    """Run the agent on ``image_path`` and return the structured payload.

    ``image_path`` is an absolute local path; the agent reads it via the
    ``Read`` tool. Raises ``RuntimeError`` if the agent finished without
    producing structured output.
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set — receipt parsing disabled.")

    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        model=settings.anthropic_model,
        allowed_tools=["Read"],
        permission_mode="bypassPermissions",  # one-shot service, no human in loop
        setting_sources=[],                   # don't pick up the user's claude config
        max_turns=4,
        output_format={"type": "json_schema", "schema": RECEIPT_SCHEMA},
        env={"ANTHROPIC_API_KEY": settings.anthropic_api_key},
    )

    structured: dict | None = None
    last_text: str | None = None

    async for msg in query(
        prompt=f"Parse the receipt image at {image_path} and produce the structured fields.",
        options=options,
    ):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                # Capture last text in case structured_output is missing.
                if getattr(block, "text", None):
                    last_text = block.text
        elif isinstance(msg, ResultMessage):
            structured = getattr(msg, "structured_output", None)

    if structured is None:
        raise RuntimeError(
            f"agent did not return structured output (last text: {last_text!r})"
        )
    return structured
