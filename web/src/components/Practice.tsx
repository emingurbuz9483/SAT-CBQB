import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Difficulty, Letter, Question } from '../types'
import { DIFFICULTIES, loadSkill, skillBySlug } from '../data'
import { configToParams, inPool, type Result, type SessionConfig } from '../session'
import { logCheck, recordResult, type Progress } from '../progress'
import { navigate } from '../router'
import { QuestionView, type Phase } from './QuestionView'
import { CheckIcon, CloseIcon, CrossIcon } from './Icons'
import { Summary } from './Summary'

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

const LETTERS: Letter[] = ['A', 'B', 'C', 'D']

function useTimer(key: string, running: boolean) {
  const [state, setState] = useState({ key, sec: 0 })
  const sec = state.key === key ? state.sec : 0
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setState((s) => (s.key === key ? { key, sec: s.sec + 1 } : { key, sec: 1 })), 1000)
    return () => clearInterval(t)
  }, [running, key])
  return { sec, label: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }
}

export function Practice({ config, progress }: { config: SessionConfig; progress: Progress }) {
  const [qs, setQs] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState<Letter | null>(null)
  const [tried, setTried] = useState<Letter[]>([])
  const [crossed, setCrossed] = useState<Letter[]>([])
  const [phase, setPhase] = useState<Phase>('answering')
  const [toast, setToast] = useState<'correct' | 'wrong' | null>(null)
  const [finished, setFinished] = useState(false)
  const [round, setRound] = useState(0)

  const resetQuestion = () => {
    setSelected(null)
    setTried([])
    setCrossed([])
    setPhase('answering')
    setToast(null)
  }

  // Build the question set once per config / round; progress is only read at that moment.
  const cfgKey = `${config.ids?.join() ?? ''}|${config.skills.join()}|${config.difficulties.join()}|${config.mode}|${config.size}|${round}`
  useEffect(() => {
    let alive = true
    setQs(null)
    Promise.all(config.skills.map(loadSkill))
      .then((lists) => {
        if (!alive) return
        const all = lists.flat()
        const order = (d: Difficulty) => DIFFICULTIES.indexOf(d)
        const picked = config.ids?.length
          ? config.ids.map((id) => all.find((q) => q.id === id)).filter((q): q is Question => !!q)
          : shuffle(all.filter((q) => config.difficulties.includes(q.difficulty) && inPool(config.mode, q.id, progress)))
              .slice(0, config.size)
              .sort((a, b) => order(a.difficulty) - order(b.difficulty))
        setQs(picked)
        setResults(picked.map(() => null))
        setIdx(0)
        setFinished(false)
        resetQuestion()
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
    // progress intentionally excluded: answering a question must not reshuffle the set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey])

  const q = qs?.[idx]
  const timer = useTimer(`${round}-${idx}`, !!q && phase !== 'done' && !finished)

  const setResult = useCallback((r: Result) => setResults((rs) => rs.map((x, i) => (i === idx && x === null ? r : x))), [idx])

  const check = useCallback(() => {
    if (!q || !selected || phase !== 'answering') return
    logCheck({
      id: q.id,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      choice: selected,
      correct: selected === q.answer,
      attempt: 1,
      seconds: timer.sec,
    })
    // One chance per question: a wrong pick ends the question and counts as a mistake.
    const correct = selected === q.answer
    if (results[idx] === null) {
      recordResult(q.id, correct)
      setResult(correct ? 'correct' : 'incorrect')
    }
    if (!correct) setTried([selected])
    setPhase('done')
    setToast(correct ? 'correct' : 'wrong')
  }, [q, selected, phase, results, idx, setResult, timer.sec])

  const next = useCallback(() => {
    if (!qs) return
    if (idx + 1 >= qs.length) setFinished(true)
    else {
      setIdx(idx + 1)
      resetQuestion()
      window.scrollTo(0, 0)
    }
  }, [qs, idx])
  const skip = () => {
    setResult('skipped')
    next()
  }

  // keyboard: A–D / 1–4 choose, Enter checks or continues
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || finished || !q) return
      const k = e.key.toUpperCase()
      let i = LETTERS.indexOf(k as Letter)
      if (i < 0) i = ['1', '2', '3', '4'].indexOf(k)
      if (i >= 0 && phase === 'answering') {
        setSelected(LETTERS[i])
        setCrossed((c) => c.filter((x) => x !== LETTERS[i]))
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        if (phase === 'answering') check()
        else next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, phase, finished, check, next])

  const title = (config.skills.length === 1 ? skillBySlug(config.skills[0]) : null) ?? 'Mixed practice'

  if (error) return <Centered>Couldn’t load questions ({error}).</Centered>
  if (!qs) return <Centered>Loading questions…</Centered>
  if (qs.length === 0)
    return (
      <Centered>
        <h2>Nothing left here</h2>
        <p>{config.mode === 'new' ? 'You’ve answered every question that matches these filters.' : 'No mistakes to review for these filters. Nice!'}</p>
        <button className="btn primary" onClick={() => navigate('/')}>
          Back to skills
        </button>
      </Centered>
    )
  if (finished)
    return (
      <Summary
        questions={qs}
        results={results}
        title={title}
        onAgain={() => setRound((r) => r + 1)}
        onMistakes={() => navigate('/practice', configToParams({ ...config, ids: undefined, mode: 'mistakes' }))}
      />
    )

  const cur = q!
  const last = idx + 1 === qs.length
  return (
    <div className="practice">
      <div className="practice-sub">
        <div className="practice-sub-inner">
          <div>
            <div className="crumb">{cur.domain}</div>
            <h1 className="practice-title">{title}</h1>
          </div>
          <div className="practice-meta">
            <span className={`diff diff-${cur.difficulty.toLowerCase()}`}>{cur.difficulty}</span>
            <span className="muted timer" title="Time on this question">
              {timer.label}
            </span>
            <span className="muted qid" title="College Board question ID">
              ID {cur.id}
            </span>
            <button className="icon-btn" aria-label="Exit practice" onClick={() => navigate('/')}>
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>

      <main className={`practice-main ${cur.stimulus.length > 0 ? 'wide' : ''}`}>
        <QuestionView
          key={`${round}-${idx}`}
          q={cur}
          phase={phase}
          selected={selected}
          tried={tried}
          crossed={crossed}
          onSelect={(l) => {
            setSelected(l)
            setCrossed((c) => c.filter((x) => x !== l))
          }}
          onToggleCross={(l) => {
            setCrossed((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]))
            if (selected === l) setSelected(null)
          }}
        />
      </main>

      {toast && (
        <div className={`toast ${toast}`} role="status" aria-live="polite">
          <span className="toast-icon">{toast === 'correct' ? <CheckIcon size={30} /> : <CrossIcon size={26} />}</span>
          <div className="toast-body">
            <strong>{toast === 'correct' ? 'Good work!' : 'Not quite.'}</strong>
            <p>{toast === 'correct' ? 'You got it. Onward!' : `The correct answer is ${cur.answer}. Read why your choice doesn’t work.`}</p>
          </div>
          <button className="icon-btn toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
            <CloseIcon size={18} />
          </button>
        </div>
      )}

      <footer className="bottom-bar">
        <div className="bottom-inner">
          <div className="dots-wrap">
            <span className="dots-label">
              Do {qs.length} problem{qs.length > 1 ? 's' : ''}
            </span>
            <ol className="dots" aria-label="Progress">
              {results.map((r, i) => (
                <li
                  key={i}
                  className={`dot ${r ?? ''} ${i === idx ? 'current' : ''}`}
                  aria-label={`Question ${i + 1}: ${r ?? (i === idx ? 'current' : 'not answered')}`}
                >
                  {r === 'correct' && <CheckIcon size={12} />}
                  {r === 'incorrect' && <CrossIcon size={11} />}
                </li>
              ))}
            </ol>
          </div>
          <div className="actions">
            {phase === 'answering' && (
              <>
                <button className="btn text" onClick={skip}>
                  Skip
                </button>
                <button className="btn primary" disabled={!selected} onClick={check}>
                  Check
                </button>
              </>
            )}
            {phase === 'done' && (
              <button className="btn primary" onClick={next}>
                {last ? 'See results' : 'Next question'}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

const Centered = ({ children }: { children: ReactNode }) => <div className="centered">{children}</div>
