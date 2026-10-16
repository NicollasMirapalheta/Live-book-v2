import { EquirectangularReflectionMapping, type Texture } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

let envPromise: Promise<Texture> | null = null

/** The room's env map when the pipeline ran; else the exterior sky (spec Fase 2). */
export function loadEnv() {
  envPromise ??= (async () => {
    for (const url of ['/env/room_N1.hdr', '/env/exterior_sky.hdr']) {
      try {
        const t = await new HDRLoader().loadAsync(url)
        t.mapping = EquirectangularReflectionMapping
        return t
      } catch {
        // try the next one
      }
    }
    throw new Error('nenhum env map em public/env/ (rode npm run pipeline)')
  })()
  return envPromise
}

