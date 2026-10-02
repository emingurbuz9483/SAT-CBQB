import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CatalogEntry, Letter, Question } from '../types'
import { DOMAINS, loadCatalog, loadSkill, skillSlug } from '../data'
import { logCheck, recordResult, type Progress } from '../progress'
import { navigate } from '../router'
import { BLUEPRINT, MOCK_MINUTES, MODULE_DIFFICULTIES, buildMock, loadMock, saveMock, timeLabel, type MockState, type ModuleNo } from '../mock'
import { QuestionView } from './QuestionView'
import { CheckIcon, ChevronIcon, CloseIcon, CrossIcon, FlagIcon } from './Icons'

const LETTERS: Letter[] = ['A', 'B', 'C', 'D']
const preview = (q: Question) => q.stem.replace(/<[^>]+>/g, '')

type View = { kind: 'test' } | { kind: 'check' } | { kind: 'results' } | { kind: 'review'; i: number }

function newTest(catalog: CatalogEntry[], progress: Progress, module: ModuleNo): MockState {
  const { ids, repeats } = buildMock(catalog, progress, module)
  return { module, ids, repeats, answers: {}, marked: [], crossed: {}, secs: {}, idx: 0, deadline: Date.now() + MOCK_MINUTES * 60_000 }
}

export function Mock({ module, fresh, progress }: { module: ModuleNo; fresh: boolean; progress: Progress }) {
  const [test, setTest] = useState<MockState | null>(null)
  const [qs, setQs] = useState<Map<string, Question> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'test' })
  const [navOpen, setNavOpen] = useState(false)
  const [hideTimer, setHideTimer] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const catalog = useRef<CatalogEntry[]>([])
  const submitted = useRef(false)
  const viewKind = useRef(view.kind)
  viewKind.current = view.kind

  // Once per module: resume the saved module, or build a new one from questions the student hasn't answered.
  // A link from the home page (fresh) starts over unless a module is still in progress.
  useEffect(() => {
    let alive = true
    const saved = loadMock()
    const resume = saved && saved.module === module && !(fresh && saved.submittedAt) ? saved : null
    if (fresh) history.replaceState(null, '', `#/mock?m=${module}`)
    Promise.all([loadCatalog(), Promise.all(BLUEPRINT.map(([s]) => loadSkill(skillSlug(s))))])
      .then(([cat, lists]) => {
        if (!alive) return
        catalog.current = cat
        const t = resume ?? newTest(cat, progress, module)
        submitted.current = !!t.submittedAt
        setQs(new Map(lists.flat().map((q) => [q.id, q])))
        setTest(t)
        setView({ kind: t.submittedAt ? 'results' : 'test' })
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
    // progress is read only when the module is built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module])

  useEffect(() => {
    if (test) saveMock(test)
  }, [test])

  const running = !!test && !test.submittedAt

  // clock: count down to the deadline and add time to the question on screen
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (viewKind.current !== 'test') return
      setTest((s) => {
        if (!s || s.submittedAt) return s
        const id = s.ids[s.idx]
        return { ...s, secs: { ...s.secs, [id]: (s.secs[id] ?? 0) + 1 } }
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  const submit = useCallback(() => {
    if (!test || !qs || submitted.current) return
    submitted.current = true
    for (const id of test.ids) {
      const choice = test.answers[id]
      const q = qs.get(id)
      if (!choice || !q) continue // unanswered questions stay "new"
      const correct = choice === q.answer
      recordResult(id, correct)
      logCheck({ id, domain: q.domain, skill: q.skill, difficulty: q.difficulty, choice, correct, attempt: 1, seconds: test.secs[id] ?? 0 })
    }
    setTest({ ...test, submittedAt: Date.now() })
    setView({ kind: 'results' })
    setNavOpen(false)
    window.scrollTo(0, 0)
  }, [test, qs])

  // time's up: submit what's there, as on test day
  useEffect(() => {
    if (running && qs && now >= test.deadline) submit()
  }, [running, qs, now, test, submit])

  const update = (f: (s: MockState) => MockState) => setTest((s) => (s && !s.submittedAt ? f(s) : s))
  const goTo = (i: number) => {
    update((s) => ({ ...s, idx: i }))
    setView({ kind: 'test' })
    setNavOpen(false)
    window.scrollTo(0, 0)
  }

  // keyboard: A–D / 1–4 choose
  useEffect(() => {
    if (!running || view.kind !== 'test') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      let i = LETTERS.indexOf(e.key.toUpperCase() as Letter)
      if (i < 0) i = ['1', '2', '3', '4'].indexOf(e.key)
      if (i < 0) return
      setTest((s) => {
        if (!s || s.submittedAt) return s
        const id = s.ids[s.idx]
        return { ...s, answers: { ...s.answers, [id]: LETTERS[i] }, crossed: { ...s.crossed, [id]: (s.crossed[id] ?? []).filter((x) => x !== LETTERS[i]) } }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, view.kind])

  if (error) return <Centered>Couldn’t load the test ({error}).</Centered>
  if (!test || !qs) return <Centered>Building your test…</Centered>

  const n = test.ids.length
  const [lo, hi] = MODULE_DIFFICULTIES[test.module]
  const left = test.deadline - now

  if (view.kind === 'results' || view.kind === 'review') {
    const isRight = (id: string) => test.answers[id] === qs.get(id)?.answer
    const correct = test.ids.filter(isRight).length

    if (view.kind === 'review') {
      const i = view.i
      const id = test.ids[i]
      const q = qs.get(id)!
      const choice = test.answers[id] ?? null
      return (
        <div className="practice">
          <TestHeader crumb={`Mockup Test · Module ${test.module}`} title={`Review: question ${i + 1} of ${n}`} onExit={() => setView({ kind: 'results' })} exitLabel="Back to results" />
          <main className={`practice-main ${q.stimulus.length ? 'wide' : ''}`}>
            <p className={`mock-verdict ${choice ? (isRight(id) ? 'right' : 'wrong') : ''}`}>
              {choice
                ? isRight(id)
                  ? `You answered ${choice}. Correct!`
                  : `You answered ${choice}. The correct answer is ${q.answer}.`
                : `You didn’t answer this one. The correct answer is ${q.answer}.`}
            </p>
            <QuestionView
              key={id}
              q={q}
              phase="done"
              selected={choice}
              tried={choice && !isRight(id) ? [choice] : []}
              crossed={[]}
              onSelect={() => {}}
              onToggleCross={() => {}}
            />
          </main>
          <footer className="bottom-bar">
            <div className="bottom-inner">
              <button className="btn secondary" onClick={() => setView({ kind: 'results' })}>
                Back to results
              </button>
              <div className="actions">
                <button className="btn secondary" disabled={i === 0} onClick={() => (setView({ kind: 'review', i: i - 1 }), window.scrollTo(0, 0))}>
                  Back
                </button>
                <button className="btn primary" disabled={i + 1 === n} onClick={() => (setView({ kind: 'review', i: i + 1 }), window.scrollTo(0, 0))}>
                  Next
                </button>
              </div>
            </div>
          </footer>
        </div>
      )
    }

    const unanswered = test.ids.filter((id) => !test.answers[id]).length
    const started = test.deadline - MOCK_MINUTES * 60_000
    const used = Math.min((test.submittedAt ?? now) - started, MOCK_MINUTES * 60_000)
    return (
      <div className="summary">
        <div className="summary-card">
          <p className="crumb">
            Mockup Test · Module {test.module} · {lo} and {hi}
          </p>
          <h1>
            {correct} of {n} correct
          </h1>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${(correct / n) * 100}%` }} />
          </div>
          <div className="mock-stats">
            <div>
              <strong>{timeLabel(used)}</strong>
              <span>time used of {MOCK_MINUTES}:00</span>
            </div>
            <div>
              <strong>{unanswered}</strong>
              <span>unanswered</span>
            </div>
          </div>
          {test.repeats > 0 && (
            <p className="muted mock-note">
              {test.repeats} question{test.repeats > 1 ? 's were' : ' was'} reused from ones you’d already answered, because some skills ran out of new
              questions.
            </p>
          )}
          <table className="mock-domains">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Correct</th>
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((d) => {
                const ids = test.ids.filter((id) => d.skills.includes(qs.get(id)?.skill ?? ''))
                return (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td>
                      {ids.filter(isRight).length} / {ids.length}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <h2 className="mock-subhead">Review your answers</h2>
          <ol className="summary-list">
            {test.ids.map((id, i) => {
              const q = qs.get(id)!
              const state = !test.answers[id] ? 'skipped' : isRight(id) ? 'correct' : 'incorrect'
              return (
                <li key={id} className={`${state} mock-row`}>
                  <button type="button" onClick={() => (setView({ kind: 'review', i }), window.scrollTo(0, 0))}>
                    <span className="summary-icon">{state === 'correct' ? <CheckIcon size={14} /> : state === 'incorrect' ? <CrossIcon size={13} /> : '–'}</span>
                    <span className="mock-row-num">{i + 1}</span>
                    <span className={`diff diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                    <span className="summary-stem">{preview(q)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="summary-actions">
            <button className="btn secondary" onClick={() => navigate('/')}>
              Back to skills
            </button>
            <button
              className="btn primary"
              onClick={() => {
                submitted.current = false
                setTest(newTest(catalog.current, progress, test.module))
                setView({ kind: 'test' })
                setNow(Date.now())
                window.scrollTo(0, 0)
              }}
            >
              New Module {test.module} test
            </button>
          </div>
        </div>
      </div>
    )
  }

  const timer = (
    <div className="mock-clock">
      {hideTimer ? <span className="muted">Timer hidden</span> : <span className={`mock-timer ${left < 5 * 60_000 ? 'low' : ''}`}>{timeLabel(left)}</span>}
      <button className="btn text small" onClick={() => setHideTimer((h) => !h)}>
        {hideTimer ? 'Show' : 'Hide'}
      </button>
    </div>
  )
  const grid = <QuestionGrid test={test} current={view.kind === 'test' ? test.idx : -1} onPick={goTo} />

  if (view.kind === 'check')
    return (
      <div className="practice">
        <TestHeader crumb="Reading and Writing · Mockup Test" title={`Module ${test.module}`} timer={timer} onExit={() => navigate('/')} />
        <main className="practice-main mock-check">
          <h2>Check your work</h2>
          <p>Click a question number to go back to it. When you’re ready, submit the module to see your score.</p>
          <div className="mock-panel">
            <Legend />
            {grid}
          </div>
        </main>
        <footer className="bottom-bar">
          <div className="bottom-inner">
            <span />
            <div className="actions">
              <button className="btn secondary" onClick={() => goTo(n - 1)}>
                Back
              </button>
              <button className="btn primary" onClick={submit}>
                Submit module
              </button>
            </div>
          </div>
        </footer>
      </div>
    )

  const id = test.ids[test.idx]
  const q = qs.get(id)!
  const marked = test.marked.includes(id)
  return (
    <div className="practice">
      <TestHeader crumb="Reading and Writing · Mockup Test" title={`Module ${test.module}`} timer={timer} onExit={() => navigate('/')} />
      <main className={`practice-main ${q.stimulus.length ? 'wide' : ''}`}>
        <div className="mock-qhead">
          <span className="mock-num">{test.idx + 1}</span>
          <button
            type="button"
            className={`mark-btn ${marked ? 'on' : ''}`}
            aria-pressed={marked}
            onClick={() => update((s) => ({ ...s, marked: marked ? s.marked.filter((x) => x !== id) : [...s.marked, id] }))}
          >
            <FlagIcon /> {marked ? 'Marked for review' : 'Mark for review'}
          </button>
        </div>
        <QuestionView
          key={id}
          q={q}
          phase="answering"
          selected={test.answers[id] ?? null}
          tried={[]}
          crossed={test.crossed[id] ?? []}
          onSelect={(l) => update((s) => ({ ...s, answers: { ...s.answers, [id]: l }, crossed: { ...s.crossed, [id]: (s.crossed[id] ?? []).filter((x) => x !== l) } }))}
          onToggleCross={(l) =>
            update((s) => {
              const c = s.crossed[id] ?? []
              const answers = { ...s.answers }
              if (answers[id] === l) delete answers[id]
              return { ...s, answers, crossed: { ...s.crossed, [id]: c.includes(l) ? c.filter((x) => x !== l) : [...c, l] } }
            })
          }
        />
      </main>

      {navOpen && (
        <>
          <div className="mock-scrim" onClick={() => setNavOpen(false)} />
          <div className="mock-nav" role="dialog" aria-label="Questions in this module">
            <div className="mock-nav-head">
              <strong>Module {test.module} questions</strong>
              <button className="icon-btn" aria-label="Close" onClick={() => setNavOpen(false)}>
                <CloseIcon size={18} />
              </button>
            </div>
            <Legend />
            {grid}
            <button
              className="btn secondary mock-nav-review"
              onClick={() => {
                setView({ kind: 'check' })
                setNavOpen(false)
              }}
            >
              Go to review page
            </button>
          </div>
        </>
      )}

      <footer className="bottom-bar">
        <div className="bottom-inner">
          <button className="btn secondary mock-nav-toggle" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            Question {test.idx + 1} of {n} <ChevronIcon up={!navOpen} />
          </button>
          <div className="actions">
            <button className="btn secondary" disabled={test.idx === 0} onClick={() => goTo(test.idx - 1)}>
              Back
            </button>
            <button className="btn primary" onClick={() => (test.idx + 1 === n ? (setView({ kind: 'check' }), window.scrollTo(0, 0)) : goTo(test.idx + 1))}>
              {test.idx + 1 === n ? 'Review' : 'Next'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TestHeader({ crumb, title, timer, onExit, exitLabel = 'Exit test (your progress is saved)' }: { crumb: string; title: string; timer?: ReactNode; onExit: () => void; exitLabel?: string }) {
  return (
    <div className="practice-sub">
      <div className="practice-sub-inner">
        <div>
          <div className="crumb">{crumb}</div>
          <h1 className="practice-title">{title}</h1>
        </div>
        {timer}
        <div className="practice-meta">
          <button className="icon-btn" aria-label={exitLabel} title={exitLabel} onClick={onExit}>
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionGrid({ test, current, onPick }: { test: MockState; current: number; onPick: (i: number) => void }) {
  return (
    <ol className="mock-grid">
      {test.ids.map((id, i) => {
        const answered = !!test.answers[id]
        const marked = test.marked.includes(id)
        return (
          <li key={id}>
            <button
              type="button"
              className={`mock-cell ${answered ? 'answered' : ''} ${marked ? 'marked' : ''} ${i === current ? 'current' : ''}`}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}${marked ? ', marked for review' : ''}`}
              onClick={() => onPick(i)}
            >
              {i + 1}
              {marked && (
                <span className="mock-cell-flag">
                  <FlagIcon size={11} />
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

const Legend = () => (
  <div className="mock-legend" aria-hidden="true">
    <span>
      <i className="mock-cell answered" /> Answered
    </span>
    <span>
      <i className="mock-cell" /> Unanswered
    </span>
    <span>
      <FlagIcon size={13} /> For review
    </span>
  </div>
)

const Centered = ({ children }: { children: ReactNode }) => <div className="centered">{children}</div>
