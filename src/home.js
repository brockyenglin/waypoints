// Waypoints — home: the cinematic globe + field studies + essays.
// The full instrument lives at /atlas/ (src/atlas.js).
import '@fontsource-variable/inter'
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

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const BASE = import.meta.env.BASE_URL
document.documentElement.classList.add('js')

// Layer/compare deep links belong to the atlas app now — old share links land
// here, so forward them (era and all) before booting anything heavy.
{
  const params = new URLSearchParams(location.search)
  if (params.get('layer') || params.get('compare')) {
    location.replace(`${BASE}atlas/${location.search}`)
  }
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/* ---------- first-party analytics: event name + layer id, nothing else ----------
   No cookies, no identifiers; skipped entirely when Do Not Track is on. */
const SUPA_URL = 'https://qwzbopcielsbacmlvoua.supabase.co'
const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_XwoB9aUmmw7qOU6gtRT6wg_Olkb4VTU'
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
track('pageview', `home:${new URLSearchParams(location.search).get('study') || 'default'}`)

/* ---------- smooth scroll ---------- */
let lenis = null
// syncTouch stays false: touch scrolling must remain native so the globe's
// touch-action pan-y hand-off (scroll vs rotate) keeps working.
if (!REDUCED) lenis = new Lenis({ autoRaf: true, lerp: 0.115, syncTouch: false })
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
const indexItems = [...document.querySelectorAll('.index-item[data-story]')] // link highlights navigate on their own
const hud = document.getElementById('story-hud')
const hudKicker = document.getElementById('hud-kicker')
const hudTitle = document.getElementById('hud-title')
const hudTimeline = document.getElementById('hud-timeline')
const reader = document.getElementById('reader')
const readerBodies = [...reader.querySelectorAll('.reader-body')]

/* ---------- globe ---------- */
let activeMarker = null
let tipRaf = 0
let globe = null
let activeStory = null

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

// Home shows the woodcock migrations — real GPS-modeled tracks, nothing else.
const trackColors = [cssVar('--viz-2'), cssVar('--viz-3'), cssVar('--viz-4')]
const homeArcs = woodcockData.tracks.map((t, i) => ({
  path: t.points.map((p) => [p.lat, p.lng]),
  color: trackColors[i],
  label: `${t.name} — woodcock GPS track`,
}))

globe = createGlobe(stage, {
  arcs: homeArcs,
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
    if (m && m.storyId) { openStory(m.storyId); return }
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
    const label = m.kind === 'story' ? 'FIELD STUDY — CLICK TO OPEN' : m.kind === 'poi' ? 'ON RECORD' : 'DATA STATION'
    tipEl.innerHTML = `<div class="tip-label">${label}</div><div class="tip-body">${m.label}${m.note ? `<br><span style="color: var(--ink-mid); font-size: 12px">${m.note}</span>` : ''}</div><div class="tip-coords">${lat}, ${lng}</div>`
    tipEl.classList.add('on')
    trackTip()
  } else {
    tipEl.classList.remove('on')
    cancelAnimationFrame(tipRaf)
  }
}
if (import.meta.env.DEV) window.__globe = globe

/* ---------- stories: map above, field notes below ---------- */
const STORY_META = {
  muledeer: { kicker: 'N°01 — Mule deer', title: '150 miles, twice a year.' },
  woodcock: { kicker: 'N°02 — American woodcock', title: 'Gone by morning.' },
  pigeon: { kicker: 'N°03 — Passenger pigeon', title: 'From billions to zero.' },
}

let pigeonTimer = null
function openStory(id) {
  if (!STORY_META[id]) return
  activeStory = id
  atlasEl.classList.add('story-on')
  hud.hidden = false
  hudKicker.textContent = STORY_META[id].kicker
  hudTitle.textContent = STORY_META[id].title
  hudTimeline.hidden = id !== 'pigeon'
  reader.hidden = false
  readerBodies.forEach((b) => { b.hidden = b.id !== `reader-${id}` })
  globe.focusStory(id, { offsetScale: 0 })
  track('story', id)
  if (id === 'pigeon') startPigeonTimeline()
  else stopPigeonTimeline()
  syncURL()
  syncUI()
}
function closeStory() {
  activeStory = null
  atlasEl.classList.remove('story-on')
  hud.hidden = true
  reader.hidden = true
  stopPigeonTimeline()
  globe.releaseStory()
  syncURL()
  syncUI()
}
function syncURL() {
  const url = new URL(location.href)
  url.searchParams.delete('study')
  if (activeStory) url.searchParams.set('study', activeStory)
  history.replaceState(null, '', url)
}
function syncUI() {
  indexItems.forEach((b) => b.classList.toggle('active', b.dataset.story === activeStory))
}
indexItems.forEach((b) => b.addEventListener('click', () => {
  if (activeStory === b.dataset.story) closeStory()
  else openStory(b.dataset.story)
}))
document.getElementById('story-close').addEventListener('click', () => closeStory())
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeStory) closeStory()
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
document.querySelector('.atlas-cta')?.addEventListener('click', () => track('open-atlas', 'home'))

// Deep link: ?study=<id> (layer/compare already forwarded to the atlas above)
{
  const study = new URLSearchParams(location.search).get('study')
  if (study && STORY_META[study]) openStory(study)
}

initReveals()
document.getElementById('year').textContent = String(new Date().getFullYear())

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
