// Waypoints — the Atlas: the full instrument. 583 layers, era toggle,
// compare, live-resolution density. The cinematic home lives at ../ (home.js).
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'

import { createGlobe } from './globe/globe.js'
import globeData from './data/globe.json'
import muledeerData from './data/muledeer.json'
import woodcockData from './data/woodcock.json'
import pigeonData from './data/pigeon.json'
// Dynamic imports keep the registry out of the code chunk: they load in
// parallel and the app chunk stays cache-stable across data refreshes.
const layerRegistry = (await import('./data/layers.json')).default
// Species with a second "since 2000" texture (year-filtered at fetch time).
// Extinct species aren't in here — their only truth is the historical record.
const MODERN = new Set((await import('./data/modern.json')).default)
// GBIF taxonKeys for live viewport-matched density tiles.
const TAXA = (await import('./data/taxa.json')).default

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const BASE = import.meta.env.BASE_URL
document.documentElement.classList.add('js')

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/* ============ the visualization registry ============
   Everything the viewer can show is a row here. Adding a visualization
   means adding a row (or a fetch-layers entry) — never new UI code. */
const COARSE = window.matchMedia('(pointer: coarse)').matches
const HINT = COARSE
  ? ' · drag to rotate · pinch or +/− to zoom'
  : ' · drag to rotate · ⌘+scroll / dbl-click to zoom'
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
    { id: 'muledeer', kind: 'story', title: 'Mule deer — 150 miles, twice a year', category: 'Field studies', source: 'WMI / USGS', caption: '' },
    { id: 'woodcock', kind: 'story', title: 'Woodcock — gone by morning', category: 'Field studies', source: 'EWMRC / USGS', caption: '' },
    { id: 'pigeon', kind: 'story', title: 'Passenger pigeon — from billions to zero', category: 'Field studies', source: 'Historical records', caption: '' },
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
track('pageview', `atlas:${new URLSearchParams(location.search).get('layer') || 'default'}`)

/* ---------- dom ---------- */
const stage = document.getElementById('globe-stage')
const tipEl = document.getElementById('globe-tip')
const captionEl = document.getElementById('layer-caption')
const chipsEl = document.getElementById('layer-chips')
const catalog = document.getElementById('catalog')
const catalogList = document.getElementById('catalog-list')
const catalogSearch = document.getElementById('catalog-search')

/* ---------- globe ---------- */
let activeMarker = null
let tipRaf = 0
let globe = null
let activeId = 'migrations'

function trackTip() {
  cancelAnimationFrame(tipRaf)
  if (!activeMarker || !globe) return
  const loop = () => {
    if (!activeMarker) return
    const { x, y } = globe.project(activeMarker)
    const rect = stage.getBoundingClientRect()
    const tw = tipEl.offsetWidth || 280
    const th = tipEl.offsetHeight || 110
    tipEl.style.left = `${Math.min(Math.max(x + 16, 10), Math.max(10, rect.width - tw - 10))}px`
    tipEl.style.top = `${Math.min(Math.max(y - 14, 10), Math.max(10, rect.height - th - 10))}px`
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
    if (m && m.storyId) { activate(m.storyId); return }
    showTip(m) // tap shows the same tip hover shows; an empty tap dismisses it
  },
  onMarkerHover(m) {
    showTip(m)
  },
})

function showTip(m) {
  activeMarker = m
  if (m) {
    const lat = `${Math.abs(m.lat).toFixed(2)}° ${m.lat >= 0 ? 'N' : 'S'}`
    const lng = `${Math.abs(m.lng).toFixed(2)}° ${m.lng >= 0 ? 'E' : 'W'}`
    const label = m.kind === 'story' ? 'FIELD STUDY — OPENS ON THE HOME GLOBE' : m.kind === 'poi' ? 'ON RECORD' : 'DATA STATION'
    tipEl.innerHTML = `<div class="tip-label">${label}</div><div class="tip-body">${m.label}${m.note ? `<br><span style="color: var(--ink-mid); font-size: 12px">${m.note}</span>` : ''}</div><div class="tip-coords">${lat}, ${lng}</div>`
    tipEl.classList.add('on')
    trackTip()
  } else {
    tipEl.classList.remove('on')
    cancelAnimationFrame(tipRaf)
  }
}
if (import.meta.env.DEV) window.__globe = globe

/* ---------- activation: one entry point for every visualization ---------- */
const legendEl = document.getElementById('density-legend')
const dividerEl = document.getElementById('compare-divider')
const cmpExit = document.getElementById('cmp-exit')
cmpExit.hidden = true // lives outside the divider so it hides on its own
const cmpLabelA = document.getElementById('cmp-label-a')
const cmpLabelB = document.getElementById('cmp-label-b')
let compare = null // { a, b } while compare mode is active
let picking = false

/* Era: 'modern' shows records since 2000 (the default — extirpated ranges and
   century-old museum pins drop out); 'all' shows every wild record on file. */
let era = 'modern'
const hasModern = (entry) => entry && entry.source === 'GBIF' && MODERN.has(entry.id)
const eraTexture = (entry) =>
  era === 'modern' && hasModern(entry) ? entry.texture.replace(/\.png$/, '-modern.png') : entry.texture
const eraCaption = (entry) =>
  era === 'modern' && hasModern(entry)
    ? (entry.caption || entry.title).replace('all-time occurrence records', 'occurrence records 2000–2026')
    : entry.caption || entry.title

/* Live viewport-matched GBIF tiles: same filters the build pipeline bakes into
   the static textures, mirrored for the browser-side requests. */
const LIVE_BASIS = ['HUMAN_OBSERVATION', 'OBSERVATION', 'MACHINE_OBSERVATION', 'PRESERVED_SPECIMEN', 'MATERIAL_SAMPLE', 'OCCURRENCE']
  .map((b) => `basisOfRecord=${b}`).join('&')
function syncLiveDensity() {
  if (!globe.setLiveDensity) return
  const entry = byId[activeId]
  const key = entry && entry.source === 'GBIF' && !compare ? TAXA[entry.id] : null
  if (!key) { globe.setLiveDensity(null); return }
  const filters = era === 'modern' && hasModern(entry) ? `year=2000,2026&${LIVE_BASIS}` : LIVE_BASIS
  globe.setLiveDensity({ taxonKey: key, filters, opacity: entry.opacity ?? 1 })
}

function setCaption(entry) {
  captionEl.textContent = eraCaption(entry)
}

function setLegend(visible) {
  legendEl.hidden = !visible
}

function syncURL() {
  const url = new URL(location.href)
  url.searchParams.delete('layer')
  url.searchParams.delete('compare')
  url.searchParams.delete('era')
  if (compare) url.searchParams.set('compare', `${compare.a.id},${compare.b.id}`)
  else if (activeId !== 'migrations') url.searchParams.set('layer', activeId)
  if (era === 'all') url.searchParams.set('era', 'all') // modern is the default
  history.replaceState(null, '', url)
}

function activate(id) {
  const entry = byId[id]
  if (!entry) return
  // Field studies live on the home globe with their written field notes.
  if (entry.kind === 'story') { location.href = `${BASE}?study=${id}`; return }
  if (compare) exitCompare(true)
  activeId = id
  globe.setLayer(entry.kind === 'base' ? null : { texture: `${BASE}${eraTexture(entry)}`, opacity: entry.opacity })
  setCaption(entry)
  setLegend(entry.source === 'GBIF')
  syncLiveDensity()
  track('activate', id)
  syncURL()
  syncUI()
}

/* ---------- compare mode: two layers, one draggable divider ---------- */
function stageWidth() { return stage.getBoundingClientRect().width }

function startCompare(a, b) {
  compare = { a, b }
  picking = false
  catalog.hidden = true
  globe.setLiveDensity?.(null) // regional patch would straddle the divider
  const x = stageWidth() / 2
  globe.setCompare(
    { texture: `${BASE}${eraTexture(a)}`, opacity: a.opacity },
    { texture: `${BASE}${eraTexture(b)}`, opacity: b.opacity },
    x,
  )
  dividerEl.hidden = false
  cmpExit.hidden = false
  dividerEl.style.left = '50%'
  cmpLabelA.textContent = `◀ ${a.title}`
  cmpLabelB.textContent = `${b.title} ▶`
  captionEl.textContent = `${eraCaption(a)} ⇄ ${eraCaption(b)}`.slice(0, 220)
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
  cmpExit.hidden = true
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
  if (compare) return location.href
  if (activeId !== 'migrations' && era === 'modern') return `${origin}l/${activeId}/`
  return location.href
}
document.getElementById('share-btn').addEventListener('click', async () => {
  try {
    track('share', compare ? `${compare.a.id},${compare.b.id}` : activeId)
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
    el.setAttribute('aria-pressed', String(el.dataset.id === activeId))
  }
  for (const row of catalogList.querySelectorAll('.cat-row')) {
    row.classList.toggle('active', row.dataset.id === activeId)
  }
  const toggle = document.getElementById('era-toggle')
  if (toggle) {
    const applicable = compare
      ? hasModern(compare.a) || hasModern(compare.b)
      : hasModern(byId[activeId])
    toggle.hidden = !applicable
    for (const b of toggle.querySelectorAll('.chip-era')) {
      b.setAttribute('aria-pressed', String(b.dataset.era === era))
    }
  }
}

/* ---------- era toggle: since-2000 vs all-time records ---------- */
function setEra(next) {
  if (era === next) return
  era = next
  track('era', `${next}:${activeId}`)
  if (compare) {
    // Re-resolve both sides under the new era without resetting the divider.
    const keep = compare
    compare = null
    startCompare(keep.a, keep.b)
    return
  }
  activate(activeId)
}

function eraChips() {
  const wrap = document.createElement('span')
  wrap.id = 'era-toggle'
  wrap.setAttribute('role', 'group')
  wrap.setAttribute('aria-label', 'Record era')
  for (const [value, label] of [['modern', 'Since 2000'], ['all', 'All-time']]) {
    const b = document.createElement('button')
    b.className = 'chip chip-era'
    b.dataset.era = value
    b.textContent = label
    b.addEventListener('click', () => setEra(value))
    wrap.appendChild(b)
  }
  return wrap
}

/* ---------- featured chips + catalog ---------- */
function buildChips() {
  chipsEl.innerHTML = ''
  chipsEl.appendChild(eraChips())
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
      row.classList.toggle('active', entry.id === activeId)
      // A viewer scanning 583 rows must be able to tell a journey from a
      // sighting map: TRACKS = drawn routes, RECORDS = occurrence density.
      const type = entry.kind === 'story' ? 'STORY' : entry.kind === 'base' ? 'TRACKS' : entry.source === 'GBIF' ? 'RECORDS' : entry.source === 'NASA' ? 'SATELLITE' : 'LAYER'
      row.innerHTML = `<span class="cat-title">${entry.title}</span><span class="mono cat-meta"><span class="cat-tag" data-type="${type.toLowerCase()}">${type}</span>${entry.freshness || entry.source}</span>`
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
    if (!COARSE) catalogSearch.focus() // autofocus pops the software keyboard over the drawer on phones
  }
}
document.getElementById('catalog-close').addEventListener('click', () => toggleCatalog(false))
catalogSearch.addEventListener('input', () => buildCatalog(catalogSearch.value))
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!catalog.hidden) toggleCatalog(false)
  else if (compare) exitCompare()
})

/* ---------- chrome ---------- */
buildChips()
buildCatalog()
refreshRegistryFromBackend()

// Deep links: ?layer=<id> · ?compare=<a>,<b> · ?era=all · ?study forwards home
{
  const params = new URLSearchParams(location.search)
  const study = params.get('study')
  const layer = params.get('layer')
  const cmp = params.get('compare')
  if (params.get('era') === 'all') era = 'all'
  if (study) location.replace(`${BASE}?study=${study}`)
  else if (cmp) {
    const [a, b] = cmp.split(',').map((x) => byId[x])
    if (a && b && a.kind === 'overlay' && b.kind === 'overlay') { activeId = a.id; startCompare(a, b) }
  } else if (layer && byId[layer]) activate(layer)
  else syncUI() // era chips reflect a bare ?era=all
}

document.getElementById('zoom-in').addEventListener('click', () => globe.zoomIn())
document.getElementById('zoom-out').addEventListener('click', () => globe.zoomOut())
document.getElementById('zoom-home').addEventListener('click', () => globe.resetView())
