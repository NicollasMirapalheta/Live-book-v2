import { create } from 'zustand'
import { FIXTURE_BOOKS, type FixtureBook } from '../book/fixtures'
import { deleteBook, listBooks, putBook, type StoredBook } from './db'

/** A book on the shelf: one of the user's (stored) or a sample. */
export type LibraryBook = FixtureBook

/** The samples (the test books): shown while the user has no book of their own. */
export const EXAMPLES: LibraryBook[] = FIXTURE_BOOKS.map((b) => ({ ...b, example: true }))

const fromStored = (b: StoredBook): LibraryBook => ({ ...b })

interface LibraryState {
  /** the user's books, in creation order */
  user: LibraryBook[]
  loaded: boolean
  /** false when IndexedDB is unavailable: books then live only for this session */
  persistent: boolean
  /** a book just created: the shelf hands it to the reader as soon as it is placed */
  pendingSelect: string | null
  load: () => Promise<void>
  save: (book: StoredBook) => Promise<void>
  remove: (id: string) => Promise<void>
  clearPending: () => void
}

export const useLibrary = create<LibraryState>((set, get) => ({
  user: [],
  loaded: false,
  persistent: true,
  pendingSelect: null,

  load: async () => {
    try {
      const stored = await listBooks()
      set({ user: stored.map(fromStored), loaded: true })
    } catch (err) {
      console.warn('[biblioteca] sem IndexedDB, os livros ficam só nesta sessão', err)
      set({ loaded: true, persistent: false })
    }
  },

  save: async (book) => {
    try {
      await putBook(book)
    } catch (err) {
      console.warn('[biblioteca] não gravou', err)
      set({ persistent: false })
    }
    const exists = get().user.some((b) => b.id === book.id)
    set({
      user: exists ? get().user.map((b) => (b.id === book.id ? fromStored(book) : b)) : [...get().user, fromStored(book)],
      pendingSelect: exists ? get().pendingSelect : book.id,
    })
  },

  remove: async (id) => {
    try {
      await deleteBook(id)
    } catch (err) {
      console.warn('[biblioteca] não removeu do banco', err)
    }
    set({ user: get().user.filter((b) => b.id !== id) })
  },

  clearPending: () => set({ pendingSelect: null }),
}))

/** The books on the shelf now: the user's, or the samples while there are none. */
export const shelfBooksOf = (s: Pick<LibraryState, 'user'>) => (s.user.length ? s.user : EXAMPLES)

let loading: Promise<void> | null = null
/** Resolves once the stored books are read (the shelf suspends on it, like on the bookcase data). */
export function libraryReady(): Promise<void> {
  loading ??= useLibrary.getState().load()
  return loading
}

/** A fresh id for a new book. */
export const newBookId = () => `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
