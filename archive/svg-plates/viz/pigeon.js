// Plate 003 — the passenger pigeon, 1810–1914.
// Recorded events surface as the century runs, then fade to ghosts;
// the century ends with one mark left at the Cincinnati Zoo.
import { el, diamond, scaleBarGroup, plateTooltip, REDUCED } from './svg-utils.js'

const START = 1810
const END = 1914

export function initPigeon(mapData) {
  const host = document.getElementById('map-pigeon')
  const tip = plateTooltip(document.getElementById('tip-pigeon'), host.closest('figure'))
  const scrub = document.getElementById('pigeon-scrub')
  const yearEl = document.getElementById('pigeon-year')
  const captionEl = document.getElementById('pigeon-caption')
  const m = mapData
  const [, , , H] = m.viewBox.split(' ').map(Number)

  const svg = el('svg', { viewBox: m.viewBox, role: 'img', 'aria-label': 'Map of eastern North America. As the timeline runs from 1810 to 1914, recorded passenger pigeon nestings, roosts, flights, and market hunts appear and fade, ending with a single mark at the Cincinnati Zoo where the last bird died in 1914.' }, host)

  el('path', { d: m.canadaPath, class: 'land' }, svg)
  el('path', { d: m.nationPath, class: 'land' }, svg)
  el('path', { d: m.statesPath, class: 'state-line' }, svg)
  el('path', { d: m.canadaPath, class: 'coast', style: 'stroke-width: 0.8' }, svg)
  el('path', { d: m.nationPath, class: 'coast', style: 'stroke-width: 0.8' }, svg)

  const NEUTRAL = 'var(--viz-neutral)'
  const isPetoskey = (ev) => ev.place.startsWith('Petoskey')
  const isMartha = (ev) => ev.year === 1914

  const nodes = m.events.map((ev) => {
    const g = el('g', { style: 'cursor: pointer', opacity: 0 }, svg)
    el('circle', { cx: ev.x, cy: ev.y, r: 12, fill: 'transparent' }, g)
    if (isMartha(ev)) {
      const s = 5.5
      el('path', {
        d: `M ${ev.x - s} ${ev.y - s} L ${ev.x + s} ${ev.y + s} M ${ev.x - s} ${ev.y + s} L ${ev.x + s} ${ev.y - s}`,
        stroke: 'var(--orange-bright)',
        'stroke-width': 2,
        fill: 'none',
      }, g)
    } else if (isPetoskey(ev)) {
      const dia = diamond(g, ev.x, ev.y, 11, '')
      dia.setAttribute('style', 'fill: var(--orange)')
      const t = el('text', { x: ev.x + 12, y: ev.y - 8, class: 'map-label strong' }, g)
      t.textContent = 'PETOSKEY, 1878'
    } else if (ev.type === 'nesting') {
      el('circle', { cx: ev.x, cy: ev.y, r: 4.4, fill: NEUTRAL }, g)
    } else if (ev.type === 'market-hunt') {
      el('rect', { x: ev.x - 3.4, y: ev.y - 3.4, width: 6.8, height: 6.8, fill: NEUTRAL }, g)
    } else if (ev.type === 'last-record') {
      const s = 4
      el('path', {
        d: `M ${ev.x - s} ${ev.y - s} L ${ev.x + s} ${ev.y + s} M ${ev.x - s} ${ev.y + s} L ${ev.x + s} ${ev.y - s}`,
        stroke: NEUTRAL,
        'stroke-width': 1.6,
        fill: 'none',
      }, g)
    } else {
      el('circle', { cx: ev.x, cy: ev.y, r: 3.6, fill: 'none', stroke: NEUTRAL, 'stroke-width': 1.4 }, g)
    }
    const label = `${ev.year} — ${ev.place}`
    g.addEventListener('pointerenter', (e) => tip.show(e.clientX, e.clientY, label, ev.note || ev.type))
    g.addEventListener('pointermove', (e) => tip.show(e.clientX, e.clientY, label, ev.note || ev.type))
    g.addEventListener('pointerleave', () => tip.hide())
    return { ev, g }
  })

  const g = scaleBarGroup(svg, m.scaleBar, H)
  g.setAttribute('color', 'var(--ink-mid)')

  function render(year) {
    yearEl.textContent = String(year)
    let latest = null
    let visible = 0
    for (const { ev, g } of nodes) {
      if (ev.year > year) {
        g.setAttribute('opacity', '0')
        g.style.pointerEvents = 'none'
        continue
      }
      visible++
      const age = year - ev.year
      const ghostFloor = REDUCED ? 0.3 : isPetoskey(ev) ? 0.25 : 0.14
      const fresh = Math.max(0, 1 - age / 16)
      const o = ghostFloor + (1 - ghostFloor) * fresh
      g.setAttribute('opacity', o.toFixed(2))
      g.style.pointerEvents = 'auto'
      if (!latest || ev.year >= latest.year) latest = ev
    }
    if (year >= END) {
      captionEl.textContent = 'SEPTEMBER 1, 1914 — THE POPULATION IS ZERO.'
    } else if (latest) {
      captionEl.textContent = `${latest.year} — ${latest.place.toUpperCase()}`
    } else {
      captionEl.textContent = `${visible} EVENTS ON RECORD`
    }
  }

  let playing = false
  function autoplay() {
    if (playing) return
    playing = true
    const dur = 9500
    let start = null
    const tick = (now) => {
      if (!playing) return
      if (start === null) start = now
      const p = Math.min((now - start) / dur, 1)
      const year = Math.round(START + (END - START) * p)
      scrub.value = String(year)
      render(year)
      if (p < 1) requestAnimationFrame(tick)
      else playing = false
    }
    requestAnimationFrame(tick)
  }

  scrub.addEventListener('input', () => {
    playing = false
    render(Number(scrub.value))
  })

  if (REDUCED) {
    scrub.value = String(END)
    render(END)
  } else {
    render(START)
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      setTimeout(autoplay, 500)
    }, { threshold: 0.45 })
    io.observe(host)
  }
}
