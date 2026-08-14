# Waypoints

**Wildlife data, made visible.** Real wildlife data — GPS collars, banding records, satellite imagery, a century of field notes — rendered on a living globe. Tracked migrations, species occurrence maps, and habitat, drawn from public, citable sources.

**Live:** https://brockyenglin.github.io/waypoints/

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run data       # regenerate map projections + re-fetch live data layers
```

## Sharing & social

- `node scripts/generate-og.mjs` — renders a 1200×630 OG card for every layer and study into `public/og/`, plus static share pages under `public/l/<id>/` and `public/s/<id>/`. Crawlers read the OG tags there (so links unfurl with the actual map); humans get redirected into the app with the right layer applied. The in-app ⧉ SHARE button hands out these URLs.
- `node scripts/export-social.mjs <layer-id> [...ids] | --all` — 1080×1350 Instagram-ready cards into `exports/`.
- Both use `scripts/lib/card.mjs` (pure sharp — no browser needed).

## Analytics & backend

First-party, cookie-free counts only: the client posts `pageview` / `layer` / `compare` / `story` / `share` events to a Supabase `events` table (anon key can INSERT and nothing else; respects Do Not Track; no-ops in dev). The `layers` registry table is the same project — anon can SELECT only.

## Licensing

GBIF layers aggregate records published under CC0/CC BY/CC BY-NC — because some datasets are **non-commercial**, the site itself stays non-commercial and attributed. NASA imagery is public domain (no endorsement implied). Full credits in the site's Sources section.

## The viewer

Registry-driven and built to scale to hundreds of visualizations: **583 entries today** (579 data layers — 570 species worldwide + 9 NASA earth datasets — plus tracked migrations and 3 field studies, across 26 categories: North American game and fish, songbirds, raptors and owls, waterbirds, world reptiles and amphibians, saltwater gamefish and sharks, insects and pollinators, small mammals and primates, every continent's megafauna, ocean giants, legendary migrants, and 18 extinct species mapped from museum records). The registry lives in a Supabase backend (`layers` table, project `qwzbopcielsbacmlvoua`, public read via RLS) — add a row in the database and it appears on the site without a rebuild. The site paints instantly from a bundled snapshot (`src/data/layers.json`) and swaps to the live registry when the backend answers. Adding a GBIF species is one line in `scripts/fetch-layers.mjs`'s `SPECIES` list (fetches the layer, stamps provenance, updates the snapshot; re-seed the DB from it). The catalog drawer (⊞ Explore) is searchable and grouped by category with source badges. Navigation: drag to rotate, on-map +/−/⌂ controls, ⌘/Ctrl+scroll or double-click to zoom (shift+double-click out), pinch on touch. Every view is a shareable URL (`?layer=woolly-mammoth`, `?study=muledeer`, `?compare=bear,grizzly`) with a ⧉ SHARE button that copies it. GBIF layers show an honest relative-density legend (no invented bins). **Compare mode** (⇄ chip) splits the globe at a draggable divider to view any two layers side by side. Markers rescale every frame to hold a steady screen size at any zoom. Zooming below z≈2.9 lazy-loads `earth-na-8k.jpg` — a 3×-detail North America drape built from NASA's 500m Blue Marble quadrants (`scripts/build-na-patch.mjs`, prebuilt in public/textures/). Opening a field study keeps the map full-screen — a thin HUD docks to the map and the written field notes render below it.

## What's on the globe

The hero is real NASA satellite Earth (Blue Marble surface, Black Marble city lights on the night limb, topographic relief, specular oceans) with switchable data layers:

| Layer | Source | How it gets there |
|---|---|---|
| Migrations | Published tracking studies | Animated great-circle arcs by species group |
| Field studies (01–03) | WMI/USGS, EWMRC-style tracks, historical records | Camera flies to the region; corridor tube, three live birds, or a 104-year timeline render on the terrain |
| 570 species occurrence densities across 22 wildlife categories worldwide | **GBIF occurrence API** | `fetch-layers.mjs` resolves each taxon key and stitches density tiles; `--skip-existing` makes reruns incremental; `append-species.mjs` merges curated lists; genus-level fuzzy matches are rejected |
| Vegetation, snow cover, active fires, land surface temp | **NASA NEO MODIS (monthly)** | Fetched from the NEO archive, latest published month |

Nothing on the site is invented: coordinates come from the datasets, scale bars are measured from the map projections, divider bearings are computed great-circle bearings, and every layer caption names its source.

## Design system — "Living Atlas"

Dark field instrument: forest black, conifer green, ember orange. Space Grotesk / Inter / JetBrains Mono. Data-series colors validated for colorblind separation and contrast (all pairs). Full spec: [src/data/tokens.json](src/data/tokens.json).

## Architecture

```
scripts/
  fetch-layers.mjs          # GBIF density tiles + NASA NEO NDVI -> public/textures/
src/
  globe/globe.js            # three.js earth: NASA 8K textures, clouds, stars,
                            #   arcs, layer overlays, story camera + on-globe viz
  data/                     # datasets (real coordinates) + design tokens
  styles/                   # tokens.css, base.css, sections.css
public/textures/            # NASA Blue/Black Marble, GBIF + NDVI overlays
```

`archive/svg-plates/` holds the earlier flat-SVG story figures — reusable as static social-export templates.

## Data sources

GBIF · NASA Earth Observations · Movebank · Eastern Woodcock Migration Research Cooperative · USGS Bird Banding Laboratory · USGS NWIS · eBird/Cornell Lab · state fish & wildlife agencies · Schorger passenger pigeon records · Western Migrations / Wyoming Game & Fish.
