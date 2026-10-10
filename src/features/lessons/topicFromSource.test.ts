import { describe, expect, it } from 'vitest'
import { suggestTopicFromSource } from './topicFromSource'

describe('suggestTopicFromSource', () => {
  it('uses a leading Markdown heading', () => {
    expect(suggestTopicFromSource('# Photosynthesis basics\n\nPlants convert light.')).toBe('Photosynthesis basics')
  })

  it('drops a document file extension from the heading', () => {
    expect(suggestTopicFromSource('# Cell biology week 3.pdf\nText')).toBe('Cell biology week 3')
    expect(suggestTopicFromSource('# Lecture.PPTX\nText')).toBe('Lecture')
  })

  it('ignores leading blank lines and Windows line endings', () => {
    expect(suggestTopicFromSource('\r\n  \r\n## Algebra\r\nx + 1')).toBe('Algebra')
  })

  it('gives no suggestion for plain pasted notes', () => {
    expect(suggestTopicFromSource('Plants convert light into sugar.')).toBe('')
    expect(suggestTopicFromSource('')).toBe('')
  })

  it('does not treat a hashtag without a space as a heading', () => {
    expect(suggestTopicFromSource('#biology notes')).toBe('')
  })

  it('caps the suggestion length', () => {
    expect(suggestTopicFromSource(`# ${'a'.repeat(300)}`, 50)).toHaveLength(50)
  })
})
