import { Timestamp } from 'firebase/firestore'
import {
  MAX_CARD_BACK_LENGTH,
  MAX_CARD_FRONT_LENGTH,
  MAX_DECK_CARDS,
  MAX_DECK_DESCRIPTION_LENGTH,
  MAX_DECK_TITLE_LENGTH,
} from './constants'
import type {
  Flashcard,
  FlashcardDeckKind,
  FlashcardDeckRecord,
  FlashcardDeckStatus,
} from './types'

export class FlashcardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlashcardValidationError'
  }
}

type RecordValue = Record<string, unknown>

function record(value: unknown, fieldName: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlashcardValidationError(`${fieldName} must be an object.`)
  }
  return value as RecordValue
}

function text(value: unknown, fieldName: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new FlashcardValidationError(`${fieldName} must be a string.`)
  }
  if (!allowEmpty && !value.trim()) {
    throw new FlashcardValidationError(`${fieldName} cannot be empty.`)
  }
  if (value.length > max) {
    throw new FlashcardValidationError(`${fieldName} cannot exceed ${max} characters.`)
  }
  return value
}

function timestampField(value: unknown, fieldName: string): Timestamp {
  if (value instanceof Timestamp) return value
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    const v = value as { seconds: number; nanoseconds?: number }
    return new Timestamp(v.seconds, v.nanoseconds ?? 0)
  }
  throw new FlashcardValidationError(`${fieldName} must be a valid timestamp.`)
}

export function newCardId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
}

/** Trims and validates editor rows. Fully blank rows are dropped; half-filled rows are errors. */
export function prepareCards(drafts: ReadonlyArray<Flashcard>): Flashcard[] {
  const cards: Flashcard[] = []
  const seen = new Set<string>()

  drafts.forEach((draft, index) => {
    const front = draft.front.trim()
    const back = draft.back.trim()
    if (!front && !back) return

    const position = index + 1
    if (!front || !back) {
      throw new FlashcardValidationError(`Card ${position} needs both a front and a back.`)
    }
    if (front.length > MAX_CARD_FRONT_LENGTH) {
      throw new FlashcardValidationError(
        `Card ${position} front cannot exceed ${MAX_CARD_FRONT_LENGTH} characters.`,
      )
    }
    if (back.length > MAX_CARD_BACK_LENGTH) {
      throw new FlashcardValidationError(
        `Card ${position} back cannot exceed ${MAX_CARD_BACK_LENGTH} characters.`,
      )
    }

    const id = draft.id && !seen.has(draft.id) ? draft.id : newCardId()
    seen.add(id)
    cards.push({ id, front, back })
  })

  if (cards.length === 0) {
    throw new FlashcardValidationError('Add at least one card with a front and a back.')
  }
  if (cards.length > MAX_DECK_CARDS) {
    throw new FlashcardValidationError(`A deck cannot exceed ${MAX_DECK_CARDS} cards.`)
  }
  return cards
}

export function cleanDeckText(
  title: string,
  description: string,
): { title: string; description: string } {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new FlashcardValidationError('Give your deck a title.')
  if (cleanTitle.length > MAX_DECK_TITLE_LENGTH) {
    throw new FlashcardValidationError(
      `Deck title cannot exceed ${MAX_DECK_TITLE_LENGTH} characters.`,
    )
  }
  const cleanDescription = description.trim()
  if (cleanDescription.length > MAX_DECK_DESCRIPTION_LENGTH) {
    throw new FlashcardValidationError(
      `Deck description cannot exceed ${MAX_DECK_DESCRIPTION_LENGTH} characters.`,
    )
  }
  return { title: cleanTitle, description: cleanDescription }
}

export function parseFlashcard(value: unknown): Flashcard {
  const obj = record(value, 'Card')
  const id = text(obj.id, 'Card id', 64)
  const front = text(obj.front, 'Card front', MAX_CARD_FRONT_LENGTH)
  const back = text(obj.back, 'Card back', MAX_CARD_BACK_LENGTH)
  return { id, front, back }
}

export function parseFlashcardDeck(value: unknown): FlashcardDeckRecord {
  const obj = record(value, 'Flashcard deck')

  const kind = text(obj.kind, 'kind', 20) as FlashcardDeckKind
  if (kind !== 'class' && kind !== 'personal') {
    throw new FlashcardValidationError('Deck kind must be "class" or "personal".')
  }

  const status = text(obj.status, 'status', 20) as FlashcardDeckStatus
  if (kind === 'personal' && status !== 'private') {
    throw new FlashcardValidationError('Personal decks must be private.')
  }
  if (kind === 'class' && status !== 'draft' && status !== 'published') {
    throw new FlashcardValidationError('Class decks must be "draft" or "published".')
  }

  if (!Array.isArray(obj.cards)) {
    throw new FlashcardValidationError('cards must be an array.')
  }
  if (obj.cards.length > MAX_DECK_CARDS) {
    throw new FlashcardValidationError(`A deck cannot exceed ${MAX_DECK_CARDS} cards.`)
  }
  const cards = obj.cards.map(parseFlashcard)
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new FlashcardValidationError('Card ids must be unique.')
  }

  if (obj.cardCount !== cards.length) {
    throw new FlashcardValidationError('cardCount must match the number of cards.')
  }

  return {
    ownerId: text(obj.ownerId, 'ownerId', 128),
    classId: text(obj.classId, 'classId', 128),
    kind,
    title: text(obj.title, 'title', MAX_DECK_TITLE_LENGTH),
    description: text(obj.description, 'description', MAX_DECK_DESCRIPTION_LENGTH, true),
    status,
    cardCount: cards.length,
    cards,
    createdAt: timestampField(obj.createdAt, 'createdAt'),
    updatedAt: timestampField(obj.updatedAt, 'updatedAt'),
  }
}
