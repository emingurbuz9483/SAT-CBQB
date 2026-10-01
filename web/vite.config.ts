import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Progress is written next to the project: SAT CBQB/progress/
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'progress')
const FILE = join(DIR, 'progress.json') // latest result per question (what the app reads back)
const HISTORY = join(DIR, 'history.jsonl') // one line per Check, never rewritten

type Rec = { r: 'c' | 'i'; n: number; t: number }

function readRecords(): Record<string, Rec> {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')).records ?? {}
  } catch {
    return {}
  }
}

function writeRecords(records: Record<string, Rec>) {
  mkdirSync(DIR, { recursive: true })
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify({ updated: new Date().toISOString(), records }, null, 1))
  renameSync(tmp, FILE) // atomic: a crash never leaves a half-written file
}

const isRec = (v: unknown): v is Rec =>
  !!v && typeof v === 'object' && ((v as Rec).r === 'c' || (v as Rec).r === 'i') && Number.isFinite((v as Rec).n) && Number.isFinite((v as Rec).t)

function body(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (c) => {
      s += c
      if (s.length > 5_000_000) reject(new Error('too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'))
      } catch (e) {
        reject(e)
      }
    })
  })
}

const handler: Connect.NextHandleFunction = async (req, res, next) => {
  const url = req.url ?? ''
  if (!url.startsWith('/api/progress')) return next()
  const send = (code: number, data: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }
  try {
    if (req.method === 'GET') return send(200, { records: readRecords() })
    if (req.method === 'POST' && url.startsWith('/api/progress/reset')) {
      if (existsSync(FILE)) renameSync(FILE, join(DIR, `progress-backup-${Date.now()}.json`))
      mkdirSync(DIR, { recursive: true })
      appendFileSync(HISTORY, JSON.stringify({ type: 'reset', at: new Date().toISOString() }) + '\n')
      return send(200, { records: {} })
    }
    if (req.method === 'POST') {
      const b = (await body(req)) as { records?: Record<string, unknown>; events?: unknown[] }
      const records = readRecords()
      for (const [id, rec] of Object.entries(b.records ?? {})) {
        // keep whichever record is newer (several tabs / the browser copy may also write)
        if (/^[0-9a-f]{8}$/.test(id) && isRec(rec) && (!records[id] || records[id].t <= rec.t)) records[id] = rec
      }
      writeRecords(records)
      const events = (b.events ?? []).filter((e) => e && typeof e === 'object')
      if (events.length) appendFileSync(HISTORY, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
      return send(200, { ok: true })
    }
    send(405, { error: 'method not allowed' })
  } catch (e) {
    send(500, { error: String(e) })
  }
}

function progressFiles(): Plugin {
  return {
    name: 'cbqb-progress-files',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), progressFiles()],
})
