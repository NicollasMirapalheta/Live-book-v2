let invalidator: (() => void) | null = null
let pending = false

export function setShadowInvalidator(fn: (() => void) | null) {
  invalidator = fn
  // an invalidation that arrived before the lights mounted (props/books placed first) is not lost
  if (fn && pending) {
    pending = false
    fn()
  }
}

/** Re-render the dynamic shadows on the next frame (call after a prop or book moves or hides). */
export function invalidateShadows() {
  if (invalidator) invalidator()
  else pending = true
}
