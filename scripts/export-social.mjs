// Instagram-ready export: 1080x1350 branded card for any layer.
// Usage:
//   node scripts/export-social.mjs bear            one layer -> exports/ig-bear.jpg
//   node scripts/export-social.mjs bear grizzly    several at once
//   node scripts/export-social.mjs --all           the whole catalog (be patient)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeCard } from './lib/card.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const layersRaw = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'layers.json'), 'utf8'))
// Cards mirror the site's default view: since-2000 texture where one exists.
const modern = new Set(JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'modern.json'), 'utf8')))
const layers = layersRaw.map((l) => modern.has(l.id)
  ? { ...l, texture: l.texture.replace(/\.png$/, '-modern.png'), caption: (l.caption || '').replace('all-time occurrence records', 'occurrence records 2000–2026') }
  : l)
const outDir = path.join(root, 'exports')
fs.mkdirSync(outDir, { recursive: true })

const args = process.argv.slice(2)
const targets = args.includes('--all') ? layers : args.map((id) => layers.find((l) => l.id === id)).filter(Boolean)
if (!targets.length) {
  console.error('usage: node scripts/export-social.mjs <layer-id> [more-ids] | --all')
  process.exit(1)
}

for (const l of targets) {
  const out = path.join(outDir, `ig-${l.id}.jpg`)
  await composeCard({ entry: l, out, width: 1080, height: 1350, layout: 'ig' })
  console.log('✓', out)
}
