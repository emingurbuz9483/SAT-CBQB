import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/** Latest outcome per question: r = first-try result of the latest attempt, n = attempts, t = time. */
export interface Rec {
  r: 'c' | 'i'
  n: number
  t: number
}
export type Progress = Record<string, Rec>

/** One press of Check (progress/history.jsonl locally, public.attempts in the cloud) */
export interface CheckEvent {
  type: 'check'
  at: string
  id: string
  domain: string
  skill: string
  difficulty: string
  choice: string
  correct: boolean
  attempt: number
  seconds: number
}

/** 'folder' = also saved to SAT CBQB/progress/ by the local dev server; 'browser' = no folder available */
export type StorageMode = 'checking' | 'folder' | 'browser'

export interface Account {
  id: string
  email: string
  name: string
  avatar: string | null
}

const KEY = 'cbqb-progress-v1'
const API = `${import.meta.env.BASE_URL}api/progress`
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function readLocal(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Progress
  } catch {
    return {}
  }
}

let state: Progress = readLocal()
let mode: StorageMode = 'checking'
let account: Account | null = null
let syncing = false
let syncedFor: string | null = null

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private mode): folder / cloud copies still work
  }
}

/** Merge records into state (newest wins); returns the records where this device was newer. */
function mergeIn(incoming: Progress): Progress {
  const merged: Progress = { ...incoming }
  const localNewer: Progress = {}
  for (const [id, rec] of Object.entries(state)) {
    if (!merged[id] || merged[id].t < rec.t) {
      merged[id] = rec
      localNewer[id] = rec
    }
  }
  state = merged
  writeLocal()
  emit()
  return localNewer
}

// ---------------------------------------------------------------- local folder (npm run dev)
function post(path: string, payload: unknown) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  })
}

fetch(API)
  .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : Promise.reject(new Error('no progress api'))))
  .then((file: { records: Progress }) => {
    mode = 'folder'
    const newer = mergeIn(file.records)
    if (Object.keys(newer).length) post(API, { records: newer }).catch(() => {})
  })
  .catch(() => {
    mode = 'browser'
    emit()
  })

// ---------------------------------------------------------------- cloud (Supabase, signed in)
const toRow = (id: string, rec: Rec, userId: string) => ({
  user_id: userId,
  question_id: id,
  result: rec.r,
  attempts: rec.n,
  updated_at: new Date(rec.t).toISOString(),
})

async function pullCloud(userId: string) {
  if (!supabase) return
  syncing = true
  emit()
  try {
    const remote: Progress = {}
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('progress')
        .select('question_id,result,attempts,updated_at')
        .order('question_id')
        .range(from, from + 999)
      if (error) throw error
      for (const row of data) remote[row.question_id] = { r: row.result, n: row.attempts, t: Date.parse(row.updated_at) }
      if (data.length < 1000) break
    }
    const newer = mergeIn(remote) // guest progress made on this device joins the account
    const rows = Object.entries(newer).map(([id, rec]) => toRow(id, rec, userId))
    if (rows.length) {
      const { error } = await supabase.from('progress').upsert(rows, { onConflict: 'user_id,question_id' })
      if (error) throw error
    }
    syncedFor = userId
  } catch (e) {
    console.error('[cbqb] cloud sync failed', e)
  } finally {
    syncing = false
    emit()
  }
}

function setAccount(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null) {
  if (!user) {
    account = null
    syncedFor = null
    emit()
    return
  }
  const m = user.user_metadata ?? {}
  account = {
    id: user.id,
    email: user.email ?? '',
    name: (m.full_name as string) || (m.name as string) || user.email || 'Student',
    avatar: (m.avatar_url as string) || (m.picture as string) || null,
  }
  emit()
  if (syncedFor !== user.id) void pullCloud(user.id)
}

supabase?.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    setAccount(null)
    return
  }
  // defer: supabase-js warns against awaiting its own calls inside this callback
  setTimeout(() => setAccount(session?.user ?? null), 0)
})

export async function signInWithGoogle() {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}${location.pathname}` },
  })
}

/** Signing out also clears this device, so the next student on a shared computer starts fresh. */
export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  state = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  emit()
}

// ---------------------------------------------------------------- writes
export function recordResult(id: string, correct: boolean) {
  const prev = state[id]
  const rec: Rec = { r: correct ? 'c' : 'i', n: (prev?.n ?? 0) + 1, t: Date.now() }
  state = { ...state, [id]: rec }
  writeLocal()
  emit()
  if (mode !== 'browser') post(API, { records: { [id]: rec } }).catch(() => {})
  if (supabase && account) {
    void supabase
      .from('progress')
      .upsert(toRow(id, rec, account.id), { onConflict: 'user_id,question_id' })
      .then(({ error }) => error && console.error('[cbqb] save failed', error))
  }
}

/** Every press of Check, kept as a permanent log. */
export function logCheck(e: Omit<CheckEvent, 'type' | 'at'>) {
  if (mode === 'folder') post(API, { events: [{ type: 'check', at: new Date().toISOString(), ...e }] }).catch(() => {})
  if (supabase && account) {
    void supabase
      .from('attempts')
      .insert({
        user_id: account.id,
        question_id: e.id,
        domain: e.domain,
        skill: e.skill,
        difficulty: e.difficulty,
        choice: e.choice,
        correct: e.correct,
        attempt: e.attempt,
        seconds: e.seconds,
      })
      .then(({ error }) => error && console.error('[cbqb] log failed', error))
  }
}

export function resetProgress() {
  state = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  emit()
  if (mode !== 'browser') post(`${API}/reset`, {}).catch(() => {})
  if (supabase && account) {
    void supabase
      .from('progress')
      .delete()
      .eq('user_id', account.id)
      .then(({ error }) => error && console.error('[cbqb] reset failed', error))
  }
}

// ---------------------------------------------------------------- hooks
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => state)
}

export function useStorageMode(): StorageMode {
  return useSyncExternalStore(subscribe, () => mode)
}

export const accountsEnabled = !!supabase

export function useAccount(): { account: Account | null; syncing: boolean } {
  const a = useSyncExternalStore(subscribe, () => account)
  const s = useSyncExternalStore(subscribe, () => syncing)
  return { account: a, syncing: s }
}
