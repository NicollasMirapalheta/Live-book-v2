import { useEffect, useRef } from 'react'
import { params } from '../app/params'
import { useNavigation } from '../navigation/useNavigation'
import { shelfBooks } from './shelfData'
import { SPINE_COLOR_LABELS } from './palette'
import { SELECTION_NODE, useSelection } from './useSelection'
import './selection.css'

/**
 * Keyboard for the bookcase node: ←/→ move the focus between the books, Enter selects, Esc goes back.
 * Registered in the capture phase so the look controls don't also turn the camera.
 */
function useSelectionKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const nav = useNavigation.getState()
      const sel = useSelection.getState()
      if (sel.selected) {
        if (e.key === 'Escape') {
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
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])
}

/** Description panel of the selected book with "Abrir" (Fase 4) and "Voltar". */
export function SelectionPanel() {
  useSelectionKeys()
  const selected = useSelection((s) => s.selected)
  const inHand = useSelection((s) => s.phase === 'hand')
  const openRequested = useSelection((s) => s.openRequested)
  const clear = useSelection((s) => s.clear)
  const requestOpen = useSelection((s) => s.requestOpen)
  const openRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (inHand) openRef.current?.focus()
  }, [inHand])

  // the panel shows only once the book is in the reader's hand (spec Fase 3)
  if (params.shot || !selected || !inHand) return null
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
        {openRequested && <p className="sel-note">A abertura do livro chega na próxima fase.</p>}
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
