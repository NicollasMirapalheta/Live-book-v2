// From positioned text runs to a document: title, headings, paragraphs and images (spec Fase 5).
// Pure: the input is what pdf.js reports, so this can be tested with hand-made pages.
import type { Block, DocStructure, RawDoc, RawImage, RawPage } from './types'

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

/** Runs on the same baseline become one line, in reading order. */
export function pageLines(page: RawPage, index: number): Line[] {
  const items = page.items.filter((it) => it.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of items) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - it.y) < 0.4 * Math.max(last.size, it.size)) {
      const gap = it.x - last.x1
      const space = gap > 0.15 * it.size && !last.text.endsWith(' ') && !it.str.startsWith(' ')
      last.text += (space ? ' ' : '') + it.str
      last.x1 = Math.max(last.x1, it.x + it.w)
      last.size = Math.max(last.size, it.size)
      last.bold = last.bold && it.bold
    } else {
      lines.push({ text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, size: it.size, bold: it.bold, page: index })
    }
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim()
  return lines.filter((l) => l.text !== '')
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
  let subtitle: string | undefined
  const first = pages[0] ?? []
  const firstBig = first.filter((l) => l.size >= body * 1.3)
  if (firstBig.length) {
    const top = Math.max(...firstBig.map((l) => l.size))
    const titleLines = first.filter((l) => Math.abs(l.size - top) < 0.5)
    const rest = first.filter((l) => !titleLines.includes(l) && l.size > body * 1.05)
    const others = first.filter((l) => !titleLines.includes(l) && !rest.includes(l))
    // only a real title page (little else on it) gives the title and leaves the flow; otherwise its big
    // text is just the first heading
    if (others.length < 4) {
      title = titleLines.map((l) => l.text).join(' ')
      if (rest.length) subtitle = rest.map((l) => l.text).join(' ')
      pages[0] = []
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
  const margin = median(bodyLines.map((l) => l.x0))
  const right = median(bodyLines.map((l) => l.x1))
  const gaps: number[] = []
  for (const lines of pages) {
    const b = lines.filter((l) => levelOf(l) === null)
    for (let i = 1; i < b.length; i++) gaps.push(b[i - 1].y - b[i].y)
  }
  const lead = median(gaps.filter((g) => g > 0)) || body * 1.3

  // reading order: page by page, top to bottom, images interleaved where they sit
  const elements: Element[] = []
  doc.pages.forEach((p, i) => {
    const els: { top: number; el: Element }[] = pages[i].map((line) => ({ top: line.y + line.size, el: { kind: 'line', line } }))
    for (const image of p.images) if (image.w >= MIN_IMAGE && image.h >= MIN_IMAGE) els.push({ top: image.y + image.h, el: { kind: 'image', image, page: i } })
    els.sort((a, b) => b.top - a.top)
    elements.push(...els.map((e) => e.el))
  })

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
    const level = levelOf(l)
    if (level) {
      endPara()
      const last = blocks[blocks.length - 1]
      // a heading set on two lines
      if (last?.type === 'heading' && last.level === level && prev && prev.page === l.page && prev.y - l.y < l.size * 1.6) last.text += ` ${l.text}`
      else blocks.push({ type: 'heading', level, text: l.text })
      prev = l
      continue
    }
    let starts = para === null
    if (!starts && prev) {
      const indented = l.x0 - margin > 0.8 * l.size
      const samePage = prev.page === l.page
      const gapped = samePage && prev.y - l.y > lead * 1.4
      const prevShort = prev.x1 < right - 2 * prev.size && /[.!?:…"»”)]$/.test(prev.text)
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
