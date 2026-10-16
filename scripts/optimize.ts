// npm run optimize — blender/out → public/ (spec Fase 0 §5).
//   models:    room.glb, props.glb (+ .low.glb with half-size textures): occlusion stub removed, dedup, prune
//              (keeping TEXCOORD_1), weld, Meshopt. Textures KTX2 when `ktx` (KTX-Software 4.4+) exists, else
//              WebP (fallback): sized per texture (sizeTextures), UASTC for normal maps and close-up colours,
//              ETC1S for the rest (plano de desempenho, Etapa 2).
//   lightmaps: RGBM PNG → lossless WebP + public/lightmaps/manifest.json (mesh → atlas, mode, range).
//   env:       room_N1.hdr and sky.jpg.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, PropertyType, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, join as joinMeshes, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions'
import type { Transform } from '@gltf-transform/core'
import { KHRTextureBasisu } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'blender', 'out')
const PUB = join(ROOT, 'public')
const mb = (f: string) => `${(statSync(f).size / 1e6).toFixed(2)} MB`

function hasKtx(): boolean {
  try {
    execFileSync('ktx', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function io() {
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}

/** The exporter needed an occlusion texture on UV2 to write TEXCOORD_1; drop it. */
function removeLightmapStub(doc: Document) {
  for (const mat of doc.getRoot().listMaterials()) {
    const occ = mat.getOcclusionTexture()
    if (occ && (occ.getName() === '__lm_ref__' || (occ.getSize()?.[0] ?? 0) <= 4)) mat.setOcclusionTexture(null)
  }
}

/** Materials used only by `combined` meshes are drawn with the baked texture: drop their PBR maps. */
function stripCombined(doc: Document, assign: Record<string, { mode: string }>) {
  const modes = new Map<object, Set<string>>()
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    let mode = 'none'
    for (let n: typeof node | null = node; n; n = n.getParentNode()) {
      const a = assign[n.getName()]
      if (a) {
        mode = a.mode
        break
      }
    }
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial()
      if (!mat) continue
      if (!modes.has(mat)) modes.set(mat, new Set())
      modes.get(mat)!.add(mode)
    }
  }
  let stripped = 0
  for (const [mat, set] of modes) {
    if (set.size === 1 && set.has('combined')) {
      const m = mat as ReturnType<Document['createMaterial']>
      m.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null)
      stripped++
    }
  }
  console.log(`[optimize] ${stripped} materiais só "combined" sem texturas PBR`)
}

/**
 * Tags every primitive's material with its atlas and mode (`<material>@<atlas>:<mode>`, cloning shared
 * materials), so meshes can then be merged per material without losing the lightmap assignment.
 */
function tagMaterials(doc: Document, assign: Record<string, { atlas: string; mode: string }>) {
  const clones = new Map<string, ReturnType<Document['createMaterial']>>()
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    let entry: { atlas: string; mode: string } | undefined
    for (let n: typeof node | null = node; n && !entry; n = n.getParentNode()) entry = assign[n.getName()]
    if (!entry) continue
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial()
      if (!mat) continue
      const key = `${mat.getName()}@${entry.atlas}:${entry.mode}`
      let tagged = clones.get(key)
      if (!tagged) {
        tagged = mat.clone().setName(key)
        clones.set(key, tagged)
      }
      prim.setMaterial(tagged)
    }
  }
}

const ASSIGN_FILE = join(OUT, 'lightmaps', 'assign.json')

/** Surfaces the camera gets close to (floor, bookcase, walls): their colour keeps the full size. */
const CLOSE_UP = /^(floor|bookcase|stone|wainscot|rug)_/
/** Normal maps at full size: only where the grain shows up close (the floor at grazing angles, the bookcase). */
const CLOSE_NORMAL = /^(floor|bookcase)_/
/** Normal maps at a quarter even up close: the rug's pile reads the same at 512 px. */
const SOFT_NORMAL = /^rug_/
/** Colour in UASTC: the bookcase at N2, where ETC1S turned the walnut's fine light streaks into blotches (art-reviewer). */
const UASTC_COLOR = /^bookcase_/
/** A map this flat (largest channel standard deviation, 0–255) carries no detail: 256 px is plenty. */
const FLAT_SD = 1.5
const FLAT_SIZE = 256

/**
 * Sizes every texture before compression (on the GPU an uncompressed 2K map was ~22 MB whatever its file
 * size; in the file a UASTC normal map is the heaviest part):
 * - colour: close-up surfaces at `maxRes`, the rest at half;
 * - normal: floor and bookcase at `maxRes`, other close-up surfaces at half, the rest at a quarter;
 * - ARM (occlusion/roughness/metal): half;
 * - flat maps: FLAT_SIZE.
 */
function sizeTextures(maxRes: number): Transform {
  return async (doc) => {
    for (const t of doc.getRoot().listTextures()) {
      const img = t.getImage()
      if (!img) continue
      const slots = doc.getGraph().listParentEdges(t).map((e) => e.getName())
      const name = t.getName()
      const normal = slots.includes('normalTexture')
      const arm = slots.includes('metallicRoughnessTexture')
      const meta = await sharp(img).metadata()
      const { channels } = await sharp(img).stats()
      const sd = Math.max(...channels.slice(0, 3).map((c) => c.stdev))
      const target =
        sd < FLAT_SD ? FLAT_SIZE
        : arm ? maxRes / 2
        : normal ? (CLOSE_NORMAL.test(name) ? maxRes : CLOSE_UP.test(name) && !SOFT_NORMAL.test(name) ? maxRes / 2 : maxRes / 4)
        : CLOSE_UP.test(name) ? maxRes : maxRes / 2
      const k = Math.min(1, target / Math.max(meta.width ?? 1, meta.height ?? 1))
      const w = Math.round((meta.width ?? 1) * k)
      const h = Math.round((meta.height ?? 1) * k)
      const png = await sharp(img).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer()
      t.setImage(new Uint8Array(png)).setMimeType('image/png')
    }
  }
}

const COLOR_SLOTS = new Set(['baseColorTexture', 'emissiveTexture'])

/**
 * KTX2 (Basis) with `ktx create`, one texture at a time: UASTC for normal maps (ETC1S blocks show in the
 * lighting), ETC1S for colour and ARM maps (max quality on close-up colours). Called directly rather than
 * through gltf-transform's toktx, which came out ~2.7× larger for the same settings here.
 */
function encodeKtx(): Transform {
  return async (doc) => {
    const dir = mkdtempSync(join(tmpdir(), 'livebook-ktx-'))
    try {
      let i = 0
      for (const t of doc.getRoot().listTextures()) {
        const img = t.getImage()
        if (!img || t.getMimeType() === 'image/ktx2') continue
        const slots = doc.getGraph().listParentEdges(t).map((e) => e.getName())
        const color = slots.some((sl) => COLOR_SLOTS.has(sl))
        const normal = slots.includes('normalTexture')
        const { channels } = await sharp(img).stats()
        const meta = await sharp(img).metadata()
        const alpha = !!meta.hasAlpha && channels[3] !== undefined && channels[3].min < 255
        const src = join(dir, `${i}.png`)
        const out = join(dir, `${i++}.ktx2`)
        writeFileSync(src, await (alpha ? sharp(img) : sharp(img).removeAlpha()).png().toBuffer())
        const format = `R8G8B8${alpha ? 'A8' : ''}_${color ? 'SRGB' : 'UNORM'}`
        const args = ['create', '--format', format, '--assign-tf', color ? 'srgb' : 'linear', '--generate-mipmap']
        if (normal || (color && UASTC_COLOR.test(t.getName()))) args.push('--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '2', '--zstd', '20')
        else args.push('--encode', 'basis-lz', '--qlevel', color && CLOSE_UP.test(t.getName()) ? '255' : '200', '--clevel', '2')
        execFileSync('ktx', [...args, src, out], { stdio: ['ignore', 'ignore', 'pipe'] })
        t.setImage(new Uint8Array(readFileSync(out))).setMimeType('image/ktx2')
      }
      doc.createExtension(KHRTextureBasisu).setRequired(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

async function optimizeModel(name: string, ktx: boolean, maxRes = 2048) {
  const src = join(OUT, `${name}.glb`)
  if (!existsSync(src)) {
    console.warn(`[optimize] ${src} ausente`)
    return {}
  }
  const sizes: Record<string, string> = {}
  const assign = existsSync(ASSIGN_FILE) ? JSON.parse(readFileSync(ASSIGN_FILE, 'utf8')) : {}
  for (const [suffix, res] of [['', maxRes], ['.low', maxRes / 2]] as const) {
    const n = await io()
    const doc = await n.read(src)
    removeLightmapStub(doc)
    stripCombined(doc, assign)
    tagMaterials(doc, assign)
    await doc.transform(
      // materials are not deduplicated: the tagged clones (name@atlas:mode) must survive
      dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
      // the static room is merged per material; props keep their named hierarchy (the app moves them)
      ...(name === 'room' ? [flatten(), joinMeshes({ keepNamed: false })] : []),
      prune({ keepAttributes: true, keepIndices: false }),
      weld(),
      ...(ktx ? [sizeTextures(res), encodeKtx()] : [textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [res, res], quality: 72 })]),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    )
    const out = join(PUB, 'models', `${name}${suffix}.glb`)
    await n.write(out, doc)
    sizes[`${name}${suffix}.glb`] = mb(out)
    console.log(`[optimize] ${name}${suffix}.glb ${mb(out)} (fonte ${mb(src)})`)
  }
  return sizes
}

async function lightmaps() {
  const lmDir = join(OUT, 'lightmaps')
  const meta = JSON.parse(readFileSync(join(lmDir, 'lightmaps.json'), 'utf8')) as Record<
    string,
    { file: string; encoding: string; range: number; size: number; mode: string; denoised: boolean }
  >
  const assign = JSON.parse(readFileSync(join(lmDir, 'assign.json'), 'utf8')) as Record<string, { atlas: string; mode: string }>
  const atlases: Record<string, unknown> = {}
  const sizes: Record<string, string> = {}
  for (const [atlas, m] of Object.entries(meta)) {
    const out = join(PUB, 'lightmaps', `${atlas}.webp`)
    // lossless keeps RGBM exact; alpha carries the multiplier
    await sharp(join(lmDir, m.file)).webp({ lossless: true, alphaQuality: 100, effort: 6 }).toFile(out)
    atlases[atlas] = { file: `${atlas}.webp`, encoding: m.encoding, range: m.range, size: m.size, mode: m.mode, denoised: m.denoised }
    sizes[`${atlas}.webp`] = mb(out)
    console.log(`[optimize] lightmap ${atlas}.webp ${mb(out)} (${m.size}px, range ${m.range})`)
  }
  const manifest = { version: 1, intensity: 1.0, atlases, objects: assign }
  writeFileSync(join(PUB, 'lightmaps', 'manifest.json'), JSON.stringify(manifest, null, 2))
  return sizes
}

function env() {
  const sizes: Record<string, string> = {}
  for (const f of ['room_N1.hdr', 'sky.jpg']) {
    const src = join(OUT, 'env', f)
    if (!existsSync(src)) {
      console.warn(`[optimize] ${src} ausente`)
      continue
    }
    const dst = join(PUB, 'env', f)
    if (f.endsWith('.hdr')) {
      // the env only feeds blurred specular (PMREM): 1024×512 is enough and ~4× smaller
      execFileSync(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'scripts', 'resize-hdr.ts'), src, dst, '1024'], { stdio: 'inherit' })
    } else copyFileSync(src, dst)
    sizes[f] = mb(dst)
    console.log(`[optimize] env ${f} ${mb(dst)}`)
  }
  return sizes
}

async function main() {
  for (const d of ['models', 'lightmaps', 'env']) mkdirSync(join(PUB, d), { recursive: true })
  const ktx = hasKtx()
  if (!ktx) console.warn('[optimize] `ktx` ausente: texturas em WebP (fallback registrado em docs/decisoes.md)')
  const sizes = {
    ...(await optimizeModel('room', ktx)),
    ...(await optimizeModel('props', ktx, 1024)),
    ...(await lightmaps()),
    ...env(),
  }
  writeFileSync(join(PUB, 'data', 'sizes.json'), JSON.stringify({ at: new Date().toISOString(), textures: ktx ? 'ktx2' : 'webp', sizes }, null, 2))
}

void main()
