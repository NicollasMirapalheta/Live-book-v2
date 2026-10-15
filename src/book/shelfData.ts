import { FIXTURE_BOOKS, type FixtureBook } from './fixtures'
import { layoutShelves, type PropSlot, type Shelf, type ShelfLayout } from './shelfLayout'

export interface BookcaseData {
  shelves: Shelf[]
  propSlots: PropSlot[]
}

let dataPromise: Promise<BookcaseData> | null = null

/** public/data/bookcase.json (written by blender/build_bookcase.py). */
export function loadBookcase(): Promise<BookcaseData> {
  dataPromise ??= fetch('/data/bookcase.json').then((r) => {
    if (!r.ok) throw new Error('public/data/bookcase.json ausente (rode npm run pipeline)')
    return r.json() as Promise<BookcaseData>
  })
  return dataPromise
}

/** Books shown on the shelf. Fixtures until persistence arrives (Fase 6). */
export function shelfBooks(): FixtureBook[] {
  return FIXTURE_BOOKS
}

const layoutCache = new WeakMap<BookcaseData, ShelfLayout>()

export function shelfLayoutFor(data: BookcaseData, books: FixtureBook[]): ShelfLayout {
  let layout = layoutCache.get(data)
  if (!layout) {
    layout = layoutShelves(books, data.shelves, data.propSlots)
    layoutCache.set(data, layout)
  }
  return layout
}

/** Shelf order of the books: top shelf first, left to right (keyboard focus order). */
export function shelfOrder(layout: ShelfLayout, shelves: Shelf[]): string[] {
  const y = new Map(shelves.map((s) => [s.index, s.y]))
  return [...layout.books].sort((a, b) => (y.get(b.shelf) ?? 0) - (y.get(a.shelf) ?? 0) || a.x - b.x).map((b) => b.id)
}
