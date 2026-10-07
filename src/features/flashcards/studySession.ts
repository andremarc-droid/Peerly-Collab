import type { Flashcard } from './types'

export type StudyResult = 'known' | 'review'

export interface StudyState {
  order: Flashcard[]
  index: number
  flipped: boolean
  known: string[]
  review: string[]
}

interface StartOptions {
  shuffle?: boolean
  random?: () => number
}

export function shuffleCards<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a === undefined || b === undefined) continue
    copy[i] = b
    copy[j] = a
  }
  return copy
}

export function startSession(cards: readonly Flashcard[], options: StartOptions = {}): StudyState {
  return {
    order: options.shuffle ? shuffleCards(cards, options.random) : [...cards],
    index: 0,
    flipped: false,
    known: [],
    review: [],
  }
}

export function isComplete(state: StudyState): boolean {
  return state.index >= state.order.length
}

export function currentCard(state: StudyState): Flashcard | null {
  return state.order[state.index] ?? null
}

/** Reveals or hides the answer for the current card. */
export function flipCard(state: StudyState): StudyState {
  if (isComplete(state)) return state
  return { ...state, flipped: !state.flipped }
}

/**
 * Records a self-grade and advances. Grading is only allowed after the answer
 * has been revealed (retrieval before reveal).
 */
export function markCard(state: StudyState, result: StudyResult): StudyState {
  const card = currentCard(state)
  if (!card || !state.flipped) return state

  const known = state.known.filter((id) => id !== card.id)
  const review = state.review.filter((id) => id !== card.id)
  if (result === 'known') known.push(card.id)
  else review.push(card.id)

  return { ...state, known, review, index: state.index + 1, flipped: false }
}

/** Starts a new session containing only the cards that were marked "still learning". */
export function startReviewSession(state: StudyState, options: StartOptions = {}): StudyState {
  const missed = new Set(state.review)
  return startSession(
    state.order.filter((card) => missed.has(card.id)),
    options,
  )
}
