import { describe, expect, it } from 'vitest'
import { bookToc, chapterAt, currentEntry } from './toc'

describe('sumário provisório', () => {
  it('começa na página de rosto, termina na última página, capítulos em ordem e em páginas ímpares', () => {
    const toc = bookToc({ id: 'fx-teste', pageCount: 220 })
    expect(toc[0]).toEqual({ title: 'Página de rosto', page: 1 })
    expect(toc[toc.length - 1]).toEqual({ title: 'Última página', page: 220 })
    const chapters = toc.filter((e) => e.chapter !== undefined)
    expect(chapters.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < toc.length; i++) expect(toc[i].page).toBeGreaterThan(toc[i - 1].page)
    for (const c of chapters) expect(c.page % 2).toBe(1)
  })

  it('livro curto ainda tem capítulos dentro do livro', () => {
    const toc = bookToc({ id: 'fx-curto', pageCount: 48 })
    for (const e of toc) expect(e.page).toBeLessThanOrEqual(48)
    expect(toc.filter((e) => e.chapter !== undefined)).toHaveLength(2)
  })

  it('capítulo pela página e entrada atual pela página aberta', () => {
    const book = { id: 'fx-teste', pageCount: 220 }
    const toc = bookToc(book)
    const second = toc.filter((e) => e.chapter !== undefined)[1]
    expect(chapterAt(book, second.page)).toBe(second)
    expect(currentEntry(toc, second.page + 1)).toBe(second)
    expect(currentEntry(toc, 1)?.title).toBe('Página de rosto')
  })
})
