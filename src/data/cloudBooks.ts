// The user's books in the cloud (spec Fase 7), written against a minimal storage interface so it can be
// tested without Supabase (cloud.ts adapts the real client to it).
import type { StoredBook } from './db'

/** A row of the `books` table (supabase/schema.sql). */
export interface BookRow {
  id: string
  user_id: string
  title: string
  subtitle: string | null
  description: string
  color: StoredBook['color']
  cover_material: StoredBook['coverMaterial']
  trim_size: StoredBook['trim']
  page_count: number
  pdf_path: string
  pdf_name: string
  photo_path: string | null
  created_at: number
}

/** What the cloud layer needs from Supabase: one table and one private bucket. */
export interface CloudDb {
  listRows: () => Promise<BookRow[]>
  upsertRow: (row: BookRow) => Promise<void>
  deleteRow: (id: string) => Promise<void>
  upload: (path: string, file: Blob) => Promise<void>
  download: (path: string) => Promise<Blob>
  removeFiles: (paths: string[]) => Promise<void>
}

/** Free plan: 50 MB per file (the bucket rejects bigger ones; the form says so first). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

export const pdfPath = (userId: string, bookId: string) => `${userId}/${bookId}/livro.pdf`
export const photoPath = (userId: string, bookId: string) => `${userId}/${bookId}/foto`

/** A book as the app holds it when it comes from the cloud: its files are fetched on demand. */
export interface CloudBook extends Omit<StoredBook, 'pdf' | 'coverPhoto'> {
  pdf?: Blob
  coverPhoto?: Blob
  /** downloads the PDF (once; then it is cached locally) */
  loadPdf: () => Promise<Blob>
  photoPath?: string
}

export function fromRow(row: BookRow, download: (path: string) => Promise<Blob>): CloudBook {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    description: row.description,
    color: row.color,
    coverMaterial: row.cover_material,
    trim: row.trim_size,
    pageCount: row.page_count,
    pdfName: row.pdf_name,
    createdAt: row.created_at,
    loadPdf: () => download(row.pdf_path),
    photoPath: row.photo_path ?? undefined,
  }
}

export interface SaveChanges {
  /** a new PDF was chosen (or the book is new): upload it */
  pdf: boolean
  /** the photo was added, replaced or removed */
  photo: boolean
}

/**
 * Saves a book: uploads what changed, then writes the row (so a row never points to a missing file).
 * A removed photo is deleted from the bucket.
 */
export async function saveBook(db: CloudDb, userId: string, book: StoredBook, changes: SaveChanges, previous?: BookRow): Promise<BookRow> {
  if (changes.pdf && book.pdf.size > MAX_FILE_BYTES) throw new Error('o PDF passa de 50 MB (limite do plano grátis)')
  if (changes.photo && book.coverPhoto && book.coverPhoto.size > MAX_FILE_BYTES) throw new Error('a foto passa de 50 MB')
  const pdf = pdfPath(userId, book.id)
  const photo = photoPath(userId, book.id)
  if (changes.pdf || !previous) await db.upload(pdf, book.pdf)
  let photoKey = previous?.photo_path ?? null
  if (changes.photo) {
    if (book.coverPhoto) {
      await db.upload(photo, book.coverPhoto)
      photoKey = photo
    } else if (previous?.photo_path) {
      await db.removeFiles([previous.photo_path])
      photoKey = null
    }
  }
  const row: BookRow = {
    id: book.id,
    user_id: userId,
    title: book.title,
    subtitle: book.subtitle ?? null,
    description: book.description,
    color: book.color,
    cover_material: book.coverMaterial,
    trim_size: book.trim,
    page_count: book.pageCount,
    pdf_path: pdf,
    pdf_name: book.pdfName,
    photo_path: photoKey,
    created_at: book.createdAt,
  }
  await db.upsertRow(row)
  return row
}

/** Removes a book: the row first (it disappears from the shelf), then its files. */
export async function removeBook(db: CloudDb, row: BookRow) {
  await db.deleteRow(row.id)
  await db.removeFiles([row.pdf_path, ...(row.photo_path ? [row.photo_path] : [])])
}

/** Takes the books made in this browser before signing in to the account; returns the ids that made it. */
export async function migrateLocal(db: CloudDb, userId: string, local: StoredBook[], onEach?: (done: number) => void): Promise<string[]> {
  const ok: string[] = []
  for (const b of local) {
    await saveBook(db, userId, b, { pdf: true, photo: !!b.coverPhoto })
    ok.push(b.id)
    onEach?.(ok.length)
  }
  return ok
}
