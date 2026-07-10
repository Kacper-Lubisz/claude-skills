#!/usr/bin/env bash
# Dependency preflight for the redis skill. Exit 0 = ready, 1 = missing something.
# Prints a short status; on failure points at requirements.md. Read-only.
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
ok=0
if ! command -v redis-cli >/dev/null 2>&1; then
  echo "MISSING: redis-cli not on PATH — see redis/requirements.md"; ok=1
fi
if [[ -z "${REDIS_URI:-}" && ! -f "$SKILL_DIR/env" ]]; then
  echo "MISSING: no REDIS_URI (export it, or run redis/scripts/init.sh) — see redis/requirements.md"; ok=1
fi
[[ $ok -eq 0 ]] && echo "READY: redis (redis-cli + connection configured)"
exit $ok
