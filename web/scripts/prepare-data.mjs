// Splits each subject's questions.json into a small catalog + one file per skill, and copies the images.
//   ../data/        -> public/data/        (Reading and Writing)
//   ../data/math/   -> public/data/math/   (Math)
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = join(root, '..', 'data')
const pub = join(root, 'public', 'data')

// keep in sync with skillSlug() in src/data.ts
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function prepare(src, out, assets) {
  const questions = JSON.parse(readFileSync(join(src, 'questions.json'), 'utf8'))
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
  for (const a of assets) if (existsSync(join(src, a))) cpSync(join(src, a), join(out, a), { recursive: true })
  return `${questions.length} questions in ${bySkill.size} skill files`
}

rmSync(pub, { recursive: true, force: true })
console.log('Reading and Writing:', prepare(data, pub, ['figures']))
console.log('Math:', prepare(join(data, 'math'), join(pub, 'math'), ['figures', 'sprites']))
