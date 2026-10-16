// The room's models (public/models/*.glb) carry KTX2 textures since the plano de desempenho (Etapa 2): the GPU
// keeps them compressed (~4× smaller than RGBA). The Basis transcoder is three's, copied to public/basis/.
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { WebGLRenderer } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

let ktx2: KTX2Loader | null = null

function ktx2Loader(gl: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl)
  return ktx2
}

/** useGLTF with the KTX2 loader (Meshopt as before). */
export function useModel(url: string) {
  const gl = useThree((s) => s.gl)
  return useGLTF(url, true, true, (loader) => {
    ;(loader as unknown as { setKTX2Loader: (l: KTX2Loader) => void }).setKTX2Loader(ktx2Loader(gl))
  })
}
