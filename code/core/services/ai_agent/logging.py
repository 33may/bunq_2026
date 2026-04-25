"""Structured logging helpers for the AI agent.

Usage:
    log = get_logger()
    log.info("turn.start", extra={"turn_id": tid, ...})
"""
from __future__ import annotations

import logging
import uuid


def get_logger() -> logging.Logger:
    return logging.getLogger("bunq.ai")


def new_turn_id() -> str:
    return uuid.uuid4().hex[:8]
