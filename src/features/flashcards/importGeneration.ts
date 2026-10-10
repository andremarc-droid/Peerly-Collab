import { aiComplete, AiError, isAbortError, type AiComplete } from '../studyEngine/ai'
import { buildGenerationMessages, tokensForCount } from './ai/generateCards'
import { parseGeneratedCards } from './ai/parseGenerated'
import { prepareCards } from './schemas'
import type { Flashcard } from './types'

export const IMPORT_CHUNK_CHARS = 6_000
export const IMPORT_MAX_CHUNKS = 10
export const IMPORT_MAX_SOURCE_CHARS = IMPORT_CHUNK_CHARS * IMPORT_MAX_CHUNKS
export const IMPORT_MAX_CARDS = 100

export interface TextChunkingResult {
  chunks: string[]
  capped: boolean
  originalLength: number
}

export function chunkImportText(input: string): TextChunkingResult {
  const normalized = input.trim()
  const cappedText = normalized.slice(0, IMPORT_MAX_SOURCE_CHARS)
  const chunks: string[] = []
  let remaining = cappedText
  while (remaining.length > 0 && chunks.length < IMPORT_MAX_CHUNKS) {
    if (remaining.length <= IMPORT_CHUNK_CHARS) {
      chunks.push(remaining.trim())
      break
    }
    const limit = remaining.slice(0, IMPORT_CHUNK_CHARS)
    const paragraphBreak = limit.lastIndexOf('\n\n')
    const wordBreak = limit.lastIndexOf(' ')
    const splitAt = paragraphBreak > IMPORT_CHUNK_CHARS * 0.55
      ? paragraphBreak
      : wordBreak > IMPORT_CHUNK_CHARS * 0.7 ? wordBreak : IMPORT_CHUNK_CHARS
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  return { chunks: chunks.filter(Boolean), capped: normalized.length > IMPORT_MAX_SOURCE_CHARS, originalLength: input.length }
}

export function dedupeImportedCards(cards: readonly Flashcard[]): Flashcard[] {
  const seen = new Set<string>()
  const unique: Flashcard[] = []
  for (const card of cards) {
    const key = card.front.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(card)
    if (unique.length >= IMPORT_MAX_CARDS) break
  }
  return unique
}

export type ImportAiFailure = 'rate-limit' | 'unavailable' | 'invalid-reply'

export interface GenerateImportCardsOptions {
  sourceText: string
  desiredCount: number
  signal?: AbortSignal
  complete?: AiComplete
  existingCards?: readonly Flashcard[]
  chunkIndexes?: readonly number[]
  onProgress?: (chunk: number, total: number) => void
}

export interface GenerateImportCardsResult {
  cards: Flashcard[]
  chunks: string[]
  capped: boolean
  failedChunks: number[]
  failureReason?: ImportAiFailure
  cancelled: boolean
}

function reasonFor(error: unknown): ImportAiFailure {
  return error instanceof AiError ? error.reason : 'unavailable'
}

export async function generateImportCards({
  sourceText,
  desiredCount,
  signal,
  complete = (prompt, signal, settings) => aiComplete(prompt, { signal, ...settings }),
  existingCards = [],
  chunkIndexes,
  onProgress,
}: GenerateImportCardsOptions): Promise<GenerateImportCardsResult> {
  const { chunks, capped } = chunkImportText(sourceText)
  const selected = [...new Set(chunkIndexes ?? chunks.map((_, index) => index + 1))]
    .filter(index => Number.isInteger(index) && index >= 1 && index <= chunks.length)
  const target = Math.max(1, Math.min(IMPORT_MAX_CARDS, Math.floor(desiredCount)))
  let cards = dedupeImportedCards([...existingCards])

  for (let position = 0; position < selected.length; position += 1) {
    const chunkNumber = selected[position]!
    if (signal?.aborted) return { cards, chunks, capped, failedChunks: [], cancelled: true }
    onProgress?.(chunkNumber, chunks.length)
    const remainingTarget = Math.max(1, target - cards.length)
    const requestCount = Math.min(30, Math.max(1, Math.ceil(remainingTarget / (selected.length - position))))

    try {
      const prompt = buildGenerationMessages(chunks[chunkNumber - 1]!, requestCount)
      const reply = await complete(prompt, signal, { maxTokens: tokensForCount(requestCount), temperature: 0.4 })
      const parsed = parseGeneratedCards(reply, requestCount)
      if (parsed.cards.length === 0) throw new AiError('invalid-reply', 'The AI response did not contain valid flashcards.')
      const validated = prepareCards(parsed.cards)
      cards = dedupeImportedCards([...cards, ...validated])
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return { cards, chunks, capped, failedChunks: [], cancelled: true }
      }
      return {
        cards,
        chunks,
        capped,
        failedChunks: selected.slice(position),
        failureReason: reasonFor(error),
        cancelled: false,
      }
    }
  }

  return { cards: cards.slice(0, target), chunks, capped, failedChunks: [], cancelled: false }
}
