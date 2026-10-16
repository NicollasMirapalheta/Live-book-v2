import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteBook, listBooks, putBook, resetConnection, type StoredBook } from './db'

const book = (id: string, createdAt: number): StoredBook => ({
  id,
  title: `Livro ${id}`,
  description: '',
  color: 'bordo',
  coverMaterial: 'leather',
  trim: 'medium',
  createdAt,
  pageCount: 48,
  pdf: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
  pdfName: 'livro.pdf',
})

describe('banco dos livros (IndexedDB)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetConnection()
  })

  it('guarda, lista em ordem de criação e remove', async () => {
    await putBook(book('b', 2))
    await putBook(book('a', 1))
    expect((await listBooks()).map((b) => b.id)).toEqual(['a', 'b'])
    await deleteBook('a')
    expect((await listBooks()).map((b) => b.id)).toEqual(['b'])
  })

  it('editar é gravar de novo com o mesmo id', async () => {
    await putBook(book('a', 1))
    await putBook({ ...book('a', 1), title: 'Outro título' })
    const all = await listBooks()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Outro título')
  })

  it('o PDF volta como Blob', async () => {
    await putBook(book('a', 1))
    const [b] = await listBooks()
    expect(b.pdf).toBeInstanceOf(Blob)
    expect(b.pdf.size).toBeGreaterThan(0)
  })
})
