import { describe, expect, it, vi } from 'vitest'
import { chunkImportText, dedupeImportedCards, generateImportCards, IMPORT_MAX_SOURCE_CHARS } from './importGeneration'
import type { Flashcard } from './types'

const card = (front: string, back = 'answer'): Flashcard => ({ id: `${front}-${back}`, front, back })

describe('Learning import generation', () => {
  it('chunks at about 6000 characters and caps at ten chunks', () => {
    const input = 'x'.repeat(IMPORT_MAX_SOURCE_CHARS + 100)
    const result = chunkImportText(input)
    expect(result.capped).toBe(true)
    expect(result.chunks).toHaveLength(10)
    expect(result.chunks.every(chunk => chunk.length <= 6000)).toBe(true)
  })

  it('deduplicates fronts without case or whitespace differences and caps at 100', () => {
    expect(dedupeImportedCards([card(' One  term '), card('one term'), ...Array.from({ length: 101 }, (_, i) => card(`term ${i}`))])).toHaveLength(100)
  })

  it('keeps completed chunks when a later chunk fails and retries only remaining chunks', async () => {
    let calls = 0
    const complete = vi.fn(async () => {
      calls += 1
      if (calls === 2) throw new Error('offline')
      return '[{"front":"Card ' + calls + '","back":"Answer"}]'
    })
    const sourceText = `${'first '.repeat(1100)}\n\n${'second '.repeat(1100)}\n\n${'third '.repeat(1100)}`
    const partial = await generateImportCards({ sourceText, desiredCount: 3, complete })
    expect(partial.cards.map(item => item.front)).toEqual(['Card 1'])
    expect(partial.failedChunks).toEqual([2, 3, 4])
    const retried = await generateImportCards({ sourceText, desiredCount: 3, complete: async () => '[{"front":"Card 2","back":"Answer"}]', existingCards: partial.cards, chunkIndexes: partial.failedChunks })
    expect(retried.cards.map(item => item.front)).toEqual(['Card 1', 'Card 2'])
  })

  it('reports cancellation while preserving earlier cards', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await generateImportCards({
      sourceText: `${'alpha '.repeat(1100)}\n\n${'beta '.repeat(1100)}`,
      desiredCount: 3,
      signal: controller.signal,
      complete: async () => { calls += 1; controller.abort(); return '[{"front":"Kept","back":"Answer"}]' },
    })
    expect(result.cancelled).toBe(true)
    expect(result.cards[0]?.front).toBe('Kept')
  })
})
