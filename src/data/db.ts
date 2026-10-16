// The user's books in IndexedDB (spec Fase 6). A thin promise wrapper over the native API: one database,
// one store, records keyed by id. The PDF and the cover photo are stored as Blobs, as the user gave them.
import type { CoverMaterial, SpineColor, Trim } from '../book/types'

export interface StoredBook {
  id: string
  title: string
  subtitle?: string
  description: string
  color: SpineColor
  coverMaterial: CoverMaterial
  trim: Trim
  createdAt: number
  /** pages of the composition (Fase 5): sets the thickness */
  pageCount: number
  pdf: Blob
  pdfName: string
  coverPhoto?: Blob
}

const DB = 'live-book'
const STORE = 'books'
/** Fase 7: files downloaded from the cloud (PDFs, cover photos), kept so a book downloads only once. */
const FILES = 'files'
const VERSION = 2

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'))
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('não foi possível abrir o banco'))
    req.onblocked = () => reject(new Error('banco bloqueado por outra aba'))
  })
  // a failed open can be retried later (another tab closed, private mode left…)
  opening.catch(() => {
    opening = null
  })
  return opening
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = body(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('erro no banco'))
        tx.onabort = () => reject(tx.error ?? new Error('transação abortada'))
      }),
  )
}

export const listBooks = () => run<StoredBook[]>('readonly', (s) => s.getAll() as IDBRequest<StoredBook[]>).then((all) => all.sort((a, b) => a.createdAt - b.createdAt))
export const putBook = (book: StoredBook) => run('readwrite', (s) => s.put(book)).then(() => book)
export const deleteBook = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined)

/** A cached cloud file (key: the file's path in the bucket), or undefined. */
export const getCachedFile = (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>, FILES).catch(() => undefined)
export const putCachedFile = (key: string, file: Blob) => run('readwrite', (s) => s.put(file, key), FILES).then(() => undefined).catch(() => undefined)
export const deleteCachedFile = (key: string) => run('readwrite', (s) => s.delete(key), FILES).then(() => undefined).catch(() => undefined)

/** For tests: forget the cached connection (a fresh fake database per test). */
export function resetConnection() {
  opening = null
}
