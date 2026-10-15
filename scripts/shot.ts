// npm run shot -- [--node N0|N1|N2|all] [--quality high|low] [--yaw d] [--pitch d] [--dev book] [--out dir] [--no-build]
// Screenshots of the scene (spec Fase 0 §7). Writes shots/<timestamp>/ and updates shots/latest/ file by file.
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from '@playwright/test'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const room = JSON.parse(readFileSync(join(ROOT, 'config', 'room.json'), 'utf8'))
const PORT = 4173
const BASE = `http://localhost:${PORT}/`

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const nodeArg = arg('node') ?? 'all'
const quality = arg('quality') ?? 'high'
const yaw = arg('yaw')
const pitch = arg('pitch')
const dev = arg('dev')
const noBuild = argv.includes('--no-build')
/** extra URL parameters: --query debug=lightmap */
const extraQuery = arg('query')
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = resolve(ROOT, arg('out') ?? join('shots', stamp))
const latestDir = join(ROOT, 'shots', 'latest')

const nodes: string[] = nodeArg === 'all' ? Object.keys(room.nodes) : [nodeArg]
for (const n of nodes) {
  if (!(n in room.nodes)) {
    console.error(`Nó desconhecido: ${n}`)
    process.exit(2)
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('close', (code) => res(code ?? 1))
  })
}

async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE)
    return r.ok
  } catch {
    return false
  }
}

async function startServer(): Promise<ChildProcess | undefined> {
  // vite preview serves dist/ from disk, so a running server picks up a fresh build
  if (!noBuild) {
    console.log('[shot] vite build…')
    if ((await run('npx', ['vite', 'build', '--logLevel', 'error'])) !== 0) throw new Error('vite build falhou')
  }
  if (await serverUp()) {
    console.log(`[shot] usando servidor já rodando em ${BASE}`)
    return undefined
  }
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  for (let i = 0; i < 60; i++) {
    if (await serverUp()) return child
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview não respondeu')
}

function stopServer(child: ChildProcess | undefined) {
  if (!child?.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill()
}

// ---------------------------------------------------------------------------
// Browser with a real GPU
// ---------------------------------------------------------------------------

const GPU_ATTEMPTS: { label: string; headless: boolean; args: string[] }[] = [
  { label: 'headless + ANGLE default', headless: true, args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'] },
  { label: 'headless + ANGLE d3d11', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  { label: 'headed', headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist'] },
]

const isSoftware = (gpu: string) => /swiftshader|llvmpipe|software|basic render/i.test(gpu)

async function probeGpu(browser: Browser): Promise<string> {
  const page = await browser.newPage()
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return 'no webgl2'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  })
  await page.close()
  return gpu
}

async function launch(): Promise<{ browser: Browser; gpu: string; mode: string }> {
  let last: { browser: Browser; gpu: string; mode: string } | undefined
  for (const attempt of GPU_ATTEMPTS) {
    const browser = await chromium.launch({ headless: attempt.headless, args: attempt.args })
    const gpu = await probeGpu(browser)
    console.log(`[shot] ${attempt.label}: ${gpu}`)
    if (!isSoftware(gpu)) {
      await last?.browser.close()
      return { browser, gpu, mode: attempt.label }
    }
    await last?.browser.close()
    last = { browser, gpu, mode: attempt.label }
  }
  console.warn('[shot] AVISO: só há renderização por software (SwiftShader).')
  return last!
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

interface Capture {
  file: string
  stats: unknown
  consoleErrors: string[]
}

async function capture(browser: Browser, url: string, width: number, height: number, file: string): Promise<Capture> {
  const page: Page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(url)
  await page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 180_000 })
  // a selection animates the book out of the shelf: let it settle before measuring and capturing
  if (url.includes('select=')) await page.waitForTimeout(2500)
  const stats = await page.evaluate(() => window.__SCENE_STATS__)
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file })
  await page.close()
  return { file, stats, consoleErrors }
}

const relLum = (r: number, g: number, b: number) => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

async function luminance(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const values = new Float32Array(info.width * info.height)
  for (let i = 0, p = 0; i < values.length; i++, p += info.channels) values[i] = relLum(data[p], data[p + 1], data[p + 2])
  values.sort()
  return { min: values[0], p0_5: values[Math.floor(values.length * 0.005)] }
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const DARKEST = relLum(...hex(room.lighting.darkestShadowHex))

async function compare(browser: Browser, approvalFile: string, file: string) {
  const ref = readFileSync(join(ROOT, 'docs', 'referencia.jpg')).toString('base64')
  const ours = readFileSync(approvalFile).toString('base64')
  const page = await browser.newPage({ viewport: { width: 2040, height: 1170 } })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#1b1410;color:#e9dcc4;font:16px Georgia,serif">
    <div style="display:flex;gap:20px;padding:20px">
      <figure style="margin:0"><img src="data:image/jpeg;base64,${ref}" style="width:1000px;height:1084px;object-fit:fill;display:block"><figcaption style="padding-top:8px">Referência</figcaption></figure>
      <figure style="margin:0"><img src="data:image/png;base64,${ours}" style="width:1000px;height:1084px;display:block"><figcaption style="padding-top:8px">N0 — ${stamp}</figcaption></figure>
    </div></body></html>`)
  await page.waitForLoadState('load')
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
}

function query(extra: Record<string, string | undefined>) {
  const q = new URLSearchParams({ shot: '1', quality })
  if (extraQuery) for (const [k, v] of new URLSearchParams(extraQuery)) q.set(k, v)
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) q.set(k, v)
  return `${BASE}?${q}`
}

const BOOK_PRESETS = ['book_48_bordo_couro', 'book_220_verde_tecido', 'book_640_couro_natural']

async function main() {
  mkdirSync(outDir, { recursive: true })
  const server = await startServer()
  const { browser, gpu, mode } = await launch()
  const report: Record<string, unknown> = { at: new Date().toISOString(), quality, gpu, browserMode: mode, darkestAllowed: DARKEST, shots: {} }
  const shots = report.shots as Record<string, unknown>
  const written: string[] = []
  let failed = false

  try {
    if (dev === 'book') {
      for (let i = 0; i < BOOK_PRESETS.length; i++) {
        const file = join(outDir, 'book', `${BOOK_PRESETS[i]}.png`)
        const c = await capture(browser, query({ dev: 'book', preset: String(i) }), 1920, 1080, file)
        shots[`book/${BOOK_PRESETS[i]}`] = { stats: c.stats, consoleErrors: c.consoleErrors }
        written.push(file)
      }
    } else {
      const { width, height, approval } = room.screenshot
      for (const node of nodes) {
        const file = join(outDir, `${node}.png`)
        const c = await capture(browser, query({ node, yaw, pitch }), width, height, file)
        const lum = await luminance(file)
        shots[node] = { stats: c.stats, luminance: lum, tooDark: lum.p0_5 < DARKEST * 0.9, consoleErrors: c.consoleErrors }
        written.push(file)
        if (node === 'N0') {
          const approvalFile = join(outDir, 'N0_approval.png')
          const a = await capture(browser, query({ node, yaw, pitch, approval: '1' }), approval.width, approval.height, approvalFile)
          const aLum = await luminance(approvalFile)
          shots.N0_approval = { stats: a.stats, luminance: aLum, tooDark: aLum.p0_5 < DARKEST * 0.9, consoleErrors: a.consoleErrors }
          const compareFile = join(outDir, 'compare_N0.png')
          await compare(browser, approvalFile, compareFile)
          written.push(approvalFile, compareFile)
        }
      }
    }
  } catch (err) {
    console.error('[shot] falhou:', err)
    failed = true
  } finally {
    await browser.close()
    stopServer(server)
  }

  const statsName = dev === 'book' ? join('book', 'stats.json') : 'stats.json'
  const statsFile = join(outDir, statsName)
  mkdirSync(dirname(statsFile), { recursive: true })
  writeFileSync(statsFile, JSON.stringify(report, null, 2))
  written.push(statsFile)

  // look-dev/debug runs (--out or --query) never overwrite shots/latest
  const updateLatest = !arg('out') && !extraQuery
  for (const file of updateLatest ? written : []) {
    const target = join(latestDir, relative(outDir, file))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(file, target)
  }

  for (const [name, s] of Object.entries(shots)) {
    const shot = s as { stats?: { calls: number }; tooDark?: boolean; luminance?: { p0_5: number }; consoleErrors: string[] }
    const flags = [shot.tooDark ? 'ESCURO DEMAIS' : '', shot.consoleErrors.length ? `${shot.consoleErrors.length} erro(s) no console` : '']
      .filter(Boolean)
      .join(', ')
    console.log(`[shot] ${name}: ${shot.stats?.calls ?? '?'} draw calls${shot.luminance ? `, lum p0.5=${shot.luminance.p0_5.toFixed(4)}` : ''}${flags ? ` — ${flags}` : ''}`)
    for (const e of shot.consoleErrors.slice(0, 3)) console.log(`         console: ${e.slice(0, 200)}`)
  }
  console.log(`[shot] GPU: ${gpu}`)
  console.log(`[shot] ${relative(ROOT, outDir)}${updateLatest ? ' → shots/latest/' : ' (shots/latest intocado)'}`)
  process.exit(failed ? 1 : 0)
}

declare global {
  interface Window {
    __SCENE_READY__?: boolean
    __SCENE_STATS__?: unknown
  }
}

void main()
