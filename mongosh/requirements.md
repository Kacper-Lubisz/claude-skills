# mongosh skill — requirements

Run `mongosh/preflight.sh` to check these. It prints `READY` or lists what's missing.

## What's needed

1. **`mongosh` on PATH** — the MongoDB Shell.
   - macOS: `brew install mongosh`
   - Linux / other: https://www.mongodb.com/docs/mongodb-shell/install/
2. **A connection URI**, provided one of two ways (never committed):
   - Export it for the session: `export MONGOSH_URI="mongodb+srv://…"`, or
   - Run `scripts/init.sh "<uri>"` once — it writes `mongosh/env` (gitignored, per-machine) and
     tests the connection.

`mongosh/env` is in `.gitignore` on purpose — connection strings carry credentials and must not
live in the skill repo.

## Deriving the URI (per project)

This generic skill does not know your database. The **project** decides where the URI comes from —
document that in the project's own thin `mongosh` skill or its CLAUDE.md. Common patterns:

- **Secret manager** — e.g. `gcloud secrets versions access latest --secret=<name>` (confirm before
  reading a secret payload), or the cloud provider's equivalent.
- **A local dev `.env`** the app already uses — read the Mongo URI variable from it.
- **A running local database** — `mongodb://127.0.0.1:27017/<db>`.

The project skill's job is to turn "which database" into a `MONGOSH_URI`, then hand off to the
scripts here (`query.sh` for reads, `exec.sh` for writes).
