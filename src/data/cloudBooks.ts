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

/** Free plan: 50 MB per file (the bucket rejects bigger ones; the form says so first for a photo). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024
/**
 * A PDF over the limit goes up in parts of this size (docs/decisoes.md, 18/10/2026): `livro.pdf.1`, `.2`…,
 * the row's `pdf_path` saying how many (`…/livro.pdf#3`). Downloaded, the parts are joined back into the
 * same bytes. No schema change; a single file keeps the plain path.
 */
export const PART_BYTES = 45 * 1024 * 1024

export const pdfPath = (userId: string, bookId: string) => `${userId}/${bookId}/livro.pdf`

/** The bucket paths behind a row's `pdf_path`: the file itself, or its parts. */
export function pdfFiles(pdfPathValue: string): string[] {
  const m = /^(.*)#(\d+)$/.exec(pdfPathValue)
  if (!m) return [pdfPathValue]
  return Array.from({ length: Number(m[2]) }, (_, i) => `${m[1]}.${i + 1}`)
}

/** The row's `pdf_path` for this PDF: the plain path, or the path and its number of parts. */
export const pdfPathFor = (path: string, pdf: Blob) => (pdf.size <= MAX_FILE_BYTES ? path : `${path}#${Math.ceil(pdf.size / PART_BYTES)}`)

/** The files a PDF is stored as: bucket path → bytes (one whole file, or its parts in order). */
export function pdfPieces(pdfPathValue: string, pdf: Blob): [string, Blob][] {
  const files = pdfFiles(pdfPathValue)
  if (files.length === 1) return [[files[0], pdf]]
  return files.map((f, i) => [f, pdf.slice(i * PART_BYTES, (i + 1) * PART_BYTES, 'application/octet-stream')])
}

/** Uploads a PDF whole or in parts; returns the value for the row's `pdf_path`. */
async function uploadPdf(db: CloudDb, path: string, pdf: Blob, onPart?: (done: number, count: number) => void): Promise<string> {
  const value = pdfPathFor(path, pdf)
  const pieces = pdfPieces(value, pdf)
  for (const [i, [file, bytes]] of pieces.entries()) {
    onPart?.(i, pieces.length)
    await db.upload(file, bytes)
  }
  onPart?.(pieces.length, pieces.length)
  return value
}

/** Downloads a row's PDF, joining its parts back together. */
async function downloadPdf(download: (path: string) => Promise<Blob>, pdfPathValue: string): Promise<Blob> {
  const files = pdfFiles(pdfPathValue)
  if (files.length === 1) return download(files[0])
  const parts: Blob[] = []
  // one at a time: each part is cached as it arrives, and a failure does not leave the others running
  for (const f of files) parts.push(await download(f))
  return new Blob(parts, { type: 'application/pdf' })
}
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
    loadPdf: () => downloadPdf(download, row.pdf_path),
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
export async function saveBook(db: CloudDb, userId: string, book: StoredBook, changes: SaveChanges, previous?: BookRow, onPart?: (done: number, count: number) => void): Promise<BookRow> {
  if (changes.photo && book.coverPhoto && book.coverPhoto.size > MAX_FILE_BYTES) throw new Error('a foto passa de 50 MB')
  const photo = photoPath(userId, book.id)
  let pdf = previous?.pdf_path ?? pdfPath(userId, book.id)
  if (changes.pdf || !previous) {
    pdf = await uploadPdf(db, pdfPath(userId, book.id), book.pdf, onPart)
    // the old PDF's files that the new one did not overwrite (parts it no longer has, or the whole file)
    const stale = previous ? pdfFiles(previous.pdf_path).filter((f) => !pdfFiles(pdf).includes(f)) : []
    if (stale.length) await db.removeFiles(stale)
  }
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
  await db.removeFiles([...pdfFiles(row.pdf_path), ...(row.photo_path ? [row.photo_path] : [])])
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
