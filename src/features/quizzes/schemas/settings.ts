import type { QuizMode, QuizSettings } from '../types'

export function defaultQuizSettings(mode: QuizMode): QuizSettings {
  return {
    answerReveal: mode === 'flashcards' ? 'never' : mode === 'canvas' ? 'after_submit' : 'after_each',
    participation: { type: 'individual' },
    scoreVisibility: mode === 'flashcards' ? 'hidden' : 'immediate',
    scoresReleased: false,
    timeLimitMinutes: null,
    timeLimitSeconds: null,
    opensAt: null,
    closesAt: null,
    attemptsAllowed: null,
    shuffleQuestions: false,
    shuffleOptions: false,
  }
}
