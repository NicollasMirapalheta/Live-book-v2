import { useGLTF } from '@react-three/drei'
import { use, useLayoutEffect, useMemo } from 'react'
import { Box3, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type MeshStandardMaterial, type Object3D } from 'three'
import { contactShadowTexture } from '../book/canvasTextures'
import { loadBookcase, shelfLayoutFor, useShelfBooks } from '../book/shelfData'
import { useQuality } from '../state/quality'
import { invalidateShadows } from './shadows'

/**
 * Shelf props (public/models/props.glb): real-time PBR with the room env, sun and chandelier, shadows.
 * Positions follow the shelf layout: the bookend pairs hug the rows of books and a prop that does not fit
 * moves to the next shelf (src/book/shelfLayout.ts). Props are named prop_<kind>_<i> in slot order.
 */
export function ShelfProps() {
  const quality = useQuality((s) => s.quality)
  const { scene } = useGLTF(quality === 'low' ? '/models/props.low.glb' : '/models/props.glb')
  const data = use(loadBookcase())

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
        mat.envMapIntensity = /brass/i.test(mat.name) ? 0.9 : 0.6
        // aged brass is satin, not mirror: the env holds the hot windows
        if (/brass/i.test(mat.name)) mat.roughness = 0.9
      }
    })
  }, [scene, quality])

  const blobTex = useMemo(() => contactShadowTexture(), [])
  // re-laid out when a book is created or removed (the props make room)
  const books = useShelfBooks()

  useLayoutEffect(() => {
    const layout = shelfLayoutFor(data, books)
    // contact shadow under every visible prop (the props are not in the bake): a soft blob on the board
    const blobs: Mesh[] = []
    const addBlob = (parent: Object3D, w: number, depth: number) => {
      const blob = new Mesh(new PlaneGeometry(w, depth), new MeshBasicMaterial({ color: '#000', alphaMap: blobTex, transparent: true, opacity: 0.55, depthWrite: false }))
      blob.name = 'prop_contact_shadow'
      blob.rotation.x = -Math.PI / 2
      blob.position.y = 0.0008
      blob.renderOrder = 1
      parent.add(blob)
      blobs.push(blob)
    }
    const shelves = new Map(data.shelves.map((s) => [s.index, s]))
    const counts: Record<string, number> = {}
    for (const p of layout.props) {
      const i = (counts[p.kind] = (counts[p.kind] ?? -1) + 1)
      const node = scene.getObjectByName(`prop_${p.kind}_${i}`)
      const shelf = shelves.get(p.shelf)
      if (!node || !shelf) continue
      if (p.kind === 'bookend_pair') {
        const end = p.endX ?? p.x
        const center = (p.x + end) / 2
        const holdsBooks = layout.books.some((b) => b.shelf === p.shelf)
        // empty pairs read as forgotten on a bare shelf; the pair holding a row comes forward with the books
        node.visible = holdsBooks
        node.position.set(center, shelf.y, holdsBooks ? shelf.zFront - 0.07 : node.position.z)
        for (const side of ['l', 'r'] as const) {
          const upright = node.getObjectByName(`prop_${p.kind}_${i}_${side}`)
          if (!upright) continue
          upright.position.setX((side === 'l' ? p.x : end) - center)
          if (holdsBooks) addBlob(upright, 0.14, 0.15)
        }
      } else {
        node.position.set(p.x, shelf.y, (shelf.zFront + shelf.zBack) / 2)
        // footprint from the prop's bounds (in its own frame)
        const box = new Box3().setFromObject(node)
        const size = box.getSize(new Vector3())
        addBlob(node, (size.x / node.scale.x) * 1.5, (size.z / node.scale.z) * 1.5)
      }
    }
    invalidateShadows()
    return () => {
      for (const b of blobs) {
        b.removeFromParent()
        b.geometry.dispose()
        ;(b.material as MeshBasicMaterial).dispose()
      }
    }
  }, [scene, data, blobTex, books])

  return <primitive object={scene} />
}
