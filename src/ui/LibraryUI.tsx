import { useEffect, useState } from 'react'
import { params } from '../app/params'
import { SELECTION_NODE, useSelection } from '../book/useSelection'
import { useNavigation } from '../navigation/useNavigation'
import { BookForm } from './BookForm'
import { isPdf, useCreator } from './creator'
import './ui.css'

/**
 * The library's controls over the room (spec Fase 6): "Novo livro" at the bookcase, and a PDF dropped
 * anywhere starts a new book with it.
 */
export function LibraryUI() {
  const atShelf = useNavigation((s) => s.currentNode === SELECTION_NODE && !s.isTransitioning)
  const selected = useSelection((s) => s.selected)
  const formOpen = useCreator((s) => s.mode !== null)
  const openNew = useCreator((s) => s.openNew)
  const dragging = usePdfDropToCreate(!formOpen)
  // ?form=new opens the form (screenshots of it; in shot mode it is the only UI)
  useEffect(() => {
    if (params.form === 'new') openNew()
  }, [openNew])
  if (params.shot) return <BookForm />
  return (
    <>
      {atShelf && !selected && !formOpen && (
        <button type="button" className="lib-new" onClick={() => openNew()}>
          <span aria-hidden="true">+</span>Novo livro
        </button>
      )}
      {dragging && <div className="lib-dropping">Solte o PDF para criar um livro</div>}
      <BookForm />
    </>
  )
}

/** Window-wide PDF drop (when the form is closed): shows a hint while dragging, opens the form on drop. */
function usePdfDropToCreate(enabled: boolean) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      depth = 0
      setDragging(false)
      const file = [...(e.dataTransfer?.files ?? [])].find(isPdf)
      if (!file) return
      e.preventDefault()
      // a book in the hand goes back first; the form takes over
      useSelection.getState().clear()
      useCreator.getState().openNew(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
      setDragging(false)
    }
  }, [enabled])
  return dragging
}
