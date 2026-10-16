import { create } from 'zustand'

export type Quality = 'high' | 'low'

interface QualityState {
  quality: Quality
  /** true when forced by ?quality=, so automatic detection must not override it */
  forced: boolean
  /** the first tier is decided: the scene loads only then, so one set of models is downloaded and kept */
  resolved: boolean
  /**
   * Relief on a machine that cannot keep up at high (plano de desempenho, Etapa 3), without reloading models:
   * 0 as designed; 1 pixel ratio 1 and MSAA 2×; 2 no MSAA and no ambient occlusion (and the next visit
   * starts at low). Set by AdaptiveQuality.
   */
  relief: 0 | 1 | 2
  relieve: () => void
  setQuality: (q: Quality) => void
}

/** detect-gpu reads its benchmark data from a CDN: a slow network must not hold the room back. */
const DETECT_TIMEOUT_MS = 1500
const STORAGE_KEY = 'lb-quality'

const forcedParam = new URLSearchParams(window.location.search).get('quality')
const forced = forcedParam === 'high' || forcedParam === 'low'

export const useQuality = create<QualityState>((set, get) => ({
  quality: forced ? (forcedParam as Quality) : 'high',
  forced,
  resolved: forced,
  relief: 0,
  relieve: () => {
    const next = Math.min(2, get().relief + 1) as 0 | 1 | 2
    set({ relief: next })
    if (next === 2 && !get().forced) {
      try {
        localStorage.setItem(STORAGE_KEY, 'low')
      } catch {
        // private mode: nothing to remember
      }
    }
  },
  setQuality: (q) => {
    if (!get().forced) set({ quality: q })
  },
}))


function stored(): Quality | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'high' || v === 'low' ? v : null
  } catch {
    return null
  }
}

/** Without the GPU benchmark: few cores or little memory reads as a modest machine. */
function guess(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 ? 'low' : 'high'
}

/**
 * Initial tier (spec Fase 0 §tiers): detect-gpu (tier 0–1 or mobile → low), remembered in this browser so the
 * next visits start right away; on timeout or failure, a guess from the CPU and memory. Ignored with ?quality=.
 */
export async function detectInitialQuality(): Promise<void> {
  if (forced) return
  const set = (q: Quality) => useQuality.setState({ quality: q, resolved: true })
  const known = stored()
  if (known) return set(known)
  try {
    const { getGPUTier } = await import('detect-gpu')
    const gpu = await Promise.race([
      getGPUTier(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DETECT_TIMEOUT_MS)),
    ])
    if (!gpu) return set(guess())
    const q: Quality = gpu.tier <= 1 || gpu.isMobile ? 'low' : 'high'
    try {
      localStorage.setItem(STORAGE_KEY, q)
    } catch {
      // private mode: detect again next time
    }
    set(q)
  } catch {
    set(guess())
  }
}
