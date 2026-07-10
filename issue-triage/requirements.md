# issue-triage — per-project requirements

This skill is provider-agnostic. It scans **only the sources a project
declares**, and it never hardcodes provider names, project ids, CLIs, or paths.

**No config is required to get a first run.** The **static / source-review**
source is config-free and always runs — it reads the source/working tree
directly, so the skill produces findings on a brand-new, uninstrumented repo.
A source config only *adds* the observability sources (logs, error tracker, dep
alerts, release, analytics) on top of that baseline. When no config exists the
skill auto-detects what's present (git remote host, `@sentry/*` in deps, a
`gcloud`/GCP config, the CI provider) and offers to scaffold a starter config —
it does not dead-end.

## Where the config lives (per-project, never in this skill)

Put the config in **one** of:

- A gitignored file at the repo root — e.g. `.issue-triage.json` (preferred:
  keeps CLIs/ids/paths out of the skill and out of version control), or
- A dedicated section of the project's `CLAUDE.md`.

The skill's preflight resolves this at runtime. If neither exists, the skill
does NOT stop: it auto-detects the environment, offers to scaffold a starter
`.issue-triage.json`, and runs the config-free static / source-review pass so
you get findings on the first invocation. It still never *guesses* provider
names/ids for the configured observability sources — those stay empty until you
fill them in.

## What the config must declare

For each source the project wants scanned, state **which provider** and **how
to query it**. Only declared sources get an agent; anything absent is skipped —
**except the static / source-review source, which is config-free and always
runs** (see below), so a project with an empty/absent config still gets a report.

- **Static / source-review (always on, no config)** — needs nothing declared. It
  reviews the source/working tree directly for shipped-to-users problems (demo/
  mock data, dead routes, committed secrets/`.env`, hardcoded `localhost:PORT`
  URLs, missing tests, i18n gaps, insecure config, obvious bugs). You may
  OPTIONALLY narrow or extend it in config (e.g. extra grep patterns, paths to
  ignore), but it runs with or without a config block.
- **Application / cloud logs** — the logging backend and how to read
  error-severity logs over a window. Include the CLI (or API) and any
  identifiers: e.g. a cloud-logs CLI + project id / service names / region, a
  log-aggregator API endpoint + token env var, or — for a project with no
  hosted logging — a path/glob to a **self-hosted or local log store to `grep`**
  (e.g. `journalctl`, `docker logs`, `/var/log/<app>/*.log`, a container's
  stdout capture). Omit the block if the project has no readable logs at all.
- **Error tracker** — the tracker (e.g. Sentry) and its access: MCP server or
  API, org/project slug(s), the environment(s) to query, and — if used — the
  performance dataset (app-start / TTID / frames / per-screen p95) to include.
  State how auth is provided (MCP session, token env var). **No error tracker?**
  Omit the block entirely — the agent is simply skipped, and the static-review
  pass' "obvious bugs" / swallowed-error checks partly cover the gap.
- **Dependency / security alerts** — the alert source and how to list open
  alerts. Examples:
  - **GitHub Dependabot** via `gh api /repos/<owner>/<repo>/dependabot/alerts?state=open`
    (repo `owner/name`, `gh` authenticated).
  - **GitLab** via `glab` or the GitLab API — vulnerability findings at
    `GET /projects/:id/vulnerability_findings` (or Dependency Scanning report
    artifacts), using `glab auth`/a `GITLAB_TOKEN` env var and the numeric/URL-
    encoded project id. Use `glab`, **not** `gh`, when the remote is GitLab.
  - Any other SCA tool's CLI/API + credential env var (Snyk, Trivy, `osv-scanner`,
    `npm/yarn/pnpm audit --json` as a config-free fallback).
- **Release source (what shipped)** — how to determine the most recent release
  and list commits since: the git remote/branch, whether release tags exist and
  their naming, and/or how to read the deployed revision (its image tag) if the
  release marker comes from the deploy target. Works with any host (GitHub,
  GitLab, plain git) since it's mostly local `git` — but for host-specific
  release objects use the matching CLI (`gh release` on GitHub, `glab release`
  on GitLab). This source is close to config-free: if nothing is declared, fall
  back to plain `git log` since the last tag (or since the branch point).
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

## Examples (shape only — not a default; put yours in the project, not here)

### Fully instrumented (GCP + Sentry + GitHub)

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

### GitLab project (glab / GitLab API instead of gh), no error tracker

Use `glab`, not `gh`, when the remote is GitLab. Omitting `errorTracker`
entirely just skips that agent — the static-review pass still covers obvious
bugs and swallowed errors.

```jsonc
{
  "window": { "defaultHours": 24 },
  "sources": {
    // no errorTracker block → Sentry/etc. agent is skipped
    "depAlerts": { "provider": "gitlab", "projectId": "<numeric-or-encoded-path>", "tokenEnv": "GITLAB_TOKEN" },
    "release":   { "remote": "origin", "branch": "main", "host": "gitlab" }
  }
}
```

### Self-hosted / local logs (grep), no cloud provider

```jsonc
{
  "sources": {
    "logs": { "provider": "grep", "paths": ["/var/log/<app>/*.log"], "command": "journalctl -u <svc> --since \"<WINDOW_START>\"" }
  }
}
```

### No sources configured → static review only

The valid zero-config case. There is **no** config file (or an empty
`sources: {}`): the skill auto-detects the environment, may offer to scaffold
one of the blocks above, and runs the config-free **static / source-review**
pass alone. That single-source report is complete and expected — this is exactly
the fresh-repo path, where the static review carries essentially all the
findings (leftover mock data, committed secrets, `localhost:PORT`, missing
tests, insecure cookie config, obvious bugs).
