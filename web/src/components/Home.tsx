import { useEffect, useMemo, useState } from 'react'
import type { CatalogEntry, Difficulty } from '../types'
import { DIFFICULTIES, DOMAINS, loadCatalog, skillSlug } from '../data'
import { accountsEnabled, resetProgress, useAccount, useStorageMode, type Progress } from '../progress'
import { navigate } from '../router'
import { configToParams, inPool, type Mode } from '../session'
import { MOCK_MINUTES, MOCK_SIZE, MODULE_DIFFICULTIES, loadMock, timeLabel, type ModuleNo } from '../mock'

const PREFS = 'cbqb-prefs-v1'
interface Prefs {
  difficulties: Difficulty[]
  mode: Mode
  size: number
}
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null')
    if (p && Array.isArray(p.difficulties)) return p
  } catch {
    // ignore
  }
  return { difficulties: [...DIFFICULTIES], mode: 'new', size: 10 }
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'new', label: 'New', hint: 'Questions you haven’t tried' },
  { id: 'mistakes', label: 'Mistakes', hint: 'Questions you missed last time' },
  { id: 'all', label: 'All', hint: 'Everything' },
]

export function Home({ progress }: { progress: Progress }) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [confirmReset, setConfirmReset] = useState(false)
  const [mockOpenedAt, setMockOpenedAt] = useState<number | null>(null) // when the module picker was opened
  const storage = useStorageMode()
  const { account } = useAccount()

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setError(e.message))
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify(prefs))
    } catch {
      // ignore
    }
  }, [prefs])

  const stats = useMemo(() => {
    const m = new Map<string, { total: Record<Difficulty, number>; pool: number; done: number; correct: number }>()
    for (const e of catalog ?? []) {
      let s = m.get(e.skill)
      if (!s) m.set(e.skill, (s = { total: { Easy: 0, Medium: 0, Hard: 0 }, pool: 0, done: 0, correct: 0 }))
      s.total[e.difficulty]++
      if (progress[e.id]) s.done++
      if (progress[e.id]?.r === 'c') s.correct++
      if (prefs.difficulties.includes(e.difficulty) && inPool(prefs.mode, e.id, progress)) s.pool++
    }
    return m
  }, [catalog, progress, prefs])

  // count only questions still in the bank (progress may hold ids that were removed)
  let answered = 0
  let correct = 0
  for (const s of stats.values()) {
    answered += s.done
    correct += s.correct
  }

  const start = (skills: string[]) =>
    navigate('/practice', configToParams({ skills: skills.map(skillSlug), difficulties: prefs.difficulties, mode: prefs.mode, size: prefs.size }))

  const toggleDiff = (d: Difficulty) =>
    setPrefs((p) => {
      const has = p.difficulties.includes(d)
      if (has && p.difficulties.length === 1) return p
      return { ...p, difficulties: DIFFICULTIES.filter((x) => (x === d ? !has : p.difficulties.includes(x))) }
    })

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">SAT Reading and Writing</p>
          <h1>Practice with the official College Board question bank</h1>
          <p className="hero-sub">
            {catalog ? catalog.length.toLocaleString('en-US') : '753'} real questions, sorted by skill and difficulty. Pick an answer, press Check, and see why every
            choice is right or wrong.
          </p>
          {answered > 0 && (
            <div className="hero-stats">
              <div>
                <strong>{answered}</strong>
                <span>answered</span>
              </div>
              <div>
                <strong>{Math.round((correct / answered) * 100)}%</strong>
                <span>right on first try</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="home-body">
        <div className="filters" role="group" aria-label="Practice settings">
          <div className="filter">
            <span className="filter-label">Difficulty</span>
            <div className="seg">
              {DIFFICULTIES.map((d) => (
                <button key={d} className={`seg-btn ${prefs.difficulties.includes(d) ? 'on' : ''}`} aria-pressed={prefs.difficulties.includes(d)} onClick={() => toggleDiff(d)}>
                  <span className={`dot-diff diff-${d.toLowerCase()}`} />
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="filter">
            <span className="filter-label">Questions</span>
            <div className="seg">
              {MODES.map((m) => (
                <button key={m.id} title={m.hint} className={`seg-btn ${prefs.mode === m.id ? 'on' : ''}`} aria-pressed={prefs.mode === m.id} onClick={() => setPrefs((p) => ({ ...p, mode: m.id }))}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter">
            <span className="filter-label">Set size</span>
            <div className="seg">
              {[5, 10, 20].map((n) => (
                <button key={n} className={`seg-btn ${prefs.size === n ? 'on' : ''}`} aria-pressed={prefs.size === n} onClick={() => setPrefs((p) => ({ ...p, size: n }))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="error">Couldn’t load the question catalog ({error}).</p>}

        <section className="mock-card">
          <div className="mock-card-head">
            <div>
              <h2>Mockup Test</h2>
              <p className="muted">
                {MOCK_SIZE} questions in {MOCK_MINUTES} minutes, laid out like a real Reading and Writing module, using only questions you haven’t answered yet.
              </p>
            </div>
            <button className="btn primary" aria-expanded={mockOpenedAt !== null} onClick={() => setMockOpenedAt((o) => (o === null ? Date.now() : null))}>
              Mockup Test
            </button>
          </div>
          {mockOpenedAt !== null && (
            <div className="mock-options">
              {([1, 2] as ModuleNo[]).map((m) => {
                const [lo, hi] = MODULE_DIFFICULTIES[m]
                const fresh = catalog?.filter((e) => (e.difficulty === lo || e.difficulty === hi) && !progress[e.id]).length
                const saved = loadMock()
                const inProgress = saved && saved.module === m && !saved.submittedAt && saved.deadline > mockOpenedAt ? saved : null
                return (
                  <button key={m} className="mock-option" disabled={!catalog} onClick={() => navigate('/mock', { m: String(m), fresh: '1' })}>
                    <strong>Module {m}</strong>
                    <span className="mock-option-diff">
                      <span className={`dot-diff diff-${lo.toLowerCase()}`} />
                      {lo} and <span className={`dot-diff diff-${hi.toLowerCase()}`} />
                      {hi}
                    </span>
                    <span className="muted">
                      {inProgress
                        ? `In progress · ${timeLabel(inProgress.deadline - mockOpenedAt)} left`
                        : fresh !== undefined
                          ? `${fresh} new ${lo.toLowerCase()} and ${hi.toLowerCase()} questions left`
                          : '\u00a0'}
                    </span>
                    <span className="mock-option-go">{inProgress ? 'Resume' : 'Start'} →</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {DOMAINS.map((d) => {
          const domainPool = d.skills.reduce((a, s) => a + (stats.get(s)?.pool ?? 0), 0)
          return (
            <section key={d.name} className="domain">
              <header className="domain-head">
                <h2>{d.name}</h2>
                <button className="btn secondary small" disabled={!catalog || domainPool === 0} onClick={() => start(d.skills)}>
                  Mixed practice
                </button>
              </header>
              <ul className="skills">
                {d.skills.map((s) => {
                  const st = stats.get(s)
                  const total = st ? st.total.Easy + st.total.Medium + st.total.Hard : 0
                  const pct = total ? (st!.correct / total) * 100 : 0
                  const donePct = total ? (st!.done / total) * 100 : 0
                  return (
                    <li key={s} className="skill">
                      <div className="skill-main">
                        <h3>{s}</h3>
                        <div className="skill-counts">
                          {DIFFICULTIES.map((diff) => (
                            <span key={diff} className={`count ${prefs.difficulties.includes(diff) ? '' : 'off'}`}>
                              <span className={`dot-diff diff-${diff.toLowerCase()}`} />
                              {st?.total[diff] ?? '–'} {diff}
                            </span>
                          ))}
                        </div>
                        <div className="mastery" title={`${st?.correct ?? 0} correct, ${st?.done ?? 0} answered of ${total}`}>
                          <span className="mastery-done" style={{ width: `${donePct}%` }} />
                          <span className="mastery-correct" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="skill-progress">
                          {st?.done ?? 0} of {total} answered · {st?.correct ?? 0} correct
                        </p>
                      </div>
                      <button className="btn primary" disabled={!st || st.pool === 0} onClick={() => start([s])}>
                        {st && st.pool === 0 ? (prefs.mode === 'mistakes' ? 'No mistakes' : 'All done') : 'Practice'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}

        <footer className="home-foot">
          <p>
            Questions © College Board, from the SAT Suite Question Bank.{' '}
            {account
              ? `Your progress is saved to your account (${account.email}) and syncs across devices.`
              : storage === 'folder'
                ? 'Your progress is saved to the progress folder on this computer.'
                : storage === 'browser'
                  ? accountsEnabled
                    ? 'Your progress is saved in this browser only. Sign in with Google to keep it on every device.'
                    : 'Your progress is saved in this browser only.'
                  : null}
          </p>
          {answered > 0 &&
            (confirmReset ? (
              <span>
                Erase all progress?{' '}
                <button
                  className="link danger"
                  onClick={() => {
                    resetProgress()
                    setConfirmReset(false)
                  }}
                >
                  Yes, erase
                </button>{' '}
                <button className="link" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="link" onClick={() => setConfirmReset(true)}>
                Reset progress
              </button>
            ))}
        </footer>
      </div>
    </div>
  )
}
