// The printed pages of a facsimile book (facsimile.ts), drawn from the open PDF when a page texture asks for
// them: one render at a time, the most recent request first (the page being looked at), the next pages
// after it, and a small cache. A scan's paper is brought to white so it prints on the book's paper
// (multiply); a laid-out page is drawn as it is.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Unit } from './facsimile'

export type Drawable = CanvasImageSource & { width: number; height: number }

/** What the page drawing (reader/pageContent.ts) needs from a facsimile. */
export interface PdfPageSource {
  /**
   * The region of `unit` drawn about `px` tall, or undefined while it renders (it is then requested, unless
   * `request` is false: the show-through of the other side of the sheet never asks for a render).
   */
  get(unit: number, px: number, request?: boolean): Drawable | undefined
  /** called with the unit each time a render lands */
  subscribe(cb: (unit: number) => void): () => void
  destroy(): void
}

/** renders kept (a 1.5K page ≈ 6 MB): the open spread, the sheet in the air and the next ones */
const KEEP = 10
/** sizes are rounded up to steps: nearby requests share a render */
const STEP = 128
const MAX_PX = 2048
/** pages after the one requested that are rendered next */
const AHEAD = 2

export class PdfPages implements PdfPageSource {
  private cache = new Map<string, Drawable>()
  private queue: { key: string; unit: number; px: number }[] = []
  private busy = false
  private listeners = new Set<(unit: number) => void>()
  private dead = false
  private doc: PDFDocumentProxy
  private units: Unit[]
  private whiten: boolean

  constructor(doc: PDFDocumentProxy, units: Unit[], whiten: boolean) {
    this.doc = doc
    this.units = units
    this.whiten = whiten
  }

  get(unit: number, px: number, request = true): Drawable | undefined {
    const size = Math.min(MAX_PX, Math.ceil(px / STEP) * STEP)
    const key = `${unit}@${size}`
    const hit = this.cache.get(key)
    if (hit) {
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    if (!request) {
      // any size of this unit will do for a faint show-through
      for (const [k, v] of this.cache) if (k.startsWith(`${unit}@`)) return v
      return undefined
    }
    // the pages after it first (they wait at the bottom), then this one on top
    for (let k = AHEAD; k >= 1; k--) if (unit + k < this.units.length) this.enqueue(unit + k, size, false)
    this.enqueue(unit, size, true)
    void this.pump()
    return undefined
  }

  subscribe(cb: (unit: number) => void) {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }

  destroy() {
    this.dead = true
    this.queue = []
    this.cache.clear()
    this.listeners.clear()
    void this.doc.loadingTask.destroy()
  }

  private enqueue(unit: number, px: number, top: boolean) {
    const key = `${unit}@${px}`
    if (this.cache.has(key)) return
    const at = this.queue.findIndex((q) => q.key === key)
    if (at >= 0) {
      if (!top) return
      this.queue.splice(at, 1)
    }
    if (top) this.queue.push({ key, unit, px })
    else this.queue.unshift({ key, unit, px })
    // a fast riffle asks for many pages: the oldest requests are no longer looked at
    if (this.queue.length > 24) this.queue.splice(0, this.queue.length - 24)
  }

  private async pump() {
    if (this.busy) return
    this.busy = true
    try {
      while (this.queue.length && !this.dead) {
        const job = this.queue.pop()!
        if (this.cache.has(job.key)) continue
        const canvas = await this.render(job.unit, job.px).catch((err: unknown) => {
          console.warn('[pdf] página não desenhada', job.unit, err)
          return null
        })
        if (!canvas || this.dead) continue
        this.cache.set(job.key, canvas)
        while (this.cache.size > KEEP) this.cache.delete(this.cache.keys().next().value as string)
        for (const cb of this.listeners) cb(job.unit)
      }
    } finally {
      this.busy = false
    }
  }

  private async render(unit: number, px: number): Promise<HTMLCanvasElement> {
    const u = this.units[unit]
    const page = await this.doc.getPage(u.page)
    try {
      const base = page.getViewport({ scale: 1 })
      // the unit is in the page as shown, y up; the viewport is y down from the top
      const scale = px / (u.y1 - u.y0)
      const viewport = page.getViewport({ scale, offsetX: -u.x0 * scale, offsetY: -(base.height - u.y1) * scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round((u.x1 - u.x0) * scale))
      canvas.height = Math.max(1, Math.round(px))
      const ctx = canvas.getContext('2d', { willReadFrequently: this.whiten })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
      if (this.whiten) whitenPaper(ctx, canvas.width, canvas.height)
      return canvas
    } finally {
      // decoded scans are large: let pdf.js drop them (a later size decodes again)
      page.cleanup()
    }
  }
}

/**
 * A scan's paper (its brightest common tone, per channel) becomes white and the light speckle with it, so
 * multiplying onto the book's paper leaves only the ink.
 */
export function whitenPaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  // the paper: the 75th percentile of each channel (a page is mostly paper)
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let n = 0
  for (let i = 0; i < d.length; i += 16) {
    hist[0][d[i]]++
    hist[1][d[i + 1]]++
    hist[2][d[i + 2]]++
    n++
  }
  const paper = hist.map((hc) => {
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hc[v]
      if (acc >= n * 0.75) return Math.max(v, 96)
    }
    return 255
  })
  // per channel: paper → white, a little past it so the speckle goes too; the ink keeps its darkness
  const lut = paper.map((p) => {
    const t = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) t[v] = Math.round(Math.min(1, v / (p * 0.94)) ** 1.15 * 255)
    return t
  })
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[0][d[i]]
    d[i + 1] = lut[1][d[i + 1]]
    d[i + 2] = lut[2][d[i + 2]]
  }
  ctx.putImageData(img, 0, 0)
}
