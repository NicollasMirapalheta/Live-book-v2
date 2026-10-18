// PDF → positioned text runs and images, with pdf.js (spec Fase 5). pdf.js is loaded on demand: only a
// book with a PDF that is being opened pays for it. First a sample of pages says what kind of PDF this is
// (facsimile.ts: text to set again, a scan or a laid-out book); a facsimile only needs the text positions
// and keeps the document open to draw its pages on demand.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { classifyPages, type PageStats } from './facsimile'
import type { FacsimileDoc, FacsimilePage, OutlineEntry, PdfMode, RawDoc, RawImage, RawItem, RawPage } from './types'

export interface Extracted {
  mode: PdfMode
  /** the text and images to set again ('reflow'; no pages otherwise) */
  raw: RawDoc
  /** image id → drawable */
  images: Map<string, CanvasImageSource & { width: number; height: number }>
  /** 'scan' and 'designed': the pages as they are */
  facsimile?: FacsimileDoc
  /** 'scan' and 'designed': the open document, to draw its pages from (the caller destroys it) */
  doc?: PDFDocumentProxy
  outline: OutlineEntry[]
}

type Matrix = [number, number, number, number, number, number]
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]

interface ImageObject {
  width: number
  height: number
  bitmap?: ImageBitmap
  data?: Uint8ClampedArray
  /** 1 grayscale 1 bpp, 2 RGB 24 bpp, 3 RGBA 32 bpp */
  kind?: number
}

/** pdf.js image data → our own canvas (pdf.js closes its ImageBitmaps when the document is released). */
function toDrawable(img: ImageObject): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  if (img.bitmap) {
    // drawn straight at the final size: no full-resolution copy of a large scan
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.bitmap, 0, 0, c.width, c.height)
    return c
  }
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  if (!img.data) return null
  const out = ctx.createImageData(img.width, img.height)
  const n = img.width * img.height
  const src = img.data
  if (img.kind === 3) out.data.set(src.subarray(0, n * 4))
  else if (img.kind === 2) {
    for (let i = 0; i < n; i++) {
      out.data[i * 4] = src[i * 3]
      out.data[i * 4 + 1] = src[i * 3 + 1]
      out.data[i * 4 + 2] = src[i * 3 + 2]
      out.data[i * 4 + 3] = 255
    }
  } else {
    // 1 bpp, rows padded to bytes
    const row = (img.width + 7) >> 3
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const v = (src[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0
        const i = (y * img.width + x) * 4
        out.data[i] = out.data[i + 1] = out.data[i + 2] = v
        out.data[i + 3] = 255
      }
  }
  ctx.putImageData(out, 0, 0)
  return fit(c)
}

/** Images larger than a page texture needs are scaled down first (the pixel passes run on the main thread). */
const MAX_SIDE = 1400
function fit(c: HTMLCanvasElement): HTMLCanvasElement {
  const k = MAX_SIDE / Math.max(c.width, c.height)
  if (k >= 1) return c
  const out = document.createElement('canvas')
  out.width = Math.round(c.width * k)
  out.height = Math.round(c.height * k)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, out.width, out.height)
  return out
}

/**
 * Drawings on a plain light background: crop the empty margins and bring the background to white, so the
 * image prints on the book's paper (multiply) instead of sitting there as a pasted box. Photos (a busy or
 * dark background) are left as they are. Returns the crop as fractions of the original.
 */
export function trimBackground(c: HTMLCanvasElement): { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } {
  const ctx = c.getContext('2d')!
  const { width: W, height: H } = c
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const px = (x: number, y: number) => {
    const i = (y * W + x) * 4
    return [d[i], d[i + 1], d[i + 2]]
  }
  const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)]
  const bg = [0, 1, 2].map((k) => corners.reduce((a, c2) => a + c2[k], 0) / 4)
  const uniform = corners.every((c2) => c2.every((v, k) => Math.abs(v - bg[k]) < 14))
  const light = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] > 170
  if (!uniform || !light) return { canvas: c, x: 0, y: 0, w: 1, h: 1 }
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  if (x1 < 0) return { canvas: c, x: 0, y: 0, w: 1, h: 1 }
  const pad = Math.round(Math.max(W, H) * 0.02)
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(W - 1, x1 + pad)
  y1 = Math.min(H - 1, y1 + pad)
  // background → white (per channel), so multiply leaves the paper untouched there
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, (d[i + k] * 255) / Math.max(1, bg[k]))
  ctx.putImageData(img, 0, 0)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return { canvas: out, x: x0 / W, y: y0 / H, w: out.width / W, h: out.height / H }
}

/** An image object from pdf.js, or null if it does not arrive in time (never wait forever on one image). */
function imageObject(objs: { get: (id: string, cb: (o: ImageObject) => void) => unknown }, id: string, timeout = 5000): Promise<ImageObject | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout)
    try {
      objs.get(id, (o) => {
        clearTimeout(timer)
        resolve(o)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

/** pdf.js with its worker, loaded on demand. */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

type Pdfjs = Awaited<ReturnType<typeof loadPdfjs>>

/** Opens a PDF. Glyphs are drawn as paths (no font faces to load: that alone took seconds). */
export function openPdf(pdfjs: Pdfjs, data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // wasm decoders for scanned images (JBIG2, JPEG 2000) and ICC colours (vite.config.ts serves them)
  const wasmUrl = `${import.meta.env.BASE_URL}pdfjs-wasm/`
  return pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, wasmUrl }).promise
}

/** The PDF's outline, each entry resolved to its page (entries without a page are left out). */
async function readOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const out: OutlineEntry[] = []
  const tree = await doc.getOutline().catch(() => null)
  const walk = async (items: NonNullable<typeof tree>, depth: number) => {
    for (const it of items) {
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        const ref = dest?.[0]
        const index = ref == null ? -1 : typeof ref === 'number' ? ref : await doc.getPageIndex(ref)
        const title = it.title.replace(/\s+/g, ' ').trim()
        if (index >= 0 && title) out.push({ title, page: index + 1, depth })
      } catch {
        // a broken destination: the entry is left out
      }
      if (it.items?.length && depth < 2) await walk(it.items, depth + 1)
    }
  }
  if (tree) await walk(tree, 0)
  return out
}

interface PageImage {
  objId: string
  x: number
  y: number
  w: number
  h: number
}

/** The images a page paints (boxes through nested transforms and forms) and whether it sets invisible text (an OCR layer). */
function walkOps(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Pdfjs['OPS']) {
  const images: PageImage[] = []
  let invisible = false
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix)
    else if (fn === OPS.paintFormXObjectBegin) {
      // a form draws in its own space: save + its matrix (as pdf.js does)
      stack.push(ctm)
      const m = args[0] as ArrayLike<number> | null
      if (m && m.length === 6) ctm = mul(ctm, Array.from(m) as Matrix)
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (fn === OPS.setTextRenderingMode) invisible ||= args[0] === 3 || args[0] === 7
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintInlineImageXObject) {
      // the image fills the unit square under the current transform
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]]
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]]
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const objId = fn === OPS.paintImageXObject ? (args[0] as string) : ''
      images.push({ objId, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
    }
  }
  return { images, invisible }
}

/** Share of the page an image covers (clipped to the page). */
function coverage(im: PageImage, width: number, height: number) {
  const w = Math.max(0, Math.min(width, im.x + im.w) - Math.max(0, im.x))
  const h = Math.max(0, Math.min(height, im.y + im.h) - Math.max(0, im.y))
  return (w * h) / (width * height)
}

/**
 * Text runs of a page, bold/italic from the font names. With `view`, positions are in the page as shown
 * (rotation and crop box applied), y up from its bottom left.
 */
async function pageText(page: PDFPageProxy, view?: { convertToViewportPoint: (x: number, y: number) => number[]; height: number }): Promise<RawItem[]> {
  const content = await page.getTextContent()
  const fontStyle = new Map<string, { bold: boolean; italic: boolean }>()
  const styleOf = (fontName: string) => {
    let s = fontStyle.get(fontName)
    if (!s) {
      let name = ''
      try {
        name = (page.commonObjs.get(fontName) as { name?: string } | undefined)?.name ?? ''
      } catch {
        // font not loaded: no style information
      }
      s = { bold: /bold|black|heavy|semibold/i.test(name), italic: /italic|oblique/i.test(name) }
      fontStyle.set(fontName, s)
    }
    return s
  }
  const items: RawItem[] = []
  for (const it of content.items) {
    if (!('str' in it) || !it.str) continue
    const t = it.transform as number[]
    let x = t[4]
    let y = t[5]
    if (view) {
      const [vx, vy] = view.convertToViewportPoint(x, y)
      x = vx
      y = view.height - vy
    }
    items.push({ str: it.str, x, y, w: it.width, size: Math.hypot(t[2], t[3]) || Math.abs(t[3]), ...styleOf(it.fontName) })
  }
  return items
}

/** Up to `n` page numbers spread through the document, leaving out the covers when there are enough pages. */
export function samplePages(count: number, n = 12): number[] {
  const from = count > 4 ? 2 : 1
  const to = count > 4 ? count - 1 : count
  const span = to - from + 1
  if (span <= n) return Array.from({ length: span }, (_, k) => from + k)
  return Array.from({ length: n }, (_, k) => from + Math.round((k * (span - 1)) / (n - 1)))
}

/** Reads the PDF page by page; `onProgress` gets 0..1 after each page. */
export async function extractPdf(data: ArrayBuffer, onProgress?: (done: number) => void): Promise<Extracted> {
  const pdfjs = await loadPdfjs()
  const doc = await openPdf(pdfjs, data)
  const OPS = pdfjs.OPS
  let keepOpen = false
  try {
    const outline = await readOutline(doc)
    const meta = await doc.getMetadata().catch(() => null)
    const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || undefined

    // what kind of PDF: a sample of pages, their images and text
    const stats: PageStats[] = []
    for (const n of samplePages(doc.numPages)) {
      const page = await doc.getPage(n)
      const view = page.getViewport({ scale: 1 })
      const { images, invisible } = walkOps(await page.getOperatorList(), OPS)
      const chars = (await page.getTextContent()).items.reduce((acc, it) => acc + ('str' in it ? it.str.trim().length : 0), 0)
      const covers = images.map((im) => coverage(im, view.width, view.height))
      stats.push({ cover: Math.max(0, ...covers), imageArea: Math.min(1, covers.reduce((a, b) => a + b, 0)), chars, invisible })
      page.cleanup()
    }
    const mode = classifyPages(stats)
    if (import.meta.env.DEV) console.info(`[pdf] tipo: ${mode}`)

    if (mode !== 'reflow') {
      // a facsimile: the text only finds the chapters (and, in a scan, where the printed page is)
      const pages: FacsimilePage[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        const view = page.getViewport({ scale: 1 })
        pages.push({ width: view.width, height: view.height, items: await pageText(page, view) })
        page.cleanup()
        onProgress?.(n / doc.numPages)
      }
      keepOpen = true
      return { mode, raw: { pages: [], title }, images: new Map(), facsimile: { mode, pages, outline, title }, doc, outline }
    }

    const pages: RawPage[] = []
    const images: Extracted['images'] = new Map()
    const timing = { ops: 0, text: 0, images: 0 }
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const view = page.getViewport({ scale: 1 })
      // the operator list loads the fonts (for bold/italic) and lists the images with their transforms
      let t = performance.now()
      const ops = walkOps(await page.getOperatorList(), OPS)
      timing.ops += performance.now() - t
      t = performance.now()
      const items = await pageText(page)
      timing.text += performance.now() - t
      const pageChars = items.reduce((acc, it) => acc + it.str.length, 0)
      const pageImages: RawImage[] = []
      for (const { objId, x, y, w, h } of ops.images) {
        if (!objId) continue
        // not content: an image shared between pages (letterhead, logo, watermark: pdf.js keeps those in
        // commonObjs) or one covering most of a page that also has text (a background or the scan under an
        // OCR text layer)
        const shared = objId.startsWith('g_') || page.commonObjs.has(objId)
        const background = (w * h) / (view.width * view.height) > 0.5 && pageChars > 80
        if (shared || background) continue
        const ti = performance.now()
        const obj = await imageObject(page.objs, objId)
        const drawable = obj && toDrawable(obj)
        if (!drawable) continue
        const trim = trimBackground(drawable)
        timing.images += performance.now() - ti
        const id = `${n}:${objId}`
        images.set(id, trim.canvas)
        // the crop, in PDF units (y up: the canvas top is the box top)
        pageImages.push({ id, x: x + w * trim.x, y: y + h * (1 - trim.y - trim.h), w: w * trim.w, h: h * trim.h })
      }
      pages.push({ width: view.width, height: view.height, items, images: pageImages })
      page.cleanup()
      onProgress?.(n / doc.numPages)
    }
    if (import.meta.env.DEV) console.info(`[pdf] leitura: operadores ${Math.round(timing.ops)} ms, texto ${Math.round(timing.text)} ms, imagens ${Math.round(timing.images)} ms`)
    return { mode, raw: { pages, title }, images, outline }
  } finally {
    if (!keepOpen) void doc.loadingTask.destroy()
  }
}
