// Splits ../data/questions.json into a small catalog + one file per skill, and copies the figures.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, '..', 'data')
const out = join(root, 'public', 'data')

// keep in sync with skillSlug() in src/data.ts
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const questions = JSON.parse(readFileSync(join(src, 'questions.json'), 'utf8'))
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'skills'), { recursive: true })

const bySkill = new Map()
for (const q of questions) {
  const k = slug(q.skill)
  if (!bySkill.has(k)) bySkill.set(k, [])
  bySkill.get(k).push(q)
}
for (const [k, qs] of bySkill) writeFileSync(join(out, 'skills', `${k}.json`), JSON.stringify(qs))

const catalog = questions.map((q) => ({ id: q.id, domain: q.domain, skill: q.skill, difficulty: q.difficulty }))
writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog))
cpSync(join(src, 'figures'), join(out, 'figures'), { recursive: true })
console.log(`prepared ${questions.length} questions in ${bySkill.size} skill files`)
