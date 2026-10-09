import { describe, expect, it } from 'vitest'
import { isMobileTabRoot, mobileBackTo, mobileHomePath } from './mobileChrome'

describe('isMobileTabRoot', () => {
  it('keeps the bottom bar on the signed-in home tabs', () => {
    expect(isMobileTabRoot('/instructor')).toBe(true)
    expect(isMobileTabRoot('/student')).toBe(true)
    expect(isMobileTabRoot('/instructor/quizzes')).toBe(true)
    expect(isMobileTabRoot('/instructor/learning')).toBe(true)
    expect(isMobileTabRoot('/student/learning')).toBe(true)
    expect(isMobileTabRoot('/profile')).toBe(true)
  })

  it('treats nested work as a pushed screen', () => {
    expect(isMobileTabRoot('/instructor/classes/abc')).toBe(false)
    expect(isMobileTabRoot('/instructor/quizzes/new')).toBe(false)
    expect(isMobileTabRoot('/join')).toBe(false)
    expect(isMobileTabRoot('/student/classes/xyz')).toBe(false)
  })
})

describe('mobileBackTo', () => {
  it('steps up one level inside a class, then back to the class list', () => {
    expect(mobileBackTo('/instructor/classes/c1', 'instructor')).toBe('/instructor')
    expect(mobileBackTo('/instructor/classes/c1/modules/m1', 'instructor')).toBe('/instructor/classes/c1')
    expect(mobileBackTo('/student/classes/c1', 'student')).toBe('/student')
    expect(mobileBackTo('/student/classes/c1/notes/n1', 'student')).toBe('/student/classes/c1')
  })

  it('returns nested library screens to their tab', () => {
    expect(mobileBackTo('/instructor/quizzes/q1', 'instructor')).toBe('/instructor/quizzes')
    expect(mobileBackTo('/join/ABC234', 'student')).toBe('/student')
    expect(mobileBackTo('/learning/join/c1/x/t', 'instructor')).toBe('/instructor/learning')
  })

  it('falls back to the role home', () => {
    expect(mobileHomePath('instructor')).toBe('/instructor')
    expect(mobileBackTo('/unknown', 'student')).toBe('/student')
  })
})
