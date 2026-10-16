import { create } from 'zustand'
import { params } from '../../app/params'
import { layoutPages, sheetToTurn, spreadLabel, type Turn } from './pages'

/** One full turn (s); reduced motion: 60%. */
export const TURN_S = 0.75
/** Drag release: faster than this (turn fraction per second) completes or cancels regardless of position. */
const FLICK = 1.6
const MAX_QUEUE = 3

interface ReaderState {
  pageCount: number
  sheets: number
  /** sheets lying on the left stack */
  turned: number
  turn: Turn | null
  /** pending turns in the same direction (keys pressed during a turn) */
  queued: number
  /** sets up the book being opened; `page` (1-based) picks the first spread shown */
  start: (pageCount: number, page?: number) => void
  reset: () => void
  turnPage: (dir: 1 | -1) => void
  beginDrag: (dir: 1 | -1) => boolean
  dragTo: (t: number) => void
  release: (velocity: number) => void
  /** advances the animation; called every frame by the open book */
  step: (dt: number, speed: number) => void
}

export const useReader = create<ReaderState>((set, get) => ({
  pageCount: 0,
  sheets: 0,
  turned: 0,
  turn: null,
  queued: 0,

  start: (pageCount, page) => {
    const sheets = Math.ceil(pageCount / 2)
    const turned = page ? Math.min(sheets, Math.max(0, Math.floor(page / 2))) : 0
    set({ pageCount, sheets, turned, turn: null, queued: 0 })
  },

  reset: () => set({ turned: 0, turn: null, queued: 0 }),

  turnPage: (dir) => {
    const { turn, turned, sheets, queued } = get()
    if (turn) {
      // keep turning in the same direction: queue it; the opposite direction reverses the sheet in the air
      const heading = turn.target === 1 ? 1 : -1
      if (turn.dragging) return
      if (heading === dir) set({ queued: Math.min(MAX_QUEUE, queued + 1) })
      else set({ turn: { ...turn, target: dir > 0 ? 1 : 0 }, queued: 0 })
      return
    }
    const sheet = sheetToTurn(sheets, turned, dir)
    if (sheet === null) return
    set({ turn: { sheet, t: dir > 0 ? 0 : 1, target: dir > 0 ? 1 : 0, dragging: false } })
  },

  beginDrag: (dir) => {
    const { turn, turned, sheets } = get()
    if (turn) return false
    const sheet = sheetToTurn(sheets, turned, dir)
    if (sheet === null) return false
    set({ turn: { sheet, t: dir > 0 ? 0 : 1, target: dir > 0 ? 1 : 0, dragging: true }, queued: 0 })
    return true
  },

  dragTo: (t) => {
    const { turn } = get()
    if (turn?.dragging) set({ turn: { ...turn, t: Math.min(1, Math.max(0, t)) } })
  },

  release: (velocity) => {
    const { turn } = get()
    if (!turn?.dragging) return
    const target: 0 | 1 = velocity > FLICK ? 1 : velocity < -FLICK ? 0 : turn.t >= 0.5 ? 1 : 0
    set({ turn: { ...turn, target, dragging: false } })
  },

  step: (dt, speed) => {
    const { turn, queued } = get()
    if (!turn || turn.dragging) return
    // slow at the ends, fast in the middle (the paper lifts, falls, settles)
    const rate = (dt * speed * (0.45 + 1.1 * Math.sin(Math.PI * turn.t))) / TURN_S
    const t = turn.target === 1 ? Math.min(1, turn.t + rate) : Math.max(0, turn.t - rate)
    if (t !== turn.target) {
      set({ turn: { ...turn, t } })
      return
    }
    const turned = turn.target === 1 ? turn.sheet + 1 : turn.sheet
    set({ turned, turn: null, queued: 0 })
    if (queued > 0) {
      get().turnPage(turn.target === 1 ? 1 : -1)
      set({ queued: queued - 1 })
    }
  },
}))

/** Pages shown now, as a label for the reader bar ("4–5"). */
export function currentSpread(s: Pick<ReaderState, 'sheets' | 'turned' | 'turn' | 'pageCount'>) {
  return spreadLabel(layoutPages(s.sheets, s.turned, s.turn), s.pageCount)
}

declare global {
  interface Window {
    __READER__?: {
      readonly turned: number
      readonly sheets: number
      readonly turning: boolean
      readonly spread: string
    }
  }
}

if (params.e2e) {
  window.__READER__ = {
    get turned() {
      return useReader.getState().turned
    },
    get sheets() {
      return useReader.getState().sheets
    },
    get turning() {
      return useReader.getState().turn !== null
    },
    get spread() {
      return currentSpread(useReader.getState())
    },
  }
}
