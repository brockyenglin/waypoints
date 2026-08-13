// Scroll-triggered reveals. Elements opt in with [data-reveal];
// stagger groups with [data-reveal-group] on a parent.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function initReveals() {
  const els = document.querySelectorAll('[data-reveal]')
  if (REDUCED) {
    els.forEach((el) => el.classList.add('is-revealed'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target
        const group = el.closest('[data-reveal-group]')
        if (group) {
          const siblings = [...group.querySelectorAll('[data-reveal]')]
          const idx = siblings.indexOf(el)
          el.style.transitionDelay = `${Math.min(idx * 90, 540)}ms`
        }
        el.classList.add('is-revealed')
        io.unobserve(el)
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
  )
  els.forEach((el) => io.observe(el))
}

// Count-up stat values: <span data-count="150" data-suffix=" mi">
export function initCounters() {
  const els = document.querySelectorAll('[data-count]')
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target
        io.unobserve(el)
        const target = parseFloat(el.dataset.count)
        const suffix = el.dataset.suffix || ''
        const prefix = el.dataset.prefix || ''
        const decimals = (el.dataset.count.split('.')[1] || '').length
        if (REDUCED) {
          el.textContent = prefix + target.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix
          continue
        }
        const dur = 1400
        const start = performance.now()
        const tick = (now) => {
          const p = Math.min((now - start) / dur, 1)
          const eased = 1 - Math.pow(1 - p, 4)
          el.textContent = prefix + (target * eased).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    },
    { threshold: 0.6 },
  )
  els.forEach((el) => io.observe(el))
}
