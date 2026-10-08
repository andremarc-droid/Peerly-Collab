import { describe, expect, it } from 'vitest'
import { isGraphOwner, parseGraphDeleteRequest } from './graphDeletionValidation'

describe('graph deletion validation', () => {
  it('accepts valid scoped graph identifiers', () => {
    expect(parseGraphDeleteRequest({ classId: 'class-a', graphId: 'graph-a' })).toEqual({
      classId: 'class-a',
      graphId: 'graph-a',
    })
  })

  it.each([
    null,
    [],
    {},
    { classId: '', graphId: 'graph-a' },
    { classId: 'class/a', graphId: 'graph-a' },
    { classId: 'class-a', graphId: '' },
    { classId: 'class-a', graphId: 'graph/a' },
    { classId: 'c'.repeat(151), graphId: 'graph-a' },
    { classId: 'class-a', graphId: 'g'.repeat(151) },
  ])('rejects malformed graph deletion input %#', (input) => {
    expect(parseGraphDeleteRequest(input)).toBeNull()
  })

  it('authorizes only the owner of the graph in the requested class', () => {
    const graph = { ownerId: 'owner-a', classId: 'class-a' }
    expect(isGraphOwner(graph, 'class-a', 'owner-a')).toBe(true)
    expect(isGraphOwner(graph, 'class-b', 'owner-a')).toBe(false)
    expect(isGraphOwner(graph, 'class-a', 'editor-a')).toBe(false)
    expect(isGraphOwner(null, 'class-a', 'owner-a')).toBe(false)
  })
})
