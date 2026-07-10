#!/usr/bin/env bash
# Dependency preflight for the mongosh skill. Exit 0 = ready, 1 = missing something.
# Prints a short status; on failure points at requirements.md. Read-only.
set -uo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
ok=0
if ! command -v mongosh >/dev/null 2>&1; then
  echo "MISSING: mongosh not on PATH — see mongosh/requirements.md"; ok=1
fi
if [[ -z "${MONGOSH_URI:-}" && ! -f "$SKILL_DIR/env" ]]; then
  echo "MISSING: no MONGOSH_URI (export it, or run mongosh/scripts/init.sh) — see mongosh/requirements.md"; ok=1
fi
[[ $ok -eq 0 ]] && echo "READY: mongosh (mongosh + connection configured)"
exit $ok
