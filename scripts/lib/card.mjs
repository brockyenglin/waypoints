// Shared share-card composer: dark Waypoints frame, world map with the
// layer's density drape composited over it, title + citation + legend.
// Pure sharp — no browser, runs anywhere.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import sharp from 'sharp'

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const TEX = path.join(root, 'public', 'textures')

const INK = '#e9efe6'
const MID = '#94a496'
const GREEN = '#5cbb6c'
const ORANGE = '#e8622c'
const BG = '#0b0f0c'
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"
const MONO = "Menlo, Consolas, monospace"

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function wrapN(text, max, maxLines) {
  const words = String(text).split(' ')
  const lines = ['']
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > max) lines.push(w)
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim()
  }
  return lines.slice(0, maxLines)
}
const wrap = (text, max) => wrapN(text, max, 2)

// World strip: earth equirect + layer drape (screen blend), darkened for text.
// entry.cardRegion = { lngW, lngE, latN, latS } crops to a region instead —
// a US-only dataset is invisible on a whole-world card.
async function worldStrip(entry, w, h) {
  const region = entry && entry.cardRegion
  const crop = (imgW) => {
    if (!region) {
      const fullH = Math.round(imgW / 2)
      return { scaleW: imgW, left: 0, top: Math.max(0, Math.round((fullH - h) / 2)), width: imgW, height: Math.min(h, fullH) }
    }
    const scaleW = Math.round(imgW * 360 / (region.lngE - region.lngW))
    const px = (lng) => Math.round((lng + 180) / 360 * scaleW)
    const py = (lat) => Math.round((90 - lat) / 180 * (scaleW / 2))
    return { scaleW, left: px(region.lngW), top: py(region.latN), width: px(region.lngE) - px(region.lngW), height: py(region.latS) - py(region.latN) }
  }
  const c = crop(w)
  // sharp allows one resize per pipeline — scale+extract first, then fit.
  const scaled = async (src) => {
    const cut = await sharp(src)
      .resize(c.scaleW, Math.round(c.scaleW / 2), { fit: 'fill' })
      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
      .toBuffer()
    return sharp(cut).resize(w, h, { fit: 'fill' }).toBuffer()
  }
  const earth = await sharp(await scaled(path.join(TEX, 'earth-day.jpg')))
    .modulate({ brightness: 0.72, saturation: 0.9 })
    .toBuffer()
  const composites = []
  if (entry && entry.texture) {
    const layerPath = path.join(root, 'public', entry.texture)
    if (fs.existsSync(layerPath)) {
      composites.push({ input: await scaled(layerPath), blend: 'screen' })
    }
  }
  return sharp(earth).composite(composites).toBuffer()
}

const RAMP = `<linearGradient id="ramp" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#fdf7a1"/><stop offset="0.4" stop-color="#fdc84a"/>
  <stop offset="0.7" stop-color="#f4772c"/><stop offset="1" stop-color="#c22a12"/>
</linearGradient>`

function legendRow(y, isGBIF, width) {
  if (isGBIF) {
    return `<text x="56" y="${y}" font-family="${MONO}" font-size="16" letter-spacing="2" fill="${MID}">FEWER RECORDS</text>
    <rect x="216" y="${y - 12}" width="150" height="10" rx="2" fill="url(#ramp)"/>
    <text x="382" y="${y}" font-family="${MONO}" font-size="16" letter-spacing="2" fill="${MID}">MORE · RELATIVE DENSITY</text>`
  }
  return `<text x="56" y="${y}" font-family="${MONO}" font-size="16" letter-spacing="2" fill="${MID}">THE NATURAL WORLD, MADE VISIBLE</text>`
}

// The real lockup (white version) composites over the finished card.
const LOGO = path.join(root, 'public', 'brand', 'wordmark-white-96.png')
async function logoLayer(height, left, top) {
  return { input: await sharp(LOGO).resize({ height }).png().toBuffer(), left, top }
}

export async function composeCard({ entry, out, width, height, layout }) {
  const title = entry?.title || 'The natural world, made visible'
  const source = entry?.freshness || 'GBIF + NASA · PUBLIC DATA'
  const isGBIF = entry?.source === 'GBIF'
  const sci = isGBIF && entry?.caption ? entry.caption.split(' · ').pop() : ''

  let svg, stripBuf, stripTop
  if (layout === 'ig') {
    // Title block top, full-world map centered in the middle, legend bottom.
    const titleLines = wrap(title, 24)
    const titleSize = 76
    const stripH = Math.round(width / 2) // 540
    // Non-GBIF layers put their caption on the card — for a policy or
    // satellite layer the caption is the story.
    const capLines = !isGBIF && entry?.caption ? wrapN(entry.caption, 62, 4) : []
    const srcY = 208 + (titleLines.length - 1) * (titleSize + 10) + 52
    const textEnd = srcY + (sci ? 40 : 0) + capLines.length * 32 + 50
    stripTop = Math.max(textEnd, Math.round((height - stripH) / 2) + 40)
    stripBuf = await worldStrip(entry, width, stripH)
    svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${RAMP}</defs>
  <g font-family="${FONT}">
    ${titleLines.map((l, i) => `<text x="56" y="${208 + i * (titleSize + 10)}" font-size="${titleSize}" font-weight="700" fill="${INK}">${esc(l)}</text>`).join('')}
    <text x="56" y="${srcY}" font-family="${MONO}" font-size="24" letter-spacing="2" fill="${GREEN}">${esc(source)}</text>
    ${sci ? `<text x="56" y="${srcY + 40}" font-family="${MONO}" font-size="22" fill="${MID}">${esc(sci)}</text>` : ''}
    ${capLines.map((l, i) => `<text x="56" y="${srcY + (sci ? 40 : 0) + 42 + i * 32}" font-size="22" fill="${MID}">${esc(l)}</text>`).join('')}
    <rect x="56" y="${height - 104}" width="${width - 112}" height="1" fill="#243026"/>
    ${legendRow(height - 56, isGBIF, width)}
  </g>
</svg>`
  } else {
    // OG: full-bleed map, gradient scrim, text block lower-left.
    const titleLines = wrap(title, 28)
    const titleSize = 58
    stripTop = 0
    stripBuf = await worldStrip(entry, width, height)
    const baseY = height - 186 - (titleLines.length - 1) * (titleSize + 6)
    svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${RAMP}
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${BG}" stop-opacity="0"/>
    <stop offset="0.55" stop-color="${BG}" stop-opacity="0.86"/>
    <stop offset="1" stop-color="${BG}" stop-opacity="0.96"/>
  </linearGradient></defs>
  <rect x="0" y="${height - 290}" width="${width}" height="290" fill="url(#fade)"/>
  <g font-family="${FONT}">
    ${titleLines.map((l, i) => `<text x="56" y="${baseY + i * (titleSize + 8)}" font-size="${titleSize}" font-weight="700" fill="${INK}">${esc(l)}</text>`).join('')}
    <text x="56" y="${baseY + (titleLines.length - 1) * (titleSize + 8) + 44}" font-family="${MONO}" font-size="20" letter-spacing="2" fill="${GREEN}">${esc(source)}</text>
    ${sci ? `<text x="56" y="${baseY + (titleLines.length - 1) * (titleSize + 8) + 78}" font-family="${MONO}" font-size="18" fill="${MID}">${esc(sci)}</text>` : ''}
    ${legendRow(height - 44, isGBIF, width)}
  </g>
</svg>`
  }

  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([
      { input: stripBuf, left: 0, top: stripTop },
      { input: Buffer.from(svg), left: 0, top: 0 },
      await logoLayer(layout === 'ig' ? 32 : 26, 56, layout === 'ig' ? 62 : 40),
    ])
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(out)
}
