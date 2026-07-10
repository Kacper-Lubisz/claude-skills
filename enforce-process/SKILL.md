---
name: enforce-process
description: >
  Audit the current work against the project's defined way-of-working and report a pass/fail
  process checklist (worktree isolation, the mandatory check/lint gate, rebase freshness, no plan
  files committed, commit-by-hunk hygiene, task-end cleanup). Runs the read-only `process-enforcer`
  teammate, which inspects but never edits. Use when the user types /enforce-process, says "check
  the process", "did I follow the process", "process audit", "are we clean to commit" — and invoke
  it proactively before committing, before pushing, and before reporting a task done.
user-invocable: true
---

# Enforce process

This skill runs the **`process-enforcer`** teammate — a strictly read-only auditor whose single job
is to verify the current work follows the project's process (as defined in `CLAUDE.md`) and report
violations with the exact fix. It advises; it never edits, stages, commits, or runs the build.

## How to run it

Spawn the teammate with the `process-enforcer` agent type and a short pointer to what's being
audited:

```
Agent(
  subagent_type: "process-enforcer",
  description:    "Audit process compliance",
  prompt:         "Audit the current work in this repo against the project's CLAUDE.md process.
                   Context: <one line — e.g. 'about to commit the reward-bolt fix' or
                   'wrapping up the aspects-rebuild task, before reporting done'>.
                   Return the pass/fail checklist, verdict, and the fix list."
)
```

Then **relay the verdict and fix list to the user verbatim** (the teammate's output isn't shown to
them). If the verdict is `❌ BLOCKED`, **do not proceed** with the commit/push/done — take the
listed remediation actions first (the auditor can't, it's read-only), then re-run this skill to
confirm `✅ CLEAR` before continuing.

## When to invoke it proactively (without being asked)

- **Before any `git commit`** — catches a staged plan file, a mixed-hunk file, or work on the wrong
  branch before it's baked into history.
- **Before `git push` / opening a PR** — catches a stale-vs-`origin/main` branch.
- **Before writing `result:` / reporting a task done** — catches skipped cleanup or an unverified
  check gate.

It's cheap (read-only, one teammate). When in doubt, run it — a blocked commit is far cheaper to fix
before it lands.

## What it checks

The teammate reads the active project's `CLAUDE.md` each run, so the checklist adapts per project.
The universal backbone: worktree isolation · branch sanity · the mandatory check/lint gate before
commit · rebase freshness vs `origin/main` · no plan files staged or committed · commit-by-hunk when
a file has foreign changes · no `git stash`/`reset --hard` in the primary checkout · task-end
cleanup of plan files and scratch worktrees — plus any extra "never do X" rules it finds in
`CLAUDE.md`.

## What it does NOT do

It will not run `yarn check`/the build (that's a mutating gatekeeper action, not an audit) — instead
it flags the gate `⚠ UNVERIFIED` and tells you to confirm it green. It will not fix anything. If a
mutation is required, it returns it as an action for the main agent to take.
