import type { PerspectiveCamera } from 'three'

/**
 * Applies the vertical lens shift from room.json ($conventions.lensShift):
 * positive = optical center moves down by that fraction of the frame height,
 * showing more floor while verticals stay parallel (no pitch).
 * Must run after every updateProjectionMatrix().
 */
export function applyLensShift(camera: PerspectiveCamera, lensShiftY: number): void {
  if (lensShiftY === 0) return
  // clip.y += m[1][2]·z and z = -w in front of the camera, so ndc.y -= m[1][2].
  // The horizon (ndc.y = 0 with no pitch) must move up by 2·s (0.21 → 29% from the top).
  camera.projectionMatrix.elements[9] = -2 * lensShiftY
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export const DEG = Math.PI / 180
