// Page bookkeeping of the open book (spec Fase 4). Sheet i carries the recto page 2i+1 (right side while it
// is on the right stack) and the verso page 2i+2 (left side once turned). Page numbers past the book's
// pageCount are blank (odd page counts end on a blank verso).

export interface Turn {
  /** sheet being turned */
  sheet: number
  /** 0 = lying on the right stack, 1 = lying on the left stack */
  t: number
  /** where it is heading: 1 completes a forward turn, 0 a backward one (or cancels) */
  target: 0 | 1
  dragging: boolean
}

export interface PageLayout {
  /** page shown on top of the left stack (null: the front endpaper shows) */
  left: number | null
  /** page shown on top of the right stack (null: the back endpaper shows) */
  right: number | null
  /** the sheet in the air, if any */
  turning: { sheet: number; front: number; back: number; t: number } | null
  /** sheets on the left stack, fractional while one turns */
  leftSheets: number
}

export const recto = (sheet: number) => 2 * sheet + 1
export const verso = (sheet: number) => 2 * sheet + 2

export function layoutPages(sheets: number, turned: number, turn: Turn | null): PageLayout {
  if (!turn) {
    return {
      left: turned > 0 ? verso(turned - 1) : null,
      right: turned < sheets ? recto(turned) : null,
      turning: null,
      leftSheets: turned,
    }
  }
  const s = turn.sheet
  return {
    left: s > 0 ? verso(s - 1) : null,
    right: s + 1 < sheets ? recto(s + 1) : null,
    turning: { sheet: s, front: recto(s), back: verso(s), t: turn.t },
    leftSheets: s + turn.t,
  }
}

/** Thickness of each stack (m) for a fractional number of sheets on the left. */
export function stackSplit(blockThickness: number, sheets: number, leftSheets: number) {
  const f = sheets > 0 ? Math.min(1, Math.max(0, leftSheets / sheets)) : 0
  return { left: blockThickness * f, right: blockThickness * (1 - f) }
}

/** The sheet a turn in this direction would lift, or null at the first/last spread. */
export function sheetToTurn(sheets: number, turned: number, dir: 1 | -1): number | null {
  if (dir > 0) return turned < sheets ? turned : null
  return turned > 0 ? turned - 1 : null
}

/** Spread label for a page pair, e.g. "2–3" (blank pages past the end are left out). */
export function spreadLabel(layout: Pick<PageLayout, 'left' | 'right'>, pageCount: number) {
  const shown = [layout.left, layout.right].filter((p): p is number => p !== null && p <= pageCount)
  return shown.join('–')
}

// ---------------------------------------------------------------------------
// Riffle: jumping to a far page (table of contents) flips through the book in a few seconds at most. Each
// visible flight carries a chunk of sheets; several are in the air at once.
// ---------------------------------------------------------------------------

export interface Riffle {
  /** sheets turned at each flight boundary: bounds[0] = start, bounds[K] = target (K flights) */
  bounds: number[]
  dir: 1 | -1
  /** flights launched / landed (they land in launch order) */
  launched: number
  landed: number
  /** flights in the air: index into the flights, t as in Turn (0 on the right stack, 1 on the left) */
  inAir: { index: number; t: number }[]
  /** seconds since the last launch */
  clock: number
}

/** Boundaries for a riffle from `from` to `to` sheets turned, in at most `maxFlights` flights. */
export function riffleBounds(from: number, to: number, maxFlights: number): number[] {
  const n = Math.abs(to - from)
  const k = Math.max(1, Math.min(n, maxFlights))
  const dir = Math.sign(to - from)
  const out: number[] = []
  for (let i = 0; i <= k; i++) out.push(from + dir * Math.round((n * i) / k))
  return out
}

export interface RiffleLayout {
  left: number | null
  right: number | null
  /** the flights in the air: front = recto of the chunk's first sheet, back = verso of its last */
  flights: { front: number; back: number; t: number }[]
  /** sheets on the left stack (the ones in the air belong to neither until they land) */
  leftSheets: number
  /** sheets turned so far (landed) */
  turned: number
}

export function layoutRiffle(sheets: number, r: Riffle): RiffleLayout {
  const b = r.bounds
  const landedAt = b[r.landed]
  const launchedAt = b[r.launched]
  // forward: what has landed is on the left, what is not launched yet on the right; backward: the reverse
  const leftAt = r.dir > 0 ? landedAt : launchedAt
  const rightAt = r.dir > 0 ? launchedAt : landedAt
  return {
    left: leftAt > 0 ? verso(leftAt - 1) : null,
    right: rightAt < sheets ? recto(rightAt) : null,
    flights: r.inAir.map(({ index, t }) => {
      const lo = Math.min(b[index], b[index + 1])
      const hi = Math.max(b[index], b[index + 1])
      return { front: recto(lo), back: verso(hi - 1), t }
    }),
    leftSheets: leftAt,
    turned: landedAt,
  }
}
