import { create } from 'zustand'
import { FIXTURE_BOOKS, type FixtureBook } from '../book/fixtures'
import { cloudConfigured, cloudDb, startAccount, useAccount } from './cloud'
import { fromRow, migrateLocal, pdfPieces, removeBook as removeCloudBook, saveBook as saveCloudBook, type BookRow, type SaveChanges } from './cloudBooks'
import { deleteBook, deleteCachedFile, listBooks, putBook, putCachedFile, type StoredBook } from './db'

/** A book on the shelf: one of the user's (this browser or the cloud) or a sample. */
export type LibraryBook = FixtureBook

/** The samples (the test books): shown while the user has no book of their own. */
export const EXAMPLES: LibraryBook[] = FIXTURE_BOOKS.map((b) => ({ ...b, example: true }))

const fromStored = (b: StoredBook): LibraryBook => ({ ...b })

interface LibraryState {
  /** the user's books, in creation order */
  user: LibraryBook[]
  loaded: boolean
  /** where the books live: this browser (no cloud keys) or the signed-in account (Fase 7) */
  mode: 'local' | 'cloud'
  /** false when this browser's storage is unavailable: books then live only for this session */
  persistent: boolean
  /** books made in this browser before signing in: offered to move to the account */
  localPending: StoredBook[]
  /** a book just created: the shelf hands it to the reader as soon as it is placed */
  pendingSelect: string | null
  load: () => Promise<void>
  /** `onPart`: a PDF going up to the cloud in parts (over 50 MB) reports each one */
  save: (book: StoredBook, changes?: SaveChanges, onPart?: (done: number, count: number) => void) => Promise<void>
  remove: (id: string) => Promise<void>
  /** moves localPending to the account (and out of this browser) */
  migrate: (onEach?: (done: number) => void) => Promise<void>
  dismissMigration: () => void
  clearPending: () => void
}

/** the cloud rows behind the books (paths of their files), by book id */
const rows = new Map<string, BookRow>()

async function loadCloud(set: (s: Partial<LibraryState>) => void) {
  const db = await cloudDb()
  const list = await db.listRows()
  rows.clear()
  for (const r of list) rows.set(r.id, r)
  const books: LibraryBook[] = list.map((r) => ({ ...fromRow(r, db.download) }))
  const local = await listBooks().catch(() => [])
  set({ user: books, mode: 'cloud', loaded: true, localPending: local })
  // cover photos are small: fetched right away so the polaroids are there when a book comes to the hand
  for (const r of list) {
    if (!r.photo_path) continue
    void db.download(r.photo_path).then(
      (photo) =>
        useLibrary.setState((s) => ({ user: s.user.map((b) => (b.id === r.id ? { ...b, coverPhoto: photo } : b)) })),
      () => undefined,
    )
  }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  user: [],
  loaded: false,
  mode: 'local',
  persistent: true,
  localPending: [],
  pendingSelect: null,

  load: async () => {
    if (cloudConfigured) {
      let started = true
      try {
        await startAccount()
      } catch (err) {
        // the cloud misconfigured or unreachable must not hold the room behind the loading screen: the
        // books of this browser, as without the keys (Fase 6)
        console.error('[biblioteca] a nuvem não respondeu; livros só neste navegador', err)
        useAccount.setState({ status: 'off', account: null })
        started = false
      }
      const { status } = useAccount.getState()
      if (status === 'in') {
        try {
          await loadCloud(set)
        } catch (err) {
          console.warn('[biblioteca] não leu a nuvem', err)
          set({ user: [], mode: 'cloud', loaded: true })
        }
        return
      }
      if (started) {
        // signed out: the samples (a book needs an owner before it is made)
        set({ user: [], mode: 'cloud', loaded: true })
        return
      }
    }
    try {
      const stored = await listBooks()
      set({ user: stored.map(fromStored), loaded: true, mode: 'local' })
    } catch (err) {
      console.warn('[biblioteca] sem IndexedDB, os livros ficam só nesta sessão', err)
      set({ loaded: true, persistent: false })
    }
  },

  save: async (book, changes = { pdf: true, photo: true }, onPart) => {
    const exists = get().user.some((b) => b.id === book.id)
    let shown: LibraryBook = fromStored(book)
    if (get().mode === 'cloud') {
      const uid = useAccount.getState().account?.id
      if (!uid) throw new Error('entre com a sua conta para guardar')
      const db = await cloudDb()
      const row = await saveCloudBook(db, uid, book, changes, rows.get(book.id), onPart)
      rows.set(row.id, row)
      // what was just sent is what this browser would download: keep it as the local copy
      if (changes.pdf) for (const [file, bytes] of pdfPieces(row.pdf_path, book.pdf)) await putCachedFile(file, bytes)
      if (changes.photo && row.photo_path && book.coverPhoto) await putCachedFile(row.photo_path, book.coverPhoto)
      shown = { ...fromRow(row, db.download), pdf: book.pdf, coverPhoto: book.coverPhoto }
    } else {
      try {
        await putBook(book)
      } catch (err) {
        console.warn('[biblioteca] não gravou', err)
        set({ persistent: false })
      }
    }
    set({
      user: exists ? get().user.map((b) => (b.id === book.id ? shown : b)) : [...get().user, shown],
      pendingSelect: exists ? get().pendingSelect : book.id,
    })
  },

  remove: async (id) => {
    if (get().mode === 'cloud') {
      const row = rows.get(id)
      if (row) {
        await removeCloudBook(await cloudDb(), row)
        rows.delete(id)
        await deleteCachedFile(row.pdf_path)
        if (row.photo_path) await deleteCachedFile(row.photo_path)
      }
    } else {
      try {
        await deleteBook(id)
      } catch (err) {
        console.warn('[biblioteca] não removeu do banco', err)
      }
    }
    set({ user: get().user.filter((b) => b.id !== id) })
  },

  migrate: async (onEach) => {
    const uid = useAccount.getState().account?.id
    const local = get().localPending
    if (!uid || !local.length) return
    const moved = await migrateLocal(await cloudDb(), uid, local, onEach)
    for (const id of moved) await deleteBook(id).catch(() => undefined)
    await loadCloud(set)
    set({ localPending: [] })
  },

  dismissMigration: () => set({ localPending: [] }),
  clearPending: () => set({ pendingSelect: null }),
}))

// signing out (or in, in another tab) swaps the shelf without a reload
useAccount.subscribe((s, prev) => {
  if (s.status === prev.status || prev.status === 'loading' || s.status === 'loading') return
  if (s.status === 'out') {
    rows.clear()
    useLibrary.setState({ user: [], localPending: [] })
  } else if (s.status === 'in') void loadCloud(useLibrary.setState).catch((err) => console.warn('[biblioteca] não leu a nuvem', err))
})

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
