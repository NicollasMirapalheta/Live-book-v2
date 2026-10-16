// PLACEHOLDER: provisional table of contents (Fase 4) until the PDF's own structure arrives in Fase 5.
// Chapters are spread evenly through the book and always open on a recto (odd page), as in print.

export interface TocEntry {
  title: string
  /** 1-based page where the entry starts */
  page: number
  /** chapter number (absent for the title page and the last page) */
  chapter?: number
}

export interface TocBook {
  id: string
  pageCount: number
}

const CHAPTER_TITLES = [
  'Primeiros dias',
  'A casa da rua de pedras',
  'Cartas',
  'O jardim',
  'Viagens',
  'Receitas de família',
  'Fotografias',
  'O inverno',
  'Vozes da sala',
  'Mapas',
  'Estações',
  'O retorno',
]

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

const cache = new Map<string, TocEntry[]>()

/** Title page, one entry per chapter (about one every 24 pages, 2–10 chapters) and the last page. */
export function bookToc(book: TocBook): TocEntry[] {
  const key = `${book.id}:${book.pageCount}`
  const hit = cache.get(key)
  if (hit) return hit
  const out: TocEntry[] = [{ title: 'Página de rosto', page: 1 }]
  const n = Math.min(10, Math.max(2, Math.round(book.pageCount / 24)))
  const span = (book.pageCount - 2) / n
  const offset = hash(book.id) % CHAPTER_TITLES.length
  for (let i = 0; i < n; i++) {
    // chapters open on a recto
    const page = (Math.floor(3 + i * span) | 1) as number
    if (page >= book.pageCount || out.some((e) => e.page === page)) continue
    out.push({ title: CHAPTER_TITLES[(offset + i) % CHAPTER_TITLES.length], page, chapter: out.length })
  }
  if (book.pageCount > 2) out.push({ title: 'Última página', page: book.pageCount })
  cache.set(key, out)
  return out
}

/** The chapter that starts on this page, if any. */
export function chapterAt(book: TocBook, page: number): TocEntry | undefined {
  return bookToc(book).find((e) => e.chapter !== undefined && e.page === page)
}

/** The entry the reader is in, given the highest page on the open spread. */
export function currentEntry(toc: TocEntry[], page: number): TocEntry | undefined {
  let cur: TocEntry | undefined
  for (const e of toc) if (e.page <= page) cur = e
  return cur
}
