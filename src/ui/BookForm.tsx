import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { AgXToneMapping, type Group, type PerspectiveCamera } from 'three'
import { Book } from '../book/Book'
import { RoomEnvironment } from '../book/envMap'
import { bookDimensions } from '../book/geometry'
import { SPINE_COLOR_LABELS, SPINE_COLORS, type SpineColor } from '../book/palette'
import { titleFromFile, useBookContent } from '../book/pdf/content'
import type { CoverMaterial, Trim } from '../book/types'
import { MAX_FILE_BYTES } from '../data/cloudBooks'
import { newBookId, useLibrary, type LibraryBook } from '../data/library'
import { loadBookcase, shelfBooks, shelfLayoutFor } from '../book/shelfData'
import { isPdf, useCreator } from './creator'
import './ui.css'

const COLORS = Object.keys(SPINE_COLORS) as SpineColor[]
const PREVIEW_YAW = (40 * Math.PI) / 180
const PREVIEW_PITCH = (8 * Math.PI) / 180
/**
 * Preview light: the room shows its books through a white-balance grade (scene/Grade.tsx) that this small
 * canvas does not have, so it gets a near-neutral key in front of the cover and less of the (warm) room env
 * map. Matched by measurement: petrol-blue cloth reads (73, 81, 89) here and (72, 73, 77) in the hand.
 */
const PREVIEW_KEY = '#FFF1E2'
const PREVIEW_ENV = 0.6
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
  const cloud = useLibrary((s) => s.mode === 'cloud')
  // what the user changed: unchanged files are not sent again (Fase 7)
  const [changed, setChanged] = useState({ pdf: false, photo: false })
  // editing a cloud book whose PDF was never opened here: fetch it (cached afterwards)
  const [fetchingPdf, setFetchingPdf] = useState(false)
  useEffect(() => {
    const load = editing?.loadPdf
    if (mode !== 'edit' || d.pdf || !load) return
    let alive = true
    setFetchingPdf(true)
    load()
      .then((pdf) => alive && setD((prev) => ({ ...prev, pdf })))
      .catch((err: unknown) => alive && setError(`Não consegui baixar o PDF (${err instanceof Error ? err.message : String(err)}).`))
      .finally(() => alive && setFetchingPdf(false))
    return () => {
      alive = false
    }
    // once, when the form opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
    if (cloud && f.size > MAX_FILE_BYTES) return setError('Esse PDF passa de 50 MB, o limite do plano grátis do Supabase.')
    setChanged((c) => ({ ...c, pdf: true }))
    set({ pdf: f, pdfName: f.name, pageCount: null, title: d.title || titleFromFile(f.name) })
  }
  const pickPhoto = (f: File | null) => {
    if (f && cloud && f.size > MAX_FILE_BYTES) return setError('Essa foto passa de 50 MB.')
    setChanged((c) => ({ ...c, photo: true }))
    set({ coverPhoto: f })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const title = d.title.trim()
    if (!title) return setError('Dê um título ao livro.')
    if (!d.pdf) return setError(fetchingPdf ? 'Ainda baixando o PDF deste livro…' : 'Escolha o PDF com o conteúdo do livro.')
    setBusy(true)
    setError(null)
    // compose with the final title (title page and running heads), which also gives the page count
    const c = await useBookContent.getState().prepare({ id: d.id, title, subtitle: d.subtitle.trim() || undefined, trim: d.trim, pdf: d.pdf, pdfName: d.pdfName, createdAt: d.createdAt })
    if (c.status !== 'ready' || !c.layout) {
      setBusy(false)
      return setError(`Não consegui ler esse PDF (${c.error ?? 'erro desconhecido'}).`)
    }
    // the bookcase has room for it? (a new book, or one that got thicker)
    const others = shelfBooks().filter((b) => b.id !== d.id && !b.example)
    const probe: LibraryBook = { id: d.id, title, description: '', color: d.color, coverMaterial: d.coverMaterial, trim: d.trim, pageCount: c.layout.pageCount, createdAt: d.createdAt }
    const layout = shelfLayoutFor(await loadBookcase(), [...others, probe])
    if (layout.overflow.includes(d.id)) {
      setBusy(false)
      return setError('A estante está cheia: esse livro não cabe. Remova algum livro para abrir espaço.')
    }
    try {
      await useLibrary.getState().save(
        {
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
        },
        { pdf: mode === 'new' || changed.pdf, photo: mode === 'new' || changed.photo },
      )
    } catch (err) {
      setBusy(false)
      return setError(`Não consegui guardar o livro (${err instanceof Error ? err.message : String(err)}).`)
    }
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
  // thumbnail of the chosen photo
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!d.coverPhoto) return setPhotoUrl(null)
    const url = URL.createObjectURL(d.coverPhoto)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [d.coverPhoto])
  return (
    <div className="ui-overlay" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), pickPdf([...e.dataTransfer.files].find(isPdf)))}>
      <form className="ui-card bf" role="dialog" aria-modal="true" aria-labelledby={`${ids}-h`} onSubmit={submit}>
        <div className="bf-preview" aria-hidden="true">
          <Canvas dpr={[1, 2]} camera={{ fov: 22, position: [0.8, 0.1, 0] }} gl={{ antialias: true, toneMapping: AgXToneMapping, toneMappingExposure: 1.1 }}>
            <Suspense fallback={null}>
              <RoomEnvironment background={false} intensity={PREVIEW_ENV} />
              <directionalLight position={[1, 0.9, -0.7]} intensity={3} color={PREVIEW_KEY} />
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

          <span className="ui-label" id={`${ids}-pdf`}>
            PDF do conteúdo <Req />
          </span>
          <label className="bf-drop" data-filled={d.pdf ? '' : undefined} aria-labelledby={`${ids}-pdf`}>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => pickPdf(e.target.files?.[0])} />
            <span className="bf-drop-main">{d.pdf ? d.pdfName : 'Escolha ou arraste o arquivo'}</span>
            <span className="bf-drop-sub">{d.pdf ? 'trocar arquivo' : 'o texto e as imagens viram as páginas do livro'}</span>
          </label>
          {loading && (
            <div className="ui-progress" role="progressbar" aria-label="Preparando páginas" aria-valuenow={Math.round((content?.progress ?? 0) * 100)}>
              <div className="ui-progress-fill" style={{ width: `${Math.max(4, Math.round((content?.progress ?? 0) * 100))}%` }} />
            </div>
          )}

          <label className="ui-field">
            <span>
              Título <Req />
            </span>
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
            <legend>
              Cor da capa <span className="bf-color-name">· {SPINE_COLOR_LABELS[d.color]}</span>
            </legend>
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

          <div className="ui-field bf-photo-field">
            <span>Foto da capa</span>
            <label className="bf-drop bf-drop-photo" data-filled={d.coverPhoto ? '' : undefined}>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
              {photoUrl && <img className="bf-thumb" src={photoUrl} alt="" />}
              <span>
                <span className="bf-drop-main">{d.coverPhoto ? 'Trocar a foto' : 'Escolha uma foto (opcional)'}</span>
                <span className="bf-drop-sub">vira a polaroid na capa</span>
              </span>
            </label>
            {d.coverPhoto && (
              <button type="button" className="bf-clear" aria-label="Tirar a foto" title="Tirar a foto" onClick={() => pickPhoto(null)}>
                ×
              </button>
            )}
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

/** Required field mark. */
function Req() {
  return (
    <abbr className="ui-req" title="obrigatório">
      *
    </abbr>
  )
}

/** The book standing in front of the camera, turning a little to show its spine. */
function PreviewBook({ book }: { book: Parameters<typeof Book>[0]['book'] }) {
  const g = useRef<Group>(null)
  const d = bookDimensions(book.pageCount, book.trim)
  useFrame(({ clock, camera, size }) => {
    // three-quarter view with the spine toward the camera (a thin book's spine only shows from that side)
    if (g.current) g.current.rotation.y = PREVIEW_YAW + Math.sin(clock.elapsedTime * 0.45) * 0.08
    // the book fills ~65% of the column's height, or ~90% of its width when the column is short and wide
    const cam = camera as PerspectiveCamera
    const half = Math.tan((cam.fov * Math.PI) / 360)
    const projected = d.coverWidth * Math.cos(PREVIEW_YAW) + d.totalThickness * Math.sin(PREVIEW_YAW)
    const dist = Math.max(d.coverHeight / (2 * half * 0.65), projected / (2 * half * (size.width / size.height) * 0.9))
    cam.position.set(dist * Math.cos(PREVIEW_PITCH), dist * Math.sin(PREVIEW_PITCH), 0)
    // aim a little low: the book sits above the middle, the page count just under it
    cam.lookAt(0, -dist * half * 0.12, 0)
  })
  return (
    <group ref={g}>
      {/* centered: the Book's origin is the foot of the spine, the fore-edge toward −Z */}
      {/* (−Z is screen-right: a touch to the right centres the turned book, spine included, in the column) */}
      <Book book={book} position={[0, -d.coverHeight / 2, d.coverWidth / 2 - 0.006]} />
    </group>
  )
}
