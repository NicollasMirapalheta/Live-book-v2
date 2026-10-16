// Parametric hardcover book (spec Fase 2). All measures in meters, derived from pageCount and trim.
//
// Local frame (book standing on its bottom edge, as on a shelf):
//   X across the thickness (back cover at −X, front cover at +X)
//   Y up (bottom of the boards at y = 0)
//   Z from the spine (z ≈ 0, the rounded spine bulges to −Z) to the fore-edge (+Z)
import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three'
import type { Trim } from './types'

export const TRIM_SIZES: Record<Trim, { width: number; height: number }> = {
  medium: { width: 0.16, height: 0.23 },
  large: { width: 0.19, height: 0.26 },
}

export const PAPER_PER_SHEET = 0.0001
export const MIN_BLOCK = 0.004
export const BOARD = 0.0025
export const SQUARE = 0.003 // seixas: cover beyond the text block (top, bottom, fore-edge)
export const SLACK = 0.001
export const HINGE_OFFSET = 0.008 // hinge groove distance from the spine
export const HINGE_DEPTH = 0.001
export const BEVEL = 0.0012
export const RECESS_DEPTH = 0.001

export interface BookDimensions {
  sheets: number
  blockThickness: number
  totalThickness: number
  /** text block (pages) */
  pageWidth: number
  pageHeight: number
  /** boards */
  coverWidth: number
  coverHeight: number
  /** how far the rounded spine bulges beyond the boards' back edge */
  spineBulge: number
  /** depth of the concave fore-edge of the text block */
  foreEdgeConcavity: number
}

export function bookDimensions(pageCount: number, trim: Trim): BookDimensions {
  if (!Number.isFinite(pageCount) || pageCount < 1) throw new RangeError(`pageCount inválido: ${pageCount}`)
  const sheets = Math.ceil(pageCount / 2)
  const blockThickness = Math.max(sheets * PAPER_PER_SHEET, MIN_BLOCK)
  const totalThickness = blockThickness + 2 * BOARD + SLACK
  const { width, height } = TRIM_SIZES[trim]
  return {
    sheets,
    blockThickness,
    totalThickness,
    pageWidth: width,
    pageHeight: height,
    coverWidth: width + SQUARE,
    coverHeight: height + 2 * SQUARE,
    spineBulge: totalThickness * 0.2,
    foreEdgeConcavity: blockThickness * 0.12,
  }
}

// ---------------------------------------------------------------------------
// Profile extrusion
// ---------------------------------------------------------------------------

interface ProfilePoint {
  p: Vector2 // (x, z)
  /** 0 back board, 1 spine, 2 front board */
  panel: number
}

interface Builder {
  pos: number[]
  nor: number[]
  uv: number[]
  panel: number[]
  idx: number[]
  groups: { start: number; count: number; materialIndex: number }[]
}

function newBuilder(): Builder {
  return { pos: [], nor: [], uv: [], panel: [], idx: [], groups: [] }
}

function vertex(b: Builder, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, panel: number) {
  b.pos.push(x, y, z)
  b.nor.push(nx, ny, nz)
  b.uv.push(u, v)
  b.panel.push(panel)
  return b.pos.length / 3 - 1
}

function group(b: Builder, materialIndex: number, fn: () => void) {
  const start = b.idx.length
  fn()
  const count = b.idx.length - start
  if (count > 0) b.groups.push({ start, count, materialIndex })
}

/**
 * Orients every triangle so its winding agrees with its vertex normals (counter-clockwise seen from the
 * side the normals point to). Double-sided materials flip the normal of back faces, so a wrong winding
 * would light a face from behind.
 */
function orientTriangles(b: Builder) {
  const P = b.pos
  const N = b.nor
  for (let t = 0; t < b.idx.length; t += 3) {
    const [i, j, k] = [b.idx[t], b.idx[t + 1], b.idx[t + 2]]
    const ax = P[j * 3] - P[i * 3]
    const ay = P[j * 3 + 1] - P[i * 3 + 1]
    const az = P[j * 3 + 2] - P[i * 3 + 2]
    const bx = P[k * 3] - P[i * 3]
    const by = P[k * 3 + 1] - P[i * 3 + 1]
    const bz = P[k * 3 + 2] - P[i * 3 + 2]
    const fx = ay * bz - az * by
    const fy = az * bx - ax * bz
    const fz = ax * by - ay * bx
    const nx = N[i * 3] + N[j * 3] + N[k * 3]
    const ny = N[i * 3 + 1] + N[j * 3 + 1] + N[k * 3 + 1]
    const nz = N[i * 3 + 2] + N[j * 3 + 2] + N[k * 3 + 2]
    if (fx * nx + fy * ny + fz * nz < 0) {
      b.idx[t + 1] = k
      b.idx[t + 2] = j
    }
  }
}

function finish(b: Builder): BufferGeometry {
  orientTriangles(b)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(b.pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(b.nor), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(b.uv), 2))
  g.setAttribute('aPanel', new BufferAttribute(new Float32Array(b.panel), 1))
  g.setIndex(b.idx)
  for (const gr of b.groups) g.addGroup(gr.start, gr.count, gr.materialIndex)
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** Outward 2D normals of an open polyline (left side when walking it). */
function polylineNormals(pts: Vector2[], outwardSign = 1): Vector2[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]
    const c = pts[Math.min(pts.length - 1, i + 1)]
    const t = c.clone().sub(a).normalize()
    return new Vector2(-t.y, t.x).multiplyScalar(outwardSign)
  })
}

function arcLengths(pts: Vector2[]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return out
}

/**
 * Extrudes a strip (open polyline in x-z) along y from y0 to y1. Quads face along the given normals.
 * `skip(i)` omits the quad between points i and i+1. UV: u = arc length (m), v = y (m).
 */
function extrudeStrip(
  b: Builder,
  pts: ProfilePoint[],
  normals: Vector2[],
  y0: number,
  y1: number,
  uOffset = 0,
  skip: (i: number) => boolean = () => false,
) {
  const s = arcLengths(pts.map((q) => q.p))
  for (let i = 0; i < pts.length - 1; i++) {
    if (skip(i)) continue
    const a = pts[i]
    const c = pts[i + 1]
    const na = normals[i]
    const nc = normals[i + 1]
    const v0 = vertex(b, a.p.x, y0, a.p.y, na.x, 0, na.y, uOffset + s[i], y0, a.panel)
    const v1 = vertex(b, c.p.x, y0, c.p.y, nc.x, 0, nc.y, uOffset + s[i + 1], y0, c.panel)
    const v2 = vertex(b, c.p.x, y1, c.p.y, nc.x, 0, nc.y, uOffset + s[i + 1], y1, c.panel)
    const v3 = vertex(b, a.p.x, y1, a.p.y, na.x, 0, na.y, uOffset + s[i], y1, a.panel)
    // winding so that the face normal matches the given normal
    const ex = c.p.x - a.p.x
    const ez = c.p.y - a.p.y
    const facing = -ez * na.x + ex * na.y // cross((e,0),(0,1,0)) · n  (in x-z)
    if (facing >= 0) b.idx.push(v0, v2, v1, v0, v3, v2)
    else b.idx.push(v0, v1, v2, v0, v2, v3)
  }
}

/** Flat cap of a closed polygon (x-z) at height y, facing ±Y. */
function cap(b: Builder, contour: ProfilePoint[], y: number, up: boolean, uvScale = 1) {
  const pts = contour.map((q) => q.p)
  const tris = ShapeUtils.triangulateShape(pts, [])
  const base = b.pos.length / 3
  for (const q of contour) vertex(b, q.p.x, y, q.p.y, 0, up ? 1 : -1, 0, q.p.y * uvScale, q.p.x * uvScale, q.panel)
  const ccw = !ShapeUtils.isClockWise(pts)
  for (const [i, j, k] of tris) {
    // contour in (x, z); seen from +Y the order flips relative to (x, z) orientation
    const wantCcwFromAbove = up
    const flip = ccw === wantCcwFromAbove
    if (flip) b.idx.push(base + i, base + k, base + j)
    else b.idx.push(base + i, base + j, base + k)
  }
}

// ---------------------------------------------------------------------------
// Cover: back board + rounded spine + front board, one mesh with groups
// ---------------------------------------------------------------------------

export const COVER_GROUPS = { outer: 0, edges: 1, inner: 2 } as const

export interface PolaroidLayout {
  /** recess rectangle on the front board, in (z, y) */
  z0: number
  z1: number
  y0: number
  y1: number
}

/** Real polaroid proportions (card 88 × 107 mm, photo 79 × 79 mm), scaled to the cover. */
export function polaroidLayout(d: BookDimensions) {
  const cardW = Math.min(0.48 * d.coverWidth, 0.088)
  const scale = cardW / 0.088
  const cardH = 0.107 * scale
  const photo = 0.079 * scale
  const zc = HINGE_OFFSET + (d.coverWidth - HINGE_OFFSET) / 2
  const yc = d.coverHeight * 0.6
  const margin = 0.0012
  const recess: PolaroidLayout = { z0: zc - cardW / 2 - margin, z1: zc + cardW / 2 + margin, y0: yc - cardH / 2 - margin, y1: yc + cardH / 2 + margin }
  return {
    cardW,
    cardH,
    photo,
    /** photo window inset from the card top and sides (polaroid: wider bottom border) */
    photoInset: (cardW - photo) / 2,
    center: { z: zc, y: yc },
    recess,
  }
}

function spineArc(d: BookDimensions, offset: number, segments = 16): Vector2[] {
  // half-ellipse from the back board to the front board, bulging toward −Z
  const rx = d.totalThickness / 2 + offset
  const rz = d.spineBulge + offset
  const pts: Vector2[] = []
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - (Math.PI * i) / segments // π → 0 : from −X to +X
    pts.push(new Vector2(Math.cos(a) * rx, -Math.sin(a) * rz))
  }
  return pts
}

export interface CoverGeometryOptions {
  polaroid?: boolean
}

export function coverGeometry(d: BookDimensions, opts: CoverGeometryOptions = {}): BufferGeometry {
  const T = d.totalThickness / 2
  const zEnd = d.coverWidth
  const H = d.coverHeight
  const e = BEVEL

  // outer profile: back fore-edge → back board → hinge groove → spine arc → hinge groove → front board → front fore-edge
  const outer: ProfilePoint[] = []
  const push = (x: number, z: number, panel: number) => outer.push({ p: new Vector2(x, z), panel })
  push(-T + e, zEnd, 0)
  push(-T, zEnd - e, 0)
  push(-T, HINGE_OFFSET + 0.002, 0)
  push(-T + HINGE_DEPTH, HINGE_OFFSET, 0)
  push(-T, HINGE_OFFSET - 0.002, 0)
  for (const p of spineArc(d, 0)) outer.push({ p, panel: 1 })
  push(T, HINGE_OFFSET - 0.002, 2)
  push(T - HINGE_DEPTH, HINGE_OFFSET, 2)
  push(T, HINGE_OFFSET + 0.002, 2)
  const frontFaceStart = outer.length - 1
  push(T, zEnd - e, 2)
  push(T - e, zEnd, 2)

  // inner profile (the board thickness), walked back from front to back
  const inner: ProfilePoint[] = []
  const pin = (x: number, z: number, panel: number) => inner.push({ p: new Vector2(x, z), panel })
  pin(T - BOARD, zEnd, 2)
  pin(T - BOARD, HINGE_OFFSET, 2)
  for (const p of spineArc(d, -BOARD).reverse()) inner.push({ p, panel: 1 })
  pin(-T + BOARD, HINGE_OFFSET, 0)
  pin(-T + BOARD, zEnd, 0)

  const b = newBuilder()
  const outerN = polylineNormals(outer.map((q) => q.p), 1)
  // the outer polyline walks −X → +X around the spine (−Z): its left side is outward
  const flipOuter = outerN[Math.floor(outer.length / 2)].y > 0
  if (flipOuter) outerN.forEach((n) => n.multiplyScalar(-1))
  const innerN = polylineNormals(inner.map((q) => q.p), 1)
  if (innerN[Math.floor(inner.length / 2)].y < 0) innerN.forEach((n) => n.multiplyScalar(-1))

  const lay = polaroidLayout(d)
  group(b, COVER_GROUPS.outer, () => {
    extrudeStrip(b, outer, outerN, e, H - e, 0, (i) => !!opts.polaroid && i === frontFaceStart)
    // bevelled top/bottom rims of the outer surface (chamfer toward the caps)
    const s = arcLengths(outer.map((q) => q.p))
    for (const [ya, yb, sign] of [[0, e, -1], [H - e, H, 1]] as const) {
      for (let i = 0; i < outer.length - 1; i++) {
        const a = outer[i]
        const c = outer[i + 1]
        const na = outerN[i]
        const nc = outerN[i + 1]
        const inA = sign < 0 ? ya : yb
        const atA = sign < 0 ? yb : ya
        // the rim edge at the cap is pulled inward by e
        const ax = a.p.x - na.x * e
        const az = a.p.y - na.y * e
        const cx = c.p.x - nc.x * e
        const cz = c.p.y - nc.y * e
        const ny = sign * Math.SQRT1_2
        const v0 = vertex(b, a.p.x, atA, a.p.y, na.x * Math.SQRT1_2, ny, na.y * Math.SQRT1_2, s[i], atA, a.panel)
        const v1 = vertex(b, c.p.x, atA, c.p.y, nc.x * Math.SQRT1_2, ny, nc.y * Math.SQRT1_2, s[i + 1], atA, c.panel)
        const v2 = vertex(b, cx, inA, cz, nc.x * Math.SQRT1_2, ny, nc.y * Math.SQRT1_2, s[i + 1], inA, c.panel)
        const v3 = vertex(b, ax, inA, az, na.x * Math.SQRT1_2, ny, na.y * Math.SQRT1_2, s[i], inA, a.panel)
        const ex = c.p.x - a.p.x
        const ez = c.p.y - a.p.y
        const facing = (-ez * na.x + ex * na.y) * (sign < 0 ? 1 : -1)
        if (facing >= 0) b.idx.push(v0, v2, v1, v0, v3, v2)
        else b.idx.push(v0, v1, v2, v0, v2, v3)
      }
    }
    if (opts.polaroid) frontFaceWithRecess(b, outer[frontFaceStart].p.y, outer[frontFaceStart + 1].p.y, T, e, H - e, lay.recess, s[frontFaceStart])
  })
  group(b, COVER_GROUPS.inner, () => {
    extrudeStrip(b, inner, innerN, 0, H)
  })
  group(b, COVER_GROUPS.edges, () => {
    // head and tail of the boards: two rectangles (boards) + a ring of quads (rounded spine).
    // (a single C-shaped polygon triangulates badly and left the endpaper visible through the edge)
    const ring0 = spineArc(d, -e)
    const ring1 = spineArc(d, -BOARD)
    for (const [y, up] of [[0, false], [H, true]] as const) {
      const ny = up ? 1 : -1
      // panel per piece: the front board's caps turn with it when the book opens (Fase 4)
      const quad = (pts: [number, number][], panel = 1) => {
        const ids = pts.map(([x, z]) => vertex(b, x, y, z, 0, ny, 0, z, x, panel))
        b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3])
      }
      quad([[-T + e, HINGE_OFFSET], [-T + BOARD, HINGE_OFFSET], [-T + BOARD, zEnd - e], [-T + e, zEnd - e]], 0)
      quad([[T - BOARD, HINGE_OFFSET], [T - e, HINGE_OFFSET], [T - e, zEnd - e], [T - BOARD, zEnd - e]], 2)
      // from the spine to the hinge: stays with the spine
      quad([[-T + e, 0], [-T + BOARD, 0], [-T + BOARD, HINGE_OFFSET], [-T + e, HINGE_OFFSET]])
      quad([[T - BOARD, 0], [T - e, 0], [T - e, HINGE_OFFSET], [T - BOARD, HINGE_OFFSET]])
      for (let i = 0; i < ring0.length - 1; i++) {
        quad([
          [ring0[i].x, ring0[i].y],
          [ring0[i + 1].x, ring0[i + 1].y],
          [ring1[i + 1].x, ring1[i + 1].y],
          [ring1[i].x, ring1[i].y],
        ])
      }
    }
    // fore-edge ends of the boards
    for (const [o, ii, sign] of [[outer[outer.length - 1], inner[0], 1], [outer[0], inner[inner.length - 1], -1]] as const) {
      const v0 = vertex(b, o.p.x, 0, o.p.y, 0, 0, 1, 0, 0, o.panel)
      const v1 = vertex(b, ii.p.x, 0, ii.p.y, 0, 0, 1, BOARD, 0, ii.panel)
      const v2 = vertex(b, ii.p.x, H, ii.p.y, 0, 0, 1, BOARD, H, ii.panel)
      const v3 = vertex(b, o.p.x, H, o.p.y, 0, 0, 1, 0, H, o.panel)
      if (sign > 0) b.idx.push(v0, v1, v2, v0, v2, v3)
      else b.idx.push(v0, v2, v1, v0, v3, v2)
    }
  })
  return finish(b)
}

/** Front board outer face (x = T) with a rectangular recess for the polaroid. */
function frontFaceWithRecess(b: Builder, zA: number, zB: number, T: number, y0: number, y1: number, r: PolaroidLayout, u0: number) {
  const contour = [new Vector2(zA, y0), new Vector2(zB, y0), new Vector2(zB, y1), new Vector2(zA, y1)]
  const hole = [new Vector2(r.z0, r.y0), new Vector2(r.z0, r.y1), new Vector2(r.z1, r.y1), new Vector2(r.z1, r.y0)]
  const tris = ShapeUtils.triangulateShape(contour, [hole])
  const all = [...contour, ...hole]
  const base = b.pos.length / 3
  for (const p of all) vertex(b, T, p.y, p.x, 1, 0, 0, u0 + (p.x - zA), p.y, 2)
  for (const [i, j, k] of tris) {
    // face +X: from +X looking back, z grows to the left
    const a = all[i]
    const c = all[j]
    const d2 = all[k]
    const cross = (c.x - a.x) * (d2.y - a.y) - (c.y - a.y) * (d2.x - a.x)
    if (cross < 0) b.idx.push(base + i, base + j, base + k)
    else b.idx.push(base + i, base + k, base + j)
  }
  const xr = T - RECESS_DEPTH
  // recess floor
  const f0 = vertex(b, xr, r.y0, r.z0, 1, 0, 0, u0 + r.z0 - zA, r.y0, 2)
  const f1 = vertex(b, xr, r.y0, r.z1, 1, 0, 0, u0 + r.z1 - zA, r.y0, 2)
  const f2 = vertex(b, xr, r.y1, r.z1, 1, 0, 0, u0 + r.z1 - zA, r.y1, 2)
  const f3 = vertex(b, xr, r.y1, r.z0, 1, 0, 0, u0 + r.z0 - zA, r.y1, 2)
  b.idx.push(f0, f2, f1, f0, f3, f2)
  // recess walls (facing into the recess)
  const walls: [number, number, number, number, number, number][] = [
    [r.z0, r.y0, r.z1, r.y0, 0, 1], // bottom wall faces +Y
    [r.z1, r.y1, r.z0, r.y1, 0, -1], // top wall faces −Y
    [r.z0, r.y1, r.z0, r.y0, 1, 0], // near wall faces +Z
    [r.z1, r.y0, r.z1, r.y1, -1, 0], // far wall faces −Z
  ]
  for (const [za, ya, zb, yb, nz, ny] of walls) {
    const v0 = vertex(b, T, ya, za, 0, ny, nz, 0, 0, 2)
    const v1 = vertex(b, T, yb, zb, 0, ny, nz, 1, 0, 2)
    const v2 = vertex(b, xr, yb, zb, 0, ny, nz, 1, RECESS_DEPTH, 2)
    const v3 = vertex(b, xr, ya, za, 0, ny, nz, 0, RECESS_DEPTH, 2)
    b.idx.push(v0, v1, v2, v0, v2, v3, v0, v2, v1, v0, v3, v2) // both windings: the walls are tiny, avoid culling mistakes
  }
}

// ---------------------------------------------------------------------------
// Text block: follows the rounded spine, concave fore-edge
// ---------------------------------------------------------------------------

export const PAGE_GROUPS = { edges: 0, sides: 1 } as const

export function pageBlockGeometry(d: BookDimensions): BufferGeometry {
  const t = d.blockThickness / 2
  const zEnd = d.pageWidth
  const segs = 12
  // spine side: arc of the inner spine (slightly inside the cover)
  const spine = spineArc(d, -BOARD - 0.0004, segs).map((p) => new Vector2(p.x * (t / (d.totalThickness / 2 - BOARD - 0.0004)), p.y))
  const pts: ProfilePoint[] = []
  // closed contour: spine arc (−X → +X), front page side to the fore-edge, concave fore-edge back to −X
  for (const p of spine) pts.push({ p, panel: 1 })
  pts.push({ p: new Vector2(t, zEnd), panel: 2 })
  for (let i = 1; i < segs; i++) {
    const x = t - (2 * t * i) / segs
    const conc = d.foreEdgeConcavity * (1 - Math.pow(x / t, 2))
    pts.push({ p: new Vector2(x, zEnd - conc), panel: 1 })
  }
  pts.push({ p: new Vector2(-t, zEnd), panel: 0 })

  const H = d.pageHeight
  const y0 = SQUARE
  const y1 = SQUARE + H
  const b = newBuilder()
  const closed = [...pts, pts[0]]
  const normals = polylineNormals(closed.map((q) => q.p), 1)
  // outward = away from the centroid
  const cx = 0
  const cz = zEnd / 2
  closed.forEach((q, i) => {
    const out = new Vector2(q.p.x - cx, q.p.y - cz)
    if (out.dot(normals[i]) < 0) normals[i].multiplyScalar(-1)
  })
  const sideIndex = segs // segment from the end of the spine arc to the front fore-edge corner
  group(b, PAGE_GROUPS.edges, () => {
    extrudeStrip(b, closed, normals, y0, y1, 0, (i) => i === sideIndex || i === closed.length - 2)
    cap(b, pts, y0, false, 1 / 0.05)
    cap(b, pts, y1, true, 1 / 0.05)
  })
  group(b, PAGE_GROUPS.sides, () => {
    extrudeStrip(b, closed, normals, y0, y1, 0, (i) => !(i === sideIndex || i === closed.length - 2))
  })
  // edge texture: one texture row per ~0.1 mm sheet across the thickness. Caps already map (z, x)/0.05;
  // the extruded edges map (y, arc length)/0.05 so the sheet lines run along the height.
  for (let i = 0; i < b.uv.length / 2; i++) {
    if (Math.abs(b.nor[i * 3 + 1]) < 0.5) {
      const u = b.uv[i * 2]
      const v = b.uv[i * 2 + 1]
      b.uv[i * 2] = v / 0.05
      b.uv[i * 2 + 1] = u / 0.05
    }
  }
  return finish(b)
}

// ---------------------------------------------------------------------------
// Spine foil decal and polaroid
// ---------------------------------------------------------------------------

/** Strip hugging the spine arc (0.15 mm outside), u across the arc, v up the spine. */
export function spineFoilGeometry(d: BookDimensions): BufferGeometry {
  const arc = spineArc(d, 0.00015, 24)
  const b = newBuilder()
  const n = arc.map((p) => new Vector2(p.x / (d.totalThickness / 2), p.y / Math.max(d.spineBulge, 1e-4)).normalize())
  const s = arcLengths(arc)
  const total = s[s.length - 1]
  const H = d.coverHeight
  for (let i = 0; i < arc.length - 1; i++) {
    const a = arc[i]
    const c = arc[i + 1]
    const v0 = vertex(b, a.x, 0, a.y, n[i].x, 0, n[i].y, s[i] / total, 0, 1)
    const v1 = vertex(b, c.x, 0, c.y, n[i + 1].x, 0, n[i + 1].y, s[i + 1] / total, 0, 1)
    const v2 = vertex(b, c.x, H, c.y, n[i + 1].x, 0, n[i + 1].y, s[i + 1] / total, 1, 1)
    const v3 = vertex(b, a.x, H, a.y, n[i].x, 0, n[i].y, s[i] / total, 1, 1)
    b.idx.push(v0, v1, v2, v0, v2, v3)
  }
  return finish(b)
}

/** Plane on the front board (0.1 mm proud) carrying the decorative frame tooling. */
export function frontFoilGeometry(d: BookDimensions): BufferGeometry {
  const T = d.totalThickness / 2 + 0.0001
  const z0 = HINGE_OFFSET + 0.004
  const z1 = d.coverWidth - 0.004
  const y0 = 0.004
  const y1 = d.coverHeight - 0.004
  const b = newBuilder()
  const v0 = vertex(b, T, y0, z0, 1, 0, 0, 0, 0, 2)
  const v1 = vertex(b, T, y0, z1, 1, 0, 0, 1, 0, 2)
  const v2 = vertex(b, T, y1, z1, 1, 0, 0, 1, 1, 2)
  const v3 = vertex(b, T, y1, z0, 1, 0, 0, 0, 1, 2)
  b.idx.push(v0, v2, v1, v0, v3, v2)
  return finish(b)
}

export interface PolaroidGeometries {
  card: BufferGeometry
  photo: BufferGeometry
  /** card center on the cover (x, y, z) and its rotation around X */
  position: [number, number, number]
}

/** Card (0.6 mm thick, in the 1 mm recess) and the slightly glossy photo window on top of it. */
export function polaroidGeometry(d: BookDimensions): PolaroidGeometries {
  const lay = polaroidLayout(d)
  const th = 0.0006
  const b = newBuilder()
  const w = lay.cardW / 2
  const h = lay.cardH / 2
  // card as a thin box in its own frame: X = thickness, Z across, Y up
  const faces: [number, number, number, number[][]][] = [
    [1, 0, 0, [[th, -h, -w], [th, -h, w], [th, h, w], [th, h, -w]]],
    [-1, 0, 0, [[0, -h, w], [0, -h, -w], [0, h, -w], [0, h, w]]],
    [0, 1, 0, [[0, h, -w], [th, h, -w], [th, h, w], [0, h, w]]],
    [0, -1, 0, [[0, -h, w], [th, -h, w], [th, -h, -w], [0, -h, -w]]],
    [0, 0, 1, [[0, -h, w], [0, h, w], [th, h, w], [th, -h, w]]],
    [0, 0, -1, [[th, -h, -w], [th, h, -w], [0, h, -w], [0, -h, -w]]],
  ]
  for (const [nx, ny, nz, quad] of faces) {
    const ids = quad.map(([x, y, z]) => vertex(b, x, y, z, nx, ny, nz, (z + w) / (2 * w), (y + h) / (2 * h), 2))
    b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3])
  }
  const card = finish(b)

  const pb = newBuilder()
  const ph = lay.photo / 2
  const top = h - lay.photoInset // photo window sits near the top: the bottom border is wider
  const yc = top - ph
  const x = th + 0.00005
  const p0 = vertex(pb, x, yc - ph, -ph, 1, 0, 0, 0, 0, 2)
  const p1 = vertex(pb, x, yc - ph, ph, 1, 0, 0, 1, 0, 2)
  const p2 = vertex(pb, x, yc + ph, ph, 1, 0, 0, 1, 1, 2)
  const p3 = vertex(pb, x, yc + ph, -ph, 1, 0, 0, 0, 1, 2)
  pb.idx.push(p0, p1, p2, p0, p2, p3)
  const photo = finish(pb)

  const T = d.totalThickness / 2
  return { card, photo, position: [T - RECESS_DEPTH, lay.center.y, lay.center.z] }
}
