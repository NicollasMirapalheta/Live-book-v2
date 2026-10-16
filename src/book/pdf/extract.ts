// PDF → positioned text runs and images, with pdf.js (spec Fase 5). pdf.js is loaded on demand: only a
// book with a PDF that is being opened pays for it.
import type { RawDoc, RawImage, RawItem, RawPage } from './types'

export interface Extracted {
  raw: RawDoc
  /** image id → drawable */
  images: Map<string, CanvasImageSource & { width: number; height: number }>
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
function toDrawable(img: ImageObject): (CanvasImageSource & { width: number; height: number }) | null {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0)
    return c
  }
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
  return c
}

export async function extractPdf(data: ArrayBuffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  // we only read text and images, never render glyphs: no font faces to load (that alone took seconds)
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true })
  const doc = await task.promise
  const OPS = pdfjs.OPS
  const pages: RawPage[] = []
  const images: Extracted['images'] = new Map()
  const timing = { ops: 0, text: 0, images: 0 }
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const view = page.getViewport({ scale: 1 })
      // the operator list loads the fonts (for bold/italic) and lists the images with their transforms
      let t = performance.now()
      const ops = await page.getOperatorList()
      timing.ops += performance.now() - t
      t = performance.now()
      const content = await page.getTextContent()
      timing.text += performance.now() - t
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
        const style = styleOf(it.fontName)
        items.push({ str: it.str, x: t[4], y: t[5], w: it.width, size: Math.hypot(t[2], t[3]) || Math.abs(t[3]), ...style })
      }
      const pageImages: RawImage[] = []
      let ctm: Matrix = [1, 0, 0, 1, 0, 0]
      const stack: Matrix[] = []
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        const args = ops.argsArray[i] as unknown[]
        if (fn === OPS.save) stack.push(ctm)
        else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
        else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix)
        else if (fn === OPS.paintImageXObject) {
          const objId = args[0] as string
          const ti = performance.now()
          const obj = await new Promise<ImageObject | null>((resolve) => {
            try {
              page.objs.get(objId, (o: ImageObject) => resolve(o))
            } catch {
              resolve(null)
            }
          })
          const drawable = obj && toDrawable(obj)
          timing.images += performance.now() - ti
          if (!drawable) continue
          const id = `${n}:${objId}`
          images.set(id, drawable)
          // the image fills the unit square under the current transform
          const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]]
          const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]]
          const x = Math.min(...xs)
          const y = Math.min(...ys)
          pageImages.push({ id, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
        }
      }
      pages.push({ width: view.width, height: view.height, items, images: pageImages })
      page.cleanup()
    }
    if (import.meta.env.DEV) console.info(`[pdf] leitura: operadores ${Math.round(timing.ops)} ms, texto ${Math.round(timing.text)} ms, imagens ${Math.round(timing.images)} ms`)
    const meta = await doc.getMetadata().catch(() => null)
    const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || undefined
    return { raw: { pages, title }, images }
  } finally {
    void task.destroy()
  }
}
