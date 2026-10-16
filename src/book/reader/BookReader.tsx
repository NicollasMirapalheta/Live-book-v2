import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Quaternion, Vector3, type BufferGeometry, type Group, type Material, type Mesh, type MeshPhysicalMaterial, type MeshStandardMaterial } from 'three'
import { invalidateShadows } from '../../scene/shadows'
import { BOARD, HINGE_OFFSET, SQUARE, type BookDimensions } from '../geometry'
import { setCoverOpen } from '../materials'
import { useSelection } from '../useSelection'
import { layoutPages, stackSplit } from './pages'
import { PageTextures, type PageBook } from './pageContent'
import { pageMaterial, pagePlaneGeometry, SHEET_SEGMENTS, sheetMaterial, type PageUniforms, type SheetUniforms } from './sheetMaterial'
import { useReader } from './useReader'

/** Opening angle of the cover: a little short of flat, like a book held open (the two halves form a V). */
export const OPEN_ANGLE = (175 * Math.PI) / 180
/** Hinge line of the pages and of the open cover (z in the closed-book frame). */
const PIVOT_Z = 0
const EPS = 0.0002
/** rise of the open pages out of the gutter (m) */
const PAGE_LIFT = 0.008
/** slow wave in the paper (m) */
const PAGE_RIPPLE = 0.0007
/** each open page runs this far past the binding, under the other: the two pages never leave a gap */
const GUTTER_OVERLAP = 0.0018
/** leather turn-in left visible around the endpapers on the inside of the boards (m) */
const TURN_IN = 0.013
const DRAG_CLICK_PX = 6
const REDUCED_FACTOR = 0.6

const Y = new Vector3(0, 1, 0)
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export interface OpenState {
  /** cover opening 0 (closed) → 1 (open) */
  cover: number
}

interface BookReaderProps {
  book: PageBook
  d: BookDimensions
  openState: RefObject<OpenState>
  coverMesh: RefObject<Mesh | null>
  /** the full text block of the closed book: becomes the right stack */
  rightStack: RefObject<Mesh | null>
  spineFoil: RefObject<Mesh | null>
  /** front board decorations (foil, polaroid): turn with the cover */
  frontHalf: RefObject<Group | null>
  pagesGeometry: BufferGeometry
  pageMaterials: Material[]
  endpaper: MeshStandardMaterial
}

/**
 * The open book (spec Fase 4), in the closed-book frame of Book.tsx (x thickness, front +X; z from the spine
 * to the fore-edge). Opening turns the front half — front board, left stack, left page — around a vertical
 * hinge at the boundary between the two stacks, so both page surfaces stay level. The sheet in the air turns
 * around the same hinge with a curl. Only the visible pages exist as textures.
 */
export function BookReader({ book, d, openState, coverMesh, spineFoil, rightStack, frontHalf, pagesGeometry, pageMaterials, endpaper }: BookReaderProps) {
  const leftHalf = useRef<Group>(null)
  const leftStack = useRef<Mesh>(null)
  const rightPage = useRef<Mesh>(null)
  const leftPage = useRef<Mesh>(null)
  const sheet = useRef<Mesh>(null)
  const scratch = useMemo(() => ({ q: new Quaternion(), p: new Vector3(), r: new Vector3() }), [])

  const T = d.totalThickness / 2
  const W = d.pageWidth
  const H = d.pageHeight
  const geo = useMemo(
    () => ({
      right: pagePlaneGeometry(W, H, SQUARE, 1, { segU: 40, segV: 6, lift: PAGE_LIFT, ripple: PAGE_RIPPLE, extend: GUTTER_OVERLAP, seed: 1 }),
      left: pagePlaneGeometry(W, H, SQUARE, -1, { segU: 40, segV: 6, mirrorU: true, lift: PAGE_LIFT, ripple: PAGE_RIPPLE, extend: GUTTER_OVERLAP, seed: 4 }),
      sheet: pagePlaneGeometry(W, H, SQUARE, 1, { segU: SHEET_SEGMENTS.u, segV: SHEET_SEGMENTS.v }),
      endFront: pagePlaneGeometry(d.coverWidth - HINGE_OFFSET - TURN_IN, d.coverHeight - 2 * TURN_IN, TURN_IN, -1),
      endBack: pagePlaneGeometry(d.coverWidth - HINGE_OFFSET - TURN_IN, d.coverHeight - 2 * TURN_IN, TURN_IN, 1),
    }),
    [W, H, d.coverWidth, d.coverHeight],
  )
  const textures = useMemo(() => new PageTextures(book, W / H), [book, W, H])
  const mats = useMemo(() => {
    const blank = textures.get(book.pageCount + 1000)
    const right = pageMaterial(0)
    // the left page is read mirrored: its binding is at uv.x = 1
    const left = pageMaterial(1)
    right.map = blank
    left.map = blank
    const sheetMat = sheetMaterial(W, PAGE_LIFT)
    sheetMat.map = blank
    ;(sheetMat.userData.sheet as SheetUniforms).backMap.value = blank
    return { right, left, sheet: sheetMat }
  }, [textures, book.pageCount, W])

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(mats).forEach((m) => m.dispose())
      textures.dispose()
    },
    [geo, mats, textures],
  )

  // closed again (or unmounted): the text block is whole, the front board back in place
  useEffect(() => {
    const cover = coverMesh.current
    const stack = rightStack.current
    const front = frontHalf.current
    const foil = spineFoil.current
    return () => {
      if (foil) {
        foil.position.x = 0
        foil.visible = true
      }
      if (cover) {
        setCoverOpen(cover.material as MeshPhysicalMaterial, 0, 0, 0)
        cover.castShadow = true
      }
      if (stack) {
        stack.scale.x = 1
        stack.position.x = 0
        stack.visible = true
      }
      front?.position.set(0, 0, 0)
      front?.quaternion.identity()
      invalidateShadows()
    }
  }, [coverMesh, rightStack, frontHalf, spineFoil])

  useFrame((_, delta) => {
    const reader = useReader.getState()
    const reduced = reducedMotion()
    reader.step(Math.min(delta, 0.1), reduced ? 1 / REDUCED_FACTOR : 1)
    const { sheets, turned, turn } = useReader.getState()
    const theta = OPEN_ANGLE * (openState.current?.cover ?? 0)
    const lay = layoutPages(sheets, turned, turn)
    const split = stackSplit(d.blockThickness, sheets, lay.leftSheets)
    const t = d.blockThickness / 2
    const xb = -t + split.right
    const block = d.blockThickness

    // front half: rotation by theta around the vertical axis through (xb, PIVOT_Z)
    const { q, p, r } = scratch
    q.setFromAxisAngle(Y, theta)
    p.set(xb, 0, PIVOT_Z)
    r.copy(p).applyQuaternion(q)
    for (const g of [frontHalf.current, leftHalf.current]) {
      if (!g) continue
      g.quaternion.copy(q)
      g.position.copy(p).sub(r)
    }
    const cover = coverMesh.current
    if (cover) {
      // the spine sinks behind the gutter as the cover opens (otherwise its arc stands in front of the pages)
      const spineShift = (openState.current?.cover ?? 0) * (T - xb + 0.006)
      setCoverOpen(cover.material as MeshPhysicalMaterial, theta, xb, PIVOT_Z, spineShift)
      // the spine title faces away once the book is open; its letters poked through the left page's margin
      if (spineFoil.current) {
        spineFoil.current.position.x = -spineShift
        spineFoil.current.visible = theta < 0.5
      }
      // the depth pass does not run the hinge shader: no sun shadow from a cover that is (partly) open
      const cast = theta < 1e-4
      if (cover.castShadow !== cast) {
        cover.castShadow = cast
        invalidateShadows()
      }
    }

    // the two stacks partition the closed text block [−t, t] at xb
    const rs = rightStack.current
    if (rs) {
      rs.visible = split.right > 1e-6
      rs.scale.x = Math.max(split.right / block, 1e-4)
      rs.position.x = -t + split.right / 2
    }
    const ls = leftStack.current
    if (ls) {
      ls.visible = split.left > 1e-6
      ls.scale.x = Math.max(split.left / block, 1e-4)
      ls.position.x = xb + split.left / 2
    }

    // the sheet in the air shades the page it leaves (first half) and the one it lands on (second half)
    const lift = lay.turning ? Math.sin(Math.PI * lay.turning.t) : 0
    ;(mats.right.userData.page as PageUniforms).uShade.value = lay.turning ? lift * (1 - lay.turning.t) : 0
    ;(mats.left.userData.page as PageUniforms).uShade.value = lay.turning ? lift * lay.turning.t : 0

    const open = theta > 1e-4
    const rp = rightPage.current
    if (rp) {
      rp.visible = open && lay.right !== null
      rp.position.x = xb + EPS
      if (lay.right !== null) setMap(mats.right, textures.get(lay.right))
    }
    const lp = leftPage.current
    if (lp) {
      lp.visible = open && lay.left !== null
      lp.position.x = xb - EPS
      if (lay.left !== null) setMap(mats.left, textures.get(lay.left))
    }
    const sh = sheet.current
    if (sh) {
      sh.visible = open && lay.turning !== null
      if (lay.turning) {
        const u = mats.sheet.userData.sheet as SheetUniforms
        u.uTurn.value = lay.turning.t
        u.uTheta.value = theta
        u.uPivot.value.set(xb, PIVOT_Z)
        u.uDir.value = turn?.target === 0 ? -1 : 1
        u.uCurl.value = reduced ? 0 : 0.35
        setMap(mats.sheet, textures.get(lay.turning.front))
        u.backMap.value = textures.get(lay.turning.back)
      }
    }
  })

  // pointer: click or drag a page; forward from the right page, back from the left one
  const onDown = (dir: 1 | -1) => (e: ThreeEvent<PointerEvent>) => {
    if (useSelection.getState().phase !== 'open') return
    e.stopPropagation()
    const reader = useReader.getState()
    if (!reader.beginDrag(dir)) {
      // a turn is already running: a click queues the next one
      reader.turnPage(dir)
      return
    }
    const x0 = e.nativeEvent.clientX
    // the page spans roughly a third of the view while reading
    const span = window.innerWidth * 0.32
    let last = { t: dir > 0 ? 0 : 1, time: performance.now() }
    let velocity = 0
    let moved = 0
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      moved = Math.max(moved, Math.abs(dx))
      const t = dir > 0 ? -dx / span : 1 - dx / span
      const now = performance.now()
      if (now > last.time) velocity = (t - last.t) / ((now - last.time) / 1000)
      last = { t, time: now }
      useReader.getState().dragTo(t)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      // a click (no real drag) turns the page all the way
      useReader.getState().release(moved < DRAG_CLICK_PX ? dir * 100 : velocity)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const cursor = (on: boolean) => () => {
    document.body.style.cursor = on && useSelection.getState().phase === 'open' ? 'grab' : ''
  }

  const endX = T - BOARD - 0.0003
  return (
    <>
      <mesh ref={rightPage} name="page_right" geometry={geo.right} material={mats.right} visible={false} onPointerDown={onDown(1)} onPointerOver={cursor(true)} onPointerOut={cursor(false)} />
      <mesh ref={sheet} name="page_turning" geometry={geo.sheet} material={mats.sheet} visible={false} frustumCulled={false} />
      <mesh name="endpaper_back" geometry={geo.endBack} material={endpaper} position={[-endX, 0, HINGE_OFFSET]} />
      <group ref={leftHalf}>
        <mesh ref={leftStack} name="pages_left" geometry={pagesGeometry} material={pageMaterials} visible={false} receiveShadow />
        <mesh ref={leftPage} name="page_left" geometry={geo.left} material={mats.left} visible={false} onPointerDown={onDown(-1)} onPointerOver={cursor(true)} onPointerOut={cursor(false)} />
        <mesh name="endpaper_front" geometry={geo.endFront} material={endpaper} position={[endX, 0, HINGE_OFFSET]} />
      </group>
    </>
  )
}

function setMap(mat: MeshStandardMaterial, tex: MeshStandardMaterial['map']) {
  if (mat.map !== tex) mat.map = tex
}
