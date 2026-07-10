# redis skill — requirements

Run `redis/preflight.sh` to check these. It prints `READY` or lists what's missing.

## What's needed

1. **`redis-cli` on PATH.**
   - macOS: `brew install redis`
   - Linux / other: https://redis.io/docs/install/install-redis/
2. **A connection URI**, provided one of two ways (never committed):
   - Export it for the session: `export REDIS_URI="redis://…"` (or `rediss://` for TLS), or
   - Run `scripts/init.sh "<uri>"` once — it writes `redis/env` (gitignored, per-machine).

`redis/env` is in `.gitignore` on purpose — connection strings carry credentials and must not live
in the skill repo.

## Deriving the URI (per project)

This generic skill does not know your instance. The **project** decides where the URI comes from —
document that in the project's own thin `redis` skill or its CLAUDE.md. Common patterns:

- **Secret manager** — read the Redis URL secret (confirm before reading a secret payload).
- **A local dev `.env`** the app already uses — read the Redis URL variable from it.
- **A running local instance** — `redis://127.0.0.1:6379`.

The project skill's job is to turn "which instance" into a `REDIS_URI`, then hand off to the scripts
here (`query.sh` for reads, `exec.sh` for writes).
