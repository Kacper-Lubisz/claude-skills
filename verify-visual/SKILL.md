---
name: verify-visual
description: Verify visual/UI changes by capturing before/after screenshots (and, where the change is a sequence, a recorded flow + keyframes) and ALWAYS producing a live page in the /pages skill's format (a `.page.tsx` composed from @page primitives — <BeforeAfter> with a diff toggle, <Stats>, <DecisionTable>, and <FlowTimeline> for video — served at http://localhost:4317/p/<slug>) with the before/after/diff comparison embedded. Project-agnostic and learn-first: on entering a project it discovers (or scaffolds) how visual capture works there, records that in a project-local doc, then captures on a clean base ref vs. the working tree, diffs matching states with ImageMagick, and writes the page + assets to notes/pages/. Use when asked to "verify a visual change", "before/after screenshots", "did this change look right", "screenshot diff", "record the flow", "prove the UI change", or to confirm a UI tweak landed without unintended regressions elsewhere. REQUIRED on any PR that includes a visual/UI change (CLAUDE.md "Visual-change PRs must ship a verify-visual page").
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Verify Visual Changes (learn → capture → render)

Confirm that a UI change does what it should — and nothing it shouldn't — by capturing screenshots
**before** (clean base ref) and **after** (current working tree), diffing the matching states
pixel-by-pixel, and **always** emitting a live page (the `pages` skill's format) with the
before/after/diff comparison embedded. Where the change is a flow, also record the interaction and
embed it in a `<FlowTimeline>`.

This is for **visual** verification only. For behavioural/logic verification use `/verify`.

The skill has one invariant: **it always ends with a `.page.tsx` in the `pages` format**, live at
`http://localhost:4317/p/<slug>`, with the comparison embedded. Everything before that — how the
screenshots get taken — is **project-specific and learned**, not hardcoded. See
[`requirements.md`](requirements.md) for prerequisites.

The work is three phases: **Learn** (how does this project capture UI?) → **Capture** (before vs
after, full fidelity) → **Render** (the pages page). Re-run Learn only when the setup changes;
otherwise skip straight to Capture.

---

## Phase 1 — Learn (how does visual capture work in THIS project?)

The renderer (`build-plan.mjs`, Phase 3) is generic — it takes before/after image dirs and does the
rest. What varies per project is **how you produce those images**. Discover it once, write it down,
reuse it.

### 1a. Check for a learned-setup doc

Look for `notes/pages/.visual-capture.md` (or the project's gitignored scratch equivalent). If it
exists and its assumptions still hold (scripts/paths unchanged), **skip discovery** — read it and go
to Phase 2. Re-learn only when the capture setup has changed.

### 1b. Detect an existing capture suite

Search the project for an e2e / screenshot / visual-regression capability before building anything:

```bash
# scripts named for it
grep -nE '"(e2e|screenshots?|visual|storybook|chromatic|playwright|cypress)[^"]*"\s*:' package.json apps/*/package.json packages/*/package.json 2>/dev/null
# frameworks in deps
grep -rlE '@playwright/test|cypress|detox|puppeteer|@storybook|playwright' --include=package.json . 2>/dev/null
# config + existing output dirs
ls -d **/playwright.config.* **/cypress.config.* **/.detoxrc* **/.storybook 2>/dev/null
find . -type d \( -name screenshots -o -name '__screenshots__' -o -name snapshots \) -not -path '*/node_modules/*' 2>/dev/null
```

Signals to look for: **Playwright**, **Cypress**, **Detox**, **Puppeteer**, **Storybook** (+
Chromatic/test-runner), existing screenshot/snapshot directories, and `package.json` scripts named
`e2e` / `screenshot` / `visual` / `test:visual`.

### 1c. If a suite exists — document how to drive it

Capture, in the learned-setup doc: the **invoke command**, **where output lands**, the **file naming
/ state convention**, and how to **scope/filter** a run. That's all Phase 2 needs.

### 1d. If none exists — scaffold a minimal capture path

Match the stack, keep it minimal and gitignored:

- **Web** → headless browser (Playwright/Puppeteer, or a small script driving the `pages`-style
  daemon or the app's dev server) that navigates the affected routes at fixed viewport(s) and writes
  one PNG per route/state.
- **Native** → whatever the platform offers (Detox + emulator, `xcrun simctl io … screenshot`, adb
  screencap); if nothing is wired, capture the states you can and note the gap in the page.
- **Component-level** → Storybook story screenshots via the test-runner / a headless snapshot.

Write the scaffold as a small script under the project's scratch area (not committed) and record how
to run it in the doc. Keep it to the states the change touches — don't build a full suite.

### 1e. Write the learned-setup doc

Persist findings to **`notes/pages/.visual-capture.md`** (gitignored scratch — never committed) so
later runs skip discovery:

```
# Visual capture — <project>
- Kind: existing | scaffolded
- Package manager: pnpm | yarn | npm | bun  (from lockfile)  · install <cmd>
- Web:   <cmd>  → output <dir>  · naming <pattern>  · filter <how>
- Native:<cmd>  → output <dir>  · naming <pattern>
- Video: <cmd / n/a>
- Dev server: <port>  · owned-marker <title/string to probe>
- Base ref default: git merge-base main HEAD (committed) / capture-before-first (uncommitted)
- Gotchas: <reused/foreign-port dev-server, worktree env, emulator, notes/ not gitignored, …>
```

### Concrete example — what a learned setup looks like (Retainit / TurboCharge)

This is an **example of a filled-in learned setup**, not a hardcoded assumption. In another project
the commands, dirs, and naming will differ — the doc above is what you actually rely on.

- **Web** (Playwright): `cd apps/web && yarn e2e:screenshots [<filter>]`. Auto-starts its own dev
  server (`:3000`) + tRPC mock proxy (`:9091`) and injects Firebase auth — no manual server/emulator.
  Output: `apps/web/e2e/screenshots/{iphone,chromium}/<page>--<state>.png`. Specs in
  `apps/web/e2e/tests/screenshots/`. Scope: `yarn e2e:screenshots 07-quiz` or `--grep "library"`.
- **Mobile** (Detox): `cd apps/mobile && yarn e2e:screenshots` — **heavy**: needs a built APK +
  running Android emulator + proxy mode (`yarn e2e:build:android` first). Output:
  `apps/mobile/e2e/screenshots/<page>--<state>.png`. Only if an emulator is up or explicitly asked.
- **Naming**: `NN-<page-slug>--<state-id>.png` (`default` state omits `--<state-id>`). New coverage
  is registered in `apps/e2e-dashboard/lib/page-registry.ts` + a spec (CLAUDE.md "Testing & E2E
  screenshots"). This skill does **not** add coverage — if the changed surface has no state yet, say
  so and point at that policy.
- **Video**: `yarn e2e:video` on each app (see Phase 2). Screenshot dirs are gitignored.

---

## Phase 2 — Capture (before vs after, full fidelity)

Produce two matched sets of images (and, for a flow, two recordings) using the Phase-1 commands.
There are **two ways to get the BEFORE**, and which one you use depends on whether the change is
committed. The **capture-before-first** path (2b) is the default; the worktree path (2c) is the
fallback for already-committed work.

### 2a. Scope the change

```bash
git diff --stat <base>...HEAD   # committed
git status --porcelain          # uncommitted (working-tree) changes
```

- Map changed UI files → the page slugs / routes / stories to filter on, using the learned naming
  convention. A change to shared chrome (nav, theming, a shared component) is **not** scopeable — run
  the full suite for that client.
- User-visible changes usually land on **more than one surface** (e.g. web + mobile). Note if only
  one is being verified and why (e.g. "mobile skipped — no emulator running; web covers it").
- **Decide the BEFORE strategy** from where the change lives:
  - **Fully uncommitted** (the common case — you just made the edit and haven't committed) → the
    clean tree at `HEAD` _is_ the before. Use **capture-before-first (2b)**: capture the base on the
    working tree as-is _before_ applying/keeping the change, then apply and capture after. **No
    worktree needed**, which avoids fighting a shared dev server.
  - **Already committed** (the change is one or more commits on your branch) → you can't un-apply it
    on the working tree cheaply, so capture the base from a **worktree at the base ref (2c)**. Base =
    `git merge-base main HEAD`.
  - Confirm the ref if ambiguous.

### 2b. Capture-before-first (PRIMARY — for uncommitted changes)

When the change is uncommitted, capture the BEFORE on the clean tree first, then bring the change in
and capture the AFTER. Same checkout, same dev server, no worktree:

```bash
# 1) Set the change aside on your OWN worktree/branch only (git stash is fine in your own
#    worktree — NEVER in the user's primary checkout; there, copy the dirty files aside instead).
git stash push -u        # own worktree only
<capture-cmd> <filter>                                   # BEFORE = clean HEAD
cp -r <output-dir> "$CLAUDE_JOB_DIR/tmp/before-<surface>"

# 2) Restore the change and capture AFTER
git stash pop            # own worktree only
<capture-cmd> <filter>                                   # AFTER = working tree
cp -r <output-dir> "$CLAUDE_JOB_DIR/tmp/after-<surface>"
```

In the user's **primary checkout** (no stash allowed there), do the equivalent without git: copy the
edited files to a temp location, `git checkout -- <files>` is also off-limits, so instead capture
AFTER first (working tree as-is), then apply the inverse diff (`git diff <files> | git apply -R`) to
reach the clean state, capture BEFORE, and re-apply (`git apply`) to restore. Either ordering works —
the invariant is **both captures run against the same running app on the same port**, so a real edit
can't hide behind a stale/shared server.

### 2c. Capture BEFORE from a worktree (fallback — for committed changes)

When the change is already committed, capture the base in a throwaway worktree at the base ref. Never
`git stash`/reset the user's primary checkout (CLAUDE.md no-stash rule):

```bash
git worktree add --detach .claude/worktrees/visual-before <base>
# Bootstrap deps with the project's package manager (detect from the lockfile — see below):
cd .claude/worktrees/visual-before && <install-cmd>   # fresh worktree has no node_modules
<capture-cmd> <filter>
cp -r <output-dir> "$CLAUDE_JOB_DIR/tmp/before-<surface>"
```

**Detect the package manager from the lockfile — do NOT hardcode `yarn install`:**

| Lockfile            | `<install-cmd>`             | `<capture-cmd>` prefix        |
| ------------------- | --------------------------- | ----------------------------- |
| `pnpm-lock.yaml`    | `pnpm install`              | `pnpm <script>` / `pnpm dlx`  |
| `yarn.lock`         | `yarn` (or `yarn install`)  | `yarn <script>`               |
| `package-lock.json` | `npm ci` (fallback `npm i`) | `npm run <script>` / `npx`    |
| `bun.lockb`         | `bun install`               | `bun run <script>`            |

A worktree capture also has **its own dev server on its own port** — this is exactly why it's the
safe fallback, but it needs project setup (producer `dist/` built, dev-server port isolation, env
files); record these in the learned-setup doc the first time you hit them. For a Retainit web e2e
from a worktree, see memory `reference_web_e2e_in_worktree.md` (build `build:dep` per producer,
`NEXT_PUBLIC_FIREBASE_EMULATOR=false`, copy `.env`, non-3000 port). Native base capture needs a
rebuilt artifact from the worktree — only if that surface was explicitly requested.

### 2c-bis. Confirm the dev server is serving THIS project before capturing

Whether 2b or 2c, if capture drives a browser against a dev server, **do not trust
`reuseExistingServer` on a shared/default port**. Ports like `3000` / `4000` may already be serving a
**different app** entirely — the suite will happily screenshot the wrong UI, and both before and
after will look identical (or wrong) with no error. Before capturing:

- **Prefer starting the app on a non-default, project-owned port** (e.g. an unused high port) so
  there's no ambiguity about who owns it.
- **Probe the port before trusting it**: fetch a known route and assert a project-specific marker
  (the app's `<title>`, a known heading, an API string) is present. Only then capture.

```bash
# Reject a foreign server squatting on the port
curl -fsS "http://localhost:$PORT/" | grep -qi "$EXPECTED_TITLE_OR_MARKER" \
  || { echo "port $PORT is not serving THIS project — start it elsewhere"; exit 1; }
```

### 2d. Capture a flow (when the change is a sequence/interaction)

For a change that is an interaction (a multi-step flow, an animation, a transition), a per-state
still under-sells it — record the flow and capture the **events** (taps / navigations / inputs) so
Phase 3's `<FlowTimeline>` can animate a cursor + synced caption over the video.

- Use the learned video command (if the project has one) for BEFORE and AFTER, keeping the two sets
  in separate dirs. Recordings must be **webm** for in-browser playback (re-encode `.mp4` if needed).
- The sidecar per recording holds **keyframes** (`{name, tMs}`) and **events** (`tap/type/nav`, with
  source-pixel coords + `size`). If the project has capture helpers (Retainit: `markTap/markType/
  markNav` in e2e `video.ts`; keyframes via `takeStateScreenshot` / the Detox jest hook), use them;
  otherwise emit an equivalent `<base>.keyframes.json` sidecar alongside the video.
- Retainit example: `cd apps/web && yarn e2e:video [<grep>]` (Playwright, one video/test) or
  `cd apps/mobile && yarn e2e:video` (Detox artifacts plugin, wall-clock keyframes). Pair each video
  with its sidecar via `node scripts/collect-video.mjs web|mobile`.

---

## Phase 3 — Render (via the pages skill) — ALWAYS the deliverable

Every run ends with a `.page.tsx` in the `pages` skill's format — a React + Tailwind page composed
from the `@page` primitive library, served live by the pages Vite daemon at
`http://localhost:4317/p/<slug>`. Read the pages skill first for how pages are authored/served:
**`~/.claude/skills/pages/SKILL.md`**. This is not optional — it is the output of the skill.

The renderer is `build-plan.mjs`. It is **project-agnostic**: it runs the ImageMagick pixel diff
(via `lib-diff.mjs`), copies before/after/diff images into `notes/pages/<slug>-assets/`, writes
`notes/pages/<slug>.page.tsx`, bootstraps the pages infra if absent, and (re)starts the daemon so the
URL is immediately live.

### 3a. Stills — before/after + diff

```bash
node ~/.claude/skills/verify-visual/scripts/build-plan.mjs \
  --slug visual-verify-<slug> \
  --title "<short change name>" \
  --summary "<one-line intent>" \
  --workdir "$CLAUDE_JOB_DIR/tmp/plan-work" \
  --pair "web (iphone)"   "$CLAUDE_JOB_DIR/tmp/before-web/iphone"   "$CLAUDE_JOB_DIR/tmp/after-web/iphone" \
  --pair "web (chromium)" "$CLAUDE_JOB_DIR/tmp/before-web/chromium" "$CLAUDE_JOB_DIR/tmp/after-web/chromium"
```

- One `--pair <label> <beforeDir> <afterDir>` per platform/viewport. Pass the Phase-2 snapshot dirs.
- The generated page has: a verdict `<Callout>`, a `<Stats>` row + per-platform `<DecisionTable>`
  (changed/added/removed/unchanged), and per changed state a `<BeforeAfter>` (before | after) with
  the pixel-diff as a **toggle**. Added/removed render as one labelled block.
- Tunables: `--fuzz 2%` (per-pixel colour tolerance — absorbs antialiasing), `--threshold 0` (max
  differing pixels still counted "unchanged").

### 3b. Flow — `<FlowTimeline>`

Use `--video-pair` instead of `--pair` for a recorded flow:

```bash
node ~/.claude/skills/verify-visual/scripts/build-plan.mjs --slug <slug> --title "..." \
  --video-pair "mobile" <beforeVideo> <beforeKeyframes.json> <afterVideo> <afterKeyframes.json>
```

build-plan extracts each keyframe still (ffmpeg), diffs before-vs-after stills, embeds the AFTER
recording in a `<FlowTimeline>` (video + keyframe snaps + rail markers + animated cursor + live
caption), and renders each changed keyframe as a `<BeforeAfter>` with the diff toggle. `ffmpeg`/
`ffprobe` required. `<FlowTimeline tracks=[…]>` takes one track per environment (a track selector +
active-env label); the video is the clock (played natively, never `currentTime`-thrashed). Tap
coords are source-pixel — pass `srcWidth/srcHeight` from the sidecar `size`.

- **Keyframe stills carry animation noise — mask or fuzz them up.** A still cropped from a recording
  captures whatever frame the wall clock landed on, so **animated content** (typewriter text,
  blinking cursors, spinners, a moving input caret) differs between the before and after recording
  even when nothing you changed did — and unlike still-screenshot capture you can't freeze the frame.
  That noise **drowns a real colour/layout change** in the diff. Two levers:
  - **Per-keyframe mask rectangles** — exclude the animating region from the diff. Add a `mask`
    array (`[{x,y,w,h}]`, source pixels) to the keyframe entry in the sidecar; build-plan paints
    those rects out of both stills before `magick compare` so only stable regions are diffed. Prefer
    this when the change you're proving is _outside_ the animating region.
  - **Higher default fuzz for video keyframes** — video keyframe diffs default to a **higher `--fuzz`
    than still screenshots** (e.g. `--fuzz 8%` vs `2%`) to absorb sub-frame animation jitter; raise
    it further for a noisy flow. Note in the page that video-keyframe fuzz is elevated so a reader
    knows a small real delta may be within tolerance — mask the region instead when the change is
    subtle.

### 3c. Comparison UX (built into `@page`)

- `<BeforeAfter>` is a self-contained card with modes: **Click to swap** (default), **Side by side**,
  **Swipe** (drag-to-reveal), **Diff** (when a `diff` is passed). **Always prefer showing the AFTER**
  — click-to-swap shows after first, before one click away.
- Screenshots are served via `/api/asset/<slug>/<file>`. The page + its `-assets/` are scratch that
  the skill writes under `notes/pages/` — **never commit them** (CLAUDE.md workflow step 10); sweep
  on task-end.
- **Do not assume `notes/` is gitignored — it isn't in every repo** (it is in Retainit; a fresh
  Next.js/other project won't have it). Regardless, **never stage** the page or its assets. If
  `git status` shows `notes/` as untracked, tell the user they likely want to add `notes/` (or
  `notes/pages/`) to `.gitignore` — but do that only at their direction; leave it untracked and
  unstaged either way.

### 3d. Verify + verdict

- **Fail loud on the render step — never report a URL you haven't confirmed is live.** After
  build-plan writes the page it (re)starts the pages daemon; a printed `http://localhost:4317/p/<slug>`
  is **not** proof the daemon came up. Cross-reference the pages skill's **`preflight`** step
  (`~/.claude/skills/pages/SKILL.md`): confirm the **daemon port is actually bound** and the page
  responds before you hand out the URL.

  ```bash
  # daemon up? (port bound + page responds 200) — else the URL is a lie
  curl -fsS -o /dev/null "http://localhost:4317/p/visual-verify-<slug>" \
    || { echo "pages daemon not up / page errored — do NOT report the URL"; exit 1; }
  ```

- **Verify it renders** before reporting done: `node notes/pages/.page-assets/verify.mjs <slug>` (the
  pages render gate — fails on compile/runtime error or empty render). The gate drives the page with
  **`@playwright/test`** (import from `@playwright/test`, which is what projects commonly have
  installed — not a bare `import ... from 'playwright'`, which is often absent).
- Judge against intent, on the page (`http://localhost:4317/p/<slug>`):
  - **Intended states changed?** Targeted states show a diff matching the described intent.
  - **Unintended regressions?** Any changed state the edit should *not* have touched is a red flag —
    call it out specifically; the ImageMagick diff across all matched states surfaces these.
  - **Coverage gap?** If the changed surface has no capturable state, say so and reference the
    "every user-visible change needs a screenshot" policy — don't silently pass.
  - **False-negative check (mandatory):** if the page shows 0 changes but you expected one, do NOT
    report "no change" — confirm the change actually renders in the captured AFTER image (crop the
    region and read it). A reused/stale dev server or an edit to an unrendered component are the two
    classic causes (see failure modes).

Always end your message with the live page URL plus a one-line pass/fail verdict.

`compare-screenshots.mjs` is an optional per-platform path (one standalone dark `report.html` +
montages, no daemon) for a quick single-viewport check; `build-plan.mjs` is canonical.

---

## Cleanup

```bash
# only if you used the worktree fallback (2c):
git worktree remove --force .claude/worktrees/visual-before
# capture-before-first (2b): confirm the change is restored — no stash left behind
git stash list        # own worktree only; must not have dropped the change
```

Snapshots live under `$CLAUDE_JOB_DIR/tmp` and clean with the job. Don't touch the user's screenshot
dirs (scratch). The learned-setup doc (`.visual-capture.md`) is meant to persist across runs — leave
it. Leave `notes/pages/` scratch unstaged (it may or may not be gitignored — see 3c).

## Notes & failure modes

- **CRITICAL — never capture against a reused/shared dev server (two distinct failure modes).**
  1. **Stale compile.** If a headless-browser suite reuses an already-running dev server (e.g.
     Playwright's `reuseExistingServer: !CI` against a `:3000` already up), **both** before and after
     runs hit that one server, which may serve a **stale compile** that ignores on-disk edits fed by
     tools (`sed`/Edit) rather than an editor save — so before == after and the diff falsely reports
     "no change".
  2. **Wrong app entirely.** A default port (`:3000`/`:4000`) already up may belong to a **completely
     different project** — the suite screenshots that app's UI, not yours, and the whole
     before/after is meaningless. Seen in a real fresh-Next.js run where `:3000` served an unrelated
     app.

  Defend against **both**: prefer starting the app on a **non-default project-owned port**, and
  **probe the port** for a project-specific marker before capturing (Phase 2c-bis). For the
  capture-before-first path, keep the same server across both captures. For committed changes, use a
  **separate worktree** (own build dir, own port). **Always verify the change is present in the
  captured AFTER image** before trusting a diff.
- **ImageMagick required**: `magick compare` / `magick montage` (IM7). Verify with `magick --version`.
- **Dimension changes** (layout reflow that resizes a state) make `compare` refuse a pixel count —
  the diff flags "dimensions changed" and still produces a side-by-side montage.
- **Flaky/non-deterministic states** (timestamps, randomized content, mid-flight animations) produce
  spurious diffs. Raise `--fuzz`/`--threshold`, or note the state is inherently noisy — but prefer
  fixing the state's mock/fixture over loosening the threshold.
- **Native capture is expensive** — build + emulator/simulator. Default to web-only unless native is
  explicitly requested or a device/emulator is already running.
- Don't add or modify screenshot **coverage** here — that's a code change subject to the project's
  registry/spec policy. This skill only captures and diffs the states that exist (or that a minimal
  scaffold can reach), then renders the page.
