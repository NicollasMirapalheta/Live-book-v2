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

export type Block =
  | { type: 'heading'; level: 1 | 2; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; id: string; aspect: number }

export interface DocStructure {
  title?: string
  subtitle?: string
  blocks: Block[]
}
