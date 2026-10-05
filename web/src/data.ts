import type { CatalogEntry, Difficulty, Question, Subject } from './types'

const BASE = import.meta.env.BASE_URL

export interface Domain {
  name: string
  skills: string[]
}

/** College Board's official order of domains and skills. */
export const RW_DOMAINS: Domain[] = [
  { name: 'Information and Ideas', skills: ['Central Ideas and Details', 'Command of Evidence', 'Inferences'] },
  { name: 'Craft and Structure', skills: ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'] },
  { name: 'Expression of Ideas', skills: ['Rhetorical Synthesis', 'Transitions'] },
  { name: 'Standard English Conventions', skills: ['Boundaries', 'Form, Structure, and Sense'] },
]

export const MATH_DOMAINS: Domain[] = [
  {
    name: 'Algebra',
    skills: [
      'Linear equations in one variable',
      'Linear functions',
      'Linear equations in two variables',
      'Systems of two linear equations in two variables',
      'Linear inequalities in one or two variables',
    ],
  },
  {
    name: 'Advanced Math',
    skills: ['Nonlinear functions', 'Nonlinear equations in one variable and systems of equations in two variables', 'Equivalent expressions'],
  },
  {
    name: 'Problem-Solving and Data Analysis',
    skills: [
      'Ratios, rates, proportional relationships, and units',
      'Percentages',
      'One-variable data: Distributions and measures of center and spread',
      'Two-variable data: Models and scatterplots',
      'Probability and conditional probability',
      'Inference from sample statistics and margin of error',
      'Evaluating statistical claims: Observational studies and experiments',
    ],
  },
  { name: 'Geometry and Trigonometry', skills: ['Area and volume', 'Lines, angles, and triangles', 'Right triangles and trigonometry', 'Circles'] },
]

export const SUBJECTS: Record<Subject, { name: string; short: string; domains: Domain[]; data: string; total: number }> = {
  rw: { name: 'Reading and Writing', short: 'Reading and Writing', domains: RW_DOMAINS, data: 'data/', total: 753 },
  math: { name: 'Math', short: 'Math', domains: MATH_DOMAINS, data: 'data/math/', total: 995 },
}

/** Reading and Writing lives at #/…, Math at #/math/… */
export const subjectPath = (subject: Subject, path: string) => (subject === 'math' ? `/math${path === '/' ? '' : path}` : path)

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

// keep in sync with slug() in scripts/prepare-data.mjs
export const skillSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const skillBySlug = (subject: Subject, slug: string) => SUBJECTS[subject].domains.flatMap((d) => d.skills).find((s) => skillSlug(s) === slug)

const catalogs = new Map<Subject, Promise<CatalogEntry[]>>()
export function loadCatalog(subject: Subject): Promise<CatalogEntry[]> {
  let p = catalogs.get(subject)
  if (!p) {
    p = fetch(`${BASE}${SUBJECTS[subject].data}catalog.json`).then((r) => {
      if (!r.ok) throw new Error(`catalog: ${r.status}`)
      return r.json()
    })
    catalogs.set(subject, p)
  }
  return p
}

const skills = new Map<string, Promise<Question[]>>()
export function loadSkill(subject: Subject, slug: string): Promise<Question[]> {
  const key = `${subject}/${slug}`
  let p = skills.get(key)
  if (!p) {
    p = fetch(`${BASE}${SUBJECTS[subject].data}skills/${slug}.json`).then((r) => {
      if (!r.ok) throw new Error(`skill ${slug}: ${r.status}`)
      return r.json()
    })
    skills.set(key, p)
  }
  return p
}

export const figureUrl = (src: string) => `${BASE}data/${src}`
