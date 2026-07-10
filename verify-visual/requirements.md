# verify-visual — requirements

What must be present for this skill to produce its deliverable (a live `pages` page with the
before/after/diff comparison embedded).

## Always required

- **ImageMagick 7** (`magick`) — pixel diffs and montages (`magick compare` / `magick montage`).
  Verify: `magick --version`. `lib-diff.mjs` / `compare-screenshots.mjs` shell out to it.
- **The `pages` skill + its daemon** — the page is authored in the pages format and served at
  `http://localhost:4317/p/<slug>`. `build-plan.mjs` bootstraps the pages infra into `notes/pages/`
  if absent and (re)starts the daemon. Skill: `~/.claude/skills/pages/SKILL.md`. Render gate:
  `notes/pages/.page-assets/verify.mjs`.
- **Node** — to run the skill's scripts (`build-plan.mjs`, `lib-diff.mjs`, `compare-screenshots.mjs`).

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
  has them, else emitted equivalently.

## Per-project learned-setup doc

Phase 1 writes **`notes/pages/.visual-capture.md`** (gitignored scratch — never committed) recording
how capture works in this project: invoke command(s), output dir(s), naming/state convention, filter
mechanism, base-ref default, video command (or n/a), and worktree/dev-server/emulator gotchas.
Subsequent runs read it and skip discovery; re-learn only when the setup changes.

## Isolation

- A **git worktree** is used to capture the BEFORE (clean base ref) without stashing/resetting the
  user's primary checkout. A fresh worktree needs `yarn install` (no `node_modules`) and may need
  project-specific setup (producer `dist/`, env files, a free dev-server port) — record these in the
  learned-setup doc.
