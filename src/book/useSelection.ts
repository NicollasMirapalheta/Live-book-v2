import { create } from 'zustand'
import { params } from '../app/params'
import { useNavigation } from '../navigation/useNavigation'

/** Nodes where the books can be selected (spec Fase 3): the front of the bookcase and the step closer. */
export const SELECTION_NODES: readonly string[] = ['N2', 'N3']
export const isSelectionNode = (id: string) => SELECTION_NODES.includes(id)

interface SelectionState {
  /** ids in shelf order (left → right, top shelf first) */
  order: string[]
  hovered: string | null
  /** keyboard focus (highlight without the pointer) */
  focused: string | null
  selected: string | null
  /**
   * Where the selected book is: `out` flying from the shelf to the reader's hand, `hand` held in front of
   * the camera (the description panel shows), `opening` → `open` → `closing` the reading mode (Fase 4),
   * `back` returning to the shelf. null when nothing is selected.
   */
  phase: SelectionPhase
  setOrder: (ids: string[]) => void
  hover: (id: string | null) => void
  focusNext: (dir: 1 | -1) => void
  select: (id: string) => void
  /** the flying book reached the hand */
  arrived: () => void
  /** Esc / "Voltar": closes an open book first, otherwise starts the return flight */
  clear: () => void
  /** the book is back on the shelf */
  returned: () => void
  /** "Abrir": the book moves to the reading pose and the cover opens */
  requestOpen: () => void
  /** the cover finished opening */
  opened: () => void
  /** "Fechar": back to the hand pose with the cover closed */
  close: () => void
  /** the cover finished closing */
  closed: () => void
}

export type SelectionPhase = 'out' | 'hand' | 'opening' | 'open' | 'closing' | 'back' | null

/** Phases in which the book is (or is becoming) open: the reader bar and DOF belong to these. */
export const isReading = (phase: SelectionPhase) => phase === 'opening' || phase === 'open' || phase === 'closing'

/** Focus distance of the depth of field while reading (camera → open book), set when the hand pose is captured. */
export const readFocus = { distance: 0.4 }

const canSelect = () => {
  const nav = useNavigation.getState()
  return isSelectionNode(nav.currentNode) && !nav.isTransitioning
}

export const useSelection = create<SelectionState>((set, get) => ({
  order: [],
  hovered: null,
  focused: null,
  selected: null,
  phase: null,

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
    set({ selected: id, phase: 'out', focused: id, hovered: null })
  },

  arrived: () => {
    if (get().phase === 'out') set({ phase: 'hand' })
  },

  clear: () => {
    const { phase } = get()
    if (phase === 'out' || phase === 'hand') set({ phase: 'back' })
    else if (phase === 'opening' || phase === 'open') set({ phase: 'closing' })
  },

  returned: () => {
    useNavigation.getState().setLocked(false)
    set({ selected: null, phase: null })
  },

  requestOpen: () => {
    const { selected, phase } = get()
    if (selected && phase === 'hand') set({ phase: 'opening' })
  },

  opened: () => {
    if (get().phase === 'opening') set({ phase: 'open' })
  },

  close: () => {
    const { phase } = get()
    if (phase === 'opening' || phase === 'open') set({ phase: 'closing' })
  },

  closed: () => {
    if (get().phase === 'closing') set({ phase: 'hand' })
  },
}))

/** Leaving the bookcase drops the keyboard focus. */
useNavigation.subscribe((s, prev) => {
  if (s.currentNode !== prev.currentNode && !isSelectionNode(s.currentNode)) {
    useSelection.setState({ focused: null, hovered: null })
  }
})

declare global {
  interface Window {
    __SEL__?: {
      readonly selected: string | null
      readonly phase: SelectionState['phase']
      readonly focused: string | null
      readonly order: string[]
      select: (id: string) => void
      clear: () => void
      open: () => void
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
    get order() {
      return useSelection.getState().order
    },
    select: (id) => useSelection.getState().select(id),
    clear: () => useSelection.getState().clear(),
    open: () => useSelection.getState().requestOpen(),
  }
}
