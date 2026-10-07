import { MAX_CARD_BACK_LENGTH, MAX_CARD_FRONT_LENGTH } from './constants'
import { newCardId } from './schemas'
import type { Flashcard } from './types'

export interface BulkParseResult {
  cards: Flashcard[]
  skipped: number
}

/**
 * Parses pasted text, one card per line, with the front and back separated by a
 * tab or "::" (for example `Mitochondria :: Powerhouse of the cell`).
 * Lines that are blank are ignored; lines that are malformed or too long are counted as skipped.
 */
export function parseBulkCards(input: string): BulkParseResult {
  const cards: Flashcard[] = []
  let skipped = 0

  for (const rawLine of input.split(/\r?\n/)) {
    if (!rawLine.trim()) continue

    const tabAt = rawLine.indexOf('\t')
    const separator = tabAt >= 0 ? '\t' : '::'
    const at = tabAt >= 0 ? tabAt : rawLine.indexOf('::')
    if (at < 0) {
      skipped += 1
      continue
    }

    const front = rawLine.slice(0, at).trim()
    const back = rawLine.slice(at + separator.length).trim()
    if (
      !front ||
      !back ||
      front.length > MAX_CARD_FRONT_LENGTH ||
      back.length > MAX_CARD_BACK_LENGTH
    ) {
      skipped += 1
      continue
    }
    cards.push({ id: newCardId(), front, back })
  }

  return { cards, skipped }
}
