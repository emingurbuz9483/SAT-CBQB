import { useEffect, useState } from 'react'
import type { Subject } from '../types'
import { SUBJECTS, subjectPath } from '../data'
import { accountsEnabled, signInWithGoogle, useAccount } from '../progress'
import { supabase } from '../supabase'
import { navigate } from '../router'

/** One row from public.leaderboard() */
interface Row {
  rank: number
  name: string
  avatar: string | null
  answered: number
  correct: number
  is_me: boolean
}

const PERIODS = [
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 },
  { id: 'all', label: 'All time', days: null },
] as const
type Period = (typeof PERIODS)[number]['id']

export function Leaderboard({ subject }: { subject: Subject }) {
  const { name, domains } = SUBJECTS[subject]
  const { account } = useAccount()
  const [period, setPeriod] = useState<Period>('week')
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = `${account?.id}|${subject}|${period}`
  const rows = loaded?.key === key ? loaded.rows : null

  useEffect(() => {
    if (!supabase || !account) return
    let live = true
    const days = PERIODS.find((p) => p.id === period)!.days
    supabase
      .rpc('leaderboard', {
        domains: domains.map((d) => d.name),
        since: days ? new Date(Date.now() - days * 864e5).toISOString() : null,
      })
      .then(({ data, error }) => {
        if (!live) return
        if (error) {
          console.error('[cbqb] leaderboard failed', error)
          setError(error.message)
          return
        }
        setError(null)
        setLoaded({ key, rows: data as Row[] })
      })
    return () => {
      live = false
    }
  }, [account, domains, period, key])

  const me = rows?.find((r) => r.is_me)

  return (
    <div className="home analytics">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Leaderboard · {name}</p>
          <h1>Who’s practiced the most</h1>
          <p className="hero-sub">Ranked by how many different questions each student has answered. Ties go to more right on the first try.</p>
          {me && (
            <div className="hero-stats">
              <div>
                <strong>#{me.rank}</strong>
                <span>your rank</span>
              </div>
              <div>
                <strong>{me.answered}</strong>
                <span>answered</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="home-body">
        {!accountsEnabled ? (
          <div className="an-empty">
            <h2>Leaderboard needs accounts</h2>
            <p className="muted">Sign-in isn’t set up on this site, so there’s no one to rank yet.</p>
          </div>
        ) : !account ? (
          <div className="an-empty">
            <h2>Sign in to see the leaderboard</h2>
            <p className="muted">Answers you give while signed in count toward your place.</p>
            <button className="btn primary" onClick={() => void signInWithGoogle()}>
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            <div className="filters">
              <div className="filter">
                <span className="filter-label">Period</span>
                <div className="seg">
                  {PERIODS.map((p) => (
                    <button key={p.id} className={`seg-btn ${period === p.id ? 'on' : ''}`} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="error">Couldn’t load the leaderboard ({error}).</p>}
            {!rows && !error && <p className="muted lb-loading">Loading…</p>}
            {rows && rows.length === 0 && (
              <div className="an-empty">
                <h2>No one on the board yet</h2>
                <p className="muted">Be the first: answer a few questions and you’ll show up here.</p>
                <button className="btn primary" onClick={() => navigate(subjectPath(subject, '/'))}>
                  Start practicing
                </button>
              </div>
            )}
            {rows && rows.length > 0 && (
              <ol className="lb-list">
                {rows.map((r, i) => (
                  <li key={i} className={`lb-row ${r.is_me ? 'me' : ''} ${r.is_me && r.rank > 50 ? 'gap' : ''}`}>
                    <span className={`lb-rank ${r.rank <= 3 ? `top top-${r.rank}` : ''}`}>{r.rank}</span>
                    {r.avatar ? <img className="lb-avatar" src={r.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="lb-avatar avatar-fallback">{r.name[0]}</span>}
                    <span className="lb-name">
                      {r.name}
                      {r.is_me && <em> (you)</em>}
                    </span>
                    <span className="lb-stat">
                      <strong>{r.answered}</strong>
                      <span>answered</span>
                    </span>
                    <span className="lb-stat">
                      <strong>{r.answered ? Math.round((r.correct / r.answered) * 100) : 0}%</strong>
                      <span>first try</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
