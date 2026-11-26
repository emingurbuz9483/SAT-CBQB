import { useSyncExternalStore } from 'react'

/**
 * Highlights and notes on a question's passage and stem, like Bluebook's annotation tool.
 *
 * A highlight is stored as a span of "units" inside one region of the question (the passage or the stem): each
 * character of text is one unit and each inline math image (<span class="m">) is one unit. Offsets are counted on
 * the question's original HTML, so they stay valid however the highlights themselves are drawn.
 */
export type HlStyle = 'yellow' | 'blue' | 'pink' | 'solid' | 'dashed' | 'dotted'
export const HL_COLORS: HlStyle[] = ['yellow', 'blue', 'pink']
export const HL_LINES: HlStyle[] = ['solid', 'dashed', 'dotted']

export interface Highlight {
  id: string
  region: string
  start: number
  end: number
  style: HlStyle
  note?: string
}

// Kept for the browser tab's session: a Mockup Test or a practice set keeps its highlights when you move between
// questions or refresh, and a question met again another day starts clean.
const KEY = 'cbqb-highlights-v1'
const EMPTY: Highlight[] = []
const listeners = new Set<() => void>()

let state: Record<string, Highlight[]> = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
})()

function set(qid: string, list: Highlight[]) {
  state = { ...state, [qid]: list }
  if (!list.length) delete state[qid]
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: highlights still work until the page is closed
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useHighlights(qid: string): Highlight[] {
  return useSyncExternalStore(subscribe, () => state[qid] ?? EMPTY)
}

const newId = () => Math.random().toString(36).slice(2, 10)

/**
 * Highlight [start, end) in a region. A selection inside an existing highlight restyles that highlight; otherwise
 * the new one replaces whatever parts of other highlights it covers. Returns the id of the highlight.
 */
export function addHighlight(qid: string, region: string, start: number, end: number, style: HlStyle): string {
  const list = state[qid] ?? EMPTY
  const inside = list.find((h) => h.region === region && h.start <= start && end <= h.end)
  if (inside) {
    set(
      qid,
      list.map((h) => (h === inside ? { ...h, style } : h)),
    )
    return inside.id
  }
  const next: Highlight[] = []
  for (const h of list) {
    if (h.region !== region || h.end <= start || h.start >= end) next.push(h)
    else if (h.start < start) next.push({ ...h, end: start })
    else if (h.end > end) next.push({ ...h, start: end })
    // fully covered: dropped
  }
  const id = newId()
  next.push({ id, region, start, end, style })
  set(qid, next)
  return id
}

export function updateHighlight(qid: string, id: string, patch: Partial<Pick<Highlight, 'style' | 'note'>>) {
  set(
    qid,
    (state[qid] ?? EMPTY).map((h) => (h.id === id ? { ...h, ...patch } : h)),
  )
}

export function removeHighlight(qid: string, id: string) {
  set(
    qid,
    (state[qid] ?? EMPTY).filter((h) => h.id !== id),
  )
}

// ---------------------------------------------------------------- DOM: offsets <-> nodes

type Unit = Text | HTMLElement

/** The text nodes and inline math images of a region, in reading order. */
function units(root: Node): Unit[] {
  const out: Unit[] = []
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c instanceof Text) {
        if (c.length) out.push(c)
      } else if (c instanceof HTMLElement) {
        if (c.classList.contains('m')) out.push(c)
        else walk(c)
      }
    }
  }
  walk(root)
  return out
}

const size = (u: Unit) => (u instanceof Text ? u.length : 1)

export const unitCount = (root: Node) => units(root).reduce((a, u) => a + size(u), 0)

const WORD = /[\p{L}\p{N}'’]/u

/** Widen [start, end) to whole words and drop spaces at either end, so a slightly-off drag still marks clean words. */
export function snapToWords(root: Node, start: number, end: number): [number, number] {
  const text = units(root)
    .map((u) => (u instanceof Text ? u.data : '￼')) // a math image counts as one word-like unit
    .join('')
  const word = (i: number) => i >= 0 && i < text.length && (WORD.test(text[i]) || text[i] === '￼')
  while (start > 0 && word(start - 1) && word(start)) start--
  while (end < text.length && word(end - 1) && word(end)) end++
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  return [start, end]
}

/** How many units of `root` come before the point (node, offset), e.g. one end of the user's selection. */
export function unitsBefore(root: Node, node: Node, offset: number): number {
  const point = document.createRange()
  point.setStart(node, offset)
  let n = 0
  for (const u of units(root)) {
    if (u === node) return n + (u instanceof Text ? offset : offset > 0 ? 1 : 0)
    if (point.comparePoint(u, 0) !== -1) break // this unit starts at or after the point
    n += size(u)
  }
  return n
}

/** Redraw a region's highlights as <mark class="hl"> elements around its text and math. */
export function paint(root: HTMLElement, list: Highlight[]) {
  root.querySelectorAll('mark.hl').forEach((m) => m.replaceWith(...m.childNodes))
  root.normalize() // merge the text the old marks split, so offsets count from the original HTML again
  for (const h of list) {
    const pieces: Node[] = []
    let p = 0
    for (const u of units(root)) {
      const len = size(u)
      const a = Math.max(h.start, p)
      const b = Math.min(h.end, p + len)
      if (a < b) {
        if (u instanceof Text) {
          let t = u
          if (a > p) t = t.splitText(a - p)
          if (b < p + len) t.splitText(b - a)
          pieces.push(t)
        } else pieces.push(u)
      }
      p += len
      if (p >= h.end) break
    }
    pieces.forEach((node, i) => {
      const m = document.createElement('mark')
      m.className = `hl hl-${h.style}${h.note ? ' has-note' : ''}${i === pieces.length - 1 ? ' hl-end' : ''}`
      m.dataset.hl = h.id
      node.parentNode!.insertBefore(m, node)
      m.appendChild(node)
    })
  }
}

/** True while the user is typing (a grid-in answer, a note), so letter and Enter shortcuts should stay out of the way. */
export const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
