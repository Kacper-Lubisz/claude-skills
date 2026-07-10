#!/usr/bin/env node
// compare-screenshots.mjs — deterministic before/after pixel diff (one platform).
//
// Thin CLI over lib-diff.mjs: diffs two screenshot dirs, emits per-file diff
// PNGs, before|after|diff montages, a summary.json, a standalone report.html,
// and a stdout summary. For the consolidated HTML *plan* deliverable across
// platforms, use build-plan.mjs (the skill's mandatory final step).
//
// Usage:
//   node compare-screenshots.mjs --before <dir> --after <dir> --out <dir> [--fuzz 2%] [--threshold 0] [--label "web (iphone)"]

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { diffDirs } from './lib-diff.mjs'

function parseArgs(argv) {
  const args = { fuzz: '2%', threshold: 0, label: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--before') args.before = argv[++i]
    else if (a === '--after') args.after = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--fuzz') args.fuzz = argv[++i]
    else if (a === '--threshold') args.threshold = Number(argv[++i])
    else if (a === '--label') args.label = argv[++i]
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!args.before || !args.after || !args.out) {
    throw new Error('Required: --before <dir> --after <dir> --out <dir>')
  }
  return args
}

function writeReportHtml(args, r) {
  const relForHtml = (p) => path.relative(args.out, p).replace(/\\/g, '/')
  const section = (title, items, render) =>
    items.length
      ? `<h2>${title} <span class="count">${items.length}</span></h2>` + items.map(render).join('')
      : ''
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Visual verification${args.label ? ' — ' + args.label : ''}</title>
<style>
  body{font:14px/1.5 -apple-system,Inter,system-ui,sans-serif;background:#0f0f10;color:#e6e6e6;margin:0;padding:24px}
  h1{font-size:20px} h2{font-size:16px;margin-top:32px;border-bottom:1px solid #333;padding-bottom:6px}
  .count{background:#333;border-radius:10px;padding:1px 8px;font-size:12px;margin-left:6px}
  .item{margin:14px 0;padding:12px;background:#191919;border-radius:8px}
  .name{font-family:ui-monospace,monospace;font-size:13px;color:#9cf;margin-bottom:8px}
  .meta{color:#999;font-size:12px}
  img{max-width:100%;border:1px solid #2a2a2a;border-radius:4px;display:block;margin-top:6px}
  .changed .name{color:#ffb454}.added .name{color:#7ddc7d}.removed .name{color:#ff7d7d}
  .legend{color:#888;font-size:12px}
</style></head><body>
<h1>Visual verification${args.label ? ' — ' + args.label : ''}</h1>
<p class="meta">before: <code>${args.before}</code><br>after: <code>${args.after}</code><br>
fuzz ${args.fuzz}, threshold ${args.threshold}px</p>
<p class="meta"><b>${r.counts.changed}</b> changed &middot; <b>${r.counts.unchanged}</b> unchanged &middot;
<b>${r.counts.added}</b> added &middot; <b>${r.counts.removed}</b> removed</p>
${section(
  'Changed',
  r.changed,
  (c) =>
    `<div class="item changed"><div class="name">${c.rel}</div>
     <div class="meta">${c.sizeMismatch ? 'dimensions changed ' + (c.dims || '') : c.pixels + ' px differ'} &middot; <span class="legend">before | after | diff</span></div>
     <img src="${relForHtml(c.montage)}"></div>`,
)}
${section('Added (only in after)', r.added, (c) => `<div class="item added"><div class="name">${c.rel}</div><img src="${relForHtml(c.montage)}"></div>`)}
${section('Removed (only in before)', r.removed, (c) => `<div class="item removed"><div class="name">${c.rel}</div><img src="${relForHtml(c.montage)}"></div>`)}
${section('Unchanged', r.unchanged, (c) => `<div class="meta">${c.rel}</div>`)}
</body></html>`
  writeFileSync(path.join(args.out, 'report.html'), html)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const r = diffDirs(args.before, args.after, args.out, {
    fuzz: args.fuzz,
    threshold: args.threshold,
    label: args.label,
  })
  writeReportHtml(args, r)

  const L = args.label ? `[${args.label}] ` : ''
  console.log(`${L}changed=${r.counts.changed} unchanged=${r.counts.unchanged} added=${r.counts.added} removed=${r.counts.removed}`)
  for (const c of r.changed) {
    console.log(`  CHANGED ${c.rel} — ${c.sizeMismatch ? 'dimensions changed ' + (c.dims || '') : c.pixels + 'px'}`)
  }
  for (const c of r.added) console.log(`  ADDED   ${c.rel}`)
  for (const c of r.removed) console.log(`  REMOVED ${c.rel}`)
  console.log(`report: ${path.join(args.out, 'report.html')}`)
}

main()
