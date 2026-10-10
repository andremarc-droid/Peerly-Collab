import { MAX_CARD_BACK_LENGTH, MAX_CARD_FRONT_LENGTH, MAX_DECK_CARDS } from './constants'
import { newCardId } from './schemas'
import type { Flashcard } from './types'

export interface CardImportResult {
  cards: Flashcard[]
  skipped: number
  truncated: number
  warnings: string[]
}

export type SeparatorChoice = 'tab' | 'comma' | 'custom'
export type RowSeparatorChoice = 'newline' | 'semicolon' | 'custom'

export interface QuizletParseOptions {
  termSeparator: SeparatorChoice
  rowSeparator: RowSeparatorChoice
  customTermSeparator?: string
  customRowSeparator?: string
}

const separatorValue: Record<Exclude<SeparatorChoice, 'custom'>, string> = {
  tab: '\t',
  comma: ',',
}
const rowValue: Record<Exclude<RowSeparatorChoice, 'custom'>, string> = {
  newline: '\n',
  semicolon: ';',
}

function splitDelimited(input: string, separator: string): string[] {
  if (!separator) return []
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && input.startsWith(separator, index)) {
      fields.push(field.trim())
      field = ''
      index += separator.length - 1
      continue
    }
    field += character
  }
  fields.push(field.trim())
  return fields
}

function createCard(front: string, back: string): { card?: Flashcard; wasTruncated: boolean } {
  const cleanFront = front.trim()
  const cleanBack = back.trim()
  if (!cleanFront || !cleanBack) return { wasTruncated: false }
  const wasTruncated = cleanFront.length > MAX_CARD_FRONT_LENGTH || cleanBack.length > MAX_CARD_BACK_LENGTH
  return {
    card: {
      id: newCardId(),
      front: cleanFront.slice(0, MAX_CARD_FRONT_LENGTH),
      back: cleanBack.slice(0, MAX_CARD_BACK_LENGTH),
    },
    wasTruncated,
  }
}

export function parseQuizletText(input: string, options: QuizletParseOptions): CardImportResult {
  const termSeparator = options.termSeparator === 'custom'
    ? options.customTermSeparator?.slice(0, 20) ?? ''
    : separatorValue[options.termSeparator]
  const rowSeparator = options.rowSeparator === 'custom'
    ? options.customRowSeparator?.slice(0, 20) ?? ''
    : rowValue[options.rowSeparator]
  const result: CardImportResult = { cards: [], skipped: 0, truncated: 0, warnings: [] }
  if (!termSeparator || !rowSeparator) return { ...result, warnings: ['Choose a non-empty custom separator.'] }

  for (const row of splitDelimited(input.replace(/\r\n?/g, '\n'), rowSeparator)) {
    if (!row.trim()) continue
    const [front = '', back = ''] = splitDelimited(row, termSeparator)
    const parsed = createCard(front, back)
    if (!parsed.card) result.skipped += 1
    else {
      result.cards.push(parsed.card)
      if (parsed.wasTruncated) result.truncated += 1
    }
  }
  return result
}

function ankiSeparator(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'tab' || normalized === '\\t') return '\t'
  if (normalized === 'comma') return ','
  if (normalized === 'semicolon') return ';'
  if (normalized === 'pipe') return '|'
  return value ?? '\t'
}

function stripAnkiMarkup(value: string, htmlEnabled: boolean): { text: string; hadImage: boolean } {
  const hadImage = /<(?:img|image)\b/i.test(value)
  const text = value
    .replace(/\[sound:[^\]]*\]/gi, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, htmlEnabled ? ' ' : '&nbsp;')
    .replace(/&amp;/gi, htmlEnabled ? '&' : '&amp;')
    .replace(/&lt;/gi, htmlEnabled ? '<' : '&lt;')
    .replace(/&gt;/gi, htmlEnabled ? '>' : '&gt;')
    .replace(/&quot;/gi, htmlEnabled ? '"' : '&quot;')
    .replace(/&#39;|&apos;/gi, htmlEnabled ? "'" : '&apos;')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, hadImage }
}

export interface AnkiParseOptions {
  frontColumn?: number
  backColumn?: number
}

export interface AnkiParseResult extends CardImportResult {
  columns: string[]
}

export function parseAnkiText(input: string, options: AnkiParseOptions = {}): AnkiParseResult {
  let separator = '\t'
  let columns: string[] = []
  let html = false
  const rows: string[] = []
  for (const line of input.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('#separator:')) separator = ankiSeparator(line.slice('#separator:'.length))
    else if (line.startsWith('#html:')) html = line.slice('#html:'.length).trim().toLowerCase() === 'true'
    else if (line.startsWith('#columns:')) columns = splitDelimited(line.slice('#columns:'.length), separator)
    else if (line && !line.startsWith('#')) rows.push(line)
  }

  let imageWarning = false
  let skipped = 0
  let truncated = 0
  const cards: Flashcard[] = []
  const frontColumn = options.frontColumn ?? 0
  const backColumn = options.backColumn ?? 1
  for (const row of rows) {
    const fields = splitDelimited(row, separator)
    const frontRaw = fields[frontColumn] ?? ''
    const backRaw = fields[backColumn] ?? ''
    imageWarning ||= /<(?:img|image)\b/i.test(frontRaw) || /<(?:img|image)\b/i.test(backRaw)
    const front = stripAnkiMarkup(frontRaw, html)
    const back = stripAnkiMarkup(backRaw, html)
    imageWarning ||= front.hadImage || back.hadImage
    const parsed = createCard(front.text, back.text)
    if (!parsed.card) skipped += 1
    else {
      cards.push(parsed.card)
      if (parsed.wasTruncated) truncated += 1
    }
  }

  return {
    cards,
    skipped,
    truncated,
    columns: columns.length ? columns : ['Field 1', 'Field 2'],
    warnings: imageWarning ? ['Image media was omitted. Export images separately or add them after importing.'] : [],
  }
}

export function splitCardsIntoDecks(cards: readonly Flashcard[], maxCards = MAX_DECK_CARDS): Flashcard[][] {
  const size = Math.max(1, Math.min(MAX_DECK_CARDS, Math.floor(maxCards)))
  const decks: Flashcard[][] = []
  for (let offset = 0; offset < cards.length; offset += size) decks.push(cards.slice(offset, offset + size))
  return decks
}
