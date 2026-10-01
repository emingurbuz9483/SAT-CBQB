import type { Question } from '../types'
import type { Result } from '../session'
import { navigate } from '../router'
import { CheckIcon, CrossIcon } from './Icons'

interface Props {
  questions: Question[]
  results: Result[]
  title: string
  onAgain: () => void
  onMistakes: () => void
}

const preview = (q: Question) => q.stem.replace(/<[^>]+>/g, '')

export function Summary({ questions, results, title, onAgain, onMistakes }: Props) {
  const correct = results.filter((r) => r === 'correct').length
  const wrong = results.filter((r) => r === 'incorrect').length
  const pct = Math.round((correct / questions.length) * 100)
  return (
    <div className="summary">
      <div className="summary-card">
        <p className="crumb">{title}</p>
        <h1>
          {correct} of {questions.length} correct on the first try
        </h1>
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol className="summary-list">
          {questions.map((q, i) => (
            <li key={q.id} className={results[i] ?? 'skipped'}>
              <span className="summary-icon">
                {results[i] === 'correct' ? <CheckIcon size={14} /> : results[i] === 'incorrect' ? <CrossIcon size={13} /> : '–'}
              </span>
              <span className={`diff diff-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
              <span className="summary-stem">{preview(q)}</span>
            </li>
          ))}
        </ol>
        <div className="summary-actions">
          <button className="btn secondary" onClick={() => navigate('/')}>
            Back to skills
          </button>
          {wrong > 0 && (
            <button className="btn secondary" onClick={onMistakes}>
              Redo my mistakes
            </button>
          )}
          <button className="btn primary" onClick={onAgain}>
            Practice again
          </button>
        </div>
      </div>
    </div>
  )
}
