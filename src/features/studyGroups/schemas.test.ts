import { describe, expect, it } from 'vitest'
import {
  buildSharedCanvasPayload,
  buildSharedDeckPayload,
  buildSharedLessonPlanPayload,
  buildSharedNotePayload,
  validateSharedCanvasPayload,
  validateSharedDeckPayload,
  validateSharedItem,
  validateSharedLessonPlanPayload,
  validateSharedNotePayload,
} from './schemas'

describe('sharedItems schemas and payload builders', () => {
  it('builds and validates deck payload within caps', () => {
    const rawCards = Array.from({ length: 105 }, (_, i) => ({
      id: `c-${i}`,
      front: `Front ${i}`.padEnd(350, 'x'),
      back: `Back ${i}`.padEnd(650, 'y'),
    }))

    const payload = buildSharedDeckPayload(rawCards, 'class-1')
    expect(payload.cardCount).toBe(100) // capped at 100
    expect(payload.cards).toHaveLength(100)
    expect(payload.cards[0].front.length).toBeLessThanOrEqual(300)
    expect(payload.cards[0].back.length).toBeLessThanOrEqual(600)
    expect(payload.sourceClassId).toBe('class-1')

    const check = validateSharedDeckPayload(payload)
    expect(check.valid).toBe(true)
  })

  it('builds and validates canvas payload within caps', () => {
    const rawNodes = Array.from({ length: 90 }, (_, i) => ({ id: `n-${i}`, type: 'text', text: 'hi' }))
    const rawEdges = Array.from({ length: 130 }, (_, i) => ({ id: `e-${i}`, from: 'n-0', to: 'n-1' }))

    const payload = buildSharedCanvasPayload(rawNodes, rawEdges, { x: 10, y: 20, zoom: 1.5 })
    expect(payload.nodeCount).toBe(80) // capped at 80
    expect(payload.edgeCount).toBe(120) // capped at 120
    expect(payload.viewport?.zoom).toBe(1.5)

    const check = validateSharedCanvasPayload(payload)
    expect(check.valid).toBe(true)
  })

  it('builds and validates lesson plan payload without source material', () => {
    const lessons: Record<string, any> = {
      l1: { title: 'Intro', objective: 'Understand basics', content: 'Long lesson text', source: 'SECRET' },
      l2: { title: 'Advanced', objective: 'Master details', content: 'Deeper text' },
    }
    const order = ['l1', 'l2']

    const payload = buildSharedLessonPlanPayload('Biology', 'beginner', order, lessons)
    expect(payload.lessonCount).toBe(2)
    expect(payload.lessons.l1.title).toBe('Intro')
    // Ensure source is never included in lessons
    expect((payload.lessons.l1 as any).source).toBeUndefined()
    expect((payload as any).source).toBeUndefined()

    const check = validateSharedLessonPlanPayload(payload)
    expect(check.valid).toBe(true)
  })

  it('rejects lesson plan payload if source field is present', () => {
    const badPayload = {
      topic: 'Math',
      level: 'beginner',
      order: ['l1'],
      lessons: { l1: { title: 'Lesson 1' } },
      source: 'Pasted text',
    }
    const check = validateSharedLessonPlanPayload(badPayload)
    expect(check.valid).toBe(false)
    expect(check.error).toContain('source must not be shared')
  })

  it('builds and validates note payload within caps', () => {
    const longText = 'A'.repeat(25000)
    const payload = buildSharedNotePayload(longText, 'class-x')
    expect(payload.text.length).toBe(20000)
    expect(payload.sourceClassId).toBe('class-x')

    const check = validateSharedNotePayload(payload)
    expect(check.valid).toBe(true)
  })

  it('validates a complete SharedGroupItem across kinds', () => {
    const deckItem = {
      id: 'item-1',
      kind: 'deck' as const,
      title: 'Biology 101 Decks',
      summary: 'Summary of deck',
      sharedByUid: 'user-1',
      sharedByName: 'Alice',
      sharedAt: { toMillis: () => Date.now() },
      version: 1,
      payload: buildSharedDeckPayload([{ id: '1', front: 'Q', back: 'A' }]),
    }
    expect(validateSharedItem(deckItem).valid).toBe(true)

    const invalidItem = {
      ...deckItem,
      title: '', // empty title
    }
    expect(validateSharedItem(invalidItem).valid).toBe(false)
  })
})
