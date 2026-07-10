#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$SKILL_DIR/env"

# Load connection URL: prefer an already-exported REDIS_URI, else the
# per-machine env file (gitignored — never committed). See requirements.md.
if [[ -f "$ENV_FILE" ]]; then source "$ENV_FILE"; fi
if [[ -z "${REDIS_URI:-}" ]]; then
    echo "Error: no REDIS_URI. Run init.sh, or export REDIS_URI. See redis/requirements.md" >&2
    exit 1
fi

# Parse arguments
DB=""
EXPR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            DB="$2"
            shift 2
            ;;
        *)
            EXPR="$1"
            shift
            ;;
    esac
done

if [[ -z "$EXPR" ]]; then
    echo "Usage: exec.sh [--db <number>] <redis_command>" >&2
    exit 1
fi

# Build command
ARGS=(-u "$REDIS_URI")
if [[ -n "$DB" ]]; then
    ARGS+=(-n "$DB")
fi

echo "$EXPR" | redis-cli "${ARGS[@]}"
