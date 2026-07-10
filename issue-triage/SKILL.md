---
name: issue-triage
description: |
  Reusable "find" half of a find→decide pipeline. Fans out parallel sub-agents
  to scan a project's CONFIGURED observability / error sources over a time
  window — application & cloud logs, an error tracker (e.g. Sentry),
  dependency / security alerts (e.g. Dependabot), what-shipped (git log /
  release notes), optionally product analytics (e.g. PostHog) — surfaces
  candidate issues (errors, performance regressions, security/dep alerts,
  regressions from what shipped), writes a dated report, and hands the
  candidates to the `triage` decision board (issue-triage discovers → triage
  decides). Sources come from a PER-PROJECT config, never hardcoded here.
  Trigger when the user types /issue-triage, says "issue triage", "what's
  broken", "scan for issues", or the aliases "morning briefing", "daily
  rundown", "what happened overnight".
allowed-tools:
  - Bash
  - Read
  - Write
  - Agent
  - Glob
  - Grep
---

# issue-triage — scan a project's sources for candidate issues

The **find** half of a find→decide pipeline. This skill DISCOVERS candidate
issues; the `pages` **`triage`** skill (`~/.claude/skills/pages/triage/SKILL.md`)
DECIDES on them via an interactive board. Keep the two jobs separate: here you
only gather and rank — you never create tickets or take actions.

Be efficient: fan out to sub-agents in parallel, aggregate, present one clean
report. Stay under one full context window per phase.

## Preflight

Sources are **per-project** and are never hardcoded in this skill. Before
scanning, resolve the project's config (see `requirements.md`): read the
project's gitignored config file (e.g. `.issue-triage.json` at the repo root)
or the relevant section of its `CLAUDE.md`. That config tells you which sources
exist and how to query each (cloud-logs CLI + project id, error-tracker
access, dependency/security alerts, release source, optional analytics).

If no config is found, tell the user the skill needs a per-project source
config and point them at `requirements.md`; do not guess provider names,
project ids, or paths. Only spawn an agent for a source the config declares.

## Inputs

Args (optional, free-form): `$ARGUMENTS`

- `--since=YYYY-MM-DD` — start of the window. Otherwise default to the window
  in the project config, else **last 24 hours** ending now (UTC).

Compute and remember:
- `WINDOW_START` — ISO-8601 UTC, default = now − 24h
- `WINDOW_END` — ISO-8601 UTC, now
- `REPORT_DATE` — YYYY-MM-DD, local time

## Phase 1 — fan-out (parallel, one message, one Agent call per configured source)

Spawn one sub-agent **per source the config declares**, all in a single message
so they run concurrently. Use `subagent_type: "general-purpose"`. Each agent
scans exactly ONE source, is strictly **read-only**, and reports back in
<350 words of structured markdown — never raw log dumps. Every surfaced item
must carry a **source-of-truth link** (log query URL, error-tracker issue,
advisory URL, commit SHA) so a reader audits it in one click.

The agents below are **generic archetypes**. Substitute the concrete provider,
project id, CLI, and access method from the per-project config — the examples
are only to show shape. Skip any archetype the project doesn't configure.

### Agent — Application / cloud logs

Scan error-severity logs from the project's configured logging backend over
`WINDOW_START → WINDOW_END`. Example: a cloud-logs CLI query
(`<logs-cli> read 'severity>=ERROR AND timestamp>="WINDOW_START"' --project=<id>`),
a log-aggregator API, or `grep` over a self-hosted log store — whichever the
config names.

Group by error fingerprint (message prefix + caller), show counts, and for the
top 5 give: first-seen, last-seen, one-line summary, service/route, a short
interpretation. Flag anything that looks like a **NEW** error class (didn't
appear in the prior 7 days) by re-querying the wider window and diffing
fingerprints. Output `## Logs`. Read-only; never mutate. Cap 300 words.

### Agent — Error tracker

Scan the configured error tracker (e.g. Sentry) over the window via its MCP or
API from the config. If it isn't authenticated, output one line
(`## Error tracker: not authenticated — run /mcp to connect`) and exit cleanly
— do NOT block the rest.

When authenticated: list new regressions (`firstSeen` in window) and spiking
issues (`lastSeen` in window with event-count spike >10× prior-7d avg), capped
at 10 each — title, environment, event count, affected users, issue link,
one-line interpretation. Then pull project-level metrics for the window (event
volume vs prior 24h %, crash-free rate if available, top transactions by p95
regression); flag any negative move >20%. If the project configures a
**performance** dataset (app-start, TTID, slow/frozen frames, per-screen p95),
add a `### Performance` sub-section flagging >20% p95 regressions or absolute
threshold breaches. Output `## Error tracker`. Read-only. Cap 400 words.

### Agent — Dependency / security alerts

Scan the configured dependency/security alert source (e.g. GitHub Dependabot
via `gh api /repos/<owner>/<repo>/dependabot/alerts?state=open`, or another SCA
tool) — distinct from runtime errors. Group open alerts by severity with counts
+ grand total. **Prominently flag alerts newly created in the window** (compare
`created_at`) — the "new since yesterday" items. For every critical/high alert
and every new-in-window alert, surface: number, severity, package, the manifest
path (which app/package), advisory id, one-line summary, url, and whether a
patched version is available (a quick bump). De-dupe the same package+advisory
across manifests. Output `## Dependency alerts` with `### Summary`,
`### New in window`, `### Critical / High (all open)`. Read-only — GET only,
never dismiss/resolve/open PRs. Cap 350 words.

### Agent — What shipped (release diff)

Identify what shipped recently and what's queued, from the release source the
config names (git tags, release notes, or the deployed revision). Example:
`git fetch --tags --quiet origin`; find the most recent release marker
(`git tag --sort=-creatordate | head`, else latest `main` commit, else the
deployed revision's image tag); list commits on the main branch since that
marker grouped by area (backend / mobile / web / shared / infra, inferred from
paths); flag `fix(`/`revert(`/"hotfix" subjects as "did something break?"
candidates; note merged-but-not-released commits. Output `## Release` with
`### Last release`, `### Shipped since`, `### Hotfix candidates`. Cap 300 words.

### Agent — Product analytics (optional)

Only if the config declares an analytics source (e.g. PostHog). Verify the
required access (API key + project id) is present; if not, output one line
(`## Analytics: not configured`) and exit cleanly — never block. When
configured, pull for the window (each capped to top 10): active users +
new-signups vs prior 24h %, top events + deltas vs prior-7d avg, primary-funnel
completion rate (if the config names one), any feature flag whose rollout
changed, and captured exceptions (count + top fingerprints). Output
`## Analytics` with `### Volume`, `### Top events`, `### Anomalies`. Never echo
the API key. Read-only. Cap 350 words.

### Extra project-defined sources

If the config declares any source not covered by an archetype above (a
feedback queue, a status/uptime monitor, an ops metrics backend), spawn one
read-only agent for it following the same contract: scan the window, surface
candidates with source-of-truth links, cap ~350 words, mutate nothing. Never
echo PII (phone numbers, emails, account ids) into the report — reference an
internal record id instead so the assignee can look up contact info.

## Assemble the report

After the agents return, **assemble the partial reports verbatim** into one
markdown document headed `# Issue triage — {{REPORT_DATE}}`. Don't editorialize.
Save it to the report path the config names, else the skill-local archive
`~/.claude/skills/issue-triage/reports/{{REPORT_DATE}}.md`. If a project also
wants a repo-local copy (gitignored), write the same content to both and keep
them in sync. Suggested section order: Release → Logs → Error tracker →
Dependency alerts → Analytics → any project-defined sources.

If a single sub-agent fails, continue with the others — a partial report beats
none. Note the failure in that section (`## Logs: agent failed — <reason>`).

## Hand off to the `triage` decision board

The actionable output is a set of **candidates**, handed to the decision layer:
read `~/.claude/skills/pages/triage/SKILL.md` and build a triage board from the
surfaced candidates (one review stream per source). Each candidate item MUST
link its source of truth. This skill stops at discovery + report + board hand-off
— it makes **no** decisions and takes **no** actions (no ticket creation, no
resolves, no deploys). The user triages on the board asynchronously; the
`triage` skill owns what happens to each GO / defer / no-go.

Suggested candidate framing for the board (draft only — the board decides):
- title ≤70 chars: `[error] <fingerprint>` / `[security] bump <pkg> — <sev>` /
  `[perf] <screen> p95 +<pct>%`
- body: Symptom · First seen · Frequency · Affected service/route · Suspected
  cause · Links
- priority: 1 critical security · 2 user-impacting & frequent · 3 medium ·
  4 noise / single-hit
- Skip candidates already tracked upstream (search before surfacing).

## Final summary

Print a terse top-level summary (≤15 lines): per-source candidate counts
(errors, perf flags, dependency alerts split critical+high / new-in-window,
analytics anomalies, shipped commits), the report path, the triage board URL,
and 1–3 "what to look at first" bullets. Don't re-paste the full report. End
the turn.

## Operational notes

- Everything here is **read-only**. The only writes are the report file(s) and
  the triage board page — never a ticket, resolve, dismiss, deploy, or traffic
  change.
- Never read/echo secret payloads. Never echo PII into the report or board.
- Setup / what a project must configure to use this skill: **`requirements.md`**
  in this directory. Source config is per-project and never hardcoded here.
