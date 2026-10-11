import { GroupQuizError, type Answer } from './groupQuizLogic.js'

/**
 * Server-side grading for team quizzes. It mirrors src/features/quizzes/grading/grade.ts for the four question types a team
 * can answer (multiple choice, true/false, identification, fill in the blank). Keep the two in sync.
 */

export interface GradableQuestion {
  id: string
  type: 'multiple_choice' | 'true_false' | 'identification' | 'fill_blank'
  points: number
}

export type GradableKey =
  | { type: 'choice'; correctOptionId: string; explanation: string; caseSensitive: boolean }
  | { type: 'identification'; acceptedAnswers: string[]; explanation: string; caseSensitive: boolean }
  | { type: 'fill_blank'; blanks: string[][]; explanation: string; caseSensitive: boolean }

export interface QuestionGrade { correct: boolean; pointsAwarded: number; overridden: false }

export function normalizeAnswer(value: string, caseSensitive: boolean): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US')
}

export function gradeQuestion(question: GradableQuestion, key: GradableKey, answer: Answer | undefined): QuestionGrade {
  if (answer === undefined) return { correct: false, pointsAwarded: 0, overridden: false }
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    if (key.type !== 'choice') throw new GroupQuizError('This question has a mismatched answer key.', 'failed-precondition')
    const correct = typeof answer === 'string' && answer === key.correctOptionId
    return { correct, pointsAwarded: correct ? question.points : 0, overridden: false }
  }
  if (question.type === 'identification') {
    if (key.type !== 'identification') throw new GroupQuizError('This question has a mismatched answer key.', 'failed-precondition')
    const correct = typeof answer === 'string' && key.acceptedAnswers.some(accepted => normalizeAnswer(answer, key.caseSensitive) === normalizeAnswer(accepted, key.caseSensitive))
    return { correct, pointsAwarded: correct ? question.points : 0, overridden: false }
  }
  if (key.type !== 'fill_blank') throw new GroupQuizError('This question has a mismatched answer key.', 'failed-precondition')
  const submitted = Array.isArray(answer) ? answer : [answer]
  const each = question.points / key.blanks.length
  const pointsAwarded = key.blanks.reduce((sum, accepted, index) => sum + (accepted.some(item => normalizeAnswer(submitted[index] ?? '', key.caseSensitive) === normalizeAnswer(item, key.caseSensitive)) ? each : 0), 0)
  return { correct: pointsAwarded === question.points && submitted.length === key.blanks.length, pointsAwarded, overridden: false }
}

export function gradeTeam(questions: readonly GradableQuestion[], keys: Readonly<Record<string, GradableKey>>, answers: Readonly<Record<string, Answer>>) {
  const perQuestion: Record<string, QuestionGrade> = {}
  let score = 0
  let maxScore = 0
  for (const question of questions) {
    const key = keys[question.id]
    if (!key) throw new GroupQuizError(`Missing answer key for question ${question.id}.`, 'failed-precondition')
    maxScore += question.points
    const graded = gradeQuestion(question, key, answers[question.id])
    score += graded.pointsAwarded
    perQuestion[question.id] = graded
  }
  return { score: Math.round(score * 100) / 100, maxScore: Math.round(maxScore * 100) / 100, perQuestion }
}
