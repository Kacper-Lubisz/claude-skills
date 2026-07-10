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
    echo "Usage: query.sh [--db <number>] <redis_command>" >&2
    exit 1
fi

# Guard: reject write operations routed to query.sh
CMD=$(echo "$EXPR" | awk '{print toupper($1)}')
case "$CMD" in
    SET|MSET|SETNX|SETEX|PSETEX|APPEND|INCR|DECR|INCRBY|DECRBY|INCRBYFLOAT|\
    GETSET|SETRANGE|GETDEL|GETEX|DEL|UNLINK|EXPIRE|EXPIREAT|PEXPIRE|PEXPIREAT|\
    PERSIST|RENAME|RENAMENX|\
    HSET|HMSET|HDEL|HINCRBY|HINCRBYFLOAT|HSETNX|\
    LPUSH|RPUSH|LPOP|RPOP|LSET|LREM|LTRIM|LINSERT|RPOPLPUSH|LMOVE|\
    SADD|SREM|SPOP|SMOVE|SDIFFSTORE|SINTERSTORE|SUNIONSTORE|\
    ZADD|ZREM|ZINCRBY|ZREMRANGEBYRANK|ZREMRANGEBYSCORE|ZREMRANGEBYLEX|\
    ZUNIONSTORE|ZINTERSTORE|ZPOPMIN|ZPOPMAX|\
    XADD|XDEL|XTRIM|XGROUP|\
    FLUSHDB|FLUSHALL|RESTORE|MOVE|COPY|\
    CONFIG|SORT)
        echo "Error: Write operation detected ($CMD). Use exec.sh instead of query.sh." >&2
        exit 1
        ;;
esac

# Build command
ARGS=(-u "$REDIS_URI")
if [[ -n "$DB" ]]; then
    ARGS+=(-n "$DB")
fi

echo "$EXPR" | redis-cli "${ARGS[@]}"
