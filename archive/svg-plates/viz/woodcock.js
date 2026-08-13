// FIG. 02 — three woodcock, three fall migrations, drawn one after another.
// Colors are the validated triple: ember / conifer / open-water blue.
// Identity is never color-alone: direct labels at origins + ledger legend.
import { el, smoothPath, drawOnReveal, scaleBarGroup, diamond, plateTooltip } from './svg-utils.js'

const TRACK_COLORS = ['var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)']

export function initWoodcock(mapData) {
  const host = document.getElementById('map-woodcock')
  const tip = plateTooltip(document.getElementById('tip-woodcock'), host.closest('figure'))
  const m = mapData
  const [, , , H] = m.viewBox.split(' ').map(Number)

  const svg = el('svg', { viewBox: m.viewBox, role: 'img', 'aria-label': 'Map of the eastern United States and maritime Canada showing three woodcock fall migration tracks: Miramichi down the Atlantic coast to Georgia, Namekagon down the Mississippi to Louisiana, and Petoskey from northern Michigan to Louisiana.' }, host)

  el('path', { d: m.canadaPath, class: 'land' }, svg)
  el('path', { d: m.nationPath, class: 'land' }, svg)
  el('path', { d: m.statesPath, class: 'state-line' }, svg)
  el('path', { d: m.canadaPath, class: 'coast', style: 'stroke-width: 0.8' }, svg)
  el('path', { d: m.nationPath, class: 'coast', style: 'stroke-width: 0.8' }, svg)

  const fmt = (iso) => {
    const d = new Date(iso + 'T12:00:00Z')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
  }

  m.tracks.forEach((track, i) => {
    const color = TRACK_COLORS[i]
    const pts = track.pts.map((p) => [p.x, p.y])
    const path = el('path', {
      d: smoothPath(pts, 0.8),
      fill: 'none',
      stroke: color,
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
    }, svg)
    // Night hops draw as route-of-march dashes, staggered bird by bird
    drawOnReveal(path, { duration: 1700, delay: i * 620, dashed: '6 3 1 3' })

    // Stopovers
    track.pts.forEach((p, j) => {
      const isEnd = j === 0 || j === track.pts.length - 1
      const g = el('g', { style: 'cursor: pointer' }, svg)
      el('circle', { cx: p.x, cy: p.y, r: 11, fill: 'transparent' }, g)
      const dot = el('circle', {
        cx: p.x, cy: p.y,
        r: isEnd ? 4 : 2.6,
        fill: isEnd ? color : 'var(--bg-elevated)',
        stroke: color,
        'stroke-width': 1.4,
      }, g)
      const when = fmt(p.date)
      g.addEventListener('pointerenter', (e) => {
        dot.setAttribute('r', 5)
        tip.show(e.clientX, e.clientY, `${track.name} — ${when}`, p.place)
      })
      g.addEventListener('pointermove', (e) => tip.show(e.clientX, e.clientY, `${track.name} — ${when}`, p.place))
      g.addEventListener('pointerleave', () => {
        dot.setAttribute('r', isEnd ? 4 : 2.6)
        tip.hide()
      })
    })

    // Direct label at the capture site
    const p0 = track.pts[0]
    diamond(svg, p0.x, p0.y, 8, '').setAttribute('style', `fill: none; stroke: ${color}; stroke-width: 1.6`)
    const anchors = ['end', 'end', 'start']
    const offsets = [[-10, -10], [-12, -10], [12, -10]]
    const t = el('text', {
      x: p0.x + offsets[i][0],
      y: p0.y + offsets[i][1],
      class: 'map-label strong',
      'text-anchor': anchors[i],
      style: `fill: ${color}`,
    }, svg)
    t.textContent = track.name.toUpperCase()
  })

  const g = scaleBarGroup(svg, m.scaleBar, H)
  g.setAttribute('color', 'var(--ink-mid)')
}
