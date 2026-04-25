#!/usr/bin/env bash
# Dev entrypoint for the bunq flatmate api.
#
# Sources env files in increasing specificity so a fresh clone boots clean:
#   1. ~/.config/secrets.env       — global keys (OPENAI_API_KEY, ANTHROPIC_API_KEY)
#   2. code/.env                   — project overrides
# Starts uvicorn with hot-reload. DB schema self-heals on boot (see core/data/db.py).

set -euo pipefail
cd "$(dirname "$0")"

# 1. Global secrets
if [[ -f "$HOME/.config/secrets.env" ]]; then
  set -a; source "$HOME/.config/secrets.env"; set +a
fi

# 2. Project .env (overrides the global values)
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

# Prefer the project venv's uvicorn when present, fall back to PATH.
UVICORN="./.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  UVICORN="uvicorn"
fi

exec "$UVICORN" core.api.main:app --reload --port "${PORT:-8000}" --host "${HOST:-127.0.0.1}"
