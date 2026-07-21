# Personal working instructions (Kacper)

Portable "how I work" that applies in **every** project. Version-controlled in my personal skills
repo (`Kacper-Lubisz/claude-skills`); installed by symlinking it to `~/.claude/CLAUDE.md`. Project
repos carry their own `CLAUDE.md` for what the codebase *is* — this file never contains
project-specific facts.

## Method of working

1. **Work in a fresh worktree for any non-trivial change** — never edit directly in the user's
   primary checkout (it holds in-progress work). A fresh worktree has no dependencies installed:
   run the project's install step first. Remove the worktree when the work is pushed.
2. **The primary checkout is off-limits for destructive git.** Never `git stash` / `git reset --hard`
   / `git checkout HEAD -- .` there. Inside my own worktree those are fine.
3. **Plan, then build.** Read the relevant files, write a plan as a **page** (`pages` skill), get it
   right, then implement. A plan is just one kind of page; so is a task-end work summary.
4. **Run the project's check/build gate before committing** — it's mandatory, not optional. If it
   can't run, say so explicitly rather than skipping silently.
5. **Rebase onto the latest default branch** when a chunk passes checks; re-run the gate after a
   rebase (a clean textual merge can still break the build). If conflicts need judgement, stop and
   ask — a wrong resolution silently drops someone's work.
6. **Commit hygiene** — commit by hunk when a file mixes my changes with the user's in-progress work;
   never bundle foreign hunks. Separate unrelated changes into their own commits. Commits land on the
   branch I started on; push with an explicit refspec (I hop branches). End commit messages with the
   `Co-Authored-By` trailer.
7. **Never commit plan/page/scratch files.** Pages live in gitignored `notes/pages/`; the published
   link is what persists, not the file. Clean up scratch when the work lands.
8. **Run the process check before committing / pushing / reporting done** — the `enforce-process`
   skill / `process-enforcer` agent audits worktree isolation, the check gate, rebase freshness, no
   committed plan files, commit-by-hunk hygiene, and task-end cleanup. Apply its fixes; don't argue.
9. **Route non-trivial fixes through a PR**, not a direct push to the default branch.

## External services

- **Writing to Notion requires my explicit permission.** Treat the Notion MCP as read-only by
  default: never create, update, move, or comment on Notion pages unless I explicitly ask for that
  write in the current conversation. A request to "write something up" is not permission to put it
  in Notion — draft it in chat or a page first.

## Code taste (generic — repo conventions still win)

- **Prefer IIFEs over `let` for conditional initialization** — keep the binding `const`, make cases
  exhaustive, read top-down. Avoid folding non-trivial branches into `??` chains.
- **Exhaustive discriminated-union checks** — every variant as its own `else if`, closed by an
  `else` that throws (a `_throw`-style helper) with a `satisfies never`, so a new variant is a
  compile error at every switch site. Never a bare `else` or a `switch` without a throwing default.
- **Encode invariants in types** rather than asserting them at runtime.
- **No `as any`.**
- Match the surrounding code's style, naming, and comment density.

## My personal skills (available in every project)

- **`pages`** — structured pages (plans, design docs, RCAs, work summaries) as React + Tailwind,
  served locally, publishable. Subskills: **`triage`** (decision board) and **`verify-visual`**
  (before/after + flow, learn-first per project). Import real project components into a page via the
  per-project coupling config.
- **`issue-triage`** — scan a project's configured observability/error sources → surface candidates →
  hand to a `triage` board. The "find" half; `triage` is the "decide" half.
- **`mongosh` / `redis`** — generic DB shells; the connection URI is per-machine (env var or a
  gitignored `env`), never committed. A project's own thin skill documents how to derive it.
- **`enforce-process`** — the process auditor above.
- **`frontend-design`** — Anthropic's skill (a submodule here), for aesthetic direction.

Each skill has a `requirements.md` and a load-time preflight — run it and follow the doc if something
is missing.
