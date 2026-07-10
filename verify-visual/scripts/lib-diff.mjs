// lib-diff.mjs — shared before/after pixel-diff core (ImageMagick).
// Used by compare-screenshots.mjs (per-platform CLI + report.html) and
// build-plan.mjs (consolidated HTML plan deliverable).

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import path from 'node:path'

export function walkPngs(root) {
  const out = new Map() // relPath -> absPath
  if (!existsSync(root)) return out
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry)
      const st = statSync(abs)
      if (st.isDirectory()) walk(abs)
      else if (entry.toLowerCase().endsWith('.png')) out.set(path.relative(root, abs), abs)
    }
  }
  walk(root)
  return out
}

export function dimensions(file) {
  const r = spawnSync('magick', ['identify', '-format', '%wx%h', file], { encoding: 'utf8' })
  return (r.stdout || '').trim() // e.g. "390x844"
}

// ---- video keyframe extraction (video mode) --------------------------------
// Pull a single still from a recording at `tMs` (wall-clock offset from the
// recorder start). `-ss` before `-i` = fast seek; accurate enough for keyframes.
export function extractStill(video, tMs, outPng) {
  const sec = Math.max(0, tMs / 1000)
  spawnSync('ffmpeg', ['-y', '-ss', String(sec), '-i', video, '-frames:v', '1', '-q:v', '2', outPng], { encoding: 'utf8' })
  return existsSync(outPng) ? outPng : null
}
// Extract one still per keyframe into outDir, named `<keyframe.name>.png`.
// Returns { name -> absPath } for the stills that were produced.
export function extractKeyframeStills(video, keyframes, outDir) {
  mkdirSync(outDir, { recursive: true })
  const out = {}
  for (const k of keyframes) {
    const p = path.join(outDir, `${k.name.replace(/[/\\]/g, '__')}.png`)
    if (extractStill(video, k.tMs, p)) out[k.name] = p
  }
  return out
}
// Video duration in seconds via ffprobe (0 if unavailable).
export function videoDuration(video) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video], { encoding: 'utf8' })
  const d = parseFloat((r.stdout || '').trim())
  return Number.isFinite(d) ? d : 0
}

// IM7's `compare` does NOT error on mismatched dimensions — it silently
// composites within the larger frame and reports AE against the overlap, which
// hides real layout reflow. So we detect a size change up front with identify.
export function comparePair(before, after, diffOut, fuzz) {
  const db = dimensions(before)
  const da = dimensions(after)
  if (db && da && db !== da) return { pixels: Infinity, sizeMismatch: true, dims: `${db} → ${da}` }
  const r = spawnSync(
    'magick',
    ['compare', '-metric', 'AE', '-fuzz', fuzz, before, after, diffOut],
    { encoding: 'utf8' },
  )
  const stderr = (r.stderr || '').trim()
  const m = stderr.match(/[\d.eE+]+/) // AE prints the pixel count (e.g. "178" / "0 (0)")
  if (m) return { pixels: Number(m[0]), sizeMismatch: false }
  if (r.status === 0) return { pixels: 0, sizeMismatch: false }
  return { pixels: NaN, sizeMismatch: false, error: stderr || `exit ${r.status}` }
}

export function montage(before, after, diff, montageOut) {
  const inputs = diff && existsSync(diff) ? [before, after, diff] : [before, after]
  const tile = inputs.length === 3 ? '3x1' : '2x1'
  spawnSync(
    'magick',
    ['montage', ...inputs, '-tile', tile, '-geometry', '+6+6', '-background', '#1a1a1a', montageOut],
    { encoding: 'utf8' },
  )
}

// Diff two screenshot dirs. Writes diffs/, montages/, summary.json under outDir.
// Returns { label, counts, changed[], unchanged[], added[], removed[] } with
// absolute image paths on each entry (before/after/diff/montage as available).
export function diffDirs(beforeDir, afterDir, outDir, opts = {}) {
  const fuzz = opts.fuzz ?? '2%'
  const threshold = opts.threshold ?? 0
  const label = opts.label ?? ''
  const beforeMap = walkPngs(beforeDir)
  const afterMap = walkPngs(afterDir)
  const diffsDir = path.join(outDir, 'diffs')
  const montagesDir = path.join(outDir, 'montages')
  mkdirSync(diffsDir, { recursive: true })
  mkdirSync(montagesDir, { recursive: true })

  const all = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const changed = []
  const unchanged = []
  const added = []
  const removed = []

  for (const rel of [...all].sort()) {
    const b = beforeMap.get(rel)
    const a = afterMap.get(rel)
    const safe = rel.replace(/[/\\]/g, '__')
    if (b && a) {
      const diffOut = path.join(diffsDir, safe)
      const res = comparePair(b, a, diffOut, fuzz)
      if (res.pixels > threshold || Number.isNaN(res.pixels)) {
        const montOut = path.join(montagesDir, safe)
        montage(b, a, existsSync(diffOut) ? diffOut : null, montOut)
        changed.push({ rel, ...res, before: b, after: a, diff: diffOut, montage: montOut })
      } else {
        unchanged.push({ rel, before: b, after: a })
      }
    } else if (a && !b) {
      const dst = path.join(montagesDir, safe)
      copyFileSync(a, dst)
      added.push({ rel, after: a, montage: dst })
    } else if (b && !a) {
      const dst = path.join(montagesDir, safe)
      copyFileSync(b, dst)
      removed.push({ rel, before: b, montage: dst })
    }
  }

  const result = {
    label,
    beforeDir,
    afterDir,
    fuzz,
    threshold,
    counts: {
      changed: changed.length,
      unchanged: unchanged.length,
      added: added.length,
      removed: removed.length,
    },
    changed,
    unchanged,
    added,
    removed,
  }
  writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(
      {
        ...result,
        changed: changed.map((c) => ({ rel: c.rel, pixels: c.pixels, sizeMismatch: !!c.sizeMismatch })),
        added: added.map((c) => c.rel),
        removed: removed.map((c) => c.rel),
        unchanged: unchanged.map((c) => c.rel),
      },
      null,
      2,
    ),
  )
  return result
}
