import { create } from 'zustand'
import { params } from '../../app/params'
import { TRIM_SIZES } from '../geometry'
import { canvasMeasure } from '../reader/pageContent'
import type { Trim } from '../types'
import { extractPdf } from './extract'
import { paginate, type BookLayout } from './paginate'
import { buildStructure } from './structure'

export interface ContentBook {
  id: string
  title: string
  subtitle?: string
  trim: Trim
  /** sample PDF of a test book (Fase 5) */
  pdfUrl?: string
  /** a user's PDF (Fase 6), with its file name */
  pdf?: Blob
  pdfName?: string
  /** a cloud book's PDF, fetched (and cached) when first opened (Fase 7) */
  loadPdf?: () => Promise<Blob>
  createdAt?: number
}

export interface BookContent {
  status: 'loading' | 'ready' | 'error'
  layout?: BookLayout
  images?: Map<string, CanvasImageSource & { width: number; height: number }>
  error?: string
  /** 0..1 while loading (reading the PDF is most of it) */
  progress?: number
  /** when loading started (ms, performance.now) — slow ones show a progress bar */
  startedAt?: number
}

/** "relatorio_final-v3.pdf" → "relatorio final v3" */
export const titleFromFile = (name: string) => name.replace(/\.pdf$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || 'PDF'

/** A PDF that takes longer than this is given up (an error instead of an endless "Preparando páginas…"). */
const TIMEOUT_MS = 120_000

interface ContentState {
  byId: Record<string, BookContent>
  /** composes the book's PDF once (no-op without a PDF or when already done/running) */
  ensure: (book: ContentBook) => void
  /** composes (again) and resolves when done: the creation form uses it for the page count */
  prepare: (book: ContentBook) => Promise<BookContent>
  /** drops a composition (a book removed, or its PDF replaced) */
  forget: (id: string) => void
}

/** PDF → structure → pages, timed for the console (the budget is < 1 s for a 300-page book). */
async function compose(book: ContentBook, data: ArrayBuffer, source: string, onProgress: (p: number) => void): Promise<Pick<BookContent, 'layout' | 'images'>> {
  const t0 = performance.now()
  const { raw, images } = await extractPdf(data, (p) => onProgress(p * 0.95))
  const t1 = performance.now()
  const structure = buildStructure(raw)
  const { width, height } = TRIM_SIZES[book.trim]
  const year = book.createdAt ? new Date(book.createdAt).getFullYear() : undefined
  // colophon: the PDF's own title, else a readable file name; nothing when it just repeats the book's title
  const origin = raw.title || titleFromFile(source).replace(/-+/g, ' ')
  const from = origin && origin.toLowerCase() !== book.title.toLowerCase() ? origin : undefined
  const layout = paginate(structure, { title: book.title, subtitle: book.subtitle, source: from, year }, width / height, canvasMeasure())
  const t2 = performance.now()
  if (import.meta.env.DEV || params.e2e)
    console.info(`[pdf] ${book.id}: ${raw.pages.length} páginas no PDF → ${layout.pageCount} no livro (leitura ${Math.round(t1 - t0)} ms, composição ${Math.round(t2 - t1)} ms)`)
  return { layout, images }
}

export const useBookContent = create<ContentState>((set, get) => {
  const load = (book: ContentBook): Promise<BookContent> => {
    const startedAt = performance.now()
    set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'loading', progress: 0, startedAt } } }))
    const current = () => get().byId[book.id]?.startedAt === startedAt
    const progress = (p: number) => {
      if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: { ...s.byId[book.id], progress: p } } }))
    }
    const name = book.pdfName ?? book.pdfUrl?.split('/').pop() ?? 'livro.pdf'
    const read = (): Promise<ArrayBuffer> => {
      if (book.pdf) return book.pdf.arrayBuffer()
      if (book.loadPdf) return book.loadPdf().then((b) => b.arrayBuffer())
      const url = book.pdfUrl!
      return fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`))))
    }
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('o PDF demorou demais para ler')), TIMEOUT_MS))
    return read()
      .then((data) => Promise.race([compose(book, data, name, progress), timeout]))
      .then((done): BookContent => {
        const content: BookContent = { status: 'ready', ...done }
        // a newer composition may have replaced this one meanwhile
        if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: content } }))
        return content
      })
      .catch((err: unknown): BookContent => {
        console.error('[pdf]', err)
        const content: BookContent = { status: 'error', error: err instanceof Error ? err.message : String(err) }
        if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: content } }))
        return content
      })
  }
  return {
    byId: {},
    ensure: (book) => {
      if ((!book.pdf && !book.loadPdf && !book.pdfUrl) || get().byId[book.id]) return
      void load(book)
    },
    prepare: (book) => load(book),
    forget: (id) =>
      set((s) => {
        const byId = { ...s.byId }
        delete byId[id]
        return { byId }
      }),
  }
})

declare global {
  interface Window {
    __CONTENT__?: { status: (id: string) => BookContent['status'] | null; pageCount: (id: string) => number | null; toc: (id: string) => string[] }
  }
}

if (params.e2e) {
  window.__CONTENT__ = {
    status: (id) => useBookContent.getState().byId[id]?.status ?? null,
    pageCount: (id) => useBookContent.getState().byId[id]?.layout?.pageCount ?? null,
    toc: (id) => useBookContent.getState().byId[id]?.layout?.toc.map((e) => e.title) ?? [],
  }
}
