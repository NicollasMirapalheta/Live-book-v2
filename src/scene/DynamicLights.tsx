import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Color, type DirectionalLight } from 'three'
import { room, sunTravelDirection } from '../config/room'
import { useQuality } from '../state/quality'
import { setShadowInvalidator } from './shadows'

/**
 * The chandelier light casts no shadow: a point-light shadow re-renders every caster six times per frame
 * (cube map), which alone would cost ~60 draw calls. The sun shadow is enough to seat the props.
 *
 * Real-time lights for the dynamic objects only (books, shelf props). The baked room ignores them
 * (see staticLightmapMaterial). Intensities follow the Cycles setup: sun 7 W/m² = irradiance 7,
 * chandelier ≈ 17 candles × 9 W / 4π.
 */
export function DynamicLights() {
  const sun = useRef<DirectionalLight>(null)
  const quality = useQuality((s) => s.quality)
  const gl = useThree((s) => s.gl)

  // Props and books only move on explicit actions: render the shadow map once and on demand
  // (call invalidateShadows() after moving a dynamic object).
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    let frames = 0
    let raf = 0
    const tick = () => {
      gl.shadowMap.needsUpdate = true
      if (++frames < 3) raf = requestAnimationFrame(tick)
    }
    tick()
    setShadowInvalidator(() => {
      gl.shadowMap.needsUpdate = true
    })
    return () => {
      cancelAnimationFrame(raf)
      gl.shadowMap.autoUpdate = true
      setShadowInvalidator(null)
    }
  }, [gl, quality])
  const travel = sunTravelDirection()
  const target = room.bookcase.center
  const ch = room.chandelier

  useLayoutEffect(() => {
    const s = sun.current
    if (!s) return
    s.target.position.set(target[0], 1.4, target[2])
    s.target.updateMatrixWorld()
    const cam = s.shadow.camera
    cam.left = -1.4
    cam.right = 1.4
    cam.top = 1.6
    cam.bottom = -1.6
    cam.near = 0.1
    cam.far = 12
    cam.updateProjectionMatrix()
  }, [target])

  const sunPos: [number, number, number] = [
    target[0] - travel[0] * 6,
    1.4 - travel[1] * 6,
    target[2] - travel[2] * 6,
  ]
  return (
    <>
      <directionalLight
        ref={sun}
        position={sunPos}
        color={new Color(room.lighting.sun.colorHex)}
        intensity={7}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <pointLight
        position={[ch.anchor[0], ch.bottomY + 0.25, ch.anchor[2]]}
        color={new Color(room.lighting.chandelier.colorHex)}
        intensity={12}
        decay={2}
        distance={0}
      />
    </>
  )
}
