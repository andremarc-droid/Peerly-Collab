import { useState } from 'react'
import { CircleCheck, CircleX, ArrowRight, RotateCcw, X } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { isCorrect } from '../../quizzes/grading/grade'
import type { AnswerKey, QuizQuestion } from '../../quizzes/types'
import {
  startQuizSession,
  answerQuestion,
  nextQuestion,
  retryMissed,
  quizSummary,
  type QuizSession,
} from '../../studyEngine/quizSession'

export interface MasteryItem {
  id: string
  question: QuizQuestion & { id: string }
  key: AnswerKey
}

interface Props {
  items: MasteryItem[]
  onExit: () => void
}

function answerLabel(item: MasteryItem): string {
  const { question, key } = item
  if (key.type === 'choice' && 'options' in question) {
    const opt = question.options.find((o) => o.id === key.correctOptionId)
    return opt?.text ?? key.correctOptionId
  }
  if (key.type === 'identification') return key.acceptedAnswers.join(', ')
  if (key.type === 'fill_blank') return key.blanks.map((b) => b.join(' / ')).join(' · ')
  if (key.type === 'flashcard') return key.back
  return ''
}

export function MasteryPractice({ items, onExit }: Props) {
  const [session, setSession] = useState<QuizSession<MasteryItem>>(() =>
    startQuizSession(items),
  )
  const [inputText, setInputText] = useState('')
  const [blankAnswers, setBlankAnswers] = useState<string[]>([])
  const [flashcardRevealed, setFlashcardRevealed] = useState(false)
  const [roundFinished, setRoundFinished] = useState(false)

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm">
        <p className="m-0 text-base text-navy-900">No missed questions to practice.</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={onExit}>
            Back to result
          </Button>
        </div>
      </div>
    )
  }

  const isComplete = roundFinished || session.questions.length === 0
  const summary = quizSummary(session)

  if (isComplete) {
    const allMastered = session.missed.length === 0
    return (
      <section
        className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm"
        aria-label="Mastery practice complete"
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-navy-800-72">
          <span>Mastery Mode</span>
          <span>·</span>
          <span>Round {summary.round}</span>
        </div>
        <h3 className="m-0 mt-2 font-heading text-2xl font-bold text-navy-900">
          {allMastered ? 'Mastery achieved!' : `Round ${summary.round} complete`}
        </h3>
        <p className="m-0 mt-2 text-base text-navy-800 leading-relaxed">
          {allMastered
            ? `You got all previously missed questions right across ${summary.round} round${summary.round > 1 ? 's' : ''}! Great job reinforcing your knowledge.`
            : `You answered ${summary.correct} of ${summary.total} correctly this round. ${summary.missed} question${summary.missed > 1 ? 's' : ''} still need${summary.missed === 1 ? 's' : ''} practice.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!allMastered && (
            <Button
              type="button"
              onClick={() => {
                setSession((s) => retryMissed(s))
                setRoundFinished(false)
                setInputText('')
                setBlankAnswers([])
                setFlashcardRevealed(false)
              }}
            >
              <RotateCcw size={16} aria-hidden="true" className="mr-1 inline" />
              Retry missed questions ({session.missed.length})
            </Button>
          )}
          <Button variant="secondary" type="button" onClick={onExit}>
            Back to result review
          </Button>
        </div>
      </section>
    )
  }

  const current = session.questions[session.index]!
  const hasAnswered = session.verdict !== null
  const isLastQuestion = session.index >= session.questions.length - 1

  const handleChoice = (optionId: string) => {
    if (hasAnswered) return
    const correct = Boolean(isCorrect(current.question, current.key, optionId))
    setSession((s) => answerQuestion(s, optionId, correct ? 'correct' : 'incorrect'))
  }

  const handleIdentification = (e: React.FormEvent) => {
    e.preventDefault()
    if (hasAnswered || !inputText.trim()) return
    const correct = Boolean(isCorrect(current.question, current.key, inputText.trim()))
    setSession((s) => answerQuestion(s, inputText.trim(), correct ? 'correct' : 'incorrect'))
  }

  const handleFillBlank = (e: React.FormEvent) => {
    e.preventDefault()
    if (hasAnswered) return
    const correct = Boolean(isCorrect(current.question, current.key, blankAnswers))
    setSession((s) => answerQuestion(s, blankAnswers.join(' / '), correct ? 'correct' : 'incorrect'))
  }

  const handleFlashcardRating = (verdict: 'correct' | 'incorrect') => {
    if (hasAnswered) return
    setSession((s) => answerQuestion(s, verdict === 'correct' ? 'knew' : 'learning', verdict))
  }

  const handleNext = () => {
    setSession((s) => nextQuestion(s))
    setInputText('')
    setBlankAnswers([])
    setFlashcardRevealed(false)
  }

  return (
    <section
      className="rounded-3xl border border-navy-900-15 bg-white p-6 shadow-sm"
      aria-label="Mastery practice"
    >
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-navy-900-12">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-navy-800-72">
          <span>Mastery Mode</span>
          <span>·</span>
          <span>Round {session.round}</span>
          <span>·</span>
          <span>
            Question {session.index + 1} of {session.questions.length}
          </span>
        </div>
        <Button variant="tertiary" type="button" onClick={onExit} aria-label="Exit mastery practice">
          <X size={16} aria-hidden="true" className="mr-1 inline" />
          Exit practice
        </Button>
      </div>

      <div className="mt-4">
        <h3 className="m-0 font-heading text-xl font-bold text-navy-900">
          {current.question.prompt}
        </h3>

        {/* Options / Inputs based on question type */}
        <div className="mt-4">
          {(current.question.type === 'multiple_choice' || current.question.type === 'true_false') &&
            'options' in current.question && (
              <div className="grid gap-2" role="group" aria-label="Answer options">
                {current.question.options.map((opt) => {
                  const isSelected = session.answer === opt.id
                  const isCorrectOpt =
                    current.key.type === 'choice' && current.key.correctOptionId === opt.id
                  const stateClass = hasAnswered
                    ? isCorrectOpt
                      ? 'border-2 border-navy-900 bg-navy-900-5 font-bold'
                      : isSelected
                        ? 'border-2 border-navy-900-30 bg-navy-900-5 line-through opacity-70'
                        : 'border border-navy-900-15 opacity-60'
                    : 'border border-navy-900-30 hover:border-navy-900 hover:bg-navy-900-5'

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => handleChoice(opt.id)}
                      className={`flex min-h-12 w-full items-center justify-between rounded-xl p-3 text-left text-base text-navy-900 transition-colors focus:outline-none focus:ring-2 focus:ring-navy-600 ${stateClass}`}
                    >
                      <span>{opt.text}</span>
                      {hasAnswered && isCorrectOpt && (
                        <span className="text-xs font-bold uppercase tracking-wider text-navy-900">
                          Correct answer
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

          {current.question.type === 'identification' && (
            <form onSubmit={handleIdentification} className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-navy-900">Your answer</span>
                <input
                  type="text"
                  value={inputText}
                  disabled={hasAnswered}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-11 rounded-xl border border-navy-900-30 px-3 py-2 text-base text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-600 disabled:opacity-70"
                  placeholder="Type your answer…"
                  autoFocus
                />
              </label>
              {!hasAnswered && (
                <div>
                  <Button type="submit" disabled={!inputText.trim()}>
                    Check answer
                  </Button>
                </div>
              )}
            </form>
          )}

          {current.question.type === 'fill_blank' && current.key.type === 'fill_blank' && (
            <form onSubmit={handleFillBlank} className="grid gap-3">
              {current.key.blanks.map((_, bIndex) => (
                <label key={bIndex} className="grid gap-1">
                  <span className="text-sm font-semibold text-navy-900">
                    Blank {bIndex + 1}
                  </span>
                  <input
                    type="text"
                    value={blankAnswers[bIndex] ?? ''}
                    disabled={hasAnswered}
                    onChange={(e) => {
                      const next = [...blankAnswers]
                      next[bIndex] = e.target.value
                      setBlankAnswers(next)
                    }}
                    className="min-h-11 rounded-xl border border-navy-900-30 px-3 py-2 text-base text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-600 disabled:opacity-70"
                    placeholder={`Answer for blank ${bIndex + 1}…`}
                  />
                </label>
              ))}
              {!hasAnswered && (
                <div>
                  <Button type="submit">Check answer</Button>
                </div>
              )}
            </form>
          )}

          {current.question.type === 'flashcard' && current.key.type === 'flashcard' && (
            <div className="grid gap-4">
              {!flashcardRevealed ? (
                <Button type="button" onClick={() => setFlashcardRevealed(true)}>
                  Show answer
                </Button>
              ) : (
                <div className="grid gap-3">
                  <div className="rounded-xl border border-navy-900-15 bg-navy-900-5 p-4">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-navy-800-72">
                      Answer
                    </span>
                    <p className="m-0 mt-1 text-base text-navy-900 font-medium">
                      {current.key.back}
                    </p>
                  </div>
                  {!hasAnswered && (
                    <div className="flex gap-2">
                      <Button type="button" onClick={() => handleFlashcardRating('correct')}>
                        Got it
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => handleFlashcardRating('incorrect')}
                      >
                        Still learning
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback / Verdict after answering */}
        {hasAnswered && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              session.verdict === 'correct'
                ? 'border-navy-900 bg-navy-900-5'
                : 'border-navy-900-20 bg-navy-900-5'
            }`}
            role="status"
          >
            <div className="flex items-center gap-2 font-bold text-navy-900">
              {session.verdict === 'correct' ? (
                <>
                  <CircleCheck size={18} className="text-navy-900" aria-hidden="true" />
                  <span>Correct!</span>
                </>
              ) : (
                <>
                  <CircleX size={18} className="text-navy-900" aria-hidden="true" />
                  <span>Needs practice</span>
                </>
              )}
            </div>
            {session.verdict !== 'correct' && (
              <p className="m-0 mt-2 text-sm text-navy-900">
                <strong>Correct answer:</strong> {answerLabel(current)}
              </p>
            )}
            {current.key.explanation && (
              <p className="m-0 mt-1 text-sm text-navy-800 leading-relaxed">
                {current.key.explanation}
              </p>
            )}
            <div className="mt-3">
              <Button
                type="button"
                onClick={() => {
                  if (isLastQuestion) {
                    setRoundFinished(true)
                  } else {
                    handleNext()
                  }
                }}
              >
                {isLastQuestion ? 'Complete round' : 'Next question'}
                <ArrowRight size={16} aria-hidden="true" className="ml-1 inline" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
