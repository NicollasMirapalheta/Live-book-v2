// Textures drawn at runtime on canvases: gold tooling masks, page-edge paper, edge wear, sample photos.
import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function texture(c: HTMLCanvasElement, color: boolean): Texture {
  const t = new CanvasTexture(c)
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Normal map from a height mask (white = raised), via Sobel on the canvas pixels.
 * Gold tooling is pressed into the leather: the foil sits slightly below the surface (strength < 0).
 */
export function normalFromMask(mask: HTMLCanvasElement, strength = -2.0): Texture {
  const w = mask.width
  const h = mask.height
  const src = mask.getContext('2d')!.getImageData(0, 0, w, h).data
  const { c, ctx } = canvas(w, h)
  const out = ctx.createImageData(w, h)
  const H = (x: number, y: number) => src[((Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) << 2) + 3] / 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * w + x) << 2
      out.data[i] = Math.round((-dx / len) * 127 + 128)
      out.data[i + 1] = Math.round((dy / len) * 127 + 128)
      out.data[i + 2] = Math.round((1 / len) * 127 + 128)
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  return texture(c, false)
}

/** Spine tooling: title running bottom-to-top between raised bands and fillets (alpha = gold). */
export function spineFoilMask(title: string, spineWidthM: number, heightM: number): HTMLCanvasElement {
  const pxPerM = 4000
  const w = Math.max(64, Math.round(spineWidthM * pxPerM))
  const h = Math.round(heightM * pxPerM)
  const { c, ctx } = canvas(w, h)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  // raised bands (nervos) with fillets, typical of leather bindings
  const bands = [0.1, 0.27, 0.73, 0.9]
  for (const f of bands) {
    const y = h * f
    ctx.fillRect(w * 0.06, y - 3, w * 0.88, 2.5)
    ctx.fillRect(w * 0.06, y + 3, w * 0.88, 2.5)
  }
  // title between the inner bands, reading top → bottom (ABNT NBR 12225: legible with the book lying cover-up)
  const titleSpan = h * (0.73 - 0.27) - 30
  ctx.save()
  ctx.translate(w / 2, h * 0.5)
  ctx.rotate(Math.PI / 2)
  let size = Math.min(w * 0.62, 64)
  ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`
  while (ctx.measureText(title.toUpperCase()).width > titleSpan && size > 8) {
    size -= 1
    ctx.font = `600 ${size}px Georgia, 'Times New Roman', serif`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title.toUpperCase(), 0, 0)
  ctx.restore()
  // small fleurons in the outer panels
  for (const f of [0.185, 0.815]) {
    const y = h * f
    ctx.beginPath()
    ctx.moveTo(w / 2, y - w * 0.18)
    ctx.lineTo(w / 2 + w * 0.12, y)
    ctx.lineTo(w / 2, y + w * 0.18)
    ctx.lineTo(w / 2 - w * 0.12, y)
    ctx.closePath()
    ctx.fill()
  }
  return c
}

/** Front cover tooling: double fillet frame with corner ornaments, leaving the polaroid area clear. */
export function frontFoilMask(widthM: number, heightM: number): HTMLCanvasElement {
  const pxPerM = 3000
  const w = Math.round(widthM * pxPerM)
  const h = Math.round(heightM * pxPerM)
  const { c, ctx } = canvas(w, h)
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = '#fff'
  const inset = (m: number) => m * pxPerM
  // double fillet (a thick and a thin rule), solid strokes wide enough not to alias into "stitches"
  ctx.lineWidth = 7
  ctx.strokeRect(inset(0.006), inset(0.006), w - 2 * inset(0.006), h - 2 * inset(0.006))
  ctx.lineWidth = 4
  ctx.strokeRect(inset(0.0092), inset(0.0092), w - 2 * inset(0.0092), h - 2 * inset(0.0092))
  // small corner fleurons joining the two rules
  ctx.lineWidth = 2.2
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = sx > 0 ? inset(0.006) : w - inset(0.006)
    const cy = sy > 0 ? inset(0.006) : h - inset(0.006)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + sx * inset(0.0032), cy + sy * inset(0.0032))
    ctx.stroke()
  }
  return c
}

/**
 * Bookcloth (buckram) weave as a height map: over/under threads of ~0.4 mm across a tile of `tileM` meters,
 * with slight irregularity. Returns the height canvas; normalFromMask turns it into a normal map.
 */
export function clothWeaveHeight(tileM: number, seed = 5): HTMLCanvasElement {
  const N = 1024
  const threads = Math.round(tileM / 0.0004)
  const { c, ctx } = canvas(N, N)
  const img = ctx.createImageData(N, N)
  const r = rand(seed)
  const jitterX = Array.from({ length: threads }, () => 0.85 + r() * 0.3)
  const jitterY = Array.from({ length: threads }, () => 0.85 + r() * 0.3)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * threads
      const v = (y / N) * threads
      const iu = Math.floor(u)
      const iv = Math.floor(v)
      const fu = u - iu
      const fv = v - iv
      // warp over weft on a checkerboard, each thread a rounded ridge
      const overWarp = (iu + iv) % 2 === 0
      const warp = Math.sin(Math.PI * fu) * jitterX[iu % threads]
      const weft = Math.sin(Math.PI * fv) * jitterY[iv % threads]
      const h = overWarp ? 0.55 * warp + 0.45 * warp * weft : 0.55 * weft + 0.45 * warp * weft
      const i = (y * N + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.round(Math.min(1, Math.max(0, h)) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Soft rectangular shadow (alpha): darkest under the card, fading 4% beyond its edges. */
export function contactShadowTexture(): Texture {
  const N = 256
  const { c, ctx } = canvas(N, N)
  // alphaMap reads the green channel, not alpha: the falloff is drawn as gray on opaque black
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, N, N)
  ctx.filter = 'blur(18px)'
  ctx.fillStyle = '#fff'
  ctx.fillRect(N * 0.2, N * 0.2, N * 0.6, N * 0.6)
  return texture(c, false)
}

/** Vertical falloff (alpha): dark at the bottom edge, fading upward — shadow of a row on the back panel. */
export function backShadowTexture(): Texture {
  const { c, ctx } = canvas(64, 256)
  const g = ctx.createLinearGradient(0, 256, 0, 0)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  // soften the sides
  const img = ctx.getImageData(0, 0, 64, 256)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const k = Math.min(1, Math.min(x, 63 - x) / 12)
      // alphaMap reads green: move the falloff from alpha to gray on opaque black
      const i = (y * 64 + x) * 4
      const v = img.data[i + 3] * k
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  return texture(c, false)
}

export function maskTexture(mask: HTMLCanvasElement): Texture {
  return texture(mask, false)
}

/** Page edges: cream paper with fine sheet lines, slightly darker toward the outside (gilt-free, aged). */
export function pageEdgeTexture(seed = 7): Texture {
  const w = 512
  const h = 512
  const { c, ctx } = canvas(w, h)
  const r = rand(seed)
  ctx.fillStyle = '#E3D5B8'
  ctx.fillRect(0, 0, w, h)
  // one row per sheet; signatures of 8 sheets read as faint bands, with darker gaps between them
  let sigShade = 0
  for (let y = 0; y < h; y++) {
    if (y % 8 === 0) sigShade = (r() - 0.5) * 16
    const v = r()
    const shade = 200 + Math.round(v * 34 + sigShade)
    const gapDark = y % 8 === 7 ? 40 : 0
    ctx.fillStyle = `rgba(${shade - gapDark},${shade - 14 - gapDark},${shade - 40 - gapDark},${0.55 + v * 0.35})`
    ctx.fillRect(0, y, w, 1)
  }
  // dust/aging gradient
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, 'rgba(110,80,45,0.3)')
  g.addColorStop(0.2, 'rgba(110,80,45,0.05)')
  g.addColorStop(0.8, 'rgba(110,80,45,0.05)')
  g.addColorStop(1, 'rgba(110,80,45,0.3)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const t = texture(c, true)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** First/last page (seen at the sides of the block): plain cream paper. */
export function paperTexture(seed = 3): Texture {
  const { c, ctx } = canvas(256, 256)
  const r = rand(seed)
  ctx.fillStyle = '#F1E8D4'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2500; i++) {
    const a = r() * 0.06
    ctx.fillStyle = `rgba(150,120,80,${a})`
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1)
  }
  const t = texture(c, true)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/**
 * Edge wear in cover UV space (u = arc length along the profile in meters, v = height in meters):
 * light at the top/bottom edges, along the spine and at the fore-edge corners, broken by noise.
 */
export function wearTexture(profileLengthM: number, heightM: number, spineFromM: number, spineToM: number, seed = 11): Texture {
  const pxPerM = 1200
  const w = Math.max(32, Math.round(profileLengthM * pxPerM))
  const h = Math.round(heightM * pxPerM)
  const { c, ctx } = canvas(w, h)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const r = rand(seed)
  const band = (x: number, y: number, bw: number, bh: number, a: number) => {
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fillRect(x, y, bw, bh)
  }
  const edge = 0.005 * pxPerM
  band(0, 0, w, edge, 0.75)
  band(0, h - edge, w, edge, 0.75)
  band(0, 0, edge * 0.8, h, 0.6)
  band(w - edge * 0.8, 0, edge * 0.8, h, 0.6)
  // rubbed corners (fore-edge top and bottom of both boards): soft blobs
  for (const [x, y] of [[0, 0], [0, h], [w, 0], [w, h]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 0.018 * pxPerM)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 0.02 * pxPerM, y - 0.02 * pxPerM, 0.04 * pxPerM, 0.04 * pxPerM)
  }
  // spine rubbing
  const s0 = spineFromM * pxPerM
  const s1 = spineToM * pxPerM
  band(s0, 0, s1 - s0, h, 0.12)
  band(s0 - 2, 0, 4, h, 0.35)
  band(s1 - 2, 0, 4, h, 0.35)
  // break it up with noise
  const img = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = r()
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(img.data[i] * (0.4 + 0.9 * n * n))
  }
  ctx.putImageData(img, 0, 0)
  ctx.filter = 'blur(1.5px)'
  ctx.drawImage(c, 0, 0)
  return texture(c, false)
}

/** Sample "photos" for the fixtures (no third-party images): small painted landscapes with film grain. */
export function samplePhoto(seed: number, size = 512): HTMLCanvasElement {
  const { c, ctx } = canvas(size, size)
  const r = rand(seed * 977 + 13)
  const palettes = [
    ['#F2C58A', '#D98A5B', '#5E6B4E', '#2F3B2C'],
    ['#BFD6E3', '#8FB2C9', '#6E7F5E', '#3D4A35'],
    ['#F3D9B0', '#C9A27A', '#8A6A4A', '#4A3A2A'],
    ['#E8C7C1', '#C48C8C', '#5F6C7A', '#2E3640'],
    ['#DCE6D0', '#9FB58C', '#58704A', '#2C3A26'],
    ['#F0E0C0', '#E0A060', '#A05A3A', '#402820'],
  ]
  const p = palettes[seed % palettes.length]
  const sky = ctx.createLinearGradient(0, 0, 0, size * 0.6)
  sky.addColorStop(0, p[1])
  sky.addColorStop(1, p[0])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, size, size)
  // sun
  ctx.fillStyle = 'rgba(255,240,210,0.85)'
  ctx.beginPath()
  ctx.arc(size * (0.25 + r() * 0.5), size * (0.2 + r() * 0.2), size * 0.06, 0, Math.PI * 2)
  ctx.fill()
  // hills
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = k === 2 ? p[3] : p[2]
    ctx.globalAlpha = 0.55 + k * 0.2
    ctx.beginPath()
    ctx.moveTo(0, size)
    const base = size * (0.55 + k * 0.12)
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, base - Math.sin(x / size * (2 + k) * Math.PI + r() * 0.2 + k) * size * 0.05 - r() * 4)
    }
    ctx.lineTo(size, size)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // vignette + warm fade + grain (instant-film look)
  const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(40,20,0,0.45)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const g = (r() - 0.5) * 18
    img.data[i] = Math.min(255, img.data[i] * 0.92 + 18 + g)
    img.data[i + 1] = Math.min(255, img.data[i + 1] * 0.9 + 12 + g)
    img.data[i + 2] = Math.min(255, img.data[i + 2] * 0.85 + 6 + g)
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export function photoTexture(source: HTMLCanvasElement | ImageBitmap): Texture {
  const t = new CanvasTexture(source as HTMLCanvasElement)
  t.colorSpace = SRGBColorSpace
  return t
}
