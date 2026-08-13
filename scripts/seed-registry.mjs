// Generates upsert SQL for the Supabase layers registry from the current
// src/data/layers.json snapshot. Emits chunked files so any SQL runner
// (dashboard, MCP, psql) can apply them: scratch/seed-<n>.sql
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const layers = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'layers.json'), 'utf8'))
const outDir = process.argv[2] || path.join(root, 'scratch')
fs.mkdirSync(outDir, { recursive: true })

const esc = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const FEATURED = new Set(['bear', 'vegetation'])

const CHUNK = 100
let files = 0
for (let i = 0; i < layers.length; i += CHUNK) {
  const rows = layers.slice(i, i + CHUNK).map((x, j) =>
    `(${esc(x.id)}, ${esc(x.title)}, ${esc(x.category)}, ${esc(x.kind)}, ${esc(x.texture)}, ${x.opacity ?? 1}, ${esc(x.caption)}, ${esc(x.freshness)}, ${esc(x.source)}, ${FEATURED.has(x.id)}, ${(i + j + 1) * 10})`,
  ).join(',\n')
  const sql = `insert into public.layers (id, title, category, kind, texture, opacity, caption, freshness, source, featured, sort_order) values\n${rows}\non conflict (id) do update set title = excluded.title, category = excluded.category, kind = excluded.kind, texture = excluded.texture, opacity = excluded.opacity, caption = excluded.caption, freshness = excluded.freshness, source = excluded.source, sort_order = excluded.sort_order, updated_at = now();`
  fs.writeFileSync(path.join(outDir, `seed-${++files}.sql`), sql)
}
console.log(`${layers.length} rows -> ${files} seed file(s) in ${outDir}`)
