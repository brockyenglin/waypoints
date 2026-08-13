// Waypoints — boot
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'

import Lenis from 'lenis'
import { createGlobe } from './globe/globe.js'
import { initReveals } from './fx/reveal.js'
import globeData from './data/globe.json'
import muledeerData from './data/muledeer.json'
import woodcockData from './data/woodcock.json'
import pigeonData from './data/pigeon.json'
import layerRegistry from './data/layers.json'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const BASE = import.meta.env.BASE_URL
document.documentElement.classList.add('js')

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/* ============ the visualization registry ============
   Everything the viewer can show is a row here. Adding a visualization
   means adding a row (or a fetch-layers entry) — never new UI code. */
const HINT = ' · drag to rotate · ⌘+scroll / dbl-click to zoom'
const STATIC_ENTRIES = {
  head: [{
    id: 'migrations',
    kind: 'base',
    title: 'Tracked migrations',
    category: 'Movement',
    source: 'EWMRC / WMI-USGS',
    caption: 'Tracked migrations on record — three woodcock GPS tracks + the Red Desert–Hoback mule deer corridor' + HINT,
    featured: true,
  }],
  tail: [
    { id: 'muledeer', kind: 'story', title: 'Mule deer — 150 miles, twice a year', category: 'Field studies', source: 'WMI / USGS', caption: 'RED DESERT → HOBACK CORRIDOR · WYOMING MIGRATION INITIATIVE / USGS' },
    { id: 'woodcock', kind: 'story', title: 'Woodcock — gone by morning', category: 'Field studies', source: 'EWMRC / USGS', caption: 'THREE FALL MIGRATIONS · EWMRC-STYLE GPS TRACKS · HOVER THE STOPOVERS' },
    { id: 'pigeon', kind: 'story', title: 'Passenger pigeon — from billions to zero', category: 'Field studies', source: 'Historical records', caption: 'RECORDED EVENTS, 1810–1914 · DRAG THE TIMELINE' },
  ],
}
function composeRegistry(layers) {
  return [
    ...STATIC_ENTRIES.head,
    ...layers.map((l) => ({ ...l, featured: l.featured ?? ['bear', 'vegetation'].includes(l.id) })),
    ...STATIC_ENTRIES.tail,
  ]
}
// Paint instantly from the bundled snapshot; swap to the live registry
// from the Waypoints backend when it answers.
let REGISTRY = composeRegistry(layerRegistry)
let byId = Object.fromEntries(REGISTRY.map((r) => [r.id, r]))

const SUPA_URL = 'https://qwzbopcielsbacmlvoua.supabase.co'
const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_XwoB9aUmmw7qOU6gtRT6wg_Olkb4VTU'
async function refreshRegistryFromBackend() {
  if (!SUPA_KEY || SUPA_KEY.startsWith('__')) return
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/layers?select=*&order=sort_order,title`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(String(res.status))
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) return
    REGISTRY = composeRegistry(rows)
    byId = Object.fromEntries(REGISTRY.map((r) => [r.id, r]))
    buildChips()
    buildCatalog(catalogSearch.value)
    syncUI()
  } catch { /* offline or backend down — bundled snapshot stands */ }
}

/* ---------- first-party analytics: event name + layer id, nothing else ----------
   No cookies, no identifiers; skipped entirely when Do Not Track is on. */
const DNT = navigator.doNotTrack === '1' || window.doNotTrack === '1'
function track(name, layer) {
  if (DNT || import.meta.env.DEV) return
  try {
    fetch(`${SUPA_URL}/rest/v1/events`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name, layer: layer || null, referrer: document.referrer.slice(0, 200) || null }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* analytics must never break the site */ }
}
track('pageview', new URLSearchParams(location.search).get('layer') || new URLSearchParams(location.search).get('study'))

/* ---------- smooth scroll ---------- */
let lenis = null
if (!REDUCED) lenis = new Lenis({ autoRaf: true, lerp: 0.115 })
function scrollToEl(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.4 })
  else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' })
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]')
  if (!a) return
  const hash = a.getAttribute('href')
  if (hash.length < 2) return
  e.preventDefault()
  scrollToEl(hash)
  history.replaceState(null, '', hash)
})

/* ---------- dom ---------- */
const atlasEl = document.querySelector('.atlas')
const stage = document.getElementById('globe-stage')
const tipEl = document.getElementById('globe-tip')
const captionEl = document.getElementById('layer-caption')
const chipsEl = document.getElementById('layer-chips')
const indexItems = [...document.querySelectorAll('.index-item')]
const hud = document.getElementById('story-hud')
const hudKicker = document.getElementById('hud-kicker')
const hudTitle = document.getElementById('hud-title')
const hudTimeline = document.getElementById('hud-timeline')
const reader = document.getElementById('reader')
const readerBodies = [...reader.querySelectorAll('.reader-body')]
const catalog = document.getElementById('catalog')
const catalogList = document.getElementById('catalog-list')
const catalogSearch = document.getElementById('catalog-search')

/* ---------- globe ---------- */
let activeMarker = null
let tipRaf = 0
let globe = null
let activeId = 'migrations'
let activeStory = null

function trackTip() {
  cancelAnimationFrame(tipRaf)
  if (!activeMarker || !globe) return
  const loop = () => {
    if (!activeMarker) return
    const { x, y } = globe.project(activeMarker)
    const rect = stage.getBoundingClientRect()
    tipEl.style.left = `${Math.min(Math.max(x + 16, 10), rect.width - 300)}px`
    tipEl.style.top = `${Math.min(Math.max(y - 14, 10), rect.height - 120)}px`
    tipRaf = requestAnimationFrame(loop)
  }
  loop()
}

// Only migrations we hold data for — no representative flyway art.
const trackColors = [cssVar('--viz-2'), cssVar('--viz-3'), cssVar('--viz-4')]
const realMigrations = [
  ...woodcockData.tracks.map((t, i) => ({
    path: t.points.map((p) => [p.lat, p.lng]),
    color: trackColors[i],
    label: `${t.name} — woodcock GPS track`,
  })),
  {
    path: muledeerData.corridor,
    color: cssVar('--green-bright'),
    label: 'Red Desert–Hoback mule deer corridor',
  },
]

globe = createGlobe(stage, {
  arcs: realMigrations,
  markers: globeData.points,
  reducedMotion: REDUCED,
  textures: {
    day: `${BASE}textures/earth-day.jpg`,
    dayHi: `${BASE}textures/earth-day-8k.jpg`,
    night: `${BASE}textures/earth-night.jpg`,
    bump: `${BASE}textures/earth-topology.png`,
    water: `${BASE}textures/earth-water.png`,
    clouds: `${BASE}textures/earth-clouds.jpg`,
    regionHi: `${BASE}textures/earth-na-8k.jpg`,
  },
  stories: {
    muledeer: muledeerData,
    woodcock: woodcockData,
    pigeon: pigeonData,
  },
  colors: {
    atmosphere: '#6da8d8',
    marker: cssVar('--green-bright'),
    markerStory: cssVar('--orange'),
    corridor: cssVar('--green-bright'),
    trackA: cssVar('--viz-2'),
    trackB: cssVar('--viz-3'),
    trackC: cssVar('--viz-4'),
    historic: cssVar('--viz-neutral'),
    arcKinds: {
      'big-game': cssVar('--viz-1'),
      upland: cssVar('--viz-2'),
      waterfowl: cssVar('--viz-3'),
      fish: cssVar('--viz-4'),
      historic: cssVar('--viz-neutral'),
    },
  },
  onMarkerClick(m) {
    if (m.storyId) activate(m.storyId)
  },
  onMarkerHover(m) {
    activeMarker = m
    if (m) {
      const lat = `${Math.abs(m.lat).toFixed(2)}° ${m.lat >= 0 ? 'N' : 'S'}`
      const lng = `${Math.abs(m.lng).toFixed(2)}° ${m.lng >= 0 ? 'E' : 'W'}`
      const label = m.kind === 'story' ? 'FIELD STUDY — CLICK TO OPEN' : m.kind === 'poi' ? 'ON RECORD' : 'DATA STATION'
      tipEl.innerHTML = `<div class="tip-label">${label}</div><div class="tip-body">${m.label}${m.note ? `<br><span style="color: var(--ink-mid); font-size: 12px">${m.note}</span>` : ''}</div><div class="tip-coords">${lat}, ${lng}</div>`
      tipEl.classList.add('on')
      trackTip()
    } else {
      tipEl.classList.remove('on')
      cancelAnimationFrame(tipRaf)
    }
  },
})
if (import.meta.env.DEV) window.__globe = globe

/* ---------- activation: one entry point for every visualization ---------- */
const legendEl = document.getElementById('density-legend')
const dividerEl = document.getElementById('compare-divider')
const cmpLabelA = document.getElementById('cmp-label-a')
const cmpLabelB = document.getElementById('cmp-label-b')
let compare = null // { a, b } while compare mode is active
let picking = false

function setCaption(entry) {
  captionEl.textContent = entry.caption || entry.title
}

function setLegend(visible) {
  legendEl.hidden = !visible
}

function syncURL() {
  const url = new URL(location.href)
  url.searchParams.delete('layer')
  url.searchParams.delete('study')
  url.searchParams.delete('compare')
  if (activeStory) url.searchParams.set('study', activeStory)
  else if (compare) url.searchParams.set('compare', `${compare.a.id},${compare.b.id}`)
  else if (activeId !== 'migrations') url.searchParams.set('layer', activeId)
  history.replaceState(null, '', url)
}

function activate(id) {
  const entry = byId[id]
  if (!entry) return
  if (entry.kind === 'story') return openStory(id)
  if (compare) exitCompare(true)
  if (activeStory) closeStory(true)
  activeId = id
  globe.setLayer(entry.kind === 'base' ? null : { texture: `${BASE}${entry.texture}`, opacity: entry.opacity })
  setCaption(entry)
  setLegend(entry.source === 'GBIF')
  track('activate', id)
  syncURL()
  syncUI()
}

/* ---------- compare mode: two layers, one draggable divider ---------- */
function stageWidth() { return stage.getBoundingClientRect().width }

function startCompare(a, b) {
  if (activeStory) closeStory(true)
  compare = { a, b }
  picking = false
  catalog.hidden = true
  const x = stageWidth() / 2
  globe.setCompare(
    { texture: `${BASE}${a.texture}`, opacity: a.opacity },
    { texture: `${BASE}${b.texture}`, opacity: b.opacity },
    x,
  )
  dividerEl.hidden = false
  dividerEl.style.left = '50%'
  cmpLabelA.textContent = `◀ ${a.title}`
  cmpLabelB.textContent = `${b.title} ▶`
  captionEl.textContent = `${a.caption} ⇄ ${b.caption}`.slice(0, 220)
  setLegend(a.source === 'GBIF' || b.source === 'GBIF')
  track('compare', `${a.id},${b.id}`)
  syncURL()
  syncUI()
}

function exitCompare(silent = false) {
  if (!compare) return
  const keep = compare.a.id
  compare = null
  dividerEl.hidden = true
  if (!silent) activate(keep)
}

function beginPicking() {
  const current = byId[activeId]
  if (!current || current.kind !== 'overlay') {
    captionEl.textContent = 'PICK A DATA LAYER FIRST, THEN HIT COMPARE'
    toggleCatalog(true)
    return
  }
  picking = true
  toggleCatalog(true)
  captionEl.textContent = `COMPARING ${current.title.toUpperCase()} — SELECT THE SECOND LAYER IN THE CATALOG`
}

// Divider drag (mouse + touch via pointer events)
{
  const handle = dividerEl.querySelector('.divider-handle')
  let draggingDiv = false
  handle.addEventListener('pointerdown', (e) => {
    draggingDiv = true
    handle.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  handle.addEventListener('pointermove', (e) => {
    if (!draggingDiv) return
    const rect = stage.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - rect.left, rect.width * 0.12), rect.width * 0.88)
    dividerEl.style.left = `${(x / rect.width) * 100}%`
    globe.setCompareClip(x)
  })
  const end = (e) => {
    draggingDiv = false
    try { handle.releasePointerCapture(e.pointerId) } catch { /* released */ }
  }
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
  window.addEventListener('resize', () => {
    if (!compare) return
    const pct = parseFloat(dividerEl.style.left) / 100 || 0.5
    globe.setCompareClip(stageWidth() * pct)
  })
}
document.getElementById('cmp-exit').addEventListener('click', () => exitCompare())

/* ---------- share ---------- */
function shareURL() {
  const origin = location.origin + BASE
  if (activeStory) return `${origin}s/${activeStory}/`
  if (compare) return location.href
  if (activeId !== 'migrations') return `${origin}l/${activeId}/`
  return location.href
}
document.getElementById('share-btn').addEventListener('click', async () => {
  try {
    track('share', activeStory || (compare ? `${compare.a.id},${compare.b.id}` : activeId))
    await navigator.clipboard.writeText(shareURL())
    const prev = captionEl.textContent
    captionEl.textContent = 'LINK COPIED — PASTE IT ANYWHERE'
    setTimeout(() => { captionEl.textContent = prev }, 1800)
  } catch {
    captionEl.textContent = `SHARE THIS VIEW: ${shareURL()}`
  }
})

function syncUI() {
  for (const el of chipsEl.querySelectorAll('.chip[data-id]')) {
    el.setAttribute('aria-pressed', String(el.dataset.id === activeId && !activeStory))
  }
  for (const row of catalogList.querySelectorAll('.cat-row')) {
    row.classList.toggle('active', row.dataset.id === (activeStory || activeId))
  }
  indexItems.forEach((b) => b.classList.toggle('active', b.dataset.story === activeStory))
}

/* ---------- featured chips + catalog ---------- */
function buildChips() {
  chipsEl.innerHTML = ''
  for (const entry of REGISTRY.filter((r) => r.featured)) {
    const b = document.createElement('button')
    b.className = 'chip'
    b.dataset.id = entry.id
    b.setAttribute('aria-pressed', String(entry.id === activeId))
    b.textContent = entry.title
    b.addEventListener('click', () => activate(entry.id))
    chipsEl.appendChild(b)
  }
  const cmp = document.createElement('button')
  cmp.className = 'chip'
  cmp.id = 'chip-compare'
  cmp.textContent = '⇄ Compare'
  cmp.addEventListener('click', () => (compare ? exitCompare() : beginPicking()))
  chipsEl.appendChild(cmp)
  const explore = document.createElement('button')
  explore.className = 'chip chip-explore'
  explore.id = 'chip-explore'
  explore.innerHTML = `⊞ Explore all <span class="count">${REGISTRY.length}</span>`
  explore.setAttribute('aria-expanded', 'false')
  explore.addEventListener('click', () => toggleCatalog())
  chipsEl.appendChild(explore)
}

function buildCatalog(filter = '') {
  const q = filter.trim().toLowerCase()
  catalogList.innerHTML = ''
  const groups = new Map()
  for (const entry of REGISTRY) {
    if (q && !`${entry.title} ${entry.category} ${entry.source}`.toLowerCase().includes(q)) continue
    if (!groups.has(entry.category)) groups.set(entry.category, [])
    groups.get(entry.category).push(entry)
  }
  if (!groups.size) {
    catalogList.innerHTML = '<p class="mono cat-empty">NOTHING FILED UNDER THAT — YET.</p>'
    return
  }
  for (const [category, entries] of groups) {
    const h = document.createElement('p')
    h.className = 'mono cat-group'
    h.textContent = category.toUpperCase()
    catalogList.appendChild(h)
    for (const entry of entries) {
      const row = document.createElement('button')
      row.className = 'cat-row'
      row.dataset.id = entry.id
      row.classList.toggle('active', entry.id === (activeStory || activeId))
      row.innerHTML = `<span class="cat-title">${entry.title}</span><span class="mono cat-meta">${entry.freshness || entry.source}</span>`
      row.addEventListener('click', () => {
        if (picking) {
          if (entry.kind !== 'overlay') {
            captionEl.textContent = 'COMPARE WORKS WITH DATA LAYERS — PICK ONE OF THOSE'
            return
          }
          if (entry.id === activeId) return
          startCompare(byId[activeId], entry)
          return
        }
        activate(entry.id)
        if (window.innerWidth < 760) toggleCatalog(false)
      })
      catalogList.appendChild(row)
    }
  }
}

function toggleCatalog(force) {
  const open = force ?? catalog.hidden
  catalog.hidden = !open
  if (!open) picking = false
  const explore = document.getElementById('chip-explore')
  if (explore) explore.setAttribute('aria-expanded', String(open))
  if (open) {
    buildCatalog(catalogSearch.value)
    catalogSearch.focus()
  }
}
document.getElementById('catalog-close').addEventListener('click', () => toggleCatalog(false))
catalogSearch.addEventListener('input', () => buildCatalog(catalogSearch.value))

/* ---------- stories: map above, field notes below ---------- */
const STORY_OFFSET_SCALE = 0 // full-viewport map; no panel to dodge
const STORY_META = {
  muledeer: { kicker: 'N°01 — Mule deer', title: '150 miles, twice a year.' },
  woodcock: { kicker: 'N°02 — American woodcock', title: 'Gone by morning.' },
  pigeon: { kicker: 'N°03 — Passenger pigeon', title: 'From billions to zero.' },
}

let pigeonTimer = null
function openStory(id) {
  if (compare) exitCompare(true)
  activeStory = id
  atlasEl.classList.add('story-on')
  hud.hidden = false
  hudKicker.textContent = STORY_META[id].kicker
  hudTitle.textContent = STORY_META[id].title
  hudTimeline.hidden = id !== 'pigeon'
  reader.hidden = false
  readerBodies.forEach((b) => { b.hidden = b.id !== `reader-${id}` })
  catalog.hidden = true
  setCaption(byId[id])
  globe.focusStory(id, { offsetScale: STORY_OFFSET_SCALE })
  setLegend(false)
  track('story', id)
  if (id === 'pigeon') startPigeonTimeline()
  else stopPigeonTimeline()
  syncURL()
  syncUI()
}
function closeStory(silent = false) {
  activeStory = null
  syncURL()
  atlasEl.classList.remove('story-on')
  hud.hidden = true
  reader.hidden = true
  stopPigeonTimeline()
  globe.releaseStory()
  if (!silent) {
    activate('migrations')
    return
  }
  syncUI()
}
indexItems.forEach((b) => b.addEventListener('click', () => {
  if (activeStory === b.dataset.story) closeStory()
  else openStory(b.dataset.story)
}))
document.getElementById('story-close').addEventListener('click', () => closeStory())
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!catalog.hidden) toggleCatalog(false)
  else if (compare) exitCompare()
  else if (activeStory) closeStory()
})

/* ---------- pigeon timeline ---------- */
const scrub = document.getElementById('pigeon-scrub')
const yearEl = document.getElementById('pigeon-year')
const pigeonCaption = document.getElementById('pigeon-caption')
const eventsByYear = [...pigeonData.events].sort((a, b) => a.year - b.year)

function renderPigeonYear(y) {
  yearEl.textContent = String(y)
  globe.setStoryYear(y)
  if (y >= 1914) {
    pigeonCaption.textContent = 'SEPTEMBER 1, 1914 — THE POPULATION IS ZERO.'
  } else {
    const latest = eventsByYear.filter((e) => e.year <= y).pop()
    pigeonCaption.textContent = latest ? `${latest.year} — ${latest.place.toUpperCase()}` : 'THE CENTURY BEGINS'
  }
}
function startPigeonTimeline() {
  stopPigeonTimeline()
  if (REDUCED) {
    scrub.value = '1914'
    renderPigeonYear(1914)
    return
  }
  scrub.value = '1810'
  renderPigeonYear(1810)
  const start = performance.now()
  const dur = 11000
  const tick = (now) => {
    const p = Math.min((now - start) / dur, 1)
    const y = Math.round(1810 + 104 * p)
    scrub.value = String(y)
    renderPigeonYear(y)
    if (p < 1) pigeonTimer = requestAnimationFrame(tick)
  }
  pigeonTimer = requestAnimationFrame(tick)
}
function stopPigeonTimeline() {
  if (pigeonTimer) cancelAnimationFrame(pigeonTimer)
  pigeonTimer = null
}
scrub.addEventListener('input', () => {
  stopPigeonTimeline()
  renderPigeonYear(Number(scrub.value))
})

/* ---------- chrome ---------- */
buildChips()
buildCatalog()
refreshRegistryFromBackend()

// Deep links: ?layer=<id> · ?study=<id> · ?compare=<a>,<b>
{
  const params = new URLSearchParams(location.search)
  const study = params.get('study')
  const layer = params.get('layer')
  const cmp = params.get('compare')
  if (study && byId[study]) openStory(study)
  else if (cmp) {
    const [a, b] = cmp.split(',').map((x) => byId[x])
    if (a && b && a.kind === 'overlay' && b.kind === 'overlay') { activeId = a.id; startCompare(a, b) }
  } else if (layer && byId[layer]) activate(layer)
}

initReveals()
document.getElementById('year').textContent = String(new Date().getFullYear())

document.getElementById('zoom-in').addEventListener('click', () => globe.zoomIn())
document.getElementById('zoom-out').addEventListener('click', () => globe.zoomOut())
document.getElementById('zoom-home').addEventListener('click', () => {
  if (activeStory) closeStory()
  else globe.resetView()
})

const railLinks = [...document.querySelectorAll('.rail a')]
const railTargets = railLinks.map((a) => document.getElementById(a.dataset.rail)).filter(Boolean)
const railIO = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      railLinks.forEach((a) => {
        const on = a.dataset.rail === entry.target.id
        a.classList.toggle('active', on)
        a.querySelector('.wp').classList.toggle('filled', on)
      })
    }
  },
  { rootMargin: '-38% 0px -52% 0px' },
)
railTargets.forEach((el) => railIO.observe(el))
