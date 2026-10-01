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
  | { type: 'p'; html: string }
  | { type: 'label'; html: string }
  | { type: 'quote'; html?: string; indent?: number; lines?: { html: string; indent?: number }[] }
  | { type: 'list'; items: string[] }
  | { type: 'table'; caption?: string; rows: Cell[][] }
  | { type: 'figure'; src: string; width: number; height: number; alt: string }

export interface Question {
  id: string
  test: string
  domain: string
  skill: string
  difficulty: Difficulty
  stimulus: Block[]
  stem: string
  choices: { letter: Letter; html: string }[]
  answer: Letter
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
