import { useEffect, useMemo, useState } from 'react'
import type { CatalogEntry, Difficulty, Subject } from '../types'
import { DIFFICULTIES, SUBJECTS, loadCatalog, skillSlug, subjectPath } from '../data'
import { accountsEnabled, signInWithGoogle, useAccount, type Progress } from '../progress'
import { supabase } from '../supabase'
import { navigate } from '../router'
import { configToParams, type Mode } from '../session'

/** A skill needs this many answers before we call it a strength or a weakness. */
const MIN_ANSWERS = 3
const DAYS = 14

interface Tally {
  total: number
  done: number
  correct: number
}
const tally = (): Tally => ({ total: 0, done: 0, correct: 0 })
const pct = (t: Tally) => (t.done ? Math.round((t.correct / t.done) * 100) : null)

/** One first-try Check from public.attempts (signed-in students only). */
interface Attempt {
  skill: string
  correct: boolean
  seconds: number
  at: number
}

type Level = 'none' | 'few' | 'weak' | 'developing' | 'strong'
function level(t: Tally): Level {
  if (!t.done) return 'none'
  if (t.done < MIN_ANSWERS) return 'few'
  const p = t.correct / t.done
  return p >= 0.8 ? 'strong' : p >= 0.5 ? 'developing' : 'weak'
}
const LEVEL_LABEL: Record<Level, string> = {
  none: 'Not started',
  few: 'Just started',
  weak: 'Needs work',
  developing: 'Developing',
  strong: 'Strong',
}

async function loadAttempts(): Promise<Attempt[]> {
  if (!supabase) return []
  const out: Attempt[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('attempts')
      .select('skill,correct,seconds,created_at')
      .eq('attempt', 1)
      .order('created_at')
      .range(from, from + 999)
    if (error) throw error
    for (const r of data) out.push({ skill: r.skill, correct: r.correct, seconds: r.seconds, at: Date.parse(r.created_at) })
    if (data.length < 1000) break
  }
  return out
}

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const fmtSeconds = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`)

export function Analytics({ subject, progress }: { subject: Subject; progress: Progress }) {
  const { domains: DOMAINS, name } = SUBJECTS[subject]
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ user: string; rows: Attempt[] } | null>(null)
  const { account } = useAccount()
  const attempts = account && loaded?.user === account.id ? loaded.rows : null

  useEffect(() => {
    loadCatalog(subject).then(setCatalog, (e: Error) => setError(e.message))
  }, [subject])
  useEffect(() => {
    if (!account) return
    let live = true
    const user = account.id
    loadAttempts().then(
      (rows) => live && setLoaded({ user, rows }),
      (e) => console.error('[cbqb] attempts failed', e),
    )
    return () => {
      live = false
    }
  }, [account])

  const stats = useMemo(() => {
    const all = tally()
    const byDomain = new Map<string, Tally>()
    const bySkill = new Map<string, Tally>()
    const bySkillDiff = new Map<string, Tally>()
    const byDiff = new Map<Difficulty, Tally>()
    const get = <K,>(m: Map<K, Tally>, k: K) => m.get(k) ?? (m.set(k, tally()), m.get(k)!)
    for (const e of catalog ?? []) {
      const rec = progress[e.id]
      for (const t of [all, get(byDomain, e.domain), get(bySkill, e.skill), get(bySkillDiff, `${e.skill}|${e.difficulty}`), get(byDiff, e.difficulty)]) {
        t.total++
        if (rec) t.done++
        if (rec?.r === 'c') t.correct++
      }
    }
    return { all, byDomain, bySkill, bySkillDiff, byDiff }
  }, [catalog, progress])

  const skillSet = useMemo(() => new Set(DOMAINS.flatMap((d) => d.skills)), [DOMAINS])

  const time = useMemo(() => {
    if (!attempts?.length) return null
    const bySkill = new Map<string, { n: number; sum: number }>()
    let sum = 0
    let n = 0
    for (const a of attempts) {
      if (!skillSet.has(a.skill)) continue // the other subject's attempts
      n++
      const s = bySkill.get(a.skill) ?? { n: 0, sum: 0 }
      s.n++
      s.sum += a.seconds
      bySkill.set(a.skill, s)
      sum += a.seconds
    }
    return n ? { avg: sum / n, bySkill } : null
  }, [attempts, skillSet])

  // daily activity: from the full Check log when signed in, otherwise from each question's latest answer
  const activity = useMemo(() => {
    const mine = attempts?.filter((a) => skillSet.has(a.skill))
    const events = mine?.length
      ? mine.map((a) => ({ at: a.at, correct: a.correct }))
      : (catalog ?? []).flatMap((e) => (progress[e.id] ? [{ at: progress[e.id].t, correct: progress[e.id].r === 'c' }] : []))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (DAYS - 1 - i))
      return { date: d, key: dayKey(d.getTime()), done: 0, correct: 0 }
    })
    const index = new Map(days.map((d) => [d.key, d]))
    const active = new Set<string>()
    for (const e of events) {
      const k = dayKey(e.at)
      active.add(k)
      const d = index.get(k)
      if (!d) continue
      d.done++
      if (e.correct) d.correct++
    }
    // streak: consecutive days with practice, ending today (or yesterday if today hasn't started yet)
    let streak = 0
    const cursor = new Date(today)
    if (!active.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
    while (active.has(dayKey(cursor.getTime()))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    return { days, max: Math.max(1, ...days.map((d) => d.done)), streak, fromLog: !!mine?.length }
  }, [attempts, catalog, progress, skillSet])

  const ranked = useMemo(
    () =>
      DOMAINS.flatMap((d) => d.skills)
        .map((s) => ({ skill: s, t: stats.bySkill.get(s) ?? tally() }))
        .filter((x) => x.t.done >= MIN_ANSWERS)
        .sort((a, b) => a.t.correct / a.t.done - b.t.correct / b.t.done || b.t.done - a.t.done),
    [stats, DOMAINS],
  )
  const focus = ranked.filter((x) => x.t.correct / x.t.done < 0.8).slice(0, 3)
  const strengths = ranked
    .filter((x) => x.t.correct / x.t.done >= 0.8)
    .reverse()
    .slice(0, 3)
  const untouched = DOMAINS.flatMap((d) => d.skills).filter((s) => !stats.bySkill.get(s)?.done)

  const practice = (skill: string, mode: Mode, difficulties: Difficulty[] = DIFFICULTIES) =>
    navigate(subjectPath(subject, '/practice'), configToParams({ skills: [skillSlug(skill)], difficulties, mode, size: 10 }))

  const overall = pct(stats.all)

  return (
    <div className="home analytics">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Your analytics · {name}</p>
          <h1>How you’re doing, topic by topic</h1>
          <p className="hero-sub">Accuracy counts only your first try on each question, the same way the SAT scores you.</p>
          <div className="hero-stats">
            <div>
              <strong>{stats.all.done}</strong>
              <span>of {stats.all.total || '–'} answered</span>
            </div>
            <div>
              <strong>{overall === null ? '–' : `${overall}%`}</strong>
              <span>right on first try</span>
            </div>
            {time && (
              <div>
                <strong>{fmtSeconds(time.avg)}</strong>
                <span>per question</span>
              </div>
            )}
            <div>
              <strong>{activity.streak}</strong>
              <span>day streak</span>
            </div>
          </div>
        </div>
      </section>

      <div className="home-body">
        {error && <p className="error">Couldn’t load the question catalog ({error}).</p>}

        {catalog && stats.all.done === 0 ? (
          <div className="an-empty">
            <h2>No answers yet</h2>
            <p className="muted">Answer a few questions and your topic breakdown will show up here.</p>
            <button className="btn primary" onClick={() => navigate(subjectPath(subject, '/'))}>
              Start practicing
            </button>
          </div>
        ) : (
          catalog && (
            <>
              <div className="an-cards">
                <section className="an-card">
                  <h2>Focus on these</h2>
                  {focus.length ? (
                    <ul className="an-list">
                      {focus.map(({ skill, t }) => (
                        <li key={skill}>
                          <div>
                            <strong>{skill}</strong>
                            <span className="muted">
                              {pct(t)}% · {t.correct} of {t.done} right
                            </span>
                          </div>
                          <button className="btn secondary small" onClick={() => practice(skill, 'mistakes')}>
                            Redo mistakes
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">
                      {ranked.length ? 'Every skill you’ve practiced is at 80% or better. Nice work.' : `Answer at least ${MIN_ANSWERS} questions in a skill to see where to focus.`}
                    </p>
                  )}
                </section>
                <section className="an-card">
                  <h2>Your strengths</h2>
                  {strengths.length ? (
                    <ul className="an-list">
                      {strengths.map(({ skill, t }) => (
                        <li key={skill}>
                          <div>
                            <strong>{skill}</strong>
                            <span className="muted">
                              {pct(t)}% · {t.correct} of {t.done} right
                            </span>
                          </div>
                          {(stats.bySkillDiff.get(`${skill}|Hard`)?.total ?? 0) > (stats.bySkillDiff.get(`${skill}|Hard`)?.done ?? 0) && (
                            <button className="btn secondary small" onClick={() => practice(skill, 'new', ['Hard'])}>
                              Try hard ones
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Skills where you get 80% or more right on the first try will show up here.</p>
                  )}
                  {untouched.length > 0 && <p className="an-untouched">Not started yet: {untouched.join(', ')}</p>}
                </section>
              </div>

              <section className="an-section">
                <h2 className="an-title">By difficulty</h2>
                <div className="an-diffs">
                  {DIFFICULTIES.map((d) => {
                    const t = stats.byDiff.get(d) ?? tally()
                    const p = pct(t)
                    return (
                      <div key={d} className="an-diff">
                        <span className={`diff diff-${d.toLowerCase()}`}>{d}</span>
                        <strong>{p === null ? '–' : `${p}%`}</strong>
                        <span className="muted">
                          {t.correct} of {t.done} right · {t.total - t.done} new left
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="an-section">
                <h2 className="an-title">Last {DAYS} days</h2>
                <div className="an-chart" role="img" aria-label={`Questions answered per day over the last ${DAYS} days`}>
                  {activity.days.map((d, i) => (
                    <div
                      key={d.key}
                      className="an-bar"
                      title={`${d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.done} answered, ${d.correct} right`}
                    >
                      <div className="an-bar-track">
                        <span className="an-bar-done" style={{ height: `${(d.done / activity.max) * 100}%` }} />
                        <span className="an-bar-correct" style={{ height: `${(d.correct / activity.max) * 100}%` }} />
                      </div>
                      <span className="an-bar-label">{(DAYS - 1 - i) % 2 === 0 ? d.date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}</span>
                    </div>
                  ))}
                </div>
                <p className="an-legend">
                  <span className="an-key correct" /> right on first try <span className="an-key done" /> missed
                  {!activity.fromLog && <span className="muted"> · each question counts on the day you last answered it</span>}
                </p>
              </section>

              <section className="an-section">
                <h2 className="an-title">By topic</h2>
                {DOMAINS.map((dom) => {
                  const dt = stats.byDomain.get(dom.name) ?? tally()
                  const dp = pct(dt)
                  return (
                    <div key={dom.name} className="an-domain">
                      <header className="an-domain-head">
                        <h3>{dom.name}</h3>
                        <span className="muted">
                          {dp === null ? 'Not started' : `${dp}% right`} · {dt.done} of {dt.total} answered
                        </span>
                      </header>
                      <div className="table-scroll">
                        <table className="an-table">
                          <colgroup>
                            <col className="c-skill" />
                            <col className="c-acc" />
                            {DIFFICULTIES.map((d) => (
                              <col key={d} className="c-num" />
                            ))}
                            {time && <col className="c-num" />}
                            <col className="c-level" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Skill</th>
                              <th>Accuracy</th>
                              {DIFFICULTIES.map((d) => (
                                <th key={d} className="num">
                                  {d}
                                </th>
                              ))}
                              {time && <th className="num">Avg time</th>}
                              <th>Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dom.skills.map((s) => {
                              const t = stats.bySkill.get(s) ?? tally()
                              const p = pct(t)
                              const lv = level(t)
                              const ts = time?.bySkill.get(s)
                              return (
                                <tr key={s}>
                                  <th scope="row">
                                    <button className="link" onClick={() => practice(s, 'new')} title={`Practice ${s}`}>
                                      {s}
                                    </button>
                                    <span className="an-sub">
                                      {t.done} of {t.total} answered
                                    </span>
                                  </th>
                                  <td>
                                    <div className="an-acc">
                                      <div className="mastery">
                                        <span className={`an-fill lv-${lv}`} style={{ width: `${p ?? 0}%` }} />
                                      </div>
                                      <span className="num">{p === null ? '–' : `${p}%`}</span>
                                    </div>
                                  </td>
                                  {DIFFICULTIES.map((d) => {
                                    const c = stats.bySkillDiff.get(`${s}|${d}`) ?? tally()
                                    return (
                                      <td key={d} className="num" title={`${c.correct} of ${c.done} right · ${c.total} ${d.toLowerCase()} questions`}>
                                        {c.done ? `${c.correct}/${c.done}` : <span className="muted">–</span>}
                                      </td>
                                    )
                                  })}
                                  {time && <td className="num">{ts ? fmtSeconds(ts.sum / ts.n) : <span className="muted">–</span>}</td>}
                                  <td>
                                    <span className={`an-level lv-${lv}`}>{LEVEL_LABEL[lv]}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </section>

              {accountsEnabled && !account && (
                <p className="an-note">
                  <button className="link" onClick={() => void signInWithGoogle()}>
                    Sign in
                  </button>{' '}
                  to keep these stats on every device and see your average time per question.
                </p>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
