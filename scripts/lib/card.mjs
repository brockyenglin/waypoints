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

function wrap(text, max) {
  const words = String(text).split(' ')
  const lines = ['']
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > max) lines.push(w)
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim()
  }
  return lines.slice(0, 2)
}

// World strip: earth equirect + layer drape (screen blend), darkened for text.
async function worldStrip(entry, w, h) {
  const fullH = Math.round(w / 2)
  const top = Math.max(0, Math.round((fullH - h) / 2))
  const cropH = Math.min(h, fullH)
  const earth = await sharp(path.join(TEX, 'earth-day.jpg'))
    .resize(w, fullH, { fit: 'fill' })
    .extract({ left: 0, top, width: w, height: cropH })
    .modulate({ brightness: 0.72, saturation: 0.9 })
    .toBuffer()
  const composites = []
  if (entry && entry.texture) {
    const layerPath = path.join(root, 'public', entry.texture)
    if (fs.existsSync(layerPath)) {
      const drape = await sharp(layerPath)
        .resize(w, fullH, { fit: 'fill' })
        .extract({ left: 0, top, width: w, height: cropH })
        .toBuffer()
      composites.push({ input: drape, blend: 'screen' })
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

function wordmark(x, y) {
  return `<text x="${x}" y="${y}" font-size="30" font-weight="700" fill="${INK}">Waypoints</text>
  <rect x="${x + 156}" y="${y - 20}" width="11" height="11" fill="${ORANGE}" transform="rotate(45 ${x + 161.5} ${y - 14.5})"/>`
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
    const textEnd = 208 + titleLines.length * (titleSize + 10) + 90
    stripTop = Math.max(textEnd, Math.round((height - stripH) / 2) + 40)
    stripBuf = await worldStrip(entry, width, stripH)
    svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${RAMP}</defs>
  <g font-family="${FONT}">
    ${wordmark(56, 96)}
    ${titleLines.map((l, i) => `<text x="56" y="${208 + i * (titleSize + 10)}" font-size="${titleSize}" font-weight="700" fill="${INK}">${esc(l)}</text>`).join('')}
    <text x="56" y="${208 + (titleLines.length - 1) * (titleSize + 10) + 52}" font-family="${MONO}" font-size="24" letter-spacing="2" fill="${GREEN}">${esc(source)}</text>
    ${sci ? `<text x="56" y="${208 + (titleLines.length - 1) * (titleSize + 10) + 92}" font-family="${MONO}" font-size="22" fill="${MID}">${esc(sci)}</text>` : ''}
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
    ${wordmark(56, 64)}
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
    ])
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(out)
}
