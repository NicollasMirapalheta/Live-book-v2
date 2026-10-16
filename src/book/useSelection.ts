import { create } from 'zustand'
import { params } from '../app/params'
import { useNavigation } from '../navigation/useNavigation'

/** Node where the books can be selected (spec Fase 3). */
export const SELECTION_NODE = 'N2'

interface SelectionState {
  /** ids in shelf order (left → right, top shelf first) */
  order: string[]
  hovered: string | null
  /** keyboard focus (highlight without the pointer) */
  focused: string | null
  selected: string | null
  /**
   * Where the selected book is: `out` flying from the shelf to the reader's hand, `hand` held in front of
   * the camera (the description panel shows), `back` returning to the shelf. null when nothing is selected.
   */
  phase: 'out' | 'hand' | 'back' | null
  /** set when the user confirms "Abrir" (opening the book is Fase 4) */
  openRequested: string | null
  setOrder: (ids: string[]) => void
  hover: (id: string | null) => void
  focusNext: (dir: 1 | -1) => void
  select: (id: string) => void
  /** the flying book reached the hand */
  arrived: () => void
  /** start the return flight */
  clear: () => void
  /** the book is back on the shelf */
  returned: () => void
  requestOpen: () => void
}

const canSelect = () => {
  const nav = useNavigation.getState()
  return nav.currentNode === SELECTION_NODE && !nav.isTransitioning
}

export const useSelection = create<SelectionState>((set, get) => ({
  order: [],
  hovered: null,
  focused: null,
  selected: null,
  phase: null,
  openRequested: null,

  setOrder: (ids) => set({ order: ids }),

  hover: (id) => {
    if (id !== null && (!canSelect() || get().selected)) return
    set({ hovered: id })
  },

  focusNext: (dir) => {
    const { order, focused, selected } = get()
    if (!order.length || selected || !canSelect()) return
    const i = focused ? order.indexOf(focused) : dir > 0 ? -1 : order.length
    const next = order[(i + dir + order.length) % order.length]
    set({ focused: next })
  },

  select: (id) => {
    if (get().selected || !canSelect() || !get().order.includes(id)) return
    useNavigation.getState().setLocked(true)
    set({ selected: id, phase: 'out', focused: id, hovered: null, openRequested: null })
  },

  arrived: () => {
    if (get().phase === 'out') set({ phase: 'hand' })
  },

  clear: () => {
    const { phase } = get()
    if (phase === 'out' || phase === 'hand') set({ phase: 'back', openRequested: null })
  },

  returned: () => {
    useNavigation.getState().setLocked(false)
    set({ selected: null, phase: null, openRequested: null })
  },

  requestOpen: () => {
    const { selected, phase } = get()
    if (selected && phase === 'hand') set({ openRequested: selected })
  },
}))

/** Leaving the bookcase node drops the keyboard focus. */
useNavigation.subscribe((s, prev) => {
  if (s.currentNode !== prev.currentNode && s.currentNode !== SELECTION_NODE) {
    useSelection.setState({ focused: null, hovered: null })
  }
})

declare global {
  interface Window {
    __SEL__?: {
      readonly selected: string | null
      readonly phase: SelectionState['phase']
      readonly focused: string | null
      readonly openRequested: string | null
      readonly order: string[]
      select: (id: string) => void
      clear: () => void
      /** screen position (CSS px) of a book on the shelf, for pointer tests */
      screenPos?: (id: string) => { x: number; y: number } | null
    }
  }
}

if (params.e2e) {
  window.__SEL__ = {
    get selected() {
      return useSelection.getState().selected
    },
    get phase() {
      return useSelection.getState().phase
    },
    get focused() {
      return useSelection.getState().focused
    },
    get openRequested() {
      return useSelection.getState().openRequested
    },
    get order() {
      return useSelection.getState().order
    },
    select: (id) => useSelection.getState().select(id),
    clear: () => useSelection.getState().clear(),
  }
}
