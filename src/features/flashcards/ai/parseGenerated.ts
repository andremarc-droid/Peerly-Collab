import { MAX_CARD_BACK_LENGTH, MAX_CARD_FRONT_LENGTH } from '../constants'
import { newCardId } from '../schemas'
import type { Flashcard } from '../types'

export interface ParsedGeneratedCards {
  cards: Flashcard[]
  /** Items the model returned that were unusable (blank, too long, or duplicates). */
  skipped: number
}

function extractJsonArray(raw: string): unknown {
  const unfenced = raw.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('[')
  const end = unfenced.lastIndexOf(']')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
}

function pickText(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  }
  return ''
}

/**
 * Reads the model's reply into flashcards. Model output is untrusted: every
 * card is trimmed, length-checked and de-duplicated, and at most `limit` cards are returned.
 */
export function parseGeneratedCards(raw: string, limit: number): ParsedGeneratedCards {
  const parsed = extractJsonArray(raw)
  if (!Array.isArray(parsed)) return { cards: [], skipped: 0 }

  const cards: Flashcard[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      skipped += 1
      continue
    }
    const record = item as Record<string, unknown>
    const front = pickText(record, ['front', 'question', 'q', 'term'])
    const back = pickText(record, ['back', 'answer', 'a', 'definition'])
    const key = front.toLowerCase()

    if (
      !front ||
      !back ||
      front.length > MAX_CARD_FRONT_LENGTH ||
      back.length > MAX_CARD_BACK_LENGTH ||
      seen.has(key)
    ) {
      skipped += 1
      continue
    }
    if (cards.length >= limit) continue

    seen.add(key)
    cards.push({ id: newCardId(), front, back })
  }

  return { cards, skipped }
}
