# verify-visual — requirements

What must be present for this skill to produce its deliverable (a live `pages` page with the
before/after/diff comparison embedded).

## Always required

- **ImageMagick 7** (`magick`) — pixel diffs and montages (`magick compare` / `magick montage`).
  Verify: `magick --version`. `lib-diff.mjs` / `compare-screenshots.mjs` shell out to it.
- **The `pages` skill + its daemon, confirmed up** — the page is authored in the pages format and
  served at `http://localhost:4317/p/<slug>`. `build-plan.mjs` bootstraps the pages infra into
  `notes/pages/` if absent and (re)starts the daemon. A printed URL is **not** proof: confirm the
  **daemon port is bound and the page responds** (pages skill's `preflight`) before reporting it.
  Skill: `~/.claude/skills/pages/SKILL.md`. Render gate: `notes/pages/.page-assets/verify.mjs`,
  which drives the page with **`@playwright/test`** (import from `@playwright/test` — commonly
  installed — not a bare `playwright` import).
- **Node** — to run the skill's scripts (`build-plan.mjs`, `lib-diff.mjs`, `compare-screenshots.mjs`).
- **The project's package manager** — detected from the lockfile, never hardcoded: `pnpm-lock.yaml`
  → `pnpm install`, `yarn.lock` → `yarn`, `package-lock.json` → `npm ci`, `bun.lockb` →
  `bun install`. Used to bootstrap a fresh worktree in the 2c fallback and to run capture scripts.

## A capture capability — EITHER of:

- **An existing project e2e / screenshot / visual-regression suite** (Playwright, Cypress, Detox,
  Puppeteer, Storybook + test-runner, or a project screenshot script) that can be driven on a base
  ref and on the working tree. Phase 1 detects and documents it.
- **The ability to scaffold a minimal capture path** for the project's stack (web → headless browser
  screenshotting the affected routes; native → simulator/emulator screenshot; component → Storybook
  story snapshot). Phase 1 builds it into the project's gitignored scratch area, minimally, for just
  the states the change touches.

## For flow (video) mode only

- **ffmpeg + ffprobe** — `build-plan.mjs --video-pair` extracts keyframe stills and processes the
  recording. Recordings must be **webm** for in-browser playback (re-encode `.mp4` if the capture
  tool emits it).
- A **keyframes/events sidecar** per recording (`<base>.keyframes.json`) with `{name, tMs}` keyframes
  and `tap/type/nav` events (source-pixel coords + `size`) — from the project's capture helpers if it
  has them, else emitted equivalently. Keyframe entries may carry an optional **`mask`** array
  (`[{x,y,w,h}]`, source pixels) to exclude animating regions (typewriters, cursors, spinners) from
  the diff. Video keyframe diffs also default to a **higher `--fuzz`** than still screenshots to
  absorb sub-frame animation jitter — mask the region when the change to prove is subtle.

## Per-project learned-setup doc

Phase 1 writes **`notes/pages/.visual-capture.md`** (gitignored scratch — never committed) recording
how capture works in this project: invoke command(s), output dir(s), naming/state convention, filter
mechanism, base-ref default, video command (or n/a), and worktree/dev-server/emulator gotchas.
Subsequent runs read it and skip discovery; re-learn only when the setup changes.

## Getting the BEFORE (two paths)

- **Capture-before-first (primary, uncommitted changes)** — no worktree: capture the base on the
  clean working tree, then apply/restore the change and capture the after, against the **same running
  app on the same port**. `git stash` is fine in your **own** worktree/branch; in the user's primary
  checkout, reach the clean/dirty states with `git apply -R` / `git apply` on the diff instead.
- **Worktree (fallback, already-committed changes)** — a **git worktree** at the base ref captures
  the BEFORE without touching the primary checkout. A fresh worktree needs an install with the
  detected package manager (no `node_modules`) and may need project setup (producer `dist/`, env
  files, a free dev-server port) — record these in the learned-setup doc.

## Dev-server trust

- If capture drives a browser against a dev server, **do not trust `reuseExistingServer` on a shared
  or default port** (`:3000`/`:4000` may serve a **different app** — you'd screenshot the wrong UI).
  Prefer a **non-default project-owned port**, and **probe the port for a project-specific marker**
  (title/heading/API string) before capturing.
- `notes/pages/` scratch is **not guaranteed gitignored** — never stage the page or its assets; the
  user may need to add `notes/` to `.gitignore`.
