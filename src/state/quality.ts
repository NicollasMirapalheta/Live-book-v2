import { create } from 'zustand'

export type Quality = 'high' | 'low'

interface QualityState {
  quality: Quality
  /** true when forced by ?quality=, so automatic detection must not override it */
  forced: boolean
  setQuality: (q: Quality) => void
}

const forcedParam = new URLSearchParams(window.location.search).get('quality')
const forced = forcedParam === 'high' || forcedParam === 'low'

export const useQuality = create<QualityState>((set, get) => ({
  quality: forced ? (forcedParam as Quality) : 'high',
  forced,
  setQuality: (q) => {
    if (!get().forced) set({ quality: q })
  },
}))

/** Initial tier from detect-gpu (tier 0–1 or mobile → low). Ignored when ?quality= is set. */
export async function detectInitialQuality(): Promise<void> {
  if (forced) return
  try {
    const { getGPUTier } = await import('detect-gpu')
    const gpu = await getGPUTier()
    useQuality.getState().setQuality(gpu.tier <= 1 || gpu.isMobile ? 'low' : 'high')
  } catch {
    // Keep the default tier when detection fails (offline benchmark data, etc.).
  }
}
