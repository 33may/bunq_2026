"""AI-driven line-item assignment via claude-agent-sdk.

The user types a free-form prompt ("split everything with sam, beer is mine");
this service hands the agent the line items + housemate roster and forces a
strict JSON output of the assignment map.
"""
from __future__ import annotations

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    query,
)

from ..config import settings


SYSTEM_PROMPT = """You assign receipt line items to housemates based on the user's
instruction. You are given the line items (id + name + price) and the roster of
housemates (id + name).

Output JSON matching the supplied schema. The `assignments` field is a map of
line_id → assignee, where assignee is either:
  - a housemate id from the roster,
  - the literal string "everyone" (split equally among all participating mates
    + the uploader),
  - or null (unassigned — leave it for manual assignment).

Rules:
- Only use ids that appear in the provided lists.
- Be conservative: prefer null over a guess when the instruction is ambiguous.
- If the user says "rest mine" or doesn't mention an item, leave it null
  unless the instruction explicitly covers the rest."""


def _schema(line_ids: list[str], assignee_ids: list[str]) -> dict:
    """Build a per-call schema with assignee enums tightened to known ids."""
    return {
        "type": "object",
        "required": ["assignments"],
        "additionalProperties": False,
        "properties": {
            "assignments": {
                "type": "object",
                "patternProperties": {
                    "^[a-zA-Z0-9-]+$": {
                        "anyOf": [
                            {"type": "string", "enum": [*assignee_ids, "everyone"]},
                            {"type": "null"},
                        ]
                    }
                },
                "additionalProperties": False,
            },
            "explanation": {"type": "string"},
        },
    }


async def assign_line_items(
    *,
    prompt: str,
    line_items: list[dict],   # [{id, name, price}, ...]
    housemates: list[dict],    # [{id, name}, ...]
) -> dict:
    """Return ``{ assignments: {line_id: assignee|None}, explanation: str }``."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set — AI assigning disabled.")

    line_ids = [li["id"] for li in line_items]
    assignee_ids = [m["id"] for m in housemates]

    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        model=settings.anthropic_model,
        allowed_tools=[],                     # text only — no tool access needed
        permission_mode="bypassPermissions",
        setting_sources=[],
        max_turns=2,
        output_format={"type": "json_schema", "schema": _schema(line_ids, assignee_ids)},
        env={"ANTHROPIC_API_KEY": settings.anthropic_api_key},
    )

    user_msg = (
        "Housemates:\n"
        + "\n".join(f"- {m['id']}: {m['name']}" for m in housemates)
        + "\n\nLine items:\n"
        + "\n".join(
            f"- {li['id']}: {li['name']} (€{li['price']})" for li in line_items
        )
        + f"\n\nInstruction:\n{prompt.strip()}"
    )

    structured: dict | None = None
    last_text: str | None = None

    async for msg in query(prompt=user_msg, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if getattr(block, "text", None):
                    last_text = block.text
        elif isinstance(msg, ResultMessage):
            structured = getattr(msg, "structured_output", None)

    if structured is None:
        raise RuntimeError(
            f"agent did not return structured output (last text: {last_text!r})"
        )
    return structured
