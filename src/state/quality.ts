import { create } from 'zustand'

/** Model and effect tier: the room's textures, real-time shadows, floor reflection, dust. */
export type Quality = 'high' | 'low'

/**
 * Graphics levels (pedido do usuário, 16/10): 1 favours speed, 5 the image. The automatic mode starts at 5
 * (or 1 on a modest GPU) and steps down to 3 when the frame rate cannot keep up; the user can pick a level in
 * the settings (src/ui/AccountUI.tsx), remembered on this device.
 */
export type Level = 1 | 2 | 3 | 4 | 5

export interface LevelSettings {
  tier: Quality
  /** maximum device pixel ratio (reading always uses the screen's, up to 2) */
  dpr: number
  /** composer MSAA samples */
  msaa: number
  /** screen-space ambient occlusion (N8AO) */
  ao: boolean
  label: string
}

export const LEVELS: Record<Level, LevelSettings> = {
  1: { tier: 'low', dpr: 1, msaa: 0, ao: false, label: 'Desempenho máximo' },
  2: { tier: 'low', dpr: 1.5, msaa: 0, ao: false, label: 'Desempenho' },
  3: { tier: 'high', dpr: 1, msaa: 0, ao: false, label: 'Equilibrado' },
  4: { tier: 'high', dpr: 1.5, msaa: 2, ao: true, label: 'Qualidade' },
  5: { tier: 'high', dpr: 2, msaa: 4, ao: true, label: 'Qualidade máxima' },
}

const levelOfTier = (q: Quality): Level => (q === 'high' ? 5 : 1)

interface QualityState {
  level: Level
  /** the level's tier (kept as its own field: most of the scene only cares about it) */
  quality: Quality
  /** automatic: detection, then relief while running; false once the user picked a level */
  auto: boolean
  /** true when forced by ?quality=, so neither detection nor the settings change it */
  forced: boolean
  /** the first level is decided: the scene loads only then, so one set of models is downloaded and kept */
  resolved: boolean
  /** the user's choice in the settings (remembered on this device) */
  choose: (level: Level) => void
  /** back to the automatic level */
  automatic: () => void
  /** one level down when the frame rate cannot keep up (AdaptiveQuality): 5 → 4 → 3, never reloading models */
  relieve: () => void
}

/** detect-gpu reads its benchmark data from a CDN: a slow network must not hold the room back. */
const DETECT_TIMEOUT_MS = 1500
/** the detected tier ('high' | 'low'), for the automatic mode */
const TIER_KEY = 'lb-quality'
/** the level the user picked ('1'..'5') */
const LEVEL_KEY = 'lb-quality-level'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode: nothing to remember
  }
}

const forcedParam = new URLSearchParams(window.location.search).get('quality')
const forced = forcedParam === 'high' || forcedParam === 'low'
const at = (level: Level) => ({ level, quality: LEVELS[level].tier })

export const useQuality = create<QualityState>((set, get) => ({
  ...at(forced ? levelOfTier(forcedParam as Quality) : 5),
  auto: !forced,
  forced,
  resolved: forced,
  choose: (level) => {
    if (get().forced) return
    write(LEVEL_KEY, String(level))
    set({ ...at(level), auto: false })
  },
  automatic: () => {
    if (get().forced) return
    write(LEVEL_KEY, null)
    const tier = read(TIER_KEY)
    set({ ...at(tier === 'low' ? 1 : 5), auto: true })
  },
  relieve: () => {
    const { auto, level } = get()
    if (!auto || level <= 3) return
    const next = (level - 1) as Level
    set(at(next))
    // the bottom of the relief: the next visit starts at the low tier
    if (next === 3) write(TIER_KEY, 'low')
  },
}))

/** Settings of the current level. */
export const useLevel = () => useQuality((s) => LEVELS[s.level])

/** Without the GPU benchmark: few cores or little memory reads as a modest machine. */
function guess(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 ? 'low' : 'high'
}

/**
 * Initial level (spec Fase 0 §tiers): the user's choice when there is one; otherwise detect-gpu (tier 0–1 or
 * mobile → low), remembered in this browser so the next visits start right away; on timeout or failure, a
 * guess from the CPU and memory. Ignored with ?quality=.
 */
export async function detectInitialQuality(): Promise<void> {
  if (forced) return
  const chosen = Number(read(LEVEL_KEY))
  if (chosen >= 1 && chosen <= 5) return useQuality.setState({ ...at(chosen as Level), auto: false, resolved: true })
  const done = (q: Quality) => useQuality.setState({ ...at(levelOfTier(q)), auto: true, resolved: true })
  const known = read(TIER_KEY)
  if (known === 'high' || known === 'low') return done(known)
  try {
    const { getGPUTier } = await import('detect-gpu')
    const gpu = await Promise.race([
      getGPUTier(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DETECT_TIMEOUT_MS)),
    ])
    if (!gpu) return done(guess())
    const q: Quality = gpu.tier <= 1 || gpu.isMobile ? 'low' : 'high'
    write(TIER_KEY, q)
    done(q)
  } catch {
    done(guess())
  }
}
