// Composition: document blocks → book pages in the project's typography (spec Fase 5). Pure: text is
// measured through an injected function, so the same code runs with the canvas (browser) and with a fake
// measure (tests). Units: the page is 1 tall and `aspect` wide; every size is a fraction of the page, so
// the same plan draws line for line at any texture resolution.
import type { TocEntry } from '../reader/toc'
import type { Block, DocStructure } from './types'

export interface FontSpec {
  /** fraction of the page height */
  size: number
  italic?: boolean
  bold?: boolean
}

/** Width of `text` set in `font`, in page units. */
export type Measure = (text: string, font: FontSpec) => number

/** Page geometry and type, shared with the provisional pages (reader/pageContent.ts). */
export const PAGE = {
  inner: 0.13, // of the width
  outer: 0.1,
  body: 0.0205,
  leading: 1.48, // × body
  top: 0.135, // first baseline
  bottom: 0.88, // last baseline stays above this
  head: 0.075,
  folio: 0.94,
  paraGap: 0.25, // × line
  indent: 1.6, // × body
  chapterLabel: 0.2,
  chapterTitle: 0.255,
  chapterRule: 0.29,
  chapterBody: 0.36,
  /** an image is at most this share of the text block's height */
  imageMax: 0.62,
} as const

export type PlanItem =
  /** a line of body text; x from the left edge of the text block */
  | { kind: 'line'; x: number; y: number; words: string[]; width: number; justify: boolean; font: FontSpec }
  | { kind: 'text'; x: number; y: number; text: string; font: FontSpec; align: 'left' | 'center' }
  | { kind: 'image'; id: string; x: number; y: number; w: number; h: number }
  | { kind: 'rule'; x0: number; x1: number; y: number }

export interface PagePlan {
  /** 1-based */
  page: number
  items: PlanItem[]
  /** running head (none on the title page, chapter openings and blank pages) */
  head?: string
  folio: boolean
}

export interface BookLayout {
  title: string
  subtitle?: string
  pages: PagePlan[]
  toc: TocEntry[]
  pageCount: number
}

export interface BookMeta {
  title: string
  subtitle?: string
}

const BODY: FontSpec = { size: PAGE.body }
const H2: FontSpec = { size: PAGE.body * 1.18, italic: true }

/** Greedy line breaking; a word wider than the line is cut. */
export function breakLines(text: string, width: number, firstIndent: number, measure: Measure, font: FontSpec): string[][] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[][] = []
  let line: string[] = []
  const avail = () => width - (lines.length === 0 ? firstIndent : 0)
  for (const w of words) {
    const test = [...line, w].join(' ')
    if (!line.length || measure(test, font) <= avail()) {
      line.push(w)
      continue
    }
    lines.push(line)
    line = [w]
  }
  if (line.length) lines.push(line)
  return lines
}

export function paginate(doc: DocStructure, meta: BookMeta, aspect: number, measure: Measure): BookLayout {
  const W = aspect
  const textW = W * (1 - PAGE.inner - PAGE.outer)
  const lineH = PAGE.body * PAGE.leading
  // the book's own title (the user's) wins over whatever the PDF calls itself
  const title = meta.title || doc.title || ''
  const subtitle = meta.subtitle ?? doc.subtitle
  const pages: PagePlan[] = []
  const toc: TocEntry[] = [{ title: 'Página de rosto', page: 1 }]

  // 1: title page; 2: colophon
  pages.push({
    page: 1,
    folio: false,
    items: [
      { kind: 'text', x: textW / 2, y: 0.36, text: title, font: { size: 0.05 }, align: 'center' },
      ...(subtitle ? [{ kind: 'text' as const, x: textW / 2, y: 0.41, text: subtitle, font: { size: 0.026, italic: true }, align: 'center' as const }] : []),
      { kind: 'rule', x0: textW / 2 - W * 0.06, x1: textW / 2 + W * 0.06, y: 0.47 },
    ],
  })
  pages.push({ page: 2, folio: false, items: [{ kind: 'text', x: 0, y: 0.86, text: title, font: { size: 0.018, italic: true }, align: 'left' }] })

  let cur: PagePlan | null = null
  let y = 0
  let chapter: string | undefined
  let chapterNo = 0
  let afterHeading = true

  const open = (opening = false) => {
    cur = { page: pages.length + 1, items: [], folio: true }
    if (!opening) cur.head = cur.page % 2 === 0 ? title : (chapter ?? title)
    pages.push(cur)
    y = opening ? PAGE.chapterBody : PAGE.top
  }
  const page = (): PagePlan => {
    if (!cur) open()
    return cur!
  }
  const linesLeft = () => (cur ? Math.max(0, Math.floor((PAGE.bottom - y) / lineH) + 1) : 0)

  const heading1 = (text: string) => {
    chapterNo++
    chapter = text
    // chapters open on a recto (odd page); the page before ends where its text ends
    if (pages.length % 2 === 1) pages.push({ page: pages.length + 1, items: [], folio: false })
    open(true)
    const p = cur!
    p.items.push(
      { kind: 'text', x: textW / 2, y: PAGE.chapterLabel, text: `CAPÍTULO ${chapterNo}`, font: { size: 0.017 }, align: 'center' },
      { kind: 'text', x: textW / 2, y: PAGE.chapterTitle, text, font: { size: 0.036 }, align: 'center' },
      { kind: 'rule', x0: textW / 2 - W * 0.05, x1: textW / 2 + W * 0.05, y: PAGE.chapterRule },
    )
    toc.push({ title: text, page: p.page, chapter: chapterNo })
    afterHeading = true
  }

  const heading2 = (text: string) => {
    const lines = breakLines(text, textW, 0, measure, H2)
    // keep the heading with at least two lines of what follows
    if (!cur || linesLeft() < lines.length + 3) open()
    else if (cur.items.length) y += lineH * 0.6
    for (const words of lines) {
      page().items.push({ kind: 'line', x: 0, y, words, width: textW, justify: false, font: H2 })
      y += lineH * 1.15
    }
    y += lineH * 0.2
    afterHeading = true
  }

  const paragraph = (text: string) => {
    // no indent right after a heading (book convention)
    const indent = afterHeading ? 0 : PAGE.body * PAGE.indent
    const lines = breakLines(text, textW, indent, measure, BODY)
    let i = 0
    while (i < lines.length) {
      if (!cur || linesLeft() === 0) open()
      let fit = Math.min(linesLeft(), lines.length - i)
      const rest = lines.length - i - fit
      // orphan: a single first line at the foot of a page goes to the next one
      if (i === 0 && fit === 1 && lines.length > 1) {
        open()
        continue
      }
      // widow: never leave the last line alone at the top of the next page
      if (rest === 1 && fit >= 3) fit--
      for (let k = 0; k < fit; k++, i++) {
        page().items.push({ kind: 'line', x: i === 0 ? indent : 0, y, words: lines[i], width: textW - (i === 0 ? indent : 0), justify: i < lines.length - 1, font: BODY })
        y += lineH
      }
      if (i < lines.length) open()
    }
    y += lineH * PAGE.paraGap
    afterHeading = false
  }

  const image = (id: string, aspect: number) => {
    const maxH = (PAGE.bottom - PAGE.top) * PAGE.imageMax
    let w = textW
    let h = w / aspect
    if (h > maxH) {
      h = maxH
      w = h * aspect
    }
    // the image's top sits where the next line's cap height would
    const top = () => y - PAGE.body * 0.75
    if (!cur || top() + h > PAGE.bottom) open()
    page().items.push({ kind: 'image', id, x: (textW - w) / 2, y: top(), w, h })
    y = top() + h + lineH * 1.2
    afterHeading = false
  }

  for (const b of doc.blocks as Block[]) {
    if (b.type === 'heading' && b.level === 1) heading1(b.text)
    else if (b.type === 'heading') heading2(b.text)
    else if (b.type === 'paragraph') paragraph(b.text)
    else image(b.id, b.aspect)
  }

  const last = pages.length
  if (last > 2) toc.push({ title: 'Última página', page: last })
  // a book has whole sheets
  if (pages.length % 2 === 1) pages.push({ page: pages.length + 1, items: [], folio: false })
  return { title, subtitle, pages, toc, pageCount: pages.length }
}
