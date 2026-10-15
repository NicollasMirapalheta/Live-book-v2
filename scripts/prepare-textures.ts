// npm run textures — color-corrected 2K textures shared by Blender (bake/preview) and the app (glTF).
// The glTF exporter cannot carry color-correction nodes, so palette adjustments are baked into the images.
// Input: assets/source/<key>/   Output: blender/out/textures/<name>.(jpg|png)
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type Sharp } from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets', 'source')
const OUT = join(ROOT, 'blender', 'out', 'textures')
const SIZE = 2048

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function find(key: string, pattern: RegExp): string {
  const dir = join(SRC, key)
  const walk = (d: string): string | undefined => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        const f = walk(p)
        if (f) return f
      } else if (pattern.test(e.name)) return p
    }
  }
  const found = existsSync(dir) ? walk(dir) : undefined
  if (!found) throw new Error(`mapa ${pattern} não encontrado em ${dir}`)
  return found
}

interface ColorJob {
  /** target mean color (sRGB hex) after correction */
  mean: string
  /** 0..1 how much of the mean shift to apply */
  amount?: number
  /** saturation multiplier applied before matching the mean */
  saturation?: number
  /** contrast around the mean (1 = unchanged) */
  contrast?: number
  /** start from a grayscale version (keeps only the luminance pattern) */
  grayscale?: boolean
}

/** Shifts the image mean toward a target color while keeping its local variation. */
async function colorMatch(input: Sharp, job: ColorJob): Promise<Sharp> {
  let img = input
  if (job.grayscale) img = img.grayscale().toColourspace('srgb')
  if (job.saturation !== undefined) img = img.modulate({ saturation: job.saturation })
  const buf = await img.toBuffer()
  const stats = await sharp(buf).stats()
  const mean = stats.channels.slice(0, 3).map((c) => c.mean)
  const target = hexRgb(job.mean)
  const amount = job.amount ?? 1
  const contrast = job.contrast ?? 1
  // out = (in - mean) * contrast * scale + mean * scale, scale = target/mean (per channel, blended by amount)
  const scales = mean.map((m, i) => 1 + ((target[i] / Math.max(m, 1)) - 1) * amount)
  const a = scales.map((s) => s * contrast)
  const b = mean.map((m, i) => m * scales[i] * (1 - contrast))
  return sharp(buf).linear(a, b)
}

const written: Record<string, string> = {}

async function save(img: Sharp, name: string, kind: 'jpg' | 'png' = 'jpg') {
  const file = join(OUT, `${name}.${kind}`)
  const out = img.resize(SIZE, SIZE, { fit: 'fill' })
  await (kind === 'jpg' ? out.jpeg({ quality: 92, mozjpeg: true }) : out.png()).toFile(file)
  written[name] = file
}

/** ARM with the roughness (G) channel re-centered on a target mean and its variation scaled. */
async function arm(file: string, roughness?: number, spread = 0.6): Promise<Sharp> {
  if (roughness === undefined) return sharp(file)
  const g = (await sharp(file).stats()).channels[1].mean
  return sharp(file).linear([1, spread, 1], [0, roughness * 255 - g * spread, 0])
}

/** Copies the standard Poly Haven maps (normal + ARM [+ displacement]) at 2K. */
async function pbr(
  key: string,
  name: string,
  color: ColorJob | null,
  opts: { disp?: boolean; diffuse?: RegExp; roughness?: number; spread?: number } = {},
) {
  if (color) {
    const diffuse = sharp(find(key, opts.diffuse ?? /_(Diffuse|diff)_\d+k\./i)).removeAlpha()
    await save(await colorMatch(diffuse, color), `${name}_color`)
  }
  await save(sharp(find(key, /_nor_gl_\d+k\./i)), `${name}_normal`)
  await save(await arm(find(key, /_arm_\d+k\./i), opts.roughness, opts.spread), `${name}_arm`)
  if (opts.disp) await save(sharp(find(key, /_(Displacement|disp)_\d+k\./i)).grayscale(), `${name}_disp`)
}

/** Smooth value noise: random pixels upscaled with a cubic kernel. */
async function noise(size: number, cells: number, seed: number): Promise<Buffer> {
  let x = seed
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296)
  const raw = Buffer.alloc(cells * cells)
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(rand() * 256)
  return sharp(raw, { raw: { width: cells, height: cells, channels: 1 } })
    .resize(size, size, { kernel: 'cubic' })
    .blur(size / cells / 3)
    .raw()
    .toBuffer()
}

/** Aged brass (#9C7A45, roughness 0.35–0.5 with patina) for hardware and props: color, ARM, normal. */
async function brass() {
  const N = 1024
  const [low, mid, fine] = await Promise.all([noise(N, 6, 3), noise(N, 24, 7), noise(N, 96, 11)])
  const base = hexRgb('#9C7A45')
  const patina = hexRgb('#6E5530')
  const color = Buffer.alloc(N * N * 3)
  const armBuf = Buffer.alloc(N * N * 3)
  const nor = Buffer.alloc(N * N * 3)
  for (let i = 0; i < N * N; i++) {
    const p = Math.max(0, (low[i] / 255 - 0.45) * 1.8) * 0.7 + (mid[i] / 255 - 0.5) * 0.15
    const t = Math.min(1, Math.max(0, p))
    const bright = 1 + (fine[i] / 255 - 0.5) * 0.08
    for (let c = 0; c < 3; c++) color[i * 3 + c] = Math.min(255, Math.round((base[c] * (1 - t) + patina[c] * t) * bright))
    armBuf[i * 3] = 255
    armBuf[i * 3 + 1] = Math.round((0.35 + 0.15 * (mid[i] / 255) + 0.12 * t) * 255)
    armBuf[i * 3 + 2] = 255
    nor[i * 3] = 128 + Math.round((fine[i] / 255 - 0.5) * 6)
    nor[i * 3 + 1] = 128 + Math.round((mid[i] / 255 - 0.5) * 6)
    nor[i * 3 + 2] = 255
  }
  const raw = { raw: { width: N, height: N, channels: 3 as const } }
  await save(sharp(color, raw), 'brass_color')
  await save(sharp(armBuf, raw), 'brass_arm')
  await save(sharp(nor, raw), 'brass_normal')
}

/**
 * Book textures (public/textures/book, 1K): luminance maps normalized to a linear mean of 0.5, so the app
 * tints them with the spine color while keeping the grain (color = tint × 2 × lum), plus normal and ARM.
 */
async function bookTextures() {
  const dir = join(ROOT, 'public', 'textures', 'book')
  mkdirSync(dir, { recursive: true })
  const N = 1024
  const lum = async (file: string, name: string, contrast = 1) => {
    const g = sharp(file).removeAlpha().grayscale().resize(N, N)
    const mean = (await g.clone().stats()).channels[0].mean
    // stored as linear data: mean → 128 (0.5), contrast around the mean
    await g
      .linear(contrast * (128 / Math.max(mean, 1)), 128 * (1 - contrast))
      .jpeg({ quality: 90 })
      .toFile(join(dir, `${name}.jpg`))
  }
  await lum(find('book_leather', /_(coll1|Diffuse|diff)_\d+k\./i), 'leather_lum', 1.15)
  await sharp(find('book_leather', /_nor_gl_\d+k\./i)).resize(N, N).jpeg({ quality: 90 }).toFile(join(dir, 'leather_normal.jpg'))
  await (await arm(find('book_leather', /_arm_\d+k\./i), 0.42, 0.7)).resize(N, N).jpeg({ quality: 90 }).toFile(join(dir, 'leather_arm.jpg'))
  await lum(find('curtain_linen', /_(Diffuse|diff)_\d+k\./i), 'cloth_lum', 2.4)
  await sharp(find('curtain_linen', /_nor_gl_\d+k\./i)).resize(N, N).jpeg({ quality: 90 }).toFile(join(dir, 'cloth_normal.jpg'))
  await (await arm(find('curtain_linen', /_arm_\d+k\./i), 0.82, 0.5)).resize(N, N).jpeg({ quality: 90 }).toFile(join(dir, 'cloth_arm.jpg'))
  // wooden surface for the isolated scene (same wood as the desk)
  for (const m of ['color', 'normal', 'arm']) {
    await sharp(join(OUT, `desk_${m}.jpg`)).resize(N, N).jpeg({ quality: 90 }).toFile(join(dir, `table_${m}.jpg`))
  }
  console.log('[textures] livro → public/textures/book/')
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  // Floor: wide varnished planks, warmed toward floor base #7A4E32.
  await pbr('floor_wood', 'floor', { mean: '#7E5C3E', saturation: 0.42, contrast: 1.15 }, { roughness: 0.32, spread: 0.7 })
  // Stone: light limestone/sandstone #A89A84–#C8BBA2, slightly warm.
  await pbr('wall_stone', 'stone', { mean: '#A8A08E', saturation: 0.4 }, { disp: true, roughness: 0.85 })
  // Bookcase: dark mahogany, 25% less saturated than the source.
  await pbr('bookcase_wood', 'bookcase', { mean: '#6B4A32', saturation: 0.25, contrast: 0.8 }, { roughness: 0.42 })
  // Wainscot + door: same wood, one tone lighter (direção de arte: mesma família).
  await pbr('bookcase_wood', 'wainscot', { mean: '#725238', saturation: 0.25, contrast: 0.85 }, { roughness: 0.45 })
  // Desk: same family, between the two.
  await pbr('bookcase_wood', 'desk', { mean: '#6A4B35', saturation: 0.3 }, { roughness: 0.4 })
  // Beams: rough grey wood tinted to dark brown.
  await pbr('beam_wood', 'beam', { mean: '#46322A', saturation: 0.45, contrast: 1.1 }, { roughness: 0.78 })
  // Ceiling: warm plaster, never pure white.
  await pbr('ceiling_plaster', 'plaster', { mean: '#CDBFA5', contrast: 1.6 }, { roughness: 0.92, spread: 0.3 })
  // Linen: only the weave pattern (source is blue) tinted to #DCCDB0.
  await pbr('curtain_linen', 'linen', { mean: '#D6C6A6', grayscale: true, contrast: 1.2 }, { roughness: 0.9, spread: 0.3 })

  // Rug: crop the museum background (fringe is modeled), long side along X, pull toward the reference palette.
  const RUG_CROPS: Record<string, { left: number; top: number; width: number; height: number; size: [number, number] }> = {
    met_452828_carpet: { left: 175, top: 130, width: 1925 - 175, height: 3640 - 130, size: [2048, 1024] },
    met_451375_carpet: { left: 125, top: 175, width: 2985 - 125, height: 3850 - 175, size: [2048, 1536] },
  }
  const rugName = readdirSync(join(SRC, 'rug_albedo')).find((f) => /\.jpe?g$/i.test(f))!
  const crop = RUG_CROPS[rugName.replace(/\.jpe?g$/i, '')]
  const rug = sharp(join(SRC, 'rug_albedo', rugName)).extract(crop).rotate(90)
  const rugImg = await colorMatch(rug, { mean: '#7E4A3A', amount: 0.15, contrast: 1.05, saturation: 1.08 })
  await rugImg.resize(crop.size[0], crop.size[1], { fit: 'fill' }).jpeg({ quality: 92, mozjpeg: true }).toFile(join(OUT, 'rug_color.jpg'))
  written.rug_color = join(OUT, 'rug_color.jpg')
  await save(sharp(find('rug_pile', /_nor_gl_\d+k\./i)), 'rug_normal')
  await save(sharp(find('rug_pile', /_arm_\d+k\./i)), 'rug_arm')

  await brass()
  await bookTextures()

  writeFileSync(join(OUT, 'textures.json'), JSON.stringify(written, null, 2))
  console.log(`[textures] ${Object.keys(written).length} mapas → blender/out/textures/`)
}

void main()
