// The room's models (public/models/*.glb). Since the plano de desempenho (Etapa 2) their textures are KTX2:
// the GPU keeps them compressed (~4× smaller than RGBA); the Basis transcoder is three's, copied to
// public/basis/. Own loader and cache (not drei's useGLTF) so the graphics level can switch the model set
// while the room keeps showing: the new set loads in the background and the old one is then released.
import { useThree } from '@react-three/fiber'
import { use, useEffect, useRef, useState } from 'react'
import type { Material, Mesh, Object3D, Texture, WebGLRenderer } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useQuality, type Quality } from '../state/quality'
import { texturesOf } from './releaseImages'

let loader: GLTFLoader | null = null
const cache = new Map<string, Promise<GLTF>>()

function gltfLoader(gl: WebGLRenderer): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl))
  }
  return loader
}

/** The model at `url`, loaded once (the same promise until it is released). */
export function loadModel(url: string, gl: WebGLRenderer): Promise<GLTF> {
  let p = cache.get(url)
  if (!p) cache.set(url, (p = gltfLoader(gl).loadAsync(url)))
  return p
}

/** Frees a model's geometry, materials and textures (except `keep` and render targets) and forgets it. */
function releaseModel(url: string, root: Object3D, keep: Set<Texture>) {
  // render-target textures (the PMREM env) belong to the scene, not to the model
  for (const t of texturesOf(root)) if (!keep.has(t) && !t.isRenderTargetTexture) t.dispose()
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as Material[]) mat.dispose()
  })
  cache.delete(url)
}

/**
 * The model for the current tier (`urlOf`). When the tier changes, the old model stays on screen until the
 * new one has loaded, then the old one is released. Returns the model and the tier it was made for (what the
 * rest of the component must follow: shadows, reflection…). `keep`: textures shared with other models
 * (the lightmap atlases) that must survive the release.
 */
export function useTierModel(urlOf: (tier: Quality) => string, keep?: () => Set<Texture>): { gltf: GLTF; tier: Quality } {
  const gl = useThree((s) => s.gl)
  const wanted = useQuality((s) => s.quality)
  const [tier, setTier] = useState(wanted)
  const gltf = use(loadModel(urlOf(tier), gl))

  useEffect(() => {
    if (wanted === tier) return
    let alive = true
    void loadModel(urlOf(wanted), gl).then(() => {
      if (alive) setTier(wanted)
    })
    return () => {
      alive = false
    }
  }, [wanted, tier, gl, urlOf])

  // the previous tier's model, once the new one is on screen
  const shown = useRef<{ url: string; root: Object3D } | null>(null)
  useEffect(() => {
    const url = urlOf(tier)
    const prev = shown.current
    if (prev && prev.url !== url) releaseModel(prev.url, prev.root, keep?.() ?? new Set())
    shown.current = { url, root: gltf.scene }
  }, [tier, gltf, urlOf, keep])

  return { gltf, tier }
}
