import type { CatalogEntry, Difficulty, Subject } from './types'
import type { Progress } from './progress'
import { DIFFICULTIES } from './data'
import { shuffle } from './session'

export type ModuleNo = 1 | 2

/** Module 1 draws from Easy and Medium questions, module 2 from Medium and Hard. */
export const MODULE_DIFFICULTIES: Record<ModuleNo, [Difficulty, Difficulty]> = {
  1: ['Easy', 'Medium'],
  2: ['Medium', 'Hard'],
}

interface MockSpec {
  size: number
  minutes: number
  /** [skills to draw from, how many questions] in the order the module presents them */
  blueprint: [skills: string[], count: number][]
  /** Reading and Writing groups questions by skill; Math mixes skills and orders by difficulty */
  groupBySkill: boolean
}

/**
 * Digital SAT modules. Reading and Writing: 27 questions in 32 minutes; domain shares follow College Board's published
 * ranges (Craft and Structure ≈28%, Information and Ideas ≈26%, Standard English Conventions ≈26%, Expression of Ideas ≈20%).
 * Math: 22 questions in 35 minutes; Algebra ≈35%, Advanced Math ≈35%, Problem-Solving and Data Analysis ≈15%,
 * Geometry and Trigonometry ≈15%.
 */
export const MOCK: Record<Subject, MockSpec> = {
  rw: {
    size: 27,
    minutes: 32,
    groupBySkill: true,
    blueprint: [
      [['Words in Context'], 5],
      [['Text Structure and Purpose'], 2],
      [['Cross-Text Connections'], 1],
      [['Central Ideas and Details'], 2],
      [['Command of Evidence'], 3],
      [['Inferences'], 2],
      [['Boundaries'], 3],
      [['Form, Structure, and Sense'], 4],
      [['Transitions'], 2],
      [['Rhetorical Synthesis'], 3],
    ],
  },
  math: {
    size: 22,
    minutes: 35,
    groupBySkill: false,
    blueprint: [
      [
        [
          'Linear equations in one variable',
          'Linear functions',
          'Linear equations in two variables',
          'Systems of two linear equations in two variables',
          'Linear inequalities in one or two variables',
        ],
        8,
      ],
      [['Nonlinear functions', 'Nonlinear equations in one variable and systems of equations in two variables', 'Equivalent expressions'], 7],
      [
        [
          'Ratios, rates, proportional relationships, and units',
          'Percentages',
          'One-variable data: Distributions and measures of center and spread',
          'Two-variable data: Models and scatterplots',
          'Probability and conditional probability',
          'Inference from sample statistics and margin of error',
          'Evaluating statistical claims: Observational studies and experiments',
        ],
        4,
      ],
      [['Area and volume', 'Lines, angles, and triangles', 'Right triangles and trigonometry', 'Circles'], 3],
    ],
  },
}

export const mockSkills = (subject: Subject) => [...new Set(MOCK[subject].blueprint.flatMap(([s]) => s))]

/**
 * Picks a module's questions from the ones the student hasn't answered yet, about half from each of the
 * module's two difficulties. Only when a group runs out of new questions does it reuse answered ones
 * (counted in `repeats`).
 */
export function buildMock(subject: Subject, catalog: CatalogEntry[], progress: Progress, module: ModuleNo): { ids: string[]; repeats: number } {
  const spec = MOCK[subject]
  const [lo, hi] = MODULE_DIFFICULTIES[module]
  const order = (d: Difficulty) => DIFFICULTIES.indexOf(d)
  const all: CatalogEntry[] = []
  let repeats = 0
  for (const [skills, n] of spec.blueprint) {
    const inGroup = catalog.filter((e) => skills.includes(e.skill) && (e.difficulty === lo || e.difficulty === hi))
    const fresh = (d: Difficulty) => shuffle(inGroup.filter((e) => e.difficulty === d && !progress[e.id]))
    const loPool = fresh(lo)
    const hiPool = fresh(hi)
    // split n between the two difficulties (odd counts go either way), then top up from whichever has more
    const loWant = Math.floor(n / 2) + (n % 2 && Math.random() < 0.5 ? 1 : 0)
    const picked = [...loPool.splice(0, loWant), ...hiPool.splice(0, n - loWant)]
    picked.push(...[...loPool, ...hiPool].slice(0, n - picked.length))
    if (picked.length < n) {
      const used = shuffle(inGroup.filter((e) => progress[e.id]))
      repeats += Math.min(used.length, n - picked.length)
      picked.push(...used.slice(0, n - picked.length))
    }
    if (spec.groupBySkill) picked.sort((a, b) => order(a.difficulty) - order(b.difficulty))
    all.push(...picked)
  }
  // Math: easier questions first, skills mixed, as on test day
  const ids = (spec.groupBySkill ? all : shuffle(all).sort((a, b) => order(a.difficulty) - order(b.difficulty))).map((e) => e.id)
  return { ids, repeats }
}

/** A module in progress or finished, kept in localStorage so a refresh doesn't lose it. */
export interface MockState {
  module: ModuleNo
  ids: string[]
  answers: Record<string, string> // a letter, or the typed entry for a Math grid-in
  marked: string[]
  crossed: Record<string, string[]>
  secs: Record<string, number> // time spent on each question
  idx: number
  deadline: number // epoch ms
  repeats: number
  submittedAt?: number
}

const key = (subject: Subject) => (subject === 'math' ? 'cbqb-mock-math-v1' : 'cbqb-mock-v1')

export function loadMock(subject: Subject): MockState | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(subject)) ?? 'null') as MockState | null
    return s && Array.isArray(s.ids) ? s : null
  } catch {
    return null
  }
}

export function saveMock(subject: Subject, s: MockState) {
  try {
    localStorage.setItem(key(subject), JSON.stringify(s))
  } catch {
    // storage unavailable: the test still runs, it just won't survive a refresh
  }
}

export const timeLabel = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
