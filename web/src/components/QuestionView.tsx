import type { Letter, Question } from '../types'
import { Stimulus, Html } from './Stimulus'
import { CheckIcon, CrossIcon } from './Icons'
import { GRID_CHARS, correctLabel, gridMax, isCorrect, isSpr } from '../answer'

/** answering: choosing; done: checked (one chance per question) */
export type Phase = 'answering' | 'done'

interface Props {
  q: Question
  phase: Phase
  selected: string | null // a letter, or the typed entry for a grid-in
  tried: string[] // the wrong choice the student picked, if any
  crossed: string[]
  onSelect: (response: string) => void
  onToggleCross: (l: Letter) => void
  /** Enter in the grid-in box */
  onSubmit?: () => void
}

export function QuestionView(props: Props) {
  if (isSpr(props.q)) return <GridIn {...props} />
  return <MultipleChoice {...props} />
}

function MultipleChoice({ q, phase, selected, tried, crossed, onSelect, onToggleCross }: Props) {
  const locked = phase !== 'answering'
  // Reading and Writing: passage beside the question; Math: one column, as in Bluebook
  const split = q.stimulus.length > 0 && q.test !== 'Math'
  return (
    <article className={`question ${split ? 'split' : ''}`}>
      {split && (
        <section className="pane-passage" aria-label="Passage">
          <Stimulus blocks={q.stimulus} />
        </section>
      )}
      <section className="pane-question">
        {!split && q.stimulus.length > 0 && <Stimulus blocks={q.stimulus} />}
        <Html as="p" className="stem" html={q.stem} />
        <p className="choose">Choose 1 answer:</p>
        <ul className="choices" role="radiogroup" aria-label="Answer choices">
          {q.choices.map(({ letter, html }) => {
            const isTried = tried.includes(letter)
            const isRight = letter === q.answer
            const isSelected = selected === letter
            const isCrossed = crossed.includes(letter) && phase === 'answering'
            let state = ''
            if (phase === 'done') state = isRight ? 'correct' : isTried ? 'incorrect' : 'faded'
            else state = isSelected ? 'selected' : ''
            // right answer: explain every choice; wrong answer: explain the pick (red) and the correct one (green)
            const showWhy = phase === 'done' && (tried.length === 0 || isRight || isTried)
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
                    {state === 'incorrect' && <CrossIcon size={13} />}
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
        <Notes q={q} />
      </section>
    </article>
  )
}

const Notes = ({ q }: { q: Question }) => (
  <>
    {q.notes?.map((n, i) => (
      <p key={i} className="note">
        Note: {n}
      </p>
    ))}
  </>
)

/** Student-produced response (Math): type the answer, as in Bluebook. */
function GridIn({ q, phase, selected, onSelect, onSubmit }: Props) {
  const value = selected ?? ''
  const done = phase === 'done'
  const right = done && isCorrect(q, value)
  const split = q.stimulus.length > 0 && q.test !== 'Math'
  return (
    <article className={`question ${split ? 'split' : ''}`}>
      {split && (
        <section className="pane-passage" aria-label="Question details">
          <Stimulus blocks={q.stimulus} />
        </section>
      )}
      <section className="pane-question">
        {!split && q.stimulus.length > 0 && <Stimulus blocks={q.stimulus} />}
        <Html as="p" className="stem" html={q.stem} />
        <div className={`gridin ${done ? (right ? 'correct' : 'incorrect') : ''}`}>
          <label className="choose" htmlFor={`gi-${q.id}`}>
            Enter your answer:
          </label>
          <div className="gridin-row">
            <input
              id={`gi-${q.id}`}
              className="gridin-input"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={value}
              disabled={done}
              maxLength={gridMax(value)}
              placeholder="e.g. 3/4 or .75"
              onChange={(e) => {
                const v = e.target.value.replace(/\s/g, '').replace(/[−–]/g, '-')
                if (GRID_CHARS.test(v) && v.length <= gridMax(v)) onSelect(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onSubmit) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
            />
            {done && <span className="gridin-mark">{right ? <CheckIcon size={18} /> : <CrossIcon size={16} />}</span>}
          </div>
          {!done && <p className="gridin-hint">Fractions (3/4) and decimals (.75) both work. Use - for a negative answer.</p>}
          {done && (
            <p className="gridin-answer">
              {right ? 'Correct.' : value ? 'Not quite.' : 'No answer.'} Accepted answer{(q.answers?.length ?? 0) > 1 ? 's' : ''}: <strong>{correctLabel(q)}</strong>
            </p>
          )}
        </div>
        {done && (
          <div className="explanation">
            <h3>Explanation</h3>
            {q.rationale.paragraphs.map((p, i) => (
              <Html key={i} as="p" html={p} />
            ))}
          </div>
        )}
        <Notes q={q} />
      </section>
    </article>
  )
}
