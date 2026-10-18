// Facsimile books (docs/decisoes.md, 18/10/2026): a scanned book or one already laid out is printed page by
// page instead of set again. Pure: what kind of PDF it is, which region of which PDF page each book page
// prints, where it sits on the page, and the table of contents (the PDF's outline, or headings found in its
// text). The pages themselves are drawn on demand from the open PDF (pdfPages.ts).
import type { TocEntry } from '../reader/toc'
import { frontMatter, type BookLayout, type BookMeta, type PagePlan } from './paginate'
import { pageLines } from './structure'
import type { FacsimileDoc, OutlineEntry, PdfMode, RawItem } from './types'

/** What a sampled page shows (extract.ts). */
export interface PageStats {
  /** share of the page covered by its largest image */
  cover: number
  /** share covered by all its images (capped at 1) */
  imageArea: number
  /** characters of text */
  chars: number
  /** text set invisible (an OCR layer over a scan) */
  invisible: boolean
}

/**
 * - a scan: most pages are one image, with no text or an invisible OCR layer;
 * - a laid-out book: many pages are mostly pictures, or a picture under visible text (page backgrounds,
 *   full-page art);
 * - otherwise text to set again (a few drawings in a text keep it 'reflow').
 */
export function classifyPages(stats: PageStats[]): PdfMode {
  if (!stats.length) return 'reflow'
  const scan = stats.filter((s) => s.cover >= 0.6 && (s.chars < 30 || s.invisible)).length / stats.length
  const designed = stats.filter((s) => !(s.cover >= 0.6 && (s.chars < 30 || s.invisible)) && (s.cover >= 0.5 || s.imageArea >= 0.45)).length / stats.length
  if (scan >= 0.5) return 'scan'
  if (scan + designed >= 0.4) return scan > designed ? 'scan' : 'designed'
  return 'reflow'
}

/** A book page of the facsimile: a region of a PDF page (1-based), in its y-up frame. */
export interface Unit {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
  /** half of a scanned spread, or a whole page */
  side: 'left' | 'right' | 'single'
}

/** a spread: a scan wider than this (w/h) holds two pages side by side */
const SPREAD = 1.15

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))]
}

/** Text worth measuring: at least two letters or digits, mostly letters or digits (not specks or rules). */
const solid = (it: RawItem) => {
  const alnum = it.str.match(/[\p{L}\p{N}]/gu)?.length ?? 0
  return alnum >= 2 && alnum >= it.str.trim().length * 0.5
}

/** Where a scanned spread splits: the emptiest column of text near the middle. */
export function gutterOf(width: number, items: RawItem[]): number {
  let best = width / 2
  let bestCount = Infinity
  for (let f = 0.35; f <= 0.65 + 1e-9; f += 0.005) {
    const x = width * f
    const count = items.filter((it) => solid(it) && it.x < x && it.x + it.w > x).length
    if (count < bestCount || (count === bestCount && Math.abs(x - width / 2) < Math.abs(best - width / 2))) {
      best = x
      bestCount = count
    }
  }
  return best
}

interface Region {
  page: number
  side: Unit['side']
  x0: number
  x1: number
  height: number
  items: RawItem[]
  /** the text's bounding box, if any */
  box?: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * The region of each PDF page that becomes a book page.
 * - laid out: the whole page;
 * - scanned: each half of a spread, cropped to the printed page (its text block with running head and
 *   folio) so the scanner's edges, the spine's shadow and the dark borders stay out. Every page gets a crop
 *   of the same size (the book's text block), placed where the text block sits on that page: a short page
 *   keeps its blank space below, a chapter opening its sink, and all pages print at one scale.
 */
export function facsimileUnits(doc: FacsimileDoc): Unit[] {
  if (doc.mode === 'designed') return doc.pages.map((p, i) => ({ page: i + 1, x0: 0, y0: 0, x1: p.width, y1: p.height, side: 'single' }))
  const regions: Region[] = []
  doc.pages.forEach((p, i) => {
    const halves: [Unit['side'], number, number][] = []
    if (p.width / p.height > SPREAD) {
      const g = gutterOf(p.width, p.items)
      halves.push(['left', 0, g], ['right', g, p.width])
    } else halves.push(['single', 0, p.width])
    for (const [side, x0, x1] of halves) {
      const items = p.items.filter((it) => it.x + it.w / 2 >= x0 && it.x + it.w / 2 < x1)
      const text = items.filter(solid)
      const box = text.length
        ? {
            x0: Math.min(...text.map((it) => it.x)),
            x1: Math.max(...text.map((it) => it.x + it.w)),
            y0: Math.min(...text.map((it) => it.y - 0.25 * it.size)),
            y1: Math.max(...text.map((it) => it.y + 0.85 * it.size)),
          }
        : undefined
      regions.push({ page: i + 1, side, x0, x1, height: p.height, items, box })
    }
  })
  // the text block: the size of a full page of text (a high percentile: short pages are smaller, a stray
  // speck makes a box larger)
  const boxed = regions.filter((r) => r.box)
  const W = percentile(boxed.map((r) => r.box!.x1 - r.box!.x0), 0.95)
  const H = percentile(boxed.map((r) => r.box!.y1 - r.box!.y0), 0.95)
  const pad = H * 0.025
  const bySide = (side: Unit['side']) => boxed.filter((r) => r.side === side)
  const anchor = new Map<Unit['side'], { x0: number; top: number }>()
  for (const side of ['left', 'right', 'single'] as const) {
    const rs = bySide(side)
    if (rs.length) anchor.set(side, { x0: percentile(rs.map((r) => r.box!.x0), 0.5), top: percentile(rs.map((r) => r.box!.y1), 0.5) })
  }
  return regions.map((r): Unit => {
    const a = anchor.get(r.side)
    if (!W || !H || !a) {
      // no text at all (a scan without OCR): the region, a little inside its edges
      const inset = (r.x1 - r.x0) * 0.03
      return { page: r.page, side: r.side, x0: r.x0 + inset, x1: r.x1 - inset, y0: r.height * 0.03, y1: r.height * 0.97 }
    }
    let x0 = a.x0
    let top = a.top
    if (r.box) {
      const b = r.box
      // a page of full lines says where its own text block is (the scanner moves a little page to page)
      if (b.x1 - b.x0 >= W * 0.85) x0 = b.x0
      if (b.x0 < x0) x0 = b.x0
      if (b.x1 > x0 + W) x0 = b.x1 - W
      if (b.y1 > top) top = b.y1
      if (b.y0 < top - H) top = Math.min(b.y1, b.y0 + H)
    } else {
      // a page without text (a plate): the text block's frame, centred on the half
      x0 = (r.x0 + r.x1) / 2 - W / 2
    }
    // never past the region (the other half of the spread, or the page's edge)
    const ux0 = Math.max(r.x0, x0 - pad)
    const ux1 = Math.min(r.x1, x0 + W + pad)
    const uy1 = Math.min(r.height, top + pad)
    const uy0 = Math.max(0, top - H - pad)
    return { page: r.page, side: r.side, x0: ux0, x1: ux1, y0: uy0, y1: uy1 }
  })
}

/** The outline as a table of contents: its top level, or one level more when the top has too few entries. */
export function outlineToc(outline: OutlineEntry[]): OutlineEntry[] | null {
  const usable = outline.filter((e) => !/\.pdf$/i.test(e.title))
  for (const depth of [0, 1]) {
    const entries = usable.filter((e) => e.depth <= depth)
    if (new Set(entries.map((e) => e.page)).size >= 3) return entries
  }
  return null
}

const letters = (s: string) => s.match(/\p{L}/gu) ?? []
const upperShare = (s: string) => {
  const ls = letters(s)
  return ls.length ? ls.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / ls.length : 0
}

/**
 * Headings in the text of the printed pages, for a PDF without an outline: lines clearly larger than the
 * body and short, in capitals or (much larger) starting with one; the largest one per page. An OCR layer
 * gives every line its own size, so body lines come out larger now and then: they start in lower case, run
 * long or end mid-sentence. Running heads and folios are smaller than the body or have no words.
 */
export function headingsToc(doc: FacsimileDoc, units: Unit[]): { title: string; unit: number }[] {
  const lines = units.map((u, i) => {
    const items = doc.pages[u.page - 1].items.filter((it) => it.x + it.w / 2 >= u.x0 && it.x + it.w / 2 <= u.x1 && it.y >= u.y0 && it.y <= u.y1)
    return pageLines({ width: u.x1 - u.x0, height: u.y1 - u.y0, items, images: [] }, i)
  })
  const weighted: number[] = []
  for (const l of lines.flat()) for (let k = 0; k < Math.min(l.text.length, 200); k += 10) weighted.push(l.size)
  const body = percentile(weighted, 0.5) || 10
  const out: { title: string; unit: number; y: number; size: number }[] = []
  lines.forEach((ls, i) => {
    let mine: (typeof out)[number] | null = null
    for (const l of ls) {
      const text = l.text.trim()
      if (l.size < body * 1.25 || letters(text).length < 5 || text.length > 80 || /[-,;]$/.test(text)) continue
      const caps = upperShare(text) >= 0.7
      if (!caps && !(l.size >= body * 1.6 && text.length <= 45 && /^[\p{Lu}\p{N}]/u.test(text))) continue
      // a title set on two lines
      if (mine && mine.y - l.y < l.size * 2.2 && Math.abs(mine.size - l.size) < body * 0.3) {
        mine.title += ` ${text}`
        mine.y = l.y
        continue
      }
      if (!mine || l.size > mine.size) mine = { title: text, unit: i, y: l.y, size: l.size }
    }
    if (mine) out.push(mine)
  })
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return out.filter((e, k) => k === 0 || norm(e.title) !== norm(out[k - 1].title)).map(({ title, unit }) => ({ title: sentenceCase(title), unit }))
}

/** "AULA DE 7 DE JANEIRO DE 1976" → "Aula de 7 de janeiro de 1976" (titles in capitals read as shouting in the contents) */
export function sentenceCase(title: string) {
  if (upperShare(title) < 0.7) return title
  const lower = title.toLocaleLowerCase('pt-BR')
  return lower.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('pt-BR'))
}

/** a laid-out page this close to the book's proportions is cropped to fill it (full bleed); further off, it fits inside */
const BLEED_MISMATCH = 0.1

/** The facsimile book: title page and colophon, then one PDF region per page; the table of contents. */
export function paginateFacsimile(doc: FacsimileDoc, meta: BookMeta, aspect: number, units = facsimileUnits(doc)): BookLayout {
  const title = meta.title || doc.title || ''
  const subtitle = meta.subtitle
  const pages: PagePlan[] = frontMatter(title, subtitle, meta, aspect, doc.mode === 'scan' ? 'Fac-símile no Live Book' : 'Impresso no Live Book')
  const blank = () => pages.push({ page: pages.length + 1, items: [], folio: false })
  const W = aspect
  const bookPageOfUnit: number[] = []
  units.forEach((u, i) => {
    // the halves of a spread keep their sides: the left one on a verso (even), the right one on a recto
    const next = pages.length + 1
    if ((u.side === 'left' && next % 2 === 1) || (u.side === 'right' && next % 2 === 0)) blank()
    const page = pages.length + 1
    const cw = u.x1 - u.x0
    const ch = u.y1 - u.y0
    let item: PagePlan['items'][number]
    if (doc.mode === 'designed') {
      const fill = Math.abs(cw / ch / W - 1) <= BLEED_MISMATCH
      const s = fill ? Math.max(W / cw, 1 / ch) : Math.min(W / cw, 1 / ch)
      // printed too (pdfPages.ts takes its colours to ink): the paper and the room's light show through
      item = { kind: 'pdfpage', unit: i, x: (W - cw * s) / 2, y: (1 - ch * s) / 2, w: cw * s, h: ch * s, blend: 'multiply' }
    } else {
      // inside the page with book margins, the wider one at the binding
      const recto = page % 2 === 1
      const left = W * (recto ? 0.1 : 0.07)
      const right = W * (recto ? 0.07 : 0.1)
      const top = 0.055
      const bottom = 0.05
      const bw = W - left - right
      const bh = 1 - top - bottom
      const s = Math.min(bw / cw, bh / ch)
      item = { kind: 'pdfpage', unit: i, x: left + (bw - cw * s) / 2, y: top + (bh - ch * s) / 2, w: cw * s, h: ch * s, blend: 'multiply' }
    }
    pages.push({ page, items: [item], folio: false })
    bookPageOfUnit[i] = page
  })
  const firstUnitOfPage = new Map<number, number>()
  units.forEach((u, i) => {
    if (!firstUnitOfPage.has(u.page)) firstUnitOfPage.set(u.page, i)
  })
  const toc: TocEntry[] = [{ title: 'Página de rosto', page: 1 }]
  const outline = outlineToc(doc.outline)
  const entries = outline
    ? outline.flatMap((e) => {
        const unit = firstUnitOfPage.get(e.page)
        return unit === undefined ? [] : [{ title: e.title, page: bookPageOfUnit[unit] }]
      })
    : headingsToc(doc, units).map((e) => ({ title: e.title, page: bookPageOfUnit[e.unit] }))
  for (const e of entries.sort((a, b) => a.page - b.page)) toc.push(e)
  const last = pages.length
  if (last > 2 && toc[toc.length - 1].page !== last) toc.push({ title: 'Última página', page: last })
  if (pages.length % 2 === 1) blank()
  return { title, subtitle, pages, toc, pageCount: pages.length, mode: doc.mode }
}
