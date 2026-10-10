import { describe, expect, it } from 'vitest'
import { advanceLessonProgress, emptyLessonProgress, finishLessonQuiz, lessonPlanCompletion, nextLessonToResume } from './progress'

const stamp = (value: number) => ({ toMillis: () => value })
describe('lesson progress', () => {
  it('advances through read, practice and quiz, then completes with best score', () => {
    let state = emptyLessonProgress(stamp(1))
    state = advanceLessonProgress(state, 'one', 'read', stamp(2))
    expect(state.lessons.one?.step).toBe('read')
    state = advanceLessonProgress(state, 'one', 'practice', stamp(3))
    state = advanceLessonProgress(state, 'one', 'quiz', stamp(4))
    state = finishLessonQuiz(state, 'one', 2, 3, stamp(5), 5)
    state = finishLessonQuiz(state, 'one', 1, 3, stamp(6), 6)
    expect(state.lessons.one).toMatchObject({ step: 'done', bestScore: 2, completedAt: 6 })
  })
  it('computes completion and resumes the last unfinished lesson', () => {
    let state = emptyLessonProgress(stamp(1))
    state = finishLessonQuiz(state, 'one', 3, 3, stamp(2), 2)
    state = advanceLessonProgress(state, 'two', 'practice', stamp(3))
    expect(lessonPlanCompletion(['one', 'two', 'three'], state)).toBe(33)
    expect(nextLessonToResume(['one', 'two', 'three'], state)).toBe('two')
    expect(nextLessonToResume(['one'], state)).toBeNull()
  })
})
