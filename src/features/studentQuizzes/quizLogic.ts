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

export function resultVisibility(quiz: Quiz, reveal: AnswerReveal, result: QuizResult | null): { showScore: boolean; showAnswers: boolean } {
  const showScore = quiz.settings.scoreVisibility === 'immediate' || (quiz.settings.scoreVisibility === 'after_release' && Boolean(quiz.settings.scoresReleased))
  // When score/result document is hidden or unreleased, students cannot read results.
  // Answers after submit can only be shown when the result document is readable.
  const showAnswers = Boolean(result) && showScore && reveal !== 'never' && Object.keys(result?.perQuestion ?? {}).length > 0
  return {
    showScore,
    showAnswers,
  }
}

export function optionOrderForQuestion(questionId: string, attempt: QuizAttempt, question: QuizQuestion & { id: string }): string[] {
  const options = 'options' in question ? question.options.map(({ id }) => id) : []
  const stored = attempt.optionOrder[questionId] ?? []
  return [...stored.filter((id) => options.includes(id)), ...options.filter((id) => !stored.includes(id))]
}

export async function estimateServerOffset(fetchFn: typeof fetch = fetch): Promise<number> {
  try {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
    if (!origin) return 0
    const start = Date.now()
    const res = await fetchFn(origin, { method: 'HEAD', cache: 'no-store' })
    const dateHeader = res.headers.get('date')
    if (dateHeader) {
      const end = Date.now()
      const serverMs = new Date(dateHeader).getTime()
      if (!Number.isNaN(serverMs)) {
        const roundTrip = Math.max(0, (end - start) / 2)
        return Math.round((serverMs + roundTrip) - end)
      }
    }
  } catch {
    // Return 0 if fetch fails or running in offline/mock environment
  }
  return 0
}
