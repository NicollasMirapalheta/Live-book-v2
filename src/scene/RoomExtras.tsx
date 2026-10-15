import { useLayoutEffect } from 'react'
import { Color, MeshBasicMaterial, MeshPhysicalMaterial, type Mesh, type Object3D, type Texture } from 'three'
import { room } from '../config/room'

const matName = (m: Mesh) => (Array.isArray(m.material) ? m.material[0]?.name : m.material?.name) ?? ''
const isGlass = (m: Mesh) => /glass/i.test(matName(m)) || /_glass/.test(m.name)
const isFlame = (m: Mesh) => /flame/i.test(matName(m)) || /flame/.test(m.name)
const isJoint = (m: Mesh) => /subfloor/i.test(matName(m)) || m.name === 'floor_joints'

/** Dark subfloor seen through the plank joints: unlit, never lit by the real-time lights. */
export function FloorJoints({ meshes }: { meshes: Mesh[] }) {
  useLayoutEffect(() => {
    const mat = new MeshBasicMaterial({ color: new Color(room.lighting.darkestShadowHex).multiplyScalar(0.5) })
    for (const m of meshes.filter(isJoint)) m.material = mat
    return () => mat.dispose()
  }, [meshes])
  return null
}

/**
 * Window and lamp glass: thin, slightly rough old glass that only reflects the room env.
 * Not baked; drawn after the opaque room.
 */
export function WindowGlass({ meshes, envMap }: { meshes: Mesh[]; envMap: Texture }) {
  useLayoutEffect(() => {
    const mat = new MeshPhysicalMaterial({
      color: new Color('#f4efe6'),
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.12,
      envMap,
      envMapIntensity: 0.6,
      depthWrite: false,
      specularIntensity: 1,
    })
    for (const m of meshes.filter(isGlass)) {
      m.material = mat
      m.renderOrder = 2
    }
    return () => mat.dispose()
  }, [meshes, envMap])
  return null
}

/** The chandelier's candle bulbs (Chandelier_03 glass): lit, warm emitters instead of sky-reflecting glass. */
export function CandleBulbs({ root }: { root: Object3D }) {
  useLayoutEffect(() => {
    const mat = new MeshBasicMaterial({ color: new Color('#C99A62').multiplyScalar(0.75) })
    root.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && /^Chandelier_03_glass/i.test(matName(m))) m.material = mat
    })
    return () => mat.dispose()
  }, [root])
  return null
}

/** Candle and lamp flames: emissive above 1 so the selective bloom picks them up. */
export function Flames({ meshes }: { meshes: Mesh[] }) {
  useLayoutEffect(() => {
    const color = new Color(room.lighting.chandelier.colorHex).multiplyScalar(6)
    const mat = new MeshBasicMaterial({ color })
    for (const m of meshes.filter(isFlame)) m.material = mat
    return () => mat.dispose()
  }, [meshes])
  return null
}
