// Builds public/textures/layer-roadless.png — inventoried roadless areas.
// Orange: 2001 Roadless Rule areas (rescission proposed Aug 18, 2026 —
// ~45M acres would lose protection). Green: Idaho (2008) and Colorado (2012)
// state-rule areas, which the rescission does not touch.
// Source: USFS Enterprise Data Warehouse map services, solid-fill override.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'public', 'textures', 'layer-roadless.png')

const W = 4096, H = 2048
const DPP = 360 / W // global equirect degrees per pixel
// Region covering AK + CONUS + PR, snapped to the global pixel grid.
const px0 = Math.floor((-171 + 180) / DPP)          // west of the Aleutian IRAs
const px1 = Math.ceil((-63.5 + 180) / DPP)
const py0 = Math.floor((90 - 63) / DPP)
const py1 = Math.ceil((90 - 17.4) / DPP)
const bbox = [px0 * DPP - 180, 90 - py1 * DPP, px1 * DPP - 180, 90 - py0 * DPP] // W,S,E,N
const rw = px1 - px0, rh = py1 - py0
const SS = 4 // supersample: fetch at 4x, downscale for antialiased edges

const SOLID = JSON.stringify([{
  id: 0,
  source: { type: 'mapLayer', mapLayerId: 0 },
  drawingInfo: { renderer: { type: 'simple', symbol: {
    type: 'esriSFS', style: 'esriSFSSolid', color: [255, 255, 255, 255],
    outline: { type: 'esriSLS', style: 'esriSLSNull', color: [0, 0, 0, 0], width: 0 },
  } } },
}])

async function fetchMask(service) {
  const params = new URLSearchParams({
    f: 'image', format: 'png32', transparent: 'true',
    bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326',
    size: `${rw * SS},${rh * SS}`,
    dynamicLayers: SOLID,
  })
  const url = `https://apps.fs.usda.gov/arcx/rest/services/EDW/${service}/MapServer/export?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${service}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 2000) throw new Error(`suspiciously small export from ${service} (${buf.length}b)`)
  return buf
}

// Tint a white-on-transparent mask to a solid brand color, keeping alpha.
async function tint(maskBuf, hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const { data, info } = await sharp(maskBuf).resize(rw, rh, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b
    // resize antialiasing leaves soft alpha at edges — keep it, floor the noise
    if (data[i + 3] < 8) data[i + 3] = 0
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

console.log(`region ${rw}x${rh}px @${SS}x supersample, bbox ${bbox.map((v) => v.toFixed(2)).join(', ')}`)

const [rule2001, idaho, colorado] = await Promise.all([
  fetchMask('EDW_InventoriedRoadlessAreas2001_01'),
  fetchMask('EDW_InventoriedRoadlessAreas2008Id_01'),
  fetchMask('EDW_ColoradoRoadlessAreas2012_01'),
])
console.log('exports fetched:', rule2001.length, idaho.length, colorado.length, 'bytes')

const orange = await tint(rule2001, '#E8622C')  // would lose protection
const greenId = await tint(idaho, '#5CBB6C')    // state rules stand
const greenCo = await tint(colorado, '#5CBB6C')

await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: orange, left: px0, top: py0 },
    { input: greenId, left: px0, top: py0 },
    { input: greenCo, left: px0, top: py0 },
  ])
  .png()
  .toFile(OUT)

const meta = await sharp(OUT).metadata()
console.log(`✓ ${OUT} ${meta.width}x${meta.height}`)
