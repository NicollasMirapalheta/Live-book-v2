import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Vector3, type BufferGeometry, type Group, type Material, type MeshPhysicalMaterial, type MeshStandardMaterial } from 'three'
import { invalidateShadows } from '../../scene/shadows'
import { useQuality } from '../../state/quality'
import { BOARD, HINGE_OFFSET, SQUARE, type BookDimensions } from '../geometry'
import { setCoverOpen } from '../materials'
import { useSelection } from '../useSelection'
import { layoutPages, layoutRiffle, stackSplit } from './pages'
import { PAGE_TEX_HEIGHT, PageTextures, type PageBook } from './pageContent'
import { pageMaterial, pagePlaneGeometry, SHEET_SEGMENTS, sheetMaterial, type PageUniforms, type SheetUniforms } from './sheetMaterial'
import { useReader } from './useReader'

/** Opening angle of the cover: a little short of flat, like a book held open (the two halves form a V). */
export const OPEN_ANGLE = (175 * Math.PI) / 180
/** Hinge line of the pages and of the open cover (z in the closed-book frame). */
const PIVOT_Z = 0
const EPS = 0.0002
/** sheets that can be in the air at once (riffle: flight time / launch gap, rounded up) */
const SHEET_POOL = 7
/** page textures while riffling (px high) */
const RIFFLE_TEX_HEIGHT = 512

interface Flight {
  front: number
  back: number
  t: number
  dir: number
}
/** rise of the open pages out of the gutter (m) */
const PAGE_LIFT = 0.008
/** slow wave in the paper (m) */
const PAGE_RIPPLE = 0.0007
/** one wave for both pages: the sheet in the air starts and lands on exactly the same surface */
const PAGE_SEED = 1
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
  const sheetRefs = useRef<(Mesh | null)[]>([])
  const scratch = useMemo(() => ({ q: new Quaternion(), p: new Vector3(), r: new Vector3() }), [])

  const T = d.totalThickness / 2
  const W = d.pageWidth
  const H = d.pageHeight
  const geo = useMemo(
    () => ({
      right: pagePlaneGeometry(W, H, SQUARE, 1, { segU: 40, segV: 6, lift: PAGE_LIFT, ripple: PAGE_RIPPLE, extend: GUTTER_OVERLAP, seed: PAGE_SEED }),
      left: pagePlaneGeometry(W, H, SQUARE, -1, { segU: 40, segV: 6, mirrorU: true, lift: PAGE_LIFT, ripple: PAGE_RIPPLE, extend: GUTTER_OVERLAP, seed: PAGE_SEED }),
      sheet: pagePlaneGeometry(W, H, SQUARE, 1, { segU: SHEET_SEGMENTS.u, segV: SHEET_SEGMENTS.v }),
      endFront: pagePlaneGeometry(d.coverWidth - HINGE_OFFSET - TURN_IN, d.coverHeight - 2 * TURN_IN, TURN_IN, -1),
      endBack: pagePlaneGeometry(d.coverWidth - HINGE_OFFSET - TURN_IN, d.coverHeight - 2 * TURN_IN, TURN_IN, 1),
      board: pagePlaneGeometry(d.coverWidth, d.coverHeight, 0, 1),
    }),
    [W, H, d.coverWidth, d.coverHeight],
  )
  const quality = useQuality((st) => st.quality)
  const textures = useMemo(() => new PageTextures(book, W / H, PAGE_TEX_HEIGHT[quality]), [book, W, H, quality])
  // while riffling, every page is seen for a few frames in motion: small textures, drawn fast
  const quick = useMemo(() => new PageTextures(book, W / H, RIFFLE_TEX_HEIGHT, 32), [book, W, H])
  const mats = useMemo(() => {
    const blank = textures.get(book.pageCount + 1000)
    const right = pageMaterial(0)
    // the left page is read mirrored: its binding is at uv.x = 1
    const left = pageMaterial(1)
    right.map = blank
    left.map = blank
    const sheets = Array.from({ length: SHEET_POOL }, () => {
      const m = sheetMaterial(W, PAGE_LIFT, PAGE_RIPPLE, PAGE_SEED)
      m.map = blank
      ;(m.userData.sheet as SheetUniforms).backMap.value = blank
      return m
    })
    return { right, left, sheets }
  }, [textures, book.pageCount, W])

  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      mats.right.dispose()
      mats.left.dispose()
      mats.sheets.forEach((m) => m.dispose())
      textures.dispose()
      quick.dispose()
    },
    [geo, mats, textures, quick],
  )

  // closed again (or unmounted): the text block is whole, the front board back in place
  useEffect(() => {
    const cover = coverMesh.current
    const stack = rightStack.current
    const front = frontHalf.current
    const foil = spineFoil.current
    // the hinge turns the front board in the shader only: on the CPU the cover still lies closed over the
    // right page and would catch its clicks. The invisible board planes below stand in for it.
    if (cover) cover.raycast = noRaycast
    return () => {
      if (cover) cover.raycast = Mesh.prototype.raycast
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
        setShown(stack, true)
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
    const { sheets, turned, turn, riffle } = useReader.getState()
    const theta = OPEN_ANGLE * (openState.current?.cover ?? 0)
    // one sheet turning (or none), or a riffle with several flights in the air
    let lay: { left: number | null; right: number | null; flights: Flight[]; leftSheets: number }
    if (riffle) {
      const rl = layoutRiffle(sheets, riffle)
      lay = { ...rl, flights: rl.flights.map((f) => ({ ...f, dir: riffle.dir })) }
    } else {
      const pl = layoutPages(sheets, turned, turn)
      const tr = pl.turning
      // the sheet in the air belongs to neither stack until it lands: on the first spread the left side
      // stays the endpaper (a growing left stack showed a blank page over it)
      lay = {
        left: pl.left,
        right: pl.right,
        flights: tr ? [{ front: tr.front, back: tr.back, t: tr.t, dir: turn?.target === 0 ? -1 : 1 }] : [],
        leftSheets: tr ? tr.sheet : pl.leftSheets,
      }
    }
    const tex = riffle ? quick : textures
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
      setShown(rs, split.right > 1e-6)
      rs.scale.x = Math.max(split.right / block, 1e-4)
      rs.position.x = -t + split.right / 2
    }
    const ls = leftStack.current
    if (ls) {
      setShown(ls, split.left > 1e-6)
      ls.scale.x = Math.max(split.left / block, 1e-4)
      ls.position.x = xb + split.left / 2
    }

    // a sheet in the air shades the page it leaves (first half) and the one it lands on (second half)
    let shadeR = 0
    let shadeL = 0
    for (const f of lay.flights) {
      const lift = Math.sin(Math.PI * f.t)
      shadeR = Math.max(shadeR, lift * (1 - f.t))
      shadeL = Math.max(shadeL, lift * f.t)
    }
    ;(mats.right.userData.page as PageUniforms).uShade.value = shadeR
    ;(mats.left.userData.page as PageUniforms).uShade.value = shadeL

    const open = theta > 1e-4
    // the paper only rises once the board has swung clear of it: with the cover nearly closed the 8 mm curve
    // poked through the board for a frame or two
    const rise = smoothstep(0.03, 0.6, theta)
    const rp = rightPage.current
    if (rp) {
      setShown(rp, open && lay.right !== null)
      rp.position.x = xb + EPS
      rp.scale.x = Math.max(rise, 1e-3)
      if (lay.right !== null) setMap(mats.right, tex.get(lay.right))
    }
    const lp = leftPage.current
    if (lp) {
      setShown(lp, open && lay.left !== null)
      lp.position.x = xb - EPS
      lp.scale.x = Math.max(rise, 1e-3)
      if (lay.left !== null) setMap(mats.left, tex.get(lay.left))
    }
    for (let i = 0; i < SHEET_POOL; i++) {
      const sh = sheetRefs.current[i]
      const f = lay.flights[i]
      if (!sh) continue
      sh.visible = open && f !== undefined
      if (!f) continue
      const m = mats.sheets[i]
      const u = m.userData.sheet as SheetUniforms
      u.uTurn.value = f.t
      u.uTheta.value = theta
      u.uLift.value = PAGE_LIFT * rise
      u.uRipple.value = PAGE_RIPPLE * rise
      u.uPivot.value.set(xb, PIVOT_Z)
      u.uDir.value = f.dir
      // riffled sheets curl more: they are flicked, not turned
      u.uCurl.value = reduced ? 0 : riffle ? 0.5 : 0.35
      setMap(m, tex.get(f.front))
      u.backMap.value = tex.get(f.back)
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
  // clicking the cover (its rim around the pages, or the endpaper when no page lies on it) closes the book;
  // the pages sit in front of these, so a click on a page still turns it
  const closes = { closesBook: true }
  const hitX = T - BOARD + 0.0005
  return (
    <>
      <mesh ref={rightPage} name="page_right" geometry={geo.right} material={mats.right} visible={false} onPointerDown={onDown(1)} onPointerOver={cursor(true)} onPointerOut={cursor(false)} />
      {mats.sheets.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            sheetRefs.current[i] = el
          }}
          name="page_turning"
          geometry={geo.sheet}
          material={m}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          // later flights are drawn over earlier ones where they cross mid-air
          renderOrder={i}
        />
      ))}
      <mesh name="endpaper_back" geometry={geo.endBack} material={endpaper} position={[-endX, 0, HINGE_OFFSET]} userData={closes} />
      <mesh name="cover_hit_back" geometry={geo.board} material={hitMat} position={[-hitX, 0, 0]} userData={closes} />
      <group ref={leftHalf}>
        <mesh ref={leftStack} name="pages_left" geometry={pagesGeometry} material={pageMaterials} visible={false} receiveShadow />
        <mesh ref={leftPage} name="page_left" geometry={geo.left} material={mats.left} visible={false} onPointerDown={onDown(-1)} onPointerOver={cursor(true)} onPointerOut={cursor(false)} />
        <mesh name="endpaper_front" geometry={geo.endFront} material={endpaper} position={[endX, 0, HINGE_OFFSET]} userData={closes} />
        <mesh name="cover_hit_front" geometry={geo.board} material={hitMat} position={[hitX, 0, 0]} userData={closes} />
      </group>
    </>
  )
}

const noRaycast = () => {}
/** Click target only: never drawn, hit from both sides. */
const hitMat = new MeshBasicMaterial({ visible: false, side: DoubleSide })

/** Hidden meshes must not catch clicks either (three raycasts invisible objects). */
function setShown(mesh: Mesh, shown: boolean) {
  mesh.visible = shown
  mesh.raycast = shown ? Mesh.prototype.raycast : noRaycast
}

function setMap(mat: MeshStandardMaterial, tex: MeshStandardMaterial['map']) {
  if (mat.map !== tex) mat.map = tex
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
