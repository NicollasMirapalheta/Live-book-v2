import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
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
  }, -100)

  return null
}
