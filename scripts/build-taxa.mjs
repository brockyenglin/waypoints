// Resolves every SPECIES row to its GBIF taxonKey -> src/data/taxa.json.
// The atlas app needs keys client-side to request live density tiles.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = fs.readFileSync(path.join(root, 'scripts', 'fetch-layers.mjs'), 'utf8')

// Pull { id, name } pairs straight out of the SPECIES list.
const rows = [...src.matchAll(/\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"]/g)]
  .map((m) => ({ id: m[1], name: m[2] }))
console.log(`${rows.length} species rows parsed`)

const taxa = {}
for (let i = 0; i < rows.length; i += 8) {
  await Promise.all(rows.slice(i, i + 8).map(async ({ id, name }) => {
    try {
      const m = await (await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)).json()
      if (m.usageKey && m.rank !== 'GENUS') taxa[id] = m.usageKey
    } catch { /* missing key -> no live tiles for that layer, global texture still works */ }
  }))
  if ((i / 8) % 10 === 0) console.log(`${Math.min(i + 8, rows.length)}/${rows.length}`)
}

fs.writeFileSync(path.join(root, 'src', 'data', 'taxa.json'), JSON.stringify(taxa))
console.log(`taxa.json: ${Object.keys(taxa).length} keys`)
