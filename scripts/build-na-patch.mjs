// Builds the North America high-detail drape from NASA BMNG 500m quadrant
// tiles (A1: 180W-90W / 0-90N, B1: 90W-0 / 0-90N, each 21600x21600).
// Output covers lat 10-75N, lng 170W-50W at 8192px wide (~3x the global 8K
// detail over North America). Run after downloading the tiles to /tmp:
//   world.topo.bathy.200407.3x21600x21600.{A1,B1}.jpg
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const out = path.join(root, 'public', 'textures', 'earth-na-8k.jpg')

const TILE = 21600
const pxPerDeg = TILE / 90

// Patch bounds
const LNG_W = -170, LNG_E = -50, LAT_N = 75, LAT_S = 10

// A1 covers lng -180..-90: crop from LNG_W to its east edge
const a1Left = Math.round((LNG_W - -180) * pxPerDeg)          // 10° in
const a1Width = TILE - a1Left                                  // to -90
// B1 covers lng -90..0: crop from its west edge to LNG_E
const b1Width = Math.round((LNG_E - -90) * pxPerDeg)           // 40°
// Vertical (both tiles cover 90N..0, y=0 at 90N)
const top = Math.round((90 - LAT_N) * pxPerDeg)
const height = Math.round((LAT_N - LAT_S) * pxPerDeg)

// Resize each crop to target scale BEFORE compositing so no intermediate
// exceeds sharp's pixel limits.
const fullW = a1Width + b1Width
const OUT_W = 8192
const outH = Math.round(OUT_W * height / fullW)
const a1OutW = Math.round(OUT_W * a1Width / fullW)
const b1OutW = OUT_W - a1OutW

const a1 = await sharp('/tmp/bmng-A1.jpg', { limitInputPixels: false })
  .extract({ left: a1Left, top, width: a1Width, height })
  .resize(a1OutW, outH, { fit: 'fill' })
  .png()
  .toBuffer()
const b1 = await sharp('/tmp/bmng-B1.jpg', { limitInputPixels: false })
  .extract({ left: 0, top, width: b1Width, height })
  .resize(b1OutW, outH, { fit: 'fill' })
  .png()
  .toBuffer()

await sharp({ create: { width: OUT_W, height: outH, channels: 3, background: '#000' } })
  .composite([
    { input: a1, left: 0, top: 0 },
    { input: b1, left: a1OutW, top: 0 },
  ])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(out)

console.log(`earth-na-8k.jpg written (${OUT_W}x${outH}, lat ${LAT_S}-${LAT_N}N lng ${LNG_W}..${LNG_E})`)
