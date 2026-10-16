import { shelfBooksOf, useLibrary } from '../data/library'
import type { FixtureBook } from './fixtures'
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

/** Books on the shelf now (Fase 6): the user's, or the samples while there are none. */
export function shelfBooks(): FixtureBook[] {
  return shelfBooksOf(useLibrary.getState())
}

/** The same, as a hook: re-renders when a book is created, edited or removed. */
export const useShelfBooks = () => useLibrary(shelfBooksOf)

// one layout per (bookcase, list of books): a new list (a book created or removed) lays the shelf out again
const layoutCache = new WeakMap<BookcaseData, WeakMap<FixtureBook[], ShelfLayout>>()

export function shelfLayoutFor(data: BookcaseData, books: FixtureBook[]): ShelfLayout {
  let byBooks = layoutCache.get(data)
  if (!byBooks) layoutCache.set(data, (byBooks = new WeakMap()))
  let layout = byBooks.get(books)
  if (!layout) {
    layout = layoutShelves(books, data.shelves, data.propSlots)
    byBooks.set(books, layout)
  }
  return layout
}

/** Shelf order of the books: top shelf first, left to right (keyboard focus order). */
export function shelfOrder(layout: ShelfLayout, shelves: Shelf[]): string[] {
  const y = new Map(shelves.map((s) => [s.index, s.y]))
  return [...layout.books].sort((a, b) => (y.get(b.shelf) ?? 0) - (y.get(a.shelf) ?? 0) || a.x - b.x).map((b) => b.id)
}
