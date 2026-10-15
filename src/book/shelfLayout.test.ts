import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIXTURE_BOOKS } from './fixtures'
import { layoutShelves, type PropSlot, type Shelf } from './shelfLayout'

const bookcase = JSON.parse(readFileSync(new URL('../../public/data/bookcase.json', import.meta.url), 'utf8')) as {
  shelves: Shelf[]
  propSlots: PropSlot[]
}

describe('layoutShelves', () => {
  it('posiciona os 6 livros de teste sem sobreposição e dentro das prateleiras', () => {
    const { books, overflow } = layoutShelves(FIXTURE_BOOKS, bookcase.shelves, bookcase.propSlots)
    expect(overflow).toEqual([])
    expect(books).toHaveLength(FIXTURE_BOOKS.length)
    for (const shelf of bookcase.shelves) {
      const row = books.filter((b) => b.shelf === shelf.index).sort((a, b) => a.x - b.x)
      for (let i = 0; i < row.length; i++) {
        const b = row[i]
        expect(b.x - b.thickness / 2).toBeGreaterThanOrEqual(shelf.xMin)
        expect(b.x + b.thickness / 2).toBeLessThanOrEqual(shelf.xMax)
        expect(b.z).toBeGreaterThan(shelf.zBack)
        expect(b.z).toBeLessThan(shelf.zFront)
        if (i > 0) {
          const gap = b.x - b.thickness / 2 - (row[i - 1].x + row[i - 1].thickness / 2)
          expect(gap).toBeGreaterThanOrEqual(0.002 - 1e-9)
          expect(gap).toBeLessThanOrEqual(0.004 + 1e-9)
        }
      }
    }
  })

  it('o apoio de livro fecha a fileira', () => {
    const { books, props } = layoutShelves(FIXTURE_BOOKS, bookcase.shelves, bookcase.propSlots)
    for (const shelf of new Set(books.map((b) => b.shelf))) {
      const end = Math.max(...books.filter((b) => b.shelf === shelf).map((b) => b.x + b.thickness / 2))
      const bookend = props.find((p) => p.shelf === shelf && p.kind === 'bookend_pair')
      if (bookend) expect(bookend.x).toBeGreaterThan(end)
    }
  })

  it('quando o espaço acaba, o objeto mais à direita desce para a próxima prateleira', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...FIXTURE_BOOKS[i % 6], id: `b${i}`, createdAt: i }))
    const before = bookcase.propSlots.map((p) => ({ ...p }))
    const { props } = layoutShelves(many, bookcase.shelves, before)
    const moved = props.filter((p, i) => p.shelf !== bookcase.propSlots[i].shelf)
    expect(moved.length).toBeGreaterThan(0)
    for (const p of moved) expect(p.shelf).toBeLessThan(bookcase.propSlots[props.indexOf(p)].shelf)
  })
})
