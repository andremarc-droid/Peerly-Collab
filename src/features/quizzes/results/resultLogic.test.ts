import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { QuizAttempt, QuizResult } from '../types'
import type { EnrollmentWithId } from '../../classes/types'
import { applyQuestionOverride, bestAttempts, buildRosterRows, recalculateAutomaticGrade, resultsCsv, summarizeAttempts, type AttemptResult } from './resultLogic'

const time = Timestamp.fromMillis(10)
const baseAttempt: QuizAttempt = { userId: 'u1', userName: 'A "Student"', attemptNumber: 1, status: 'submitted', answers: { q: 'wrong' }, questionOrder: ['q'], optionOrder: {}, startedAt: time, submittedAt: time, timeSpentSeconds: 65 }
const result = (score: number): QuizResult => ({ userId: 'u1', score, maxScore: 10, perQuestion: { q: { correct: score > 0, pointsAwarded: score, overridden: false } }, gradedAt: time })
const row = (id: string, userId: string, score: number, number = 1, status: QuizAttempt['status'] = 'submitted'): AttemptResult => ({ ...baseAttempt, id, userId, userName: userId === 'u1' ? baseAttempt.userName : userId, attemptNumber: number, status, result: status === 'submitted' ? { ...result(score), userId } : null })

describe('quiz result logic', () => {
  it('summarizes submissions using each student’s best attempt', () => {
    const attempts = [row('a1', 'a', 4), row('a2', 'a', 8, 2), row('b1', 'b', 6), row('c1', 'c', 0, 1, 'in_progress')]
    expect(bestAttempts(attempts).map(({ id }) => id).sort()).toEqual(['a2', 'b1'])
    expect(summarizeAttempts(attempts)).toMatchObject({ submissions: 3, inProgress: 1, submitted: 3, average: 70, highest: 80, lowest: 60, bestStudentCount: 2 })
  })

  it('recalculates totals for overrides and restores the automatic grade', () => {
    const initial = { ...result(0), perQuestion: { q: { correct: false, pointsAwarded: 0, overridden: false }, other: { correct: true, pointsAwarded: 2, overridden: false } }, score: 2, maxScore: 5 }
    const question = { id: 'q', type: 'identification' as const, prompt: 'Name', order: 0, points: 3 }
    const key = { type: 'identification' as const, acceptedAnswers: ['right'], explanation: '', caseSensitive: false }
    const overridden = applyQuestionOverride(initial, 'q', 3, 3)
    expect(overridden.score).toBe(5)
    expect(overridden.perQuestion.q).toMatchObject({ correct: true, pointsAwarded: 3, overridden: true })
    const restored = recalculateAutomaticGrade({ result: overridden, question, key, attempt: { ...baseAttempt, answers: { q: 'wrong' } } })
    expect(restored.score).toBe(2)
    expect(restored.perQuestion.q).toMatchObject({ correct: false, pointsAwarded: 0, overridden: false })
    expect(() => applyQuestionOverride(initial, 'q', 4, 3)).toThrow('between 0 and 3')
  })

  it('exports one escaped CSV row per attempt', () => {
    const csv = resultsCsv([row('attempt-1', 'u1', 8), { ...row('attempt-2', 'u2', 4, 1, 'in_progress'), submittedAt: null }], false, 'Science, "North"')
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('"A ""Student"""')
    expect(csv).toContain('"Science, ""North"""')
    expect(csv).toContain('"8/10"')
    expect(csv).toContain('""')
  })

  it('includes enrolled students with no attempts and retains departed students’ attempts', () => {
    const enrollment = (uid: string, status: EnrollmentWithId['status'] = 'active'): EnrollmentWithId => ({
      id: `class_${uid}`, classId: 'class', ownerId: 'teacher', uid, studentName: `Name ${uid}`, studentPhotoURL: null,
      className: 'Science', status, codeUsed: 'ABC234', joinedAt: time, updatedAt: time,
    })
    const rows = buildRosterRows([enrollment('started'), enrollment('fresh')], [row('old-attempt', 'departed', 6), row('current-attempt', 'started', 8)])
    expect(rows.find((item) => item.userId === 'fresh')).toMatchObject({ attempt: null, membership: 'not_started', userName: 'Name fresh' })
    expect(rows.find((item) => item.userId === 'departed')).toMatchObject({ attempt: { id: 'old-attempt' }, membership: 'no_longer_enrolled' })
    expect(rows.find((item) => item.userId === 'started')?.membership).toBe('enrolled')
  })
})
