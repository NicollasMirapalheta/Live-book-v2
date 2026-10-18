// npm run pdf:probe -- <arquivo.pdf> [--src 1-6,40] [--book 1-12] [--trim medium|large] [--port 5198]
// Roda o pipeline real de PDF (extract → structure → paginate → drawPage) no Chromium, contra o servidor de
// desenvolvimento do Vite, e grava em shots/pdf-probe/<nome>/:
//   - structure.txt: blocos encontrados (títulos, parágrafos, imagens) e o sumário composto;
//   - src-NNN.png: páginas do PDF original (pdf.js) nas páginas pedidas em --src;
//   - book-NNN.png: páginas compostas do livro nas páginas pedidas em --book (pares lado a lado).
// Serve para ver, com PDFs de verdade, onde o analisador erra (docs/specs/fase-5-pdf-paginas.md).
import { spawn, type ChildProcess } from 'node:child_process'
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const file = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))
if (!file) {
  console.error('uso: npm run pdf:probe -- <arquivo.pdf> [--src 1-6] [--book 1-12] [--trim medium|large]')
  process.exit(2)
}
const PORT = Number(arg('port') ?? 5198)
const BASE = `http://localhost:${PORT}/`
const trim = arg('trim') ?? 'medium'

/** "1-6,40" → [1..6, 40] */
const range = (spec: string | undefined) =>
  (spec ?? '')
    .split(',')
    .filter(Boolean)
    .flatMap((part) => {
      const [a, b] = part.split('-').map(Number)
      return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k)
    })
const srcPages = range(arg('src'))
const bookPages = range(arg('book') ?? '1-12')
/** PDF pages whose text lines (size, position) are listed, to debug the headings */
const linePages = range(arg('lines'))

const name = basename(file).replace(/\.pdf$/i, '').replace(/[^\w-]+/g, '_').slice(0, 60)
const outDir = join(ROOT, 'shots', 'pdf-probe', name)
mkdirSync(outDir, { recursive: true })

async function up() {
  try {
    return (await fetch(BASE)).ok
  } catch {
    return false
  }
}

async function startServer(): Promise<ChildProcess | undefined> {
  if (await up()) return undefined
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 120; i++) {
    if (await up()) return child
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite não respondeu')
}

function stopServer(child: ChildProcess | undefined) {
  if (!child?.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill()
}

const server = await startServer()
// the PDF from a small server of its own (Playwright's route.fulfill does not take a 180 MB body)
const pdfServer = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'application/pdf', 'access-control-allow-origin': '*' })
  createReadStream(resolve(file)).pipe(res)
})
await new Promise<void>((r) => pdfServer.listen(PORT + 1, r))
const PDF_URL = `http://localhost:${PORT + 1}/probe.pdf`
const browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] })
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().startsWith('[pdf]')) console.log(`  [página] ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`  [erro] ${e}`))
  // tsx (esbuild keepNames) wraps the functions inside page.evaluate with __name
  await page.addInitScript('window.__name = (f) => f')
  // a blank same-origin HTML page: the modules are imported by URL from the dev server
  await page.route('**/__probe.html', (route) => route.fulfill({ body: '<!doctype html><title>probe</title>', contentType: 'text/html' }))
  await page.goto(`${BASE}__probe.html`)
  const t0 = Date.now()
  const result = await page.evaluate(
    async ({ srcPages, bookPages, linePages, trim, pdfUrl }) => {
      const imp = (p: string) => import(/* @vite-ignore */ p)
      const { loadPdfjs, openPdf, extractPdf } = await imp('/src/book/pdf/extract.ts')
      const { buildStructure } = await imp('/src/book/pdf/structure.ts')
      const { useBookContent } = await imp('/src/book/pdf/content.ts')
      const { drawPage } = await imp('/src/book/reader/pageContent.ts')
      const { TRIM_SIZES } = await imp('/src/book/geometry.ts')
      const t0 = performance.now()
      // the app's own path: the content store composes the book from its PDF
      const content = await useBookContent.getState().prepare({ id: 'probe', title: '', trim, pdfUrl })
      const t1 = performance.now()
      if (content.status !== 'ready') throw new Error(content.error)
      const layout = content.layout
      const { width, height } = TRIM_SIZES[trim]
      const book = { id: 'probe', title: layout.title, pageCount: layout.pageCount, layout, images: content.images, pdfPages: content.pdfPages }
      /** a page with its facsimile prints in (they arrive asynchronously) */
      const drawn = async (n: number, H: number) => {
        for (let k = 0; k < 30; k++) {
          const waiting: number[] = []
          const c = drawPage(book, n, width / height, H, waiting) as HTMLCanvasElement
          if (!waiting.length || !book.pdfPages) return c
          await new Promise<void>((r) => {
            const off = book.pdfPages.subscribe(() => {
              off()
              r()
            })
          })
        }
        return drawPage(book, n, width / height, H) as HTMLCanvasElement
      }
      const shots: Record<string, string> = {}
      const tr = performance.now()
      // spreads: verso (even) on the left, recto (odd) on the right
      const spreads = [...new Set(bookPages.map((a: number) => (a % 2 === 0 ? a : a - 1)))] as number[]
      for (const left of spreads) {
        const pair = [left, left + 1].filter((n) => n >= 1 && n <= layout.pageCount)
        const H = 1100
        const cs: HTMLCanvasElement[] = []
        for (const n of pair) cs.push(await drawn(n, H))
        const out = document.createElement('canvas')
        out.width = cs.reduce((s, c) => s + c.width, 0) + 10
        out.height = H
        const ctx = out.getContext('2d')!
        ctx.fillStyle = '#333'
        ctx.fillRect(0, 0, out.width, out.height)
        let x = left < 1 ? cs[0].width + 10 : 0
        for (const c of cs) {
          ctx.drawImage(c, x, 0)
          x += c.width + 10
        }
        shots[`book-${String(left).padStart(3, '0')}`] = out.toDataURL('image/png')
      }
      const renderMs = performance.now() - tr
      const data = srcPages.length || linePages.length || layout.mode === 'reflow' ? await (await fetch(pdfUrl)).arrayBuffer() : null
      if (data && srcPages.length) {
        const doc = await openPdf(await loadPdfjs(), data.slice(0))
        for (const n of srcPages) {
          if (n > doc.numPages) continue
          const pg = await doc.getPage(n)
          const vp = pg.getViewport({ scale: 1100 / pg.getViewport({ scale: 1 }).height })
          const c = document.createElement('canvas')
          c.width = vp.width
          c.height = vp.height
          await pg.render({ canvasContext: c.getContext('2d')!, canvas: c, viewport: vp }).promise
          shots[`src-${String(n).padStart(3, '0')}`] = c.toDataURL('image/png')
        }
        void doc.loadingTask.destroy()
      }
      // the blocks found, for a reflowed PDF
      let blocks: string[] = []
      if (data && linePages.length) {
        const { pageLines } = await imp('/src/book/pdf/structure.ts')
        const doc = await openPdf(await loadPdfjs(), data.slice(0))
        for (const n of linePages) {
          const pg = await doc.getPage(n)
          const view = pg.getViewport({ scale: 1 })
          const tc = await pg.getTextContent()
          const items = tc.items
            .filter((it: { str?: string }) => it.str)
            .map((it: { str: string; transform: number[]; width: number }) => {
              const [vx, vy] = view.convertToViewportPoint(it.transform[4], it.transform[5])
              return { str: it.str, x: vx, y: view.height - vy, w: it.width, size: Math.hypot(it.transform[2], it.transform[3]), bold: false, italic: false }
            })
          blocks.push(`--- página ${n} do PDF (${Math.round(view.width)}×${Math.round(view.height)})`)
          for (const l of pageLines({ width: view.width, height: view.height, items, images: [] }, n))
            blocks.push(`${l.size.toFixed(1).padStart(5)} y${Math.round(l.y).toString().padStart(4)} x${Math.round(l.x0).toString().padStart(4)}-${Math.round(l.x1)}  ${l.text}`)
        }
        void doc.loadingTask.destroy()
      }
      if (data && layout.mode === 'reflow') {
        const structure = buildStructure((await extractPdf(data.slice(0))).raw)
        blocks = structure.blocks.map((b: { type: string; level?: number; text?: string; number?: string; id?: string; aspect?: number }) =>
          b.type === 'heading'
            ? `${b.level === 1 ? '\n# ' : '## '}${b.number !== undefined ? `[${b.number}] ` : ''}${b.text}`
            : b.type === 'image'
              ? `[imagem ${b.id} ${b.aspect?.toFixed(2)}]`
              : `  ${b.text}`,
        )
      }
      return {
        summary: `${layout.mode}: ${layout.pageCount} páginas no livro · preparo ${Math.round(t1 - t0)} ms · ${content.images?.size ?? 0} imagens · ${bookPages.length} páginas desenhadas em ${Math.round(renderMs)} ms`,
        title: `título: ${layout.title || '—'} · subtítulo: ${layout.subtitle ?? '—'}`,
        toc: layout.toc.map((e: { title: string; page: number; chapter?: number }) => `${String(e.page).padStart(4)}  ${e.chapter ? `${e.chapter}. ` : ''}${e.title}`),
        blocks,
        shots,
      }
    },
    { srcPages, bookPages, linePages, trim, pdfUrl: PDF_URL },
  )
  console.log(result.summary)
  console.log(result.title)
  writeFileSync(join(outDir, 'structure.txt'), [result.summary, result.title, '', 'SUMÁRIO', ...result.toc, '', 'BLOCOS', ...result.blocks].join('\n'))
  for (const [k, url] of Object.entries(result.shots)) writeFileSync(join(outDir, `${k}.png`), Buffer.from(url.split(',')[1], 'base64'))
  console.log(`${Object.keys(result.shots).length} imagens e structure.txt em ${outDir} (${Math.round((Date.now() - t0) / 1000)} s)`)
} finally {
  await browser.close()
  pdfServer.close()
  stopServer(server)
}
