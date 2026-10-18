import { create } from 'zustand'
import { params } from '../../app/params'
import { TRIM_SIZES } from '../geometry'
import { canvasMeasure } from '../reader/pageContent'
import type { Trim } from '../types'
import { extractPdf, type Extracted } from './extract'
import { facsimileUnits, paginateFacsimile, type Unit } from './facsimile'
import { paginate, type BookLayout } from './paginate'
import { PdfPages, type PdfPageSource } from './pdfPages'
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
  /** a facsimile's printed pages (scan or laid-out book), drawn on demand from the open PDF */
  pdfPages?: PdfPageSource
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
/**
 * Composed books kept at once (plano de desempenho): the layout is small, but a PDF's images stay decoded
 * (up to ~8 MB each). The least recently used book beyond these is dropped and composed again when opened.
 */
const KEEP_BOOKS = 3

interface ContentState {
  byId: Record<string, BookContent>
  /** composes the book's PDF once (no-op without a PDF or when already done/running) */
  ensure: (book: ContentBook) => void
  /** composes (again) and resolves when done: the creation form uses it for the page count */
  prepare: (book: ContentBook) => Promise<BookContent>
  /** drops a composition (a book removed, or its PDF replaced) */
  forget: (id: string) => void
}

/** A PDF as read: kept per book, so composing it again (the form saves with the final title, a new trim) only lays out the pages. */
interface Source {
  /** the file it came from: the same Blob, URL or loader is the same PDF */
  of: unknown
  extracted: Extracted
  /** facsimile: its printed pages, drawn from the open document */
  pdfPages?: PdfPages
  units?: Unit[]
}

const sources = new Map<string, Source>()
const sourceOf = (book: ContentBook) => book.pdf ?? book.loadPdf ?? book.pdfUrl

function dropSource(id: string) {
  sources.get(id)?.pdfPages?.destroy()
  sources.delete(id)
}

/** Reads the PDF (pdf.js), or reuses the reading of the same file. */
async function readSource(book: ContentBook, onProgress: (p: number) => void): Promise<Source> {
  const prev = sources.get(book.id)
  if (prev && prev.of === sourceOf(book)) return prev
  const data = await (book.pdf
    ? book.pdf.arrayBuffer()
    : book.loadPdf
      ? book.loadPdf().then((b) => b.arrayBuffer())
      : fetch(book.pdfUrl!).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${book.pdfUrl}: ${r.status}`)))))
  const extracted = await extractPdf(data, (p) => onProgress(p * 0.95))
  const source: Source = { of: sourceOf(book), extracted }
  if (extracted.facsimile && extracted.doc) {
    source.units = facsimileUnits(extracted.facsimile)
    source.pdfPages = new PdfPages(extracted.doc, source.units, extracted.mode === 'scan')
  }
  return source
}

/** The pages of the book from its PDF as read (the budget is < 1 s for a 300-page book). */
function compose(book: ContentBook, source: Source, name: string): Pick<BookContent, 'layout' | 'images' | 'pdfPages'> {
  const { mode, raw, images, facsimile } = source.extracted
  const { width, height } = TRIM_SIZES[book.trim]
  const year = book.createdAt ? new Date(book.createdAt).getFullYear() : undefined
  // colophon: the PDF's own title, else a readable file name; nothing when it just repeats the book's title
  const origin = raw.title || titleFromFile(name).replace(/-+/g, ' ')
  const from = origin && origin.toLowerCase() !== book.title.toLowerCase() ? origin : undefined
  const meta = { title: book.title, subtitle: book.subtitle, source: from, year }
  const layout: BookLayout =
    facsimile && source.units
      ? paginateFacsimile(facsimile, meta, width / height, source.units)
      : paginate(buildStructure(raw), meta, width / height, canvasMeasure())
  if (import.meta.env.DEV || params.e2e) console.info(`[pdf] ${book.id}: ${facsimile?.pages.length ?? raw.pages.length} páginas no PDF → ${layout.pageCount} no livro, ${mode}`)
  return { layout, images, pdfPages: source.pdfPages }
}

/** Book ids, most recently used last. */
const recent: string[] = []

function touch(id: string) {
  const i = recent.indexOf(id)
  if (i >= 0) recent.splice(i, 1)
  recent.push(id)
}

/** Drops the composed books used least recently beyond KEEP_BOOKS (never `keep`, never one still loading). */
function evict(byId: Record<string, BookContent>, keep: string): Record<string, BookContent> {
  const ready = recent.filter((id) => byId[id]?.status === 'ready')
  for (const id of ready.slice(0, Math.max(0, ready.length - KEEP_BOOKS))) {
    if (id === keep) continue
    dropSource(id)
    delete byId[id]
    recent.splice(recent.indexOf(id), 1)
  }
  return byId
}

export const useBookContent = create<ContentState>((set, get) => {
  const load = (book: ContentBook): Promise<BookContent> => {
    const startedAt = performance.now()
    // another file for this book: the reading of the old one (and a facsimile's open PDF) goes
    if (sources.has(book.id) && sources.get(book.id)!.of !== sourceOf(book)) dropSource(book.id)
    set((s) => ({ byId: { ...s.byId, [book.id]: { status: 'loading', progress: 0, startedAt } } }))
    const current = () => get().byId[book.id]?.startedAt === startedAt
    const progress = (p: number) => {
      if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: { ...s.byId[book.id], progress: p } } }))
    }
    const name = book.pdfName ?? book.pdfUrl?.split('/').pop() ?? 'livro.pdf'
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('o PDF demorou demais para ler')), TIMEOUT_MS)
    })
    const t0 = performance.now()
    return Promise.race([readSource(book, progress), timeout])
      .then((source): BookContent => {
        const t1 = performance.now()
        const content: BookContent = { status: 'ready', ...compose(book, source, name) }
        if (import.meta.env.DEV || params.e2e) console.info(`[pdf] ${book.id}: leitura ${Math.round(t1 - t0)} ms, composição ${Math.round(performance.now() - t1)} ms`)
        // a newer composition may have replaced this one meanwhile
        if (current()) {
          sources.set(book.id, source)
          set((s) => ({ byId: evict({ ...s.byId, [book.id]: content }, book.id) }))
        } else if (sources.get(book.id) !== source) source.pdfPages?.destroy()
        return content
      })
      .catch((err: unknown): BookContent => {
        console.error('[pdf]', err)
        const content: BookContent = { status: 'error', error: err instanceof Error ? err.message : String(err) }
        if (current()) set((s) => ({ byId: { ...s.byId, [book.id]: content } }))
        return content
      })
      .finally(() => clearTimeout(timer))
  }
  return {
    byId: {},
    ensure: (book) => {
      touch(book.id)
      if ((!book.pdf && !book.loadPdf && !book.pdfUrl) || get().byId[book.id]) return
      void load(book)
    },
    prepare: (book) => {
      touch(book.id)
      return load(book)
    },
    forget: (id) =>
      set((s) => {
        const byId = { ...s.byId }
        dropSource(id)
        delete byId[id]
        return { byId }
      }),
  }
})

declare global {
  interface Window {
    __CONTENT__?: { status: (id: string) => BookContent['status'] | null; pageCount: (id: string) => number | null; toc: (id: string) => string[]; mode: (id: string) => string | null }
  }
}

if (params.e2e) {
  window.__CONTENT__ = {
    status: (id) => useBookContent.getState().byId[id]?.status ?? null,
    pageCount: (id) => useBookContent.getState().byId[id]?.layout?.pageCount ?? null,
    toc: (id) => useBookContent.getState().byId[id]?.layout?.toc.map((e) => e.title) ?? [],
    mode: (id) => useBookContent.getState().byId[id]?.layout?.mode ?? null,
  }
}
