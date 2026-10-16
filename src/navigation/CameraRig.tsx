import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { useReadingZoom } from '../book/reader/readingZoom'
import { applyLensShift, DEG } from '../scene/Camera'
import { useNavigation } from './useNavigation'

/** Drives the default camera from the navigation store (position, yaw/pitch, FOV, lens shift). */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useFrame(() => {
    const { position, yaw, pitch, fov, lensShiftY } = useNavigation.getState()
    camera.position.set(position[0], position[1], position[2])
    // yaw 0 looks at −Z (three.js default forward); positive yaw turns right.
    camera.rotation.set(pitch * DEG, -yaw * DEG, 0, 'YXZ')
    if (camera.fov !== fov) camera.fov = fov
    camera.updateProjectionMatrix()
    applyLensShift(camera, lensShiftY)
    // reading zoom (book/reader/readingZoom.ts): screen = (unzoomed − pan) · zoom, on the projection's x and y rows
    const { zoom, panX, panY } = useReadingZoom.getState()
    if (zoom !== 1 || panX !== 0 || panY !== 0) {
      const e = camera.projectionMatrix.elements
      for (const [row, pan] of [[0, panX], [1, panY]] as const) {
        for (let c = 0; c < 4; c++) e[c * 4 + row] = zoom * (e[c * 4 + row] - pan * e[c * 4 + 3])
      }
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    }
  }, -100)

  return null
}
