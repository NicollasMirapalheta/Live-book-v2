// Composition: document blocks → book pages in the project's typography (spec Fase 5). Pure: text is
// measured through an injected function, so the same code runs with the canvas (browser) and with a fake
// measure (tests). Units: the page is 1 tall and `aspect` wide; every size is a fraction of the page, so
// the same plan draws line for line at any texture resolution.
import type { TocEntry } from '../reader/toc'
import { hyphenPoints } from './hyphenate'
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
  paraGap: 0, // × line: books mark a new paragraph with the indent only (both read as a gap)
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
  /** where the text came from, for the colophon ("cartas.pdf") */
  source?: string
  /** year for the colophon */
  year?: number
}

const BODY: FontSpec = { size: PAGE.body }
const H2: FontSpec = { size: PAGE.body * 1.18, italic: true }

/** Word spacing limits for justified lines: 80%–133% of a normal space. */
export const SHRINK = 0.2
export const STRETCH = 0.33

/** Greedy line breaking (fallback when no set of breaks fits the spacing limits). */
function greedyLines(words: string[], width: number, firstIndent: number, measure: Measure, font: FontSpec): string[][] {
  const lines: string[][] = []
  let line: string[] = []
  const avail = () => width - (lines.length === 0 ? firstIndent : 0)
  for (const w of words) {
    if (!line.length || measure([...line, w].join(' '), font) <= avail()) {
      line.push(w)
      continue
    }
    lines.push(line)
    line = [w]
  }
  if (line.length) lines.push(line)
  return lines
}

interface Atom {
  text: string
  width: number
  /** a word ends here (a space follows) */
  wordEnd: boolean
  /** a hyphen may break the word after this piece */
  hyphen: boolean
}

/**
 * Line breaking over the whole paragraph (a simplified Knuth–Plass): chooses the breaks that keep the word
 * spacing of every line closest to normal, within 80–133%, hyphenating in Portuguese when that helps.
 * Penalties: a hyphen, two hyphenated lines in a row, a last line of a single short word.
 */
export function breakLines(text: string, width: number, firstIndent: number, measure: Measure, font: FontSpec, opts: { hyphenate?: boolean } = {}): string[][] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const atoms: Atom[] = []
  for (const w of words) {
    const pts = opts.hyphenate === false ? [] : hyphenPoints(w)
    let prev = 0
    for (const p of [...pts, w.length]) {
      const piece = w.slice(prev, p)
      atoms.push({ text: piece, width: measure(piece, font), wordEnd: p === w.length, hyphen: p !== w.length })
      prev = p
    }
  }
  const space = measure(' ', font)
  const hyphenW = measure('-', font)
  const n = atoms.length
  // prefix sums: widths and word ends
  const sumW = [0]
  const sumSp = [0]
  for (const a of atoms) {
    sumW.push(sumW[sumW.length - 1] + a.width)
    sumSp.push(sumSp[sumSp.length - 1] + (a.wordEnd ? 1 : 0))
  }
  // best[i]: the cheapest way to set atoms [0, i) with a line ending after atom i − 1
  const best: { cost: number; from: number; hyphenated: boolean }[] = [{ cost: 0, from: -1, hyphenated: false }]
  for (let i = 1; i <= n; i++) best.push({ cost: Infinity, from: -1, hyphenated: false })
  for (let s = 0; s < n; s++) {
    if (best[s].cost === Infinity) continue
    // a line may only start after a word end or a hyphen point
    if (s > 0 && !atoms[s - 1].wordEnd && !atoms[s - 1].hyphen) continue
    const lineW = width - (s === 0 ? firstIndent : 0)
    for (let e = s; e < n; e++) {
      const last = atoms[e]
      const isEnd = e === n - 1
      if (!isEnd && !last.wordEnd && !last.hyphen) continue
      const hyph = !isEnd && !last.wordEnd
      // never hyphenate the first line of a paragraph
      if (hyph && s === 0) continue
      const spaces = sumSp[e] - sumSp[s] // spaces between the atoms of this line
      const natural = sumW[e + 1] - sumW[s] + spaces * space + (hyph ? hyphenW : 0)
      const diff = lineW - natural
      // overfull even at the tightest spacing: longer lines from here are worse
      if (diff < -spaces * space * SHRINK) {
        if (e === s) {
          // a single piece wider than the line: let it overflow rather than fail
          const cost = best[s].cost + 1e6
          if (cost < best[e + 1].cost) best[e + 1] = { cost, from: s, hyphenated: hyph }
        }
        break
      }
      let badness: number
      if (isEnd) {
        // the last line is set ragged; a lone short word on it reads as a mistake
        const lone = spaces === 0 && natural < lineW * 0.2 && s > 0
        badness = lone ? 60 : 0
      } else if (spaces === 0) {
        // a lone word or fragment that does not fill the line (a stranded "to-") is worse than any loose line
        badness = diff > lineW * 0.1 ? 1e5 : 100
      } else {
        const r = diff >= 0 ? diff / (spaces * space * STRETCH) : diff / (spaces * space * SHRINK)
        badness = 100 * Math.abs(r) ** 3
      }
      let demerits = (10 + badness) ** 2
      // a hyphen only when it saves a line from spacing past ~120%
      if (hyph) demerits += 6000
      if (hyph && best[s].hyphenated) demerits += 6000
      const cost = best[s].cost + demerits
      if (cost < best[e + 1].cost) best[e + 1] = { cost, from: s, hyphenated: hyph }
    }
  }
  if (best[n].cost === Infinity) return greedyLines(words, width, firstIndent, measure, font)
  // walk back the breaks and rebuild the words of each line
  const breaks: number[] = []
  for (let i = n; i > 0; i = best[i].from) breaks.unshift(i)
  const lines: string[][] = []
  let s = 0
  for (const e of breaks) {
    const line: string[] = []
    let cur = ''
    for (let k = s; k < e; k++) {
      cur += atoms[k].text
      if (atoms[k].wordEnd) {
        line.push(cur)
        cur = ''
      }
    }
    if (cur) line.push(`${cur}-`)
    lines.push(line)
    s = e
  }
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
  // colophon: a small block at the foot of the verso
  const colophon = [
    { text: title, italic: true },
    ...(subtitle ? [{ text: subtitle, italic: true }] : []),
    { text: '' },
    { text: 'Composto em Georgia no Live Book' },
    ...(meta.source ? [{ text: `a partir de ${meta.source}` }] : []),
    ...(meta.year ? [{ text: String(meta.year) }] : []),
  ]
  const colY = 0.88 - (colophon.length - 1) * 0.026
  pages.push({
    page: 2,
    folio: false,
    items: colophon
      .filter((c) => c.text)
      .map((c) => ({ kind: 'text' as const, x: 0, y: colY + colophon.indexOf(c) * 0.026, text: c.text, font: { size: 0.0165, italic: c.italic }, align: 'left' as const })),
  })

  let cur: PagePlan | null = null
  let y = 0
  let chapter: string | undefined
  let chapterNo = 0
  let afterHeading = true
  /** first baseline of the current page: lines after an image or a heading go back to this grid */
  let gridTop: number = PAGE.top
  const snap = (v: number) => gridTop + Math.ceil((v - gridTop) / lineH - 1e-6) * lineH

  const open = (opening = false) => {
    cur = { page: pages.length + 1, items: [], folio: true }
    if (!opening) cur.head = cur.page % 2 === 0 ? title : (chapter ?? title)
    pages.push(cur)
    y = opening ? PAGE.chapterBody : PAGE.top
    gridTop = y
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
    y = snap(y + lineH * 0.2)
    afterHeading = true
  }

  /** Where the placement below would end each page (line indices), without placing anything. */
  const pageEnds = (lines: string[][]) => {
    const left = (yv: number) => Math.max(0, Math.floor((PAGE.bottom - yv) / lineH) + 1)
    const ends: number[] = []
    let yy: number | null = cur ? y : null
    let i = 0
    while (i < lines.length) {
      if (yy === null || left(yy) === 0) yy = PAGE.top
      let fit = Math.min(left(yy), lines.length - i)
      if (i === 0 && fit === 1 && lines.length > 1) {
        yy = null
        continue
      }
      if (lines.length - i - fit === 1 && fit >= 3) fit--
      i += fit
      yy += fit * lineH
      if (i < lines.length) {
        ends.push(i - 1)
        yy = null
      }
    }
    return ends
  }

  const paragraph = (text: string) => {
    // no indent right after a heading (book convention)
    const indent = afterHeading ? 0 : PAGE.body * PAGE.indent
    let lines = breakLines(text, textW, indent, measure, BODY)
    // a word broken at the foot of a page (worse: across the turn of a leaf) → set this paragraph unhyphenated
    if (pageEnds(lines).some((k) => lines[k][lines[k].length - 1].endsWith('-'))) lines = breakLines(text, textW, indent, measure, BODY, { hyphenate: false })
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
    // back to the line grid below the image; the text after it keeps "after heading" (no indent at a
    // chapter opening with a picture)
    y = snap(top() + h + lineH * 1.1)
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
