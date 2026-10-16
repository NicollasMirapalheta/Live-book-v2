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
}

interface ContentState {
  byId: Record<string, BookContent>
  /** composes the book's PDF once (no-op without a PDF or when already done/running) */
  ensure: (book: ContentBook) => void
  /** replaces the book's content with a PDF the user dropped, until the page reloads */
  useFile: (book: ContentBook, file: Blob) => void
}

/** PDF → structure → pages, timed for the console (the budget is < 1 s for a 300-page book). */
async function compose(book: ContentBook, data: ArrayBuffer, source: string): Promise<Pick<BookContent, 'layout' | 'images'>> {
  const t0 = performance.now()
  const { raw, images } = await extractPdf(data)
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
    set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'loading', source } } }))
    read()
      .then((data) => compose(book, data, name))
      .then((done) => {
        // a newer file may have replaced this one meanwhile
        if (get().byId[book.id]?.source !== source) return
        set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'ready', source, ...done } } }))
      })
      .catch((err: unknown) => {
        console.error('[pdf]', err)
        set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'error', source, error: String(err) } } }))
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
