// Decoded images kept after upload (plano de desempenho, Etapa 1). The loaders decode each texture into an
// ImageBitmap that three keeps in texture.image after sending it to the GPU: for the room that is ~0,5 GB of
// RAM holding pixels the GPU already has. Once every texture that uses an image is uploaded, the bitmap is
// closed. The KTX2 textures (Etapa 2) keep their compressed mip levels in texture.mipmaps: dropped after their
// upload too. The cost: after a lost WebGL context those textures cannot be re-uploaded (the page reloads them).
import type { CompressedTexture, Material, Object3D, Texture } from 'three'

type ImageSource = Texture['source']

const handled = new WeakSet<ImageSource>()

function isBitmap(data: unknown): data is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap
}

/**
 * Closes the ImageBitmap behind these textures once all of them were uploaded. Textures sharing an image
 * (a glTF image used by two textures, a cloned texture) are counted together.
 */
export function releaseAfterUpload(textures: Iterable<Texture>) {
  const bySource = new Map<ImageSource, Set<Texture>>()
  for (const t of textures) {
    if ((t as CompressedTexture).isCompressedTexture) {
      releaseMipmaps(t as CompressedTexture)
      continue
    }
    if (!isBitmap(t.source.data) || handled.has(t.source)) continue
    let set = bySource.get(t.source)
    if (!set) bySource.set(t.source, (set = new Set()))
    set.add(t)
  }
  for (const [source, set] of bySource) {
    handled.add(source)
    let pending = set.size
    for (const t of set) {
      const previous = t.onUpdate
      let counted = false
      t.onUpdate = (tex: Texture) => {
        previous?.(tex)
        if (counted) return
        counted = true
        if (--pending === 0 && isBitmap(source.data)) source.data.close()
      }
    }
  }
}

const releasing = new WeakSet<Texture>()

/** A compressed texture's mip levels, once on the GPU (each clone holds its own list of them). */
function releaseMipmaps(t: CompressedTexture) {
  if (releasing.has(t)) return
  releasing.add(t)
  const previous = t.onUpdate
  t.onUpdate = (tex: Texture) => {
    previous?.(tex)
    ;(tex as CompressedTexture).mipmaps = []
  }
}

/** Every texture used by the materials under `root`. */
export function texturesOf(root: Object3D): Set<Texture> {
  const out = new Set<Texture>()
  root.traverse((o) => {
    const mats = (o as { material?: Material | Material[] }).material
    if (!mats) return
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(m)) if (v && (v as Texture).isTexture) out.add(v as Texture)
    }
  })
  return out
}
