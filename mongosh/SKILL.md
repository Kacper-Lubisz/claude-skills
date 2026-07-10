---
name: mongosh
description: Interact with MongoDB databases via mongosh shell
triggers:
  - mongo
  - mongosh
  - database query
  - mongodb
  - db query
  - collection
allowed-tools:
  - Bash(~/.claude/skills/mongosh/scripts/*)
---

# MongoDB Shell (mongosh) Skill

Query and modify MongoDB databases using `mongosh`.

## Setup & preflight

On load, run `~/.claude/skills/mongosh/preflight.sh` — it prints `READY`, or lists what's missing
and points at `requirements.md`. This skill is **generic**: it ships no connection string. Provide
one per machine, never committed, either way:

- Export it for the session: `export MONGOSH_URI="mongodb+srv://…"`, or
- Run `~/.claude/skills/mongosh/scripts/init.sh [connection_url]` once — it writes the gitignored
  `mongosh/env` and tests the connection. If no URL is passed it prompts.

**Where the URI comes from is a project concern** — a project's own thin `mongosh` skill documents
how to derive it (a secret manager, the app's dev `.env`, a local instance). See `requirements.md`.

## Operation Routing

**CRITICAL**: You must route operations through the correct script based on whether they read or write data.

### Read Operations → `query.sh`

Use `~/.claude/skills/mongosh/scripts/query.sh` for all read-only operations:

| Operation | Example |
|-----------|---------|
| `find` | `db.users.find({active: true}).limit(10)` |
| `findOne` | `db.users.findOne({_id: ObjectId("...")})` |
| `countDocuments` | `db.users.countDocuments({role: "admin"})` |
| `aggregate` | `db.orders.aggregate([{$group: {_id: "$status", count: {$sum: 1}}}])` |
| `distinct` | `db.users.distinct("role")` |
| `getIndexes` | `db.users.getIndexes()` |
| `listCollections` | `db.getCollectionNames()` or `db.getCollectionInfos()` |
| `stats` | `db.users.stats()` or `db.stats()` |
| `explain` | `db.users.find({x:1}).explain()` |
| `dbStats` | `db.stats()` |
| `estimatedDocumentCount` | `db.users.estimatedDocumentCount()` |

Usage:
```bash
~/.claude/skills/mongosh/scripts/query.sh "db.users.find().limit(5)"
~/.claude/skills/mongosh/scripts/query.sh --db mydb "db.getCollectionNames()"
```

### Write Operations → `exec.sh`

Use `~/.claude/skills/mongosh/scripts/exec.sh` for all operations that modify data:

| Operation | Example |
|-----------|---------|
| `insertOne` | `db.users.insertOne({name: "test"})` |
| `insertMany` | `db.users.insertMany([{a:1}, {a:2}])` |
| `updateOne` | `db.users.updateOne({_id: id}, {$set: {name: "new"}})` |
| `updateMany` | `db.users.updateMany({}, {$set: {v: 2}})` |
| `deleteOne` | `db.users.deleteOne({_id: id})` |
| `deleteMany` | `db.orders.deleteMany({status: "cancelled"})` |
| `replaceOne` | `db.users.replaceOne({_id: id}, newDoc)` |
| `drop` | `db.users.drop()` |
| `dropDatabase` | `db.dropDatabase()` |
| `createIndex` | `db.users.createIndex({email: 1})` |
| `dropIndex` | `db.users.dropIndex("email_1")` |
| `bulkWrite` | `db.users.bulkWrite([...])` |
| `rename` | `db.users.renameCollection("users_old")` |

Usage:
```bash
~/.claude/skills/mongosh/scripts/exec.sh "db.users.insertOne({name: 'test'})"
~/.claude/skills/mongosh/scripts/exec.sh --db mydb "db.orders.deleteMany({status: 'cancelled'})"
```

## Flags

Both `query.sh` and `exec.sh` accept:
- `--db <name>` — switch to a specific database before running the expression
- The JS expression as the final positional argument

## Output Format

Both scripts use `--quiet --json=relaxed` so output is clean, parseable JSON without the mongosh banner or prompt decorations.

## Tips

- Always use `.limit()` when exploring collections to avoid dumping huge result sets.
- Use `db.getCollectionNames()` to discover available collections.
- Use `db.collection.countDocuments({})` before large queries to gauge size.
- For complex aggregations, build the pipeline step by step.
- When querying ObjectIds, wrap them: `ObjectId("64a...")`.
