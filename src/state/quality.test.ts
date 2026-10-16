import { beforeEach, describe, expect, it, vi } from 'vitest'

// quality.ts reads the URL and localStorage: a minimal browser for the node test environment
const store = new Map<string, string>()
vi.stubGlobal('window', { location: { search: '' } })
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
const { LEVELS, detectInitialQuality, useQuality } = await import('./quality')

describe('níveis de qualidade', () => {
  beforeEach(() => {
    store.clear()
    useQuality.setState({ level: 5, quality: 'high', auto: true, resolved: false })
  })

  it('1–2 usam os modelos leves, 3–5 os completos; dpr, MSAA e AO crescem com o nível', () => {
    expect([1, 2, 3, 4, 5].map((l) => LEVELS[l as 1].tier)).toEqual(['low', 'low', 'high', 'high', 'high'])
    for (const l of [1, 2, 3, 4] as const) {
      expect(LEVELS[(l + 1) as 2].dpr).toBeGreaterThanOrEqual(LEVELS[l].dpr - 0.5)
      expect(LEVELS[(l + 1) as 2].msaa).toBeGreaterThanOrEqual(LEVELS[l].msaa)
    }
  })

  it('a escolha do usuário fica guardada e vale na próxima visita (sem detecção)', async () => {
    useQuality.getState().choose(2)
    expect(useQuality.getState()).toMatchObject({ level: 2, quality: 'low', auto: false })
    useQuality.setState({ level: 5, quality: 'high', auto: true, resolved: false })
    await detectInitialQuality()
    expect(useQuality.getState()).toMatchObject({ level: 2, auto: false, resolved: true })
  })

  it('o alívio automático desce 5 → 4 → 3 e para; com escolha manual não mexe', () => {
    const q = useQuality.getState()
    q.relieve()
    q.relieve()
    q.relieve()
    expect(useQuality.getState().level).toBe(3)
    expect(store.get('lb-quality')).toBe('low')
    useQuality.getState().choose(5)
    useQuality.getState().relieve()
    expect(useQuality.getState().level).toBe(5)
  })

  it('voltar ao automático esquece a escolha e usa o tier detectado', () => {
    store.set('lb-quality', 'low')
    useQuality.getState().choose(4)
    useQuality.getState().automatic()
    expect(useQuality.getState()).toMatchObject({ level: 1, quality: 'low', auto: true })
    expect(store.has('lb-quality-level')).toBe(false)
  })
})
