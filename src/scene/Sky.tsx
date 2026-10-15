import { useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { EquirectangularReflectionMapping, SRGBColorSpace } from 'three'

/**
 * What the windows show: the sky panorama rendered by the bake (same orientation as the HDRI used
 * for the lighting). It is display-referred, so it is boosted to read as bright outdoor light after AgX.
 */
export function Sky({ intensity = 2.2 }: { intensity?: number }) {
  const tex = useTexture('/env/sky.jpg')
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    tex.mapping = EquirectangularReflectionMapping
    tex.colorSpace = SRGBColorSpace
    scene.background = tex
    scene.backgroundIntensity = intensity
    return () => {
      scene.background = null
    }
  }, [tex, scene, intensity])
  return null
}
