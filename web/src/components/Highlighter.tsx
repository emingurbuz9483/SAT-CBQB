import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  HL_COLORS,
  HL_LINES,
  addHighlight,
  paint,
  removeHighlight,
  snapToWords,
  unitCount,
  unitsBefore,
  updateHighlight,
  useHighlights,
  type HlStyle,
} from '../highlights'
import { NoteIcon, TrashIcon } from './Icons'
import { NoteEditor, Toolbar } from './HighlightToolbar'

/** What the toolbar is attached to: text the user just selected, or a highlight they clicked. */
type Active =
  | { kind: 'selection'; region: string; start: number; end: number; range: Range; note?: boolean }
  | { kind: 'mark'; id: string; note?: boolean }

const STYLE_LABEL: Record<HlStyle, string> = {
  yellow: 'Yellow highlight',
  blue: 'Blue highlight',
  pink: 'Pink highlight',
  solid: 'Solid underline',
  dashed: 'Dashed underline',
  dotted: 'Dotted underline',
}

/**
 * Bluebook-style highlighting for one question. Spread `region(name)` as the ref of each highlightable element
 * (the passage, the stem) and render `toolbar` once.
 */
export function useHighlighter(qid: string): { region: (name: string) => (el: HTMLElement | null) => void; toolbar: ReactNode } {
  const list = useHighlights(qid)
  const regions = useRef(new Map<string, HTMLElement>())
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const [active, setActive] = useState<Active | null>(null)
  const mouseDown = useRef(false)

  const region = useCallback((name: string) => {
    let r = refs.current.get(name)
    if (!r) {
      r = (el: HTMLElement | null) => {
        if (el) regions.current.set(name, el)
        else regions.current.delete(name)
      }
      refs.current.set(name, r)
    }
    return r
  }, [])

  // draw the highlights whenever they change (and when the question first appears)
  useLayoutEffect(() => {
    for (const [name, el] of regions.current)
      paint(
        el,
        list.filter((h) => h.region === name),
      )
  }, [list])

  // a highlight that was deleted (or merged into another) closes its toolbar
  const shown = active?.kind === 'mark' && !list.some((h) => h.id === active.id) ? null : active

  // selecting text in the passage or stem opens the toolbar; clicking a highlight opens it for that highlight
  useEffect(() => {
    const regionOf = (node: Node) => [...regions.current].find(([, el]) => el.contains(node))
    let timer = 0
    const fromSelection = () => {
      const sel = getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setActive((a) => (a?.kind === 'selection' ? null : a))
        return
      }
      const range = sel.getRangeAt(0)
      const found = regionOf(range.startContainer)
      if (!found) {
        setActive((a) => (a?.kind === 'selection' ? null : a))
        return
      }
      const [name, root] = found
      // a selection that runs past the region (e.g. from the passage into the question) stops at its end
      const [start, end] = snapToWords(
        root,
        unitsBefore(root, range.startContainer, range.startOffset),
        root.contains(range.endContainer) ? unitsBefore(root, range.endContainer, range.endOffset) : unitCount(root),
      )
      if (end <= start) return
      setActive({ kind: 'selection', region: name, start, end, range: range.cloneRange() })
    }
    const onSelectionChange = () => {
      window.clearTimeout(timer)
      if (!mouseDown.current) timer = window.setTimeout(fromSelection, 150) // wait until the drag (or a touch handle) settles
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 0 && !(e.target as Element).closest?.('.hl-toolbar')) mouseDown.current = true
    }
    const onUp = () => {
      if (!mouseDown.current) return
      mouseDown.current = false
      window.clearTimeout(timer)
      timer = window.setTimeout(fromSelection, 0)
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest?.('.hl-toolbar')) return
      if (!getSelection()?.isCollapsed) return // the end of a drag that selected text
      const mark = t.closest?.('mark.hl') as HTMLElement | null
      if (mark?.dataset.hl && regionOf(mark)) setActive({ kind: 'mark', id: mark.dataset.hl })
      else setActive((a) => (a?.kind === 'mark' ? null : a))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setActive(null)
      getSelection()?.removeAllRanges()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const anchorRect = (): DOMRect | null => {
    if (!shown) return null
    if (shown.kind === 'selection') return shown.range.getBoundingClientRect()
    const rects = [...regions.current.values()].flatMap((el) => [...el.querySelectorAll(`mark[data-hl="${shown.id}"]`)].map((m) => m.getBoundingClientRect()))
    if (!rects.length) return null
    const left = Math.min(...rects.map((r) => r.left))
    const top = Math.min(...rects.map((r) => r.top))
    return new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top)
  }

  // turn the selection into a highlight (or restyle the clicked one), then keep the toolbar on it
  const apply = (style: HlStyle, note = false) => {
    if (!shown) return
    if (shown.kind === 'mark') {
      updateHighlight(qid, shown.id, { style })
      if (note) setActive({ ...shown, note: true })
      return
    }
    const id = addHighlight(qid, shown.region, shown.start, shown.end, style)
    getSelection()?.removeAllRanges()
    setActive({ kind: 'mark', id, note })
  }

  const current = shown?.kind === 'mark' ? list.find((h) => h.id === shown.id) : undefined

  const toolbar = shown && (
    <Toolbar key={shown.kind === 'mark' ? shown.id : `${shown.region}-${shown.start}-${shown.end}`} anchor={anchorRect}>
      <div className="hl-row">
        {HL_COLORS.map((s) => (
          <button key={s} type="button" className={`hl-swatch hl-swatch-${s} ${current?.style === s ? 'on' : ''}`} aria-label={STYLE_LABEL[s]} aria-pressed={current?.style === s} title={STYLE_LABEL[s]} onClick={() => apply(s)} />
        ))}
        <span className="hl-sep" />
        {HL_LINES.map((s) => (
          <button key={s} type="button" className={`hl-tool hl-line-btn ${current?.style === s ? 'on' : ''}`} aria-label={STYLE_LABEL[s]} aria-pressed={current?.style === s} title={STYLE_LABEL[s]} onClick={() => apply(s)}>
            <span className={`hl-line-sample hl-line-${s}`}>U</span>
          </button>
        ))}
        <span className="hl-sep" />
        <button
          type="button"
          className={`hl-tool ${shown.note || current?.note ? 'on' : ''}`}
          aria-label={current?.note ? 'Edit note' : 'Add a note'}
          title={current?.note ? 'Edit note' : 'Add a note'}
          onClick={() => (current ? setActive({ kind: 'mark', id: current.id, note: true }) : apply('yellow', true))}
        >
          <NoteIcon />
        </button>
        {current && (
          <button
            type="button"
            className="hl-tool hl-delete"
            aria-label="Delete highlight"
            title="Delete highlight"
            onClick={() => {
              removeHighlight(qid, current.id)
              setActive(null)
            }}
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {current && (shown.note || current.note) && <NoteEditor key={current.id} value={current.note ?? ''} autoFocus={!!shown.note} onChange={(note) => updateHighlight(qid, current.id, { note: note || undefined })} onDone={() => setActive(null)} />}
    </Toolbar>
  )

  return { region, toolbar }
}
