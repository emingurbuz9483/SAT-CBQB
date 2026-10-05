import type { Question } from './types'

/** A grid-in entry as an exact fraction [numerator, denominator], or null if it isn't a number. */
function parse(s: string): [bigint, bigint] | null {
  const t = s.trim().replace(/[−–]/g, '-').replace(/\s+/g, '')
  const m = /^(-?)(\d*\.?\d*)(?:\/(\d*\.?\d*))?$/.exec(t)
  if (!m || !m[2] || m[2] === '.') return null
  const dec = (x: string): [bigint, bigint] => {
    const [i, f = ''] = x.split('.')
    return [BigInt((i || '0') + f), 10n ** BigInt(f.length)]
  }
  let [n, d] = dec(m[2])
  if (m[3] !== undefined) {
    if (!m[3] || m[3] === '.') return null
    const [n2, d2] = dec(m[3])
    if (n2 === 0n) return null
    ;[n, d] = [n * d2, d * n2]
  }
  return [m[1] ? -n : n, d]
}

const same = (a: [bigint, bigint], b: [bigint, bigint]) => a[0] * b[1] === b[0] * a[1]

/** True when a typed grid-in answer matches one of College Board's accepted answers (any equivalent form). */
export function gridInCorrect(q: Question, typed: string): boolean {
  const v = parse(typed)
  if (!v) return false
  return (q.answers ?? []).some((a) => {
    const w = parse(a)
    return !!w && same(v, w)
  })
}

export const isSpr = (q: Question) => q.type === 'spr'

/** `response` is a letter for multiple choice, the typed entry for a grid-in. */
export const isCorrect = (q: Question, response: string | null | undefined) =>
  !!response && (isSpr(q) ? gridInCorrect(q, response) : response === q.answer)

/** How the right answer is shown to the student. */
export const correctLabel = (q: Question) => (isSpr(q) ? (q.answers ?? []).join(' or ') : q.answer)

/** A grid-in entry is allowed up to 5 characters (6 for a negative answer), as in Bluebook. */
export const GRID_CHARS = /^-?[0-9./]*$/
export const gridMax = (s: string) => (s.startsWith('-') ? 6 : 5)
