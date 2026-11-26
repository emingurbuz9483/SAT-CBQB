import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Letter, Question, Subject } from '../types'
import { SUBJECTS, loadCatalog, loadSkill, preloadMath, skillSlug, subjectPath } from '../data'
import { logCheck, recordResult, type Progress } from '../progress'
import { navigate } from '../router'
import { isTyping } from '../highlights'
import { timeLabel } from '../mock'
import { addDrillRecord, buildDrill, drillTotals, loadDrill, loadDrillHistory, saveDrill, type DrillMinutes, type DrillState } from '../drill'
import { correctLabel, isCorrect, isSpr } from '../answer'
import { QuestionView } from './QuestionView'
import { MathTools } from './MathTools'
import { CheckIcon, CloseIcon, CrossIcon } from './Icons'

const LETTERS: Letter[] = ['A', 'B', 'C', 'D']
const preview = (q: Question) => q.stem.replace(/<span class="m"[^>]*><\/span>/g, '▢').replace(/<[^>]+>/g, '')
const fmtSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`)

type View = { kind: 'drill' } | { kind: 'results' } | { kind: 'review'; i: number }

/** Move past the question on screen, keeping its answer if it was answered. */
const advance = (s: DrillState, response: string | null): DrillState =>
  response ? { ...s, idx: s.idx + 1, answers: { ...s.answers, [s.ids[s.idx]]: response } } : { ...s, idx: s.idx + 1 }

/** Save a drill that ran its course: each answer to progress and the attempt log, and the drill to Analytics. */
function countDrill(subject: Subject, s: DrillState, qs: Map<string, Question>) {
  const totals = drillTotals(s, (id) => !!qs.get(id) && isCorrect(qs.get(id)!, s.answers[id]))
  for (const id of totals.seen) {
    const choice = s.answers[id]
    const q = qs.get(id)
    if (!choice || !q) continue
    const correct = isCorrect(q, choice)
    recordResult(id, correct)
    logCheck({ id, domain: q.domain, skill: q.skill, difficulty: q.difficulty, choice, correct, attempt: 1, seconds: s.secs[id] ?? 0 })
  }
  addDrillRecord({
    subject,
    at: s.finishedAt ?? s.deadline,
    minutes: s.minutes,
    answered: totals.answered,
    correct: totals.correct,
    skipped: totals.skipped,
    seconds: totals.seconds,
  })
}

/**
 * Speed Drill: as many questions as the student can answer before the clock runs out. Answers are graded and saved
 * when the drill closes by itself at time's up (an answer picked but not yet submitted still counts); a drill the
 * student quits isn't saved at all.
 */
export function Drill({ subject, minutes, progress }: { subject: Subject; minutes: DrillMinutes | null; progress: Progress }) {
  const home = subjectPath(subject, '/')
  const subjectName = SUBJECTS[subject].name
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [qs, setQs] = useState<Map<string, Question> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'drill' })
  const [choice, setChoice] = useState<string | null>(null)
  const [crossed, setCrossed] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [best, setBest] = useState<number | null>(null) // most correct answers in an earlier drill of this length
  const finished = useRef(false)

  // Once: start the drill the home page asked for (?t=), or resume the saved one.
  useEffect(() => {
    let alive = true
    const saved = loadDrill(subject)
    if (minutes) history.replaceState(null, '', `#${subjectPath(subject, '/drill')}`)
    if (!minutes && !saved) {
      navigate(home)
      return
    }
    const skills = SUBJECTS[subject].domains.flatMap((d) => d.skills)
    Promise.all([loadCatalog(subject), Promise.all(skills.map((s) => loadSkill(subject, skillSlug(s))))])
      .then(([cat, lists]) => {
        if (!alive) return
        const byId = new Map(lists.flat().map((q) => [q.id, q]))
        // a drill left open until its time ran out still counts before a new one replaces it
        if (minutes && saved && !saved.finishedAt && saved.deadline <= Date.now()) countDrill(subject, { ...saved, finishedAt: saved.deadline }, byId)
        const d: DrillState = minutes
          ? { minutes, ids: buildDrill(subject, cat, progress), idx: 0, answers: {}, secs: {}, deadline: Date.now() + minutes * 60_000 }
          : saved!
        finished.current = !!d.finishedAt
        preloadMath(d.ids.slice(d.idx, d.idx + 6).map((id) => byId.get(id)).filter((q): q is Question => !!q))
        setQs(byId)
        setDrill(d)
        setNow(Date.now())
        setView({ kind: d.finishedAt ? 'results' : 'drill' })
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
    // progress is read only when the drill is built
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (drill) saveDrill(subject, drill)
  }, [subject, drill])

  const running = !!drill && !drill.finishedAt

  // clock: count down to the deadline and add time to the question on screen
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setNow(Date.now())
      setDrill((s) => {
        if (!s || s.finishedAt) return s
        const id = s.ids[s.idx]
        return { ...s, secs: { ...s.secs, [id]: (s.secs[id] ?? 0) + 1 } }
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  // keep the math sprites of the next few questions loading ahead of the student
  const idx = drill?.idx ?? 0
  useEffect(() => {
    if (!drill || !qs) return
    preloadMath(drill.ids.slice(idx + 1, idx + 6).map((id) => qs.get(id)).filter((q): q is Question => !!q))
    // only when the student moves on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, qs])

  /** End the drill and show the results; unless the student quit, save it. */
  const finish = useCallback(
    (s: DrillState, quit = false) => {
      if (finished.current || !qs) return
      finished.current = true
      const done: DrillState = { ...s, finishedAt: Math.min(Date.now(), s.deadline), ...(quit && { quit: true }) }
      const earlier = loadDrillHistory().filter((r) => r.subject === subject && r.minutes === s.minutes)
      setBest(earlier.length ? Math.max(...earlier.map((r) => r.correct)) : null)
      if (!quit) countDrill(subject, done, qs)
      setDrill(done)
      setView({ kind: 'results' })
      window.scrollTo(0, 0)
    },
    [qs, subject],
  )

  const next = useCallback(
    (response: string | null) => {
      if (!drill || drill.finishedAt) return
      const s = advance(drill, response)
      setChoice(null)
      setCrossed([])
      window.scrollTo(0, 0)
      if (s.idx >= s.ids.length) finish(s)
      else setDrill(s)
    },
    [drill, finish],
  )

  // time's up: close the drill, counting an answer that was picked but not yet submitted
  useEffect(() => {
    if (running && qs && !finished.current && now >= drill.deadline) finish(choice ? advance(drill, choice) : drill)
  }, [running, qs, now, drill, choice, finish])

  // keyboard: A–D / 1–4 choose, Enter submits
  useEffect(() => {
    if (!running || view.kind !== 'drill' || !qs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (e.key === 'Enter' && choice && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        next(choice)
        return
      }
      if (isSpr(qs.get(drill.ids[drill.idx])!)) return
      let i = LETTERS.indexOf(e.key.toUpperCase() as Letter)
      if (i < 0) i = ['1', '2', '3', '4'].indexOf(e.key)
      if (i < 0) return
      setChoice(LETTERS[i])
      setCrossed((c) => c.filter((x) => x !== LETTERS[i]))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, view.kind, qs, drill, choice, next])

  if (error) return <Centered>Couldn’t load the drill ({error}).</Centered>
  if (!drill || !qs) return <Centered>Getting your drill ready…</Centered>

  const isRight = (id: string) => isCorrect(qs.get(id)!, drill.answers[id])
  const totals = drillTotals(drill, isRight)
  const crumb = `${subjectName} · Speed Drill`

  if (view.kind === 'review') {
    const i = view.i
    const id = totals.seen[i]
    const q = qs.get(id)!
    const answer = drill.answers[id] ?? null
    const n = totals.seen.length
    return (
      <div className="practice">
        <DrillHeader crumb={crumb} title={`Review: question ${i + 1} of ${n}`} onExit={() => setView({ kind: 'results' })} exitLabel="Back to results" tools={subject === 'math'} />
        <main className={`practice-main ${q.stimulus.length && q.test !== 'Math' ? 'wide' : ''}`}>
          <p className={`mock-verdict ${answer ? (isRight(id) ? 'right' : 'wrong') : ''}`}>
            {answer
              ? isRight(id)
                ? `You answered ${answer} in ${fmtSeconds(drill.secs[id] ?? 0)}. Correct!`
                : `You answered ${answer} in ${fmtSeconds(drill.secs[id] ?? 0)}. The correct answer is ${correctLabel(q)}.`
              : `You skipped this one. The correct answer is ${correctLabel(q)}.`}
          </p>
          <QuestionView
            key={id}
            q={q}
            phase="done"
            selected={answer}
            tried={answer && !isRight(id) && !isSpr(q) ? [answer] : []}
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

  if (view.kind === 'results') {
    const { answered, correct, skipped, seconds, seen } = totals
    const newBest = !drill.quit && best !== null && correct > best
    // pace over the time actually used, so quitting early doesn't drag it down
    const usedMinutes = Math.max(1 / 60, ((drill.finishedAt ?? now) - (drill.deadline - drill.minutes * 60_000)) / 60_000)
    return (
      <div className="summary">
        <div className="summary-card">
          <p className="crumb">
            {subjectName} Speed Drill · {drill.minutes} minutes
          </p>
          <h1>
            {answered} answered · {correct} correct
          </h1>
          {newBest && <p className="drill-best">New best for a {drill.minutes}-minute drill (was {best} correct)</p>}
          {drill.quit && <p className="muted mock-note">You quit this drill, so it isn’t counted in your progress or Analytics.</p>}
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${answered ? (correct / answered) * 100 : 0}%` }} />
          </div>
          <div className="mock-stats drill-stats">
            <div>
              <strong>{answered ? `${Math.round((correct / answered) * 100)}%` : '–'}</strong>
              <span>accuracy</span>
            </div>
            <div>
              <strong>{answered ? fmtSeconds(seconds / answered) : '–'}</strong>
              <span>per question</span>
            </div>
            <div>
              <strong>{(answered / usedMinutes).toFixed(1)}</strong>
              <span>answered per minute</span>
            </div>
            <div>
              <strong>{skipped}</strong>
              <span>skipped</span>
            </div>
          </div>
          {answered > 0 && (
            <table className="mock-domains">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Correct</th>
                </tr>
              </thead>
              <tbody>
                {SUBJECTS[subject].domains.map((d) => {
                  const ids = seen.filter((id) => drill.answers[id] && d.skills.includes(qs.get(id)?.skill ?? ''))
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
          )}
          {seen.length > 0 && <h2 className="mock-subhead">Review your answers</h2>}
          <ol className="summary-list">
            {seen.map((id, i) => {
              const q = qs.get(id)!
              const state = !drill.answers[id] ? 'skipped' : isRight(id) ? 'correct' : 'incorrect'
              return (
                <li key={id} className={`${state} mock-row`}>
                  <button type="button" onClick={() => (setView({ kind: 'review', i }), window.scrollTo(0, 0))}>
                    <span className="summary-icon">{state === 'correct' ? <CheckIcon size={14} /> : state === 'incorrect' ? <CrossIcon size={13} /> : '–'}</span>
                    <span className="mock-row-num">{i + 1}</span>
                    <span className={`diff diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                    <span className="summary-stem">{preview(q)}</span>
                    <span className="drill-secs">{fmtSeconds(drill.secs[id] ?? 0)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="summary-actions">
            <button className="btn secondary" onClick={() => navigate(home)}>
              Back to skills
            </button>
            <button className="btn primary" onClick={() => navigate(subjectPath(subject, '/drill'), { t: String(drill.minutes), n: String(Date.now()) })}>
              New {drill.minutes}-minute drill
            </button>
          </div>
        </div>
      </div>
    )
  }

  const left = drill.deadline - now
  const id = drill.ids[drill.idx]
  const q = qs.get(id)!
  return (
    <div className="practice">
      <DrillHeader
        crumb={crumb}
        title={`${drill.minutes}-minute drill`}
        timer={<span className={`mock-timer ${left < 60_000 ? 'low' : ''}`}>{timeLabel(left)}</span>}
        onExit={() => navigate(home)}
        tools={subject === 'math'}
      />
      <main className={`practice-main ${q.stimulus.length && q.test !== 'Math' ? 'wide' : ''}`}>
        <div className="mock-qhead">
          <span className="mock-num">{drill.idx + 1}</span>
          <span className="muted drill-skill">{q.skill}</span>
        </div>
        <QuestionView
          key={id}
          q={q}
          phase="answering"
          selected={choice}
          tried={[]}
          crossed={crossed}
          onSelect={(l) => {
            setChoice(l || null) // '' = cleared grid-in box
            setCrossed((c) => c.filter((x) => x !== l))
          }}
          onToggleCross={(l) => {
            if (choice === l) setChoice(null)
            setCrossed((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]))
          }}
          onSubmit={() => choice && next(choice)}
        />
      </main>
      <footer className="bottom-bar">
        <div className="bottom-inner">
          {confirmQuit ? (
            <span className="drill-quit">
              Quit? This drill won’t count.{' '}
              <button className="btn secondary small" onClick={() => finish(drill, true)}>
                Yes, quit
              </button>{' '}
              <button className="btn text small" onClick={() => setConfirmQuit(false)}>
                Keep going
              </button>
            </span>
          ) : (
            <span className="drill-count">
              <button className="btn secondary small" onClick={() => setConfirmQuit(true)}>
                Quit
              </button>{' '}
              <strong>{totals.answered}</strong> answered
            </span>
          )}
          <div className="actions">
            <button className="btn secondary" onClick={() => next(null)}>
              Skip
            </button>
            <button className="btn primary" disabled={!choice} onClick={() => next(choice)}>
              Next
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function DrillHeader({
  crumb,
  title,
  timer,
  onExit,
  exitLabel = 'Exit drill (the clock keeps running)',
  tools = false,
}: {
  crumb: string
  title: string
  timer?: ReactNode
  onExit: () => void
  exitLabel?: string
  tools?: boolean
}) {
  return (
    <div className="practice-sub">
      <div className="practice-sub-inner">
        <div>
          <div className="crumb">{crumb}</div>
          <h1 className="practice-title">{title}</h1>
        </div>
        {timer}
        <div className="practice-meta">
          {tools && <MathTools />}
          <button className="icon-btn" aria-label={exitLabel} title={exitLabel} onClick={onExit}>
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

const Centered = ({ children }: { children: ReactNode }) => <div className="centered">{children}</div>
