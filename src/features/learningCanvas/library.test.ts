import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { aggregateLearningLibrary, resolveLearningTab } from './library'
import type { LearningCanvasWithId } from './types'

function item(id: string, millis: number): LearningCanvasWithId {
  return { id, classId: 'workspace', ownerId: 'user', kind: 'personal', title: id, description: '', status: 'private', nodeCount: 0, edgeCount: 0, refs: [], sourceCanvasId: null, createdAt: Timestamp.fromMillis(millis), updatedAt: Timestamp.fromMillis(millis) }
}

describe('aggregateLearningLibrary', () => {
  it('merges owned and shared items, removes duplicate paths and sorts newest first', () => {
    const result = aggregateLearningLibrary([item('old', 1), item('same', 2)], [item('same', 3), item('new', 4)])
    expect(result.map(({ id }) => id)).toEqual(['new', 'same', 'old'])
    expect(result.find(({ id }) => id === 'same')?.updatedAt.toMillis()).toBe(3)
  })
})

describe('resolveLearningTab', () => {
  it.each([
    ['flashcards', 'decks'], ['decks', 'decks'], ['notes', 'notes'],
    ['canvases', 'canvases'], ['canvas', 'canvases'], ['graph', 'canvases'],
    ['tutor', 'home'], ['unknown', 'home'], [null, 'home'],
  ] as const)('maps legacy tab %s to %s', (value, expected) => {
    expect(resolveLearningTab(value)).toBe(expected)
  })
})
