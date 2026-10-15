let invalidator: (() => void) | null = null

export function setShadowInvalidator(fn: (() => void) | null) {
  invalidator = fn
}

/** Re-render the dynamic shadows on the next frame (call after a prop or book moves). */
export function invalidateShadows() {
  invalidator?.()
}
