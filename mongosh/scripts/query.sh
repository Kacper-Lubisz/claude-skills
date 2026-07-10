#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$SKILL_DIR/env"

# Load connection URL: prefer an already-exported MONGOSH_URI, else the
# per-machine env file (gitignored — never committed). See requirements.md.
if [[ -f "$ENV_FILE" ]]; then source "$ENV_FILE"; fi
if [[ -z "${MONGOSH_URI:-}" ]]; then
    echo "Error: no MONGOSH_URI. Run init.sh, or export MONGOSH_URI. See mongosh/requirements.md" >&2
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
    echo "Usage: query.sh [--db <name>] <js_expression>" >&2
    exit 1
fi

# Guard: reject write operations routed to query.sh
WRITE_PATTERN='\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|drop|dropDatabase|createIndex|dropIndex|bulkWrite|replaceOne|remove|save|rename)\s*\('
if echo "$EXPR" | grep -qEi "$WRITE_PATTERN"; then
    echo "Error: Write operation detected. Use exec.sh instead of query.sh." >&2
    exit 1
fi

# Build the eval expression
if [[ -n "$DB" ]]; then
    EVAL="use('$DB'); $EXPR"
else
    EVAL="$EXPR"
fi

mongosh "$MONGOSH_URI" --eval "$EVAL" --quiet --json=relaxed
