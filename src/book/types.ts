import type { SpineColor } from './palette'

export type { SpineColor }

export type CoverMaterial = 'leather' | 'cloth'
export type Trim = 'medium' | 'large'

export interface BookData {
  id: string
  title: string
  subtitle?: string
  description: string
  color: SpineColor
  coverMaterial: CoverMaterial
  /** the "polaroid" */
  coverPhoto?: Blob
  /** defines the thickness */
  pageCount: number
  /** medium 16×23 cm, large 19×26 cm */
  trim: Trim
  createdAt: number
}
