// Positions books on the shelves of public/data/bookcase.json (spec Fase 2, preparation for Fase 3).
// Left to right, 2–4 mm gaps, ±5 mm depth jitter, a leaning book at the end of a row when there is room.
// Shelf props make room: the bookend moves to the end of the row and the rightmost other prop goes to the
// next shelf when space runs out (logic only; the animation belongs to Fase 3).
import { bookDimensions } from './geometry'
import type { BookData } from './types'

export interface Shelf {
  index: number
  y: number
  clearHeight: number
  xMin: number
  xMax: number
  zFront: number
  zBack: number
}

export interface PropSlot {
  shelf: number
  x: number
  kind: string
}

export interface PlacedBook {
  id: string
  shelf: number
  /** center of the spine footprint on the shelf (three.js) */
  x: number
  y: number
  z: number
  /** rotation around Z (lean), radians */
  lean: number
  thickness: number
}

export interface PlacedProp extends PropSlot {
  /** footprint width used on the shelf */
  width: number
}

export interface ShelfLayout {
  books: PlacedBook[]
  props: PlacedProp[]
  /** books that did not fit anywhere */
  overflow: string[]
}

/** Footprint widths of the shelf props (m). */
export const PROP_WIDTH: Record<string, number> = {
  bookend_pair: 0.02, // the pair brackets the row; each upright ~1 cm wide
  clock: 0.36,
  plant: 0.19,
  vase: 0.12,
  candle: 0.3,
}

const LEAN = (8 * Math.PI) / 180

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967295
}

export function layoutShelves(books: BookData[], shelves: Shelf[], slots: PropSlot[]): ShelfLayout {
  const sorted = [...shelves].sort((a, b) => b.y - a.y) // fill from the top shelf (eye level) down
  const props: PlacedProp[] = slots.map((s) => ({ ...s, width: PROP_WIDTH[s.kind] ?? 0.15 }))
  const placed: PlacedBook[] = []
  const overflow: string[] = []
  const queue = [...books].sort((a, b) => a.createdAt - b.createdAt)

  for (const shelf of sorted) {
    const shelfProps = () => props.filter((p) => p.shelf === shelf.index)
    // the row starts after the leftmost bookend upright
    let x = shelf.xMin + 0.01
    const depth = (shelf.zFront + shelf.zBack) / 2
    while (queue.length) {
      const book = queue[0]
      const d = bookDimensions(book.pageCount, book.trim)
      if (d.coverHeight > shelf.clearHeight - 0.005) break // too tall for this shelf
      const gap = 0.002 + hash(book.id) * 0.002
      // room left: up to the first non-bookend prop on the right of x
      const blockers = shelfProps()
        .filter((p) => p.kind !== 'bookend_pair' && p.x + p.width / 2 > x)
        .sort((a, b) => a.x - b.x)
      const limit = blockers.length ? blockers[0].x - blockers[0].width / 2 : shelf.xMax
      if (x + gap + d.totalThickness > limit - 0.012) {
        // out of room: push the rightmost blocking prop to the next shelf down, then retry
        const movable = blockers.at(-1)
        const next = sorted[sorted.indexOf(shelf) + 1]
        if (movable && next) {
          movable.shelf = next.index
          movable.x = next.xMax - movable.width / 2 - 0.02
          continue
        }
        break
      }
      x += gap
      placed.push({
        id: book.id,
        shelf: shelf.index,
        x: x + d.totalThickness / 2,
        y: shelf.y,
        z: depth + (hash(book.id + 'z') - 0.5) * 0.01,
        lean: 0,
        thickness: d.totalThickness,
      })
      x += d.totalThickness
      queue.shift()
    }
    const rowBooks = placed.filter((b) => b.shelf === shelf.index)
    const last = rowBooks.at(-1)
    if (last) {
      // the bookend moves to close the row; with spare room the last book leans on it
      const bookend = shelfProps().find((p) => p.kind === 'bookend_pair')
      const end = last.x + last.thickness / 2
      const spare = shelf.xMax - end
      if (spare > 0.06 && rowBooks.length > 2) last.lean = LEAN
      if (bookend) bookend.x = end + 0.008 + (last.lean ? Math.sin(LEAN) * 0.2 : 0)
    }
  }
  overflow.push(...queue.map((b) => b.id))
  return { books: placed, props, overflow }
}
