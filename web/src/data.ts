import type { CatalogEntry, Difficulty, Question } from './types'

const BASE = import.meta.env.BASE_URL

/** College Board's official order of domains and skills. */
export const DOMAINS: { name: string; skills: string[] }[] = [
  { name: 'Information and Ideas', skills: ['Central Ideas and Details', 'Command of Evidence', 'Inferences'] },
  { name: 'Craft and Structure', skills: ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'] },
  { name: 'Expression of Ideas', skills: ['Rhetorical Synthesis', 'Transitions'] },
  { name: 'Standard English Conventions', skills: ['Boundaries', 'Form, Structure, and Sense'] },
]

export const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

// keep in sync with slug() in scripts/prepare-data.mjs
export const skillSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const skillBySlug = (slug: string) => DOMAINS.flatMap((d) => d.skills).find((s) => skillSlug(s) === slug)

let catalog: Promise<CatalogEntry[]> | null = null
export function loadCatalog(): Promise<CatalogEntry[]> {
  catalog ??= fetch(`${BASE}data/catalog.json`).then((r) => {
    if (!r.ok) throw new Error(`catalog: ${r.status}`)
    return r.json()
  })
  return catalog
}

const skills = new Map<string, Promise<Question[]>>()
export function loadSkill(slug: string): Promise<Question[]> {
  let p = skills.get(slug)
  if (!p) {
    p = fetch(`${BASE}data/skills/${slug}.json`).then((r) => {
      if (!r.ok) throw new Error(`skill ${slug}: ${r.status}`)
      return r.json()
    })
    skills.set(slug, p)
  }
  return p
}

export const figureUrl = (src: string) => `${BASE}data/${src}`
