import type { CatalogEntry, Difficulty, Subject } from './types'
import type { Progress } from './progress'
import { SUBJECTS } from './data'
import { shuffle } from './session'

export const DRILL_MINUTES = [5, 10, 20] as const
export type DrillMinutes = (typeof DRILL_MINUTES)[number]

/** More questions than anyone answers in 20 minutes; the drill ends on the clock, not on the list. */
const DRILL_LENGTH = 240

/**
 * A drill's question order. Skills come round-robin, each round in a new random order, so every skill shows up
 * equally often and the same skill never comes twice in a row. Within a skill the difficulty is picked at random,
 * then a question the student hasn't answered yet (falling back to answered ones once a skill runs out).
 */
export function buildDrill(subject: Subject, catalog: CatalogEntry[], progress: Progress): string[] {
  const skills = SUBJECTS[subject].domains.flatMap((d) => d.skills).filter((s) => catalog.some((e) => e.skill === s))
  const pools = new Map<string, { fresh: CatalogEntry[]; used: CatalogEntry[] }>()
  for (const s of skills) {
    const inSkill = shuffle(catalog.filter((e) => e.skill === s))
    pools.set(s, { fresh: inSkill.filter((e) => !progress[e.id]), used: inSkill.filter((e) => progress[e.id]) })
  }
  const take = (skill: string): string | null => {
    const p = pools.get(skill)!
    for (const list of [p.fresh, p.used]) {
      if (!list.length) continue
      const diffs = [...new Set(list.map((e) => e.difficulty))] as Difficulty[]
      const d = diffs[Math.floor(Math.random() * diffs.length)]
      return list.splice(list.findIndex((x) => x.difficulty === d), 1)[0].id
    }
    return null
  }

  const ids: string[] = []
  let last = ''
  while (ids.length < DRILL_LENGTH) {
    const round = shuffle(skills)
    if (round.length > 1 && round[0] === last) round.push(round.shift()!)
    let added = 0
    for (const s of round) {
      const id = take(s)
      if (!id) continue
      ids.push(id)
      last = s
      added++
    }
    if (!added) break // the whole bank is in the drill
  }
  return ids.slice(0, DRILL_LENGTH)
}

/** A drill in progress or finished, kept in localStorage so a refresh doesn't lose it. */
export interface DrillState {
  minutes: DrillMinutes
  ids: string[]
  idx: number // the question on screen; everything before it has been answered or skipped
  answers: Record<string, string> // a letter, or the typed entry for a Math grid-in
  secs: Record<string, number> // time spent on each question
  deadline: number // epoch ms
  finishedAt?: number
}

const key = (subject: Subject) => (subject === 'math' ? 'cbqb-drill-math-v1' : 'cbqb-drill-v1')

export function loadDrill(subject: Subject): DrillState | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(subject)) ?? 'null') as DrillState | null
    return s && Array.isArray(s.ids) ? s : null
  } catch {
    return null
  }
}

export function saveDrill(subject: Subject, s: DrillState) {
  try {
    localStorage.setItem(key(subject), JSON.stringify(s))
  } catch {
    // storage unavailable: the drill still runs, it just won't survive a refresh
  }
}

/** One finished drill, for Analytics. */
export interface DrillRecord {
  subject: Subject
  at: number // when it finished
  minutes: DrillMinutes
  answered: number
  correct: number
  skipped: number
  seconds: number // time spent on the answered questions
}

const HISTORY = 'cbqb-drill-history-v1'

export function loadDrillHistory(): DrillRecord[] {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY) ?? '[]')
    return Array.isArray(h) ? h : []
  } catch {
    return []
  }
}

export function addDrillRecord(r: DrillRecord) {
  try {
    localStorage.setItem(HISTORY, JSON.stringify([...loadDrillHistory(), r]))
  } catch {
    // ignore
  }
}

/** The answered, correct and skipped questions of a drill, and the time spent on the answered ones. */
export function drillTotals(s: DrillState, isRight: (id: string) => boolean) {
  const seen = s.ids.slice(0, s.idx)
  const answered = seen.filter((id) => s.answers[id])
  return {
    seen,
    answered: answered.length,
    correct: answered.filter(isRight).length,
    skipped: seen.length - answered.length,
    seconds: answered.reduce((a, id) => a + (s.secs[id] ?? 0), 0),
  }
}
