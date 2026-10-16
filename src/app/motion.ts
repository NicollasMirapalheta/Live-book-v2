// "Reduce motion" (system setting), read every frame by the book animations: one MediaQueryList for the
// page instead of a matchMedia() call per book per frame (plano de desempenho, Etapa 3).
const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined

export const reducedMotion = (): boolean => query?.matches ?? false
