import type { AnswerVerdict } from './grading'
export interface SessionQuestion { id: string }
export interface QuizSession<Q extends SessionQuestion = SessionQuestion> { questions: Q[]; index: number; answer: string | number | null; verdict: AnswerVerdict | null; round: number; missed: Q[]; correct: number }
export function startQuizSession<Q extends SessionQuestion>(questions: Q[]): QuizSession<Q> {
  return { questions: [...questions], index: 0, answer: null, verdict: null, round: 1, missed: [], correct: 0 }
}
export function answerQuestion<Q extends SessionQuestion>(s: QuizSession<Q>, answer: string | number, verdict: AnswerVerdict): QuizSession<Q> {
  if (s.verdict !== null || !s.questions[s.index]) return s
  const question = s.questions[s.index]!
  return {
    ...s,
    answer,
    verdict,
    correct: s.correct + (verdict === 'correct' ? 1 : 0),
    missed: verdict === 'incorrect' ? [...s.missed, question] : s.missed,
  }
}
export function resolveSelfGrade<Q extends SessionQuestion>(s: QuizSession<Q>, verdict: 'correct' | 'incorrect'): QuizSession<Q> {
  if (s.verdict !== 'unsure' || !s.questions[s.index]) return s
  const question = s.questions[s.index]!
  return {
    ...s,
    verdict,
    correct: s.correct + (verdict === 'correct' ? 1 : 0),
    missed: verdict === 'correct' ? s.missed : [...s.missed, question],
  }
}
export function nextQuestion<Q extends SessionQuestion>(s: QuizSession<Q>): QuizSession<Q> {
  if (s.verdict === null || s.index >= s.questions.length - 1) return s
  return { ...s, index: s.index + 1, answer: null, verdict: null }
}

export function retryMissed<Q extends SessionQuestion>(s: QuizSession<Q>): QuizSession<Q> {
  return {
    questions: [...s.missed],
    index: 0,
    answer: null,
    verdict: null,
    round: s.round + 1,
    missed: [],
    correct: 0,
  }
}
export function quizSessionComplete(s: QuizSession): boolean {
  return s.questions.length === 0 || s.index >= s.questions.length - 1 && s.verdict !== null && s.verdict !== 'unsure'
}
export function quizSummary(s: QuizSession) {
  return {
    correct: s.correct,
    total: s.questions.length,
    missed: s.missed.length,
    round: s.round,
  }
}
