// npm run perf [-- --books 30] [--label nome] [--skip-build]
// Memória e tempo de quadro do build de produção num roteiro fixo, nos tiers high e low (plano de desempenho,
// docs/perf/medicoes.md). Memória: soma da árvore de processos do Chromium lançado (RAM privada e working set)
// e memória de vídeo dedicada por processo (contadores "GPU Process Memory" do Windows).
// Roteiro: N0 (olhar em volta) → N1 → N2 → livro na mão → aberto → 10 páginas → fechar → formulário.
// --books N grava N livros do usuário (PDF de 58 páginas + foto 4000×3000) antes de medir.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4180
const URL0 = `http://localhost:${PORT}`
const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const BOOKS = Number(arg('books') ?? 0)
const LABEL = arg('label') ?? new Date().toISOString().slice(0, 16)
// a common laptop: 1920×1080 screen at 125%
const VIEWPORT = { width: 1536, height: 864 }
const DPR = 1.25

// ---------------------------------------------------------------------------
// Memory of the browser's process tree (Windows)
// ---------------------------------------------------------------------------

interface ProcRow {
  ProcessId: number
  ParentProcessId: number
  WorkingSetSize: number
  PrivatePageCount: number
}

function ps(command: string): string {
  return execFileSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', maxBuffer: 64 << 20 })
}

/** The browser's main process: the one started with our profile folder and no --type (renderer, gpu…). */
function browserPid(profile: string): number {
  const rows = JSON.parse(
    ps("Get-CimInstance Win32_Process -Filter \"Name like '%chrom%'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"),
  ) as { ProcessId: number; CommandLine: string | null }[]
  const key = profile.replace(/\\/g, '/').toLowerCase()
  const main = [rows].flat().find((r) => {
    const cmd = (r.CommandLine ?? '').replace(/\\/g, '/').toLowerCase()
    return cmd.includes(key) && !cmd.includes('--type=')
  })
  if (!main) throw new Error('processo do navegador não encontrado')
  return main.ProcessId
}

function tree(root: number): ProcRow[] {
  const all = JSON.parse(
    ps('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount | ConvertTo-Json -Compress'),
  ) as ProcRow[]
  const out: ProcRow[] = []
  const want = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const p of all) {
      if (!want.has(p.ProcessId) && want.has(p.ParentProcessId)) {
        want.add(p.ProcessId)
        grew = true
      }
    }
  }
  for (const p of all) if (want.has(p.ProcessId)) out.push(p)
  return out
}

function gpuDedicated(pids: Set<number>): number {
  const raw = ps(
    "(Get-Counter '\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples | ForEach-Object { $_.InstanceName + ' ' + $_.CookedValue }",
  )
  let sum = 0
  for (const line of raw.split(/\r?\n/)) {
    const m = /^pid_(\d+)_\S+ (\d+(?:\.\d+)?)/.exec(line.trim())
    if (m && pids.has(Number(m[1]))) sum += Number(m[2])
  }
  return sum
}

const MB = (b: number) => Math.round(b / 1048576)

interface Sample {
  step: string
  privateMB: number
  workingSetMB: number
  gpuMB: number
  jsHeapMB: number
  textures: number
  calls: number
}

async function sample(step: string, pid: number, page: Page): Promise<Sample> {
  await page.waitForTimeout(1500)
  const procs = tree(pid)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const { metrics } = await cdp.send('Performance.getMetrics')
  await cdp.detach()
  const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0
  const stats = await page.evaluate(() => (window as unknown as { __SCENE_STATS__?: { textures: number; calls: number } }).__SCENE_STATS__ ?? null)
  const s: Sample = {
    step,
    privateMB: MB(procs.reduce((a, p) => a + Number(p.PrivatePageCount), 0)),
    workingSetMB: MB(procs.reduce((a, p) => a + Number(p.WorkingSetSize), 0)),
    gpuMB: MB(gpuDedicated(new Set(procs.map((p) => p.ProcessId)))),
    jsHeapMB: MB(heap),
    textures: stats?.textures ?? -1,
    calls: stats?.calls ?? -1,
  }
  console.log(`[perf]   ${step.padEnd(22)} RAM ${s.privateMB} MB · vídeo ${s.gpuMB} MB · heap ${s.jsHeapMB} MB · ${s.textures} texturas`)
  return s
}

// ---------------------------------------------------------------------------
// Frame times
// ---------------------------------------------------------------------------

interface Frames {
  what: string
  p50: number
  p95: number
  fps: number
}

/** Frame deltas for `ms` while `act` runs (drags the view, for instance). */
async function frames(page: Page, what: string, ms: number, act?: () => Promise<void>): Promise<Frames> {
  await page.evaluate((ms) => {
    const w = window as unknown as { __FRAMES__: number[] }
    w.__FRAMES__ = []
    let last = performance.now()
    const end = last + ms
    const tick = (t: number) => {
      w.__FRAMES__.push(t - last)
      last = t
      if (t < end) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  if (act) await act()
  await page.waitForTimeout(ms + 200)
  const d = (await page.evaluate(() => (window as unknown as { __FRAMES__: number[] }).__FRAMES__)).slice(1).sort((a, b) => a - b)
  const q = (p: number) => Math.round(d[Math.min(d.length - 1, Math.floor(p * d.length))] * 10) / 10
  const f: Frames = { what, p50: q(0.5), p95: q(0.95), fps: Math.round((d.length / d.reduce((a, b) => a + b, 0)) * 1000) }
  console.log(`[perf]   quadros ${what.padEnd(26)} p50 ${f.p50} ms · p95 ${f.p95} ms · ${f.fps} fps`)
  return f
}

async function lookAround(page: Page) {
  const { width, height } = VIEWPORT
  await page.mouse.move(width * 0.5, height * 0.5)
  await page.mouse.down()
  for (let i = 0; i <= 60; i++) await page.mouse.move(width * (0.5 - 0.35 * Math.sin((i / 60) * Math.PI * 2)), height * 0.5, { steps: 2 })
  await page.mouse.up()
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

const ready = (page: Page) => page.waitForFunction(() => window.__SCENE_READY__ === true, undefined, { timeout: 180_000 })
const navIdle = (page: Page) => page.waitForFunction(() => window.__NAV__ && !window.__NAV__.isTransitioning)

/** Puts `n` user books in IndexedDB (same records as the app writes, src/data/db.ts). */
async function seed(page: Page, n: number) {
  await page.evaluate(async (n) => {
    const pdf = await (await fetch('/books/fx-verde.pdf')).blob()
    const canvas = new OffscreenCanvas(4000, 3000)
    const c = canvas.getContext('2d')!
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `hsl(${(i * 37) % 360} 40% ${30 + (i % 40)}%)`
      c.fillRect(Math.random() * 4000, Math.random() * 3000, 300, 200)
    }
    const photo = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    const colors = ['bordo', 'verdeGarrafa', 'azulPetroleo', 'tabaco', 'mostardaVelha', 'couroNatural']
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('live-book', 2)
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('books')) r.result.createObjectStore('books', { keyPath: 'id' })
        if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files')
      }
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction('books', 'readwrite')
    for (let i = 0; i < n; i++) {
      tx.objectStore('books').put({
        id: `perf-${i}`,
        title: `Livro de medição ${i + 1}`,
        description: '',
        color: colors[i % colors.length],
        coverMaterial: i % 2 ? 'cloth' : 'leather',
        trim: 'medium',
        createdAt: i,
        pageCount: 58,
        pdf,
        pdfName: 'fx-verde.pdf',
        coverPhoto: photo,
      })
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, n)
}

interface Run {
  tier: string
  samples: Sample[]
  frames: Frames[]
}

async function run(tier: 'high' | 'low'): Promise<Run> {
  console.log(`[perf] tier ${tier}${BOOKS ? `, ${BOOKS} livros` : ''}`)
  const profile = mkdtempSync(join(tmpdir(), 'livebook-perf-'))
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    // no vsync cap: a fast GPU would sit at 60 fps and hide the differences between versions
    args: ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
  })
  // tsx compiles with keepNames: functions sent to the page reference a __name helper that is not there
  await ctx.addInitScript('window.__name = (f) => f')
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const pid = browserPid(profile)
  const samples: Sample[] = []
  const fr: Frames[] = []
  const q = `e2e=1&quality=${tier}`
  if (BOOKS) {
    await page.goto(`${URL0}/?${q}`)
    await ready(page)
    await seed(page, BOOKS)
  }
  await page.goto(`${URL0}/?${q}`)
  await ready(page)
  samples.push(await sample('N0 carregado', pid, page))
  fr.push(await frames(page, 'N0 parado', 3000))
  fr.push(await frames(page, 'N0 olhando em volta', 3000, () => lookAround(page)))
  samples.push(await sample('N0 depois de olhar', pid, page))

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Avançar' }).click()
    await navIdle(page)
  }
  await page.waitForFunction(() => (window.__SEL__?.order.length ?? 0) > 0)
  samples.push(await sample('N2 estante', pid, page))
  fr.push(await frames(page, 'N2 olhando em volta', 3000, () => lookAround(page)))

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.waitForFunction(() => {
    const c = (window as unknown as { __CONTENT__?: { status: (id: string) => string | null } }).__CONTENT__
    return c?.status(window.__SEL__!.selected!) !== 'loading'
  }, undefined, { timeout: 120_000 })
  samples.push(await sample('livro na mão', pid, page))

  await page.getByRole('button', { name: 'Abrir' }).click()
  await page.waitForFunction(() => window.__SEL__!.phase === 'open')
  await page.waitForTimeout(1500)
  samples.push(await sample('livro aberto', pid, page))
  fr.push(
    await frames(page, 'folheando', 4000, async () => {
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(250)
      }
    }),
  )
  samples.push(await sample('depois de 10 páginas', pid, page))

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__SEL__!.phase === 'hand')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__SEL__!.selected === null)
  samples.push(await sample('livro fechado', pid, page))

  await page.getByRole('button', { name: 'Novo livro' }).click()
  await page.waitForTimeout(2000)
  samples.push(await sample('formulário aberto', pid, page))
  fr.push(await frames(page, 'formulário aberto', 3000))
  await page.keyboard.press('Escape')

  // a slower machine: the CPU 4× slower, looking around at N2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  fr.push(await frames(page, 'N2 olhando, CPU 4× lenta', 4000, () => lookAround(page)))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
  return { tier, samples, frames: fr }
}

// ---------------------------------------------------------------------------

function table(r: Run): string {
  const lines = [
    `**${r.tier}**`,
    '',
    '| Passo | RAM privada | Working set | Vídeo dedicada | JS heap | Texturas |',
    '|---|---|---|---|---|---|',
    ...r.samples.map((s) => `| ${s.step} | ${s.privateMB} MB | ${s.workingSetMB} MB | ${s.gpuMB} MB | ${s.jsHeapMB} MB | ${s.textures} |`),
    '',
    '| Quadros | p50 | p95 | fps |',
    '|---|---|---|---|',
    ...r.frames.map((f) => `| ${f.what} | ${f.p50} ms | ${f.p95} ms | ${f.fps} |`),
  ]
  return lines.join('\n')
}

async function main() {
  if (!args.includes('--skip-build')) {
    console.log('[perf] build de produção (sem nuvem)')
    execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, VITE_SUPABASE_URL: 'off' },
    })
  }
  const server: ChildProcess = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' })
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(URL0)).ok) break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    const runs = [await run('high'), await run('low')]
    const md = [`### ${LABEL}${BOOKS ? ` — ${BOOKS} livros do usuário com foto` : ' — só os exemplos'}`, '', `Tela ${VIEWPORT.width}×${VIEWPORT.height} a ${DPR}× (1920×1080 a 125%).`, '', ...runs.map(table).flatMap((t) => [t, ''])].join('\n')
    const out = join(ROOT, 'shots', 'perf')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, `${LABEL.replace(/[^\w-]+/g, '_')}${BOOKS ? `_${BOOKS}livros` : ''}.json`), JSON.stringify(runs, null, 2))
    writeFileSync(join(out, 'latest.md'), md)
    console.log('\n' + md)
  } finally {
    // the preview server (and its node child) on Windows
    if (server.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* already gone */
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
