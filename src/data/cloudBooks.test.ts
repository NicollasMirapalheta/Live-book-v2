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

  it('PDF acima de 50 MB sobe em partes de 45 MB e volta inteiro, byte a byte', async () => {
    const { db, files } = fakeDb()
    const MB = 1024 * 1024
    const bytes = new Uint8Array(100 * MB)
    for (let i = 0; i < bytes.length; i += 4096) bytes[i] = (i / 4096) % 251
    const big = new Blob([bytes], { type: 'application/pdf' })
    const row = await saveBook(db, 'u1', book('a', { pdf: big }), { pdf: true, photo: false })
    expect(row.pdf_path).toBe('u1/a/livro.pdf#3')
    expect([...files.keys()].sort()).toEqual(['u1/a/livro.pdf.1', 'u1/a/livro.pdf.2', 'u1/a/livro.pdf.3'])
    for (const f of files.values()) expect(f.size).toBeLessThanOrEqual(50 * MB)
    const back = await fromRow(row, db.download).loadPdf()
    expect(back.size).toBe(big.size)
    // compared in a loop: toEqual on 100 MB of elements runs out of memory
    const got = new Uint8Array(await back.arrayBuffer())
    let same = got.length === bytes.length
    for (let i = 0; same && i < bytes.length; i++) same = got[i] === bytes[i]
    expect(same).toBe(true)

    // a smaller PDF in its place: the parts go, the single file stays
    const small = await saveBook(db, 'u1', book('a'), { pdf: true, photo: false }, row)
    expect(small.pdf_path).toBe('u1/a/livro.pdf')
    expect([...files.keys()]).toEqual(['u1/a/livro.pdf'])

    // and removing a book in parts deletes every part
    const again = await saveBook(db, 'u1', book('a', { pdf: big }), { pdf: true, photo: false }, small)
    expect(files.has('u1/a/livro.pdf')).toBe(false)
    await removeBook(db, again)
    expect(files.size).toBe(0)
  })

  it('editar o título de um livro em partes mantém as partes', async () => {
    const { db, files } = fakeDb()
    const big = new Blob([new Uint8Array(60 * 1024 * 1024)], { type: 'application/pdf' })
    const row = await saveBook(db, 'u1', book('a', { pdf: big }), { pdf: true, photo: false })
    const edited = await saveBook(db, 'u1', book('a', { title: 'Outro', pdf: big }), { pdf: false, photo: false }, row)
    expect(edited.pdf_path).toBe('u1/a/livro.pdf#2')
    expect(files.size).toBe(2)
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
