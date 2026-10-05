export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type Letter = 'A' | 'B' | 'C' | 'D'

export interface Cell {
  html: string
  header?: boolean
  align?: 'center' | 'right'
  colspan?: number
  rowspan?: number
}

export type Block =
  | { type: 'p'; html: string; center?: boolean }
  | { type: 'label'; html: string }
  | { type: 'quote'; html?: string; indent?: number; lines?: { html: string; indent?: number }[] }
  | { type: 'list'; items: string[] }
  | { type: 'table'; caption?: string; rows: Cell[][] }
  | { type: 'figure'; src: string; width: number; height: number; alt: string }

export type Subject = 'rw' | 'math'

export interface Question {
  id: string
  test: string
  domain: string
  skill: string
  difficulty: Difficulty
  stimulus: Block[]
  stem: string
  /** mcq: pick A–D; spr: student-produced response (Math grid-in), checked against `answers` */
  type?: 'mcq' | 'spr'
  choices: { letter: Letter; html: string }[]
  answer: Letter | ''
  answers?: string[]
  rationale: { paragraphs: string[]; byChoice: Partial<Record<Letter, string>> }
  source: { pdfPages: number[] }
  notes?: string[]
}

export interface CatalogEntry {
  id: string
  domain: string
  skill: string
  difficulty: Difficulty
}
