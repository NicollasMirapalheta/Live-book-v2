import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURE_BOOKS } from './fixtures'
import { layoutShelves, type PropSlot, type Shelf, type ShelfLayout } from './shelfLayout'

const bookcase = JSON.parse(readFileSync(new URL('../../public/data/bookcase.json', import.meta.url), 'utf8')) as {
  shelves: Shelf[]
  propSlots: PropSlot[]
}

/** Every object on every shelf, as x intervals; nothing may overlap. */
function overlaps(layout: ShelfLayout) {
  const found: string[] = []
  for (const shelf of bookcase.shelves) {
    const items: [string, number, number][] = [
      ...layout.books.filter((b) => b.shelf === shelf.index).map((b): [string, number, number] => [b.id, b.x - b.thickness / 2, b.x + b.thickness / 2]),
      ...layout.props
        .filter((p) => p.shelf === shelf.index)
        .flatMap((p): [string, number, number][] =>
          p.kind === 'bookend_pair'
            ? [[`${p.kind}-l`, p.x - p.width / 2, p.x + p.width / 2], [`${p.kind}-r`, (p.endX ?? p.x) - p.width / 2, (p.endX ?? p.x) + p.width / 2]]
            : [[p.kind, p.x - p.width / 2, p.x + p.width / 2]],
        ),
    ].sort((a, b) => a[1] - b[1])
    for (let i = 1; i < items.length; i++) {
      // the leaning book's top crosses over the closing upright by design; compare footprints only
      if (items[i][1] < items[i - 1][2] - 1e-9) found.push(`${shelf.index}: ${items[i - 1][0]} × ${items[i][0]}`)
    }
  }
  return found
}

describe('layoutShelves', () => {
  it('posiciona os 6 livros de teste dentro das prateleiras, com folgas de 2–4 mm', () => {
    const layout = layoutShelves(FIXTURE_BOOKS, bookcase.shelves, bookcase.propSlots)
    expect(layout.overflow).toEqual([])
    expect(layout.books).toHaveLength(FIXTURE_BOOKS.length)
    for (const shelf of bookcase.shelves) {
      const row = layout.books.filter((b) => b.shelf === shelf.index).sort((a, b) => a.x - b.x)
      for (let i = 0; i < row.length; i++) {
        const b = row[i]
        expect(b.x - b.thickness / 2).toBeGreaterThanOrEqual(shelf.xMin)
        expect(b.x + b.thickness / 2).toBeLessThanOrEqual(shelf.xMax)
        expect(Math.abs(b.dz)).toBeLessThanOrEqual(0.005)
        if (i > 0) {
          const gap = b.x - b.thickness / 2 - (row[i - 1].x + row[i - 1].thickness / 2)
          expect(gap).toBeGreaterThanOrEqual(0.002 - 1e-9)
          expect(gap).toBeLessThanOrEqual(0.004 + 1e-9)
        }
      }
    }
  })

  it('nada se sobrepõe (livros, apoios e objetos)', () => {
    expect(overlaps(layoutShelves(FIXTURE_BOOKS, bookcase.shelves, bookcase.propSlots))).toEqual([])
  })

  it('o par de apoios abraça a fileira', () => {
    const { books, props } = layoutShelves(FIXTURE_BOOKS, bookcase.shelves, bookcase.propSlots)
    for (const shelf of new Set(books.map((b) => b.shelf))) {
      const row = books.filter((b) => b.shelf === shelf)
      const start = Math.min(...row.map((b) => b.x - b.thickness / 2))
      const end = Math.max(...row.map((b) => b.x + b.thickness / 2))
      const bookend = props.find((p) => p.shelf === shelf && p.kind === 'bookend_pair')!
      expect(bookend.x).toBeLessThan(start)
      expect(bookend.endX!).toBeGreaterThan(end)
    }
  })

  it('quando o espaço acaba, o objeto no caminho desce para um vão livre e nada se sobrepõe', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ ...FIXTURE_BOOKS[i % 6], id: `b${i}`, createdAt: i }))
    const layout = layoutShelves(many, bookcase.shelves, bookcase.propSlots.map((p) => ({ ...p })))
    const moved = layout.props.filter((p, i) => p.shelf !== bookcase.propSlots[i].shelf)
    expect(moved.length).toBeGreaterThan(0)
    for (const p of moved) expect(p.shelf).toBeLessThan(bookcase.propSlots[layout.props.indexOf(p)].shelf)
    expect(overlaps(layout)).toEqual([])
  })
})
