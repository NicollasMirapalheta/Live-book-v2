import { create } from 'zustand'
import { params } from '../../app/params'
import { layoutPages, riffleBounds, sheetToTurn, spreadLabel, type Riffle, type Turn } from './pages'

/** One full turn (s); reduced motion: 60%. */
export const TURN_S = 0.75
/** Drag release: faster than this (turn fraction per second) completes or cancels regardless of position. */
const FLICK = 1.6
const MAX_QUEUE = 3
/** Riffle (table of contents): each flight's turn, the gap between launches, and how many flights at most. */
const RIFFLE_FLIGHT_S = 0.42
const RIFFLE_GAP_S = 0.075
const RIFFLE_FLIGHTS = 14
const RIFFLE_FLIGHTS_REDUCED = 6

/** The page shown for a 1-based page number: sheets turned so that it is on the open spread. */
export const turnedFor = (sheets: number, page: number) => Math.min(sheets, Math.max(0, Math.floor(page / 2)))

interface ReaderState {
  pageCount: number
  sheets: number
  /** sheets lying on the left stack */
  turned: number
  turn: Turn | null
  /** pending turns in the same direction (keys pressed during a turn) */
  queued: number
  /** fast flip to a far page (table of contents); the controls wait while it runs */
  riffle: Riffle | null
  /** sets up the book being opened; `page` (1-based) picks the first spread shown */
  start: (pageCount: number, page?: number) => void
  reset: () => void
  turnPage: (dir: 1 | -1) => void
  beginDrag: (dir: 1 | -1) => boolean
  dragTo: (t: number) => void
  release: (velocity: number) => void
  /** flips through the book to the spread showing `page` (1-based) */
  goTo: (page: number, reduced?: boolean) => void
  /** advances the animation; called every frame by the open book */
  step: (dt: number, speed: number) => void
}

export const useReader = create<ReaderState>((set, get) => ({
  pageCount: 0,
  sheets: 0,
  turned: 0,
  turn: null,
  queued: 0,
  riffle: null,

  start: (pageCount, page) => {
    const sheets = Math.ceil(pageCount / 2)
    const turned = page ? turnedFor(sheets, page) : 0
    set({ pageCount, sheets, turned, turn: null, queued: 0, riffle: null })
  },

  reset: () => set({ turned: 0, turn: null, queued: 0, riffle: null }),

  goTo: (page, reduced = false) => {
    const { turn, turned, sheets, riffle } = get()
    if (turn || riffle) return
    const to = turnedFor(sheets, page)
    if (to === turned) return
    // one sheet away: an ordinary turn
    if (Math.abs(to - turned) === 1) return get().turnPage(to > turned ? 1 : -1)
    const bounds = riffleBounds(turned, to, reduced ? RIFFLE_FLIGHTS_REDUCED : RIFFLE_FLIGHTS)
    set({ riffle: { bounds, dir: to > turned ? 1 : -1, launched: 0, landed: 0, inAir: [], clock: RIFFLE_GAP_S }, queued: 0 })
  },

  turnPage: (dir) => {
    const { turn, turned, sheets, queued, riffle } = get()
    if (riffle) return
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
    const { turn, turned, sheets, riffle } = get()
    if (turn || riffle) return false
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
    const { turn, queued, riffle } = get()
    if (riffle) return stepRiffle(riffle, dt * speed, (next, turned) => set(next ? { riffle: next, turned } : { riffle: null, turned }))
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

/** Launches, moves and lands the riffle's flights; `done(null, turned)` when the last one lands. */
function stepRiffle(r: Riffle, dt: number, done: (next: Riffle | null, turned: number) => void) {
  const flights = r.bounds.length - 1
  let { launched, landed, clock } = r
  const end = r.dir > 0 ? 1 : 0
  let inAir = r.inAir.map((f) => {
    const t = r.dir > 0 ? Math.min(1, f.t + dt / RIFFLE_FLIGHT_S) : Math.max(0, f.t - dt / RIFFLE_FLIGHT_S)
    return { ...f, t }
  })
  // land in order
  while (inAir.length && inAir[0].t === end) {
    inAir = inAir.slice(1)
    landed++
  }
  clock += dt
  if (launched < flights && clock >= RIFFLE_GAP_S) {
    inAir = [...inAir, { index: launched, t: r.dir > 0 ? 0 : 1 }]
    launched++
    clock = 0
  }
  const turned = r.bounds[landed]
  if (landed === flights) return done(null, turned)
  done({ ...r, launched, landed, inAir, clock }, turned)
}

/** Pages shown now, as a label for the reader bar ("4–5"). */
export function currentSpread(s: Pick<ReaderState, 'sheets' | 'turned' | 'turn' | 'pageCount' | 'riffle'>) {
  // while riffling, the destination: the pages in between flash by too fast to read
  const lay = s.riffle ? layoutPages(s.sheets, s.riffle.bounds[s.riffle.bounds.length - 1], null) : layoutPages(s.sheets, s.turned, s.turn)
  return spreadLabel(lay, s.pageCount)
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
      const r = useReader.getState()
      return r.turn !== null || r.riffle !== null
    },
    get spread() {
      return currentSpread(useReader.getState())
    },
  }
}
