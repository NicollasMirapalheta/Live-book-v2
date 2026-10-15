import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { Vector2, type Texture } from 'three'
import {
  clothWeaveHeight,
  frontFoilMask,
  maskTexture,
  normalFromMask,
  pageEdgeTexture,
  paperTexture,
  photoTexture,
  samplePhoto,
  spineFoilMask,
  wearTexture,
} from './canvasTextures'
import {
  bookDimensions,
  coverGeometry,
  frontFoilGeometry,
  HINGE_OFFSET,
  pageBlockGeometry,
  polaroidGeometry,
  spineFoilGeometry,
} from './geometry'
import {
  coverMaterial,
  endpaperMaterial,
  foilMaterial,
  pageEdgeMaterial,
  pageSideMaterial,
  polaroidCardMaterial,
  polaroidPhotoMaterial,
} from './materials'
import type { BookData } from './types'

export interface BookProps {
  book: BookData & { photoSeed?: number }
  position?: [number, number, number]
  rotation?: [number, number, number]
}

const TEX = '/textures/book'

/** Photo for the polaroid: the user's Blob, or a generated sample for the fixtures. */
function usePhoto(book: BookProps['book']): Texture | null {
  // generated sample photos are synchronous; a user's Blob is decoded asynchronously
  const sample = useMemo(() => (book.photoSeed !== undefined && !book.coverPhoto ? photoTexture(samplePhoto(book.photoSeed)) : null), [book.photoSeed, book.coverPhoto])
  const [decoded, setDecoded] = useState<Texture | null>(null)
  useEffect(() => {
    if (!book.coverPhoto) return
    let alive = true
    let made: Texture | null = null
    void createImageBitmap(book.coverPhoto).then((bmp) => {
      if (!alive) return
      made = photoTexture(bmp)
      setDecoded(made)
    })
    return () => {
      alive = false
      made?.dispose()
      setDecoded(null)
    }
  }, [book.coverPhoto])
  useEffect(() => () => sample?.dispose(), [sample])
  return book.coverPhoto ? decoded : sample
}

/**
 * A hardcover book built from its data (spec Fase 2): rounded spine, boards with squares and hinge
 * grooves, text block with concave fore-edge, gold tooling and a polaroid in a recess on the front.
 * Local frame: X thickness (front cover +X), Y height (bottom at 0), spine at z ≈ 0 (bulging to +Z),
 * fore-edge toward −Z.
 */
export function Book({ book, position = [0, 0, 0], rotation = [0, 0, 0] }: BookProps) {
  const d = useMemo(() => bookDimensions(book.pageCount, book.trim), [book.pageCount, book.trim])
  const prefix = book.coverMaterial === 'leather' ? 'leather' : 'cloth'
  const [lum, normal, arm] = useTexture([`${TEX}/${prefix}_lum.jpg`, `${TEX}/${prefix}_normal.jpg`, `${TEX}/${prefix}_arm.jpg`])
  const photo = usePhoto(book)
  const hasPolaroid = true

  const geo = useMemo(
    () => ({
      cover: coverGeometry(d, { polaroid: hasPolaroid }),
      pages: pageBlockGeometry(d),
      spineFoil: spineFoilGeometry(d),
      frontFoil: frontFoilGeometry(d),
      polaroid: polaroidGeometry(d),
    }),
    [d, hasPolaroid],
  )

  const mats = useMemo(() => {
    const pos = geo.cover.getAttribute('uv')
    let maxU = 0
    for (let i = 0; i < pos.count; i++) maxU = Math.max(maxU, pos.getX(i))
    // spine spans the middle of the profile: from the back hinge to the front hinge
    const backLen = d.coverWidth - HINGE_OFFSET
    const wear = wearTexture(maxU, d.coverHeight, backLen, maxU - backLen)
    const spineMask = spineFoilMask(book.title, d.totalThickness * 1.5, d.coverHeight)
    const frontMask = frontFoilMask(d.coverWidth - HINGE_OFFSET - 0.008, d.coverHeight - 0.008)
    const paper = paperTexture()
    const edge = pageEdgeTexture()
    edge.repeat.set(1, 1)
    return {
      cover: coverMaterial(
        book.coverMaterial,
        book.color,
        { lum, normal, arm },
        wear,
        new Vector2(1 / maxU, 1 / d.coverHeight),
        book.coverMaterial === 'cloth' ? normalFromMask(clothWeaveHeight(0.11), 0.9) : undefined,
      ),
      endpaper: endpaperMaterial(paper),
      pageEdge: pageEdgeMaterial(edge),
      pageSide: pageSideMaterial(paper),
      spineFoil: foilMaterial(maskTexture(spineMask), normalFromMask(spineMask)),
      frontFoil: foilMaterial(maskTexture(frontMask), normalFromMask(frontMask)),
      card: polaroidCardMaterial(),
    }
  }, [geo.cover, d, book.title, book.coverMaterial, book.color, lum, normal, arm])

  const photoMat = useMemo(() => (photo ? polaroidPhotoMaterial(photo) : null), [photo])

  // deterministic ±2° tilt of the polaroid, from the book id
  const tilt = useMemo(() => {
    let h = 0
    for (const ch of book.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return ((h % 401) / 400 - 0.5) * 2 * ((2 * Math.PI) / 180)
  }, [book.id])

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => ('dispose' in g ? g.dispose() : (g.card.dispose(), g.photo.dispose())))
      Object.values(mats).forEach((m) => m.dispose())
    },
    [geo, mats],
  )

  return (
    <group position={position} rotation={rotation} name={`book_${book.id}`}>
      {/* geometry.ts builds Z from the spine to the fore-edge; mirrored here so that, facing the front cover,
          the spine is on the left (western binding) */}
      <group scale={[1, 1, -1]}>
      {/* cover: groups 0 outer, 1 board edges, 2 endpapers */}
      <mesh name="cover" geometry={geo.cover} material={[mats.cover, mats.cover, mats.endpaper]} castShadow receiveShadow />
      <mesh name="pageBlock" geometry={geo.pages} material={[mats.pageEdge, mats.pageSide]} castShadow receiveShadow />
      <mesh name="spineFoil" geometry={geo.spineFoil} material={mats.spineFoil} />
      <mesh name="frontFoil" geometry={geo.frontFoil} material={mats.frontFoil} />
      <group name="polaroid" position={geo.polaroid.position} rotation={[tilt, 0, 0]}>
        <mesh geometry={geo.polaroid.card} material={mats.card} castShadow receiveShadow />
        {photoMat && <mesh geometry={geo.polaroid.photo} material={photoMat} />}
      </group>
      </group>
    </group>
  )
}
