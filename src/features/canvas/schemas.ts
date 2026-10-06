import { DomainValidationError } from '../quizzes/schemas'
import { normalizeGenericUrl, parseDriveUrl } from '../modules/links'
import type { DriveKind } from '../modules/types'
import type {
  CanvasAnswerKey,
  CanvasBounds,
  CanvasCard,
  CanvasConnection,
  CanvasDiff,
  CanvasLayoutMode,
  CanvasQuestion,
  CanvasWrongPenalty,
} from './types'

export const CANVAS_CARD_WIDTH = 180
export const CANVAS_CARD_HEIGHT = 100
export const CANVAS_CARD_PADDING = 20

type RecordValue = Record<string, unknown>

function record(value: unknown, name: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DomainValidationError(`${name} must be an object`)
  }
  return value as RecordValue
}

function string(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new DomainValidationError(`${name} must be a${allowEmpty ? ' string' : ' non-empty string'}`)
  }
  return value
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new DomainValidationError(`${name} must be a boolean`)
  }
  return value
}

function numberField(value: unknown, name: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new DomainValidationError(`${name} must be a number of at least ${minimum}`)
  }
  return value
}

export function normalizeConnection(from: string, to: string, directed: boolean): string {
  const f = from.trim()
  const t = to.trim()
  if (directed) {
    return `${f}->${t}`
  }
  return f < t ? `${f}<->${t}` : `${t}<->${f}`
}

export function renormalizeConnections(
  connections: CanvasConnection[],
  newDirected: boolean,
): { connections: CanvasConnection[]; mergedCount: number } {
  if (newDirected) {
    const next = connections.map((c) => ({
      ...c,
      id: normalizeConnection(c.from, c.to, true),
    }))
    return { connections: next, mergedCount: 0 }
  }

  const map = new Map<string, CanvasConnection>()
  let mergedCount = 0

  for (const c of connections) {
    const norm = normalizeConnection(c.from, c.to, false)
    const existing = map.get(norm)
    if (existing) {
      mergedCount += 1
      existing.points = Math.max(existing.points ?? 1, c.points ?? 1)
    } else {
      const [canonFrom, canonTo] = c.from < c.to ? [c.from, c.to] : [c.to, c.from]
      const isSwapped = canonFrom !== c.from
      const item: CanvasConnection = {
        id: norm,
        from: canonFrom,
        to: canonTo,
        points: c.points ?? 1,
      }
      if (isSwapped) {
        if (c.targetHandle) item.sourceHandle = c.targetHandle
        if (c.sourceHandle) item.targetHandle = c.sourceHandle
      } else {
        if (c.sourceHandle) item.sourceHandle = c.sourceHandle
        if (c.targetHandle) item.targetHandle = c.targetHandle
      }
      map.set(norm, item)
    }
  }

  return { connections: Array.from(map.values()), mergedCount }
}

export function parseConnectionEdge(edge: string): { from: string; to: string } | null {
  if (typeof edge !== 'string') return null
  const separator = edge.includes('<->') ? '<->' : edge.includes('->') ? '->' : null
  if (!separator) return null
  const parts = edge.split(separator)
  if (parts.length !== 2) return null
  const from = parts[0]?.trim() ?? ''
  const to = parts[1]?.trim() ?? ''
  if (!from || !to) return null
  return { from, to }
}

function hasControlOrNewline(input: string): boolean {
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    if (code < 32 || code === 127) return true
  }
  return false
}

import type { CanvasAllowedCardType } from './types'

export interface ValidateCanvasOptions {
  allowLegacyImages?: boolean
  boardKind?: 'prebuilt' | 'blank'
}

export function isLegacyImageCard(card: CanvasCard): boolean {
  return card.type === 'image' && (!card.imageId || Boolean(card.url || card.driveFileId))
}

export function validateCanvasDefinition(value: unknown, options?: ValidateCanvasOptions): CanvasQuestion {
  const q = record(value, 'question')
  if (q.type !== 'canvas') {
    throw new DomainValidationError('question.type must be canvas')
  }

  const prompt = string(q.prompt, 'prompt')
  if (prompt.length > 2000) {
    throw new DomainValidationError('prompt must not exceed 2000 characters')
  }

  const order = q.order === undefined ? 0 : numberField(q.order, 'order', 0)
  if (!Number.isInteger(order)) {
    throw new DomainValidationError('order must be an integer')
  }

  const points = q.points === undefined ? 100 : numberField(q.points, 'points', 1)
  if (!Number.isInteger(points)) {
    throw new DomainValidationError('points must be a positive integer')
  }

  const isBlank =
    options?.boardKind === 'blank' ||
    q.boardKind === 'blank' ||
    q.allowedCardTypes !== undefined ||
    q.rubric !== undefined ||
    q.maxCards !== undefined ||
    (Array.isArray(q.cards) && q.cards.length === 0 && options?.boardKind !== 'prebuilt' && q.boardKind !== 'prebuilt' && q.layoutMode === undefined)

  if (isBlank) {
    let rubric: string | undefined
    if (q.rubric !== undefined && q.rubric !== null && q.rubric !== '') {
      rubric = string(q.rubric, 'rubric', true)
      if (rubric.length > 1000) {
        throw new DomainValidationError('rubric must not exceed 1000 characters')
      }
    }

    const showRubricToStudents =
      q.showRubricToStudents === undefined ? true : bool(q.showRubricToStudents, 'showRubricToStudents')

    const maxCards = q.maxCards === undefined ? 20 : numberField(q.maxCards, 'maxCards', 1)
    if (!Number.isInteger(maxCards) || maxCards < 1 || maxCards > 30) {
      throw new DomainValidationError('maxCards must be an integer between 1 and 30')
    }

    const maxConnections = q.maxConnections === undefined ? 40 : numberField(q.maxConnections, 'maxConnections', 0)
    if (!Number.isInteger(maxConnections) || maxConnections < 0 || maxConnections > 80) {
      throw new DomainValidationError('maxConnections must be an integer between 0 and 80')
    }

    let allowedCardTypes: CanvasAllowedCardType[] = ['note', 'paragraph', 'link']
    if (q.allowedCardTypes !== undefined) {
      if (!Array.isArray(q.allowedCardTypes) || q.allowedCardTypes.length === 0) {
        throw new DomainValidationError('allowedCardTypes must be a non-empty list')
      }
      for (const t of q.allowedCardTypes) {
        if (t !== 'note' && t !== 'paragraph' && t !== 'link') {
          throw new DomainValidationError(`Invalid allowedCardType: ${String(t)}`)
        }
      }
      allowedCardTypes = Array.from(new Set(q.allowedCardTypes)) as CanvasAllowedCardType[]
    }

    if (q.cards !== undefined && (!Array.isArray(q.cards) || q.cards.length > 0)) {
      throw new DomainValidationError('Blank canvas cards must be empty []')
    }

    return {
      order,
      type: 'canvas',
      prompt,
      points,
      cards: [],
      rubric,
      showRubricToStudents,
      maxCards,
      maxConnections,
      allowedCardTypes,
    }
  }

  const layoutMode = (q.layoutMode ?? 'scattered') as CanvasLayoutMode
  if (layoutMode !== 'scattered' && layoutMode !== 'fixed') {
    throw new DomainValidationError('layoutMode must be scattered or fixed')
  }

  const directed = q.directed === undefined ? true : bool(q.directed, 'directed')

  const wrongPenalty = (q.wrongPenalty ?? 'half') as CanvasWrongPenalty
  if (wrongPenalty !== 'none' && wrongPenalty !== 'half' && wrongPenalty !== 'full') {
    throw new DomainValidationError('wrongPenalty must be none, half, or full')
  }

  if (!Array.isArray(q.cards)) {
    throw new DomainValidationError('cards must be a list')
  }
  if (q.cards.length > 50) {
    throw new DomainValidationError('cards must not exceed 50 items')
  }

  const cardIds = new Set<string>()
  const cards: CanvasCard[] = q.cards.map((item, index) => {
    const c = record(item, `cards[${index}]`)
    const id = string(c.id, `cards[${index}].id`)
    if (cardIds.has(id)) {
      throw new DomainValidationError(`Duplicate card id: ${id}`)
    }
    cardIds.add(id)

    const cardType = string(c.type, `cards[${index}].type`)
    if (cardType !== 'note' && cardType !== 'paragraph' && cardType !== 'image' && cardType !== 'link') {
      throw new DomainValidationError(`cards[${index}].type must be note, paragraph, image, or link`)
    }

    const title = c.title !== undefined ? string(c.title, `cards[${index}].title`, true) : undefined

    const content = c.content !== undefined ? string(c.content, `cards[${index}].content`, true) : ''
    if (content.length > 1000) {
      throw new DomainValidationError(`cards[${index}].content must not exceed 1000 characters`)
    }

    let url: string | undefined
    let driveFileId: string | undefined
    let driveKind: DriveKind | undefined
    let imageId: string | undefined
    let alt: string | undefined

    if (cardType === 'image') {
      const hasImageId = typeof c.imageId === 'string' && c.imageId.trim().length > 0
      const hasLegacyDrive = Boolean(c.url || c.driveFileId)

      if (hasImageId) {
        imageId = string(c.imageId, `cards[${index}].imageId`)
        alt = string(c.alt, `cards[${index}].alt`)
        if (alt.length > 200) {
          throw new DomainValidationError(`cards[${index}].alt must not exceed 200 characters`)
        }
      } else if (hasLegacyDrive) {
        if (!options?.allowLegacyImages) {
          throw new DomainValidationError(
            `cards[${index}]: Legacy image cards must be re-uploaded before saving or publishing`,
          )
        }
        const rawUrl = string(c.url, `cards[${index}].url`)
        if (hasControlOrNewline(rawUrl)) {
          throw new DomainValidationError(`cards[${index}].url must not contain control characters or newlines`)
        }
        try {
          const parsed = parseDriveUrl(rawUrl)
          driveFileId = parsed.fileId
          driveKind = parsed.kind
          url = rawUrl.trim()
        } catch (err) {
          if (err instanceof DomainValidationError) throw err
          const msg = err instanceof Error ? err.message : 'Invalid Google Drive link'
          throw new DomainValidationError(`cards[${index}].url: ${msg}`)
        }
      } else {
        throw new DomainValidationError(`cards[${index}].imageId: Image card requires an uploaded image and alt text`)
      }
    } else if (cardType === 'link') {
      const rawUrl = string(c.url, `cards[${index}].url`)
      if (hasControlOrNewline(rawUrl)) {
        throw new DomainValidationError(`cards[${index}].url must not contain control characters or newlines`)
      }
      try {
        const normalized = normalizeGenericUrl(rawUrl)
        if (!normalized.startsWith('https://')) {
          throw new DomainValidationError(`cards[${index}].url must be a valid HTTPS link`)
        }
        url = normalized
      } catch (err) {
        if (err instanceof DomainValidationError) throw err
        const msg = err instanceof Error ? err.message : 'Invalid link URL'
        throw new DomainValidationError(`cards[${index}].url: ${msg}`)
      }
    } else if (c.url !== undefined && c.url !== null && c.url !== '') {
      const rawUrl = string(c.url, `cards[${index}].url`)
      if (hasControlOrNewline(rawUrl)) {
        throw new DomainValidationError(`cards[${index}].url must not contain control characters or newlines`)
      }
      try {
        const normalized = normalizeGenericUrl(rawUrl)
        if (!normalized.startsWith('https://')) {
          throw new DomainValidationError(`cards[${index}].url must be a valid HTTPS link`)
        }
        url = normalized
      } catch (err) {
        if (err instanceof DomainValidationError) throw err
        const msg = err instanceof Error ? err.message : 'Invalid link URL'
        throw new DomainValidationError(`cards[${index}].url: ${msg}`)
      }
    }

    const pos = record(c.position ?? { x: 0, y: 0 }, `cards[${index}].position`)
    const x = numberField(pos.x ?? 0, `cards[${index}].position.x`, -100000)
    const y = numberField(pos.y ?? 0, `cards[${index}].position.y`, -100000)

    const card: CanvasCard = {
      id,
      type: cardType,
      content,
      position: { x, y },
    }
    if (title !== undefined) card.title = title
    if (cardType === 'image') {
      if (imageId !== undefined) {
        card.imageId = imageId
        card.alt = alt
      } else {
        if (url !== undefined) card.url = url
        if (driveFileId !== undefined) card.driveFileId = driveFileId
        if (driveKind !== undefined) card.driveKind = driveKind
      }
    } else {
      if (url !== undefined) card.url = url
      if (driveFileId !== undefined) card.driveFileId = driveFileId
      if (driveKind !== undefined) card.driveKind = driveKind
    }

    return card
  })

  return {
    order,
    type: 'canvas',
    prompt,
    points,
    layoutMode,
    directed,
    wrongPenalty,
    cards,
  }
}

export function validateCanvasKey(
  value: unknown,
  cards?: CanvasCard[] | string[],
  directed = true,
): CanvasAnswerKey {
  const k = record(value, 'answerKey')
  if (k.type !== 'canvas') {
    throw new DomainValidationError('answerKey.type must be canvas')
  }

  const explanation = k.explanation === undefined ? '' : string(k.explanation, 'explanation', true)

  if (!Array.isArray(k.connections)) {
    throw new DomainValidationError('connections must be a list')
  }
  if (k.connections.length > 80) {
    throw new DomainValidationError('connections must not exceed 80 items')
  }

  const validCardIds = cards
    ? new Set(cards.map((c) => (typeof c === 'string' ? c : c.id)))
    : null

  const seenEdges = new Set<string>()
  const seenIds = new Set<string>()

  const connections: CanvasConnection[] = k.connections.map((item, index) => {
    const conn = record(item, `connections[${index}]`)
    const id = string(conn.id, `connections[${index}].id`)
    if (seenIds.has(id)) {
      throw new DomainValidationError(`Duplicate connection id: ${id}`)
    }
    seenIds.add(id)

    const from = string(conn.from, `connections[${index}].from`)
    const to = string(conn.to, `connections[${index}].to`)

    if (from === to) {
      throw new DomainValidationError(`Connection cannot be self-referential: ${from}`)
    }

    if (validCardIds) {
      if (!validCardIds.has(from)) {
        throw new DomainValidationError(`Connection endpoint does not exist: ${from}`)
      }
      if (!validCardIds.has(to)) {
        throw new DomainValidationError(`Connection endpoint does not exist: ${to}`)
      }
    }

    const norm = normalizeConnection(from, to, directed)
    if (seenEdges.has(norm)) {
      throw new DomainValidationError(`Duplicate connection between ${from} and ${to}`)
    }
    seenEdges.add(norm)

    const points = conn.points === undefined ? 1 : numberField(conn.points, `connections[${index}].points`, 0)
    const sourceHandle = typeof conn.sourceHandle === 'string' ? conn.sourceHandle : undefined
    const targetHandle = typeof conn.targetHandle === 'string' ? conn.targetHandle : undefined

    const result: CanvasConnection = {
      id,
      from,
      to,
      points,
    }
    if (sourceHandle) result.sourceHandle = sourceHandle
    if (targetHandle) result.targetHandle = targetHandle

    return result
  })

  return {
    type: 'canvas',
    explanation,
    connections,
  }
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') {
    return Math.floor(Math.abs(seed)) >>> 0
  }
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/**
 * Scatters cards deterministically within the requested bounds using a pseudo-random grid jitter.
 *
 * NOTE: When the cards cannot fit within the provided bounds (i.e. bounds are too small for the minimum
 * card dimensions and padding), the layout dynamically extends beyond the given bounds to ensure
 * cards never overlap each other.
 */
export function scatterCards(cards: CanvasCard[], seed: number | string, bounds: CanvasBounds): CanvasCard[] {
  if (cards.length === 0) return []

  const rng = mulberry32(hashSeed(seed))
  const cardW = bounds.cardWidth ?? CANVAS_CARD_WIDTH
  const cardH = bounds.cardHeight ?? CANVAS_CARD_HEIGHT
  const pad = bounds.padding ?? CANVAS_CARD_PADDING

  const minCellW = cardW + pad
  const minCellH = cardH + pad

  const aspect = Math.max(0.1, bounds.width / Math.max(1, bounds.height))
  const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length * aspect)))
  const rows = Math.max(1, Math.ceil(cards.length / cols))

  const effWidth = Math.max(bounds.width, cols * minCellW)
  const effHeight = Math.max(bounds.height, rows * minCellH)

  const cellW = effWidth / cols
  const cellH = effHeight / rows

  const cellCoords: Array<{ col: number; row: number }> = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cellCoords.push({ col: c, row: r })
    }
  }

  // Deterministic Fisher-Yates shuffle
  for (let i = cellCoords.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const temp = cellCoords[i]!
    cellCoords[i] = cellCoords[j]!
    cellCoords[j] = temp
  }

  return cards.map((card, index) => {
    const cell = cellCoords[index]!
    const maxJitterX = Math.max(0, cellW - cardW - pad)
    const maxJitterY = Math.max(0, cellH - cardH - pad)

    const jitterX = rng() * maxJitterX
    const jitterY = rng() * maxJitterY

    const x = Math.round(cell.col * cellW + pad / 2 + jitterX)
    const y = Math.round(cell.row * cellH + pad / 2 + jitterY)

    return {
      ...card,
      position: { x, y },
    }
  })
}

export function buildCanvasDiff(
  studentConnections: string[],
  keyConnections: CanvasConnection[],
  directed: boolean,
  cardIds?: string[] | Set<string> | CanvasCard[],
): CanvasDiff {
  const cap = Math.min(80, 2 * keyConnections.length)

  const validCardIds = cardIds
    ? new Set(
        Array.isArray(cardIds)
          ? cardIds.map((c) => (typeof c === 'string' ? c : c.id))
          : cardIds,
      )
    : null

  const keyMap = new Map<string, CanvasConnection>()
  for (const conn of keyConnections) {
    const norm = normalizeConnection(conn.from, conn.to, directed)
    keyMap.set(norm, conn)
  }

  const validStudentEdges: string[] = []
  const seenStudentEdges = new Set<string>()

  for (const raw of studentConnections) {
    const parsed = parseConnectionEdge(raw)
    if (!parsed) continue
    if (parsed.from === parsed.to) continue // Ignore self-connections
    if (validCardIds && (!validCardIds.has(parsed.from) || !validCardIds.has(parsed.to))) {
      continue // Ignore connections with unknown card IDs
    }

    const norm = normalizeConnection(parsed.from, parsed.to, directed)
    if (seenStudentEdges.has(norm)) continue // Ignore duplicates
    seenStudentEdges.add(norm)
    validStudentEdges.push(norm)

    if (validStudentEdges.length >= cap) break
  }

  const correct: string[] = []
  const wrong: string[] = []
  const matchedKeyNorms = new Set<string>()

  for (const edge of validStudentEdges) {
    if (keyMap.has(edge)) {
      correct.push(edge)
      matchedKeyNorms.add(edge)
    } else {
      wrong.push(edge)
    }
  }

  const missed: string[] = []
  for (const [norm] of keyMap.entries()) {
    if (!matchedKeyNorms.has(norm)) {
      missed.push(norm)
    }
  }

  return { correct, missed, wrong }
}
