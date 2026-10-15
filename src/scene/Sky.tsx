import { useTexture } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import { BackSide, Color, SphereGeometry, SRGBColorSpace } from 'three'
import { REFLECT_LAYER } from './FloorReflection'

/**
 * What the windows show: the sky panorama rendered by the bake (same orientation as the HDRI used for the
 * lighting). A dome mesh instead of scene.background, so the floor reflection can clip it at the floor
 * plane (a background would leak into the reflection under the walls). Display-referred JPEG, boosted to
 * read as bright outdoor light after AgX.
 */
export function Sky({ intensity = 3.4 }: { intensity?: number }) {
  const tex = useTexture('/env/sky.jpg')
  const geometry = useMemo(() => {
    // upper hemisphere + ~10° below the horizon (all the windows can show); below it the reflection stays dark
    const span = 0.56
    const g = new SphereGeometry(40, 48, 24, 0, Math.PI * 2, 0, Math.PI * span)
    // match three's equirectangular background convention (u = atan(z, x) / 2π + 0.5) and keep v tied to the
    // absolute polar angle (a partial sphere would otherwise stretch the panorama)
    const uv = g.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - (1 - uv.getY(i)) * span)
    return g
  }, [])
  useLayoutEffect(() => {
    tex.colorSpace = SRGBColorSpace
  }, [tex])
  return (
    <mesh
      name="sky_dome"
      geometry={geometry}
      renderOrder={-10}
      frustumCulled={false}
      onUpdate={(m) => m.layers.enable(REFLECT_LAYER)}
    >
      <meshBasicMaterial map={tex} side={BackSide} depthWrite={false} color={new Color(intensity, intensity, intensity)} fog={false} />
    </mesh>
  )
}
