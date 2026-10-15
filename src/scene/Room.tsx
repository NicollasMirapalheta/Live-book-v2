import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { use, useLayoutEffect, useMemo } from 'react'
import { EquirectangularReflectionMapping, PMREMGenerator, type Texture } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { params } from '../app/params'
import { useQuality } from '../state/quality'
import { applyLightmaps, loadAtlasTexture, loadManifest, type LightmapManifest } from './Lightmaps'
import { PlaceholderRoom } from './PlaceholderRoom'
import { FloorReflection } from './FloorReflection'
import { FloorJoints, Flames, WindowGlass } from './RoomExtras'

interface RoomAssets {
  manifest: LightmapManifest
  atlases: Record<string, Texture>
  env: Texture
}

let assetsPromise: Promise<RoomAssets | null> | null = null

function loadRoomAssets(): Promise<RoomAssets | null> {
  assetsPromise ??= (async () => {
    const manifest = await loadManifest()
    if (!manifest) return null
    const entries = await Promise.all(
      Object.entries(manifest.atlases).map(async ([name, info]) => [name, await loadAtlasTexture(info)] as const),
    )
    const env = await new HDRLoader().loadAsync('/env/room_N1.hdr')
    env.mapping = EquirectangularReflectionMapping
    return { manifest, atlases: Object.fromEntries(entries), env }
  })()
  return assetsPromise
}

function BakedRoom({ assets }: { assets: RoomAssets }) {
  const quality = useQuality((s) => s.quality)
  const { scene: room } = useGLTF(quality === 'low' ? '/models/room.low.glb' : '/models/room.glb')
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  // Prefiltered env (PMREM) for the specular of static materials and the IBL of dynamic ones.
  const envMap = useMemo(() => {
    const pmrem = new PMREMGenerator(gl)
    const rt = pmrem.fromEquirectangular(assets.env)
    pmrem.dispose()
    return rt.texture
  }, [gl, assets.env])

  const reflect = quality === 'high' && !params.off.has('reflect')
  const unbaked = useMemo(() => applyLightmaps(room, assets.manifest, assets.atlases, envMap, reflect), [room, assets, envMap, reflect])

  useLayoutEffect(() => {
    scene.environment = envMap
    return () => {
      scene.environment = null
    }
  }, [scene, envMap])

  return (
    <>
      <primitive object={room} />
      <WindowGlass meshes={unbaked} envMap={envMap} />
      <Flames meshes={unbaked} />
      <FloorJoints meshes={unbaked} />
      {reflect && <FloorReflection root={room} />}
    </>
  )
}

/** The baked room (public/models/room.glb + lightmaps). Before the pipeline ran: registered placeholder. */
export function Room() {
  const assets = use(loadRoomAssets())
  if (!assets) return <PlaceholderRoom />
  return <BakedRoom assets={assets} />
}
