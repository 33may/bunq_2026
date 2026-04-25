"""AI agent — per-turn streaming runner over claude-agent-sdk.

Module layout:
  prompts.py    — system prompt template + page-context renderer
  validators.py — payload schemas for emit_action / apply_page_patch
  events.py     — typed SSE event dataclasses + serializer
  tools.py      — @tool definitions + per-request mcp server factory
  runner.py     — AgentRunner.run async generator
  logging.py    — structured logger helpers
"""
