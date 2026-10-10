import { describe, expect, it } from 'vitest'
import { describeLessonGeneration } from './generationMessage'

describe('describeLessonGeneration', () => {
  it('is empty when generation finished', () => {
    expect(describeLessonGeneration({ cancelled: false })).toBe('')
  })

  it('explains rate limits first', () => {
    expect(describeLessonGeneration({ cancelled: true, failureReason: 'rate-limit' })).toContain('rate-limited')
  })

  it('explains other AI failures', () => {
    expect(describeLessonGeneration({ cancelled: false, failureReason: 'invalid-reply' })).toContain('could not validate')
  })

  it('explains a stopped run', () => {
    expect(describeLessonGeneration({ cancelled: true })).toContain('stopped')
  })
})
