#!/usr/bin/env bash
# One-shot deploy: commit local changes (if any), push, ssh + git pull + rebuild on droplet.
#
#   ./deploy.sh                  # rebuilds everything
#   ./deploy.sh api              # rebuild only api
#   ./deploy.sh ui               # rebuild only ui
#
# Assumes:
#   • current branch is the one deployed on the droplet
#   • DROPLET reachable via ssh root@$DROPLET (default 147.182.129.54)
#   • repo at /opt/bunq on the droplet

set -euo pipefail

DROPLET="${DROPLET:-147.182.129.54}"
REPO_DIR="${REPO_DIR:-/opt/bunq}"
SERVICE="${1:-}"           # "" = all services

cd "$(dirname "$0")"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# 1. push (only if there's something to push or local changes)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "→ uncommitted changes detected on $BRANCH"
  read -r -p "  message: " MSG
  git add -A
  git commit -m "${MSG:-deploy}"
fi
echo "→ pushing $BRANCH"
git push origin "$BRANCH"

# 2. pull + rebuild on droplet
echo "→ deploying to $DROPLET ($REPO_DIR, branch=$BRANCH, service=${SERVICE:-all})"
ssh "root@$DROPLET" "cd $REPO_DIR && git fetch && git checkout $BRANCH && git pull && docker compose up -d --build $SERVICE"

# 3. quick health check (api takes ~5-10s to seed on first boot)
echo "→ health check"
for i in $(seq 1 12); do
  if curl -sf "http://$DROPLET/health" >/dev/null 2>&1; then
    echo "  ✓ /health 200"
    break
  fi
  [ "$i" -eq 12 ] && { echo "  ✗ /health never came up"; exit 1; }
  sleep 2
done
echo "→ done · http://$DROPLET"
