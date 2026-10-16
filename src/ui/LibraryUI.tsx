import { useEffect, useState } from 'react'
import { params } from '../app/params'
import { SELECTION_NODE, useSelection } from '../book/useSelection'
import { useAccount } from '../data/cloud'
import { useNavigation } from '../navigation/useNavigation'
import { AccountUI, SignInFirst } from './AccountUI'
import { BookForm } from './BookForm'
import { isPdf, useCreator } from './creator'
import './ui.css'

/**
 * The library's controls over the room (spec Fase 6/7): "Novo livro" at the bookcase, a PDF dropped
 * anywhere starts a new book with it, and the account (top right) when the cloud is on.
 */
export function LibraryUI() {
  const atShelf = useNavigation((s) => s.currentNode === SELECTION_NODE && !s.isTransitioning)
  const selected = useSelection((s) => s.selected)
  const formOpen = useCreator((s) => s.mode !== null)
  const openNew = useCreator((s) => s.openNew)
  // with the cloud on (Fase 7) a book needs an owner: signed out, "Novo livro" asks to sign in first
  const needsSignIn = useAccount((s) => s.status === 'out')
  const [askSignIn, setAskSignIn] = useState(false)
  const dragging = usePdfDropToCreate(!formOpen, needsSignIn, () => setAskSignIn(true))
  // ?form=new opens the form (screenshots of it; in shot mode it is the only UI)
  useEffect(() => {
    if (params.form === 'new') openNew()
  }, [openNew])
  if (params.shot) return <BookForm />
  return (
    <>
      {atShelf && !selected && !formOpen && (
        <button type="button" className="lib-new" onClick={() => (needsSignIn ? setAskSignIn(true) : openNew())}>
          <span aria-hidden="true">+</span>Novo livro
        </button>
      )}
      {dragging && <div className="lib-dropping">Solte o PDF para criar um livro</div>}
      {askSignIn && <SignInFirst onClose={() => setAskSignIn(false)} />}
      <AccountUI />
      <BookForm />
    </>
  )
}

/**
 * Window-wide PDF drop (when the form is closed): shows a hint while dragging, opens the form on drop —
 * or, signed out with the cloud on, asks to sign in first.
 */
function usePdfDropToCreate(enabled: boolean, needsSignIn: boolean, askSignIn: () => void) {
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
      if (needsSignIn) return askSignIn()
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
    // askSignIn only flips local state; rebinding on each render is not needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, needsSignIn])
  return dragging
}
