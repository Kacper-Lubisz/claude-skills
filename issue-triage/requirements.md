# issue-triage — per-project requirements

This skill is provider-agnostic. It scans **only the sources a project
declares**, and it never hardcodes provider names, project ids, CLIs, or paths.
Before it can run against a project, that project must supply a source config.

## Where the config lives (per-project, never in this skill)

Put the config in **one** of:

- A gitignored file at the repo root — e.g. `.issue-triage.json` (preferred:
  keeps CLIs/ids/paths out of the skill and out of version control), or
- A dedicated section of the project's `CLAUDE.md`.

The skill's preflight resolves this at runtime. If neither exists, the skill
stops and points the user here — it does not guess.

## What the config must declare

For each source the project wants scanned, state **which provider** and **how
to query it**. Only declared sources get an agent; anything absent is skipped.

- **Application / cloud logs** — the logging backend and how to read
  error-severity logs over a window. Include the CLI (or API) and any
  identifiers: e.g. a cloud-logs CLI + project id / service names / region, a
  log-aggregator API endpoint + token env var, or a path to a self-hosted log
  store to `grep`.
- **Error tracker** — the tracker (e.g. Sentry) and its access: MCP server or
  API, org/project slug(s), the environment(s) to query, and — if used — the
  performance dataset (app-start / TTID / frames / per-screen p95) to include.
  State how auth is provided (MCP session, token env var).
- **Dependency / security alerts** — the alert source and how to list open
  alerts: e.g. GitHub Dependabot via `gh api` (repo `owner/name`, `gh`
  authenticated), or another SCA tool's CLI/API + credential env var.
- **Release source (what shipped)** — how to determine the most recent release
  and list commits since: the git remote/branch, whether release tags exist and
  their naming, and/or how to read the deployed revision (its image tag) if the
  release marker comes from the deploy target.
- **Product analytics (optional)** — if desired, the analytics provider (e.g.
  PostHog): host, project id, the API-key env var, and the name of the primary
  funnel to report completion for (if any). Omit the block to skip analytics.
- **Extra sources (optional)** — any other read-only source (feedback queue,
  status/uptime monitor, ops metrics backend): how to query it read-only and
  which internal record id to reference instead of PII.

## Time window

- Default: **last 24 hours** ending now (UTC).
- The config MAY set a different default window.
- The `--since=YYYY-MM-DD` arg overrides both at invocation time.

## Output targets

- Default report path: `~/.claude/skills/issue-triage/reports/<DATE>.md`
  (skill-local archive, persists across repos).
- The config MAY name an additional repo-local, **gitignored** copy (kept in
  sync with the archive).

## Access & safety expectations

- All access must be **read-only**. The skill and its agents mutate nothing
  (no ticket creation, resolve/dismiss, deploy, or traffic change) — decisions
  and actions belong to the downstream `triage` skill.
- Never store secret payloads in the config; reference **env var names** for
  credentials, not the values.
- The report and board must never contain PII (phone numbers, emails, account
  ids) — the config should say which internal id to reference instead.

## Example (shape only — not a default; put yours in the project, not here)

```jsonc
// .issue-triage.json (gitignored, at repo root)
{
  "window": { "defaultHours": 24 },
  "sources": {
    "logs":        { "provider": "gcloud-logging", "project": "<id>", "region": "<region>", "services": ["<svc>"] },
    "errorTracker":{ "provider": "sentry", "org": "<slug>", "projects": ["<slug>"], "env": "prod", "performance": true },
    "depAlerts":   { "provider": "github-dependabot", "repo": "<owner>/<name>" },
    "release":     { "remote": "origin", "branch": "main", "tags": true },
    "analytics":   { "provider": "posthog", "host": "<host>", "projectId": "<id>", "apiKeyEnv": "POSTHOG_PERSONAL_API_KEY", "primaryFunnel": "<name>" }
  },
  "report": { "repoLocalPath": "notes/issue-triage/<DATE>/report.md" }
}
```
