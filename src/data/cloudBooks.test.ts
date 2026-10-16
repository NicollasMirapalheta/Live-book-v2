import { describe, expect, it } from 'vitest'
import type { StoredBook } from './db'
import { fromRow, migrateLocal, removeBook, saveBook, type BookRow, type CloudDb } from './cloudBooks'

/** An in-memory stand-in for the table and the bucket, scoped like the RLS policies: rows of one user. */
function fakeDb() {
  const rows = new Map<string, BookRow>()
  const files = new Map<string, Blob>()
  const db: CloudDb = {
    listRows: async () => [...rows.values()],
    upsertRow: async (r) => void rows.set(r.id, r),
    deleteRow: async (id) => void rows.delete(id),
    upload: async (p, f) => void files.set(p, f),
    download: async (p) => {
      const f = files.get(p)
      if (!f) throw new Error(`sem ${p}`)
      return f
    },
    removeFiles: async (ps) => ps.forEach((p) => files.delete(p)),
  }
  return { db, rows, files }
}

const pdf = (s = 'pdf') => new Blob([`%PDF ${s}`], { type: 'application/pdf' })
const book = (id: string, extra: Partial<StoredBook> = {}): StoredBook => ({
  id,
  title: `Livro ${id}`,
  description: '',
  color: 'bordo',
  coverMaterial: 'leather',
  trim: 'medium',
  createdAt: 1,
  pageCount: 28,
  pdf: pdf(id),
  pdfName: `${id}.pdf`,
  ...extra,
})

describe('livros na nuvem', () => {
  it('guarda o PDF e a foto na pasta do usuário e grava a linha', async () => {
    const { db, rows, files } = fakeDb()
    const row = await saveBook(db, 'u1', book('a', { coverPhoto: new Blob(['jpg']) }), { pdf: true, photo: true })
    expect(row.pdf_path).toBe('u1/a/livro.pdf')
    expect(row.photo_path).toBe('u1/a/foto')
    expect(rows.get('a')?.user_id).toBe('u1')
    expect([...files.keys()].sort()).toEqual(['u1/a/foto', 'u1/a/livro.pdf'])
  })

  it('editar só o título não reenvia o PDF; tirar a foto apaga o arquivo', async () => {
    const { db, files } = fakeDb()
    const first = await saveBook(db, 'u1', book('a', { coverPhoto: new Blob(['jpg']) }), { pdf: true, photo: true })
    files.set('u1/a/livro.pdf', pdf('original'))
    const edited = await saveBook(db, 'u1', book('a', { title: 'Outro', pdf: pdf('não enviar') }), { pdf: false, photo: true }, first)
    expect(await (await db.download('u1/a/livro.pdf')).text()).toBe('%PDF original')
    expect(edited.photo_path).toBeNull()
    expect(files.has('u1/a/foto')).toBe(false)
  })

  it('PDF acima de 50 MB é recusado antes de enviar', async () => {
    const { db, files } = fakeDb()
    const big = { size: 51 * 1024 * 1024 } as Blob
    await expect(saveBook(db, 'u1', book('a', { pdf: big }), { pdf: true, photo: false })).rejects.toThrow(/50 MB/)
    expect(files.size).toBe(0)
  })

  it('a linha volta como livro e o PDF vem sob demanda', async () => {
    const { db } = fakeDb()
    const row = await saveBook(db, 'u1', book('a'), { pdf: true, photo: false })
    const b = fromRow(row, db.download)
    expect(b.pdf).toBeUndefined()
    expect(await (await b.loadPdf()).text()).toBe('%PDF a')
  })

  it('remover apaga a linha e os arquivos', async () => {
    const { db, rows, files } = fakeDb()
    const row = await saveBook(db, 'u1', book('a', { coverPhoto: new Blob(['jpg']) }), { pdf: true, photo: true })
    await removeBook(db, row)
    expect(rows.size).toBe(0)
    expect(files.size).toBe(0)
  })

  it('levar os livros deste navegador para a conta', async () => {
    const { db, rows } = fakeDb()
    const done: number[] = []
    const ok = await migrateLocal(db, 'u1', [book('a'), book('b')], (n) => done.push(n))
    expect(ok).toEqual(['a', 'b'])
    expect(done).toEqual([1, 2])
    expect([...rows.keys()]).toEqual(['a', 'b'])
  })
})
