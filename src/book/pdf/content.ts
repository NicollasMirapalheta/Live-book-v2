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
  /** sample PDF of a test book (Fase 5); a user's PDF arrives as a Blob in Fase 6 */
  pdfUrl?: string
  createdAt?: number
}

export interface BookContent {
  status: 'loading' | 'ready' | 'error'
  layout?: BookLayout
  images?: Map<string, CanvasImageSource & { width: number; height: number }>
  /** where it came from: the book's own PDF or a file dropped for this session */
  source: 'book' | 'file'
  error?: string
  /** 0..1 while loading (reading the PDF is most of it) */
  progress?: number
  /** when loading started (ms, performance.now) — the panel only shows a progress bar for slow ones */
  startedAt?: number
  /** a dropped file names the book (until reload) */
  title?: string
}

/** "relatorio_final-v3.pdf" → "relatorio final v3" */
export const titleFromFile = (name: string) => name.replace(/\.pdf$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || 'PDF'

/**
 * The book as shown: with a PDF the user dropped, it takes the file's name and loses the test book's
 * subtitle and description (they described other content).
 */
export function displayBook<B extends { title: string; subtitle?: string; description?: string }>(book: B, content: BookContent | undefined): B {
  if (content?.source !== 'file' || !content.title) return book
  return { ...book, title: content.title, subtitle: undefined, description: '' }
}

/** A PDF that takes longer than this is given up (an error instead of an endless "Preparando páginas…"). */
const TIMEOUT_MS = 120_000

interface ContentState {
  byId: Record<string, BookContent>
  /** composes the book's PDF once (no-op without a PDF or when already done/running) */
  ensure: (book: ContentBook) => void
  /** replaces the book's content with a PDF the user dropped, until the page reloads */
  useFile: (book: ContentBook, file: Blob) => void
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
  const origin = raw.title || source.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
  const from = origin && origin.toLowerCase() !== book.title.toLowerCase() ? origin : undefined
  const layout = paginate(structure, { title: book.title, subtitle: book.subtitle, source: from, year }, width / height, canvasMeasure())
  const t2 = performance.now()
  if (import.meta.env.DEV || params.e2e)
    console.info(`[pdf] ${book.id}: ${raw.pages.length} páginas no PDF → ${layout.pageCount} no livro (leitura ${Math.round(t1 - t0)} ms, composição ${Math.round(t2 - t1)} ms)`)
  return { layout, images }
}

export const useBookContent = create<ContentState>((set, get) => {
  const load = (book: ContentBook, source: BookContent['source'], name: string, read: () => Promise<ArrayBuffer>) => {
    const startedAt = performance.now()
    const title = source === 'file' ? titleFromFile(name) : undefined
    if (title) book = { ...book, title, subtitle: undefined }
    set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'loading', source, progress: 0, startedAt, title } } }))
    const current = () => get().byId[book.id]?.startedAt === startedAt
    const progress = (p: number) => {
      if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: { ...s.byId[book.id], progress: p } } }))
    }
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('o PDF demorou demais para ler')), TIMEOUT_MS))
    read()
      .then((data) => Promise.race([compose(book, data, name, progress), timeout]))
      .then((done) => {
        // a newer file may have replaced this one meanwhile
        if (!current()) return
        set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'ready', source, title, ...done } } }))
      })
      .catch((err: unknown) => {
        console.error('[pdf]', err)
        if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'error', source, title, error: err instanceof Error ? err.message : String(err) } } }))
      })
  }
  return {
    byId: {},
    ensure: (book) => {
      if (!book.pdfUrl || get().byId[book.id]) return
      const url = book.pdfUrl
      load(book, 'book', url.split('/').pop() ?? url, () => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${url}: ${r.status}`)))))
    },
    useFile: (book, file) => load(book, 'file', file instanceof File ? file.name : 'PDF', () => file.arrayBuffer()),
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
