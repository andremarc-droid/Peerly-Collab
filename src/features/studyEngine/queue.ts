import type { DeckProgress } from './progress'
import type { CardState } from './srs'

export interface StudyCard { id: string; front: string; back: string }
export interface StudyDeck { classId: string; id: string; cards: StudyCard[] }
export interface QueuedCard extends StudyCard { deckKey: string; state: CardState | null }
export interface StudyQueue { cards: QueuedCard[]; dueCount: number; newCount: number }

export function deckProgressKey(classId: string, deckId: string): string {
  return `${classId}~${deckId}`
}

/** Due cards are sorted by greatest overdue duration, then new cards fill today's allowance. */
export function buildQueue(
  deck: StudyDeck,
  progress: DeckProgress,
  now: number,
  dailyNewLimit = 20,
): StudyQueue {
  const key = deckProgressKey(deck.classId, deck.id)
  const due = deck.cards.flatMap((card) => {
    const state = progress.cards[card.id]
    return state && state.due <= now ? [{ ...card, deckKey: key, state }] : []
  }).sort((a, b) => a.state!.due - b.state!.due)
  const allowance = Math.max(0, Math.floor(dailyNewLimit) - progress.newCount)
  const fresh = deck.cards.filter((card) => !progress.cards[card.id]).slice(0, allowance)
    .map((card) => ({ ...card, deckKey: key, state: null }))
  return { cards: [...due, ...fresh], dueCount: due.length, newCount: fresh.length }
}

export function countStudyLoad(
  decks: readonly StudyDeck[],
  progressByDeckKey: Readonly<Record<string, DeckProgress>>,
  now: number,
  dailyNewLimit = 20,
): { due: number; new: number } {
  return decks.reduce((total, deck) => {
    const progress = progressByDeckKey[deckProgressKey(deck.classId, deck.id)] ?? { version: 1, cards: {}, newDay: '', newCount: 0 }
    const queue = buildQueue(deck, progress, now, dailyNewLimit)
    return { due: total.due + queue.dueCount, new: total.new + queue.newCount }
  }, { due: 0, new: 0 })
}
