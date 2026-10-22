import type { QuizMode, QuizSettings } from '../types'
import { Timestamp } from 'firebase/firestore'

/** The current moment, rounded down to the minute so it matches what the date and time pickers can show. */
export function currentMinute(): Timestamp {
  return Timestamp.fromMillis(Math.floor(Date.now() / 60_000) * 60_000)
}

export function defaultQuizSettings(mode: QuizMode): QuizSettings {
  return {
    answerReveal: mode === 'flashcards' ? 'never' : 'after_each',
    participation: { type: 'individual' },
    scoreVisibility: mode === 'flashcards' ? 'hidden' : 'immediate',
    scoresReleased: false,
    timeLimitMinutes: null,
    timeLimitSeconds: null,
    opensAt: currentMinute(),
    closesAt: null,
    attemptsAllowed: null,
    shuffleQuestions: false,
    shuffleOptions: false,
  }
}
