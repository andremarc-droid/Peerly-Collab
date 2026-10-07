import type { Flashcard, FlashcardDeckRecord } from './types'

function cardLabel(card: Flashcard): string {
  const front = card.front.trim().replace(/\s+/g, ' ')
  return front ? `“${front.slice(0, 32)}${front.length > 32 ? '…' : ''}”` : 'an untitled card'
}

export function summarizeDeckChanges(
  previous: Pick<FlashcardDeckRecord, 'title' | 'description' | 'cards'>,
  next: Pick<FlashcardDeckRecord, 'title' | 'description' | 'cards'>,
): string {
  const changes: string[] = []
  const title = next.title.trim()
  if (previous.title.trim() !== title) changes.push(`Renamed the deck to “${title}”`)
  if (previous.description.trim() !== next.description.trim()) changes.push('Updated the deck description')

  const before = new Map(previous.cards.map((card) => [card.id, card]))
  const after = new Map(next.cards.map((card) => [card.id, card]))
  for (const card of next.cards) {
    const old = before.get(card.id)
    if (!old) changes.push(`Added ${cardLabel(card)}`)
    else if (old.front.trim() !== card.front.trim() || old.back.trim() !== card.back.trim()) changes.push(`Edited ${cardLabel(card)}`)
  }
  for (const card of previous.cards) {
    if (!after.has(card.id)) changes.push(`Removed ${cardLabel(card)}`)
  }

  if (changes.length === 0) return 'Saved the deck without changing its content'
  const visible = changes.slice(0, 3)
  if (changes.length > visible.length) visible.push(`and ${changes.length - visible.length} more changes`)
  return visible.join('; ').slice(0, 200)
}
