// Appends curated species (JSON: [{id, name, title, category}]) to the
// SPECIES list in fetch-layers.mjs and registers any new categories in
// CAT_ORDER (inserted before the earth-science categories).
// Usage: node scripts/append-species.mjs <curated.json>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const file = path.join(root, 'scripts', 'fetch-layers.mjs')
const curated = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
let s = fs.readFileSync(file, 'utf8')

// Guard against ids/names already present in the script.
const existingIds = new Set([...s.matchAll(/\{ id: ['"]([^'"]+)['"]/g)].map((m) => m[1]))
const existingNames = new Set([...s.matchAll(/name: ['"]([^'"]+)['"]/g)].map((m) => m[1].toLowerCase()))
const fresh = curated.filter((c) => !existingIds.has(c.id) && !existingNames.has(c.name.toLowerCase()))

const esc = (v) => v.replace(/"/g, '\\"')
const lines = fresh.map((c) =>
  `  { id: "${esc(c.id)}", name: "${esc(c.name)}", title: "${esc(c.title)}", category: "${esc(c.category)}" },`,
).join('\n')

// Append inside the SPECIES array (before its closing bracket).
const marker = '\n]\n\nconst NEO = ['
if (!s.includes(marker)) throw new Error('SPECIES array end marker not found')
s = s.replace(marker, `\n  // ---- Wave 2 (curated) ----\n${lines}\n]\n\nconst NEO = [`)

// Extend CAT_ORDER with any new categories, before 'Historical'.
const orderMatch = s.match(/const CAT_ORDER = \[([^\]]+)\]/)
if (!orderMatch) throw new Error('CAT_ORDER not found')
const order = orderMatch[1].match(/'[^']+'/g).map((x) => x.slice(1, -1))
const newCats = [...new Set(fresh.map((c) => c.category))].filter((c) => !order.includes(c))
if (newCats.length) {
  const idx = order.indexOf('Historical')
  order.splice(idx === -1 ? order.length : idx, 0, ...newCats)
  s = s.replace(orderMatch[0], `const CAT_ORDER = [${order.map((c) => `'${c}'`).join(', ')}]`)
}

fs.writeFileSync(file, s)
console.log(`appended ${fresh.length} species (${curated.length - fresh.length} already present), new categories: ${newCats.join(', ') || 'none'}`)
