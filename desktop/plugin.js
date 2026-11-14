/**
 * Jianghu: two wuxia landscapes behind the Hermes desktop app.
 *
 * - Feisheng: an ink-wash mountain scroll on rice paper (by night, on an ink
 *   stone). Every mark is a brush stroke made of separate bristles, painted once
 *   on Canvas 2D in the theme's own colours. Only the mist moves (CSS, on the
 *   compositor), plus a few pixels of parallax when the pointer moves.
 * - Cangfeng: a dithered karst lake. Rounded limestone peaks in jade mist, a
 *   pagoda on the ridge, a boat on the water, rain that comes and goes, a
 *   cinnabar sun by day and a pale moon by night. Drawn in a WebGL shader at one
 *   pixel per 3px cell and ordered-dithered (Bayer 8x8) into a five-step ramp
 *   plus one accent ink.
 *
 * The stage, the colour probe and the window CSS follow the structure of
 * Borealis (https://github.com/Adolanium/hermes-borealis, MIT). Every selector
 * below is app DOM (data-slot / data-* names), not SDK API: if a Desktop update
 * renames one, that piece of the look falls back to the plain palette.
 * No network requests, no images, no fonts.
 */

import { THEMES_AREA } from '@hermes/plugin-sdk'

const PLUGIN = { id: 'jianghu', name: 'Jianghu' }

// Prefix match: picking an accent colour renames the active theme to `<name>-accent-<hex>`.
const sel = name => `:root[data-hermes-theme^="${name}"]`

const isDark = () => document.documentElement.classList.contains('dark')

/* ── Colour probe ────────────────────────────────────────────────────────── */

// Resolve CSS colour expressions (vars, color-mix) to RGB bytes through a 1x1 canvas.
function readColors(map) {
  const probe = document.createElement('i')
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none'
  document.body.append(probe)
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  pixel.canvas.width = pixel.canvas.height = 1
  const out = {}

  for (const [key, css] of Object.entries(map)) {
    probe.style.color = ''
    probe.style.color = css
    pixel.fillStyle = '#000'
    pixel.fillStyle = getComputedStyle(probe).color
    pixel.clearRect(0, 0, 1, 1)
    pixel.fillRect(0, 0, 1, 1)
    const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data
    out[key] = [r, g, b]
  }

  probe.remove()
  return out
}

const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`

// The stage: a fixed, opaque layer of the theme's paper behind the whole app,
// holding the art. It must be opaque by itself: with Window Translucency on,
// Hermes forces <html> transparent, and a scene with see-through parts (or one
// faded with opacity) would show the desktop behind the window. Only the art
// inside fades, so behind text it fades to paper.
function mountStage(name) {
  const root = document.createElement('div')
  root.setAttribute('aria-hidden', 'true')
  root.dataset.jianghuScene = name
  root.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:var(--ui-bg-chrome);'
  const art = document.createElement('div')
  art.className = 'jh-art'
  art.style.cssText = 'position:absolute;inset:0;'
  root.append(art)
  document.body.prepend(root)
  return { root, art }
}

/* ══ Feisheng: the ink scroll ═════════════════════════════════════════════ */

const INK = {
  parallax: [2, 5, 9, 14], // px of travel per layer (far to near) across the window width
  seed: 1644
}

function createInkStage() {
  const { root, art } = mountStage('feisheng')

  const make = cls => {
    const c = document.createElement('canvas')
    c.className = cls
    c.style.cssText = 'position:absolute;top:0;'
    art.append(c)
    return c
  }
  // Back to front. The mist canvases sit between ranges and drift on their own.
  const layers = [make('jh-sky'), make('jh-far'), make('jh-mist jh-mist-a'), make('jh-mid'), make('jh-mist jh-mist-b'), make('jh-near')]
  const depthOf = [0, 0, 1, 1, 2, 3] // index into INK.parallax
  const boat = make('jh-boat')

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let W = 0, H = 0, PAD = 0, R = null, ink = [34, 29, 22], seal = [168, 47, 39], paper = [239, 232, 214], dark = false
  let ctx = null

  const rng = seed => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rand = (a, b) => a + (b - a) * R()
  const noise = seed => {
    const r = rng(seed), v = Array.from({ length: 256 }, () => r())
    return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 255] * (1 - u) + v[(i + 1) & 255] * u }
  }
  const fbm = (n, x, octaves) => { let s = 0, a = 1, t = 0; for (let o = 0; o < octaves; o++) { s += n(x) * a; t += a; x *= 2.07; a *= 0.5 } return s / t }

  // One stroke of the brush along `pts`: `width` px of bristles, each a thin line that skips at random (`dry`).
  function brush(pts, width, alpha, dry, color) {
    const bristles = Math.max(1, Math.round(width / 1.25)), last = pts.length - 1
    ctx.strokeStyle = rgb(color || ink)
    for (let b = 0; b < bristles; b++) {
      const off = bristles === 1 ? 0 : (b / (bristles - 1) - 0.5) * width
      ctx.globalAlpha = alpha * rand(0.4, 1)
      ctx.lineWidth = rand(0.6, 1.5)
      ctx.beginPath()
      let pen = false
      for (let i = 0; i <= last; i++) {
        if (R() < dry) { pen = false; continue }
        const p = pts[i], a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, last)]
        const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy) || 1
        const taper = Math.pow(Math.sin(Math.PI * Math.min(1, (i / (last || 1)) * 0.9 + 0.1)), 0.6)
        const x = p[0] - (dy / len) * off * taper + rand(-0.4, 0.4), y = p[1] + (dx / len) * off * taper + rand(-0.4, 0.4)
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true }
      }
      ctx.stroke()
    }
  }
  const line = (x0, y0, x1, y1, steps, bend) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, k = Math.sin(Math.PI * t) * (bend || 0)
    return [x0 + (x1 - x0) * t - (y1 - y0) * k, y0 + (y1 - y0) * t + (x1 - x0) * k]
  })

  function pine(x, y, s) {
    brush(line(x, y, x + rand(-2, 2), y - s, 4, rand(-0.08, 0.08)), 1.8, 0.4, 0.1)
    for (let k = 0; k < 4; k++) {
      const yy = y - s * (0.35 + k * 0.2), w = s * (0.55 - k * 0.1)
      brush(line(x - w, yy + rand(0, 2), x + w, yy + rand(0, 2), 4, -0.12), 3.2, 0.36, 0.25)
    }
  }

  // A range of mountains: a wash that fades into mist below, the ridge line, and texture strokes down the slopes.
  function range(o) {
    const n = noise(o.seed), pts = [], x0 = -PAD - 24, x1 = W + PAD + 24
    for (let x = x0; x <= x1; x += 4) {
      let h = fbm(n, (x / 620) * o.freq + 3, 4)
      if (o.steep) h = Math.pow(h, o.steep) * 1.9
      pts.push([x, o.y - h * o.amp])
    }
    const top = Math.min(...pts.map(p => p[1])), g = ctx.createLinearGradient(0, top, 0, o.y + o.fade)
    g.addColorStop(0, rgb(ink, o.wash)); g.addColorStop(0.55, rgb(ink, o.wash * 0.45)); g.addColorStop(1, rgb(ink, 0))
    ctx.globalAlpha = 1; ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(pts[0][0], o.y + o.fade)
    pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], o.y + o.fade); ctx.closePath(); ctx.fill()
    for (let i = 0; i < pts.length - 1; i += 30) brush(pts.slice(i, i + rand(30, 42) | 0), o.line * rand(0.7, 1.25), o.ink * 1.5, 0.22)
    const foot = o.y + o.fade * 0.45
    for (let i = 2; i < pts.length - 2; i++) {
      const p = pts[i], slope = (pts[i + 2][1] - pts[i - 2][1]) / 16, height = Math.max(10, foot - p[1])
      const lean = Math.max(-0.8, Math.min(0.8, slope * 0.9))
      if (R() < o.hatch) { // long fibre strokes: the tone of the slope
        const len = Math.min(height, o.reach) * rand(0.3, 0.95), sway = lean * len * rand(0.25, 0.5), xs = p[0] + rand(-2, 2)
        brush(line(xs, p[1] + 2, xs + sway, p[1] + len, 9, rand(-0.06, 0.06) - lean * 0.08), rand(1.2, 3.2), o.ink * rand(0.3, 0.6), 0.3)
      }
      if (R() < o.hatch * 0.55) { // short dark strokes under the ridge
        const len = rand(8, 14 + o.amp * 0.12), xs = p[0] + rand(-3, 3), ys = p[1] + rand(1, 10)
        brush(line(xs, ys, xs + (lean + rand(-0.3, 0.3)) * len * 0.6, ys + len, 4, rand(-0.14, 0.14)), rand(1.4, 3), o.ink * rand(0.7, 1.1), 0.18)
      }
      if (R() < o.hatch * 0.22) for (let d = 0, m = 2 + Math.floor(R() * 4); d < m; d++) { // moss dots
        const x = p[0] + rand(-9, 9), y = p[1] + rand(-2, 7)
        brush([[x, y], [x + rand(1, 2.5), y + rand(1.5, 3)]], 2.4, o.ink * 1.3, 0)
      }
    }
    if (o.pines) for (let i = 6; i < pts.length - 6; i++) if (R() < o.pines) pine(pts[i][0], pts[i][1] + 2, rand(14, 26) * o.scale)
    return pts
  }

  function sky() {
    const r = Math.min(W, H) * 0.055, cx = PAD + W * 0.8, cy = H * 0.15, color = dark ? ink : seal
    for (let y = -r; y <= r; y += 1.5) { // the disc is filled the way a brush would: row by row
      const half = Math.sqrt(r * r - y * y)
      brush(line(cx - half + rand(0, 3), cy + y, cx + half - rand(0, 3), cy + y, 8, rand(-0.01, 0.01)), 2.4, dark ? 0.24 : 0.36, 0.16, color)
    }
    for (let k = 0; k < 6; k++) { // bands of cloud, some across the disc
      const y = H * rand(0.1, 0.42), x = PAD + rand(-0.1, 0.75) * W, len = W * rand(0.2, 0.45)
      brush(line(x, y, x + len, y + rand(-8, 8), 14, rand(-0.012, 0.012)), rand(7, 18), 0.1, 0.5)
    }
    for (let k = 0; k < 5; k++) { // birds, far off
      const x = cx - r * 2.6 - k * rand(16, 30), y = cy - r * 0.2 + rand(-26, 30), s = rand(5, 8)
      brush(line(x - s, y - s * 0.4, x, y, 3, 0.25), 1.4, 0.45, 0.05)
      brush(line(x, y, x + s, y - s * 0.5, 3, -0.25), 1.4, 0.45, 0.05)
    }
  }

  function pavilion(x, y, s) {
    brush(line(x - s, y, x + s, y, 5, 0), 2, 0.5, 0.08)
    brush(line(x - s * 1.25, y - s * 0.55, x, y - s * 1.05, 5, 0.16), 3, 0.55, 0.08)
    brush(line(x, y - s * 1.05, x + s * 1.25, y - s * 0.55, 5, 0.16), 3, 0.55, 0.08)
    brush(line(x - s * 1.25, y - s * 0.55, x + s * 1.25, y - s * 0.55, 6, 0), 1.8, 0.45, 0.1)
    for (const k of [-0.7, 0, 0.7]) brush(line(x + s * k, y - s * 0.55, x + s * k, y, 3, 0), 1.5, 0.45, 0.08)
  }

  function water(top) {
    const bottom = H
    for (let k = 0; k < 170; k++) {
      const t = Math.pow(R(), 0.8), y = top + (bottom - top) * t, len = rand(30, 130) * (0.5 + t), x = rand(-0.05, 1) * (W + 2 * PAD)
      brush(line(x, y, x + len, y + rand(-2, 2), 8, rand(-0.01, 0.01)), rand(1, 2.6), 0.08 + 0.12 * t, 0.3)
    }
    for (let side = 0; side < 2; side++) for (let k = 0; k < 22; k++) { // reeds
      const x = side ? PAD + W - rand(0, W * 0.14) : PAD + rand(0, W * 0.11), h = rand(30, 96)
      brush(line(x, bottom + 4, x + rand(-22, 22), bottom - h, 6, rand(-0.12, 0.12)), 1.5, 0.36, 0.08)
    }
  }

  // The boat lives on its own small canvas so it can rock without repainting anything.
  function paintBoat(top, dpr) {
    const s = Math.max(24, Math.min(42, W * 0.03)), bw = Math.ceil(s * 3), bh = Math.ceil(s * 1.6)
    boat.width = Math.round(bw * dpr); boat.height = Math.round(bh * dpr)
    boat.style.width = bw + 'px'; boat.style.height = bh + 'px'
    boat.style.left = Math.round(W * 0.12 - bw / 2) + 'px'
    boat.style.top = Math.round(top + (H - top) * 0.45 - bh * 0.78) + 'px'
    ctx = boat.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const bx = bw / 2, by = bh * 0.78
    brush(line(bx - s, by - 3, bx + s, by - 3, 8, -0.12), 5, 0.55, 0.06)
    brush(line(bx - s * 0.2, by - 4, bx - s * 0.2, by - s * 0.62, 3, 0), 2.4, 0.4, 0.05)
    brush(line(bx - s * 0.5, by - s * 0.62, bx + s * 0.1, by - s * 0.62, 3, -0.3), 2, 0.4, 0.05)
    brush(line(bx + s * 0.15, by - s * 0.9, bx + s * 1.1, by + s * 0.35, 6, 0), 1, 0.32, 0.05)
    brush(line(bx - s * 0.9, by + 2, bx + s * 0.9, by + 2, 6, 0.02), 1.4, 0.16, 0.4) // its shadow on the water
  }

  // Mist: soft bands of paper colour, wider than the window, so they can drift.
  function paintMist(canvas, y, spread, dpr) {
    const mw = Math.round(W * 1.6)
    canvas.width = Math.round(mw * dpr); canvas.height = Math.round(H * dpr)
    canvas.style.width = mw + 'px'; canvas.style.height = H + 'px'; canvas.style.left = -Math.round(W * 0.3) + 'px'
    ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (let k = 0; k < 9; k++) {
      const cx = rand(0, mw), cy = y + rand(-spread, spread), rx = rand(W * 0.18, W * 0.42), ry = rand(spread * 0.35, spread * 0.8)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      const a = dark ? rand(0.35, 0.6) : rand(0.5, 0.8)
      g.addColorStop(0, rgb(paper, a)); g.addColorStop(0.6, rgb(paper, a * 0.45)); g.addColorStop(1, rgb(paper, 0))
      ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry)
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }
  }

  function prep(canvas, dpr) {
    const w = W + 2 * PAD
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr)
    canvas.style.width = w + 'px'; canvas.style.height = H + 'px'; canvas.style.left = -PAD + 'px'
    ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.globalAlpha = 1
  }

  function paint() {
    const c = readColors({ paper: 'var(--ui-bg-chrome)', ink: 'var(--theme-foreground)', seal: 'var(--theme-midground)' })
    paper = c.paper; ink = c.ink; seal = c.seal
    dark = isDark()
    W = window.innerWidth; H = window.innerHeight; PAD = INK.parallax[3] + 4
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(6e6 / ((W + 2 * PAD) * H)))
    const k = dark ? 0.85 : 1
    R = rng(INK.seed)

    const [skyC, farC, mistA, midC, mistB, nearC] = layers
    prep(skyC, dpr); sky()
    prep(farC, dpr)
    range({ seed: 11, y: H * 0.56, amp: H * 0.15, freq: 0.9, wash: 0.05 * k, fade: H * 0.14, line: 3, ink: 0.14 * k, hatch: 0.1, reach: H * 0.035, scale: 0.6 })
    range({ seed: 23, y: H * 0.67, amp: H * 0.27, freq: 1.25, steep: 2.1, wash: 0.06 * k, fade: H * 0.15, line: 4, ink: 0.2 * k, hatch: 0.32, reach: H * 0.07, pines: 0.006, scale: 0.6 })
    paintMist(mistA, H * 0.66, H * 0.07, dpr)
    prep(midC, dpr)
    const mid = range({ seed: 37, y: H * 0.8, amp: H * 0.3, freq: 1.5, steep: 2.4, wash: 0.08 * k, fade: H * 0.15, line: 5, ink: 0.27 * k, hatch: 0.42, reach: H * 0.09, pines: 0.014, scale: 0.8 })
    const seat = mid.filter(p => p[0] > PAD + W * 0.1 && p[0] < PAD + W * 0.42).sort((a, b) => a[1] - b[1])[0]
    if (seat) pavilion(seat[0], seat[1] + 3, Math.max(10, Math.min(17, W * 0.012)))
    paintMist(mistB, H * 0.84, H * 0.05, dpr)
    prep(nearC, dpr)
    range({ seed: 51, y: H * 0.91, amp: H * 0.14, freq: 1.2, steep: 1.6, wash: 0.1 * k, fade: H * 0.08, line: 6, ink: 0.33 * k, hatch: 0.5, reach: H * 0.08, pines: 0.035, scale: 1 })
    const top = H * 0.92
    water(top)
    paintBoat(top, dpr)
    ctx = null
    root.classList.add('on')
    place()
  }

  // Parallax: ease towards the pointer, and stop the loop once settled.
  let pointer = 0, target = 0, raf = 0
  const place = () => {
    layers.forEach((c, i) => { c.style.transform = `translate3d(${(pointer * INK.parallax[depthOf[i]]).toFixed(2)}px,0,0)` })
    boat.style.translate = `${(pointer * INK.parallax[3]).toFixed(2)}px 0`
  }
  const step = () => {
    pointer += (target - pointer) * 0.08
    place()
    raf = Math.abs(target - pointer) > 0.002 ? requestAnimationFrame(step) : 0
  }
  const onPointer = e => {
    if (motion.matches) return
    target = -(e.clientX / window.innerWidth - 0.5) * 2
    raf ||= requestAnimationFrame(step)
  }

  let timer = 0
  const onResize = () => { clearTimeout(timer); timer = setTimeout(paint, 200) }
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', onPointer, { passive: true })
  paint()

  return {
    refresh: paint,
    destroy() {
      cancelAnimationFrame(raf); clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      root.remove()
    }
  }
}

/* ══ Cangfeng: the dithered karst lake ════════════════════════════════════ */

const LAKE = {
  cell: 3, // CSS px per dither cell
  fps: 20,
  horizon: 0.2,
  parallax: 0.012,
  rainEvery: 150, // seconds per rain cycle (about half of it wet)
  starGrid: 22,
  stars: 0.2
}

const f = n => Number(n).toFixed(5)

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPointer;
uniform float uNight;
uniform vec3 uPaper;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uInk;
uniform vec3 uHot;
uniform vec3 uAccent;

const float HORIZON = ${f(LAKE.horizon)};

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 g = fract(p);
  vec2 u = g * g * g * (g * (g * 6.0 - 15.0) + 10.0);
  float a0 = 6.2831853 * hash(i);
  float a1 = 6.2831853 * hash(i + vec2(1.0, 0.0));
  float a2 = 6.2831853 * hash(i + vec2(0.0, 1.0));
  float a3 = 6.2831853 * hash(i + vec2(1.0, 1.0));
  float n0 = dot(vec2(cos(a0), sin(a0)), g);
  float n1 = dot(vec2(cos(a1), sin(a1)), g - vec2(1.0, 0.0));
  float n2 = dot(vec2(cos(a2), sin(a2)), g - vec2(0.0, 1.0));
  float n3 = dot(vec2(cos(a3), sin(a3)), g - vec2(1.0, 1.0));
  return 1.4142 * mix(mix(n0, n1, u.x), mix(n2, n3, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7);
    amp *= 0.5;
  }
  return clamp(0.5 + 0.5 * sum / 0.9375, 0.0, 1.0);
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer8(vec2 a) {
  return bayer2(a * 0.25) * 0.0625 + bayer2(a * 0.5) * 0.25 + bayer2(a);
}

// Karst skyline in about [0, 1]: rounded limestone towers with steep sides,
// one per cell of width 'spacing', over a low rolling base.
float karst(float x, float seed, float spacing) {
  float c0 = floor(x / spacing);
  float h = 0.16 + 0.08 * noise(vec2(x * 2.0, seed + 5.0));
  for (int i = -2; i <= 2; i++) {
    float c = c0 + float(i);
    float cx = (c + 0.5 + (hash(vec2(c, seed)) - 0.5) * 0.7) * spacing;
    float w = spacing * (0.32 + 0.45 * hash(vec2(c, seed + 1.7)));
    float a = 0.35 + 0.65 * hash(vec2(c, seed + 4.1));
    float d = abs(x - cx) / w;
    if (d < 1.0) {
      h = max(h, a * pow(1.0 - pow(d, 2.4), 0.5));
    }
  }
  return h + 0.025 * noise(vec2(x * 14.0, seed + 9.0));
}

float layerX(vec2 p, float depth) {
  return p.x + uPointer * ${f(LAKE.parallax)} * (0.4 + 2.0 * depth);
}

// A five-storey pagoda on a stepped plinth, after the brick and timber towers
// of the Song: each storey narrower and lower than the one below, eaves that
// sag in the middle and sweep up at the corners, a ringed spire with a pearl.
// q is in pagoda units (y up, origin at the middle of the plinth top). Returns
// 1 inside; part is 0 wall, 1 roof, 2 opening (door or window), 3 spire,
// 4 plinth, 5 rock; rim is 1 on the upper edge of a roof (it catches the light).
float pagoda(vec2 q, out float part, out float rim) {
  part = 0.0;
  rim = 0.0;
  float ax0 = abs(q.x);
  if (ax0 > 4.6 || q.y < -2.5 || q.y > 13.5) {
    return 0.0;
  }
  // a stone plinth, and below it the rock it is built on, widening into the hill
  if (q.y < 0.0) {
    part = q.y < -0.45 ? 5.0 : 4.0;
    return ax0 < (q.y < -0.45 ? 2.9 + (-q.y - 0.45) * 1.4 : 2.75) ? 1.0 : 0.0;
  }
  float y = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float h = 2.05 - 0.17 * fi;    // storey height, wall plus roof
    float w = 2.25 - 0.33 * fi;    // wall half width
    float ew = w + 1.25 - 0.06 * fi; // eave half width
    float wallTop = y + h - 0.8;
    // roof: thick at the ridge, thin at the corners, which turn up
    float ax = ax0 / ew;
    if (ax < 1.0) {
      float under = wallTop - 0.05 + 0.6 * pow(ax, 5.0);
      float over = wallTop + 0.72 - 0.45 * ax + 0.85 * pow(ax, 9.0);
      if (q.y > under && q.y < over) {
        part = 1.0;
        rim = q.y > over - 0.28 ? 1.0 : 0.0;
        return 1.0;
      }
    }
    if (q.y >= y && q.y < wallTop && ax0 < w) {
      float ty = q.y - y;
      if (i == 0) {
        // an arched door
        float d = ax0 / 0.6;
        if (d < 1.0 && ty < 0.75 + 0.4 * sqrt(1.0 - d * d)) {
          part = 2.0;
        }
      } else if (ax0 < 0.32 && ty > 0.3 && ty < 0.85) {
        part = 2.0; // one window per storey
      } else if (ax0 > w - 0.3) {
        part = 0.0; // corner posts read as the wall edge
      }
      return 1.0;
    }
    y += h;
  }
  // spire: a mast through stacked rings, then a pearl
  float sy = q.y - y + 0.2;
  if (sy > 0.0 && sy < 2.6) {
    float ring = fract(sy / 0.5) < 0.4 ? 0.48 - sy * 0.08 : 0.18;
    part = 3.0;
    return ax0 < ring ? 1.0 : 0.0;
  }
  if (length(vec2(q.x, sy - 2.95)) < 0.34) {
    part = 3.0;
    return 1.0;
  }
  return 0.0;
}

// Everything above the water. ground is 1 on land, acc is the accent ink.
float scene(vec2 uv, float t, float rain, out float ground, out float acc) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  ground = 0.0;
  acc = 0.0;

  // sky: a faint glow above the far shore, slow bands of cloud
  float tone = mix(0.0, 0.16, uNight) * smoothstep(0.75, HORIZON, p.y);
  float cloud = fbm(vec2(p.x * 1.3 - t * 0.006, p.y * 7.0));
  float band = smoothstep(0.58, 0.72, cloud) * smoothstep(0.42, 0.62, p.y) * smoothstep(0.98, 0.8, p.y);
  tone = max(tone, band * mix(0.14, 0.22, uNight) * (1.0 - 0.5 * rain));

  // sun by day (cinnabar), moon by night (pale, with a halo)
  vec2 orb = p - vec2(-0.3 * aspect, 0.8); // high on the left, clear of the wordmark
  float r = length(orb);
  if (uNight < 0.5) {
    if (r < 0.042) {
      acc = 1.0 - 0.5 * rain;
    }
  } else {
    tone = max(tone, 0.32 * exp(-(r - 0.036) * 24.0) * step(0.036, r) * (1.0 - 0.6 * rain));
    if (r < 0.036) {
      tone = max(tone, 1.0 - 0.35 * rain);
    }
  }

  // three ranges of karst, far to near; tones are (crest, foot) for day and night
  float x0 = layerX(p, 0.0);
  float top0 = HORIZON + 0.5 * karst(x0 * 2.2 + 11.0, 11.0, 0.55);
  if (p.y < top0) {
    float k = smoothstep(top0, HORIZON, p.y);
    tone = mix(mix(0.3, 0.42, uNight), mix(0.1, 0.24, uNight), k);
    ground = 1.0;
  }

  float x1 = layerX(p, 0.5);
  float top1 = HORIZON + 0.36 * karst(x1 * 2.8 + 23.0, 23.0, 0.5);
  if (p.y < top1) {
    float k = smoothstep(top1, HORIZON, p.y);
    tone = mix(mix(0.55, 0.26, uNight), mix(0.22, 0.14, uNight), k);
    ground = 1.0;
  }

  // the pagoda stands on the middle range, on the right, in that range's own (parallax) coordinates
  // on the highest crest of that range right of centre. The search range is in
  // scene units (heights), not a share of the width, so resizing the window or
  // opening a side pane never moves it to another peak.
  float px = 0.45;
  float crest = 0.0;
  for (int i = 0; i < 24; i++) {
    float cx = 0.25 + 0.45 * float(i) / 23.0;
    float k = karst(cx * 2.8 + 23.0, 23.0, 0.5);
    if (k > crest) {
      crest = k;
      px = cx;
    }
  }
  float base = HORIZON + 0.36 * crest - 0.012;
  float part;
  float rim;
  if (pagoda(vec2(x1 - px, p.y - base) / 0.019, part, rim) > 0.5) {
    ground = 1.0;
    float shade = x1 > px ? 1.0 : 0.0; // the side away from the sun and moon (right)
    if (uNight < 0.5) {
      // cinnabar walls (dithered darker on the shaded side), dark tiled roofs
      tone = part == 1.0 ? (rim > 0.5 ? 0.7 : 1.0) : part == 2.0 ? 1.0 : part == 3.0 ? 0.85 : part == 4.0 ? 0.75 : part == 5.0 ? 0.55 : 0.85;
      acc = part == 0.0 ? (shade > 0.5 ? 0.8 : 1.0) : 0.0;
    } else {
      // a dim shape against the night sky, moonlit roof edges and lamps in the windows
      tone = part == 1.0 ? (rim > 0.5 && shade < 0.5 ? 0.62 : 0.32) : part == 3.0 ? 0.32 : part == 4.0 ? 0.22 : part == 5.0 ? 0.26 : (shade > 0.5 ? 0.16 : 0.22);
      acc = part == 2.0 ? 1.0 : 0.0;
    }
  }

  float x2 = layerX(p, 1.0);
  float top2 = HORIZON + 0.2 * karst(x2 * 3.6 + 37.0, 37.0, 0.42);
  if (p.y < top2) {
    float k = smoothstep(top2, HORIZON, p.y);
    tone = mix(mix(0.85, 0.12, uNight), mix(0.42, 0.06, uNight), k);
    acc = 0.0;
    ground = 1.0;
  }

  // mist: two drifting bands, at the feet of the near and middle ranges
  float fog = fbm(vec2(p.x * 1.1 - t * 0.012, p.y * 4.0 + 3.0));
  float mist = exp(-pow((p.y - HORIZON - 0.05) / 0.05, 2.0)) + 0.7 * exp(-pow((p.y - HORIZON - 0.19) / 0.045, 2.0));
  float m = clamp(mist * smoothstep(0.32, 0.7, fog), 0.0, 1.0) * (0.75 + 0.25 * rain);
  tone = mix(tone, mix(0.04, 0.2, uNight), m);
  acc *= 1.0 - m;

  return tone;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / uRes;
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  // rain comes and goes: about half of each cycle is wet
  float phase = fract(t / ${f(LAKE.rainEvery)});
  float rain = smoothstep(0.05, 0.15, phase) * smoothstep(0.6, 0.5, phase);

  float ground;
  float acc;
  float tone;

  if (uv.y < HORIZON) {
    // The lake: the scene upside down and squashed, pushed sideways by ripples.
    float depth = (HORIZON - uv.y) / HORIZON;
    float ripple = sin(cell.y * 0.9 + t * 1.2) * 0.0016 + noise(vec2(uv.y * 70.0, t * 0.3)) * (0.005 + 0.004 * rain);
    tone = scene(vec2(uv.x + ripple * (0.3 + depth), HORIZON + (HORIZON - uv.y) * 1.6), t, rain, ground, acc);
    tone *= mix(0.9, 0.45, depth) * (mod(cell.y, 2.0) < 1.0 ? 1.0 : 0.6);
    acc *= mod(cell.y, 2.0) < 1.0 ? 0.8 : 0.0;
    ground = 1.0;

    // the boat, drifting slowly along the near water; a lantern at the stern
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
    float bx = -0.32 * aspect + 0.06 * sin(t * 0.02);
    vec2 q = (p - vec2(bx, HORIZON * 0.42 + 0.003 * sin(t * 0.9))) / 0.006;
    float hull = (abs(q.x) < 7.0 - 1.5 * clamp(-q.y, 0.0, 2.0) && q.y < 0.6 && q.y > -1.6) ? 1.0 : 0.0;
    float man = (abs(q.x + 1.5) < 0.7 && q.y > 0.5 && q.y < 3.6) ? 1.0 : 0.0;
    float hat = (abs(q.x + 1.5) < 1.9 - (q.y - 3.6) * 1.9 && q.y >= 3.6 && q.y < 4.6) ? 1.0 : 0.0;
    float pole = (abs(q.x - 1.2 - (q.y - 0.6) * 0.55) < 0.35 && q.y > 0.6 && q.y < 6.5) ? 1.0 : 0.0;
    if (hull + man + hat + pole > 0.5) {
      tone = mix(0.85, 0.02, uNight);
      acc = 0.0;
    }
    float lantern = length(q - vec2(5.6, 1.6));
    if (uNight > 0.5) {
      acc = max(acc, lantern < 0.9 ? 1.0 : 0.6 * exp(-(lantern - 0.9) * 2.2));
    } else if (lantern < 0.8) {
      acc = 1.0;
    }
  } else {
    tone = scene(uv, t, rain, ground, acc);
  }

  // rain: one-cell slanted streaks in lanes, a step darker (or lighter) than what is behind
  float u = cell.x + cell.y * 0.35;
  float lane = floor(u / 6.0);
  if (rain > 0.0 && mod(u, 6.0) < 1.0 && hash(vec2(lane, 4.2)) < 0.55 * rain) {
    float len = 34.0 + 40.0 * hash(vec2(lane, 8.1));
    float head = mod(cell.y + t * (55.0 + 25.0 * hash(vec2(lane, 2.3))) + hash(vec2(lane, 6.6)) * 300.0, len);
    if (head < 4.0) {
      tone = clamp(tone + 0.22, 0.0, 1.0);
    }
  }

  tone = clamp(tone, 0.0, 1.0);
  tone = floor(tone * 64.0 + 0.5) / 64.0;
  float threshold = bayer8(cell) + 0.5 / 64.0;
  float scaled = tone * 4.0;
  float index = floor(scaled);
  index = min(index + step(threshold, scaled - index), 4.0);

  // sparse twinkling stars by night, in the empty sky
  vec2 block = floor(cell / ${f(LAKE.starGrid)});
  float h = hash(block + vec2(17.0, 31.0));
  vec2 spot = floor(vec2(hash(block + vec2(1.3, 5.7)), hash(block + vec2(9.1, 2.9))) * ${f(LAKE.starGrid)});
  if (uNight > 0.5 && rain < 0.3 && ground < 0.5 && index < 0.5 && uv.y > 0.45 && h < ${f(LAKE.stars)} && all(equal(cell - block * ${f(LAKE.starGrid)}, spot))) {
    float s = hash(block + vec2(4.2, 8.4));
    if (sin(t * (0.4 + s * 1.4) + s * 40.0) > -0.35) {
      index = 3.0;
    }
  }

  vec3 color = index < 0.5 ? uPaper : index < 1.5 ? uTint1 : index < 2.5 ? uTint2 : index < 3.5 ? uInk : uHot;
  if (acc > threshold) {
    color = uAccent;
  }
  gl_FragColor = vec4(color, 1.0);
}
`

const VERTEX = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// Jade inks mixed into the theme's paper; the accent (sun, pagoda, lantern) is the theme's midground.
const UNIFORMS = ['uPaper', 'uTint1', 'uTint2', 'uInk', 'uHot', 'uAccent']
const lakePalette = dark => dark
  ? {
      uPaper: 'var(--ui-bg-chrome)',
      uTint1: 'color-mix(in oklch, #2c4d50 45%, var(--ui-bg-chrome))',
      uTint2: 'color-mix(in oklch, #3d605d 75%, var(--ui-bg-chrome))',
      uInk: '#6a8c84',
      uHot: '#cfe0d6',
      uAccent: 'var(--theme-midground)'
    }
  : {
      uPaper: 'var(--ui-bg-chrome)',
      uTint1: 'color-mix(in oklch, #7f988f 35%, var(--ui-bg-chrome))',
      uTint2: 'color-mix(in oklch, #5f7b72 60%, var(--ui-bg-chrome))',
      uInk: 'color-mix(in oklch, #43605a 85%, var(--ui-bg-chrome))',
      uHot: 'color-mix(in oklch, #2a3c38 80%, var(--theme-foreground))',
      uAccent: 'var(--theme-midground)'
    }

function readLakePalette() {
  const bytes = readColors(lakePalette(isDark()))
  return Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, v.map(n => n / 255)]))
}

function createLakeStage() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;image-rendering:crisp-edges;'

  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false
  })
  const { root, art } = mountStage('cangfeng')
  if (!gl) {
    return { refresh() {}, destroy() { root.remove() } } // no WebGL: plain paper, which is still the theme
  }
  art.append(canvas)

  let program = null
  let locations = {}
  let palette = readLakePalette()
  let raf = 0
  let last = 0
  const start = performance.now()
  let lost = false
  let pointer = 0
  let pointerTarget = 0
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(`[${PLUGIN.id}] lake shader:`, gl.getShaderInfoLog(shader))
      return null
    }
    return shader
  }

  const build = () => {
    const vs = compile(gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT)
    if (!vs || !fs) { program = null; return }
    program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(`[${PLUGIN.id}] lake program:`, gl.getProgramInfoLog(program))
      program = null
      return
    }
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    locations = Object.fromEntries(['uRes', 'uTime', 'uPointer', 'uNight', ...UNIFORMS].map(n => [n, gl.getUniformLocation(program, n)]))
  }

  const draw = now => {
    if (!program || lost) return
    // reduced motion holds one dry moment
    const t = motion.matches ? 120 : (now - start) / 1000 + (window.__jianghuTime || 0)
    pointer += (pointerTarget - pointer) * 0.08
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(locations.uRes, canvas.width, canvas.height)
    gl.uniform1f(locations.uTime, t)
    gl.uniform1f(locations.uPointer, pointer)
    gl.uniform1f(locations.uNight, isDark() ? 1 : 0)
    for (const key of UNIFORMS) gl.uniform3fv(locations[key], palette[key])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    const snapped = Math.max(1, Math.round(LAKE.cell * dpr)) / dpr
    const columns = Math.max(1, Math.ceil(window.innerWidth / snapped))
    const rows = Math.max(1, Math.ceil(window.innerHeight / snapped))
    canvas.width = columns
    canvas.height = rows
    canvas.style.width = `${columns * snapped}px`
    canvas.style.height = `${rows * snapped}px`
    draw(performance.now())
  }

  const tick = now => {
    raf = requestAnimationFrame(tick)
    if (now - last >= 1000 / LAKE.fps - 2) { last = now; draw(now) }
  }

  const play = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (!motion.matches && !document.hidden) raf = requestAnimationFrame(tick)
    else draw(performance.now())
  }

  const onPointer = e => { pointerTarget = e.clientX / window.innerWidth - 0.5 }
  const onLost = e => { e.preventDefault(); lost = true; cancelAnimationFrame(raf) }
  const onRestored = () => { lost = false; build(); resize(); play() }

  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.addEventListener('visibilitychange', play)
  motion.addEventListener('change', play)

  build()
  resize()
  play()

  return {
    refresh() { palette = readLakePalette(); draw(performance.now()) },
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', play)
      motion.removeEventListener('change', play)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      root.remove()
    }
  }
}

/* ── Mount the right scene while one of our themes is active ─────────────── */

const STAGES = { feisheng: createInkStage, cangfeng: createLakeStage }

function backdrop() {
  const root = document.documentElement
  let stage = null
  let current = ''
  let pending = 0
  let refreshTimer = 0

  const sync = () => {
    pending = 0
    const theme = root.dataset.hermesTheme ?? ''
    const name = Object.keys(STAGES).find(n => theme.startsWith(n)) ?? ''

    if (name !== current) {
      stage?.destroy()
      stage = name ? STAGES[name]() : null
      current = name
    } else if (stage) {
      // Mode or accent changed. The ink scroll repaints, so let bursts of writes settle first.
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => stage?.refresh(), current === 'feisheng' ? 120 : 0)
    }
  }

  const observer = new MutationObserver(() => { pending ||= requestAnimationFrame(sync) })
  observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme', 'class', 'style'] })
  sync()

  return () => {
    observer.disconnect()
    cancelAnimationFrame(pending)
    clearTimeout(refreshTimer)
    stage?.destroy()
    stage = null
  }
}

/* ── CSS ─────────────────────────────────────────────────────────────────── */

// Shared by both themes: the window goes clear so the scene shows, the scene
// fades back once there is text to read, and the chrome gets a quieter edge.
const baseCSS = (name, { dim, marker, sidebarMix, radius }) => {
  const T = sel(name)
  return `
${T} {
  --jh-rule: color-mix(in srgb, var(--theme-foreground) 16%, transparent);
  --jh-dim: color-mix(in srgb, var(--theme-foreground) 60%, transparent);
  background-color: var(--ui-bg-chrome) !important;
  --ui-chat-surface-background: transparent;
  --ui-sidebar-surface-background: transparent;
  --ui-editor-surface-background: transparent;
  --ui-terminal-surface-background: var(--ui-bg-chrome);
}

${T} body { background: transparent !important; }

${T} [data-contrib-shell],
${T} [data-slot='sidebar-wrapper'] { background-color: transparent !important; }

${T} [data-glass-opaque],
${T} [data-glass-raised] {
  --ui-chat-surface-background: var(--ui-bg-chrome);
  --ui-editor-surface-background: var(--ui-bg-chrome);
  --ui-sidebar-surface-background: var(--ui-bg-sidebar);
}

/* Full strength on an empty chat only; behind text it steps back. */
${T} [data-jianghu-scene] .jh-art {
  opacity: ${dim};
  transition: opacity 700ms ease;
}
${T}:has([data-slot="aui_intro"]) [data-jianghu-scene] .jh-art { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  ${T} [data-jianghu-scene], ${T} [data-jianghu-scene] * { transition: none; animation: none !important; }
}

${T} [data-slot="sidebar"] {
  position: relative;
  border-right: 1px solid var(--jh-rule) !important;
  background-color: color-mix(in srgb, var(--ui-bg-chrome) ${sidebarMix}%, transparent) !important;
}

${T} [data-sash-overlap] { opacity: 0; }

/* Tabs: small caps; the active one carries a mark. */
${T} [data-slot="pane-tab"],
${T} [data-tree-tab] {
  letter-spacing: 0.06em;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: ${radius}px !important;
}
${T} [data-slot="pane-tab"][data-active="true"],
${T} [data-tree-tab][data-active="true"] {
  color: var(--theme-foreground);
  background-color: color-mix(in srgb, var(--theme-foreground) 7%, transparent) !important;
}
${T} [data-slot="pane-tab"][data-active="true"]::before,
${T} [data-tree-tab][data-active="true"]::before {
  content: '';
  flex: none;
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-inline-end: 7px;
  background: ${marker};
}
${T} [data-slot="pane-tab"][data-active="true"]::after,
${T} [data-tree-tab][data-active="true"]::after { display: none !important; }
${T} [data-slot="pane-tab"][data-active="false"] { color: var(--jh-dim); }

/* Composer: a solid card over the landscape. */
${T} [data-slot="composer-surface"] {
  background: var(--ui-bg-editor) !important;
  border: 1px solid var(--jh-rule) !important;
  border-radius: ${radius + 3}px !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-bg-chrome) 65%, transparent) !important;
}
${T} [data-slot="composer-surface"]:focus-within {
  border-color: color-mix(in srgb, var(--theme-midground) 60%, transparent) !important;
}
${T} [data-slot="composer-surface"] button[data-variant="default"] {
  background: var(--theme-midground) !important;
  color: var(--dt-midground-foreground) !important;
  border-radius: ${radius}px !important;
}
${T} [data-slot="kbd"] {
  background: transparent !important;
  border: 1px solid var(--jh-rule) !important;
  border-radius: 2px !important;
  color: var(--jh-dim) !important;
}

/* The stock HERMES AGENT wordmark stays as it is. In light mode its
   plus-lighter blend turns the letters into near-white over paper, so there
   it is drawn as plain ink in the theme's accent instead. */
${T}:not(.dark) .wordmark {
  mix-blend-mode: normal !important;
}
${T}:not(.dark) .wordmark > span:not([aria-hidden]) > span {
  color: var(--theme-midground);
}
`
}

const FEISHENG_CSS = `${baseCSS('feisheng', {
  dim: 0.32,
  // a small cinnabar seal
  marker: 'var(--theme-midground); border-radius: 1px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dt-midground-foreground) 45%, transparent)',
  sidebarMix: 82,
  radius: 3
})}
${sel('feisheng')} [data-jianghu-scene] canvas { transition: opacity 600ms ease; }
${sel('feisheng')} [data-jianghu-scene]:not(.on) canvas { opacity: 0; }
${sel('feisheng')} [data-jianghu-scene] .jh-mist-a { animation: jh-drift 140s ease-in-out infinite alternate; }
${sel('feisheng')} [data-jianghu-scene] .jh-mist-b { animation: jh-drift 100s ease-in-out -40s infinite alternate-reverse; }
${sel('feisheng')} [data-jianghu-scene] .jh-boat { animation: jh-rock 7s ease-in-out infinite; transform-origin: 50% 80%; }
@keyframes jh-drift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(22vw, 0, 0); } }
@keyframes jh-rock { 0%, 100% { transform: translateY(0) rotate(-0.6deg); } 50% { transform: translateY(1.5px) rotate(0.6deg); } }
`

const checker = color => `repeating-conic-gradient(${color} 0 25%, transparent 0 50%) 0 0 / 2px 2px`

const CANGFENG_CSS = `${baseCSS('cangfeng', {
  dim: 0.26,
  marker: checker('var(--theme-midground)'),
  sidebarMix: 78,
  radius: 2
})}
${sel('cangfeng')} [data-slot="pane-tab"],
${sel('cangfeng')} [data-tree-tab] {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  text-transform: uppercase;
}
`

/* ── The themes ──────────────────────────────────────────────────────────── */

const terminal = (fg, cursor, sel) => ({
  foreground: fg,
  cursor,
  selectionBackground: sel,
  black: '#1b1a17', red: '#b3271e', green: '#3b7a3a', yellow: '#9a6a12', blue: '#2d4f72', magenta: '#8a3a6a', cyan: '#2f6a5a', white: '#6f6a5e',
  brightBlack: '#555048', brightRed: '#c8402f', brightGreen: '#4d8f4a', brightYellow: '#b07d1c', brightBlue: '#3d6390', brightMagenta: '#a04d80', brightCyan: '#3c8270', brightWhite: '#1b1a17'
})
const darkTerminal = (fg, cursor, sel) => ({
  foreground: fg,
  cursor,
  selectionBackground: sel,
  black: '#0d0e0f', red: '#e0705f', green: '#8cc48a', yellow: '#d9b76a', blue: '#7fa6d4', magenta: '#d48fb8', cyan: '#7db8a3', white: '#c9c5ba',
  brightBlack: '#5a5d5e', brightRed: '#f08a78', brightGreen: '#a6d8a3', brightYellow: '#e8cb88', brightBlue: '#9dbde3', brightMagenta: '#e3a9cb', brightCyan: '#9acdb9', brightWhite: '#ffffff'
})

const FEISHENG = {
  name: 'feisheng',
  label: 'Feisheng',
  description: 'An ink-wash mountain scroll: brush strokes on rice paper by day, on an ink stone by night, with drifting mist',
  colors: {
    background: '#efe8d6', foreground: '#221d16',
    card: '#f8f3e5', cardForeground: '#221d16',
    muted: '#e7dfca', mutedForeground: '#6a604c',
    popover: '#f8f3e5', popoverForeground: '#221d16',
    primary: '#a82f27', primaryForeground: '#fbf1de',
    secondary: '#e7dfca', secondaryForeground: '#221d16',
    accent: '#e2d8bf', accentForeground: '#221d16',
    border: '#d4c8aa', input: '#c9bc9b', ring: '#a82f27',
    midground: '#a82f27', midgroundForeground: '#fbf1de', composerRing: '#a82f27',
    destructive: '#b3271e', destructiveForeground: '#fbf1de',
    sidebarBackground: '#efe8d6', sidebarBorder: '#d4c8aa',
    userBubble: '#e7dfca', userBubbleBorder: '#d4c8aa'
  },
  darkColors: {
    background: '#121314', foreground: '#e6e3da',
    card: '#1a1c1d', cardForeground: '#e6e3da',
    muted: '#232627', mutedForeground: '#9f9d93',
    popover: '#1a1c1d', popoverForeground: '#e6e3da',
    primary: '#d0513f', primaryForeground: '#fbf1de',
    secondary: '#232627', secondaryForeground: '#e6e3da',
    accent: '#26292a', accentForeground: '#e6e3da',
    border: '#2f3334', input: '#3a3f40', ring: '#d0513f',
    midground: '#d0513f', midgroundForeground: '#fbf1de', composerRing: '#d0513f',
    destructive: '#e5604d', destructiveForeground: '#140806',
    sidebarBackground: '#121314', sidebarBorder: '#2a2e2f',
    userBubble: '#1d2021', userBubbleBorder: '#2f3334'
  },
  terminal: terminal('#221d16', '#a82f27', '#a82f2733'),
  darkTerminal: darkTerminal('#e6e3da', '#d0513f', '#d0513f40'),
  customCSS: FEISHENG_CSS
}

const CANGFENG = {
  name: 'cangfeng',
  label: 'Cangfeng Lake',
  description: 'A dithered karst lake: jade peaks in mist, a pagoda and a boat, rain that comes and goes, a cinnabar sun by day and a moon by night',
  colors: {
    background: '#e3e8e0', foreground: '#202221',
    card: '#eef2ea', cardForeground: '#202221',
    muted: '#d9dfd5', mutedForeground: '#5c625b',
    popover: '#eef2ea', popoverForeground: '#202221',
    primary: '#b5372d', primaryForeground: '#f6f1ea',
    secondary: '#d9dfd5', secondaryForeground: '#202221',
    accent: '#d3dbd0', accentForeground: '#202221',
    border: '#c6cfc3', input: '#bac4b6', ring: '#b5372d',
    midground: '#b5372d', midgroundForeground: '#f6f1ea', composerRing: '#b5372d',
    destructive: '#b5372d', destructiveForeground: '#f6f1ea',
    sidebarBackground: '#e3e8e0', sidebarBorder: '#ccd4c9',
    userBubble: '#d9dfd5', userBubbleBorder: '#c6cfc3'
  },
  darkColors: {
    background: '#08111a', foreground: '#e2eae5',
    card: '#0f1a23', cardForeground: '#e2eae5',
    muted: '#13202a', mutedForeground: '#8ea39e',
    popover: '#0f1a23', popoverForeground: '#e2eae5',
    primary: '#ef835e', primaryForeground: '#1a0b05',
    secondary: '#13202a', secondaryForeground: '#e2eae5',
    accent: '#17252f', accentForeground: '#e2eae5',
    border: '#1d2c36', input: '#263842', ring: '#ef835e',
    midground: '#ef835e', midgroundForeground: '#1a0b05', composerRing: '#ef835e',
    destructive: '#ff7a6b', destructiveForeground: '#1a0605',
    sidebarBackground: '#08111a', sidebarBorder: '#1a2832',
    userBubble: '#111d26', userBubbleBorder: '#22323d'
  },
  terminal: terminal('#202221', '#b5372d', '#b5372d33'),
  darkTerminal: darkTerminal('#e2eae5', '#ef835e', '#ef835e40'),
  customCSS: CANGFENG_CSS
}

export default {
  id: PLUGIN.id,
  name: PLUGIN.name,
  register(ctx) {
    ctx.register({ id: 'feisheng', area: THEMES_AREA, data: FEISHENG })
    ctx.register({ id: 'cangfeng', area: THEMES_AREA, data: CANGFENG })
    ctx.onDispose(backdrop())
  }
}
