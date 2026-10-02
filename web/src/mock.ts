import type { CatalogEntry, Difficulty, Letter } from './types'
import type { Progress } from './progress'
import { DIFFICULTIES } from './data'
import { shuffle } from './session'

export type ModuleNo = 1 | 2

/** One digital SAT Reading and Writing module: 27 questions in 32 minutes. */
export const MOCK_SIZE = 27
export const MOCK_MINUTES = 32

/** Module 1 draws from Easy and Medium questions, module 2 from Medium and Hard. */
export const MODULE_DIFFICULTIES: Record<ModuleNo, [Difficulty, Difficulty]> = {
  1: ['Easy', 'Medium'],
  2: ['Medium', 'Hard'],
}

/**
 * Questions per skill in one module, in the order the test presents them (same-skill questions are grouped,
 * easiest first). Domain shares follow College Board's published ranges: Craft and Structure ≈28% (8),
 * Information and Ideas ≈26% (7), Standard English Conventions ≈26% (7), Expression of Ideas ≈20% (5).
 */
export const BLUEPRINT: [skill: string, count: number][] = [
  ['Words in Context', 5],
  ['Text Structure and Purpose', 2],
  ['Cross-Text Connections', 1],
  ['Central Ideas and Details', 2],
  ['Command of Evidence', 3],
  ['Inferences', 2],
  ['Boundaries', 3],
  ['Form, Structure, and Sense', 4],
  ['Transitions', 2],
  ['Rhetorical Synthesis', 3],
]

/**
 * Picks a module's questions from the ones the student hasn't answered yet, about half from each of the
 * module's two difficulties. Only when a skill runs out of new questions does it reuse answered ones
 * (counted in `repeats`).
 */
export function buildMock(catalog: CatalogEntry[], progress: Progress, module: ModuleNo): { ids: string[]; repeats: number } {
  const [lo, hi] = MODULE_DIFFICULTIES[module]
  const order = (d: Difficulty) => DIFFICULTIES.indexOf(d)
  const ids: string[] = []
  let repeats = 0
  for (const [skill, n] of BLUEPRINT) {
    const inSkill = catalog.filter((e) => e.skill === skill && (e.difficulty === lo || e.difficulty === hi))
    const fresh = (d: Difficulty) => shuffle(inSkill.filter((e) => e.difficulty === d && !progress[e.id]))
    const loPool = fresh(lo)
    const hiPool = fresh(hi)
    // split n between the two difficulties (odd counts go either way), then top up from whichever has more
    const loWant = Math.floor(n / 2) + (n % 2 && Math.random() < 0.5 ? 1 : 0)
    const picked = [...loPool.splice(0, loWant), ...hiPool.splice(0, n - loWant)]
    picked.push(...[...loPool, ...hiPool].slice(0, n - picked.length))
    if (picked.length < n) {
      const used = shuffle(inSkill.filter((e) => progress[e.id]))
      repeats += Math.min(used.length, n - picked.length)
      picked.push(...used.slice(0, n - picked.length))
    }
    picked.sort((a, b) => order(a.difficulty) - order(b.difficulty))
    ids.push(...picked.map((e) => e.id))
  }
  return { ids, repeats }
}

/** A module in progress or finished, kept in localStorage so a refresh doesn't lose it. */
export interface MockState {
  module: ModuleNo
  ids: string[]
  answers: Record<string, Letter>
  marked: string[]
  crossed: Record<string, Letter[]>
  secs: Record<string, number> // time spent on each question
  idx: number
  deadline: number // epoch ms
  repeats: number
  submittedAt?: number
}

const KEY = 'cbqb-mock-v1'

export function loadMock(): MockState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MockState | null
    return s && Array.isArray(s.ids) ? s : null
  } catch {
    return null
  }
}

export function saveMock(s: MockState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: the test still runs, it just won't survive a refresh
  }
}

export const timeLabel = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
