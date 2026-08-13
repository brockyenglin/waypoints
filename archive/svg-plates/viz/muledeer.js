// Plate 001 — Red Desert to Hoback mule deer corridor.
// The corridor draws south-to-north once on reveal; bottlenecks are
// blaze diamonds with the story in the tooltip.
import { el, smoothPath, drawOnReveal, scaleBarGroup, diamond, plateTooltip } from './svg-utils.js'

export function initMuledeer(mapData) {
  const host = document.getElementById('map-muledeer')
  const tip = plateTooltip(document.getElementById('tip-muledeer'), host.closest('figure'))
  const m = mapData
  const [, , W, H] = m.viewBox.split(' ').map(Number)

  const svg = el('svg', { viewBox: m.viewBox, role: 'img', 'aria-label': 'Map of western Wyoming showing the Red Desert to Hoback mule deer migration corridor, its bottlenecks, and winter and summer ranges.' }, host)

  el('path', { d: m.graticulePath, class: 'grat' }, svg)
  el('path', { d: m.countiesPath, class: 'county-line' }, svg)
  el('path', { d: m.statePath, class: 'coast' }, svg)

  // Range anchors
  for (const [range, name] of [[m.winter, 'WINTER RANGE'], [m.summer, 'SUMMER RANGE']]) {
    const g = el('g', {}, svg)
    el('circle', { cx: range.x, cy: range.y, r: 26, fill: 'none', stroke: 'var(--green)', 'stroke-width': 0.75, 'stroke-dasharray': '2 3', opacity: 0.7 }, g)
    const t = el('text', { x: range.x, y: range.y + 44, class: 'map-label', 'text-anchor': 'middle' }, g)
    t.textContent = name
  }

  // The corridor: a faint route-of-march ghost, then the drawn line over it
  const d = smoothPath(m.corridor)
  el('path', { d, fill: 'none', stroke: 'var(--green)', 'stroke-width': 1, 'stroke-dasharray': '6 4', opacity: 0.4 }, svg)
  const main = el('path', { d, fill: 'none', stroke: 'var(--green-bright)', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, svg)
  drawOnReveal(main, { duration: 2200 })

  // Direction arrows along the corridor (spring: northbound)
  const midIdx = [Math.floor(m.corridor.length * 0.3), Math.floor(m.corridor.length * 0.7)]
  for (const i of midIdx) {
    const [x1, y1] = m.corridor[i]
    const [x2, y2] = m.corridor[i + 1]
    const a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
    el('path', {
      d: `M ${x2} ${y2} l -9 -4 l 2.5 4 l -2.5 4 z`,
      fill: 'var(--green-bright)',
      transform: `rotate(${a} ${x2} ${y2})`,
      opacity: 0.9,
    }, svg)
  }

  // Bottlenecks: blaze diamonds, the pointing finger
  for (const b of m.bottlenecks) {
    const g = el('g', { style: 'cursor: pointer' }, svg)
    el('circle', { cx: b.x, cy: b.y, r: 14, fill: 'transparent' }, g) // hit target
    const dia = diamond(g, b.x, b.y, 9, '')
    dia.setAttribute('fill', 'none')
    dia.setAttribute('stroke', 'var(--orange)')
    dia.setAttribute('stroke-width', '2')
    g.addEventListener('pointerenter', (e) => {
      dia.setAttribute('fill', 'var(--orange)')
      tip.show(e.clientX, e.clientY, b.name, b.note)
    })
    g.addEventListener('pointermove', (e) => tip.show(e.clientX, e.clientY, b.name, b.note))
    g.addEventListener('pointerleave', () => {
      dia.setAttribute('fill', 'none')
      tip.hide()
    })
  }

  // Place labels (real towns for orientation)
  const label = (x, y, text, strong = false, anchor = 'start') => {
    const t = el('text', { x, y, class: `map-label${strong ? ' strong' : ''}`, 'text-anchor': anchor }, svg)
    t.textContent = text
    return t
  }
  const tp = m.bottlenecks.find((b) => b.name === 'Trappers Point')
  if (tp) label(tp.x - 16, tp.y + 5, 'TRAPPERS POINT', true, 'end')
  const fl = m.bottlenecks.find((b) => b.name.includes('Fremont'))
  if (fl) label(fl.x + 14, fl.y + 34, 'FREMONT LAKE — $2.1M / 364 AC', true)

  const g = scaleBarGroup(svg, m.scaleBar, H)
  g.setAttribute('color', 'var(--ink-mid)')
  void W
}
