// Generates the social-unfurl apparatus for every visualization:
//   public/og/<id>.jpg           — 1200x630 OG card
//   public/l/<id>/index.html     — static share page (crawlable OG tags + redirect)
//   public/s/<id>/index.html     — same for the three field studies
//   public/og/default.jpg        — site-wide card
// Share pages exist because crawlers don't run JS: they read the tags,
// humans get redirected into the app with the right ?layer= applied.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeCard } from './lib/card.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ORIGIN = process.env.SITE_ORIGIN || 'https://brockyenglin.github.io/waypoints'
const layers = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'layers.json'), 'utf8'))

const STORIES = [
  { id: 'muledeer', title: '150 miles, twice a year', caption: 'The Red Desert-to-Hoback mule deer migration · Wyoming Migration Initiative / USGS' },
  { id: 'woodcock', title: 'Gone by morning', caption: 'Three woodcock fall migrations, GPS-tracked · EWMRC / USGS' },
  { id: 'pigeon', title: 'From billions to zero', caption: 'The passenger pigeon, 1810–1914 · historical records' },
]

const ogDir = path.join(root, 'public', 'og')
fs.mkdirSync(ogDir, { recursive: true })

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function sharePage({ id, kind, title, description }) {
  const target = kind === 'story' ? `../../?study=${id}` : `../../?layer=${id}`
  const canonical = kind === 'story' ? `${ORIGIN}/?study=${id}` : `${ORIGIN}/?layer=${id}`
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)} — Waypoints</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Waypoints">
<meta property="og:title" content="${esc(title)} — Waypoints">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${ORIGIN}/og/${id}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} — Waypoints">
<meta name="twitter:image" content="${ORIGIN}/og/${id}.jpg">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace('${target}')</script>
</head><body style="background:#0b0f0c;color:#94a496;font-family:monospace;padding:2rem">
<a href="${target}" style="color:#5cbb6c">Opening ${esc(title)} on the Waypoints globe…</a>
</body></html>`
}

let n = 0
// Default card (no layer drape — the bare living earth)
await composeCard({ entry: null, out: path.join(ogDir, 'default.jpg'), width: 1200, height: 630, layout: 'og' })

for (const l of layers) {
  await composeCard({ entry: l, out: path.join(ogDir, `${l.id}.jpg`), width: 1200, height: 630, layout: 'og' })
  const dir = path.join(root, 'public', 'l', l.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), sharePage({ id: l.id, kind: 'layer', title: l.title, description: l.caption }))
  if (++n % 100 === 0) console.log(`${n}/${layers.length}`)
}

for (const s of STORIES) {
  await composeCard({ entry: { title: s.title, caption: s.caption, freshness: 'WAYPOINTS FIELD STUDY' }, out: path.join(ogDir, `${s.id}.jpg`), width: 1200, height: 630, layout: 'og' })
  const dir = path.join(root, 'public', 's', s.id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), sharePage({ id: s.id, kind: 'story', title: s.title, description: s.caption }))
}

console.log(`OG apparatus: ${layers.length} layer cards + ${STORIES.length} study cards + default, origin ${ORIGIN}`)
