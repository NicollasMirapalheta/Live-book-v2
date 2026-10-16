import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { use, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Color, Euler, Quaternion, Vector3, type Group, type Mesh, type PerspectiveCamera, type MeshPhysicalMaterial, type MeshStandardMaterial } from 'three'
import { params } from '../app/params'
import { invalidateShadows } from '../scene/shadows'
import { Book } from './Book'
import type { OpenState } from './reader/BookReader'
import { useReader } from './reader/useReader'
import { backShadowTexture, contactShadowTexture } from './canvasTextures'
import type { FixtureBook } from './fixtures'
import { bookDimensions } from './geometry'
import { loadBookcase, shelfBooks, shelfLayoutFor, shelfOrder } from './shelfData'
import type { PlacedBook, Shelf } from './shelfLayout'
import { isReading, readFocus, useSelection } from './useSelection'
import './selection.css'

const HOVER_PULL = 0.012
const BOOKEND_PLATE = 0.1
const PLATE_THICKNESS = 0.004
const HIGHLIGHT = new Color('#FFB46A')

/** Flight timings (s): straight out of the row, then to the hand. Reduced motion: same path, faster. */
const EXTRACT_S = 0.35
const FLY_S = 0.9
const RETURN_FACTOR = 0.85
const REDUCED_FACTOR = 0.6

/** Hand pose relative to the camera: the distance scales with the book so it fills ~60% of the view height. */
const HAND_DISTANCE_PER_HEIGHT = 2.5
const HAND_DROP = 0.085 // below the view center (m): chest height, not eye level
// centered and square to the reader (user feedback): only the top leans back a little, toward the shelf
const HAND_TILT = (12 * Math.PI) / 180
const HAND_TURN = 0
const HAND_LEFT = 0 // fraction of the distance
/**
 * Near the camera the book sits much closer to the chandelier than the shelf does and read washed out;
 * the reader's own body also shades it. Albedo and reflections scale down to this while it is held.
 */
const HAND_EXPOSURE = 0.5

/**
 * Reading pose (Fase 4): centered, the open spread filling ~60% of the width (or 62% of the height), tilted
 * back a little. Opening: the pose moves first, the cover follows and finishes after it.
 */
const OPEN_S = 1.2
const READ_FILL_W = 0.6
const READ_FILL_H = 0.62
const READ_TILT = (14 * Math.PI) / 180 // top back: the head of the block and the cover's squares show
const READ_TURN = (4 * Math.PI) / 180
const OPEN_BACKOFF = 0.07 // m
const READ_DROP = -0.008 // negative: a little above the view center, clear of the reading bar

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Exponential approach with time constant tau (s). */
function approach(current: number, target: number, dt: number, tau: number) {
  return target + (current - target) * Math.exp(-dt / tau)
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

interface ShelfBookProps {
  book: FixtureBook
  place: PlacedBook
  shelf: Shelf
  /** y offset when the book stands on a bookend plate */
  lift: number
}

const IDENTITY = new Quaternion()

/**
 * One book standing on the shelf, spine toward the room. Hover pulls it a little; selection slides it
 * straight out of the row and flies it to the reader's hand, front cover facing the camera (spec Fase 3).
 */
function ShelfBook({ book, place, shelf, lift }: ShelfBookProps) {
  const d = useMemo(() => bookDimensions(book.pageCount, book.trim), [book.pageCount, book.trim])
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const anim = useRef({ hover: 0, glow: 0, s: 0, o: 0 })
  const flight = useRef<{ handPos: Vector3; handQuat: Quaternion; readPos: Vector3; readQuat: Quaternion; fwd: Vector3 } | null>(null)
  const openState = useRef<OpenState>({ cover: 0 })
  const scratch = useMemo(() => ({ pos: new Vector3(), quat: new Quaternion(), euler: new Euler(), fwd: new Vector3(), up: new Vector3() }), [])
  const camera = useThree((st) => st.camera)
  const hover = useSelection((st) => st.hover)
  const isSelected = useSelection((st) => st.selected === book.id)
  const isReadingThis = useSelection((st) => st.selected === book.id && isReading(st.phase))
  const select = useSelection((st) => st.select)

  // shelf pose: pivot at the bottom corner toward the lean (the corner that stays on the shelf)
  const pivotX = place.x + place.thickness / 2
  const z = shelf.zFront - 0.01 - d.spineBulge + place.dz
  const shelfY = shelf.y + lift
  // straight out of the row: the whole book clears the shelf front plus a margin
  const extract = d.coverWidth + d.spineBulge + 0.05
  // book center in the outer group's frame (inner offset + half the book; the fore-edge is toward −Z)
  const center = useMemo(() => new Vector3(-place.thickness / 2, d.coverHeight / 2, -d.coverWidth / 2), [place.thickness, d])

  useFrame((_, delta) => {
    const st = useSelection.getState()
    const dt = Math.min(delta, 0.1)
    const isSel = st.selected === book.id
    const isHot = !st.selected && (st.hovered === book.id || st.focused === book.id)
    const a = anim.current
    const speed = reducedMotion() ? 1 / REDUCED_FACTOR : 1
    const total = EXTRACT_S + FLY_S
    const k = scratch

    if (isSel && !flight.current) {
      // capture the hand pose once: the camera is locked while a book is out
      camera.updateMatrixWorld()
      const dist = d.coverHeight * HAND_DISTANCE_PER_HEIGHT
      camera.getWorldDirection(k.fwd)
      k.up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
      // slightly left of center: the description panel sits on the right
      const handCenter = camera.position
        .clone()
        .addScaledVector(k.fwd, dist)
        .addScaledVector(k.up, -HAND_DROP)
        .addScaledVector(right, -HAND_LEFT * dist)
      // camera frame, then tilt the top back around the camera's horizontal axis, then turn the book so its
      // front cover (local +X) faces the camera with the spine on the left
      // (yaw first, then the tilt around the book's own width axis, local Z: no roll on screen)
      const handQuat = camera.quaternion
        .clone()
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2 + HAND_TURN))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), HAND_TILT))
      const handPos = handCenter.sub(center.clone().applyQuaternion(handQuat))

      // reading pose: the open spread centered on the gutter (closed-book z = 0, page surface x ≈ +block/2)
      const cam = camera as PerspectiveCamera
      const halfH = Math.tan(((cam.fov ?? 50) * Math.PI) / 360)
      const halfW = halfH * (cam.aspect ?? 16 / 9)
      const openW = 2 * d.coverWidth + 0.02
      const readDist = Math.max(openW / (2 * halfW * READ_FILL_W), d.coverHeight / (2 * halfH * READ_FILL_H))
      readFocus.distance = readDist
      const readQuat = camera.quaternion
        .clone()
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2 + READ_TURN))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), READ_TILT))
      const gutter = new Vector3(-place.thickness / 2 + d.blockThickness / 2, d.coverHeight / 2, 0)
      const readPos = camera.position
        .clone()
        .addScaledVector(k.fwd, readDist)
        .addScaledVector(k.up, -READ_DROP)
        .sub(gutter.applyQuaternion(readQuat))
      flight.current = { handPos, handQuat, readPos, readQuat, fwd: k.fwd.clone() }
    }

    const before = a.s + a.hover + a.o
    if (isSel && (st.phase === 'out' || st.phase === 'hand')) {
      a.s = Math.min(total, a.s + dt * speed)
      if (a.s >= total && st.phase === 'out') {
        st.arrived()
        if (params.open) useSelection.getState().requestOpen()
      }
    } else if (isSel && st.phase === 'opening') {
      if (a.o === 0) useReader.getState().start(book.pageCount, params.page)
      // ?openAt=<0..1> freezes the opening part way (screenshots of the hinge)
      a.o = Math.min(params.openAt ?? 1, a.o + (dt * speed) / OPEN_S)
      if (a.o >= 1) {
        st.opened()
        // ?turn=<0..1>: a sheet frozen mid-turn (screenshots of the curl)
        if (params.turn !== undefined && useReader.getState().beginDrag(1)) useReader.getState().dragTo(params.turn)
      }
    } else if (isSel && st.phase === 'closing') {
      a.o = Math.max(0, a.o - (dt * speed) / OPEN_S)
      if (a.o <= 0) {
        st.closed()
        useReader.getState().reset()
      }
    } else if (isSel && st.phase === 'back') {
      a.s = Math.max(0, a.s - (dt * speed) / RETURN_FACTOR)
      if (a.s <= 0) {
        flight.current = null
        st.returned()
      }
    }
    a.hover = approach(a.hover, isHot ? HOVER_PULL : 0, dt, 0.07)
    a.glow = approach(a.glow, isHot ? 1 : 0, dt, 0.08)

    const o = outer.current
    if (o) {
      const shelfQuat = k.quat.setFromEuler(k.euler.set(0, 0, -place.lean))
      if (a.s <= 0 || !flight.current) {
        o.position.set(pivotX, shelfY, z + a.hover)
        o.quaternion.copy(shelfQuat)
      } else if (a.s <= EXTRACT_S) {
        // phase 1: straighten up and slide out along the shelf depth (never sideways: no collisions)
        const u = easeOut(a.s / EXTRACT_S)
        o.position.set(pivotX, shelfY + 0.004 * u, z + a.hover + extract * u)
        o.quaternion.copy(shelfQuat).slerp(IDENTITY, u)
      } else {
        // phase 2: fly to the hand on a gentle arc
        const u = easeInOut((a.s - EXTRACT_S) / FLY_S)
        k.pos.set(pivotX, shelfY + 0.004, z + extract)
        o.position.lerpVectors(k.pos, flight.current.handPos, u)
        if (!reducedMotion()) o.position.y += Math.sin(Math.PI * u) * 0.06
        o.quaternion.copy(IDENTITY).slerp(flight.current.handQuat, u)
        if (a.o > 0) {
          // reading: from the hand pose to the reading pose, then the cover opens (BookReader)
          const f = flight.current
          const poseT = easeInOut(Math.min(1, a.o / 0.65))
          o.position.lerpVectors(f.handPos, f.readPos, poseT)
          o.quaternion.copy(f.handQuat).slerp(f.readQuat, poseT)
          // the board swings toward the camera mid-opening: step back a little so its corner stays in frame
          const coverT = easeInOut(Math.min(1, Math.max(0, (a.o - 0.3) / 0.7)))
          o.position.addScaledVector(f.fwd, OPEN_BACKOFF * Math.sin(Math.PI * coverT))
        }
      }
    }
    openState.current.cover = easeInOut(Math.min(1, Math.max(0, (a.o - 0.3) / 0.7)))
    if (Math.abs(a.s + a.hover + a.o - before) > 1e-5) invalidateShadows()
    const exposure = 1 - (1 - HAND_EXPOSURE) * easeInOut(Math.min(1, a.s / total))
    const g = inner.current
    // (every frame while reading: the open book's page meshes appear after the first pass)
    if (g && (isSel && isReading(st.phase) || Math.abs(a.glow - (g.userData.glow ?? -1)) > 0.002 || Math.abs(exposure - (g.userData.exposure ?? -1)) > 0.002)) {
      g.userData.glow = a.glow
      g.userData.exposure = exposure
      g.traverse((obj) => {
        const mats = (obj as Mesh).material
        for (const m of (Array.isArray(mats) ? mats : mats ? [mats] : []) as MeshStandardMaterial[]) {
          if (!('emissive' in m) || !m.emissive) continue
          m.emissive.copy(HIGHLIGHT).multiplyScalar(0.03 * a.glow)
          const phys = m as MeshPhysicalMaterial
          const base = (m.userData.lbBase ??= { color: m.color.clone(), env: m.envMapIntensity, spec: phys.specularIntensity ?? 1, coat: phys.clearcoat ?? 0 })
          m.color.copy(base.color).multiplyScalar(exposure)
          m.envMapIntensity = base.env * exposure
          // the chandelier is behind the reader: a cover facing the camera sits right in its specular peak
          // and turned into a uniform sheen of the light's color. Dielectric sheen goes down with the albedo.
          if (phys.isMeshPhysicalMaterial) {
            phys.specularIntensity = base.spec * exposure * exposure
            phys.clearcoat = base.coat * exposure
          }
        }
      })
    }
  })

  return (
    <group
      ref={outer}
      name={`shelf_book_${book.id}`}
      position={[pivotX, shelfY, z]}
      rotation={[0, 0, -place.lean]}
      onPointerOver={(e) => {
        e.stopPropagation()
        hover(book.id)
        if (useSelection.getState().hovered === book.id) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (useSelection.getState().hovered === book.id) hover(null)
        document.body.style.cursor = ''
      }}
      onClick={(e) => {
        e.stopPropagation()
        // a drag (look around, turn a page) is not a click
        if (e.delta > 6) return
        const st = useSelection.getState()
        if (!st.selected) return select(book.id)
        if (st.selected !== book.id) {
          // another book on the shelf counts as "outside" the one in the hand
          if (st.phase === 'hand') st.clear()
          return
        }
        // the book in the hand: a click opens it, like "Abrir"
        if (st.phase === 'hand') return st.requestOpen()
        // the open book: the cover (its rim, or the endpaper when nothing lies on it) closes it
        if (st.phase === 'open' && e.object.userData.closesBook) st.close()
      }}
    >
      <group ref={inner} position={[-place.thickness / 2, 0, 0]}>
        <Book book={book} detail={isSelected ? 'full' : 'shelf'} openState={isReadingThis ? openState : undefined} />
      </group>
      <TitlePopover book={book} anchor={[-place.thickness / 2, d.coverHeight + 0.03, 0]} />
    </group>
  )
}

/** Title above the spine while hovered or focused (same look as the description panel). */
function TitlePopover({ book, anchor }: { book: FixtureBook; anchor: [number, number, number] }) {
  const visible = useSelection((st) => !st.selected && (st.hovered === book.id || st.focused === book.id))
  if (params.shot || !visible) return null
  return (
    <Html position={anchor} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="sel-popover" role="tooltip">
        {book.title}
      </div>
    </Html>
  )
}

/**
 * Contact shadows of a row: a soft dark patch on the shelf board and a falloff on the back panel. The room
 * is baked, so the real-time sun shadow cannot darken it; without these the books look pasted on.
 */
function RowShadows({ shelf, x0, x1 }: { shelf: Shelf; x0: number; x1: number }) {
  const [floor, back] = useMemo(() => [contactShadowTexture(), backShadowTexture()], [])
  const w = x1 - x0 + 0.05
  const cx = (x0 + x1) / 2
  const depth = shelf.zFront - shelf.zBack
  return (
    <group name="row_contact_shadows">
      <mesh position={[cx, shelf.y + 0.0008, (shelf.zFront + shelf.zBack) / 2 + 0.01]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[w * 1.15, depth * 1.1]} />
        <meshBasicMaterial color="#000" alphaMap={floor} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      <mesh position={[cx, shelf.y + 0.12, shelf.zBack + 0.002]} renderOrder={1}>
        <planeGeometry args={[w * 1.1, 0.24]} />
        <meshBasicMaterial color="#000" alphaMap={back} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** The books on the bookcase, placed by shelfLayout (spec Fase 3). */
export function BookShelf() {
  const data = use(loadBookcase())
  const scene = useThree((s) => s.scene)
  const books = shelfBooks()
  const layout = shelfLayoutFor(data, books)
  const shelves = useMemo(() => new Map(data.shelves.map((s) => [s.index, s])), [data])
  const setOrder = useSelection((s) => s.setOrder)

  useEffect(() => {
    setOrder(shelfOrder(layout, data.shelves))
    // ?select=<id> brings the book to the hand right away (screenshots); waits for the order to be set
    if (params.select) {
      const id = params.select
      const t = setTimeout(() => useSelection.getState().select(id), 50)
      return () => clearTimeout(t)
    }
  }, [layout, data, setOrder])

  useLayoutEffect(() => invalidateShadows(), [layout])

  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!window.__SEL__) return
    window.__SEL__.screenPos = (id) => {
      const o = scene.getObjectByName(`shelf_book_${id}`)
      if (!o) return null
      const box = new Box3().setFromObject(o)
      const p = box.getCenter(new Vector3()).project(camera)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
    }
  }, [scene, camera, gl])

  const rows = (() => {
    const out: { shelf: Shelf; x0: number; x1: number }[] = []
    for (const shelf of data.shelves) {
      const row = layout.books.filter((b) => b.shelf === shelf.index)
      if (!row.length) continue
      out.push({ shelf, x0: Math.min(...row.map((b) => b.x - b.thickness / 2)), x1: Math.max(...row.map((b) => b.x + b.thickness / 2)) })
    }
    return out
  })()

  return (
    <group name="bookshelf_books">
      {rows.map((r) => (
        <RowShadows key={r.shelf.index} shelf={r.shelf} x0={r.x0} x1={r.x1} />
      ))}
      {layout.books.map((place) => {
        const book = books.find((b) => b.id === place.id)!
        const bookend = layout.props.find((p) => p.shelf === place.shelf && p.kind === 'bookend_pair')
        const left = place.x - place.thickness / 2
        const right = place.x + place.thickness / 2
        const onPlate =
          !!bookend && (left < bookend.x + BOOKEND_PLATE || right > (bookend.endX ?? Infinity) - BOOKEND_PLATE) && place.lean === 0
        return <ShelfBook key={place.id} book={book} place={place} shelf={shelves.get(place.shelf)!} lift={onPlate ? PLATE_THICKNESS : 0} />
      })}
    </group>
  )
}
