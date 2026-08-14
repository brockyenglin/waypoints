// Prototype: grizzly density under different GBIF filters + render styles.
import sharp from 'sharp'

const KEY = 2433433 // Ursus arctos
const OUT = '/private/tmp/claude-501/-Users-brockyenglin-Waypoints/2a446bef-f86e-4d37-ab7c-45b750abee3a/scratchpad'
const BASIS = ['HUMAN_OBSERVATION', 'OBSERVATION', 'MACHINE_OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE', 'OCCURRENCE']
  .map((b) => `basisOfRecord=${b}`).join('&')

async function composite({ style, filters, out, blur }) {
  const Z = 1, COLS = 4, ROWS = 2, T = 1024
  const tiles = await Promise.all(
    Array.from({ length: COLS * ROWS }, (_, i) => {
      const x = i % COLS, y = Math.floor(i / COLS)
      const url = `https://api.gbif.org/v2/map/occurrence/density/${Z}/${x}/${y}@2x.png?srs=EPSG%3A4326&taxonKey=${KEY}&style=${style}${filters ? '&' + filters : ''}`
      return fetch(url, { headers: { 'User-Agent': 'waypoints-proto' } }).then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 140)}`)
        return { x, y, buf: Buffer.from(await r.arrayBuffer()) }
      }).catch((e) => { console.error('tile fail:', e.message); return null })
    }),
  )
  const comps = tiles.filter((t) => t && t.buf.length > 0).map(({ x, y, buf }) => ({ input: buf, left: x * T, top: y * T }))
  let img = sharp({ create: { width: COLS * T, height: ROWS * T, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png()
  if (blur) {
    const { gain = 3 } = blur
    const raw = await sharp(await img.toBuffer()).blur(blur.sigma).raw().toBuffer({ resolveWithObject: true })
    const { data, info } = raw
    for (let i = 3; i < data.length; i += 4) data[i] = Math.min(255, data[i] * gain)
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png()
  }
  await img.toFile(`${OUT}/${out}.png`)
  // North America crop for close inspection (lon -130..-60, lat 20..55 -> px)
  const full = 4096, half = 2048
  const px = (lng) => Math.round((lng + 180) / 360 * full)
  const py = (lat) => Math.round((90 - lat) / 180 * half)
  await sharp(`${OUT}/${out}.png`).extract({ left: px(-130), top: py(60), width: px(-60) - px(-130), height: py(20) - py(60) })
    .resize(1000).png().toFile(`${OUT}/${out}-na.png`)
  console.log('done', out)
}

await composite({ style: 'classic.point', filters: `year=2000,2026&${BASIS}`, out: 'F-blur16-g3', blur: { sigma: 1.6, gain: 3 } })
await composite({ style: 'classic.point', filters: `year=2000,2026&${BASIS}`, out: 'G-blur24-g4', blur: { sigma: 2.4, gain: 4 } })
