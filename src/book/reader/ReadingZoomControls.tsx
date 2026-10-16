import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useSelection } from '../useSelection'
import { isZoomed, useReadingZoom } from './readingZoom'

/** wheel delta → zoom: a notch of a mouse (~100) is ~16%; a touchpad pinch (ctrlKey) sends small deltas */
const WHEEL_RATE = 0.0015
const PINCH_RATE = 0.01

/**
 * Zoom while the book is open (src/book/reader/readingZoom.ts): wheel or touchpad pinch around the pointer,
 * two-finger pinch on touch screens, + / − / 0 on the keyboard, and dragging moves the zoomed view. Leaving
 * the reading resets it.
 */
export function ReadingZoomControls() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const el = gl.domElement
    const open = () => useSelection.getState().phase === 'open'
    const ndc = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      return [((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)] as const
    }
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0

    const onWheel = (e: WheelEvent) => {
      if (!open()) return
      e.preventDefault()
      const [sx, sy] = ndc(e.clientX, e.clientY)
      useReadingZoom.getState().zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE)), sx, sy)
    }
    const onDown = (e: PointerEvent) => {
      if (!open()) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev || !open()) return
      const next = { x: e.clientX, y: e.clientY }
      pointers.set(e.pointerId, next)
      const zoom = useReadingZoom.getState()
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const [sx, sy] = ndc((a.x + b.x) / 2, (a.y + b.y) / 2)
        if (pinch > 0) zoom.zoomAt(dist / pinch, sx, sy)
        pinch = dist
        return
      }
      if (!isZoomed()) return
      const r = el.getBoundingClientRect()
      zoom.panBy(((next.x - prev.x) / r.width) * 2, -((next.y - prev.y) / r.height) * 2)
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = 0
    }
    const onKey = (e: KeyboardEvent) => {
      if (!open() || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select'))) return
      const zoom = useReadingZoom.getState()
      if (e.key === '+' || e.key === '=') zoom.step(1)
      else if (e.key === '-' || e.key === '_') zoom.step(-1)
      else if (e.key === '0') zoom.reset()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    // the zoom belongs to one reading: closing the book frames it as before
    const unsub = useSelection.subscribe((s, prev) => {
      if (prev.phase === 'open' && s.phase !== 'open') useReadingZoom.getState().reset()
    })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      unsub()
    }
  }, [gl])

  return null
}
