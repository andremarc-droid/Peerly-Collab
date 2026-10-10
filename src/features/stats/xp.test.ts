import { describe, expect, it } from 'vitest'
import { quizXp, reviewXp, XP_AWARDS } from './xp'

describe('XP awards', () => {
  it('uses one award table for card grades and lesson completion', () => {
    expect(['again', 'hard', 'good', 'easy'].map(grade => reviewXp(grade as keyof typeof XP_AWARDS.review))).toEqual([0, 1, 2, 3])
    expect(XP_AWARDS.lessonCompleted).toBe(20)
  })
  it('awards one XP per correct quiz answer and a bonus at 80 percent', () => {
    expect(quizXp(3, 4)).toBe(3)
    expect(quizXp(4, 5)).toBe(9)
    expect(quizXp(2, 4)).toBe(2)
    expect(quizXp(9, 10)).toBe(14)
    expect(quizXp(2, 0)).toBe(0)
  })
})
