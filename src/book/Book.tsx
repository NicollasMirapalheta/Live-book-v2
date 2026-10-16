import { useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Vector2, type Group, type Material, type Mesh, type Texture } from 'three'
import {
  clothWeaveHeight,
  contactShadowTexture,
  frontFoilMask,
  maskTexture,
  normalFromMask,
  pageEdgeTexture,
  laidPaperTexture,
  paperTexture,
  photoTexture,
  samplePhoto,
  shared,
  isShared,
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
  polaroidLayout,
  spineFoilGeometry,
} from './geometry'
import {
  contactShadowMaterial,
  coverMaterial,
  endpaperMaterial,
  foilMaterial,
  pageEdgeMaterial,
  pageSideMaterial,
  polaroidCardMaterial,
  polaroidPhotoMaterial,
} from './materials'
import { BookReader, type OpenState } from './reader/BookReader'
import type { BookData } from './types'

export interface BookProps {
  book: BookData & { photoSeed?: number }
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** 'shelf': only what shows on a shelf (spine, edges); the front tooling and the polaroid are skipped (draw calls) */
  detail?: 'full' | 'shelf'
  /** reading mode (Fase 4): the cover opening progress, written every frame by the owner of the pose */
  openState?: RefObject<OpenState>
}

const TEX = '/textures/book'

/** The polaroid is ~7 cm on the cover: past this size a phone photo only costs memory. */
const PHOTO_MAX = 1024

/** A photo Blob decoded at most PHOTO_MAX on its longer side (a 12 MP photo is ~48 MB decoded). */
async function decodePhoto(blob: Blob): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob)
  const scale = PHOTO_MAX / Math.max(full.width, full.height)
  if (scale >= 1) return full
  const small = await createImageBitmap(full, {
    resizeWidth: Math.round(full.width * scale),
    resizeHeight: Math.round(full.height * scale),
    resizeQuality: 'high',
  })
  full.close()
  return small
}

/**
 * Photo for the polaroid: the user's Blob, or a generated sample for the fixtures. Only for a book in the hand
 * (`enabled`): on the shelf the polaroid is hidden, and decoding every cover cost hundreds of MB.
 */
function usePhoto(book: BookProps['book'], enabled: boolean): Texture | null {
  // generated sample photos are synchronous; a user's Blob is decoded asynchronously
  const sample = useMemo(
    () => (enabled && book.photoSeed !== undefined && !book.coverPhoto ? photoTexture(samplePhoto(book.photoSeed)) : null),
    [enabled, book.photoSeed, book.coverPhoto],
  )
  const [decoded, setDecoded] = useState<Texture | null>(null)
  useEffect(() => {
    if (!enabled || !book.coverPhoto) return
    let alive = true
    let made: Texture | null = null
    void decodePhoto(book.coverPhoto).then((bmp) => {
      if (!alive) return bmp.close()
      made = photoTexture(bmp)
      setDecoded(made)
    })
    return () => {
      alive = false
      if (made) {
        made.dispose()
        ;(made.image as ImageBitmap).close()
      }
      setDecoded(null)
    }
  }, [enabled, book.coverPhoto])
  useEffect(() => () => sample?.dispose(), [sample])
  return book.coverPhoto ? decoded : sample
}

/** Paper, edges and contact shadow: the same for every book (src/book/canvasTextures.ts `shared`). */
function sharedBookTextures() {
  return {
    paper: shared('book:paper', () => paperTexture()),
    edge: shared('book:edge', () => {
      const t = pageEdgeTexture()
      t.repeat.set(1, 1)
      return t
    }),
    laid: shared('book:laid', () => laidPaperTexture()),
    shadow: shared('contact-shadow', () => contactShadowTexture()),
  }
}

/** Disposes materials with the textures that belong to them alone (shared and `keep` ones stay). */
function disposeOwned(mats: Iterable<Material | null>, keep: Set<Texture>) {
  for (const m of mats) {
    if (!m) continue
    for (const v of Object.values(m)) {
      const t = v as Texture | null
      if (t && t.isTexture && !keep.has(t) && !isShared(t)) t.dispose()
    }
    m.dispose()
  }
}

/**
 * A hardcover book built from its data (spec Fase 2): rounded spine, boards with squares and hinge
 * grooves, text block with concave fore-edge, gold tooling and a polaroid in a recess on the front.
 * Local frame: X thickness (front cover +X), Y height (bottom at 0), spine at z ≈ 0 (bulging to +Z),
 * fore-edge toward −Z.
 */
export function Book({ book, position = [0, 0, 0], rotation = [0, 0, 0], detail = 'full', openState }: BookProps) {
  const coverMesh = useRef<Mesh>(null)
  const pageBlock = useRef<Mesh>(null)
  const frontHalf = useRef<Group>(null)
  const spineFoilMesh = useRef<Mesh>(null)
  const d = useMemo(() => bookDimensions(book.pageCount, book.trim), [book.pageCount, book.trim])
  const prefix = book.coverMaterial === 'leather' ? 'leather' : 'cloth'
  const [lum, normal, arm] = useTexture([`${TEX}/${prefix}_lum.jpg`, `${TEX}/${prefix}_normal.jpg`, `${TEX}/${prefix}_arm.jpg`])
  const full = detail === 'full'
  const photo = usePhoto(book, full)
  // a polaroid only with a photo (a blank card on the cover read as a sticker); the recess goes with it
  const hasPolaroid = !!book.coverPhoto || book.photoSeed !== undefined

  const geo = useMemo(
    () => ({
      cover: coverGeometry(d, { polaroid: hasPolaroid }),
      pages: pageBlockGeometry(d),
      spineFoil: spineFoilGeometry(d),
      frontFoil: frontFoilGeometry(d),
      polaroid: polaroidGeometry(d),
      polaroidSize: [polaroidLayout(d).cardW, polaroidLayout(d).cardH] as [number, number],
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
    const s = sharedBookTextures()
    return {
      cover: coverMaterial(
        book.coverMaterial,
        book.color,
        { lum, normal, arm },
        wear,
        new Vector2(1 / maxU, 1 / d.coverHeight),
        book.coverMaterial === 'cloth' ? shared('book:weave', () => normalFromMask(clothWeaveHeight(0.11), 0.9)) : undefined,
      ),
      // the wear map is a shader uniform, not a material slot: disposed by hand
      wear,
      endpaper: endpaperMaterial(s.laid),
      pageEdge: pageEdgeMaterial(s.edge),
      pageSide: pageSideMaterial(s.paper),
      spineFoil: foilMaterial(maskTexture(spineMask), normalFromMask(spineMask)),
      card: polaroidCardMaterial(s.paper),
      shadow: contactShadowMaterial(s.shadow),
    }
  }, [geo.cover, d, book.title, book.coverMaterial, book.color, lum, normal, arm])

  // the front tooling only shows in the hand: on the shelf it is not drawn (two canvases fewer per book)
  const frontFoil = useMemo(() => {
    if (!full) return null
    const frontMask = frontFoilMask(d.coverWidth - HINGE_OFFSET - 0.008, d.coverHeight - 0.008)
    return foilMaterial(maskTexture(frontMask), normalFromMask(frontMask))
  }, [full, d])

  const pageMats = useMemo(() => [mats.pageEdge, mats.pageSide], [mats])
  const photoMat = useMemo(() => (photo ? polaroidPhotoMaterial(photo) : null), [photo])

  // deterministic ±2° tilt of the polaroid, from the book id
  const tilt = useMemo(() => {
    let h = 0
    for (const ch of book.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return ((h % 401) / 400 - 0.5) * 2 * ((2 * Math.PI) / 180)
  }, [book.id])

  useEffect(
    () => () => {
      geo.cover.dispose()
      geo.pages.dispose()
      geo.spineFoil.dispose()
      geo.frontFoil.dispose()
      geo.polaroid.card.dispose()
      geo.polaroid.photo.dispose()
    },
    [geo],
  )
  // materials with their own textures (canvases): disposed together; shared and loaded ones stay
  useEffect(
    () => () => {
      const { wear, ...materials } = mats
      wear.dispose()
      disposeOwned(Object.values(materials), new Set([lum, normal, arm]))
    },
    [mats, lum, normal, arm],
  )
  useEffect(() => () => disposeOwned([frontFoil], new Set()), [frontFoil])
  // the photo texture belongs to usePhoto
  useEffect(() => () => photoMat?.dispose(), [photoMat])

  return (
    <group position={position} rotation={rotation} name={`book_${book.id}`}>
      {/* geometry.ts builds Z from the spine to the fore-edge; mirrored here so that, facing the front cover,
          the spine is on the left (western binding) */}
      <group scale={[1, 1, -1]}>
      {/* cover: groups 0 outer, 1 board edges, 2 inner face. The inner face shows the cover's turn-ins at the
          squares; the endpaper (mats.endpaper) is only visible once the book opens (Fase 4). */}
      <mesh ref={coverMesh} name="cover" geometry={geo.cover} material={mats.cover} castShadow receiveShadow />
      <mesh ref={pageBlock} name="pageBlock" geometry={geo.pages} material={pageMats} castShadow receiveShadow />
      <mesh ref={spineFoilMesh} name="spineFoil" geometry={geo.spineFoil} material={mats.spineFoil} />
      {/* everything fixed to the front board: turns with it when the book opens */}
      <group ref={frontHalf} name="frontHalf">
        {frontFoil && <mesh name="frontFoil" geometry={geo.frontFoil} material={frontFoil} />}
        <group name="polaroid" position={geo.polaroid.position} rotation={[tilt, 0, 0]} visible={detail === 'full' && hasPolaroid}>
          <mesh rotation={[0, Math.PI / 2, 0]} position={[0.00003, 0, 0]} material={mats.shadow} renderOrder={1}>
            <planeGeometry args={[geo.polaroidSize[0] * 1.12, geo.polaroidSize[1] * 1.1]} />
          </mesh>
          <mesh geometry={geo.polaroid.card} material={mats.card} castShadow receiveShadow />
          {photoMat && <mesh geometry={geo.polaroid.photo} material={photoMat} />}
        </group>
      </group>
      {openState && detail === 'full' && (
        <BookReader
          book={book}
          d={d}
          openState={openState}
          coverMesh={coverMesh}
          spineFoil={spineFoilMesh}
          rightStack={pageBlock}
          frontHalf={frontHalf}
          pagesGeometry={geo.pages}
          pageMaterials={pageMats}
          endpaper={mats.endpaper}
        />
      )}
      </group>
    </group>
  )
}
