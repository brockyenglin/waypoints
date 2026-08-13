// Compact upsert SQL for NEW GBIF rows only: captions/paths are derived
// in SQL from (id, title, category, sci), keeping payloads small.
// Usage: node scripts/seed-compact.mjs <prev-layers.json> [outDir]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const layers = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'layers.json'), 'utf8'))
const prevIds = new Set(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map((l) => l.id))
const outDir = process.argv[3] || path.join(root, 'scratch')
fs.mkdirSync(outDir, { recursive: true })

const fresh = layers.filter((l) => !prevIds.has(l.id))
const gbif = fresh.filter((l) => l.source === 'GBIF')
const other = fresh.filter((l) => l.source !== 'GBIF')
if (other.length) console.warn('non-GBIF new rows need manual seeding:', other.map((l) => l.id).join(', '))

const stamp = (gbif[0]?.freshness || 'GBIF · AUG 2026').split('·')[1].trim()
const stampTitle = stamp.charAt(0) + stamp.slice(1).toLowerCase().replace(/ (\d)/, ' $1')
const esc = (v) => `'${String(v).replace(/'/g, "''")}'`
const sci = (l) => l.caption.split(' · ').pop()

const CHUNK = 160
let files = 0
const base = Math.max(0, ...layers.map((_, i) => i)) // stable-ish ordering after existing rows
for (let i = 0; i < gbif.length; i += CHUNK) {
  const rows = gbif.slice(i, i + CHUNK).map((l, j) =>
    `(${esc(l.id)}, ${esc(l.title)}, ${esc(l.category)}, ${esc(sci(l))}, ${3000 + (i + j) * 10})`,
  ).join(',\n')
  const sql = `insert into public.layers (id, title, category, kind, texture, opacity, caption, freshness, source, featured, sort_order)
select v.id, v.title, v.category, 'overlay', 'textures/layer-' || v.id || '.png', 1,
  v.title || ' — all-time occurrence records · GBIF · pulled ${stampTitle} · ' || v.sci,
  'GBIF · ${stamp}', 'GBIF', false, v.ord
from (values
${rows}
) as v(id, title, category, sci, ord)
on conflict (id) do update set title = excluded.title, category = excluded.category, caption = excluded.caption, freshness = excluded.freshness, sort_order = excluded.sort_order, updated_at = now();`
  fs.writeFileSync(path.join(outDir, `seed-compact-${++files}.sql`), sql)
}
console.log(`${gbif.length} new GBIF rows -> ${files} compact file(s) in ${outDir}`)
void base
