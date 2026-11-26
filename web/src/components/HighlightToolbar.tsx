import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function NoteEditor({ value, autoFocus, onChange, onDone }: { value: string; autoFocus: boolean; onChange: (v: string) => void; onDone: () => void }) {
  const [text, setText] = useState(value)
  return (
    <div className="hl-note">
      <textarea
        rows={3}
        value={text}
        placeholder="Add a note…"
        aria-label="Note"
        autoFocus={autoFocus}
        maxLength={1000}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value.trim() ? e.target.value : '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone()
        }}
      />
      <button type="button" className="btn primary small" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

/** A floating panel under its anchor (above it when there's no room below) that follows scrolling. */
export function Toolbar({ anchor, children }: { anchor: () => DOMRect | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current
      const r = anchor()
      if (!el) return
      if (!r || (r.width === 0 && r.height === 0)) {
        el.style.visibility = 'hidden'
        return
      }
      const w = el.offsetWidth
      const h = el.offsetHeight
      const gap = 10
      const bottomBar = 88 // the fixed Check / Next bar
      let top = r.bottom + gap
      if (top + h > window.innerHeight - bottomBar && r.top - gap - h > 8) top = r.top - gap - h
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8)
      el.style.top = `${top}px`
      el.style.left = `${left}px`
      el.style.visibility = 'visible'
    }
    place()
    // re-place after every render too: the toolbar grows when the note box opens, and highlights get redrawn
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  })

  return createPortal(
    <div
      ref={ref}
      className="hl-toolbar"
      role="toolbar"
      aria-label="Highlight and notes"
      style={{ visibility: 'hidden' }}
      // keep the text selection alive while a button is pressed (the note box still takes focus)
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault()
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
