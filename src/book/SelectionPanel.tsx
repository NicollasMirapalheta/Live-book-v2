import { useEffect, useRef } from 'react'
import { params } from '../app/params'
import { useNavigation } from '../navigation/useNavigation'
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

  useEffect(() => {
    if (inHand) openRef.current?.focus()
  }, [inHand])

  if (params.shot || !selected) return null
  if (phase === 'open') return <ReaderBar />
  // the panel shows only once the book is in the reader's hand (spec Fase 3)
  if (!inHand) return null
  const book = shelfBooks().find((b) => b.id === selected)
  if (!book) return null

  return (
    <>
      {/* clicking outside the panel goes back */}
      <div className="sel-backdrop" onClick={clear} aria-hidden="true" />
      <aside className="sel-panel" role="dialog" aria-modal="false" aria-labelledby="sel-title">
        <p className="sel-kicker">
          {SPINE_COLOR_LABELS[book.color]} · {book.coverMaterial === 'leather' ? 'couro' : 'tecido'} · {book.pageCount} páginas
        </p>
        <h2 id="sel-title" className="sel-title">
          {book.title}
        </h2>
        {book.subtitle && <p className="sel-subtitle">{book.subtitle}</p>}
        <p className="sel-description">{book.description}</p>
        <div className="sel-actions">
          <button type="button" className="sel-btn sel-btn-primary" ref={openRef} onClick={requestOpen}>
            Abrir
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
