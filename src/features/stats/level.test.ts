import { describe, expect, it } from 'vitest'
import { levelProgress, xpThreshold } from './level'

describe('derived levels', () => {
  it('uses increasing level thresholds without storing a level', () => {
    expect(xpThreshold(1)).toBe(0)
    expect(xpThreshold(2)).toBe(100)
    expect(xpThreshold(3)).toBe(300)
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 100, xpToNextLevel: 100 })
    expect(levelProgress(135)).toEqual({ level: 2, xpIntoLevel: 35, xpForNextLevel: 200, xpToNextLevel: 165 })
    expect(levelProgress(-1).level).toBe(1)
  })
})
