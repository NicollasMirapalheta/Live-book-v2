// From positioned text runs to a document: title, headings, paragraphs and images (spec Fase 5).
// Pure: the input is what pdf.js reports, so this can be tested with hand-made pages.
import type { Block, DocStructure, RawDoc, RawImage, RawItem, RawPage } from './types'

interface Line {
  text: string
  x0: number
  x1: number
  /** baseline */
  y: number
  size: number
  bold: boolean
  page: number
}

/** Front and back matter: chapters without a number. */
const UNNUMBERED = /^(introdu[cç][aã]o|pref[aá]cio|pr[oó]logo|ep[ií]logo|conclus[aã]o|apresenta[cç][aã]o|ap[eê]ndice|anexo|agradecimentos|notas|bibliografia|refer[eê]ncias)(?=$|[\s.:—–-])/i

/** Fraction of the page height at the top and bottom where running headers, footers and folios live. */
const BAND = 0.08
/** Smallest image kept (points): smaller ones are rules and ornaments. */
const MIN_IMAGE = 40

function median(values: number[]) {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Runs on the same baseline become lines, in reading order:
 * - a row is gathered by height, then ordered left to right (a paragraph number or a bold lead-in set a
 *   hair lower than the text used to land at the end of the line);
 * - spaces come from the gaps, measured against the gaps between letters (letter-spaced titles are set
 *   one character per run, and a fixed threshold either glued or exploded them);
 * - a gap wider than a column gutter splits the row into separate segments;
 * - segments are read band by band, column by column (recursive cuts), so two-column pages read down
 *   each column instead of across.
 */
export function pageLines(page: RawPage, index: number): Line[] {
  const items = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x)
  // rows by baseline
  const rows: RawItem[][] = []
  for (const it of items) {
    const row = rows[rows.length - 1]
    const ref = row?.[0]
    if (ref && Math.abs(ref.y - it.y) < 0.4 * Math.max(ref.size, it.size)) row.push(it)
    else rows.push([it])
  }
  const segments: Line[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    const solid = row.filter((it) => it.str.trim() !== '')
    if (!solid.length) continue
    const size = Math.max(...solid.map((it) => it.size))
    const gaps: number[] = []
    for (let i = 1; i < solid.length; i++) gaps.push(solid[i].x - (solid[i - 1].x + solid[i - 1].w))
    // one character per run: letter-spaced (or a PDF that places every glyph); words are the wider gaps
    const spaced = solid.filter((it) => it.str.trim().length <= 2).length >= solid.length * 0.6 && solid.length >= 4
    const letterGap = spaced ? median(gaps.filter((g) => g > -0.1 * size)) : 0
    const spaceAt = spaced ? letterGap + 0.15 * size : 0.15 * size
    const gutter = Math.max(1.5 * size, letterGap * 3)
    let seg: Line | null = null
    let pendingSpace = false
    for (const it of row) {
      if (it.str.trim() === '') {
        // an explicit space run
        pendingSpace = true
        continue
      }
      const gap = seg ? it.x - seg.x1 : 0
      if (!seg || gap > gutter) {
        seg = { text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, size: it.size, bold: it.bold, page: index }
        segments.push(seg)
      } else {
        const space = (pendingSpace && !spaced) || gap > spaceAt
        seg.text += (space && !seg.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str
        seg.x1 = Math.max(seg.x1, it.x + it.w)
        seg.size = Math.max(seg.size, it.size)
        seg.bold = seg.bold && it.bold
      }
      pendingSpace = false
    }
  }
  for (const l of segments) l.text = collapseSpaced(l.text.replace(/\s+/g, ' ').trim())
  return readingOrder(segments.filter((l) => l.text !== ''))
}

/**
 * "C A P Í T U L O 3" (letter-spacing that arrived as spaces) → "CAPÍTULO 3": runs of four or more single
 * characters separated by single spaces are joined, with a space kept between letters and digits.
 */
export function collapseSpaced(text: string) {
  return text.replace(/(?:^|(?<=\s))((?:\S ){3,}\S)(?=\s|$)/gu, (run) => {
    const chars = run.split(' ')
    let out = chars[0]
    for (let i = 1; i < chars.length; i++) {
      const kind = (c: string) => (/\d/.test(c) ? 'd' : 'l')
      out += kind(chars[i]) !== kind(chars[i - 1]) ? ` ${chars[i]}` : chars[i]
    }
    return out
  })
}

/** Recursive cuts: split into bands at clear horizontal gaps, a band into columns at clear vertical gaps. */
export function readingOrder(segs: Line[], depth = 0): Line[] {
  const byTop = [...segs].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  if (segs.length <= 1 || depth > 8) return byTop
  const size = median(segs.map((l) => l.size)) || 10
  // bands: a vertical gap clearly larger than the line spacing
  const bands: Line[][] = [[byTop[0]]]
  let floor = byTop[0].y - 0.3 * byTop[0].size
  for (const l of byTop.slice(1)) {
    const top = l.y + l.size
    if (floor - top > 0.9 * size) bands.push([l])
    else bands[bands.length - 1].push(l)
    floor = Math.min(floor, l.y - 0.3 * l.size)
  }
  if (bands.length > 1) return bands.flatMap((b) => readingOrder(b, depth + 1))
  // columns: x ranges that no segment crosses
  const spans = [...segs].sort((a, b) => a.x0 - b.x0)
  const cols: Line[][] = [[spans[0]]]
  let right = spans[0].x1
  for (const l of spans.slice(1)) {
    if (l.x0 - right > 0.8 * size) cols.push([l])
    else cols[cols.length - 1].push(l)
    right = Math.max(right, l.x1)
  }
  // a column needs a few lines of its own (a lone number in the margin is not a column)
  if (cols.length > 1 && cols.every((c) => c.length >= 2)) return cols.flatMap((c) => readingOrder(c, depth + 1))
  return byTop
}

const normalize = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
const isFolio = (s: string) => /^[#\s.\-–—]*$/.test(normalize(s)) || /^(p(á|a)g(ina)?\.?\s*)?[ivxlc]+$/i.test(s.trim())

/** Running headers/footers (repeated in the top or bottom band, or set small there) and page numbers. */
function stripFurniture(pages: Line[][], heights: number[], body: number): Line[][] {
  const inBand = (l: Line) => l.y > heights[l.page] * (1 - BAND) || l.y < heights[l.page] * BAND
  const counts = new Map<string, number>()
  for (const lines of pages) {
    const seen = new Set<string>()
    for (const l of lines) if (inBand(l)) seen.add(normalize(l.text))
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const repeated = (l: Line) => (counts.get(normalize(l.text)) ?? 0) >= Math.max(2, pages.length * 0.4)
  return pages.map((lines) => lines.filter((l) => !(inBand(l) && (isFolio(l.text) || repeated(l) || l.size < body * 0.9))))
}

/** Words broken at the end of a line ("pala-" + "vra") are joined back. */
export function joinLines(a: string, b: string) {
  if (/[a-zà-ÿ]-$/i.test(a) && /^[a-zà-ÿ]/.test(b)) return a.slice(0, -1) + b
  return `${a} ${b}`
}

type Element = { kind: 'line'; line: Line } | { kind: 'image'; image: RawImage; page: number }

export function buildStructure(doc: RawDoc): DocStructure {
  const heights = doc.pages.map((p) => p.height)
  const raw = doc.pages.map((p, i) => pageLines(p, i))
  if (!raw.flat().length && !doc.pages.some((p) => p.images.length)) return { title: doc.title, blocks: [] }

  // body size: the size most of the text is set in (weighted by length)
  const weighted: number[] = []
  for (const l of raw.flat()) for (let i = 0; i < Math.min(l.text.length, 200); i += 10) weighted.push(Math.round(l.size * 10) / 10)
  const body = median(weighted) || 11
  const pages = stripFurniture(raw, heights, body)

  // title page: the largest text on the first page; the next size down is the subtitle
  let title = doc.title
  let coverPage = false
  let subtitle: string | undefined
  const first = pages[0] ?? []
  const firstBig = first.filter((l) => l.size >= body * 1.3)
  if (firstBig.length) {
    const top = Math.max(...firstBig.map((l) => l.size))
    const titleLines = first.filter((l) => Math.abs(l.size - top) < 0.5)
    const rest = first.filter((l) => !titleLines.includes(l) && l.size > body * 1.05)
    const others = first.filter((l) => !titleLines.includes(l) && !rest.includes(l))
    // only a real title page gives the title and leaves the flow: little else on it, or a cover (much less
    // text than the other pages, with large type); otherwise its big text is just the first heading
    const chars = (ls: Line[]) => ls.reduce((acc, l) => acc + l.text.length, 0)
    const typical = median(pages.slice(1).map(chars))
    const cover = pages.length > 2 && top >= body * 1.6 && chars(first) < typical * 0.6
    if (others.length < 4 || cover) {
      title = titleLines.map((l) => l.text).join(' ')
      if (rest.length) subtitle = rest.map((l) => l.text).join(' ')
      pages[0] = []
      coverPage = true
    }
  }

  // heading levels by size: the largest heading size is level 1, anything smaller (or bold body) level 2
  const headingSizes = [...new Set(pages.flat().filter((l) => l.size >= body * 1.2).map((l) => Math.round(l.size)))].sort((a, b) => b - a)
  const levelOf = (l: Line): 1 | 2 | null => {
    if (l.size >= body * 1.2) return Math.round(l.size) === headingSizes[0] ? 1 : 2
    if (l.bold && l.text.length < 80 && !/[.,;]$/.test(l.text)) return 2
    return null
  }

  const bodyLines = pages.flat().filter((l) => levelOf(l) === null)
  // margins of the column a line sits in (a page can have several): the lines that start near it
  const columnOf = (l: Line) => bodyLines.filter((o) => o.page === l.page && Math.abs(o.x0 - l.x0) < 3 * l.size)
  const marginOf = (l: Line) => Math.min(...columnOf(l).map((o) => o.x0))
  const rightOf = (l: Line) => median(columnOf(l).map((o) => o.x1))
  const gaps: number[] = []
  for (const lines of pages) {
    const b = lines.filter((l) => levelOf(l) === null)
    for (let i = 1; i < b.length; i++) gaps.push(b[i - 1].y - b[i].y)
  }
  const lead = median(gaps.filter((g) => g > 0)) || body * 1.3

  // reading order: page by page in the lines' own order (columns already resolved), each image before the
  // first line that sits below its top
  const elements: Element[] = []
  doc.pages.forEach((p, i) => {
    const els: Element[] = pages[i].map((line) => ({ kind: 'line', line }))
    // a cover's pictures go with it
    const imgs = (i === 0 && coverPage ? [] : p.images).filter((im) => im.w >= MIN_IMAGE && im.h >= MIN_IMAGE).sort((a, b) => b.y + b.h - (a.y + a.h))
    for (const image of imgs) {
      const top = image.y + image.h
      const at = els.findIndex((e) => e.kind === 'line' && e.line.y + e.line.size < top)
      els.splice(at < 0 ? els.length : at, 0, { kind: 'image', image, page: i })
    }
    elements.push(...els)
  })

  // chapters: when the PDF opens pages with headings, those are the chapters (a large newspaper headline in
  // the middle of a page is not); otherwise the largest heading size is
  const firstOnPage = new Set(pages.map((ls) => ls[0]).filter(Boolean))
  const topRule = [...firstOnPage].some((l) => levelOf(l) !== null)
  let pageTop = false
  let lastPage = -1
  /** "CAPÍTULO 3" on a line of its own: the number of the chapter whose title follows */
  let chapterNumber: string | undefined

  const blocks: Block[] = []
  let para: string | null = null
  let prev: Line | null = null
  const endPara = () => {
    if (para !== null) blocks.push({ type: 'paragraph', text: para })
    para = null
  }
  for (const el of elements) {
    if (el.kind === 'image') {
      endPara()
      prev = null
      blocks.push({ type: 'image', id: el.image.id, aspect: el.image.w / el.image.h })
      continue
    }
    const l = el.line
    if (l.page !== lastPage) {
      lastPage = l.page
      pageTop = true
    }
    const sized = levelOf(l)
    if (!sized) pageTop = false
    const level: 1 | 2 | null = !sized ? null : topRule ? (pageTop ? 1 : 2) : sized
    if (level) {
      endPara()
      const label = /^cap[ií]tulo\s+([\divxlc]+)\.?$/i.exec(l.text)
      if (level === 1 && label) {
        chapterNumber = label[1]
        prev = l
        continue
      }
      const last = blocks[blocks.length - 1]
      // a heading set on two lines
      if (last?.type === 'heading' && last.level === level && prev && prev.page === l.page && prev.y - l.y < l.size * 1.6) last.text += ` ${l.text}`
      else {
        const unnumbered = level === 1 && UNNUMBERED.test(l.text)
        blocks.push({ type: 'heading', level, text: l.text, ...(level === 1 ? { number: unnumbered ? '' : chapterNumber } : {}) })
        chapterNumber = undefined
      }
      prev = l
      continue
    }
    let starts = para === null
    if (!starts && prev) {
      // a jump to another column continues the paragraph unless the previous line clearly ended one
      const newColumn = Math.abs(l.x0 - prev.x0) > 6 * l.size
      const indented = !newColumn && l.x0 - marginOf(l) > 0.8 * l.size
      const samePage = prev.page === l.page
      const gapped = samePage && prev.y - l.y > lead * 1.4
      const prevShort = prev.x1 < rightOf(prev) - 2 * prev.size && /[.!?:…"»”)]$/.test(prev.text)
      starts = indented || gapped || prevShort
    }
    if (starts) {
      endPara()
      para = l.text
    } else {
      para = joinLines(para ?? '', l.text)
    }
    prev = l
  }
  endPara()
  return { title, subtitle, blocks }
}
