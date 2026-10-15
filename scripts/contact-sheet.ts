// npm run assets:contact — builds shots/latest/assets_contact.png (T1):
// texture swatches with their real-world size, the palette from docs/direcao-de-arte.md
// and the Blender model thumbnails (npm run blender:assets).
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'assets', 'source')
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets', 'manifest.json'), 'utf8'))

const TILE = 300
const LABEL = 54
const COLS = 6

const PALETTE: [string, string][] = [
  ['mogno sombra', '#4A2A1C'], ['mogno base', '#6B3E2A'], ['mogno luz', '#8A5638'],
  ['piso base', '#7A4E32'], ['piso realce', '#A0703F'], ['pedra', '#A89A84'],
  ['pedra clara', '#C8BBA2'], ['linho', '#DCCDB0'], ['latão', '#9C7A45'],
  ['latão brilho', '#C9A35A'], ['tapete verm.', '#8E2F2A'], ['tapete marinho', '#22304A'],
  ['tapete creme', '#E3D5B8'], ['sombra mín.', '#2A1A12'],
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function label(lines: string[], width = TILE): Buffer {
  const text = lines
    .map((l, i) => `<text x="8" y="${20 + i * 18}" font-family="Arial" font-size="${i === 0 ? 15 : 13}" fill="${i === 0 ? '#f3e6cf' : '#bfae94'}">${esc(l)}</text>`)
    .join('')
  return Buffer.from(`<svg width="${width}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1b1410"/>${text}</svg>`)
}

async function polyhavenDims(id: string): Promise<string> {
  try {
    const r = await fetch(`https://api.polyhaven.com/info/${id}`, { headers: { 'User-Agent': 'LiveBook-contact-sheet/1.0' } })
    const info = (await r.json()) as { dimensions?: number[] }
    if (info.dimensions?.length) return info.dimensions.slice(0, 2).map((mm) => `${(mm / 1000).toFixed(2)} m`).join(' × ')
  } catch {
    // offline: no dimension label
  }
  return 'tamanho real ?'
}

function findFile(dir: string, pattern: RegExp): string | undefined {
  if (!existsSync(dir)) return undefined
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(p, pattern)
      if (found) return found
    } else if (pattern.test(entry.name)) return p
  }
  return undefined
}

async function tile(image: Buffer | string, lines: string[]): Promise<Buffer> {
  const img = await sharp(image).resize(TILE, TILE, { fit: 'cover' }).toBuffer()
  return sharp({ create: { width: TILE, height: TILE + LABEL, channels: 3, background: '#1b1410' } })
    .composite([{ input: img, top: 0, left: 0 }, { input: label(lines), top: TILE, left: 0 }])
    .png()
    .toBuffer()
}

async function main() {
  const tiles: Buffer[] = []

  for (const a of manifest.assets as { key: string; id: string; type: string; source: string; use: string; filename?: string }[]) {
    const dir = join(SOURCE, a.key)
    if (a.type === 'texture' || a.type === 'image') {
      const file = a.type === 'image' ? join(dir, a.filename!) : findFile(dir, /(Diffuse|coll1)_\d+k\.(jpg|png)$/i)
      if (file && existsSync(file)) {
        const dims = a.source === 'polyhaven' ? await polyhavenDims(a.id) : ''
        tiles.push(await tile(file, [a.key, `${a.id} ${dims}`]))
      } else if (a.type === 'texture') {
        // normal-only assets (rug_pile): show the normal map
        const nor = findFile(dir, /nor_gl/i)
        if (nor) tiles.push(await tile(nor, [a.key, `${a.id} (só normal)`]))
      }
    } else if (a.type === 'model') {
      const thumb = join(ROOT, 'shots', 'blender', 'assets', `${a.key}.png`)
      const sizeFile = thumb.replace(/\.png$/, '.json')
      if (existsSync(thumb)) {
        const size = existsSync(sizeFile) ? (JSON.parse(readFileSync(sizeFile, 'utf8')).size_m as number[]) : undefined
        const dims = size ? `${size[0].toFixed(2)}×${size[1].toFixed(2)}×${size[2].toFixed(2)} m (régua 1 m)` : ''
        tiles.push(await tile(thumb, [a.key, dims]))
      }
    } else if (a.type === 'hdri') {
      const hdr = findFile(dir, /\.hdr$/i)
      if (hdr) {
        // tone-map the HDR roughly for display
        const preview = await sharp(hdr).resize(TILE * 2, TILE).gamma(2.2).toBuffer().catch(() => undefined)
        if (preview) tiles.push(await tile(preview, [a.key, a.id]))
      }
    }
  }

  const swatch = (hex: string, name: string) =>
    sharp({ create: { width: TILE, height: TILE / 3, channels: 3, background: hex } })
      .composite([{ input: label([name, hex]), top: TILE / 3 - LABEL, left: 0 }])
      .png()
      .toBuffer()
  const palette = await Promise.all(PALETTE.map(([n, h]) => swatch(h, n)))

  const tileH = TILE + LABEL
  const rows = Math.ceil(tiles.length / COLS)
  const palRows = Math.ceil(palette.length / COLS)
  const width = COLS * TILE + (COLS + 1) * 10
  const height = 60 + rows * (tileH + 10) + 40 + palRows * (TILE / 3 + 10) + 10
  const composite = [
    { input: Buffer.from(`<svg width="${width}" height="50" xmlns="http://www.w3.org/2000/svg"><text x="10" y="34" font-family="Georgia" font-size="26" fill="#f3e6cf">Live Book — folha de contato dos assets</text></svg>`), top: 0, left: 0 },
    ...tiles.map((t, i) => ({ input: t, left: 10 + (i % COLS) * (TILE + 10), top: 60 + Math.floor(i / COLS) * (tileH + 10) })),
    ...palette.map((p, i) => ({ input: p, left: 10 + (i % COLS) * (TILE + 10), top: 60 + rows * (tileH + 10) + 40 + Math.floor(i / COLS) * (TILE / 3 + 10) })),
  ]
  const out = join(ROOT, 'shots', 'latest', 'assets_contact.png')
  mkdirSync(dirname(out), { recursive: true })
  await sharp({ create: { width, height, channels: 3, background: '#120c08' } }).composite(composite).png().toFile(out)
  console.log(`[contact] ${tiles.length} assets → ${out}`)
}

void main()
