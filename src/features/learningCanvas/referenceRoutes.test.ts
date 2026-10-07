import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReferencePath, openReferenceInNewTab } from './referenceRoutes'

describe('buildReferencePath', () => {
  it('builds student routes that exist in App.tsx', () => {
    expect(buildReferencePath('student', 'c1', 'module', 'm1')).toBe('/student/classes/c1/modules/m1')
    expect(buildReferencePath('student', 'c1', 'quiz', 'q1')).toBe('/student/quizzes/q1')
    expect(buildReferencePath('student', 'c1', 'learning', 'l1')).toBe('/student/classes/c1/learning/l1')
  })

  it('builds instructor routes for the instructor role', () => {
    expect(buildReferencePath('instructor', 'c1', 'module', 'm1')).toBe('/instructor/classes/c1/modules/m1')
    expect(buildReferencePath('instructor', 'c1', 'quiz', 'q1')).toBe('/instructor/quizzes/q1')
    expect(buildReferencePath('instructor', 'c1', 'learning', 'l1')).toBe('/instructor/classes/c1/learning/l1')
  })

  it('encodes ids so they cannot alter the path', () => {
    expect(buildReferencePath('student', 'c1', 'module', '../admin')).toBe(
      '/student/classes/c1/modules/..%2Fadmin',
    )
  })
})

describe('openReferenceInNewTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens in a new tab with noopener and noreferrer', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    openReferenceInNewTab('student', 'c1', 'quiz', 'q1')
    expect(open).toHaveBeenCalledWith('/student/quizzes/q1', '_blank', 'noopener,noreferrer')
  })
})
