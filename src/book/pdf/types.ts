// Data passed between the stages of the PDF pipeline (spec Fase 5).

/** A run of text as pdf.js reports it, in PDF units (points, y up from the bottom of the page). */
export interface RawItem {
  str: string
  x: number
  y: number
  /** advance width */
  w: number
  /** font size */
  size: number
  bold: boolean
  italic: boolean
}

/** An image drawn on the page: its bounding box in PDF units, and an id into the extracted bitmaps. */
export interface RawImage {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface RawPage {
  width: number
  height: number
  items: RawItem[]
  images: RawImage[]
}

export interface RawDoc {
  pages: RawPage[]
  /** document title from the PDF metadata, if any */
  title?: string
}

/**
 * How a PDF becomes a book (docs/decisoes.md, 18/10/2026):
 * - 'reflow': text set again in the book's typography (a manuscript, notes, an article);
 * - 'scan': a scanned book — its page images printed on the paper (spreads split in two, margins cropped,
 *   paper brought to white); the OCR text layer, usually too poor to set again, only finds the chapters;
 * - 'designed': a book already laid out (columns, tables, art, page backgrounds) — its pages printed full
 *   bleed, as they are.
 */
export type PdfMode = 'reflow' | 'scan' | 'designed'

/** An entry of the PDF's own table of contents (outline), resolved to a page (1-based). */
export interface OutlineEntry {
  title: string
  page: number
  /** 0 = top level */
  depth: number
}

/** A PDF page for a facsimile book: its size and text runs in a y-up frame with the origin at the bottom left of the page as shown. */
export interface FacsimilePage {
  width: number
  height: number
  items: RawItem[]
}

export interface FacsimileDoc {
  mode: 'scan' | 'designed'
  pages: FacsimilePage[]
  outline: OutlineEntry[]
  title?: string
}

export type Block =
  /** level 1 = chapter; `number` from the PDF ("CAPÍTULO 3"), '' for an unnumbered chapter, absent = count */
  | { type: 'heading'; level: 1 | 2; text: string; number?: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; id: string; aspect: number }

export interface DocStructure {
  title?: string
  subtitle?: string
  blocks: Block[]
}
