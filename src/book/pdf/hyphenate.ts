// Portuguese hyphenation by syllable rules (spec Fase 5): the book's own line breaking can hyphenate, so
// justified lines stay even. Conservative: it never splits two vowels (hiatus is ambiguous without a
// dictionary), keeps the inseparable clusters and digraphs together, and leaves at least 2 letters before
// and 3 after a break.

const VOWELS = new Set('aeiouáéíóúâêôãõàüy')
/** consonant + l/r that start a syllable together (pra, bla, tre, cli…) */
const CLUSTER = /^[bcdfgkptv][lr]$/
/** digraphs that are one sound, and qu/gu before a vowel (the u is not a vowel there): never split */
const DIGRAPH = new Set(['ch', 'lh', 'nh', 'qu', 'gu'])

export const MIN_BEFORE = 2
export const MIN_AFTER = 3
export const MIN_WORD = 6

/** Break positions (indices into `word`) where a hyphen may go. */
export function hyphenPoints(word: string): number[] {
  // only plain words: no digits, no existing hyphens, no apostrophes
  const m = /^([^a-zà-ÿ]*)([a-zà-ÿ]+)([^a-zà-ÿ]*)$/i.exec(word)
  if (!m) return []
  const [, lead, core] = m
  const w = core.toLowerCase()
  // short words are never broken ("to-dos" reads worse than a slightly loose line)
  if (w.length < MIN_WORD) return []
  // u after q/g before a vowel is part of the consonant (que, gui, quando)
  const vowel = (i: number) => VOWELS.has(w[i]) && !(w[i] === 'u' && i > 0 && (w[i - 1] === 'q' || w[i - 1] === 'g') && i + 1 < w.length && VOWELS.has(w[i + 1]))
  const points: number[] = []
  let i = 0
  while (i < w.length) {
    if (!vowel(i)) {
      i++
      continue
    }
    // skip the vowel run (never split vowels)
    let j = i
    while (j < w.length && vowel(j)) j++
    // the consonant run that follows
    let k = j
    while (k < w.length && !vowel(k)) k++
    if (k >= w.length) break // no vowel after: the word ends in consonants
    const run = w.slice(j, k)
    let cut: number
    if (run.length === 1) cut = j // V-CV
    else {
      const last2 = run.slice(-2)
      // V-CCV for an inseparable cluster or digraph at the end of the run, else split before the last consonant
      cut = CLUSTER.test(last2) || DIGRAPH.has(last2) ? k - 2 : k - 1
    }
    points.push(cut)
    i = k
  }
  return points.filter((p) => p >= MIN_BEFORE && w.length - p >= MIN_AFTER).map((p) => p + lead.length)
}

/** The word with its break points shown, for tests: "ca-mi-nho". */
export function syllabify(word: string) {
  const pts = hyphenPoints(word)
  let out = ''
  let prev = 0
  for (const p of pts) {
    out += `${word.slice(prev, p)}-`
    prev = p
  }
  return out + word.slice(prev)
}
