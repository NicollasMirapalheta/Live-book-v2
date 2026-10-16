import { PerformanceMonitor } from '@react-three/drei'
import { params } from '../app/params'
import { useQuality } from '../state/quality'
import { useSceneReady } from '../state/ready'

/**
 * Watches the frame rate at high (spec Fase 0: PerformanceMonitor) once the room is up: averaging under
 * 45 fps for most of a 5 s window asks for relief (state/quality.ts `relief`), at most twice. The look stays
 * as designed on a machine that keeps up. Off with ?quality= and in the tools (tests, shots, perf).
 */
export function AdaptiveQuality() {
  const watch = useQuality((s) => s.quality === 'high' && !s.forced && s.relief < 2)
  const ready = useSceneReady((s) => s.ready)
  if (!watch || !ready || params.e2e || params.shot) return null
  return <PerformanceMonitor ms={500} iterations={10} threshold={0.75} bounds={() => [45, 10_000]} onDecline={() => useQuality.getState().relieve()} />
}
