import { GroupQuizError } from './groupQuizLogic.js'
import { parseConnectionEdge } from './groupQuizGrading.js'

export const CANVAS_BOARD_LIMITS = {
  maxPrebuiltCards: 50,
  maxPrebuiltConnections: 80,
  maxBlankCards: 30,
  maxBlankConnections: 80,
  maxCardTitleLength: 120,
  maxCardContentLength: 2000,
  maxUrlLength: 500,
} as const

/**
 * Returns the trimmed URL when it is a well-formed, credential-free https URL
 * of at most 500 characters. Returns null for everything else (http,
 * javascript:, data:, relative paths, URLs with whitespace or embedded credentials).
 */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > CANVAS_BOARD_LIMITS.maxUrlLength) return null
  if (/\s/.test(trimmed)) return null
  if (!/^https:\/\//i.test(trimmed)) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.username !== '' || parsed.password !== '') return null
  if (parsed.hostname === '') return null
  return trimmed
}

export interface BlankCanvasCardSubmission {
  id: string
  type: string
  title: string
  content?: string
  url?: string
  position?: { x: number; y: number }
}

export interface BlankCanvasSubmission {
  cards: BlankCanvasCardSubmission[]
  connections: string[]
}

/** Strictly validates blank canvas submission cards and connections. Never coerces invalid data. */
export function validateBlankBoard(
  board: unknown,
  question: { maxCards?: number; maxConnections?: number; allowedCardTypes?: string[] },
): BlankCanvasSubmission {
  if (typeof board !== 'object' || board === null) {
    return { cards: [], connections: [] }
  }
  const b = board as Record<string, unknown>
  const rawCards = Array.isArray(b.cards) ? b.cards : []
  const rawConnections = Array.isArray(b.connections) ? b.connections : []

  const maxCards = question.maxCards ?? 20
  const effectiveMaxCards = Math.min(maxCards, CANVAS_BOARD_LIMITS.maxBlankCards)
  if (rawCards.length > effectiveMaxCards) {
    throw new GroupQuizError(`The board exceeds the limit of ${effectiveMaxCards} cards.`)
  }

  const maxConnections = question.maxConnections ?? 40
  const effectiveMaxConnections = Math.min(maxConnections, CANVAS_BOARD_LIMITS.maxBlankConnections)
  if (rawConnections.length > effectiveMaxConnections) {
    throw new GroupQuizError(`The board exceeds the limit of ${effectiveMaxConnections} connections.`)
  }

  const allowedTypes = question.allowedCardTypes ?? ['note', 'paragraph', 'link']
  const cardIds = new Set<string>()
  const cards: BlankCanvasCardSubmission[] = []

  for (const rawCard of rawCards) {
    if (typeof rawCard !== 'object' || rawCard === null) throw new GroupQuizError('Invalid card format on board.')
    const c = rawCard as Record<string, unknown>
    if (typeof c.id !== 'string' || !c.id.trim()) throw new GroupQuizError('Invalid card ID on board.')
    if (cardIds.has(c.id)) throw new GroupQuizError(`Duplicate card ID ${c.id} on board.`)
    cardIds.add(c.id)

    if (typeof c.type !== 'string' || !allowedTypes.includes(c.type)) {
      throw new GroupQuizError(`Card type ${String(c.type)} is not allowed on this board.`)
    }

    const title = typeof c.title === 'string' ? c.title : ''
    if (title.length > CANVAS_BOARD_LIMITS.maxCardTitleLength) {
      throw new GroupQuizError(`Card title cannot exceed ${CANVAS_BOARD_LIMITS.maxCardTitleLength} characters.`)
    }

    const content = typeof c.content === 'string' ? c.content : ''
    if (content.length > CANVAS_BOARD_LIMITS.maxCardContentLength) {
      throw new GroupQuizError(`Card content cannot exceed ${CANVAS_BOARD_LIMITS.maxCardContentLength} characters.`)
    }

    let url: string | undefined
    if (c.type === 'link') {
      const checkedUrl = safeHttpsUrl(c.url)
      if (!checkedUrl) {
        throw new GroupQuizError('Link cards must have a valid https:// URL on submission.')
      }
      url = checkedUrl
    }

    let position = { x: 0, y: 0 }
    if (typeof c.position === 'object' && c.position !== null) {
      const pos = c.position as { x?: unknown; y?: unknown }
      if (typeof pos.x === 'number' && Number.isFinite(pos.x) && typeof pos.y === 'number' && Number.isFinite(pos.y)) {
        position = { x: pos.x, y: pos.y }
      }
    }

    cards.push({
      id: c.id,
      type: c.type,
      title,
      content,
      ...(url !== undefined ? { url } : {}),
      position,
    })
  }

  const connections: string[] = []
  const seenConnections = new Set<string>()

  for (const rawConn of rawConnections) {
    if (typeof rawConn !== 'string') throw new GroupQuizError('Invalid connection format on board.')
    const parsed = parseConnectionEdge(rawConn)
    if (!parsed) throw new GroupQuizError(`Invalid connection syntax: ${rawConn}`)
    if (parsed.from === parsed.to) throw new GroupQuizError('Self-connections are not allowed.')
    if (!cardIds.has(parsed.from) || !cardIds.has(parsed.to)) {
      throw new GroupQuizError(`Connection refers to a non-existent card on the board: ${rawConn}`)
    }
    if (seenConnections.has(rawConn)) continue
    seenConnections.add(rawConn)
    connections.push(rawConn)
  }

  return { cards, connections }
}

/** Strictly validates prebuilt canvas connections against question cards. */
export function validatePrebuiltBoard(
  board: unknown,
  question: { cards?: ReadonlyArray<{ id: string }> },
): string[] {
  let rawConnections: unknown[] = []
  if (Array.isArray(board)) {
    rawConnections = board
  } else if (typeof board === 'object' && board !== null && Array.isArray((board as { connections?: unknown }).connections)) {
    rawConnections = (board as { connections: unknown[] }).connections
  }

  if (rawConnections.length > CANVAS_BOARD_LIMITS.maxPrebuiltConnections) {
    throw new GroupQuizError(`The board exceeds the limit of ${CANVAS_BOARD_LIMITS.maxPrebuiltConnections} connections.`)
  }

  const validCards = Array.isArray(question.cards) ? question.cards : []
  const validCardIds = new Set(validCards.map(c => c.id))
  const connections: string[] = []
  const seen = new Set<string>()

  for (const raw of rawConnections) {
    if (typeof raw !== 'string') throw new GroupQuizError('Invalid connection format.')
    const parsed = parseConnectionEdge(raw)
    if (!parsed) throw new GroupQuizError(`Invalid connection syntax: ${raw}`)
    if (parsed.from === parsed.to) continue // self-connections ignored
    if (!validCardIds.has(parsed.from) || !validCardIds.has(parsed.to)) continue // unknown cards ignored
    if (seen.has(raw)) continue
    seen.add(raw)
    connections.push(raw)
  }

  return connections
}
