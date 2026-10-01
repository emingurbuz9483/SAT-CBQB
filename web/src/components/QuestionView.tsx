import type { Letter, Question } from '../types'
import { Stimulus, Html } from './Stimulus'
import { CheckIcon, CrossIcon } from './Icons'

/** answering: choosing; wrong: just checked a wrong choice; done: answered correctly or explanation revealed */
export type Phase = 'answering' | 'wrong' | 'done'

interface Props {
  q: Question
  phase: Phase
  selected: Letter | null
  tried: Letter[] // wrong choices already tried
  crossed: Letter[]
  onSelect: (l: Letter) => void
  onToggleCross: (l: Letter) => void
}

export function QuestionView({ q, phase, selected, tried, crossed, onSelect, onToggleCross }: Props) {
  const locked = phase !== 'answering'
  return (
    <article className="question">
      <Stimulus blocks={q.stimulus} />
      <Html as="p" className="stem" html={q.stem} />
      <p className="choose">Choose 1 answer:</p>
      <ul className="choices" role="radiogroup" aria-label="Answer choices">
        {q.choices.map(({ letter, html }) => {
          const isTried = tried.includes(letter)
          const isCorrect = letter === q.answer
          const isSelected = selected === letter
          const isCrossed = crossed.includes(letter) && phase === 'answering'
          let state = ''
          if (phase === 'done') state = isCorrect ? 'correct' : isTried ? 'incorrect' : 'faded'
          else if (phase === 'wrong') state = isSelected ? 'incorrect' : isTried ? 'tried' : ''
          else state = isTried ? 'tried' : isSelected ? 'selected' : ''
          const showWhy = phase === 'done' || (phase === 'wrong' && isSelected)
          const why = q.rationale.byChoice[letter]
          return (
            <li key={letter} className={`choice ${state} ${isCrossed ? 'crossed' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                className="choice-main"
                disabled={locked || isTried}
                onClick={() => onSelect(letter)}
              >
                <span className="bubble" aria-hidden="true">
                  {state === 'correct' && <CheckIcon size={14} />}
                  {(state === 'incorrect' || state === 'tried') && <CrossIcon size={13} />}
                  {letter}
                </span>
                <span className="choice-body">
                  <Html className="choice-text" html={html} />
                  {showWhy && why && <Html as="span" className="why" html={why} />}
                </span>
              </button>
              {phase === 'answering' && !isTried && (
                <button
                  type="button"
                  className={`cross-btn ${isCrossed ? 'on' : ''}`}
                  aria-label={isCrossed ? `Undo cross out choice ${letter}` : `Cross out choice ${letter}`}
                  title={isCrossed ? 'Undo cross out' : 'Cross out'}
                  onClick={() => onToggleCross(letter)}
                >
                  {isCrossed ? 'Undo' : <s>{letter}</s>}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {q.notes?.map((n, i) => (
        <p key={i} className="note">
          Note: {n}
        </p>
      ))}
    </article>
  )
}
