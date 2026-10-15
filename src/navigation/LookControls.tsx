import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useNavigation } from './useNavigation'

/** Damping time constant for the drag inertia (spec: ~0.15 s, no floating). */
const INERTIA_S = 0.15
const KEY_YAW_SPEED = 70 // deg/s
const WHEEL_FOV_STEP = 0.02 // deg per wheel delta unit

/** Own lightweight look controls: pointer drag, pinch, wheel and keyboard (no OrbitControls). */
export function LookControls() {
  const gl = useThree((s) => s.gl)
  const velocity = useRef({ yaw: 0, pitch: 0 })
  const keys = useRef(new Set<string>())
  const dragging = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0
    let lastMoveTime = 0

    const degPerPixel = () => useNavigation.getState().fov / el.clientHeight

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId)
      dragging.current = true
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      velocity.current = { yaw: 0, pitch: 0 }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const now = performance.now()
      const dt = Math.max(1, now - lastMoveTime) / 1000
      lastMoveTime = now
      const next = { x: e.clientX, y: e.clientY }
      pointers.set(e.pointerId, next)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        useNavigation.getState().zoom((pinchDist - dist) * 0.1)
        pinchDist = dist
        return
      }
      // Dragging moves the scene with the pointer (grab-and-drag, like Street View).
      const dYaw = -(next.x - prev.x) * degPerPixel()
      const dPitch = (next.y - prev.y) * degPerPixel()
      useNavigation.getState().look(dYaw, dPitch)
      velocity.current = { yaw: dYaw / dt, pitch: dPitch / dt }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      dragging.current = pointers.size > 0
      // A pause before releasing means no fling.
      if (performance.now() - lastMoveTime > 80) velocity.current = { yaw: 0, pitch: 0 }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      useNavigation.getState().zoom(e.deltaY * WHEEL_FOV_STEP)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const nav = useNavigation.getState()
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          void nav.step(1)
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          void nav.step(-1)
          break
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault()
          keys.current.add(e.key)
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key)

    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [gl])

  useFrame((_, delta) => {
    const nav = useNavigation.getState()
    const dt = Math.min(delta, 0.1)
    let dYaw = 0
    if (keys.current.has('ArrowLeft')) dYaw -= KEY_YAW_SPEED * dt
    if (keys.current.has('ArrowRight')) dYaw += KEY_YAW_SPEED * dt
    const v = velocity.current
    if (!dragging.current && (Math.abs(v.yaw) > 0.01 || Math.abs(v.pitch) > 0.01)) {
      dYaw += v.yaw * dt
      nav.look(0, v.pitch * dt)
      const decay = Math.exp(-dt / INERTIA_S)
      v.yaw *= decay
      v.pitch *= decay
    }
    if (dYaw !== 0) nav.look(dYaw, 0)
  })

  return null
}
