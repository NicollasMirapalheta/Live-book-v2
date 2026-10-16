import gsap from 'gsap'
import { create } from 'zustand'
import type { Vec3 } from '../config/room'
import { params } from '../app/params'
import { isNode, navNodes, nodeOrder, stepTarget, type NodeId } from './nodes'

export const PITCH_LIMIT = 60
export const FOV_MIN = 40
export const FOV_MAX = 70
const TRANSITION_S = 1.4
const REDUCED_MOTION_S = 0.9
/** Orientation is only tweened back to the node default when the user looks this far away. */
const REORIENT_THRESHOLD = 60
/** The bookcase node always faces the bookcase on arrival (spec Fase 1). */
const FACE_ON_ARRIVAL: NodeId[] = ['N2']

interface NavigationState {
  currentNode: NodeId
  isTransitioning: boolean
  position: Vec3
  /** degrees; 0 = looking at −Z (back wall) */
  yaw: number
  pitch: number
  fov: number
  lensShiftY: number
  /** 0..1 black overlay used for the reduced-motion transition */
  fade: number
  /** a book is selected: no looking, zooming or moving (spec Fase 3) */
  locked: boolean
  setLocked: (locked: boolean) => void
  goTo: (id: NodeId) => Promise<void>
  step: (dir: 1 | -1) => Promise<void>
  look: (dYaw: number, dPitch: number) => void
  zoom: (dFov: number) => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Shortest signed angle difference in degrees (−180..180]. */
export function angleDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180
  return d === -180 ? 180 : d
}

const startId: NodeId = isNode(params.node) ? params.node : nodeOrder[0]
const start = navNodes[startId]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const useNavigation = create<NavigationState>((set, get) => ({
  currentNode: startId,
  isTransitioning: false,
  position: [...start.position],
  yaw: params.yaw ?? start.yawDeg,
  pitch: clamp(params.pitch ?? start.pitchDeg, -PITCH_LIMIT, PITCH_LIMIT),
  fov: clamp(params.fov ?? start.fovDeg, FOV_MIN, FOV_MAX),
  lensShiftY: start.lensShiftY,
  fade: 0,
  locked: false,
  setLocked: (locked) => set({ locked }),

  goTo: async (id) => {
    const state = get()
    if (state.isTransitioning || state.locked || id === state.currentNode || !isNode(id)) return
    const target = navNodes[id]
    const yawOff = Math.abs(angleDelta(state.yaw, target.yawDeg))
    const pitchOff = Math.abs(state.pitch - target.pitchDeg)
    const reorient = FACE_ON_ARRIVAL.includes(id) || yawOff > REORIENT_THRESHOLD || pitchOff > REORIENT_THRESHOLD

    set({ isTransitioning: true })
    const tweened = {
      x: state.position[0],
      y: state.position[1],
      z: state.position[2],
      yaw: state.yaw,
      pitch: state.pitch,
      fov: state.fov,
      lensShiftY: state.lensShiftY,
    }
    const end = {
      x: target.position[0],
      y: target.position[1],
      z: target.position[2],
      // unwrap so the tween takes the shortest way around
      yaw: reorient ? state.yaw + angleDelta(state.yaw, target.yawDeg) : state.yaw,
      pitch: reorient ? target.pitchDeg : state.pitch,
      fov: target.fovDeg,
      lensShiftY: target.lensShiftY,
    }
    const apply = () =>
      set({
        position: [tweened.x, tweened.y, tweened.z],
        yaw: tweened.yaw,
        pitch: tweened.pitch,
        fov: tweened.fov,
        lensShiftY: tweened.lensShiftY,
      })

    if (prefersReducedMotion()) {
      // reduced motion still walks (the user asked to move, not to teleport): shorter, and the view
      // turns instantly instead of rotating during the move
      tweened.yaw = end.yaw
      tweened.pitch = end.pitch
      await gsap.to(tweened, { ...end, duration: REDUCED_MOTION_S, ease: 'power1.inOut', onUpdate: apply })
    } else {
      await gsap.to(tweened, { ...end, duration: TRANSITION_S, ease: 'power2.inOut', onUpdate: apply })
    }
    apply()
    set({ currentNode: id, isTransitioning: false })
  },

  step: async (dir) => {
    const target = stepTarget(get().currentNode, dir)
    if (target) await get().goTo(target)
  },

  look: (dYaw, dPitch) => {
    if (get().isTransitioning || get().locked) return
    set((s) => ({ yaw: s.yaw + dYaw, pitch: clamp(s.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT) }))
  },

  zoom: (dFov) => {
    if (get().isTransitioning || get().locked) return
    set((s) => ({ fov: clamp(s.fov + dFov, FOV_MIN, FOV_MAX) }))
  },
}))

declare global {
  interface Window {
    __NAV__?: {
      readonly currentNode: NodeId
      readonly isTransitioning: boolean
      readonly yaw: number
      readonly pitch: number
      readonly fov: number
      goTo: (id: NodeId) => Promise<void>
      step: (dir: 1 | -1) => Promise<void>
    }
  }
}

if (params.e2e) {
  window.__NAV__ = {
    get currentNode() {
      return useNavigation.getState().currentNode
    },
    get isTransitioning() {
      return useNavigation.getState().isTransitioning
    },
    get yaw() {
      return useNavigation.getState().yaw
    },
    get pitch() {
      return useNavigation.getState().pitch
    },
    get fov() {
      return useNavigation.getState().fov
    },
    goTo: (id) => useNavigation.getState().goTo(id),
    step: (dir) => useNavigation.getState().step(dir),
  }
}
