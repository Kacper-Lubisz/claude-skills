#!/usr/bin/env node
// build-plan.mjs — consolidated before/after VERIFICATION PLAN as a `.page.tsx`.
//
// The skill's mandatory final deliverable, in the /pages skill's format: a React +
// Tailwind `<slug>.page.tsx` composed from @page primitives, served live by the plan
// Vite daemon at http://localhost:4317/p/<slug>. Two capture modes:
//
//   STATIC (--pair):       diff PNG-dir vs PNG-dir → <BeforeAfter> with a diff TOGGLE.
//   VIDEO  (--video-pair): diff keyframe stills extracted from before/after recordings,
//                          AND embed the after recording in a <FlowTimeline> that scrubs
//                          the video between keyframes and snaps to each keyframe still.
//
// Screenshots/videos are copied into notes/pages/<slug>-assets/ (served via /api/asset).
//
// Usage:
//   node build-plan.mjs --slug <slug> --title "..." [--summary "..."] [--plans-dir notes/pages]
//     [--fuzz 2%] [--threshold 0] [--workdir <tmp>]
//     --pair "web (iphone)" <beforeDir> <afterDir>
//     --video-pair "mobile" <beforeVideo> <beforeKeyframes.json> <afterVideo> <afterKeyframes.json>

import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { diffDirs, extractKeyframeStills, videoDuration } from './lib-diff.mjs'

function parseArgs(argv) {
  const args = { fuzz: '2%', threshold: 0, pairs: [], videoPairs: [], flowTracks: [], title: 'Visual verification', summary: '', plansDir: 'notes/pages' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--slug') args.slug = argv[++i]
    else if (a === '--title') args.title = argv[++i]
    else if (a === '--summary') args.summary = argv[++i]
    else if (a === '--plans-dir') args.plansDir = argv[++i]
    else if (a === '--fuzz') args.fuzz = argv[++i]
    else if (a === '--threshold') args.threshold = Number(argv[++i])
    else if (a === '--workdir') args.workdir = argv[++i]
    else if (a === '--pair') args.pairs.push({ label: argv[++i], before: argv[++i], after: argv[++i] })
    else if (a === '--video-pair') args.videoPairs.push({ label: argv[++i], beforeVideo: argv[++i], beforeKf: argv[++i], afterVideo: argv[++i], afterKf: argv[++i] })
    // --flow-track <flowLabel> <platform> <size> <video> <keyframes.json>
    // Tracks sharing a flowLabel become selectable tracks of one replay <FlowTimeline>.
    else if (a === '--flow-track') args.flowTracks.push({ flow: argv[++i], platform: argv[++i], size: argv[++i], video: argv[++i], kf: argv[++i] })
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!args.slug) throw new Error('Required: --slug <kebab-slug>')
  if (!args.pairs.length && !args.videoPairs.length && !args.flowTracks.length) throw new Error('Required: at least one --pair, --video-pair, or --flow-track')
  return args
}

// Display frame size for a track, fitting the source video dims into a tidy box
// (wide → ~440px, tall → ~500px), preserving aspect.
function frameSize(vw, vh) {
  if (!vw || !vh) return { w: 240, h: 470 }
  if (vw >= vh) { const w = Math.min(460, vw); return { w: Math.round(w), h: Math.round((w * vh) / vw) } }
  const h = 500
  const w = Math.round((h * vw) / vh)
  return { w: Math.min(w, 300), h: w > 300 ? Math.round((300 * vh) / vw) : h }
}

const j = (v) => JSON.stringify(v)
const slugify = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
const readKeyframes = (p) => {
  const data = JSON.parse(readFileSync(p, 'utf8'))
  return { keyframes: Array.isArray(data.keyframes) ? data.keyframes : [], raw: data }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const workdir = args.workdir ?? mkdtempSync(path.join(os.tmpdir(), 'vv-plan-'))
  const plansDir = path.resolve(args.plansDir)
  const assetsDir = path.join(plansDir, `${args.slug}-assets`)
  if (existsSync(assetsDir)) rmSync(assetsDir, { recursive: true, force: true })
  mkdirSync(assetsDir, { recursive: true })
  const A = `/api/asset/${args.slug}`
  const stage = (src, file) => { if (src && existsSync(src)) { copyFileSync(src, path.join(assetsDir, file)); return file } return null }

  // ---- STATIC pairs: diff dirs, stage before/after/diff stills ----
  const staticSections = args.pairs.map((p) => {
    const out = path.join(workdir, slugify(p.label))
    const r = diffDirs(p.before, p.after, out, { fuzz: args.fuzz, threshold: args.threshold, label: p.label })
    const lab = slugify(p.label)
    const changed = r.changed.map((c) => ({
      rel: c.rel,
      meta: c.sizeMismatch ? `dimensions changed ${c.dims || ''}` : `${c.pixels} px differ`,
      before: stage(c.before, `${lab}__${slugify(c.rel)}.before.png`),
      after: stage(c.after, `${lab}__${slugify(c.rel)}.after.png`),
      diff: stage(c.diff, `${lab}__${slugify(c.rel)}.diff.png`),
    }))
    const added = r.added.map((c) => ({ rel: c.rel, img: stage(c.after ?? c.montage, `${lab}__${slugify(c.rel)}.added.png`) }))
    const removed = r.removed.map((c) => ({ rel: c.rel, img: stage(c.before ?? c.montage, `${lab}__${slugify(c.rel)}.removed.png`) }))
    return { kind: 'static', label: p.label, counts: r.counts, changed, added, removed }
  })

  // ---- VIDEO pairs: extract keyframe stills, diff, embed after recording ----
  const videoSections = args.videoPairs.map((p) => {
    const lab = slugify(p.label)
    const beforeKf = readKeyframes(p.beforeKf).keyframes
    const afterKf = readKeyframes(p.afterKf).keyframes
    const beforeDir = path.join(workdir, lab, 'before')
    const afterDir = path.join(workdir, lab, 'after')
    extractKeyframeStills(p.beforeVideo, beforeKf, beforeDir)
    const afterStills = extractKeyframeStills(p.afterVideo, afterKf, afterDir)
    const r = diffDirs(beforeDir, afterDir, path.join(workdir, lab, 'diff'), { fuzz: args.fuzz, threshold: args.threshold, label: p.label })

    // embed the AFTER recording + one still per keyframe (for the FlowTimeline snap)
    const ext = path.extname(p.afterVideo) || '.mp4'
    const videoFile = stage(p.afterVideo, `${lab}${ext}`)
    const frames = {}
    for (const k of afterKf) {
      const f = stage(afterStills[k.name], `${lab}__${slugify(k.name)}.kf.png`)
      if (f) frames[k.name] = `${A}/${f}`
    }
    const changed = r.changed.map((c) => ({
      rel: c.rel,
      meta: c.sizeMismatch ? `dimensions changed ${c.dims || ''}` : `${c.pixels} px differ`,
      before: stage(c.before, `${lab}__${slugify(c.rel)}.before.png`),
      after: frames[c.rel] ? frames[c.rel].slice(A.length + 1) : stage(c.after, `${lab}__${slugify(c.rel)}.after.png`),
      diff: stage(c.diff, `${lab}__${slugify(c.rel)}.diff.png`),
    }))
    const duration = videoDuration(p.afterVideo) || (afterKf.reduce((m, k) => Math.max(m, k.tMs), 0) / 1000 + 1)
    const events = afterKf.map((k) => ({ t: +(k.tMs / 1000).toFixed(3), type: 'screenshot', label: k.name, screen: k.name }))
    return {
      kind: 'video', label: p.label, counts: r.counts, changed,
      flow: { duration: +duration.toFixed(2), events, video: { src: `${A}/${videoFile}`, keyframes: afterKf }, frames },
    }
  })

  // ---- FLOW tracks: group by flow → one multi-track replay <FlowTimeline> (no diff) ----
  const flowGroups = new Map()
  for (const ft of args.flowTracks) {
    if (!flowGroups.has(ft.flow)) flowGroups.set(ft.flow, [])
    flowGroups.get(ft.flow).push(ft)
  }
  const flowSections = [...flowGroups.entries()].map(([flowLabel, tracksIn]) => {
    const flab = slugify(flowLabel)
    const tracks = tracksIn.map((ft) => {
      const tlab = `${flab}__${slugify(ft.platform + '-' + (ft.size || ''))}`
      const { keyframes, raw } = readKeyframes(ft.kf)
      const stillsDir = path.join(workdir, tlab)
      const stills = extractKeyframeStills(ft.video, keyframes, stillsDir)
      const ext = path.extname(ft.video) || '.mp4'
      const videoFile = stage(ft.video, `${tlab}${ext}`)
      const frames = {}
      for (const k of keyframes) {
        const f = stage(stills[k.name], `${tlab}__${slugify(k.name)}.kf.png`)
        if (f) frames[k.name] = `${A}/${f}`
      }
      const sz = raw.size || {}
      const { w, h } = frameSize(sz.w, sz.h)
      const duration = videoDuration(ft.video) || keyframes.reduce((m, k) => Math.max(m, k.tMs), 0) / 1000 + 1
      // Captured input events (taps/typing/navigation) drive the animated cursor + rail.
      const events = Array.isArray(raw.events) ? raw.events : undefined
      return {
        platform: ft.platform, size: ft.size || undefined,
        video: { src: `${A}/${videoFile}`, keyframes },
        frames, width: w, height: h, duration: +duration.toFixed(2),
        ...(events ? { events } : {}),
        ...(sz.w && sz.h ? { srcWidth: sz.w, srcHeight: sz.h } : {}),
      }
    })
    const kfTotal = tracks.reduce((m, t) => Math.max(m, t.video.keyframes.length), 0)
    return { kind: 'flow', label: flowLabel, counts: { changed: 0, added: 0, removed: 0, unchanged: 0 }, tracks, kfTotal }
  })

  const sections = [...staticSections, ...videoSections, ...flowSections]
  const totals = sections.reduce((t, s) => ({
    changed: t.changed + s.counts.changed, unchanged: t.unchanged + s.counts.unchanged,
    added: t.added + (s.counts.added || 0), removed: t.removed + (s.counts.removed || 0),
  }), { changed: 0, unchanged: 0, added: 0, removed: 0 })
  const anyChange = totals.changed + totals.added + totals.removed > 0
  const date = new Date().toISOString().slice(0, 10)

  // ---- compose the .page.tsx ----
  const imgC = 'rounded-md'
  const img = (file) => (file ? `<img src={\`\${A}/${file}\`} className="${imgC}" />` : `<div className="p-4 text-sm text-slate-400">image unavailable</div>`)

  const baStateBlock = (c) => `        <Wide width={1040}>
          <H3>{${j(c.rel)}}</H3>
          <P>{${j(c.meta)}}</P>
          <BeforeAfter
            before={${img(c.before)}}
            after={${img(c.after)}}
            diff={${img(c.diff)}}
          />
        </Wide>`

  const singleBlock = (c, kind) => `        <Wide width={1040}>
          <H3>{${j(c.rel)}} <Pill tone={${kind === 'added' ? "'good'" : "'bad'"}}>{${j(kind)}}</Pill></H3>
          <Mockup bar={${j(kind === 'added' ? 'new state (after only)' : 'removed state (before only)')}}>
            ${img(c.img)}
          </Mockup>
        </Wide>`

  const staticSectionTsx = (s) => {
    const blocks = [
      ...s.changed.map(baStateBlock),
      ...(s.added || []).map((c) => singleBlock(c, 'added')),
      ...(s.removed || []).map((c) => singleBlock(c, 'removed')),
    ]
    const inner = blocks.length ? blocks.join('\n') : `        <P>No visual differences on this platform.</P>`
    return `      <Section title={${j(s.label)}}>\n${inner}\n      </Section>`
  }

  const videoSectionTsx = (s) => {
    const f = s.flow
    const flowBlock = `        <Wide width={760}>
          <FlowTimeline
            duration={${f.duration}}
            events={${j(f.events)}}
            video={${j(f.video)}}
            frames={${j(f.frames)}}
            width={240}
            height={470}
            label="e2e replay — drag the rail · ◆ snaps to a keyframe"
          />
        </Wide>`
    const diffs = s.changed.map(baStateBlock)
    const diffHdr = s.changed.length ? `        <H3>Changed keyframes</H3>` : `        <P>No keyframe differences on this platform.</P>`
    return `      <Section title={${j(s.label)}}>\n${flowBlock}\n${diffHdr}\n${diffs.join('\n')}\n      </Section>`
  }

  const flowSectionTsx = (s) => {
    const trackLabels = s.tracks.map((t) => [t.platform, t.size].filter(Boolean).join(' · ')).join(', ')
    const flowBlock = `        <Wide width={900}>
          <FlowTimeline
            tracks={${j(s.tracks)}}
            label="recorded e2e flow — pick a track, drag the rail, ◆ snaps to a keyframe"
          />
        </Wide>`
    return `      <Section title={${j(s.label)}}>\n        <P>{${j(`Tracks: ${trackLabels}. Select an environment above the player; the video plays between keyframes and snaps to each captured state.`)}}</P>\n${flowBlock}\n      </Section>`
  }

  const sectionBlocks = sections
    .map((s) => (s.kind === 'video' ? videoSectionTsx(s) : s.kind === 'flow' ? flowSectionTsx(s) : staticSectionTsx(s)))
    .join('\n')

  const tableRows = sections.map((s) => {
    const c = s.counts
    const cell = (n, tone) => (n > 0 ? `<Pill tone={${tone}}>{${n}}</Pill>` : `${n}`)
    if (s.kind === 'flow') return `[${j(`${s.label} (flow · ${s.tracks.length} tracks)`)}, '—', '—', '—', ${j(`${s.kfTotal} keyframes`)}]`
    return `[${j(s.kind === 'video' ? `${s.label} (video)` : s.label)}, ${cell(c.changed, "'warn'")}, ${cell(c.added || 0, "'good'")}, ${cell(c.removed || 0, "'bad'")}, ${c.unchanged}]`
  }).join(',\n          ')

  const verdict = anyChange
    ? `<strong>{${j(`${totals.changed} changed`)}}</strong>, ${totals.added} added, ${totals.removed} removed across ${sections.length} section${sections.length > 1 ? 's' : ''}. Confirm each before/after matches intent — toggle the diff on any pair — and that nothing unintended changed.`
    : `No visual differences detected across ${sections.length} section${sections.length > 1 ? 's' : ''}. If you expected a change, verify it actually renders in the captured AFTER frame — a reused/stale dev server or an edit to an unrendered component are the classic false negatives.`

  const hasFlowViewer = videoSections.length > 0 || flowSections.length > 0
  const imports = ['Page', 'Section', 'H3', 'P', 'Callout', 'Stats', 'Stat', 'BeforeAfter', 'Mockup', 'DecisionTable', 'Pill', 'Wide']
  if (hasFlowViewer) imports.push('FlowTimeline')

  const tsx = `/* AUTO-GENERATED by the verify-visual skill — before/after visual verification.
   Scratch artifact: do NOT commit (notes/ is gitignored). Regenerate by re-running the skill. */
import { ${imports.join(', ')} } from '@page'

const A = '/api/asset/${args.slug}'

export const meta = {
  title: ${j(args.title + ' — visual verification')},
  owner: 'Kacper',
  created: ${j(date)},
  status: ${j(anyChange ? 'changes captured' : 'no change')},
  icon: '🔍',
}

export default function VisualVerification() {
  return (
    <Page
      title={${j(args.title)}}
      subtitle={${j('Before / after visual verification' + (args.summary ? ' — ' + args.summary : ''))}}
      meta={{
        Generated: ${j(date)},
        Sections: ${j(sections.map((s) => s.label).join(', '))},
        Sensitivity: ${j(`fuzz ${args.fuzz}, threshold ${args.threshold}px`)},
      }}
    >
      <Callout tone={${anyChange ? "'info'" : "'good'"}}>
        <P>${verdict}</P>
      </Callout>

      <Section title="Summary">
        <Stats>
          <Stat value={${totals.changed}} label="Changed" tone={${totals.changed ? "'warn'" : "'ink'"}} />
          <Stat value={${totals.added}} label="Added" tone={${totals.added ? "'good'" : "'ink'"}} />
          <Stat value={${totals.removed}} label="Removed" tone={${totals.removed ? "'bad'" : "'ink'"}} />
          <Stat value={${totals.unchanged}} label="Unchanged" />
        </Stats>
        <DecisionTable
          head={['Section', 'Changed', 'Added', 'Removed', 'Unchanged']}
          rows={[
          ${tableRows}
          ]}
        />
      </Section>

${sectionBlocks}
    </Page>
  )
}
`

  const planFile = path.join(plansDir, `${args.slug}.page.tsx`)
  writeFileSync(planFile, tsx)

  // (re)start the daemon so the new slug is routable (router globs at startup)
  const repoRoot = path.dirname(plansDir)
  const serverCli = path.join(plansDir, '.page-assets', 'page-server.mjs')
  if (!existsSync(serverCli)) {
    const bootstrap = path.join(os.homedir(), '.claude', 'skills', 'plan', 'bootstrap.mjs')
    if (existsSync(bootstrap)) spawnSync('node', [bootstrap, repoRoot], { encoding: 'utf8', stdio: 'inherit' })
  }
  let url = `http://localhost:4317/p/${args.slug}`
  if (existsSync(serverCli)) {
    spawnSync('node', [serverCli, 'down'], { encoding: 'utf8' })
    const r = spawnSync('node', [serverCli, 'ensure'], { encoding: 'utf8' })
    try {
      const status = JSON.parse((r.stdout || '').trim().split('\n').pop())
      if (status?.port) url = `http://localhost:${status.port}/p/${args.slug}`
    } catch { /* keep default */ }
  }

  console.log(`plan: ${planFile}`)
  console.log(`assets: ${assetsDir}`)
  console.log(`totals: changed=${totals.changed} added=${totals.added} removed=${totals.removed} unchanged=${totals.unchanged}`)
  console.log(`url: ${url}`)
}

main()
