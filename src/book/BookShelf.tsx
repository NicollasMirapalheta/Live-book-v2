import { useFrame } from '@react-three/fiber'
import { use, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { params } from '../app/params'
import { invalidateShadows } from '../scene/shadows'
import { Book } from './Book'
import type { FixtureBook } from './fixtures'
import { bookDimensions } from './geometry'
import { loadBookcase, shelfBooks, shelfLayoutFor, shelfOrder } from './shelfData'
import type { PlacedBook, Shelf } from './shelfLayout'
import { useSelection } from './useSelection'

const HOVER_PULL = 0.012
const SELECT_TURN = (-35 * Math.PI) / 180
const SELECT_LIFT = 0.012
const BOOKEND_PLATE = 0.1
const PLATE_THICKNESS = 0.004
const HIGHLIGHT = new Color('#FFB46A')

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Exponential approach with time constant tau (s); instant with reduced motion. */
function approach(current: number, target: number, dt: number, tau: number) {
  if (reducedMotion()) return target
  return target + (current - target) * Math.exp(-dt / tau)
}

interface ShelfBookProps {
  book: FixtureBook
  place: PlacedBook
  shelf: Shelf
  /** y offset when the book stands on a bookend plate */
  lift: number
}

/**
 * One book standing on the shelf, spine toward the room. Hover pulls it a little; selection slides it out
 * and turns the front cover toward the reader (spec Fase 3).
 */
function ShelfBook({ book, place, shelf, lift }: ShelfBookProps) {
  const d = useMemo(() => bookDimensions(book.pageCount, book.trim), [book.pageCount, book.trim])
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const anim = useRef({ pull: 0, turn: 0, glow: 0, lean: place.lean, lift: 0 })
  const hover = useSelection((s) => s.hover)
  const isSelected = useSelection((s) => s.selected === book.id)
  const select = useSelection((s) => s.select)

  // pivot at the bottom corner toward the lean (the corner that stays on the shelf)
  const pivotX = place.x + place.thickness / 2
  const z = shelf.zFront - 0.01 - d.spineBulge + place.dz

  useFrame((_, delta) => {
    const s = useSelection.getState()
    const dt = Math.min(delta, 0.1)
    const isSel = s.selected === book.id
    const isHot = !s.selected && (s.hovered === book.id || s.focused === book.id)
    const a = anim.current
    const pullTarget = isSel ? d.coverWidth * 0.75 : isHot ? HOVER_PULL : 0
    const before = a.pull + a.turn
    a.pull = approach(a.pull, pullTarget, dt, isSel ? 0.18 : 0.07)
    a.turn = approach(a.turn, isSel ? SELECT_TURN : 0, dt, 0.2)
    a.lean = approach(a.lean, isSel ? 0 : place.lean, dt, 0.15)
    a.glow = approach(a.glow, isHot || isSel ? 1 : 0, dt, 0.08)
    a.lift = approach(a.lift, isSel ? SELECT_LIFT : 0, dt, 0.15)
    if (outer.current && inner.current) {
      outer.current.position.set(pivotX, shelf.y + lift + a.lift, z + a.pull)
      outer.current.rotation.set(0, a.turn, -a.lean)
      inner.current.position.set(-place.thickness / 2, 0, 0)
    }
    if (Math.abs(a.pull + a.turn - before) > 1e-5) invalidateShadows()
    if (inner.current && Math.abs(a.glow - (inner.current.userData.glow ?? -1)) > 0.002) {
      inner.current.userData.glow = a.glow
      inner.current.traverse((o) => {
        const m = (o as Mesh).material as MeshStandardMaterial | undefined
        if (m && 'emissive' in m && m.emissive) {
          m.emissive.copy(HIGHLIGHT).multiplyScalar(0.06 * a.glow)
        }
      })
    }
  })

  return (
    <group
      ref={outer}
      name={`shelf_book_${book.id}`}
      position={[pivotX, shelf.y + lift, z]}
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
        if (!useSelection.getState().selected) select(book.id)
      }}
    >
      <group ref={inner} position={[-place.thickness / 2, 0, 0]}>
        <Book book={book} detail={isSelected ? 'full' : 'shelf'} />
      </group>
    </group>
  )
}

/** The books on the bookcase, placed by shelfLayout (spec Fase 3). */
export function BookShelf() {
  const data = use(loadBookcase())
  const books = shelfBooks()
  const layout = shelfLayoutFor(data, books)
  const shelves = useMemo(() => new Map(data.shelves.map((s) => [s.index, s])), [data])
  const setOrder = useSelection((s) => s.setOrder)

  useEffect(() => {
    setOrder(shelfOrder(layout, data.shelves))
    // ?select=<id> opens the selection right away (screenshots); waits for the order to be set
    if (params.select) {
      const id = params.select
      const t = setTimeout(() => useSelection.getState().select(id), 50)
      return () => clearTimeout(t)
    }
  }, [layout, data, setOrder])

  useLayoutEffect(() => invalidateShadows(), [layout])

  return (
    <group name="bookshelf_books">
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
