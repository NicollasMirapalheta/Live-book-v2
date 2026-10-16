import { useThree } from '@react-three/fiber'
import { use, useLayoutEffect } from 'react'
import { PMREMGenerator } from 'three'
import { loadEnv } from './envLoader'

/** Lights a small book scene with the room's env map (book dev scene, book preview in the form). */
export function RoomEnvironment({ background = true, intensity = 1.25 }: { background?: boolean; intensity?: number }) {
  const hdr = use(loadEnv())
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const rt = pmrem.fromEquirectangular(hdr)
    pmrem.dispose()
    scene.environment = rt.texture
    scene.environmentIntensity = intensity
    if (background) {
      scene.background = rt.texture
      scene.backgroundBlurriness = 0.55
      scene.backgroundIntensity = 0.35
    }
    return () => {
      scene.environment = null
      scene.background = null
      rt.dispose()
    }
  }, [gl, scene, hdr, background, intensity])
  return null
}
