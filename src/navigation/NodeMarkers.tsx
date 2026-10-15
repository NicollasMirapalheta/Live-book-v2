import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { AdditiveBlending, CanvasTexture, type Mesh, type MeshBasicMaterial, SRGBColorSpace } from 'three'
import { params } from '../app/params'
import { navNodes, getNeighbors } from './nodes'
import { useNavigation } from './useNavigation'

/** Soft ring texture drawn once on a canvas (Street View–style floor marker). */
function useRingTexture() {
  return useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const c = size / 2
    const g = ctx.createRadialGradient(c, c, size * 0.28, c, c, size * 0.48)
    g.addColorStop(0, 'rgba(255,240,215,0)')
    g.addColorStop(0.35, 'rgba(255,240,215,0.9)')
    g.addColorStop(0.55, 'rgba(255,240,215,0.9)')
    g.addColorStop(1, 'rgba(255,240,215,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    return tex
  }, [])
}

const FLOOR_OFFSET = 0.004
const RADIUS = 0.32

function Marker({ id, map }: { id: string; map: CanvasTexture }) {
  const node = navNodes[id]
  const mesh = useRef<Mesh>(null)
  const [hover, setHover] = useState(false)
  const goTo = useNavigation((s) => s.goTo)

  useFrame((_, delta) => {
    const mat = mesh.current?.material as MeshBasicMaterial | undefined
    if (!mat) return
    const target = useNavigation.getState().isTransitioning ? 0 : hover ? 0.75 : 0.35
    mat.opacity += (target - mat.opacity) * Math.min(1, delta * 8)
  })

  return (
    <mesh
      ref={mesh}
      name={`nav_marker_${id}`}
      position={[node.position[0], FLOOR_OFFSET, node.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
      onClick={(e) => {
        e.stopPropagation()
        void goTo(id)
      }}
    >
      <planeGeometry args={[RADIUS * 2, RADIUS * 2]} />
      <meshBasicMaterial map={map} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}

/** Clickable floor rings toward each neighbor of the current node. Hidden with ?shot=1. */
export function NodeMarkers() {
  const currentNode = useNavigation((s) => s.currentNode)
  const map = useRingTexture()
  if (params.shot) return null
  return (
    <group name="nav_markers">
      {getNeighbors(currentNode).map((id) => (
        <Marker key={id} id={id} map={map} />
      ))}
    </group>
  )
}
