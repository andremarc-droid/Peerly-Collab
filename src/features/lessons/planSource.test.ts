import { describe, expect, it } from 'vitest'
import { clampPlanSource, MAX_PLAN_SOURCE_CHARS } from './planSource'

describe('clampPlanSource', () => {
  it('returns an empty string when there is no source', () => {
    expect(clampPlanSource(undefined)).toBe('')
    expect(clampPlanSource('  \n ')).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(clampPlanSource('  Cells are the unit of life.\n')).toBe('Cells are the unit of life.')
  })

  it('caps long text at the stored maximum', () => {
    expect(clampPlanSource('a'.repeat(MAX_PLAN_SOURCE_CHARS + 500))).toHaveLength(MAX_PLAN_SOURCE_CHARS)
  })

  it('does not leave half an emoji at the cut', () => {
    const text = `${'a'.repeat(MAX_PLAN_SOURCE_CHARS - 1)}😀`
    const result = clampPlanSource(text)
    expect(result).toBe('a'.repeat(MAX_PLAN_SOURCE_CHARS - 1))
    expect(result.length).toBeLessThanOrEqual(MAX_PLAN_SOURCE_CHARS)
  })
})
