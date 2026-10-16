// Zoom while reading (feedback do usuário no notebook, 16/10): wheel, pinch, + / − and dragging. The book does
// not move: the camera's projection is scaled and shifted (CameraRig applies it), so the pages keep their
// pose, the lights and the depth of field, and clicks still land on them.
import { create } from 'zustand'
import { params } from '../../app/params'

export const MAX_ZOOM = 2.8
const STEP = 1.35

interface ReadingZoomState {
  /** 1 = the reading pose as framed */
  zoom: number
  /** centre of the view, in the unzoomed view's normalized coordinates (−1..1) */
  panX: number
  panY: number
  /** zoom by `factor` keeping the point under (sx, sy) (normalized device coordinates) in place */
  zoomAt: (factor: number, sx?: number, sy?: number) => void
  /** + / − buttons and keys */
  step: (dir: 1 | -1) => void
  /** drag: moves the view by (dx, dy) in normalized device coordinates of the screen */
  panBy: (dx: number, dy: number) => void
  reset: () => void
}

/** The view never leaves the reading frame: at zoom z the centre stays within 1 − 1/z of it. */
const clampPan = (p: number, z: number) => Math.max(-(1 - 1 / z), Math.min(1 - 1 / z, p))

export const useReadingZoom = create<ReadingZoomState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  zoomAt: (factor, sx = 0, sy = 0) => {
    const { zoom, panX, panY } = get()
    const z = Math.max(1, Math.min(MAX_ZOOM, zoom * factor))
    if (z === zoom) return
    // the point under the pointer, in unzoomed coordinates, stays under it: v = s / z0 + p0 = s / z1 + p1
    set({ zoom: z, panX: clampPan(sx / zoom + panX - sx / z, z), panY: clampPan(sy / zoom + panY - sy / z, z) })
  },
  step: (dir) => get().zoomAt(dir > 0 ? STEP : 1 / STEP),
  panBy: (dx, dy) => {
    const { zoom, panX, panY } = get()
    set({ panX: clampPan(panX - dx / zoom, zoom), panY: clampPan(panY - dy / zoom, zoom) })
  },
  reset: () => set({ zoom: 1, panX: 0, panY: 0 }),
}))

/** True when the view is zoomed in enough that a drag should move the view rather than turn a page. */
export const isZoomed = () => useReadingZoom.getState().zoom > 1.02

declare global {
  interface Window {
    __ZOOM__?: { readonly zoom: number; readonly panX: number; readonly panY: number }
  }
}

if (params.e2e) {
  window.__ZOOM__ = {
    get zoom() {
      return useReadingZoom.getState().zoom
    },
    get panX() {
      return useReadingZoom.getState().panX
    },
    get panY() {
      return useReadingZoom.getState().panY
    },
  }
}
