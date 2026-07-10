---
name: redis
description: Interact with Redis databases via redis-cli
triggers:
  - redis
  - redis-cli
  - cache
  - redis query
allowed-tools:
  - Bash(~/.claude/skills/redis/scripts/*)
---

# Redis CLI Skill

Query and modify Redis databases using `redis-cli`.

## Setup & preflight

On load, run `~/.claude/skills/redis/preflight.sh` — it prints `READY`, or lists what's missing and
points at `requirements.md`. This skill is **generic**: it ships no connection string. Provide one
per machine, never committed, either way:

- Export it for the session: `export REDIS_URI="redis://…"` (or `rediss://` for TLS), or
- Run `~/.claude/skills/redis/scripts/init.sh [connection_url]` once — it writes the gitignored
  `redis/env`. If no URL is passed it prompts.

**Where the URI comes from is a project concern** — a project's own thin `redis` skill documents how
to derive it (a secret manager, the app's dev `.env`, a local instance). See `requirements.md`.

## Operation Routing

**CRITICAL**: You must route operations through the correct script based on whether they read or write data.

### Read Operations -> `query.sh`

Use `~/.claude/skills/redis/scripts/query.sh` for all read-only operations:

| Operation | Example |
|-----------|---------|
| `GET` | `GET user:1:name` |
| `MGET` | `MGET key1 key2 key3` |
| `KEYS` | `KEYS user:*` |
| `SCAN` | `SCAN 0 MATCH user:* COUNT 100` |
| `EXISTS` | `EXISTS mykey` |
| `TYPE` | `TYPE mykey` |
| `TTL` / `PTTL` | `TTL mykey` |
| `HGET` / `HGETALL` | `HGETALL user:1` |
| `HMGET` | `HMGET user:1 name email` |
| `HKEYS` / `HVALS` / `HLEN` | `HKEYS user:1` |
| `LRANGE` / `LLEN` / `LINDEX` | `LRANGE mylist 0 -1` |
| `SMEMBERS` / `SCARD` / `SISMEMBER` | `SMEMBERS myset` |
| `SINTER` / `SUNION` / `SDIFF` | `SINTER set1 set2` |
| `ZRANGE` / `ZCARD` / `ZSCORE` / `ZRANK` | `ZRANGE leaderboard 0 9 WITHSCORES` |
| `XRANGE` / `XLEN` / `XINFO` | `XRANGE mystream - +` |
| `INFO` | `INFO memory` |
| `DBSIZE` | `DBSIZE` |
| `STRLEN` / `GETRANGE` | `STRLEN mykey` |
| `HEXISTS` / `HRANDFIELD` | `HEXISTS user:1 email` |
| `SRANDMEMBER` | `SRANDMEMBER myset 3` |
| `OBJECT` | `OBJECT ENCODING mykey` |
| `DEBUG OBJECT` | `DEBUG OBJECT mykey` |
| `DUMP` | `DUMP mykey` |
| `RANDOMKEY` | `RANDOMKEY` |

Usage:
```bash
~/.claude/skills/redis/scripts/query.sh "KEYS *"
~/.claude/skills/redis/scripts/query.sh --db 2 "HGETALL user:1"
```

### Write Operations -> `exec.sh`

Use `~/.claude/skills/redis/scripts/exec.sh` for all operations that modify data:

| Operation | Example |
|-----------|---------|
| `SET` / `MSET` / `SETNX` / `SETEX` | `SET user:1:name "Alice"` |
| `DEL` / `UNLINK` | `DEL mykey` |
| `EXPIRE` / `EXPIREAT` / `PERSIST` | `EXPIRE mykey 3600` |
| `INCR` / `DECR` / `INCRBY` / `DECRBY` | `INCR counter` |
| `APPEND` / `SETRANGE` / `GETSET` / `GETDEL` / `GETEX` | `APPEND mykey " world"` |
| `RENAME` / `RENAMENX` | `RENAME oldkey newkey` |
| `HSET` / `HMSET` / `HDEL` / `HINCRBY` | `HSET user:1 name "Bob"` |
| `LPUSH` / `RPUSH` / `LPOP` / `RPOP` | `LPUSH mylist "item"` |
| `LSET` / `LREM` / `LTRIM` / `LINSERT` | `LSET mylist 0 "new"` |
| `SADD` / `SREM` / `SPOP` / `SMOVE` | `SADD myset "member"` |
| `ZADD` / `ZREM` / `ZINCRBY` | `ZADD leaderboard 100 "player1"` |
| `XADD` / `XDEL` / `XTRIM` / `XGROUP` | `XADD mystream * key value` |
| `FLUSHDB` / `FLUSHALL` | `FLUSHDB` |
| `CONFIG` | `CONFIG SET maxmemory 100mb` |

Usage:
```bash
~/.claude/skills/redis/scripts/exec.sh "SET user:1:name Alice"
~/.claude/skills/redis/scripts/exec.sh --db 2 "DEL temp:*"
```

## Flags

Both `query.sh` and `exec.sh` accept:
- `--db <number>` — select a specific Redis database (numeric, e.g. 0-15)
- The Redis command as the final positional argument

## Output Format

Raw redis-cli output (already well-structured for most commands).

## Tips

- Use `KEYS *` sparingly on production — prefer `SCAN 0 MATCH pattern COUNT 100` for large databases.
- Use `TYPE key` to discover the data structure before querying.
- Use `TTL key` to check expiration before modifying keys.
- Use `INFO` sections (`INFO memory`, `INFO stats`, `INFO keyspace`) for diagnostics.
- Use `DBSIZE` to check how many keys exist in the current database.
