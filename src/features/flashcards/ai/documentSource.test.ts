import { describe, expect, it } from 'vitest'
import { MAX_SOURCE_CHARS } from './constants'
import { buildModuleSource } from './moduleSource'

function longText(sentences: number): string {
  return Array.from({ length: sentences }, (_, index) => `Fact number ${index} explains one idea clearly.`).join(' ')
}

describe('buildModuleSource with uploaded documents', () => {
  it('includes a short document in full and counts as readable substance', () => {
    const built = buildModuleSource([], '', [{ name: 'notes.txt', text: 'Mitochondria make ATP for the cell.' }])
    expect(built.text).toContain('## Document: notes.txt')
    expect(built.text).toContain('Mitochondria make ATP for the cell.')
    expect(built.documentCount).toBe(1)
    expect(built.documentsSampled).toBe(false)
    expect(built.hasSubstance).toBe(false) // under the 40-character minimum
    expect(buildModuleSource([], '', [{ name: 'a', text: 'x'.repeat(60) }]).hasSubstance).toBe(true)
  })

  it('samples a long document across its whole length within the size budget', () => {
    const built = buildModuleSource([], '', [{ name: 'book.pdf', text: longText(2000) }])
    expect(built.documentsSampled).toBe(true)
    expect(built.text.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS + 60)
    expect(built.text).toContain('Fact number 0 ')
    expect(built.text).toMatch(/Fact number 1[5-9]\d\d /)
  })

  it('shares the budget between modules and documents', () => {
    const module = { title: 'Big', description: 'd'.repeat(20000), resources: [] }
    const built = buildModuleSource([module], '', [{ name: 'book.pdf', text: longText(2000) }])
    expect(built.text.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS + 120)
    expect(built.text).toContain('## Module: Big')
    expect(built.text).toContain('## Document: book.pdf')
    expect(built.truncated).toBe(true)
    expect(built.documentsSampled).toBe(true)
  })

  it('leaves the result unchanged when no documents are given', () => {
    const built = buildModuleSource([{ title: 'Cells', description: 'The basic unit of life.', resources: [] }], 'My notes on enzymes and more.')
    expect(built.documentCount).toBe(0)
    expect(built.documentsSampled).toBe(false)
    expect(built.text).toContain('## Extra notes')
  })
})
