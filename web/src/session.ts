import type { Difficulty, Subject } from './types'
import { DIFFICULTIES, skillBySlug } from './data'
import type { Progress } from './progress'

export type Mode = 'new' | 'mistakes' | 'all'
export interface SessionConfig {
  skills: string[] // slugs
  difficulties: Difficulty[]
  mode: Mode
  size: number
  ids?: string[] // explicit question list (shared links); overrides filters
}
export type Result = 'correct' | 'incorrect' | 'skipped' | null

export function configFromParams(subject: Subject, p: URLSearchParams): SessionConfig {
  const d = (p.get('d') ?? 'EMH').split('').map((c) => DIFFICULTIES.find((x) => x[0] === c)).filter(Boolean) as Difficulty[]
  const mode = (['new', 'mistakes', 'all'] as const).find((m) => m === p.get('m')) ?? 'all'
  return {
    skills: (p.get('s') ?? '').split(',').filter((s) => skillBySlug(subject, s)),
    difficulties: d.length ? d : DIFFICULTIES,
    mode,
    size: Math.min(50, Math.max(1, Number(p.get('n')) || 10)),
    ids: p.get('ids')?.split(',').filter(Boolean),
  }
}

export function configToParams(c: SessionConfig): Record<string, string> {
  const p: Record<string, string> = { s: c.skills.join(','), d: c.difficulties.map((x) => x[0]).join(''), m: c.mode, n: String(c.size) }
  if (c.ids?.length) p.ids = c.ids.join(',')
  return p
}

export const inPool = (mode: Mode, id: string, progress: Progress) =>
  mode === 'all' || (mode === 'new' ? !progress[id] : progress[id]?.r === 'i')

export function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
