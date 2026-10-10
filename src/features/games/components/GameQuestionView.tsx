import { Button } from '../../../shared/ui/Button'
import { answeredCount } from '../schemas'
import type { CurrentQuestion, Game, GamePlayer, RevealState } from '../types'
import { GameLeaderboard } from './GameLeaderboard'

const LETTERS = ['A', 'B', 'C', 'D']

interface Props {
  game: Game
  current: CurrentQuestion
  reveal: RevealState | null
  players: GamePlayer[]
  isHost: boolean
  meUid: string
  busy: boolean
  secondsLeft: number | null
  /** The option this device picked for the open question, if any. */
  chosen: number | null
  onAnswer: (optionIndex: number) => void
  onNext: () => void
}

export function GameQuestionView({ game, current, reveal, players, isHost, meUid, busy, secondsLeft, chosen, onAnswer, onNext }: Props) {
  const revealing = game.status === 'reveal' && reveal !== null && reveal.questionIndex === current.questionIndex
  const me = players.find(player => player.uid === meUid)
  const locked = chosen !== null || me?.answeredIndex === current.questionIndex
  const answered = answeredCount(players, current.questionIndex)
  const earned = reveal?.perPlayerPoints[meUid] ?? 0
  const last = game.questionIndex >= game.questionCount - 1
  return (
    <section className="flex min-h-[70dvh] flex-col gap-4" aria-labelledby="question-title">
      <div className="flex items-center justify-between gap-3 text-sm text-navy-900">
        <p className="m-0 font-semibold">Question {current.questionIndex + 1} of {game.questionCount}</p>
        {!revealing && secondsLeft !== null && <p role="timer" aria-label={`${secondsLeft} seconds left`} className="m-0 rounded-full bg-navy-900-5 px-3 py-1 text-base font-bold">{secondsLeft}s</p>}
      </div>
      <h2 id="question-title" className="m-0 rounded-3xl border border-navy-900-15 bg-white p-5 text-2xl font-bold text-navy-900 shadow-sm">{current.prompt}</h2>
      {isHost && !revealing && <p className="m-0 text-base text-navy-900" role="status">{answered} of {players.length} answered</p>}
      {!isHost && !revealing && <p className="m-0 text-base text-navy-900" role="status">{locked ? 'Answer locked in. Waiting for everyone else…' : 'Pick an answer'}</p>}
      {revealing && !isHost && <p className="m-0 text-lg font-bold text-navy-900" role="status">{chosen === reveal.correctOptionIndex || earned > 0 ? `Correct! +${earned} points` : locked ? 'Not this time. 0 points' : 'No answer. 0 points'}</p>}
      <ul className="m-0 mt-auto grid list-none gap-3 p-0 sm:grid-cols-2" aria-label="Answers">
        {current.options.map((option, index) => {
          const correct = revealing && reveal.correctOptionIndex === index
          const mine = chosen === index
          const state = correct ? 'border-4 border-navy-900 bg-navy-900-5' : mine ? 'border-2 border-navy-900' : 'border border-navy-900-30'
          return (
            <li key={`${current.questionIndex}-${index}`}>
              <button
                type="button"
                disabled={isHost || locked || revealing || busy || (secondsLeft !== null && secondsLeft <= 0)}
                aria-pressed={mine}
                onClick={() => onAnswer(index)}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white p-4 text-left text-lg text-navy-900 disabled:cursor-default ${state}`}
              >
                <span className="shrink-0 font-bold" aria-hidden="true">{LETTERS[index]}</span>
                <span className="min-w-0 break-words">{option}</span>
                {correct && <span className="ml-auto shrink-0 text-sm font-bold">Correct answer</span>}
                {mine && !correct && <span className="ml-auto shrink-0 text-sm">Your answer</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {revealing && <GameLeaderboard players={players} meUid={meUid} reveal={reveal} limit={5}/>}
      {revealing && isHost && <Button disabled={busy} onClick={onNext}>{last ? 'Show final results' : 'Next question'}</Button>}
      {revealing && !isHost && <p className="m-0 text-base text-navy-900" role="status">Waiting for the host to continue…</p>}
    </section>
  )
}
