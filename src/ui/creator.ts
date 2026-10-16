import { create } from 'zustand'
import { useBookContent } from '../book/pdf/content'
import { useSelection } from '../book/useSelection'
import { useLibrary } from '../data/library'

/** The book form (spec Fase 6): closed, creating a new book, or editing one of the user's. */
interface CreatorState {
  mode: 'new' | 'edit' | null
  /** the book being edited */
  editId: string | null
  /** a PDF dropped on the window: the new book starts from it */
  file: File | null
  openNew: (file?: File) => void
  close: () => void
}

export const useCreator = create<CreatorState>((set) => ({
  mode: null,
  editId: null,
  file: null,
  openNew: (file) => set({ mode: 'new', editId: null, file: file ?? null }),
  close: () => set({ mode: null, editId: null, file: null }),
}))

/** Editar: the book goes back to the shelf (its size may change), then the form opens with it. */
export function editBook(id: string) {
  const sel = useSelection.getState()
  if (sel.selected === id) sel.clear()
  useCreator.setState({ mode: 'edit', editId: id, file: null })
}

let pendingRemoval: string | null = null

/** Remover: the book flies back to the shelf first, and leaves it once it is there. */
export function removeBook(id: string) {
  const sel = useSelection.getState()
  if (sel.selected === id) {
    pendingRemoval = id
    sel.clear()
  } else void finishRemoval(id)
}

async function finishRemoval(id: string) {
  await useLibrary.getState().remove(id)
  useBookContent.getState().forget(id)
}

useSelection.subscribe((s, prev) => {
  if (pendingRemoval && prev.selected === pendingRemoval && s.selected === null) {
    const id = pendingRemoval
    pendingRemoval = null
    void finishRemoval(id)
  }
})

/** PDFs only (by type, or by name when the browser gives no type). */
export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
