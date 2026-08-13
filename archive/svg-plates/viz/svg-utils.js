// Shared SVG helpers for the story plates.
const NS = 'http://www.w3.org/2000/svg'
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (parent) parent.appendChild(node)
  return node
}

// Catmull-Rom through the points -> cubic bezier path d-string.
export function smoothPath(pts, tension = 1) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0]} ${p2[1]}`
  }
  return d
}

// Draw a path once via stroke-dashoffset when it scrolls into view, then hold.
// Preserves a route-of-march dash by animating a wrapper dash pattern first,
// or a solid draw when dashed=false.
export function drawOnReveal(path, { duration = 1400, delay = 0, dashed = null } = {}) {
  const len = path.getTotalLength()
  if (REDUCED) {
    if (dashed) path.setAttribute('stroke-dasharray', dashed)
    return
  }
  path.setAttribute('stroke-dasharray', `${len}`)
  path.setAttribute('stroke-dashoffset', `${len}`)
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return
    io.disconnect()
    setTimeout(() => {
      path.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
      path.setAttribute('stroke-dashoffset', '0')
      if (dashed) {
        setTimeout(() => {
          path.style.transition = 'none'
          path.setAttribute('stroke-dasharray', dashed)
          path.removeAttribute('stroke-dashoffset')
        }, duration + 60)
      }
    }, delay)
  }, { threshold: 0.35 })
  io.observe(path.closest('svg'))
  return io
}

// Working graphic scale bar drawn in viewBox units — real by construction.
export function scaleBarGroup(svg, { px, miles }, viewH) {
  const g = el('g', { class: 'svg-scalebar', transform: `translate(16, ${viewH - 18})` }, svg)
  el('line', { x1: 0, y1: 0, x2: px, y2: 0, stroke: 'currentColor', 'stroke-width': 1 }, g)
  for (const x of [0, px / 2, px]) {
    el('line', { x1: x, y1: -4, x2: x, y2: 0, stroke: 'currentColor', 'stroke-width': 1 }, g)
  }
  el('rect', { x: 0, y: -3, width: px / 2, height: 3, fill: 'currentColor', opacity: 0.55 }, g)
  const label = el('text', { x: px + 8, y: 1, class: 'map-label' }, g)
  label.textContent = `${miles} MI`
  return g
}

// Waypoint diamond marker (rotated square) at map coords.
export function diamond(parent, x, y, size, cls) {
  return el('rect', {
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    transform: `rotate(45 ${x} ${y})`,
    class: cls,
  }, parent)
}

// Positioned tooltip inside a plate figure.
export function plateTooltip(tipEl, figureEl) {
  let raf = 0
  return {
    show(clientX, clientY, label, body) {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = figureEl.getBoundingClientRect()
        tipEl.innerHTML = `<div class="tip-label">${label}</div><div class="tip-body">${body}</div>`
        const x = Math.min(Math.max(clientX - rect.left + 14, 8), rect.width - 260)
        const y = clientY - rect.top + 16
        tipEl.style.left = `${x}px`
        tipEl.style.top = `${y}px`
        tipEl.classList.add('on')
      })
    },
    hide() {
      cancelAnimationFrame(raf)
      tipEl.classList.remove('on')
    },
  }
}

export { REDUCED }
