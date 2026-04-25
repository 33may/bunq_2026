"""Shared BunqClient — one instance per process.

`BunqClient` carries the shared keypair + installation token + HTTP client,
so constructing it on every request would be wasteful (and would forget the
per-session cache, triggering the 1-req/30s session-server rate limit).
"""
from __future__ import annotations

from ..bunq_client import BunqClient


_client: BunqClient | None = None


def get_bunq_client() -> BunqClient:
    global _client
    if _client is None:
        _client = BunqClient()
    return _client
