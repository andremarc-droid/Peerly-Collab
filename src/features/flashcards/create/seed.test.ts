import { describe, expect, it } from 'vitest'
import { suggestTopicFromSource } from '../../lessons/topicFromSource'
import { seedSourceText } from './seed'

describe('seedSourceText', () => {
  it('puts the title first as a Markdown heading', () => {
    expect(seedSourceText({ title: 'Krebs cycle', text: 'Acetyl-CoA enters the cycle.' })).toBe('# Krebs cycle\n\nAcetyl-CoA enters the cycle.')
  })

  it('collapses whitespace and newlines in the title', () => {
    expect(seedSourceText({ title: '  Newton\n  laws ', text: 'F = ma' })).toBe('# Newton laws\n\nF = ma')
  })

  it('uses only the text when there is no title', () => {
    expect(seedSourceText({ title: '   ', text: ' Plain notes ' })).toBe('Plain notes')
  })

  it('returns nothing for an empty note, even with a title', () => {
    expect(seedSourceText({ title: 'Empty', text: '  \n ' })).toBe('')
  })

  it('lets lesson plans suggest the note title as the topic', () => {
    expect(suggestTopicFromSource(seedSourceText({ title: 'Photosynthesis', text: 'Light reactions.' }))).toBe('Photosynthesis')
  })
})
