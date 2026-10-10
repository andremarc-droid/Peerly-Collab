import type { ReviewGrade } from '../studyEngine/srs'

export const XP_AWARDS = {
  review: { again: 0, hard: 1, good: 2, easy: 3 } satisfies Record<ReviewGrade, number>,
  lessonCompleted: 20,
  quizCorrect: 1,
  quizBonusThreshold: 0.8,
  quizBonus: 5,
  dailyGoalDefault: 20,
  dailyGoals: [10, 20, 50, 100] as const,
  maxPerWrite: 25,
  maxPerDay: 2000,
} as const

export function reviewXp(grade: ReviewGrade): number { return XP_AWARDS.review[grade] }

export function quizXp(correct: number, total: number): number {
  const safeTotal = Math.max(0, Math.floor(total))
  const safeCorrect = Math.max(0, Math.min(safeTotal, Math.floor(correct)))
  if (safeTotal === 0) return 0
  return safeCorrect * XP_AWARDS.quizCorrect + (safeCorrect / safeTotal >= XP_AWARDS.quizBonusThreshold ? XP_AWARDS.quizBonus : 0)
}
