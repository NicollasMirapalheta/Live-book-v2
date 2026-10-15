// URL parameters (spec Fase 0 §6): ?node= ?yaw= ?pitch= ?fov= ?shot=1 ?e2e=1 ?dev=book ?quality=
const search = new URLSearchParams(window.location.search)

function num(name: string): number | undefined {
  const raw = search.get(name)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export const params = {
  node: search.get('node') ?? undefined,
  yaw: num('yaw'),
  pitch: num('pitch'),
  fov: num('fov'),
  /** hides UI, freezes dust at a fixed time */
  shot: search.get('shot') === '1',
  /** exposes window.__NAV__ even in production builds */
  e2e: search.get('e2e') === '1',
  dev: search.get('dev') ?? undefined,
  /** approval frame: N0 rendered at the reference aspect */
  approval: search.get('approval') === '1',
  /** look-dev views: 'lightmap' shows only the decoded lightmaps (white albedo) */
  debug: search.get('debug') ?? undefined,
  /** book screenshot preset (0..2) for ?dev=book&shot=1 */
  preset: num('preset'),
}
