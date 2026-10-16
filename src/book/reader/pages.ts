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
