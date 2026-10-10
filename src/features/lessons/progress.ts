import type { LessonCompletion, LessonProgressRecord, LessonStep } from './types'

const steps: LessonStep[] = ['read', 'practice', 'quiz', 'done']
export function emptyLessonProgress(updatedAt: LessonProgressRecord['updatedAt']): LessonProgressRecord {
  return { version: 1, lessons: {}, lastLessonId: null, updatedAt }
}

export function advanceLessonProgress(
  progress: LessonProgressRecord,
  lessonId: string,
  step: Exclude<LessonStep, 'done'>,
  updatedAt: LessonProgressRecord['updatedAt'],
): LessonProgressRecord {
  const current = progress.lessons[lessonId] ?? { step: 'read', bestScore: 0, completedAt: null, xpAwarded: false }
  const currentIndex = steps.indexOf(current.step)
  const nextIndex = Math.max(currentIndex, Math.min(currentIndex + 1, steps.indexOf(step)))
  const nextStep = steps[nextIndex]!
  const lessons = { ...progress.lessons, [lessonId]: { ...current, step: nextStep } }
  return { version: 1, lessons, lastLessonId: lessonId, updatedAt }
}

export function finishLessonQuiz(
  progress: LessonProgressRecord,
  lessonId: string,
  score: number,
  total: number,
  updatedAt: LessonProgressRecord['updatedAt'],
  completedAt = updatedAt.toMillis(),
): LessonProgressRecord {
  const current = progress.lessons[lessonId] ?? { step: 'read', bestScore: 0, completedAt: null, xpAwarded: false }
  const safeTotal = Math.max(0, Math.floor(total))
  const safeScore = Math.max(0, Math.min(safeTotal, Math.floor(score)))
  const completion: LessonCompletion = { step: 'done', bestScore: Math.max(current.bestScore, safeScore), completedAt: current.completedAt ?? completedAt, xpAwarded: current.xpAwarded ?? current.completedAt !== null }
  return { version: 1, lessons: { ...progress.lessons, [lessonId]: completion }, lastLessonId: lessonId, updatedAt }
}

export function lessonPlanCompletion(order: readonly string[], progress: LessonProgressRecord): number {
  if (order.length === 0) return 0
  const done = order.filter(id => progress.lessons[id]?.step === 'done').length
  return Math.round((done / order.length) * 100)
}

export function nextLessonToResume(order: readonly string[], progress: LessonProgressRecord): string | null {
  const last = progress.lastLessonId
  if (last && order.includes(last) && progress.lessons[last]?.step !== 'done') return last
  return order.find(id => progress.lessons[id]?.step !== 'done') ?? (last && order.includes(last) ? last : null)
}
