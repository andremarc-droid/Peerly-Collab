import type { Flashcard } from '../flashcards/types'
import type { PublicDeck, ReportReason } from './types'

export function sanitizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
}

export function parseTags(input: string): string[] {
  const parts = input.split(/[,\s]+/)
  const set = new Set<string>()
  for (const part of parts) {
    const cleaned = sanitizeTag(part)
    if (cleaned.length >= 2) {
      set.add(cleaned)
    }
    if (set.size >= 5) break
  }
  return Array.from(set)
}

export function validatePublicCards(cards: Flashcard[]): { valid: boolean; error?: string } {
  if (!Array.isArray(cards) || cards.length === 0) {
    return { valid: false, error: 'A deck must have at least 1 card to be published.' }
  }
  if (cards.length > 100) {
    return { valid: false, error: 'A public deck cannot have more than 100 cards.' }
  }
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    if (!card || typeof card.front !== 'string' || typeof card.back !== 'string') {
      return { valid: false, error: `Card #${i + 1} has invalid content.` }
    }
    if (!card.front.trim() || !card.back.trim()) {
      return { valid: false, error: `Card #${i + 1} cannot have empty front or back.` }
    }
    if (card.front.length > 300) {
      return { valid: false, error: `Card #${i + 1} front cannot exceed 300 characters.` }
    }
    if (card.back.length > 600) {
      return { valid: false, error: `Card #${i + 1} back cannot exceed 600 characters.` }
    }
  }
  return { valid: true }
}

export function matchesPublicDeck(deck: PublicDeck, search: string, selectedTag?: string): boolean {
  if (selectedTag && !deck.tags.includes(selectedTag.toLowerCase())) {
    return false
  }
  const term = search.trim().toLowerCase()
  if (!term) return true
  if (deck.title.toLowerCase().includes(term)) return true
  if (deck.description.toLowerCase().includes(term)) return true
  if (deck.authorDisplayName.toLowerCase().includes(term)) return true
  if (deck.tags.some(t => t.includes(term))) return true
  return false
}

export const VALID_REPORT_REASONS: Record<ReportReason, string> = {
  inappropriate: 'Inappropriate or offensive content',
  copyright: 'Copyright or intellectual property violation',
  spam: 'Spam, advertising, or misleading title',
  other: 'Other issue',
}
