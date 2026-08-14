// Waypoints — the living globe.
// Real NASA Earth in space: Blue Marble surface, night lights on the limb,
// drifting clouds, filmic tone. Migration arcs and data layers float above it,
// and each field study gets its own camera move + on-globe visualization.
import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const DEG = Math.PI / 180
const R = 1

export function latLngToVec3(lat, lng, radius = R, target = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG
  const theta = (lng + 180) * DEG
  return target.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function slerpPoints(from, to, lift, segments = 96) {
  const a = latLngToVec3(from[0], from[1])
  const b = latLngToVec3(to[0], to[1])
  const angle = a.angleTo(b)
  const sinA = Math.sin(angle)
  const points = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = new THREE.Vector3()
    if (angle > 0.01) {
      p.copy(a).multiplyScalar(Math.sin((1 - t) * angle) / sinA)
        .addScaledVector(b, Math.sin(t * angle) / sinA)
        .normalize()
    } else {
      p.copy(a).lerp(b, t).normalize()
    }
    p.multiplyScalar(R + lift(t, angle))
    points.push(p)
  }
  return points
}

// Ground path hugging the terrain through many waypoints.
function groundPath(latLngs, lift = 0.004, perHop = 10) {
  const pts = []
  for (let i = 0; i < latLngs.length - 1; i++) {
    const seg = slerpPoints(latLngs[i], latLngs[i + 1], () => lift, perHop)
    pts.push(...(i === 0 ? seg : seg.slice(1)))
  }
  return pts
}

/* ---------------- shaders ---------------- */

const ARC_VERT = /* glsl */ `
  attribute float aT;
  varying float vT;
  varying float vFacing;
  void main() {
    vT = aT;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 normal = normalize(world.xyz);
    vec3 viewDir = normalize(cameraPosition - world.xyz);
    vFacing = dot(normal, viewDir);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const ARC_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPhase;
  uniform float uHistoric;
  uniform float uDashN;
  uniform float uOpacity;
  varying float vT;
  varying float vFacing;

  float dash(float t) {
    float s = fract(t * uDashN) * 10.0;
    return s < 6.0 ? 1.0 : 0.0;
  }

  void main() {
    float facing = smoothstep(-0.15, 0.25, vFacing);
    float drawEnd = smoothstep(0.0, 0.16, uPhase);
    float head = clamp((uPhase - 0.18) / 0.5, 0.0, 1.0);
    float rest = smoothstep(0.78, 0.98, uPhase);

    float d = dash(vT);
    float visible = step(vT, drawEnd);
    float solid = step(vT, head) * (1.0 - uHistoric);
    float baseA = mix(d * 0.5, 0.9, solid);

    float headGlow = smoothstep(0.02, 0.0, abs(vT - head)) * step(0.001, head) * step(head, 0.999);
    float tail = (vT < head && head - vT < 0.12) ? exp(-(head - vT) * 26.0) * 0.7 : 0.0;

    float erode = uHistoric * rest;
    float erosionMask = 1.0 - erode * smoothstep(vT, vT + 0.35, rest * 1.35);

    float a = (baseA * visible + headGlow + tail) * facing * erosionMask * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * 1.4, a);
  }
`

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(vNormal, viewDir)), uPower);
    gl_FragColor = vec4(uColor, rim * uIntensity);
  }
`

/* ---------------- sprite textures ---------------- */

// Minimal waypoint mark: a single small solid diamond.
// `active` (hover) grows it and adds a hairline ring for affordance.
function diamondTexture(colorHex, active) {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.translate(s / 2, s / 2)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = colorHex
  const half = active ? 22 : 15
  ctx.fillRect(-half, -half, half * 2, half * 2)
  if (active) {
    ctx.strokeStyle = colorHex
    ctx.lineWidth = 3
    ctx.strokeRect(-34, -34, 68, 68)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 2
  return tex
}

function dotTexture(colorHex) {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.fillStyle = colorHex
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2)
  ctx.fill()
  return new THREE.CanvasTexture(c)
}

function crossTexture(colorHex) {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.strokeStyle = colorHex
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(28, 28); ctx.lineTo(100, 100)
  ctx.moveTo(28, 100); ctx.lineTo(100, 28)
  ctx.stroke()
  return new THREE.CanvasTexture(c)
}

/* ---------------- main ---------------- */

export function createGlobe(container, opts) {
  const {
    arcs = [],
    markers = [],
    colors,
    textures,          // { day, dayHi?, night, bump, water, clouds, layers: {} }
    stories = {},      // { muledeer: {...}, woodcock: {...}, pigeon: {...} }
    onMarkerClick = () => {},
    onMarkerHover = () => {},
    reducedMotion = false,
  } = opts

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40)
  camera.position.set(0, 0.1, 4.15)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  container.appendChild(renderer.domElement)

  const globe = new THREE.Group()
  scene.add(globe)

  // Fat-line materials need the canvas resolution; kept fresh in resize().
  const fatLineMats = []

  // --- Space: a quiet starfield, far away ---
  {
    const N = 1400
    const pos = new Float32Array(N * 3)
    const v = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(16 + Math.random() * 8)
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaebdc9, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false,
    }))
    scene.add(stars)
  }

  // --- Light ---
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.4)
  sun.position.set(-2.2, 1.4, 2.6)
  scene.add(sun)
  scene.add(new THREE.AmbientLight(0x1c2822, 1.5))

  // --- Earth ---
  const loader = new THREE.TextureLoader()
  // Screen tiers: phones skip the heavy texture paths, tablets skip only the 8K map.
  const bigScreen = Math.min(screen.width, screen.height) > 500
  const desktopScreen = Math.min(screen.width, screen.height) > 900
  const ANISO = bigScreen ? 8 : 2
  const tex = (url, srgb = true, aniso = ANISO) => {
    const t = loader.load(url)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(aniso, renderer.capabilities.getMaxAnisotropy())
    return t
  }
  const wantHi = textures.dayHi && renderer.capabilities.maxTextureSize >= 8192 && desktopScreen
  const dayTex = tex(wantHi ? textures.dayHi : textures.day)
  const nightTex = tex(textures.night)
  const bumpTex = tex(textures.bump, false, 1)
  const waterTex = tex(textures.water, false, 1)

  const earthMat = new THREE.MeshPhongMaterial({
    map: dayTex,
    bumpMap: bumpTex,
    bumpScale: 1.1,
    specularMap: waterTex,
    specular: new THREE.Color(0x33414e),
    shininess: 26,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: nightTex,
    emissiveIntensity: 1.0,
  })
  earthMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       {
         vec3 sunDir = normalize(vec3(-2.2, 1.4, 2.6));
         float day = smoothstep(-0.12, 0.18, dot(normalize(vNormal), sunDir));
         totalEmissiveRadiance *= (1.0 - day) * 1.7;
       }`,
    )
  }
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), earthMat)
  globe.add(earth)

  // --- Clouds: barely-there, drifting ---
  let clouds = null
  if (textures.clouds && !reducedMotion && bigScreen) {
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.006, 96, 96),
      new THREE.MeshBasicMaterial({
        map: tex(textures.clouds, true, 1),
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    clouds.renderOrder = 3
    globe.add(clouds)
  }

  // --- Layer overlays: an A/B pair so two layers can split the screen ---
  const OVERLAY_VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    }
  `
  const OVERLAY_FRAG = /* glsl */ `
    uniform sampler2D uMap;
    uniform float uOpacity;
    uniform float uClipX;  // device px; divider position in compare mode
    uniform float uSide;   // 0 = full sphere, 1 = left of divider, -1 = right
    varying vec2 vUv;
    void main() {
      if (uSide > 0.5 && gl_FragCoord.x > uClipX) discard;
      if (uSide < -0.5 && gl_FragCoord.x <= uClipX) discard;
      vec4 c = texture2D(uMap, vUv);
      if (c.a * uOpacity < 0.01) discard;
      gl_FragColor = vec4(c.rgb, c.a * uOpacity);
    }
  `
  function makeOverlay() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: OVERLAY_VERT,
      fragmentShader: OVERLAY_FRAG,
      uniforms: {
        uMap: { value: null },
        uOpacity: { value: 0 },
        uClipX: { value: 0 },
        uSide: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.002, 96, 96), mat)
    mesh.renderOrder = 2 // data drape stays above the high-detail patch
    mesh.visible = false
    globe.add(mesh)
    return mesh
  }
  const overlayA = makeOverlay()
  const overlayB = makeOverlay()
  const layerCache = new Map() // texture url -> THREE.Texture, LRU order
  // Bounded: evicted layers give back their GPU memory and re-decode on revisit;
  // textures currently on either overlay are never evicted.
  function layerTex(url) {
    if (layerCache.has(url)) {
      const t = layerCache.get(url)
      layerCache.delete(url)
      layerCache.set(url, t)
      return t
    }
    const t = tex(url)
    if (!bigScreen) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter }
    layerCache.set(url, t)
    const MAX = bigScreen ? 8 : 3
    for (const [k, v] of layerCache) {
      if (layerCache.size <= MAX) break
      if (v === overlayA.material.uniforms.uMap.value || v === overlayB.material.uniforms.uMap.value) continue
      layerCache.delete(k)
      v.dispose()
    }
    return t
  }

  // --- Atmosphere ---
  // Subdued: a thin haze at the limb, not a halo.
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.13, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(colors.atmosphere) },
        uIntensity: { value: 0.38 },
        uPower: { value: 4.6 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  scene.add(atmo)
  const innerRim = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.001, 96, 96),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(colors.atmosphere) },
        uIntensity: { value: 0.18 },
        uPower: { value: 5.4 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  innerRim.renderOrder = 4
  globe.add(innerRim)

  // --- Shared line-material factory ---
  function routeMaterial(color, { historic = 0, dashN = 40, phase = 0 } = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: ARC_VERT,
      fragmentShader: ARC_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPhase: { value: phase },
        uHistoric: { value: historic },
        uDashN: { value: dashN },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }
  function lineFromPoints(pts, mat) {
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const ts = new Float32Array(pts.length)
    for (let j = 0; j < pts.length; j++) ts[j] = j / (pts.length - 1)
    geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1))
    const line = new THREE.Line(geo, mat)
    line.renderOrder = 10
    return line
  }

  // --- Migration arcs ---
  const CYCLE = 14
  const arcGroup = new THREE.Group()
  globe.add(arcGroup)
  // Tracked routes only — each arc is a real multi-stop path drawn as one
  // flowing comet line. Lift scales with the route's span, so a short
  // corridor hugs the ground while a flyway-length track bows gently.
  const arcMeshes = arcs.map((arc, i) => {
    const ground = groundPath(arc.path, 0, 8)
    let span = 0
    for (let j = 1; j < ground.length; j++) span += ground[j - 1].angleTo(ground[j])
    const liftPeak = THREE.MathUtils.clamp(span * 0.32, 0.006, 0.15)
    const pts = ground.map((p, j) => {
      const t = j / (ground.length - 1)
      return p.clone().normalize().multiplyScalar(R + liftPeak * Math.sin(Math.PI * t))
    })
    const line = lineFromPoints(pts, routeMaterial(arc.color, {
      historic: arc.historic ? 1 : 0,
      dashN: Math.max(12, Math.round(span * 40)),
      phase: reducedMotion ? 0.75 : 0,
    }))
    line.userData = { offset: (i * 0.618) % 1 }
    arcGroup.add(line)
    return line
  })

  // --- Markers ---
  const texCache = {}
  const markerTex = (color, filled) => {
    const key = color + filled
    if (!texCache[key]) texCache[key] = diamondTexture(color, filled)
    return texCache[key]
  }
  const markerGroup = new THREE.Group()
  globe.add(markerGroup)
  const pickables = []
  const allSprites = []
  // baseScale is calibrated for the resting camera distance; every frame the
  // sprite is rescaled so points keep a steady screen size as the globe zooms.
  function addSprite(group, map, scale, lat, lng, lift, data) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }))
    sprite.renderOrder = 10
    latLngToVec3(lat, lng, R * (1 + lift), sprite.position)
    sprite.scale.setScalar(scale)
    sprite.userData = data || {}
    sprite.userData.baseScale = sprite.userData.baseScale ?? scale
    group.add(sprite)
    allSprites.push(sprite)
    if (data && data.marker) pickables.push(sprite)
    return sprite
  }
  const markerSprites = markers.map((m) => {
    const isStory = m.kind === 'story'
    const color = isStory ? colors.markerStory : colors.marker
    return addSprite(markerGroup, markerTex(color, false), isStory ? 0.085 : 0.05, m.lat, m.lng, 0.012, {
      marker: m, baseScale: isStory ? 0.085 : 0.05, isStory, color,
    })
  })

  /* ---------------- story visualizations ---------------- */

  const storyGroups = {}   // id -> { group, tick(t, dt) }

  function buildMuledeer(data) {
    const group = new THREE.Group()
    const path = groundPath(data.corridor, 0.0035, 8)
    // A crisp GPS-track line with dark cartographic casing so it reads on
    // any terrain — constant screen width, no glow.
    const positions = []
    for (const p of path) positions.push(p.x, p.y, p.z)
    const makeLine = (colorHex, linewidth, opacity) => {
      const geo = new LineGeometry()
      geo.setPositions(positions)
      const mat = new LineMaterial({
        color: new THREE.Color(colorHex),
        linewidth,
        transparent: true,
        opacity,
        depthWrite: false,
      })
      fatLineMats.push(mat)
      mat.resolution.set(width, height)
      const line = new Line2(geo, mat)
      line.computeLineDistances()
      line.renderOrder = 10
      return { line, geo }
    }
    const casing = makeLine('#0b0f0c', 5.2, 0.6)
    const stroke = makeLine(colors.corridor, 2.8, 0.98)
    const totalSegments = path.length - 1
    group.add(casing.line)
    group.add(stroke.line)
    for (const b of data.bottlenecks) {
      addSprite(group, markerTex(colors.markerStory, false), 0.045, b.lat, b.lng, 0.005, {
        marker: { lat: b.lat, lng: b.lng, label: b.name, note: b.note, kind: 'poi' },
        baseScale: 0.045, color: colors.markerStory,
      })
    }
    const phase = { t: 0 }
    const setProgress = (p) => {
      // Line2 renders one instance per segment — drawing the first k segments
      // gives a clean south-to-north draw-in.
      const k = Math.max(0, Math.floor(totalSegments * p))
      casing.geo.instanceCount = k
      stroke.geo.instanceCount = k
    }
    return {
      group,
      reset() {
        phase.t = 0
        setProgress(reducedMotion ? 1 : 0)
      },
      tick(_, dt) {
        if (reducedMotion) return
        phase.t = Math.min(phase.t + dt / 4.5, 1)
        setProgress(1 - Math.pow(1 - phase.t, 3))
      },
    }
  }

  function buildWoodcock(data) {
    const group = new THREE.Group()
    const trackColors = [colors.trackA, colors.trackB, colors.trackC]
    const birds = []
    data.tracks.forEach((track, i) => {
      const latLngs = track.points.map((p) => [p.lat, p.lng])
      const path = groundPath(latLngs, 0.005, 12)
      const line = lineFromPoints(path, routeMaterial(trackColors[i], { dashN: 140, phase: 0.68 }))
      group.add(line)
      for (const p of track.points) {
        addSprite(group, dotTexture(trackColors[i]), 0.032, p.lat, p.lng, 0.005, {
          marker: { lat: p.lat, lng: p.lng, label: `${track.name} — ${p.date}`, note: p.place, kind: 'poi' },
          baseScale: 0.032, color: trackColors[i], dot: true,
        })
      }
      const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0.05)
      const bird = addSprite(group, markerTex(trackColors[i], true), 0.05, 0, 0, 0.01, null)
      birds.push({ curve, bird, offset: i * 0.33, speed: 1 / 30 })
    })
    return {
      group,
      reset() {},
      tick(t) {
        for (const b of birds) {
          const u = reducedMotion ? 0.5 : (t * b.speed + b.offset) % 1
          b.bird.position.copy(b.curve.getPointAt(u))
        }
      },
    }
  }

  function buildPigeon(data) {
    const group = new THREE.Group()
    const neutralDot = dotTexture(colors.historic)
    const neutralRing = markerTex(colors.historic, false)
    const nodes = data.events.map((ev) => {
      const isPetoskey = ev.place.startsWith('Petoskey')
      const isMartha = ev.year === 1914
      let sprite
      if (isMartha) {
        sprite = addSprite(group, crossTexture(colors.markerStory), 0.05, ev.lat, ev.lng, 0.006, null)
      } else if (isPetoskey) {
        sprite = addSprite(group, markerTex(colors.markerStory, true), 0.06, ev.lat, ev.lng, 0.006, null)
      } else {
        sprite = addSprite(group, ev.type === 'nesting' ? neutralDot : neutralRing, 0.033, ev.lat, ev.lng, 0.005, null)
      }
      sprite.userData = {
        ...(sprite.userData || {}),
        marker: { lat: ev.lat, lng: ev.lng, label: `${ev.year} — ${ev.place}`, note: ev.note || ev.type, kind: 'poi' },
        pigeonYear: ev.year,
        petoskey: isPetoskey,
      }
      pickables.push(sprite)
      return sprite
    })
    let year = 1810
    return {
      group,
      reset() { year = 1810; this.setYear(1810) },
      setYear(y) {
        year = y
        for (const s of nodes) {
          const ev = s.userData.pigeonYear
          if (ev > y) { s.material.opacity = 0; s.userData.disabled = true; continue }
          const age = y - ev
          const floor = s.userData.petoskey ? 0.3 : 0.16
          const fresh = Math.max(0, 1 - age / 16)
          s.material.opacity = floor + (1 - floor) * fresh
          s.userData.disabled = false
        }
      },
      tick() { void year },
    }
  }

  const builders = { muledeer: buildMuledeer, woodcock: buildWoodcock, pigeon: buildPigeon }

  /* ---------------- interaction ---------------- */

  let rotY = -0.09
  let rotX = 0.38
  let velY = 0
  let dragging = false
  let moved = 0
  let lastX = 0
  let lastY = 0
  let axisLocked = false // touch drags commit to an axis before any rotation
  let slopX = 0
  let slopY = 0
  let dragId = null
  let idleTime = 0
  let zoomTarget = null
  let activeStory = null
  let userZ = null // manual zoom level; null = resting at baseZ
  const MIN_Z = 1.12

  // Lazy high-res regional texture (lat 10-75N, lng 170W-50W).
  let patch = null
  let patchState = 'idle'
  function maybeLoadPatch() {
    if (patchState !== 'idle' || camera.position.z > 2.9) return
    patchState = 'loading'
    if (!textures.regionHi || renderer.capabilities.maxTextureSize < 8192 || !bigScreen) {
      patchState = 'unsupported'
      return
    }
    fetch(textures.regionHi, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok) throw new Error('patch missing')
        const geo = new THREE.SphereGeometry(R * 1.0004, 128, 80, 10 * DEG, 120 * DEG, 15 * DEG, 65 * DEG)
        patch = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
          map: tex(textures.regionHi),
          specular: new THREE.Color(0x1e2933),
          shininess: 20,
          transparent: true,
          opacity: 0,
        }))
        patch.renderOrder = 1 // above the base earth, below every data shell
        patch.visible = false
        globe.add(patch)
        patchState = 'ready'
      })
      .catch(() => { patchState = 'unsupported' })
  }
  const AUTO_SPEED = reducedMotion ? 0 : 0.0026
  let baseZ = 4.15

  function nudgeZoom(factor) {
    const current = userZ ?? camera.position.z
    userZ = THREE.MathUtils.clamp(current * factor, MIN_Z, baseZ * 1.12)
    zoomTarget = null
    idleTime = 0
  }

  const el = renderer.domElement
  el.style.touchAction = 'pan-y'
  el.style.cursor = 'grab'
  // One finger: the browser may pan the page vertically (pan-y).
  // Two or more: the pinch is ours — the browser must not start a pan.
  const ownMultiTouch = (e) => { if (e.touches.length >= 2 && e.cancelable) e.preventDefault() }
  el.addEventListener('touchstart', ownMultiTouch, { passive: false })
  el.addEventListener('touchmove', ownMultiTouch, { passive: false })

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2(-10, -10)
  const canHover = window.matchMedia('(hover: hover)').matches

  function toNDC(e, target) {
    const rect = el.getBoundingClientRect()
    target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    target.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  // Two active pointers = pinch zoom; any more park the gesture until a pair remains.
  const activePointers = new Map()
  let pinchDist = 0
  const seedPinch = () => {
    const [a, b] = [...activePointers.values()]
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
  }

  el.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePointers.size >= 2) {
      dragging = false
      if (activePointers.size === 2) seedPinch()
      return
    }
    dragId = e.pointerId
    dragging = true
    moved = 0
    axisLocked = e.pointerType !== 'touch' // mouse rotates from the first pixel
    slopX = 0
    slopY = 0
    lastX = e.clientX
    lastY = e.clientY
    zoomTarget = null
    try { el.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
    el.style.cursor = 'grabbing'
  })
  el.addEventListener('pointermove', (e) => {
    toNDC(e, pointer)
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (activePointers.size === 2) {
      const [a, b] = [...activePointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDist > 0 && Math.abs(d - pinchDist) > 1) {
        nudgeZoom(pinchDist / d)
        pinchDist = d
      }
      return
    }
    if (dragging && e.pointerId === dragId) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (!axisLocked) {
        slopX += Math.abs(dx)
        slopY += Math.abs(dy)
        lastX = e.clientX
        lastY = e.clientY
        if (slopX + slopY < 8) return // undecided — apply nothing yet
        if (slopY > slopX * 1.2) { dragging = false; return } // vertical: the page scroll owns it
        axisLocked = true
      }
      moved += Math.abs(dx) + Math.abs(dy)
      lastX = e.clientX
      lastY = e.clientY
      const speed = 0.005 * (camera.position.z / 4.15) // finer control when zoomed in
      rotY += dx * speed
      rotX = THREE.MathUtils.clamp(rotX + dy * speed * 0.7, -1.1, 1.1)
      velY = THREE.MathUtils.clamp(dx * speed, -0.05, 0.05)
      idleTime = 0
    }
  })
  const endDrag = (e) => {
    activePointers.delete(e.pointerId)
    if (activePointers.size === 2) seedPinch()
    else pinchDist = 0
    dragging = false
    if (e.type === 'pointercancel') velY = 0 // the browser claimed the gesture; no residual spin
    if (e.pointerType && e.pointerType !== 'mouse') pointer.set(-10, -10) // no resting cursor on touch
    el.style.cursor = hovered ? 'pointer' : 'grab'
    if (e.pointerId !== undefined) { try { el.releasePointerCapture(e.pointerId) } catch { /* released */ } }
  }
  el.addEventListener('pointerup', endDrag)
  el.addEventListener('pointercancel', endDrag)
  el.addEventListener('pointerleave', () => setHover(null))

  // Zoom: ⌘/Ctrl + wheel (plain wheel keeps scrolling the page), double-click in,
  // shift + double-click out.
  el.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    nudgeZoom(Math.exp(e.deltaY * 0.0016))
  }, { passive: false })
  el.addEventListener('dblclick', (e) => {
    e.preventDefault()
    toNDC(e, clickNDC)
    raycaster.setFromCamera(clickNDC, camera)
    if (raycaster.intersectObjects(visiblePickables(), false).length) return // marker taps open, not zoom
    nudgeZoom(e.shiftKey ? 1.45 : 0.62)
  })

  let hovered = null
  function setHover(sprite) {
    if (hovered === sprite) return
    if (hovered && !hovered.userData.dot) hovered.material.map = markerTex(hovered.userData.color, false)
    hovered = sprite
    if (hovered && !hovered.userData.dot) hovered.material.map = markerTex(hovered.userData.color, true)
    el.style.cursor = sprite ? 'pointer' : dragging ? 'grabbing' : 'grab'
    onMarkerHover(sprite ? sprite.userData.marker : null)
  }

  const clickNDC = new THREE.Vector2()
  el.addEventListener('click', (e) => {
    if (moved > 6) return
    toNDC(e, clickNDC)
    raycaster.setFromCamera(clickNDC, camera)
    const hits = raycaster.intersectObjects(visiblePickables(), false)
    onMarkerClick(hits.length ? hits[0].object.userData.marker : null) // null = empty tap; dismisses the tooltip
  })

  function visiblePickables() {
    return pickables.filter((s) => {
      if (!s.visible || s.userData.disabled) return false
      let o = s
      while (o) { if (!o.visible) return false; o = o.parent }
      return true
    })
  }

  /* ---------------- live GBIF density ---------------- */

  // Viewport-matched occurrence-density tiles: when the camera settles zoomed
  // in, fetch just the visible region from the GBIF map API at a zoom level
  // matched to the view and drape it above the global overlay — the same idea
  // as the lazy regionHi earth patch, but for live data. All failures are
  // silent; the static global texture is always underneath.
  let liveSpec = null      // { taxonKey, filters, opacity } or null
  let liveBaseOpacity = null // the active layer's own overlay opacity, for live-region dimming
  let liveMesh = null      // at most one regional drape at a time
  let liveRegion = null    // { Z, latN, latS, lngW, lngE } of liveMesh
  let liveGen = 0          // bumps on movement/spec change; stale builds abandon
  let liveAbort = null     // aborted only on spec change/disable, so panned-away builds still fill the cache
  let liveSettle = 0
  let liveEvaluated = false
  let livePrevRotY = 0
  let livePrevRotX = 0
  let livePrevZ = 0
  const LIVE_BUILD_Z = 2.4 // hysteresis: build below this...
  const LIVE_DROP_Z = 2.6  // ...fade out and dispose above this
  const liveTileCache = new Map() // url -> Promise<ImageBitmap|null>, LRU order

  function liveTile(url, signal) {
    if (liveTileCache.has(url)) {
      const hit = liveTileCache.get(url)
      liveTileCache.delete(url)
      liveTileCache.set(url, hit)
      return hit
    }
    const p = fetch(url, { signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('tile'))))
      .then((blob) => createImageBitmap(blob))
      .catch(() => {
        if (liveTileCache.get(url) === p) liveTileCache.delete(url) // failed/aborted: retry on a later build
        return null
      })
    liveTileCache.set(url, p)
    for (const [k, v] of liveTileCache) {
      if (liveTileCache.size <= 48) break
      if (v === p) continue
      liveTileCache.delete(k)
      v.then((bm) => { if (bm) bm.close() }).catch(() => {})
    }
    return p
  }

  function disposeLiveMesh() {
    if (!liveMesh) return
    globe.remove(liveMesh)
    liveMesh.geometry.dispose()
    if (liveMesh.material.map) liveMesh.material.map.dispose()
    liveMesh.material.dispose()
    liveMesh = null
  }

  const liveNDC = new THREE.Vector2()
  const liveCenter = new THREE.Vector3()
  const liveCorner = new THREE.Vector3()
  const liveLocal = new THREE.Vector3()
  const liveInv = new THREE.Matrix4()
  const LIVE_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]

  // Ray from an NDC point to the sphere surface (world space); false on miss.
  function livePick(nx, ny, out) {
    liveNDC.set(nx, ny)
    raycaster.setFromCamera(liveNDC, camera)
    const o = raycaster.ray.origin
    const d = raycaster.ray.direction
    const b = o.dot(d)
    const disc = b * b - (o.dot(o) - R * R)
    if (disc < 0) return false
    const t = -b - Math.sqrt(disc)
    if (t < 0) return false
    out.copy(d).multiplyScalar(t).add(o)
    return true
  }

  // View center + angular radius of the settled view, in globe-local degrees.
  // Null when the center ray misses the sphere. Shared by the live density and
  // live earth systems.
  function computeViewBox() {
    if (!livePick(0, 0, liveCenter)) return null
    liveInv.copy(globe.matrixWorld).invert()
    liveLocal.copy(liveCenter).applyMatrix4(liveInv).normalize()
    const centerLat = 90 - Math.acos(THREE.MathUtils.clamp(liveLocal.y, -1, 1)) / DEG
    let centerLng = Math.atan2(liveLocal.z, -liveLocal.x) / DEG - 180
    if (centerLng < -180) centerLng += 360

    // Angular radius of the view: the farthest visible corner, clamped to the
    // horizon when a corner misses the sphere — then capped well inside the
    // horizon. The limb is foreshortened past reading anyway, and covering it
    // would force a huge low-zoom box; the global texture holds the edges.
    const horizon = Math.acos(Math.min(1, R / camera.position.length()))
    let ang = 0
    for (const [nx, ny] of LIVE_CORNERS) {
      ang = Math.max(ang, livePick(nx, ny, liveCorner) ? liveCorner.angleTo(liveCenter) : horizon)
    }
    const angDeg = (Math.min(ang, horizon * 0.65) / DEG) * 1.15 // ~15% pad each side
    return { centerLat, centerLng, angDeg }
  }

  // GBIF EPSG:4326 tiling: zoom Z has 2^(Z+1) columns x 2^Z rows over 360x180;
  // x from 180W, y from the north. Clamped to the valid tile range — no
  // antimeridian wrap (v1).
  function liveTileGrid(Z, latN, latS, lngW, lngE) {
    const step = 180 / (1 << Z)
    const maxX = (1 << (Z + 1)) - 1
    const maxY = (1 << Z) - 1
    const x0 = Math.max(0, Math.min(maxX, Math.floor((lngW + 180) / step)))
    const x1 = Math.max(0, Math.min(maxX, Math.ceil((lngE + 180) / step) - 1))
    const y0 = Math.max(0, Math.min(maxY, Math.floor((90 - latN) / step)))
    const y1 = Math.max(0, Math.min(maxY, Math.ceil((90 - latS) / step) - 1))
    return { x0, x1, y0, y1, cols: x1 - x0 + 1, rows: y1 - y0 + 1 }
  }

  // Decide whether the settled view needs a new regional drape, and start one.
  function evaluateLive() {
    const spec = liveSpec
    if (!spec) return
    const view = computeViewBox()
    if (!view) return
    const { centerLat, centerLng, angDeg } = view

    // Smallest GBIF zoom giving >= ~1.2 texture px per screen px of view width
    // (tiles are 512 css px, fetched @2x -> 1024 px per tile).
    const spanDeg = Math.max(2, angDeg * 2)
    const maxZ = bigScreen ? 7 : 5
    let Z = 2
    while (Z < maxZ && (spanDeg * 1024 * (1 << Z)) / 180 < 1.2 * width) Z++

    const cosLat = Math.max(0.2, Math.cos(centerLat * DEG))
    const latN = Math.min(90, centerLat + angDeg)
    const latS = Math.max(-90, centerLat - angDeg)
    const lngW = Math.max(-180, centerLng - angDeg / cosLat)
    const lngE = Math.min(180, centerLng + angDeg / cosLat)

    // Fit the tile grid under the cap: prefer dropping Z, then trim the edges
    // around the view center.
    const maxRows = bigScreen ? 3 : 2 // 4x3 = 12 tiles; 4x2 = 8 on small screens
    let g = liveTileGrid(Z, latN, latS, lngW, lngE)
    while (Z > 2 && (g.cols > 4 || g.rows > maxRows)) {
      Z--
      g = liveTileGrid(Z, latN, latS, lngW, lngE)
    }
    const step = 180 / (1 << Z)
    if (g.cols > 4 || g.rows > maxRows) {
      const cx = Math.floor((centerLng + 180) / step)
      const cy = Math.floor((90 - centerLat) / step)
      if (g.cols > 4) {
        g.x0 = Math.max(g.x0, Math.min(cx - 2, g.x1 - 3))
        g.x1 = g.x0 + 3
      }
      if (g.rows > maxRows) {
        g.y0 = Math.max(g.y0, Math.min(cy - (maxRows >> 1), g.y1 - (maxRows - 1)))
        g.y1 = g.y0 + maxRows - 1
      }
      g.cols = g.x1 - g.x0 + 1
      g.rows = g.y1 - g.y0 + 1
    }

    const boxN = 90 - g.y0 * step
    const boxS = 90 - (g.y1 + 1) * step
    const boxW = g.x0 * step - 180
    const boxE = (g.x1 + 1) * step - 180

    // Still good? Same Z and the view center sits in the region's inner 60%.
    if (liveMesh && liveRegion && liveRegion.Z === Z) {
      const mLat = 0.2 * (liveRegion.latN - liveRegion.latS)
      const mLng = 0.2 * (liveRegion.lngE - liveRegion.lngW)
      if (centerLat < liveRegion.latN - mLat && centerLat > liveRegion.latS + mLat &&
          centerLng > liveRegion.lngW + mLng && centerLng < liveRegion.lngE - mLng) {
        liveMesh.userData.targetOpacity = spec.opacity ?? 1 // un-fade if we dipped past the drop zoom
        return
      }
    }

    liveGen++
    if (!liveAbort) liveAbort = new AbortController()
    buildLiveRegion(liveGen, spec, Z, g, boxN, boxS, boxW, boxE, liveAbort.signal)
  }

  async function buildLiveRegion(gen, spec, Z, g, boxN, boxS, boxW, boxE, signal) {
    try {
      const jobs = []
      for (let ty = g.y0; ty <= g.y1; ty++) {
        for (let tx = g.x0; tx <= g.x1; tx++) {
          const url = `https://api.gbif.org/v2/map/occurrence/density/${Z}/${tx}/${ty}@2x.png` +
            `?srs=EPSG%3A4326&taxonKey=${spec.taxonKey}&style=classic.point${spec.filters ? '&' + spec.filters : ''}`
          jobs.push(liveTile(url, signal).then((bm) => ({ bm, tx, ty })))
        }
      }
      const tiles = await Promise.all(jobs)
      if (gen !== liveGen) return
      const w = g.cols * 1024
      const h = g.rows * 1024
      let canvas
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h)
      } else {
        canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      let drew = false
      ctx.filter = 'blur(2px)' // soften the raw density bins into a field
      for (const tile of tiles) {
        if (!tile.bm) continue // missing tile: a gap; the global layer shows through
        try {
          ctx.drawImage(tile.bm, (tile.tx - g.x0) * 1024, (tile.ty - g.y0) * 1024, 1024, 1024)
          drew = true
        } catch { /* bitmap evicted mid-build */ }
      }
      ctx.filter = 'none'
      if (!drew || gen !== liveGen) return
      // The blur diluted alpha; two additive self-draws restore the punch
      // (approximates the build pipeline's alpha x3 gain).
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(canvas, 0, 0)
      ctx.drawImage(canvas, 0, 0)
      ctx.globalCompositeOperation = 'source-over'

      const map = new THREE.CanvasTexture(canvas)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy())
      map.generateMipmaps = false
      map.minFilter = THREE.LinearFilter
      // Partial sphere spanning exactly the fetched tile box, using the same
      // lng-to-phi convention as the regionHi patch: phi = lng + 180 from the
      // west edge, theta = 90 - lat from the north.
      const segs = (deg) => Math.max(12, Math.min(128, Math.round(deg)))
      const geo = new THREE.SphereGeometry(
        R * 1.0068, segs(boxE - boxW), segs(boxN - boxS),
        (boxW + 180) * DEG, (boxE - boxW) * DEG,
        (90 - boxN) * DEG, (boxN - boxS) * DEG,
      )
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }))
      mesh.renderOrder = 2.5 // above the global overlay, below the clouds
      mesh.userData.targetOpacity = spec.opacity ?? 1
      if (reducedMotion) mesh.material.opacity = mesh.userData.targetOpacity
      disposeLiveMesh()
      liveMesh = mesh
      liveRegion = { Z, latN: boxN, latS: boxS, lngW: boxW, lngE: boxE }
      globe.add(mesh)
    } catch { /* silent — the global texture is always underneath */ }
  }

  /* ---- live earth: GIBS Blue Marble regions ---- */

  // Deep-zoom earth imagery: when the camera settles zoomed in, drape NASA
  // GIBS Blue Marble tiles over the viewed region so the earth itself
  // re-resolves — the density system's skeleton applied to the base surface.
  // Always on (no spec needed); unlike density it keeps working in compare
  // mode, since it sits under both clip overlays. All failures are silent;
  // the global day texture is always underneath.
  let liveEarthOn = true
  let earthMesh = null     // at most one regional drape at a time
  let earthRegion = null   // { L, latN, latS, lngW, lngE } of earthMesh
  let earthGen = 0         // bumps on movement/disable; stale builds abandon
  let earthAbort = null    // aborted only on disable, so panned-away builds still fill the cache
  let earthEvaluated = false
  const EARTH_BUILD_Z = 2.2  // hysteresis: build below this...
  const EARTH_DROP_Z = 2.35  // ...fade out and dispose above this
  const earthTileCache = new Map() // url -> Promise<ImageBitmap|null>, LRU order

  function earthTile(url, signal) {
    if (earthTileCache.has(url)) {
      const hit = earthTileCache.get(url)
      earthTileCache.delete(url)
      earthTileCache.set(url, hit)
      return hit
    }
    const p = fetch(url, { signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('tile'))))
      .then((blob) => createImageBitmap(blob))
      .catch(() => {
        if (earthTileCache.get(url) === p) earthTileCache.delete(url) // failed/aborted: retry on a later build
        return null
      })
    earthTileCache.set(url, p)
    for (const [k, v] of earthTileCache) {
      if (earthTileCache.size <= 64) break
      if (v === p) continue
      earthTileCache.delete(k)
      v.then((bm) => { if (bm) bm.close() }).catch(() => {})
    }
    return p
  }

  function disposeEarthMesh() {
    if (!earthMesh) return
    globe.remove(earthMesh)
    earthMesh.geometry.dispose()
    if (earthMesh.material.map) earthMesh.material.map.dispose()
    earthMesh.material.dispose()
    earthMesh = null
  }

  // GIBS WMTS EPSG:4326 tiling (BlueMarble_NextGeneration, 500m tile matrix):
  // levels 0..7, 512px tiles, 0.5625 / 2^L degrees per pixel, so a tile spans
  // 288 / 2^L degrees; col from 180W, row from the north. The rightmost column
  // and bottom row are partial (512px JPEGs padded past 180E / 90S) — the
  // build crops them off via texture.repeat/offset.
  function earthTileGrid(L, latN, latS, lngW, lngE) {
    const step = 288 / (1 << L)
    const maxC = Math.ceil(360 / step) - 1
    const maxR = Math.ceil(180 / step) - 1
    const c0 = Math.max(0, Math.min(maxC, Math.floor((lngW + 180) / step)))
    const c1 = Math.max(0, Math.min(maxC, Math.ceil((lngE + 180) / step) - 1))
    const r0 = Math.max(0, Math.min(maxR, Math.floor((90 - latN) / step)))
    const r1 = Math.max(0, Math.min(maxR, Math.ceil((90 - latS) / step) - 1))
    return { c0, c1, r0, r1, cols: c1 - c0 + 1, rows: r1 - r0 + 1 }
  }

  // Decide whether the settled view needs a new earth drape, and start one.
  function evaluateEarth() {
    const view = computeViewBox()
    if (!view) return
    const { centerLat, centerLng, angDeg } = view

    // Smallest GIBS level giving >= ~1.1 texture px per screen px of the view
    // span (0.5625 / 2^L degrees per texture px).
    const spanDeg = angDeg * 2
    const maxL = bigScreen ? 7 : 6
    let L = 2
    while (L < maxL && (spanDeg * (1 << L)) / 0.5625 < 1.1 * width) L++

    const cosLat = Math.max(0.2, Math.cos(centerLat * DEG))
    const latN = Math.min(90, centerLat + angDeg)
    const latS = Math.max(-90, centerLat - angDeg)
    const lngW = Math.max(-180, centerLng - angDeg / cosLat)
    const lngE = Math.min(180, centerLng + angDeg / cosLat)

    // Fit the tile grid under the cap: prefer dropping L, then trim the edges
    // around the view center.
    const maxRows = bigScreen ? 3 : 2 // 4x3 = 12 tiles; 4x2 = 8 on small screens
    let g = earthTileGrid(L, latN, latS, lngW, lngE)
    while (L > 2 && (g.cols > 4 || g.rows > maxRows)) {
      L--
      g = earthTileGrid(L, latN, latS, lngW, lngE)
    }
    const step = 288 / (1 << L)
    if (g.cols > 4 || g.rows > maxRows) {
      const cc = Math.floor((centerLng + 180) / step)
      const cr = Math.floor((90 - centerLat) / step)
      if (g.cols > 4) {
        g.c0 = Math.max(g.c0, Math.min(cc - 2, g.c1 - 3))
        g.c1 = g.c0 + 3
      }
      if (g.rows > maxRows) {
        g.r0 = Math.max(g.r0, Math.min(cr - (maxRows >> 1), g.r1 - (maxRows - 1)))
        g.r1 = g.r0 + maxRows - 1
      }
      g.cols = g.c1 - g.c0 + 1
      g.rows = g.r1 - g.r0 + 1
    }

    // Tile-range box clamped to the world edges (partial edge tiles overshoot).
    const boxN = 90 - g.r0 * step
    const boxS = Math.max(-90, 90 - (g.r1 + 1) * step)
    const boxW = g.c0 * step - 180
    const boxE = Math.min(180, (g.c1 + 1) * step - 180)

    // Still good? Same L and the view center sits in the region's inner 60%.
    if (earthMesh && earthRegion && earthRegion.L === L) {
      const mLat = 0.2 * (earthRegion.latN - earthRegion.latS)
      const mLng = 0.2 * (earthRegion.lngE - earthRegion.lngW)
      if (centerLat < earthRegion.latN - mLat && centerLat > earthRegion.latS + mLat &&
          centerLng > earthRegion.lngW + mLng && centerLng < earthRegion.lngE - mLng) {
        earthMesh.userData.targetOpacity = 1 // un-fade if we dipped past the drop zoom
        return
      }
    }

    earthGen++
    if (!earthAbort) earthAbort = new AbortController()
    buildEarthRegion(earthGen, L, g, boxN, boxS, boxW, boxE, earthAbort.signal)
  }

  async function buildEarthRegion(gen, L, g, boxN, boxS, boxW, boxE, signal) {
    try {
      const jobs = []
      for (let tr = g.r0; tr <= g.r1; tr++) {
        for (let tc = g.c0; tc <= g.c1; tc++) {
          const url = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/' +
            `BlueMarble_NextGeneration/default/default/500m/${L}/${tr}/${tc}.jpeg`
          jobs.push(earthTile(url, signal).then((bm) => ({ bm, tr, tc })))
        }
      }
      const tiles = await Promise.all(jobs)
      if (gen !== earthGen) return
      const w = g.cols * 512
      const h = g.rows * 512
      let canvas
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h)
      } else {
        canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      let drew = false
      for (const tile of tiles) {
        if (!tile.bm) continue // missing tile: a gap; the base earth shows through
        try {
          ctx.drawImage(tile.bm, (tile.tc - g.c0) * 512, (tile.tr - g.r0) * 512, 512, 512)
          drew = true
        } catch { /* bitmap evicted mid-build */ }
      }
      if (!drew || gen !== earthGen) return

      const map = new THREE.CanvasTexture(canvas)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
      map.generateMipmaps = false
      map.minFilter = THREE.LinearFilter
      // Crop partial edge tiles: the canvas covers the full tile range, the
      // mesh only the clamped box (canvas row 0 = north = v 1; the west and
      // north edges always align, so only repeat + offset.y are needed).
      const step = 288 / (1 << L)
      map.repeat.x = (boxE - boxW) / (g.cols * step)
      map.repeat.y = (boxN - boxS) / (g.rows * step)
      map.offset.y = 1 - map.repeat.y
      // Partial sphere spanning exactly the clamped box, same phi/theta
      // convention as the regionHi patch.
      const segs = (deg) => Math.max(12, Math.min(128, Math.round(deg)))
      const geo = new THREE.SphereGeometry(
        R * 1.0006, segs(boxE - boxW), segs(boxN - boxS),
        (boxW + 180) * DEG, (boxE - boxW) * DEG,
        (90 - boxN) * DEG, (boxN - boxS) * DEG,
      )
      // Phong like the regionHi patch, so day lighting stays continuous.
      const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        map,
        specular: new THREE.Color(0x1e2933),
        shininess: 20,
        transparent: true,
        opacity: 0,
      }))
      mesh.renderOrder = 1.5 // above the regionHi patch, below the data shells
      mesh.userData.targetOpacity = 1
      if (reducedMotion) mesh.material.opacity = 1
      disposeEarthMesh()
      earthMesh = mesh
      earthRegion = { L, latN: boxN, latS: boxS, lngW: boxW, lngE: boxE }
      globe.add(mesh)
    } catch { /* silent — the base earth is always underneath */ }
  }

  // --- Sizing ---
  let width = 1
  let height = 1
  function resize() {
    width = container.clientWidth || 1
    height = container.clientHeight || 1
    renderer.setSize(width, height)
    camera.aspect = width / height
    baseZ = camera.aspect < 0.9 ? 5.6 : camera.aspect < 1.4 ? 4.8 : 4.15
    if (!zoomTarget && !activeStory && userZ === null) camera.position.z = baseZ
    camera.updateProjectionMatrix()
    for (const m of fatLineMats) m.resolution.set(width, height)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()

  // --- Loop ---
  const clock = new THREE.Clock()
  let running = true
  let raf = 0
  const worldPos = new THREE.Vector3()
  const camPos = new THREE.Vector3()
  const spriteN = new THREE.Vector3()
  const toCam = new THREE.Vector3()

  function frame() {
    raf = requestAnimationFrame(frame)
    if (!running) return
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime
    idleTime += dt

    if (zoomTarget) {
      const k = 1 - Math.pow(0.0022, dt)
      rotY += (zoomTarget.rotY - rotY) * k
      rotX += (zoomTarget.rotX - rotX) * k
      camera.position.z += (zoomTarget.z - camera.position.z) * k
    } else if (!dragging) {
      rotY += velY * dt * 60
      velY *= Math.pow(0.025, dt)
      const restZ = userZ ?? baseZ
      camera.position.z += (restZ - camera.position.z) * (1 - Math.pow(0.004, dt))
      if (!activeStory && userZ === null) {
        const autoIn = THREE.MathUtils.smoothstep(idleTime, 1.4, 3.6)
        rotY += AUTO_SPEED * autoIn * dt * 10 * (camera.position.z / baseZ)
      }
    }
    globe.rotation.y = rotY
    globe.rotation.x = rotX
    globe.updateMatrixWorld()

    if (clouds) clouds.rotation.y += dt * 0.0045

    if (!reducedMotion && arcGroup.visible) {
      for (const line of arcMeshes) {
        line.material.uniforms.uPhase.value = ((t / CYCLE) + line.userData.offset) % 1
      }
    }

    if (activeStory && storyGroups[activeStory]) storyGroups[activeStory].tick(t, dt)

    camera.getWorldPosition(camPos)
    for (const s of markerSprites) {
      s.getWorldPosition(worldPos)
      const facing = spriteN.copy(worldPos).normalize().dot(toCam.copy(camPos).sub(worldPos).normalize())
      s.material.opacity = THREE.MathUtils.clamp((facing - 0.06) / 0.22, 0, 1)
      s.visible = facing > 0.06 && markerGroup.visible
      s.userData.pulse = s.visible && s.userData.isStory && !reducedMotion && s !== hovered
        ? 1 + 0.1 * Math.sin(t * 2.1 + s.position.x * 5)
        : 1
    }

    // Points scale with the globe: near-constant screen size at any zoom.
    const zoomK = Math.min(1.15, Math.pow(Math.max(0.02, (camera.position.z - 0.97) / 3.18), 0.8))
    for (const s of allSprites) {
      if (!s.visible) continue
      s.scale.setScalar(s.userData.baseScale * zoomK * (s.userData.pulse || 1))
    }

    // High-detail North America drape: loads once you commit to zooming in.
    maybeLoadPatch()
    if (patch) {
      const want = camera.position.z < 3.0 ? 1 : 0
      const m = patch.material
      m.opacity += (want - m.opacity) * Math.min(1, dt * 2.5)
      patch.visible = m.opacity > 0.02
    }

    // Live regional drapes (GBIF density, GIBS earth): rebuild only once the
    // camera has settled (~350ms without input or motion); movement abandons
    // stale builds. One settle tracker feeds both systems.
    if (liveSpec || liveEarthOn) {
      const cz = camera.position.z
      const movedNow = dragging ||
        Math.abs(rotY - livePrevRotY) + Math.abs(rotX - livePrevRotX) + Math.abs(cz - livePrevZ) > 0.0001
      livePrevRotY = rotY
      livePrevRotX = rotX
      livePrevZ = cz
      if (movedNow) {
        liveSettle = 0
        liveEvaluated = false
        earthEvaluated = false
        earthGen++
        if (liveSpec) liveGen++
      } else {
        liveSettle += dt
      }
      if (liveSpec) {
        if (overlayB.visible) {
          // compare mode owns the data shells — stand down until it ends
          liveGen++
          liveEvaluated = false
          disposeLiveMesh()
          liveRegion = null
        } else if (cz > LIVE_DROP_Z) {
          if (liveMesh) liveMesh.userData.targetOpacity = 0
        } else if (cz < LIVE_BUILD_Z && liveSettle > 0.35 && !liveEvaluated) {
          liveEvaluated = true
          evaluateLive()
        }
      }
      // The earth drape ignores compare mode — it's the base surface under
      // both clip overlays.
      if (liveEarthOn) {
        if (cz > EARTH_DROP_Z) {
          if (earthMesh) earthMesh.userData.targetOpacity = 0
        } else if (cz < EARTH_BUILD_Z && liveSettle > 0.35 && !earthEvaluated) {
          earthEvaluated = true
          evaluateEarth()
        }
      }
    }
    if (liveMesh) {
      const m = liveMesh.material
      const want = liveMesh.userData.targetOpacity
      m.opacity = reducedMotion ? want : m.opacity + (want - m.opacity) * Math.min(1, dt * 12)
      liveMesh.visible = m.opacity > 0.01
      if (want === 0 && m.opacity < 0.02) {
        disposeLiveMesh()
        liveRegion = null
      }
    }
    if (earthMesh) {
      const m = earthMesh.material
      const want = earthMesh.userData.targetOpacity
      m.opacity = reducedMotion ? want : m.opacity + (want - m.opacity) * Math.min(1, dt * 6)
      earthMesh.visible = m.opacity > 0.01
      if (want === 0 && m.opacity < 0.02) {
        disposeEarthMesh()
        earthRegion = null
      }
    }
    // The coarse global drape yields while the live region carries the view:
    // full-strength both would double-expose big soft bins under crisp tiles.
    if (overlayA.visible && liveBaseOpacity !== null) {
      const dim = liveMesh ? liveMesh.material.opacity / Math.max(0.01, liveMesh.userData.targetOpacity || 1) : 0
      overlayA.material.uniforms.uOpacity.value = liveBaseOpacity * (1 - 0.85 * Math.min(1, dim))
    }

    if (!dragging && canHover) {
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(visiblePickables(), false)
      setHover(hits.length ? hits[0].object : null)
    }

    renderer.render(scene, camera)
  }
  frame()

  const io = new IntersectionObserver(([entry]) => { running = entry.isIntersecting }, { threshold: 0.02 })
  io.observe(container)

  // Rotation that puts [lat, lng] at the center of the view: the camera sits
  // slightly above the equatorial plane, so its center ray meets the sphere a
  // few degrees north — subtract that so the target lands dead center.
  function focusRotation(lat, lng, z = camera.position.z) {
    const centerRayLat = Math.atan2(camera.position.y, z)
    return { rotY: (lng + 90) * DEG * -1, rotX: lat * DEG - centerRayLat }
  }

  // Per-story framing: z tuned to the geographic span, lngOff shifts the
  // region into the right half when the panel covers the left (desktop).
  const STORY_CAMERA = {
    muledeer: { lat: 42.55, lng: -109.85, z: 1.34, lngOff: -2.4 },
    woodcock: { lat: 38.5, lng: -85.0, z: 2.25, lngOff: -7 },
    pigeon: { lat: 42.0, lng: -84.8, z: 1.95, lngOff: -5.5 },
  }

  return {
    debugRotY: () => rotY,
    zoomIn() { nudgeZoom(0.62) },
    zoomOut() { nudgeZoom(1.55) },
    resetView() {
      userZ = null
      zoomTarget = { rotY: -0.09, rotX: 0.38, z: baseZ }
      setTimeout(() => { if (!activeStory) zoomTarget = null }, 2400)
    },
    project(marker) {
      latLngToVec3(marker.lat, marker.lng, R * 1.012, worldPos)
      worldPos.applyMatrix4(globe.matrixWorld).project(camera)
      return { x: (worldPos.x * 0.5 + 0.5) * width, y: (-worldPos.y * 0.5 + 0.5) * height }
    },
    // entry: null (base view) or { texture: url, opacity } — any registry row.
    setLayer(entry) {
      const showData = !entry && !activeStory
      arcGroup.visible = showData
      markerGroup.visible = showData
      overlayB.visible = false
      if (!entry) {
        overlayA.visible = false
        overlayA.material.uniforms.uOpacity.value = 0
        liveBaseOpacity = null
        return
      }
      const u = overlayA.material.uniforms
      u.uMap.value = layerTex(entry.texture)
      u.uOpacity.value = entry.opacity ?? 1
      liveBaseOpacity = entry.opacity ?? 1
      u.uSide.value = 0
      overlayA.visible = true
    },
    // Two layers split at a screen-x divider (CSS px within the stage).
    setCompare(entryA, entryB, clipCssX) {
      arcGroup.visible = false
      markerGroup.visible = false
      liveBaseOpacity = null // compare owns the overlay uniforms

      for (const [mesh, entry, side] of [[overlayA, entryA, 1], [overlayB, entryB, -1]]) {
        const u = mesh.material.uniforms
        u.uMap.value = layerTex(entry.texture)
        u.uOpacity.value = entry.opacity ?? 1
        u.uSide.value = side
        mesh.visible = true
      }
      this.setCompareClip(clipCssX)
    },
    setCompareClip(cssX) {
      const px = cssX * renderer.getPixelRatio()
      overlayA.material.uniforms.uClipX.value = px
      overlayB.material.uniforms.uClipX.value = px
    },
    // Live GBIF density drape. spec: { taxonKey, filters, opacity } or null.
    // filters is a pre-joined query fragment ('year=2000,2026&...'), may be ''.
    // null disposes the region mesh, cancels in-flight fetches, and disables.
    setLiveDensity(spec) {
      liveGen++
      if (liveAbort) { liveAbort.abort(); liveAbort = null }
      disposeLiveMesh()
      liveRegion = null
      liveSettle = 0
      liveEvaluated = false
      liveSpec = spec && spec.taxonKey != null ? spec : null
    },
    liveDebug() {
      return { spec: !!liveSpec, settle: liveSettle, evaluated: liveEvaluated, mesh: !!liveMesh, region: liveRegion, z: camera.position.z, gen: liveGen }
    },
    // Deep-zoom earth imagery (NASA GIBS Blue Marble). On by default; false
    // disposes the drape, cancels in-flight fetches, and disables.
    setLiveEarth(on) {
      liveEarthOn = !!on
      if (liveEarthOn) return
      earthGen++
      if (earthAbort) { earthAbort.abort(); earthAbort = null }
      disposeEarthMesh()
      earthRegion = null
      earthEvaluated = false
    },
    focusStory(id, { offsetScale = 1 } = {}) {
      if (!builders[id] || !stories[id]) return
      if (activeStory && storyGroups[activeStory]) storyGroups[activeStory].group.visible = false
      if (!storyGroups[id]) {
        storyGroups[id] = builders[id](stories[id])
        globe.add(storyGroups[id].group)
      }
      activeStory = id
      userZ = null
      const sg = storyGroups[id]
      sg.reset()
      sg.group.visible = true
      arcGroup.visible = false
      markerGroup.visible = false
      overlayA.visible = false
      overlayB.visible = false
      const cam = STORY_CAMERA[id]
      zoomTarget = { ...focusRotation(cam.lat, cam.lng + cam.lngOff * offsetScale, cam.z), z: cam.z }
      return sg
    },
    setStoryYear(y) {
      const sg = storyGroups.pigeon
      if (sg && sg.setYear) sg.setYear(y)
    },
    releaseStory() {
      if (activeStory && storyGroups[activeStory]) storyGroups[activeStory].group.visible = false
      activeStory = null
      userZ = null
      arcGroup.visible = true
      markerGroup.visible = true
      zoomTarget = { rotY: -0.09, rotX: 0.38, z: baseZ }
      setTimeout(() => { if (!activeStory) zoomTarget = null }, 2600)
    },
    destroy() {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      liveGen++
      if (liveAbort) { liveAbort.abort(); liveAbort = null }
      disposeLiveMesh()
      for (const p of liveTileCache.values()) p.then((bm) => { if (bm) bm.close() }).catch(() => {})
      liveTileCache.clear()
      earthGen++
      if (earthAbort) { earthAbort.abort(); earthAbort = null }
      disposeEarthMesh()
      for (const p of earthTileCache.values()) p.then((bm) => { if (bm) bm.close() }).catch(() => {})
      earthTileCache.clear()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    },
  }
}
