import { useSyncExternalStore } from 'react'

/** Latest outcome per question: r = first-try result of the latest attempt, n = attempts, t = time. */
export interface Rec {
  r: 'c' | 'i'
  n: number
  t: number
}
export type Progress = Record<string, Rec>

/** One line of progress/history.jsonl */
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

/** 'folder' = saved to SAT CBQB/progress/ by the local dev server; 'browser' = localStorage only */
export type StorageMode = 'checking' | 'folder' | 'browser'

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

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private mode): the folder copy, if any, still works
  }
}

function post(path: string, payload: unknown) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  })
}

// Load the folder copy and merge it with this browser's copy (newest record wins).
fetch(API)
  .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : Promise.reject(new Error('no progress api'))))
  .then((file: { records: Progress }) => {
    const merged: Progress = { ...file.records }
    const onlyLocal: Progress = {}
    for (const [id, rec] of Object.entries(state)) {
      if (!merged[id] || merged[id].t < rec.t) {
        merged[id] = rec
        onlyLocal[id] = rec
      }
    }
    state = merged
    mode = 'folder'
    writeLocal()
    emit()
    if (Object.keys(onlyLocal).length) post(API, { records: onlyLocal }).catch(() => {})
  })
  .catch(() => {
    mode = 'browser'
    emit()
  })

export function recordResult(id: string, correct: boolean) {
  const prev = state[id]
  const rec: Rec = { r: correct ? 'c' : 'i', n: (prev?.n ?? 0) + 1, t: Date.now() }
  state = { ...state, [id]: rec }
  writeLocal()
  emit()
  if (mode !== 'browser') post(API, { records: { [id]: rec } }).catch(() => {})
}

/** Every press of Check, kept as a permanent log in progress/history.jsonl */
export function logCheck(e: Omit<CheckEvent, 'type' | 'at'>) {
  if (mode === 'browser') return
  post(API, { events: [{ type: 'check', at: new Date().toISOString(), ...e }] }).catch(() => {})
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
}

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
