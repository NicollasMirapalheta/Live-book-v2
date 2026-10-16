// PLACEHOLDER: provisional page content (spec Fase 4) until the PDF pages arrive in Fase 5.
// Each page is drawn on a canvas in the panel's typography: title page, running head, justified body text
// and the page number, on cream paper with a soft gutter shadow on the binding side.
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

export const PAGE_TEX_HEIGHT = 1024

const PAPER = '#EFE5CF'
const INK = '#2B1E15'
const INK_SOFT = '#6B5442'
const SERIF = "Georgia, 'Times New Roman', serif"

// sample prose for the provisional pages (original text, written for this project)
const PARAGRAPHS = [
  'A casa ficava no fim da rua de pedras, onde a luz da tarde entrava inclinada pelas janelas altas e pousava devagar sobre a estante. Ali, cada livro guardava uma estação inteira: os cheiros, as vozes, o barulho da chuva no telhado.',
  'Abrir um caderno antigo é como abrir uma janela para dentro. As margens trazem anotações apressadas, datas que já não dizem nada a ninguém, pequenos desenhos de plantas e de caminhos que talvez nunca tenham existido.',
  'Naquele verão aprendemos a esperar. Esperar a fruta amadurecer, a carta chegar, a tinta secar na página antes de virar a folha. O tempo tinha outra espessura, e as horas se empilhavam como papel.',
  'Há fotografias que não mostram o que aconteceu, mas o que quisemos lembrar. A moldura branca da polaroide recorta um instante e o devolve mais quente, mais calmo, um pouco desbotado nas bordas.',
  'Quando a noite caía, acendíamos as velas do candelabro e líamos em voz alta. As sombras dos livros cresciam na parede, e cada história parecia pertencer à sala tanto quanto a nós.',
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
}

/**
 * Draws page `page` (1-based) of the book. Odd pages are rectos (binding on the left of the image),
 * even pages versos (binding on the right). Pages past pageCount are blank paper.
 */
export function drawPage(book: PageBook, page: number, aspect: number): HTMLCanvasElement {
  const H = PAGE_TEX_HEIGHT
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
  const inner = Math.round(W * 0.13)
  const outer = Math.round(W * 0.1)
  const left = recto ? inner : outer
  const textW = W - inner - outer
  ctx.textBaseline = 'alphabetic'

  if (page <= book.pageCount) {
    if (page === 1) {
      ctx.fillStyle = INK
      ctx.textAlign = 'center'
      ctx.font = `${Math.round(H * 0.05)}px ${SERIF}`
      const title = book.title
      ctx.fillText(title, left + textW / 2, H * 0.36, textW)
      if (book.subtitle) {
        ctx.fillStyle = INK_SOFT
        ctx.font = `italic ${Math.round(H * 0.026)}px ${SERIF}`
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
      ctx.font = `italic ${Math.round(H * 0.018)}px ${SERIF}`
      ctx.fillText(`${book.title} · ${book.pageCount} páginas`, left, H * 0.86, textW)
    } else {
      // running head
      ctx.fillStyle = INK_SOFT
      ctx.textAlign = 'center'
      ctx.font = `italic ${Math.round(H * 0.019)}px ${SERIF}`
      ctx.fillText(book.title, left + textW / 2, H * 0.075, textW)
      // body
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      const size = Math.round(H * 0.024)
      ctx.font = `${size}px ${SERIF}`
      const lineH = size * 1.48
      let y = H * 0.135
      const maxY = H * 0.88
      // consecutive pages never open on the same paragraph
      let k = page * 5 + (hashSeed(book.id) % PARAGRAPHS.length)
      while (y < maxY) {
        y = paragraph(ctx, PARAGRAPHS[k % PARAGRAPHS.length], left, y, textW, lineH, maxY, size * 1.6)
        y += lineH * 0.25
        k++
      }
      // folio
      ctx.fillStyle = INK_SOFT
      ctx.textAlign = 'center'
      ctx.font = `${Math.round(H * 0.02)}px ${SERIF}`
      ctx.fillText(String(page), left + textW / 2, H * 0.94)
    }
  }

  // gutter: the paper curves into the binding and darkens
  const gw = W * 0.16
  const g = recto ? ctx.createLinearGradient(0, 0, gw, 0) : ctx.createLinearGradient(W, 0, W - gw, 0)
  g.addColorStop(0, 'rgba(60,40,20,0.42)')
  g.addColorStop(0.3, 'rgba(60,40,20,0.12)')
  g.addColorStop(1, 'rgba(60,40,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(recto ? 0 : W - gw, 0, gw, H)
  return c
}

/** Small LRU of page textures: only the visible pages (and the sheet in the air) exist at a time. */
export class PageTextures {
  private cache = new Map<string, Texture>()
  private book: PageBook
  private aspect: number
  private max: number

  constructor(book: PageBook, aspect: number, max = 10) {
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
    const t = new CanvasTexture(drawPage(this.book, page, this.aspect))
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
