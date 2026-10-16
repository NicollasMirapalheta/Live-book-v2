import { PerformanceMonitor } from '@react-three/drei'
import { params } from '../app/params'
import { useQuality } from '../state/quality'
import { useSceneReady } from '../state/ready'

/**
 * Watches the frame rate in the automatic mode (spec Fase 0: PerformanceMonitor) once the room is up:
 * averaging under 45 fps for most of a 5 s window steps one level down (state/quality.ts `relieve`), from 5
 * to 3 at most. The look stays as designed on a machine that keeps up. Off when the user picked a level, with
 * ?quality= and in the tools (tests, shots, perf).
 */
export function AdaptiveQuality() {
  const watch = useQuality((s) => s.auto && !s.forced && s.level > 3)
  const ready = useSceneReady((s) => s.ready)
  if (!watch || !ready || params.e2e || params.shot) return null
  return <PerformanceMonitor ms={500} iterations={10} threshold={0.75} bounds={() => [45, 10_000]} onDecline={() => useQuality.getState().relieve()} />
}
