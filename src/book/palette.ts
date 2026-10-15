// Spine colors: identical to the "Lombadas" palette of docs/direcao-de-arte.md.
export type SpineColor = 'bordo' | 'verdeGarrafa' | 'azulPetroleo' | 'tabaco' | 'mostardaVelha' | 'couroNatural'

export const SPINE_COLORS: Record<SpineColor, string> = {
  bordo: '#6E2320',
  verdeGarrafa: '#2F4A40',
  azulPetroleo: '#24394A',
  tabaco: '#5B3A26',
  mostardaVelha: '#A07A2E',
  couroNatural: '#8B5A3C',
}

export const SPINE_COLOR_LABELS: Record<SpineColor, string> = {
  bordo: 'Bordô',
  verdeGarrafa: 'Verde-garrafa',
  azulPetroleo: 'Azul-petróleo',
  tabaco: 'Tabaco',
  mostardaVelha: 'Mostarda velha',
  couroNatural: 'Couro natural',
}

/** Gold tooling (direção de arte: latão brilho). */
export const GOLD = '#C9A35A'
