import { useEffect, useMemo, useRef, useState } from 'react'
import { params } from '../app/params'
import { useNavigation } from '../navigation/useNavigation'
import { useBookContent } from './pdf/content'
import { bookToc, currentEntry } from './reader/toc'
import { currentSpread, useReader } from './reader/useReader'
import { shelfBooks } from './shelfData'
import { SPINE_COLOR_LABELS } from './palette'
import { SELECTION_NODE, useSelection } from './useSelection'
import './selection.css'

const WHEEL_GAP_MS = 350

/**
 * Keyboard for the bookcase node: ←/→ move the focus between the books, Enter selects, Esc goes back.
 * While reading: ←/→ turn the pages, Esc closes the book. Registered in the capture phase so the look
 * controls don't also turn the camera.
 */
/**
 * Testing with your own PDF (Fase 5, until persistence in Fase 6): dropping a PDF on the window while a
 * book is in the hand composes it into that book for this session.
 */
function usePdfDrop(bookId: string | null) {
  useEffect(() => {
    if (!bookId) return
    const book = shelfBooks().find((b) => b.id === bookId)
    if (!book) return
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      const file = [...(e.dataTransfer?.files ?? [])].find(isPdf)
      if (!file) return
      e.preventDefault()
      useBookContent.getState().useFile(book, file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [bookId])
}

/** Progress of a PDF being read, shown only when it is slow enough to notice (fast ones just flip to "Abrir"). */
function PreparingBar({ progress, startedAt }: { progress: number; startedAt: number }) {
  const [shown, setShown] = useState(() => performance.now() - startedAt > SLOW_MS)
  useEffect(() => {
    if (shown) return
    const t = setTimeout(() => setShown(true), Math.max(0, SLOW_MS - (performance.now() - startedAt)))
    return () => clearTimeout(t)
  }, [shown, startedAt])
  if (!shown) return null
  const pct = Math.round(progress * 100)
  return (
    <div className="sel-progress" role="progressbar" aria-label="Preparando páginas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="sel-progress-fill" style={{ width: `${Math.max(4, pct)}%` }} />
    </div>
  )
}

const SLOW_MS = 600

function useSelectionKeys() {
  useEffect(() => {
    let lastWheel = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const nav = useNavigation.getState()
      const sel = useSelection.getState()
      if (sel.selected) {
        if (sel.phase === 'open' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault()
          e.stopImmediatePropagation()
          useReader.getState().turnPage(e.key === 'ArrowRight' ? 1 : -1)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
          sel.clear()
        }
        return
      }
      if (nav.currentNode !== SELECTION_NODE || nav.isTransitioning) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopImmediatePropagation()
        sel.focusNext(e.key === 'ArrowRight' ? 1 : -1)
      } else if (e.key === 'Enter' && sel.focused) {
        e.preventDefault()
        e.stopImmediatePropagation()
        sel.select(sel.focused)
      }
    }
    // mouse wheel turns the pages while reading (down = forward)
    const onWheel = (e: WheelEvent) => {
      if (useSelection.getState().phase !== 'open' || Math.abs(e.deltaY) < 4) return
      const now = performance.now()
      if (now - lastWheel < WHEEL_GAP_MS) return
      lastWheel = now
      useReader.getState().turnPage(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('wheel', onWheel)
    }
  }, [])
}

/** Description panel of the book in the hand, with "Abrir" (reading mode) and "Voltar" (back to the shelf). */
export function SelectionPanel() {
  useSelectionKeys()
  const selected = useSelection((s) => s.selected)
  const phase = useSelection((s) => s.phase)
  const clear = useSelection((s) => s.clear)
  const requestOpen = useSelection((s) => s.requestOpen)
  const openRef = useRef<HTMLButtonElement>(null)
  const inHand = phase === 'hand'
  const content = useBookContent((s) => (selected ? s.byId[selected] : undefined))
  usePdfDrop(inHand ? selected : null)

  useEffect(() => {
    if (inHand) openRef.current?.focus()
  }, [inHand])

  if (params.shot || !selected) return null
  if (phase === 'open') {
    return (
      <>
        <ReaderToc bookId={selected} />
        <ReaderBar />
      </>
    )
  }
  // the panel shows only once the book is in the reader's hand (spec Fase 3)
  if (!inHand) return null
  const book = shelfBooks().find((b) => b.id === selected)
  if (!book) return null

  return (
    <>
      {/* clicking outside the book goes back (Canvas onPointerMissed); clicking the book opens it */}
      <aside className="sel-panel" role="dialog" aria-modal="false" aria-labelledby="sel-title">
        <p className="sel-kicker">
          {SPINE_COLOR_LABELS[book.color]} · {book.coverMaterial === 'leather' ? 'couro' : 'tecido'} · {content?.layout?.pageCount ?? book.pageCount} páginas
        </p>
        <h2 id="sel-title" className="sel-title">
          {book.title}
        </h2>
        {book.subtitle && <p className="sel-subtitle">{book.subtitle}</p>}
        <p className="sel-description">{book.description}</p>
        {content?.status === 'error' && <p className="sel-hint sel-hint-error">Não consegui ler esse PDF ({content.error}). O livro abre com as páginas de exemplo.</p>}
        {content?.source === 'file' && content.status === 'ready' && <p className="sel-hint">Mostrando o PDF que você soltou (até recarregar a página).</p>}
        <p className="sel-hint">Solte um PDF na janela para ver este livro com o seu conteúdo.</p>
        {content?.status === 'loading' && <PreparingBar progress={content.progress ?? 0} startedAt={content.startedAt ?? 0} />}
        <div className="sel-actions">
          <button type="button" className="sel-btn sel-btn-primary" ref={openRef} onClick={requestOpen} disabled={content?.status === 'loading'}>
            {content?.status === 'loading' ? 'Preparando páginas…' : 'Abrir'}
          </button>
          <button type="button" className="sel-btn" onClick={clear}>
            Voltar
          </button>
        </div>
      </aside>
    </>
  )
}

/** Reading controls (spec Fase 4): previous / pages shown / next, and "Fechar". */
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Table of contents beside the open book (provisional chapters until Fase 5). Picking an entry riffles
 * through the pages to it instead of jumping, so the book keeps feeling like a book.
 */
function ReaderToc({ bookId }: { bookId: string }) {
  const book = shelfBooks().find((b) => b.id === bookId)
  const layout = useBookContent((s) => s.byId[bookId]?.layout)
  const toc = useMemo(() => layout?.toc ?? (book ? bookToc(book) : []), [book, layout])
  // highest page on the open spread; while riffling, the destination (the chapters flashing by are noise)
  const shownPage = useReader((s) => 2 * (s.riffle ? s.riffle.bounds[s.riffle.bounds.length - 1] : s.turned) + 1)
  const busy = useReader((s) => s.turn !== null || s.riffle !== null)
  const goTo = useReader((s) => s.goTo)
  const current = currentEntry(toc, shownPage)
  if (!book) return null
  return (
    <nav className="sel-toc" aria-label="Sumário">
      <h3 className="sel-toc-title">Sumário</h3>
      <ol>
        {toc.map((e) => (
          <li key={e.page}>
            <button
              type="button"
              className="sel-toc-item"
              aria-current={e === current ? 'true' : undefined}
              disabled={busy}
              onClick={() => goTo(e.page, prefersReducedMotion())}
            >
              <span className="sel-toc-name">
                {e.chapter !== undefined && <span className="sel-toc-num">{e.chapter}</span>}
                {e.title}
              </span>
              <span className="sel-toc-page">{e.page}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function ReaderBar() {
  const spread = useReader((s) => currentSpread(s))
  const atStart = useReader((s) => s.turned === 0 && !s.turn)
  const atEnd = useReader((s) => s.turned === s.sheets && !s.turn)
  const close = useSelection((s) => s.close)
  const turnPage = useReader((s) => s.turnPage)
  return (
    <nav className="sel-reader" aria-label="Leitura">
      <button type="button" className="sel-btn sel-icon" aria-label="Página anterior" disabled={atStart} onClick={() => turnPage(-1)}>
        ‹
      </button>
      <span className="sel-spread" aria-live="polite">
        {spread ? `p. ${spread}` : atStart ? 'Guarda' : 'Fim'}
      </span>
      <button type="button" className="sel-btn sel-icon" aria-label="Próxima página" disabled={atEnd} onClick={() => turnPage(1)}>
        ›
      </button>
      <button type="button" className="sel-btn" onClick={close}>
        Fechar
      </button>
    </nav>
  )
}
