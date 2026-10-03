import type { QuizMode, QuizSettings } from '../types'

export function defaultQuizSettings(mode: QuizMode): QuizSettings {
  return {
    answerReveal: mode === 'flashcards' ? 'never' : 'after_each',
    participation: { type: 'individual' },
    scoreVisibility: mode === 'flashcards' ? 'hidden' : 'immediate',
    scoresReleased: false,
    timeLimitMinutes: null,
    attemptsAllowed: null,
    shuffleQuestions: false,
    shuffleOptions: false,
  }
}
