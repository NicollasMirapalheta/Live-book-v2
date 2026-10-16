// How big the open book is on screen and how sharp its pages are drawn (feedback do usuário no notebook,
// 16/10). On a large monitor the approved framing stays: the spread fills 62% of the view height with the
// room around it. On a laptop-sized view (~720 CSS px tall) the spread grows to 78% so the text is readable
// without zooming; in between it blends.
import type { Quality } from '../../state/quality'

const LARGE_VIEW = 1000
const SMALL_VIEW = 720
const FILL_LARGE = 0.62
const FILL_SMALL = 0.78
/** px kept clear at the bottom for the reading bar and at the top, on the smallest view */
const BAR_SPACE = 124
const TOP_SPACE = 16
/** the approved lift on a large view (m): a little above the view centre, clear of the reading bar */
const LIFT_LARGE = 0.008

/** 0 on a laptop-sized view, 1 on a large one */
const largeness = (viewH: number) => Math.min(1, Math.max(0, (viewH - SMALL_VIEW) / (LARGE_VIEW - SMALL_VIEW)))

/** The open spread's share of the view height. */
export function readFillH(viewH: number): number {
  return FILL_SMALL + (FILL_LARGE - FILL_SMALL) * largeness(viewH)
}

/**
 * How far above the view centre the spread sits (m), for a book at `distance` with a vertical half-FOV
 * tangent `halfH`: centred in the space the reading bar leaves free on a small view.
 */
export function readLift(viewH: number, distance: number, halfH: number): number {
  const small = ((BAR_SPACE - TOP_SPACE) / 2 / (viewH / 2)) * halfH * distance
  return small + (LIFT_LARGE - small) * largeness(viewH)
}

/**
 * Page texture height (px) for the page as it shows now: the page is about the spread's height on screen,
 * times the device pixel ratio and the reading zoom. Steps of 512 (each step redraws the pages), never below
 * 1024 and at most 2048.
 */
export function pageTextureHeight(viewH: number, dpr: number, zoom: number): number {
  const shown = readFillH(viewH) * viewH * dpr * zoom
  return Math.min(2048, Math.max(1024, Math.ceil(shown / 512) * 512))
}

/** Pages kept drawn at once: fewer when they are large (2048 px ≈ 28 MB each, canvas + GPU). */
export function pageTextureKeep(height: number, quality: Quality): number {
  if (height < 2048) return 8
  return quality === 'low' ? 4 : 6
}
