// npm run optimize — blender/out → public/ (spec Fase 0 §5).
//   models:    room.glb, props.glb (+ .low.glb with 1K textures): occlusion stub removed, dedup, prune
//              (keeping TEXCOORD_1), weld, textures KTX2 when `ktx` exists, else WebP (fallback), Meshopt.
//   lightmaps: RGBM PNG → lossless WebP + public/lightmaps/manifest.json (mesh → atlas, mode, range).
//   env:       room_N1.hdr and sky.jpg.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, join as joinMeshes, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions'
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
      dedup(),
      flatten(),
      joinMeshes({ keepNamed: false }),
      prune({ keepAttributes: true, keepIndices: false }),
      weld(),
      textureCompress({ encoder: sharp, targetFormat: ktx ? undefined : 'webp', resize: [res, res], quality: 82 }),
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
    copyFileSync(src, dst)
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
