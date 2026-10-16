// PLACEHOLDER: provisional page content (spec Fase 4) until the PDF pages arrive in Fase 5.
// Each page is drawn on a canvas in the panel's typography: title page, running head, justified body text
// and the page number, on cream paper with a soft gutter shadow on the binding side.
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { PAGE, type BookLayout, type FontSpec, type Measure } from '../pdf/paginate'
import { chapterAt } from './toc'

/** page texture height (px): 1.5K on the high tier, 1K on the low tier (budget: ≤ 2K / 1K) */
export const PAGE_TEX_HEIGHT = { high: 1536, low: 1024 } as const

// greyed cream, a step under the room's highlights: #EFE5CF came out peach and brighter than the windows
const PAPER = '#DDD0B4'
// darker than before: through mipmaps, AgX and the DOF the ink read washed out
const INK = '#1E130B'
const INK_SOFT = '#5A4535'
const INK_HEAD = '#3D2C1F'
const SERIF = "Georgia, 'Times New Roman', serif"

// sample prose for the provisional pages (original text, written for this project)
const PARAGRAPHS = [
  'A casa ficava no fim da rua de pedras, onde a luz da tarde entrava inclinada pelas janelas altas e pousava devagar sobre a estante. Ali, cada livro guardava uma estação inteira: os cheiros, as vozes, o barulho da chuva no telhado.',
  'Abrir um caderno antigo é como abrir uma janela para dentro. As margens trazem anotações apressadas, datas que já não dizem nada a ninguém, pequenos desenhos de plantas e de caminhos que talvez nunca tenham existido.',
  'Naquele verão aprendemos a esperar. Esperar a fruta amadurecer, a carta chegar, a tinta secar na página antes de virar a folha. O tempo tinha outra espessura, e as horas se empilhavam como papel.',
  'Há fotografias que não mostram o que aconteceu, mas o que quisemos lembrar. A moldura branca da polaroide recorta um instante e o devolve mais quente, mais calmo, um pouco desbotado nas bordas.',
  'Quando a noite caía, acendíamos as velas do candelabro e líamos em voz alta. As sombras dos livros cresciam na parede, e cada história parecia pertencer à sala tanto quanto a nós.',
  'Guardei as cartas numa caixa de lata, amarradas com barbante. Algumas têm selos de lugares que hoje mudaram de nome; outras foram escritas a lápis, às pressas, no balcão de uma estação.',
  'De manhã cedo o jardim parecia outro. O orvalho pesava nas folhas, as abelhas ainda não tinham chegado e o portão rangia como se acordasse junto conosco.',
  'Minha avó dizia que todo livro tem uma página preferida, aquela em que ele se abre sozinho. A dela era uma receita de bolo, manchada de farinha e de dedos apressados.',
  'O mapa da viagem ainda está dobrado no fundo da gaveta, com as estradas marcadas a lápis. Algumas cidades têm um círculo; outras, apenas um ponto de interrogação e o desenho torto de uma árvore.',
]

function hashSeed(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Justified paragraph; returns the y after the last line. */
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineH: number, maxY: number, indent: number) {
  const words = text.split(/\s+/)
  let line: string[] = []
  let first = true
  const lineWidth = (ws: string[]) => ctx.measureText(ws.join(' ')).width
  const flush = (last: boolean) => {
    const x0 = x + (first ? indent : 0)
    const avail = width - (first ? indent : 0)
    if (last || line.length < 2) {
      ctx.fillText(line.join(' '), x0, y)
    } else {
      const wordsW = line.reduce((acc, w) => acc + ctx.measureText(w).width, 0)
      const gap = (avail - wordsW) / (line.length - 1)
      let cx = x0
      for (const w of line) {
        ctx.fillText(w, cx, y)
        cx += ctx.measureText(w).width + gap
      }
    }
    y += lineH
    first = false
    line = []
  }
  for (const w of words) {
    if (y > maxY) return y
    const avail = width - (first ? indent : 0)
    if (line.length && lineWidth([...line, w]) > avail) flush(false)
    line.push(w)
  }
  if (line.length && y <= maxY) flush(true)
  return y
}

export interface PageBook {
  id: string
  title: string
  subtitle?: string
  pageCount: number
  /** the PDF composed into pages (Fase 5); without it the provisional pages are drawn */
  layout?: BookLayout
  images?: Map<string, CanvasImageSource & { width: number; height: number }>
}

const fontCss = (f: FontSpec, H: number) => `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size * H}px ${SERIF}`

/** Text measure for the composition, in page units (the canvas measures at a fixed reference size). */
export function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d')!
  const REF = 1000
  return (text, font) => {
    ctx.font = fontCss(font, REF)
    return ctx.measureText(text).width / REF
  }
}

/** A composed page (pdf/paginate.ts): running head, lines, headings, images, folio. */
function drawPlan(ctx: CanvasRenderingContext2D, book: PageBook, layout: BookLayout, page: number, W: number, H: number) {
  const plan = layout.pages[page - 1]
  if (!plan) return
  const recto = page % 2 === 1
  const left = W * (recto ? PAGE.inner : PAGE.outer)
  const textW = W * (1 - PAGE.inner - PAGE.outer)
  ctx.textBaseline = 'alphabetic'
  if (plan.head) {
    ctx.fillStyle = INK_HEAD
    ctx.textAlign = 'center'
    ctx.font = fontCss({ size: 0.021, italic: true }, H)
    ctx.fillText(plan.head, left + textW / 2, H * PAGE.head, textW)
  }
  for (const it of plan.items) {
    if (it.kind === 'line') {
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      ctx.font = fontCss(it.font, H)
      const x0 = left + it.x * H
      if (!it.justify || it.words.length < 2) {
        ctx.fillText(it.words.join(' '), x0, it.y * H)
        continue
      }
      const widths = it.words.map((w) => ctx.measureText(w).width)
      const gap = (it.width * H - widths.reduce((a, b) => a + b, 0)) / (it.words.length - 1)
      let x = x0
      it.words.forEach((w, i) => {
        ctx.fillText(w, x, it.y * H)
        x += widths[i] + gap
      })
    } else if (it.kind === 'text') {
      ctx.fillStyle = it.font.size < 0.02 ? INK_SOFT : INK
      ctx.textAlign = it.align
      ctx.font = fontCss(it.font, H)
      const text = it.text.startsWith('CAPÍTULO') ? it.text.split('').join(String.fromCharCode(8202)) : it.text
      ctx.fillText(text, left + it.x * H, it.y * H, textW)
    } else if (it.kind === 'image') {
      const img = book.images?.get(it.id)
      if (!img) continue
      // printed on the paper, not pasted on it: ink multiplies (white leaves the paper as it is)
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(img, left + it.x * H, it.y * H, it.w * H, it.h * H)
      ctx.restore()
    } else {
      ctx.strokeStyle = '#A5824B'
      ctx.lineWidth = Math.max(1, H / 600)
      ctx.beginPath()
      ctx.moveTo(left + it.x0 * H, it.y * H)
      ctx.lineTo(left + it.x1 * H, it.y * H)
      ctx.stroke()
    }
  }
  if (plan.folio) {
    ctx.fillStyle = INK_SOFT
    ctx.textAlign = 'center'
    ctx.font = fontCss({ size: 0.02 }, H)
    ctx.fillText(String(page), left + textW / 2, H * PAGE.folio)
  }
}

/**
 * Draws page `page` (1-based) of the book. Odd pages are rectos (binding on the left of the image),
 * even pages versos (binding on the right). Pages past pageCount are blank paper.
 */
export function drawPage(book: PageBook, page: number, aspect: number, H: number = PAGE_TEX_HEIGHT.high): HTMLCanvasElement {
  const W = Math.round(H * aspect)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const r = rand(hashSeed(`${book.id}:${page}`))

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)
  // paper fibre
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(140,110,70,${r() * 0.05})`
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1)
  }

  const recto = page % 2 === 1
  // show-through: the print on the other side of the sheet, mirrored and faint (paper is not card)
  const back = recto ? page + 1 : page - 1
  if (back >= 1 && back <= book.pageCount) {
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    drawContent(off.getContext('2d')!, book, back, H * aspect, H)
    ctx.save()
    // faint, and half a line off: the two sides never print on exactly the same baselines
    ctx.globalAlpha = 0.03
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(off, 0, Math.round(H * 0.015))
    ctx.restore()
  }
  drawContent(ctx, book, page, H * aspect, H)

  // gutter: the paper curves into the binding and darkens
  const gw = W * 0.11
  const g = recto ? ctx.createLinearGradient(0, 0, gw, 0) : ctx.createLinearGradient(W, 0, W - gw, 0)
  g.addColorStop(0, 'rgba(60,40,20,0.55)')
  g.addColorStop(0.3, 'rgba(60,40,20,0.12)')
  g.addColorStop(1, 'rgba(60,40,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(recto ? 0 : W - gw, 0, gw, H)
  return c
}

/** The printed part of a page (no paper): title page, colophon or running head + body + folio. */
// sizes are fractions of the page, never rounded: the same page lays out line for line at any resolution
// (rounded font sizes reflowed the text between the riffle textures and the full-size ones)
function drawContent(ctx: CanvasRenderingContext2D, book: PageBook, page: number, W: number, H: number) {
  if (book.layout) return drawPlan(ctx, book, book.layout, page, W, H)
  const recto = page % 2 === 1
  const inner = W * 0.13
  const outer = W * 0.1
  const left = recto ? inner : outer
  const textW = W - inner - outer
  ctx.textBaseline = 'alphabetic'

  if (page <= book.pageCount) {
    if (page === 1) {
      ctx.fillStyle = INK
      ctx.textAlign = 'center'
      ctx.font = `${H * 0.05}px ${SERIF}`
      const title = book.title
      ctx.fillText(title, left + textW / 2, H * 0.36, textW)
      if (book.subtitle) {
        ctx.fillStyle = INK_SOFT
        ctx.font = `italic ${H * 0.026}px ${SERIF}`
        ctx.fillText(book.subtitle, left + textW / 2, H * 0.36 + H * 0.05, textW)
      }
      // small rule
      ctx.strokeStyle = '#A5824B'
      ctx.lineWidth = 2
      const cx = left + textW / 2
      ctx.beginPath()
      ctx.moveTo(cx - W * 0.06, H * 0.47)
      ctx.lineTo(cx + W * 0.06, H * 0.47)
      ctx.stroke()
    } else if (page === 2) {
      ctx.fillStyle = INK_SOFT
      ctx.textAlign = 'left'
      ctx.font = `italic ${H * 0.018}px ${SERIF}`
      ctx.fillText(`${book.title} · ${book.pageCount} páginas`, left, H * 0.86, textW)
    } else {
      const chapter = chapterAt(book, page)
      let y = H * 0.135
      if (chapter) {
        // chapter opening: no running head, number and title set low, the text starts a third down
        const cx = left + textW / 2
        ctx.textAlign = 'center'
        ctx.fillStyle = INK_SOFT
        ctx.font = `${H * 0.017}px ${SERIF}`
        ctx.fillText(`CAPÍTULO ${chapter.chapter}`.split('').join(String.fromCharCode(8202)), cx, H * 0.2, textW)
        ctx.fillStyle = INK
        ctx.font = `${H * 0.036}px ${SERIF}`
        ctx.fillText(chapter.title, cx, H * 0.255, textW)
        ctx.strokeStyle = '#A5824B'
        ctx.lineWidth = Math.max(1, H / 600)
        ctx.beginPath()
        ctx.moveTo(cx - W * 0.05, H * 0.29)
        ctx.lineTo(cx + W * 0.05, H * 0.29)
        ctx.stroke()
        y = H * 0.36
      } else {
        // running head (a touch larger and darker: it read faint)
        ctx.fillStyle = INK_HEAD
        ctx.textAlign = 'center'
        ctx.font = `italic ${H * 0.021}px ${SERIF}`
        ctx.fillText(book.title, left + textW / 2, H * 0.075, textW)
      }
      // body
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      const size = H * 0.0205
      ctx.font = `${size}px ${SERIF}`
      const lineH = size * 1.48
      const maxY = H * 0.88
      // consecutive pages never open on the same paragraph
      let k = page * 5 + (hashSeed(book.id) % PARAGRAPHS.length)
      // the page before a chapter opening ends with its paragraph, short, as in print
      const endsChapter = chapterAt(book, page + 1) !== undefined
      while (y < (endsChapter ? H * 0.45 : maxY)) {
        y = paragraph(ctx, PARAGRAPHS[k % PARAGRAPHS.length], left, y, textW, lineH, maxY, size * 1.6)
        y += lineH * 0.25
        k++
      }
      // folio
      ctx.fillStyle = INK_SOFT
      ctx.textAlign = 'center'
      ctx.font = `${H * 0.02}px ${SERIF}`
      ctx.fillText(String(page), left + textW / 2, H * 0.94)
    }
  }
}

/** Small LRU of page textures: only the visible pages (and the sheet in the air) exist at a time. */
export class PageTextures {
  private cache = new Map<string, Texture>()
  private book: PageBook
  private aspect: number
  private max: number

  private height: number

  constructor(book: PageBook, aspect: number, height: number = PAGE_TEX_HEIGHT.high, max = 8) {
    this.height = height
    this.book = book
    this.aspect = aspect
    this.max = max
  }

  get(page: number): Texture {
    const key = String(page)
    const hit = this.cache.get(key)
    if (hit) {
      this.cache.delete(key)
      this.cache.set(key, hit)
      return hit
    }
    const t = new CanvasTexture(drawPage(this.book, page, this.aspect, this.height))
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    this.cache.set(key, t)
    while (this.cache.size > this.max) {
      const [oldKey, old] = this.cache.entries().next().value as [string, Texture]
      old.dispose()
      this.cache.delete(oldKey)
    }
    return t
  }

  dispose() {
    for (const t of this.cache.values()) t.dispose()
    this.cache.clear()
  }
}
