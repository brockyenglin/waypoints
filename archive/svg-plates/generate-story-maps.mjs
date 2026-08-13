// Projects the story datasets into SVG-ready geometry at build time,
// so the client renders maps with zero geo libraries.
// Reads:  src/data/{muledeer,woodcock,pigeon}.json
// Writes: src/data/story-maps.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { geoMercator, geoConicEqualArea, geoPath, geoGraticule } from 'd3-geo'
import * as topojson from 'topojson-client'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = path.join(root, 'src', 'data')

const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
const muledeer = read('muledeer.json')
const woodcock = read('woodcock.json')
const pigeon = read('pigeon.json')

const usTopo = JSON.parse(fs.readFileSync(require.resolve('us-atlas/states-10m.json'), 'utf8'))
const countiesTopo = JSON.parse(fs.readFileSync(require.resolve('us-atlas/counties-10m.json'), 'utf8'))
const worldTopo = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))

const states = topojson.feature(usTopo, usTopo.objects.states)
const statesMesh = topojson.mesh(usTopo, usTopo.objects.states, (a, b) => a !== b)
const nation = topojson.feature(usTopo, usTopo.objects.nation)
const canada = topojson.feature(worldTopo, worldTopo.objects.countries)
  .features.find((f) => f.properties.name === 'Canada')

const r2 = (n) => Math.round(n * 100) / 100
// Slim down path d-strings: d3 emits full float precision we don't need.
const slim = (d) => (d || '').replace(/-?\d+\.\d+/g, (m) => (+m).toFixed(1))

// A real graphic scale bar: measure how many px one mile spans at the map
// center, then pick a round mileage that renders 50-130px wide.
function scaleBar(proj, W, H) {
  const [lng, lat] = proj.invert([W / 2, H / 2])
  const dLngPerMile = 1 / (69.172 * Math.cos(lat * Math.PI / 180))
  const [x1] = proj([lng, lat])
  const [x2] = proj([lng + dLngPerMile, lat])
  const pxPerMile = Math.abs(x2 - x1)
  for (const miles of [10, 25, 50, 100, 200, 400]) {
    const px = pxPerMile * miles
    if (px >= 50 && px <= 130) return { miles, px: r2(px) }
  }
  return { miles: 100, px: r2(pxPerMile * 100) }
}

// Initial great-circle bearing, for divider labels — real, from the data.
export function bearing([lat1, lng1], [lat2, lng2]) {
  const toR = Math.PI / 180
  const dLng = (lng2 - lng1) * toR
  const y = Math.sin(dLng) * Math.cos(lat2 * toR)
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) - Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// MultiPoint avoids spherical polygon winding pitfalls when fitting.
function boundsFeature(latLngs, padDeg = 0.35) {
  const lats = latLngs.map((p) => p[0])
  const lngs = latLngs.map((p) => p[1])
  return {
    type: 'MultiPoint',
    coordinates: [
      ...latLngs.map(([lat, lng]) => [lng, lat]),
      [Math.min(...lngs) - padDeg, Math.min(...lats) - padDeg],
      [Math.max(...lngs) + padDeg, Math.max(...lats) + padDeg],
    ],
  }
}

// ---------- Mule deer: western Wyoming, portrait ----------
let muledeerOut
{
  const W = 640, H = 860, PAD = 34
  const all = [...muledeer.corridor, ...muledeer.bottlenecks.map((b) => [b.lat, b.lng])]
  const proj = geoMercator()
    .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], boundsFeature(all, 0.55))
    .clipExtent([[0, 0], [W, H]])
  const pathGen = geoPath(proj)
  const wyoming = states.features.find((f) => f.id === '56')
  // County lines give the plate its survey-map texture (Sublette, Sweetwater, Fremont...)
  const wyoCounties = topojson.mesh(
    countiesTopo,
    { ...countiesTopo.objects.counties, geometries: countiesTopo.objects.counties.geometries.filter((g) => String(g.id).startsWith('56')) },
    (a, b) => a !== b,
  )

  const out = {
    viewBox: `0 0 ${W} ${H}`,
    scaleBar: scaleBar(proj, W, H),
    statePath: slim(pathGen(wyoming)),
    countiesPath: slim(pathGen(wyoCounties)),
    graticulePath: slim(pathGen(geoGraticule().step([0.5, 0.5])())),
    corridor: muledeer.corridor.map(([lat, lng]) => proj([lng, lat]).map(r2)),
    bottlenecks: muledeer.bottlenecks.map((b) => {
      const [x, y] = proj([b.lng, b.lat])
      return { x: r2(x), y: r2(y), name: b.name, note: b.note }
    }),
    winter: (() => { const [x, y] = proj([muledeer.ranges.winter.lng, muledeer.ranges.winter.lat]); return { x: r2(x), y: r2(y), name: muledeer.ranges.winter.name } })(),
    summer: (() => { const [x, y] = proj([muledeer.ranges.summer.lng, muledeer.ranges.summer.lat]); return { x: r2(x), y: r2(y), name: muledeer.ranges.summer.name } })(),
  }
  muledeerOut = out
}

// ---------- Shared eastern North America frame ----------
function easternFrame(latLngs, W, H, PAD, padDeg) {
  const proj = geoConicEqualArea()
    .parallels([29.5, 45.5])
    .rotate([80, 0])
    .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], boundsFeature(latLngs, padDeg))
    .clipExtent([[-8, -8], [W + 8, H + 8]])
  const pathGen = geoPath(proj)
  return {
    proj,
    base: {
      viewBox: `0 0 ${W} ${H}`,
      scaleBar: scaleBar(proj, W, H),
      nationPath: slim(pathGen(nation)),
      statesPath: slim(pathGen(statesMesh)),
      canadaPath: slim(pathGen(canada)),
    },
  }
}

// ---------- Woodcock: eastern US + maritime Canada ----------
const wcPoints = woodcock.tracks.flatMap((t) => t.points.map((p) => [p.lat, p.lng]))
const wc = easternFrame(wcPoints, 720, 780, 30, 1.2)
const woodcockOut = {
  ...wc.base,
  tracks: woodcock.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    flyway: t.flyway,
    pts: t.points.map((p) => {
      const [x, y] = wc.proj([p.lng, p.lat])
      return { x: r2(x), y: r2(y), date: p.date, place: p.place || '' }
    }),
  })),
}

// ---------- Passenger pigeon: Great Lakes + eastern seaboard ----------
const pgPoints = pigeon.events.map((e) => [e.lat, e.lng])
const pg = easternFrame(pgPoints, 720, 700, 30, 1.4)
const pigeonOut = {
  ...pg.base,
  events: pigeon.events.map((e) => {
    const [x, y] = pg.proj([e.lng, e.lat])
    return { x: r2(x), y: r2(y), year: e.year, place: e.place, type: e.type, note: e.note || '' }
  }),
  petoskey: (() => { const [x, y] = pg.proj([pigeon.petoskey.lng, pigeon.petoskey.lat]); return { x: r2(x), y: r2(y) } })(),
}

fs.writeFileSync(
  path.join(dataDir, 'story-maps.json'),
  JSON.stringify({ muledeer: muledeerOut, woodcock: woodcockOut, pigeon: pigeonOut }),
)
console.log('story-maps.json written')
