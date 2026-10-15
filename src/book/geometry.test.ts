import { describe, expect, it } from 'vitest'
import {
  BOARD,
  bookDimensions,
  coverGeometry,
  MIN_BLOCK,
  pageBlockGeometry,
  polaroidGeometry,
  polaroidLayout,
  SLACK,
  SQUARE,
  spineFoilGeometry,
  TRIM_SIZES,
} from './geometry'

const mm = (m: number) => Math.round(m * 1e4) / 10 // meters → millimeters (0.1 mm)

describe('bookDimensions', () => {
  it('48 páginas: 24 folhas, miolo no mínimo de 4 mm', () => {
    const d = bookDimensions(48, 'medium')
    expect(d.sheets).toBe(24)
    expect(mm(d.blockThickness)).toBe(4) // 2.4 mm < 4 mm minimum
    expect(mm(d.totalThickness)).toBe(4 + 5 + 1)
  })

  it('220 páginas: 110 folhas × 0,1 mm = 11 mm', () => {
    const d = bookDimensions(220, 'medium')
    expect(d.sheets).toBe(110)
    expect(mm(d.blockThickness)).toBe(11)
    expect(mm(d.totalThickness)).toBe(17)
  })

  it('640 páginas: 320 folhas = 32 mm, total 38 mm', () => {
    const d = bookDimensions(640, 'large')
    expect(d.sheets).toBe(320)
    expect(mm(d.blockThickness)).toBe(32)
    expect(mm(d.totalThickness)).toBe(38)
  })

  it('páginas ímpares arredondam a folha para cima', () => {
    expect(bookDimensions(221, 'medium').sheets).toBe(111)
  })

  it('a espessura total segue a fórmula da spec', () => {
    for (const pages of [1, 48, 99, 220, 640, 1200]) {
      const d = bookDimensions(pages, 'large')
      expect(d.totalThickness).toBeCloseTo(Math.max(Math.ceil(pages / 2) * 0.0001, MIN_BLOCK) + 2 * BOARD + SLACK, 9)
    }
  })

  it('a capa excede o miolo em 3 mm em cima, embaixo e na frente', () => {
    for (const trim of ['medium', 'large'] as const) {
      const d = bookDimensions(200, trim)
      expect(d.pageWidth).toBe(TRIM_SIZES[trim].width)
      expect(d.pageHeight).toBe(TRIM_SIZES[trim].height)
      expect(d.coverHeight - d.pageHeight).toBeCloseTo(2 * SQUARE, 9)
      expect(d.coverWidth - d.pageWidth).toBeCloseTo(SQUARE, 9)
    }
  })

  it('a espessura cresce com o número de páginas (monotônica)', () => {
    let prev = 0
    for (let p = 2; p <= 1000; p += 2) {
      const t = bookDimensions(p, 'medium').totalThickness
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })

  it('rejeita pageCount inválido', () => {
    expect(() => bookDimensions(0, 'medium')).toThrow()
    expect(() => bookDimensions(Number.NaN, 'medium')).toThrow()
  })
})

describe('geometrias', () => {
  const bounds = (g: ReturnType<typeof coverGeometry>) => {
    g.computeBoundingBox()
    return g.boundingBox!
  }

  for (const [pages, trim] of [[48, 'medium'], [220, 'large'], [640, 'large']] as const) {
    it(`${pages} páginas (${trim}): capa, miolo e polaroid coerentes`, () => {
      const d = bookDimensions(pages, trim)
      const cover = bounds(coverGeometry(d, { polaroid: true }))
      const pagesBox = bounds(pageBlockGeometry(d))
      // cover thickness across X, height along Y, width to the fore-edge along Z
      expect(cover.max.x - cover.min.x).toBeCloseTo(d.totalThickness, 4)
      expect(cover.max.y - cover.min.y).toBeCloseTo(d.coverHeight, 6)
      expect(cover.max.z).toBeCloseTo(d.coverWidth, 6)
      // rounded spine bulges behind z = 0
      expect(cover.min.z).toBeCloseTo(-d.spineBulge, 4)
      // the text block sits inside the cover, with 3 mm squares top and bottom
      expect(pagesBox.min.x).toBeGreaterThan(cover.min.x + BOARD - 1e-6)
      expect(pagesBox.max.x).toBeLessThan(cover.max.x - BOARD + 1e-6)
      expect(pagesBox.min.y).toBeCloseTo(SQUARE, 6)
      expect(pagesBox.max.y).toBeCloseTo(SQUARE + d.pageHeight, 6)
      expect(pagesBox.max.z).toBeLessThan(cover.max.z)
      // spine foil hugs the spine
      const foil = bounds(spineFoilGeometry(d))
      expect(foil.min.z).toBeLessThan(cover.min.z + 1e-3)
      // polaroid inside the front board, within the recess
      const lay = polaroidLayout(d)
      expect(lay.recess.z0).toBeGreaterThan(0)
      expect(lay.recess.z1).toBeLessThan(d.coverWidth)
      expect(lay.recess.y1).toBeLessThan(d.coverHeight)
      const pol = polaroidGeometry(d)
      expect(pol.position[0]).toBeLessThan(d.totalThickness / 2)
      expect(lay.cardH / lay.cardW).toBeCloseTo(107 / 88, 3)
    })
  }

  it('grupos de material da capa: externo, bordas e interno', () => {
    const g = coverGeometry(bookDimensions(220, 'medium'), { polaroid: true })
    const mats = new Set(g.groups.map((gr) => gr.materialIndex))
    expect([...mats].sort()).toEqual([0, 1, 2])
    expect(g.getAttribute('aPanel')).toBeTruthy()
  })
})
