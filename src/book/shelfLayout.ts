// Positions books on the shelves of public/data/bookcase.json (spec Fase 2/3).
// Each shelf with a bookend pair holds one row: the left upright stays at its slot, books stand to its right
// (2–4 mm gaps, ±5 mm depth jitter) and the right upright closes the row; a book leans on it when there is
// room. A shelf prop in the way moves down to a free gap on the next shelf (logic only; animation is Fase 3+).
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
  /** center of the book's thickness on the shelf (three.js) */
  x: number
  y: number
  /** depth jitter, meters (+ = toward the room) */
  dz: number
  /** lean around the book's bottom right corner, radians (positive = top toward +X) */
  lean: number
  thickness: number
}

export interface PlacedProp extends PropSlot {
  /** footprint width used on the shelf */
  width: number
  /** bookend pairs: x of the right upright (closes the row) */
  endX?: number
}

export interface ShelfLayout {
  books: PlacedBook[]
  props: PlacedProp[]
  /** books that did not fit anywhere */
  overflow: string[]
}

/** Footprint widths of the shelf props (m). Bookend pair = one upright. */
export const PROP_WIDTH: Record<string, number> = {
  bookend_pair: 0.012,
  clock: 0.36,
  plant: 0.19,
  vase: 0.12,
  candle: 0.3,
}

/** Distance between the two uprights of an empty bookend pair (blender/build_props.py, `gap`). */
export const PAIR_SPAN = 0.32
const LEAN = (8 * Math.PI) / 180
const MARGIN = 0.012
const UPRIGHT_GAP = 0.004

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967295
}

type Interval = [number, number]

/** Free x for an object of `width` on a shelf, scanning from the right; undefined if none. */
function freeSpot(shelf: Shelf, occupied: Interval[], width: number): number | undefined {
  const sorted = [...occupied].sort((a, b) => b[1] - a[1])
  let right = shelf.xMax - MARGIN
  for (const [a, b] of sorted) {
    if (b <= right && right - b >= width + 2 * MARGIN) return right - width / 2 - MARGIN
    right = Math.min(right, a)
  }
  if (right - (shelf.xMin + MARGIN) >= width + MARGIN) return right - width / 2 - MARGIN
  return undefined
}

export function layoutShelves(books: BookData[], shelves: Shelf[], slots: PropSlot[]): ShelfLayout {
  const sorted = [...shelves].sort((a, b) => b.y - a.y) // fill from the top shelf (eye level) down
  // bookend pairs start with the uprights as built (build_props.py: PAIR_SPAN apart); rows overwrite endX
  const props: PlacedProp[] = slots.map((s) => ({
    ...s,
    width: PROP_WIDTH[s.kind] ?? 0.15,
    endX: s.kind === 'bookend_pair' ? s.x + PAIR_SPAN : undefined,
  }))
  const placed: PlacedBook[] = []
  const queue = [...books].sort((a, b) => a.createdAt - b.createdAt)

  const interval = (p: PlacedProp): Interval =>
    p.kind === 'bookend_pair' ? [p.x - p.width / 2, (p.endX ?? p.x) + p.width / 2] : [p.x - p.width / 2, p.x + p.width / 2]
  const occupiedOn = (shelfIndex: number, except?: PlacedProp): Interval[] => [
    ...props.filter((p) => p.shelf === shelfIndex && p !== except).map(interval),
    ...placed.filter((b) => b.shelf === shelfIndex).map((b): Interval => [b.x - b.thickness / 2, b.x + b.thickness / 2]),
  ]

  for (const [si, shelf] of sorted.entries()) {
    const bookend = props.find((p) => p.shelf === shelf.index && p.kind === 'bookend_pair')
    if (!bookend) continue
    let x = bookend.x + bookend.width / 2 + UPRIGHT_GAP
    const rowStart = placed.length
    while (queue.length) {
      const book = queue[0]
      const d = bookDimensions(book.pageCount, book.trim)
      if (d.coverHeight > shelf.clearHeight - 0.005) break // too tall for this shelf
      const gap = placed.length === rowStart ? 0 : 0.002 + hash(book.id) * 0.002
      const blockers = props
        .filter((p) => p.shelf === shelf.index && p !== bookend && p.x + p.width / 2 > x)
        .sort((a, b) => a.x - b.x)
      const limit = Math.min(shelf.xMax - MARGIN, blockers.length ? blockers[0].x - blockers[0].width / 2 : Infinity)
      const need = gap + d.totalThickness + UPRIGHT_GAP + bookend.width
      if (x + need > limit) {
        // out of room: the nearest prop in the way goes to a free gap on the next shelf down
        const movable = blockers[0]
        const next = sorted[si + 1]
        const spot = movable && next ? freeSpot(next, occupiedOn(next.index), movable.width) : undefined
        if (movable && next && spot !== undefined) {
          movable.shelf = next.index
          movable.x = spot
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
        dz: (hash(book.id + 'z') - 0.5) * 0.01,
        lean: 0,
        thickness: d.totalThickness,
      })
      x += d.totalThickness
      queue.shift()
    }
    const row = placed.slice(rowStart)
    const last = row.at(-1)
    if (!last) continue
    const end = last.x + last.thickness / 2
    const blockers = props.filter((p) => p.shelf === shelf.index && p !== bookend && p.x > end)
    const limit = Math.min(shelf.xMax - MARGIN, ...blockers.map((p) => p.x - p.width / 2))
    // with spare room the last book leans on the closing upright
    const leanShift = Math.sin(LEAN) * 0.24
    if (row.length > 2 && limit - end > leanShift + 0.04) {
      last.lean = LEAN
      bookend.endX = end + leanShift + UPRIGHT_GAP + bookend.width / 2
    } else {
      bookend.endX = end + UPRIGHT_GAP + bookend.width / 2
    }
  }
  return { books: placed, props, overflow: queue.map((b) => b.id) }
}
