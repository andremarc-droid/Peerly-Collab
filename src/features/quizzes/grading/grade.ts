import { normalizeAnswer } from './normalize'
import { Timestamp } from 'firebase/firestore'
import type { AnswerKey, QuizQuestion, QuizResult } from '../types'

export type QuizQuestionRecord = QuizQuestion & { id: string }

export function isCorrect(question: QuizQuestion, key: AnswerKey, answer: string | string[] | undefined): boolean | null {
  if (question.type === 'flashcard') return null
  if (answer === undefined) return false
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    if (Array.isArray(answer)) return false
    return key.type === 'choice' && answer === key.correctOptionId
  }
  if (question.type === 'identification') {
    if (Array.isArray(answer)) return false
    return key.type === 'identification' && key.acceptedAnswers.some((accepted) => normalizeAnswer(answer, key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive))
  }
  if (key.type !== 'fill_blank' || question.type !== 'fill_blank') return false
  const submitted = Array.isArray(answer) ? answer : [answer]
  return submitted.length === key.blanks.length && key.blanks.every((acceptedAnswers, index) => acceptedAnswers.some((accepted) => normalizeAnswer(submitted[index] ?? '', key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive)))
}

export function gradeAttempt(input: {
  userId: string
  questions: QuizQuestionRecord[]
  answerKeys: Record<string, AnswerKey>
  answers: Record<string, string | string[]>
  gradedAt?: QuizResult['gradedAt']
}): QuizResult {
  const { questions, answerKeys, answers, userId } = input
  const gradedAt = input.gradedAt ?? Timestamp.now()
  const perQuestion: QuizResult['perQuestion'] = {}
  let score = 0
  let maxScore = 0
  for (const question of questions) {
    if (question.type === 'flashcard') {
      perQuestion[question.id] = { correct: null, pointsAwarded: 0, overridden: false }
      continue
    }
    maxScore += question.points
    const key = answerKeys[question.id]
    if (!key) throw new Error(`Missing answer key for question ${question.id}`)
    const answer = answers[question.id]
    let pointsAwarded = 0
    let correct = isCorrect(question, key, answer)
    if (question.type === 'fill_blank' && key.type === 'fill_blank') {
      const submitted = Array.isArray(answer) ? answer : answer === undefined ? [] : [answer]
      let matchedBlanks = 0
      for (let index = 0; index < key.blanks.length; index++) {
        const acceptedAnswers = key.blanks[index] ?? []
        const value = submitted[index] ?? ''
        if (acceptedAnswers.some((accepted) => normalizeAnswer(value, key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive))) {
          matchedBlanks += 1
        }
      }
      pointsAwarded = key.blanks.length > 0
        ? Math.round((matchedBlanks / key.blanks.length) * question.points * 100) / 100
        : 0
      correct = matchedBlanks === key.blanks.length && submitted.length === key.blanks.length
    } else if (correct) pointsAwarded = question.points
    score += pointsAwarded
    perQuestion[question.id] = { correct, pointsAwarded, overridden: false }
  }
  return { userId, score: Math.round(score * 100) / 100, maxScore: Math.round(maxScore * 100) / 100, perQuestion, gradedAt }
}
