import { normalizeAnswer } from './normalize'
import { Timestamp } from 'firebase/firestore'
import type { AnswerKey, QuestionResult, QuizQuestion, QuizResult } from '../types'
import type { CanvasAnswerKey, CanvasQuestion } from '../../canvas/types'
import { normalizeConnection, parseConnectionEdge } from '../../canvas/schemas'

export type QuizQuestionRecord = QuizQuestion & { id: string }

export function gradeCanvasQuestion(
  question: CanvasQuestion,
  key: CanvasAnswerKey,
  rawAnswer: string | string[] | undefined,
): QuestionResult {
  const rawConnections = Array.isArray(rawAnswer) ? rawAnswer : typeof rawAnswer === 'string' && rawAnswer ? [rawAnswer] : []
  const totalKeyPoints = key.connections.reduce((sum, c) => sum + (c.points ?? 1), 0)
  const avgPoints = key.connections.length > 0 ? totalKeyPoints / key.connections.length : 0

  if (key.connections.length === 0 || totalKeyPoints <= 0) {
    return { correct: false, pointsAwarded: 0, overridden: false }
  }

  const keyMap = new Map<string, number>()
  for (const c of key.connections) {
    const norm = normalizeConnection(c.from, c.to, question.directed)
    keyMap.set(norm, c.points ?? 1)
  }

  const validCardIds = new Set(question.cards.map((c) => c.id))
  const cap = Math.min(80, 2 * key.connections.length)
  const validStudentEdges: string[] = []
  const seenStudentEdges = new Set<string>()

  for (const raw of rawConnections) {
    const parsed = parseConnectionEdge(raw)
    if (!parsed) continue
    if (parsed.from === parsed.to) continue // self-connections are ignored
    if (!validCardIds.has(parsed.from) || !validCardIds.has(parsed.to)) continue // unknown card ids are ignored

    const norm = normalizeConnection(parsed.from, parsed.to, question.directed)
    if (seenStudentEdges.has(norm)) continue // duplicates are ignored
    seenStudentEdges.add(norm)
    validStudentEdges.push(norm)

    if (validStudentEdges.length >= cap) break // connections over the cap are ignored
  }

  let matchedPoints = 0
  let wrongCount = 0

  for (const edge of validStudentEdges) {
    const pts = keyMap.get(edge)
    if (pts !== undefined) {
      matchedPoints += pts
    } else {
      wrongCount += 1
    }
  }

  const penaltyMultiplier = question.wrongPenalty === 'none' ? 0 : question.wrongPenalty === 'half' ? 0.5 : 1
  const penalty = wrongCount * (penaltyMultiplier * avgPoints)
  const netPoints = Math.max(0, matchedPoints - penalty)
  const pointsAwarded = Math.round((netPoints / totalKeyPoints) * question.points * 100) / 100
  const correct = pointsAwarded === question.points && question.points > 0

  return {
    correct,
    pointsAwarded,
    overridden: false,
  }
}

function isCorrect(question: QuizQuestion, key: AnswerKey, answer: string | string[] | undefined): boolean | null {
  if (question.type === 'flashcard' || question.type === 'canvas') return null
  if (answer === undefined || Array.isArray(answer)) return false
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    return key.type === 'choice' && answer === key.correctOptionId
  }
  if (question.type === 'identification') {
    return key.type === 'identification' && key.acceptedAnswers.some((accepted) => normalizeAnswer(answer, key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive))
  }
  if (key.type !== 'fill_blank') return false
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
    if (question.type === 'canvas') {
      if (key.type !== 'canvas') throw new Error(`Mismatched answer key for canvas question ${question.id}`)
      const answer = answers[question.id]
      const graded = gradeCanvasQuestion(question, key, answer)
      score += graded.pointsAwarded
      perQuestion[question.id] = graded
      continue
    }
    const answer = answers[question.id]
    let pointsAwarded = 0
    let correct = isCorrect(question, key, answer)
    if (question.type === 'fill_blank' && key.type === 'fill_blank') {
      const submitted = Array.isArray(answer) ? answer : answer === undefined ? [] : [answer]
      const eachBlank = question.points / key.blanks.length
      pointsAwarded = key.blanks.reduce((subtotal, acceptedAnswers, index) => {
        const value = submitted[index] ?? ''
        return subtotal + (acceptedAnswers.some((accepted) => normalizeAnswer(value, key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive)) ? eachBlank : 0)
      }, 0)
      correct = pointsAwarded === question.points && submitted.length === key.blanks.length
    } else if (correct) pointsAwarded = question.points
    score += pointsAwarded
    perQuestion[question.id] = { correct, pointsAwarded, overridden: false }
  }
  return { userId, score: Math.round(score * 100) / 100, maxScore: Math.round(maxScore * 100) / 100, perQuestion, gradedAt }
}
