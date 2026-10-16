import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { AgXToneMapping, type Group, type PerspectiveCamera } from 'three'
import { Book } from '../book/Book'
import { RoomEnvironment } from '../book/envMap'
import { bookDimensions } from '../book/geometry'
import { SPINE_COLOR_LABELS, SPINE_COLORS, type SpineColor } from '../book/palette'
import { titleFromFile, useBookContent } from '../book/pdf/content'
import type { CoverMaterial, Trim } from '../book/types'
import { newBookId, useLibrary, type LibraryBook } from '../data/library'
import { isPdf, useCreator } from './creator'
import './ui.css'

const COLORS = Object.keys(SPINE_COLORS) as SpineColor[]
/** thickness of the preview before the PDF is composed */
const DRAFT_PAGES = 120

interface Draft {
  id: string
  title: string
  subtitle: string
  description: string
  color: SpineColor
  coverMaterial: CoverMaterial
  trim: Trim
  pdf: Blob | null
  pdfName: string
  coverPhoto: Blob | null
  createdAt: number
  pageCount: number | null
}

function draftFrom(book: LibraryBook | undefined, file: File | null): Draft {
  if (book)
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle ?? '',
      description: book.description,
      color: book.color,
      coverMaterial: book.coverMaterial,
      trim: book.trim,
      pdf: book.pdf ?? null,
      pdfName: book.pdfName ?? '',
      coverPhoto: book.coverPhoto ?? null,
      createdAt: book.createdAt,
      pageCount: book.pageCount,
    }
  return {
    id: newBookId(),
    title: file ? titleFromFile(file.name) : '',
    subtitle: '',
    description: '',
    color: 'bordo',
    coverMaterial: 'leather',
    trim: 'medium',
    pdf: file,
    pdfName: file?.name ?? '',
    coverPhoto: null,
    createdAt: Date.now(),
    pageCount: null,
  }
}

/** Novo livro / Editar livro (spec Fase 6), with the book itself turning slowly beside the fields. */
export function BookForm() {
  const mode = useCreator((s) => s.mode)
  if (!mode) return null
  return <BookFormOpen />
}

function BookFormOpen() {
  const { mode, editId, file, close } = useCreator()
  const editing = useLibrary((s) => s.user.find((b) => b.id === editId))
  const persistent = useLibrary((s) => s.persistent)
  const [d, setD] = useState<Draft>(() => draftFrom(mode === 'edit' ? editing : undefined, file))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const content = useBookContent((s) => s.byId[d.id])
  const ids = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))

  useEffect(() => titleRef.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, close])

  // a PDF chosen: compose it now, for the page count (thickness of the preview) and to catch errors early
  const pdf = d.pdf
  useEffect(() => {
    if (!pdf) return
    let alive = true
    setError(null)
    void useBookContent
      .getState()
      .prepare({ id: d.id, title: d.title || 'Livro', trim: d.trim, pdf, pdfName: d.pdfName, createdAt: d.createdAt })
      .then((c) => {
        if (!alive) return
        if (c.status === 'error') setError(`Não consegui ler esse PDF (${c.error}).`)
        else if (c.layout) set({ pageCount: c.layout.pageCount })
      })
    return () => {
      alive = false
    }
    // recompose when the file or the format changes (the title only matters at saving)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, d.trim])

  const pickPdf = (f: File | undefined) => {
    if (!f) return
    if (!isPdf(f)) return setError('Escolha um arquivo PDF.')
    set({ pdf: f, pdfName: f.name, pageCount: null, title: d.title || titleFromFile(f.name) })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const title = d.title.trim()
    if (!title) return setError('Dê um título ao livro.')
    if (!d.pdf) return setError('Escolha o PDF com o conteúdo do livro.')
    setBusy(true)
    setError(null)
    // compose with the final title (title page and running heads), which also gives the page count
    const c = await useBookContent.getState().prepare({ id: d.id, title, subtitle: d.subtitle.trim() || undefined, trim: d.trim, pdf: d.pdf, pdfName: d.pdfName, createdAt: d.createdAt })
    if (c.status !== 'ready' || !c.layout) {
      setBusy(false)
      return setError(`Não consegui ler esse PDF (${c.error ?? 'erro desconhecido'}).`)
    }
    await useLibrary.getState().save({
      id: d.id,
      title,
      subtitle: d.subtitle.trim() || undefined,
      description: d.description.trim(),
      color: d.color,
      coverMaterial: d.coverMaterial,
      trim: d.trim,
      createdAt: d.createdAt,
      pageCount: c.layout.pageCount,
      pdf: d.pdf,
      pdfName: d.pdfName,
      coverPhoto: d.coverPhoto ?? undefined,
    })
    setBusy(false)
    close()
  }

  const preview = useMemo(
    () => ({
      id: d.id,
      title: d.title || 'Sem título',
      description: '',
      color: d.color,
      coverMaterial: d.coverMaterial,
      trim: d.trim,
      pageCount: d.pageCount ?? DRAFT_PAGES,
      createdAt: d.createdAt,
      coverPhoto: d.coverPhoto ?? undefined,
    }),
    [d.id, d.title, d.color, d.coverMaterial, d.trim, d.pageCount, d.createdAt, d.coverPhoto],
  )

  const loading = content?.status === 'loading'
  return (
    <div className="ui-overlay" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), pickPdf([...e.dataTransfer.files].find(isPdf)))}>
      <form className="ui-card bf" role="dialog" aria-modal="true" aria-labelledby={`${ids}-h`} onSubmit={submit}>
        <div className="bf-preview" aria-hidden="true">
          <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [0.62, 0.05, 0] }} gl={{ antialias: true, toneMapping: AgXToneMapping, toneMappingExposure: 1.1 }}>
            <Suspense fallback={null}>
              <RoomEnvironment background={false} intensity={1.1} />
              <directionalLight position={[0.8, 1, 0.6]} intensity={1.6} />
              <PreviewBook book={preview} />
            </Suspense>
          </Canvas>
          <p className="bf-preview-caption">{d.pageCount ? `${d.pageCount} páginas` : d.pdf ? 'contando as páginas…' : 'escolha o PDF'}</p>
        </div>

        <div className="bf-fields">
          <p className="ui-kicker">{mode === 'edit' ? 'Editar livro' : 'Novo livro'}</p>
          <h2 id={`${ids}-h`} className="ui-title">
            {mode === 'edit' ? (editing?.title ?? d.title) : 'Um livro para a estante'}
          </h2>

          <label className="bf-drop" data-filled={d.pdf ? '' : undefined}>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => pickPdf(e.target.files?.[0])} />
            <span className="bf-drop-main">{d.pdf ? d.pdfName : 'Escolha ou arraste o PDF do conteúdo'}</span>
            <span className="bf-drop-sub">{d.pdf ? 'trocar arquivo' : 'o texto e as imagens viram as páginas do livro'}</span>
          </label>
          {loading && (
            <div className="ui-progress" role="progressbar" aria-label="Preparando páginas" aria-valuenow={Math.round((content?.progress ?? 0) * 100)}>
              <div className="ui-progress-fill" style={{ width: `${Math.max(4, Math.round((content?.progress ?? 0) * 100))}%` }} />
            </div>
          )}

          <label className="ui-field">
            <span>Título</span>
            <input ref={titleRef} value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} required />
          </label>
          <label className="ui-field">
            <span>Subtítulo</span>
            <input value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} maxLength={100} />
          </label>
          <label className="ui-field">
            <span>Descrição</span>
            <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} maxLength={400} />
          </label>

          <fieldset className="ui-field">
            <legend>Cor da capa</legend>
            <div className="bf-swatches" role="radiogroup" aria-label="Cor da capa">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={d.color === c}
                  aria-label={SPINE_COLOR_LABELS[c]}
                  title={SPINE_COLOR_LABELS[c]}
                  className="bf-swatch"
                  style={{ background: SPINE_COLORS[c] }}
                  onClick={() => set({ color: c })}
                />
              ))}
            </div>
          </fieldset>

          <div className="bf-row">
            <fieldset className="ui-field">
              <legend>Material</legend>
              <div className="ui-segmented">
                {(
                  [
                    ['leather', 'Couro'],
                    ['cloth', 'Tecido'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={d.coverMaterial === v} onClick={() => set({ coverMaterial: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="ui-field">
              <legend>Formato</legend>
              <div className="ui-segmented">
                {(
                  [
                    ['medium', '16 × 23'],
                    ['large', '19 × 26'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={d.trim === v} onClick={() => set({ trim: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="ui-field">
            <span>Foto da capa</span>
            <div className="bf-photo">
              <label className="ui-btn ui-btn-secondary ui-btn-small">
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && set({ coverPhoto: e.target.files[0] })} />
                {d.coverPhoto ? 'Trocar foto' : 'Escolher foto'}
              </label>
              {d.coverPhoto && (
                <button type="button" className="ui-link" onClick={() => set({ coverPhoto: null })}>
                  sem foto
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="ui-error" role="alert">
              {error}
            </p>
          )}
          {!persistent && <p className="ui-note">Este navegador não deixa guardar: o livro fica só até fechar a página.</p>}

          <div className="ui-actions">
            <button type="submit" className="ui-btn ui-btn-primary" disabled={busy || loading}>
              {busy ? 'Guardando…' : mode === 'edit' ? 'Salvar' : 'Pôr na estante'}
            </button>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={close} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

/** The book standing in front of the camera, turning a little to show its spine. */
function PreviewBook({ book }: { book: Parameters<typeof Book>[0]['book'] }) {
  const g = useRef<Group>(null)
  const d = bookDimensions(book.pageCount, book.trim)
  useFrame(({ clock, camera, size }) => {
    if (g.current) g.current.rotation.y = -0.45 + Math.sin(clock.elapsedTime * 0.45) * 0.18
    // framed by whichever is tighter: the column is tall and narrow on desktop, short and wide on phones
    const cam = camera as PerspectiveCamera
    const half = Math.tan((cam.fov * Math.PI) / 360)
    const dist = 1.12 * Math.max(d.coverHeight / 2 / half, (d.coverWidth * 0.75) / (half * (size.width / size.height)))
    cam.position.set(dist, dist * 0.08, 0)
    cam.lookAt(0, 0, 0)
  })
  return (
    <group ref={g}>
      {/* centered: the Book's origin is the foot of the spine, the fore-edge toward −Z */}
      <Book book={book} position={[0, -d.coverHeight / 2, d.coverWidth / 2]} />
    </group>
  )
}
