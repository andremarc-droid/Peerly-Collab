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

export interface NormalizeAnswerOptions {
  ignoreDiacritics?: boolean
  ignorePunctuation?: boolean
}

export function normalizeAnswer(value: string, caseSensitive: boolean, options?: NormalizeAnswerOptions): string {
  // NFKC folds lookalikes (non-breaking spaces, full-width letters); the replace drops invisible characters
  // that survive copy-paste from docs or chats (zero-width spaces/joiners, word joiner, BOM, soft hyphen).
  let normalized = value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  if (options?.ignoreDiacritics) {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
  }
  if (options?.ignorePunctuation) {
    normalized = normalized.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”]/g, '')
  }
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US')
}

export function normalizeConnection(from: string, to: string, directed: boolean): string {
  const f = from.trim()
  const t = to.trim()
  if (directed) {
    return `${f}->${t}`
  }
  return f < t ? `${f}<->${t}` : `${t}<->${f}`
}

export function parseConnectionEdge(edge: string): { from: string; to: string } | null {
  if (typeof edge !== 'string') return null
  const separator = edge.includes('<->') ? '<->' : edge.includes('->') ? '->' : null
  if (!separator) return null
  const parts = edge.split(separator)
  if (parts.length !== 2) return null
  const from = parts[0]?.trim() ?? ''
  const to = parts[1]?.trim() ?? ''
  if (!from || !to) return null
  return { from, to }
}

export interface CanvasQuestionInput {
  points: number
  directed?: boolean
  wrongPenalty?: 'none' | 'half' | 'full'
  cards: ReadonlyArray<{ id: string }>
}

export interface CanvasAnswerKeyInput {
  connections: ReadonlyArray<{ from: string; to: string; points?: number }>
}

/**
 * Server-side grading for prebuilt canvas questions. Keep in sync with
 * src/features/quizzes/grading/grade.ts (gradeCanvasQuestion).
 */
export function gradeCanvasQuestion(
  question: CanvasQuestionInput,
  key: CanvasAnswerKeyInput,
  rawAnswer: string | string[] | undefined,
): QuestionGrade {
  const rawConnections = Array.isArray(rawAnswer) ? rawAnswer : typeof rawAnswer === 'string' && rawAnswer ? [rawAnswer] : []
  const totalKeyPoints = key.connections.reduce((sum, c) => sum + (c.points ?? 1), 0)
  const avgPoints = key.connections.length > 0 ? totalKeyPoints / key.connections.length : 0

  if (key.connections.length === 0 || totalKeyPoints <= 0) {
    return { correct: false, pointsAwarded: 0, overridden: false }
  }

  const keyMap = new Map<string, number>()
  for (const c of key.connections) {
    const norm = normalizeConnection(c.from, c.to, question.directed ?? true)
    keyMap.set(norm, c.points ?? 1)
  }

  const validCardIds = new Set(question.cards.map(c => c.id))
  const cap = Math.min(80, 2 * key.connections.length)
  const validStudentEdges: string[] = []
  const seenStudentEdges = new Set<string>()

  for (const raw of rawConnections) {
    const parsed = parseConnectionEdge(raw)
    if (!parsed) continue
    if (parsed.from === parsed.to) continue // self-connections are ignored
    if (!validCardIds.has(parsed.from) || !validCardIds.has(parsed.to)) continue // unknown card ids are ignored

    const norm = normalizeConnection(parsed.from, parsed.to, question.directed ?? true)
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
  const correct =
    question.points > 0 &&
    ((matchedPoints === totalKeyPoints && wrongCount === 0) ||
      Math.round(pointsAwarded * 100) >= Math.round(question.points * 100))

  return {
    correct,
    pointsAwarded,
    overridden: false,
  }
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
