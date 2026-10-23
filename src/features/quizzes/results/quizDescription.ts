import { effectiveTimeLimitSeconds, formatDuration } from '../quizTiming'
import type { QuizSettings } from '../types'
import { quizTypeLabel } from './resultLogic'

/** The parts of a quiz the results table and export describe. Accepts any mode string so older or newer kinds still render. */
export interface DescribableQuiz {
  title: string
  mode: string
  questionCount: number
  settings: Pick<QuizSettings, 'participation' | 'timeLimitMinutes' | 'timeLimitSeconds' | 'attemptsAllowed'>
}

/** One readable value per detail. The CSV writes each as its own column; the table joins them into two lines. */
export interface QuizResultsFacts {
  questions: string
  participation: string
  /** null when a time limit does not apply to this kind of activity (canvas). */
  timeLimit: string | null
  attempts: string
}

export interface QuizResultsDescription {
  title: string
  typeLabel: string
  /** At most two short lines for the "Quiz details" cell. */
  details: string[]
  facts: QuizResultsFacts
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function timeLimitText(quiz: DescribableQuiz): string | null {
  if (quiz.mode === 'canvas') return null
  const { participation } = quiz.settings
  const seconds = participation.type === 'group' && participation.questionTimeSec !== null
    ? participation.questionTimeSec
    : effectiveTimeLimitSeconds(quiz.settings)
  return seconds === null ? 'No time limit' : `${formatDuration(seconds)} per question`
}

/**
 * The quiz name and a compact summary of its setup, shown on every results row and written to every CSV row,
 * so the screen and the export always describe the quiz the same way.
 */
export function describeQuizForResults(quiz: DescribableQuiz, className: string): QuizResultsDescription {
  const count = Math.max(0, Math.floor(quiz.questionCount))
  const { participation, attemptsAllowed } = quiz.settings
  const facts: QuizResultsFacts = {
    questions: plural(count, quiz.mode === 'flashcards' ? 'card' : 'question'),
    participation: participation.type === 'group' ? `Group of up to ${participation.groupSize}` : 'Individual',
    timeLimit: timeLimitText(quiz),
    attempts: attemptsAllowed === null ? 'Unlimited attempts' : plural(attemptsAllowed, 'attempt'),
  }
  const firstLine = [className, facts.questions, facts.participation].filter(Boolean).join(' · ')
  const secondLine = [facts.timeLimit, facts.attempts].filter((item): item is string => Boolean(item)).join(' · ')
  return {
    title: quiz.title.trim() || 'Untitled quiz',
    typeLabel: quizTypeLabel(quiz.mode),
    details: [firstLine, secondLine],
    facts,
  }
}
