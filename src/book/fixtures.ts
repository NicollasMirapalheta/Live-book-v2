import type { BookData } from './types'

/** Test books: the 6 spine colors, 48–640 pages, both trims, both cover materials, generated photos. */
export interface FixtureBook extends BookData {
  /** seed of a generated sample photo (canvasTextures.samplePhoto); none = empty polaroid */
  photoSeed?: number
}

const T0 = Date.UTC(2026, 9, 14)

export const FIXTURE_BOOKS: FixtureBook[] = [
  {
    id: 'fx-bordo',
    title: 'Cartas de Verão',
    subtitle: 'Correspondência, 1998–2004',
    description: 'As cartas trocadas entre a avó e as netas durante as férias na serra.',
    color: 'bordo',
    coverMaterial: 'leather',
    pageCount: 48,
    trim: 'medium',
    createdAt: T0,
    photoSeed: 1,
  },
  {
    id: 'fx-verde',
    title: 'Diário de Campo',
    description: 'Anotações, mapas e plantas de três anos de caminhadas pelo litoral.',
    color: 'verdeGarrafa',
    coverMaterial: 'cloth',
    pageCount: 220,
    trim: 'medium',
    createdAt: T0 + 1,
    photoSeed: 4,
  },
  {
    id: 'fx-natural',
    title: 'Receitas da Casa',
    subtitle: 'Edição completa',
    description: 'Todas as receitas da família, com as histórias de cada uma.',
    color: 'couroNatural',
    coverMaterial: 'leather',
    pageCount: 640,
    trim: 'large',
    createdAt: T0 + 2,
    photoSeed: 2,
  },
  {
    id: 'fx-petroleo',
    title: 'Viagem ao Norte',
    description: 'Fotografias e relatos de uma viagem de trem.',
    color: 'azulPetroleo',
    coverMaterial: 'cloth',
    pageCount: 120,
    trim: 'large',
    createdAt: T0 + 3,
    photoSeed: 3,
  },
  {
    id: 'fx-tabaco',
    title: 'Poemas Reunidos',
    description: 'Os poemas escritos entre 1980 e 2020.',
    color: 'tabaco',
    coverMaterial: 'leather',
    pageCount: 360,
    trim: 'medium',
    createdAt: T0 + 4,
  },
  {
    id: 'fx-mostarda',
    title: 'O Jardim',
    description: 'Um ano de cuidados com o jardim, mês a mês.',
    color: 'mostardaVelha',
    coverMaterial: 'cloth',
    pageCount: 96,
    trim: 'large',
    createdAt: T0 + 5,
    photoSeed: 5,
  },
]

/** The three books of `npm run shot -- --dev book` (spec Fase 2). */
export const SHOT_PRESETS = ['fx-bordo', 'fx-verde', 'fx-natural'] as const
