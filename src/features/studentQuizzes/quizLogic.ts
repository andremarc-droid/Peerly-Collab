import type { AnswerReveal, Quiz, QuizAttempt, QuizQuestion, QuizResult } from '../quizzes/types'

export function remainingSeconds(startedAtMs: number, limitMinutes: number, nowMs: number): number {
  return Math.max(0, Math.ceil((startedAtMs + limitMinutes * 60_000 - nowMs) / 1000))
}

export function shouldAutoSubmit(seconds: number): boolean { return seconds <= 0 }

export function remainingAttempts(quiz: Quiz, attempts: number): number | null {
  return quiz.settings.attemptsAllowed === null ? null : Math.max(0, quiz.settings.attemptsAllowed - attempts)
}

export function createQuestionOrder(ids: string[], shuffle: boolean, random = Math.random): string[] {
  const order = [...ids]
  if (!shuffle) return order
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function persistedQuestionOrder(attempt: QuizAttempt, questions: Array<QuizQuestion & { id: string }>): Array<QuizQuestion & { id: string }> {
  const byId = new Map(questions.map((question) => [question.id, question]))
  return attempt.questionOrder.map((id) => byId.get(id)).filter((item): item is QuizQuestion & { id: string } => Boolean(item))
}

export function resultVisibility(quiz: Quiz, reveal: AnswerReveal, result: QuizResult): { showScore: boolean; showAnswers: boolean } {
  return {
    showScore: quiz.settings.scoreVisibility === 'immediate' || (quiz.settings.scoreVisibility === 'after_release' && quiz.settings.scoresReleased),
    showAnswers: reveal !== 'never' && Object.keys(result.perQuestion).length > 0,
  }
}

export function optionOrderForQuestion(questionId: string, attempt: QuizAttempt, question: QuizQuestion & { id: string }): string[] {
  const options = 'options' in question ? question.options.map(({ id }) => id) : []
  const stored = attempt.optionOrder[questionId] ?? []
  return [...stored.filter((id) => options.includes(id)), ...options.filter((id) => !stored.includes(id))]
}
