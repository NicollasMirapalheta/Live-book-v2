// Dev-only panel (leva) for the isolated book scene. Loaded lazily, never in production or shots.
import { useControls } from 'leva'
import { useEffect } from 'react'
import { FIXTURE_BOOKS, type FixtureBook } from './fixtures'
import { SPINE_COLORS, type SpineColor } from './palette'

export default function DevControls({ book, onChange }: { book: FixtureBook; onChange: (b: FixtureBook) => void }) {
  const v = useControls('Livro', {
    fixture: { value: book.id, options: FIXTURE_BOOKS.map((b) => b.id) },
    title: book.title,
    pageCount: { value: book.pageCount, min: 16, max: 1000, step: 2 },
    color: { value: book.color, options: Object.keys(SPINE_COLORS) },
    coverMaterial: { value: book.coverMaterial, options: ['leather', 'cloth'] },
    trim: { value: book.trim, options: ['medium', 'large'] },
    photo: { value: book.photoSeed !== undefined },
    photoSeed: { value: book.photoSeed ?? 1, min: 0, max: 20, step: 1 },
  })
  useEffect(() => {
    const base = FIXTURE_BOOKS.find((b) => b.id === v.fixture) ?? book
    onChange({
      ...base,
      title: v.title,
      pageCount: v.pageCount,
      color: v.color as SpineColor,
      coverMaterial: v.coverMaterial as FixtureBook['coverMaterial'],
      trim: v.trim as FixtureBook['trim'],
      photoSeed: v.photo ? v.photoSeed : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.fixture, v.title, v.pageCount, v.color, v.coverMaterial, v.trim, v.photo, v.photoSeed])
  return null
}
