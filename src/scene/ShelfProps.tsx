import { useGLTF } from '@react-three/drei'
import { useLayoutEffect } from 'react'
import type { Mesh, MeshStandardMaterial } from 'three'
import { useQuality } from '../state/quality'

/** Shelf props (public/models/props.glb): real-time PBR with the room env, sun and chandelier, shadows. */
export function ShelfProps() {
  const quality = useQuality((s) => s.quality)
  const { scene } = useGLTF(quality === 'low' ? '/models/props.low.glb' : '/models/props.glb')
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.castShadow = quality === 'high'
      m.receiveShadow = quality === 'high'
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats as MeshStandardMaterial[]) {
        if (/flame/i.test(mat.name)) {
          mat.emissiveIntensity = 6
          mat.toneMapped = false
        }
        mat.envMapIntensity = 1
      }
    })
  }, [scene, quality])
  return <primitive object={scene} />
}
