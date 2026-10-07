import { describe, expect, it } from 'vitest'
import {
  currentCard,
  flipCard,
  isComplete,
  markCard,
  shuffleCards,
  startReviewSession,
  startSession,
} from './studySession'
import type { Flashcard } from './types'

const cards: Flashcard[] = [
  { id: 'a', front: 'A?', back: 'a' },
  { id: 'b', front: 'B?', back: 'b' },
  { id: 'c', front: 'C?', back: 'c' },
]

describe('studySession', () => {
  it('starts on the first card, unflipped, in deck order', () => {
    const state = startSession(cards)
    expect(state.order.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(state.index).toBe(0)
    expect(state.flipped).toBe(false)
    expect(isComplete(state)).toBe(false)
  })

  it('does not mutate the source deck when shuffling', () => {
    const copy = [...cards]
    const shuffled = shuffleCards(cards, () => 0)
    expect(cards).toEqual(copy)
    expect(shuffled).toHaveLength(3)
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(['a', 'b', 'c']))
  })

  it('flips the current card back and forth', () => {
    const flipped = flipCard(startSession(cards))
    expect(flipped.flipped).toBe(true)
    expect(flipCard(flipped).flipped).toBe(false)
  })

  it('ignores grading until the answer has been revealed', () => {
    const state = startSession(cards)
    expect(markCard(state, 'known')).toBe(state)
  })

  it('records grades, advances, and resets the flip', () => {
    let state = flipCard(startSession(cards))
    state = markCard(state, 'known')
    expect(state.known).toEqual(['a'])
    expect(state.index).toBe(1)
    expect(state.flipped).toBe(false)
    expect(currentCard(state)?.id).toBe('b')

    state = markCard(flipCard(state), 'review')
    state = markCard(flipCard(state), 'known')
    expect(state.known).toEqual(['a', 'c'])
    expect(state.review).toEqual(['b'])
    expect(isComplete(state)).toBe(true)
    expect(currentCard(state)).toBeNull()
  })

  it('builds a review session from only the missed cards', () => {
    let state = startSession(cards)
    state = markCard(flipCard(state), 'review')
    state = markCard(flipCard(state), 'known')
    state = markCard(flipCard(state), 'review')

    const review = startReviewSession(state)
    expect(review.order.map((c) => c.id)).toEqual(['a', 'c'])
    expect(review.known).toEqual([])
    expect(review.review).toEqual([])
  })

  it('treats an empty deck as already complete', () => {
    expect(isComplete(startSession([]))).toBe(true)
  })
})
