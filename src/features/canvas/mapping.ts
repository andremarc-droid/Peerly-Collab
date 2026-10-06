import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import { CANVAS_CARD_HEIGHT, CANVAS_CARD_WIDTH, normalizeConnection, parseConnectionEdge } from './schemas'
import type { CanvasCard, CanvasConnection } from './types'

export interface CanvasNodeData extends Record<string, unknown> {
  card: CanvasCard
  readOnly?: boolean
  selected?: boolean
}

export type ConnectionStatus = 'correct' | 'missed' | 'wrong'

export interface CanvasEdgeData extends Record<string, unknown> {
  connectionId?: string
  from: string
  to: string
  points?: number
  label?: string
  status?: ConnectionStatus
  directed?: boolean
}

/**
 * Pure mapping function converting domain CanvasCards into React Flow Nodes.
 * Uses fixed dimensions CANVAS_CARD_WIDTH (180) and CANVAS_CARD_HEIGHT (100).
 */
export function cardsToNodes(
  cards: CanvasCard[] = [],
  positions?: Record<string, { x: number; y: number }>,
  options?: { readOnly?: boolean; deletable?: boolean },
): Node<CanvasNodeData>[] {
  return cards.map((card) => {
    const overridePos = positions?.[card.id]
    const x = overridePos ? overridePos.x : card.position?.x ?? 0
    const y = overridePos ? overridePos.y : card.position?.y ?? 0

    return {
      id: card.id,
      type: card.type,
      position: { x, y },
      deletable: options?.deletable ?? (options?.readOnly ? false : true),
      data: {
        card,
        readOnly: options?.readOnly ?? false,
      },
      width: CANVAS_CARD_WIDTH,
      height: CANVAS_CARD_HEIGHT,
      measured: {
        width: CANVAS_CARD_WIDTH,
        height: CANVAS_CARD_HEIGHT,
      },
      style: {
        width: CANVAS_CARD_WIDTH,
        height: CANVAS_CARD_HEIGHT,
      },
      ariaLabel: card.title ? `${card.title} (${card.type} card)` : `${card.type} card: ${card.content.slice(0, 40)}`,
    }
  })
}

/**
 * Converts a string edge or CanvasConnection object into a canonical CanvasConnection domain object.
 * Returns null if the item cannot be parsed or has missing endpoints.
 */
export function stringToCanvasConnection(
  item: CanvasConnection | string,
  directed = true,
): CanvasConnection | null {
  if (typeof item === 'string') {
    const parsed = parseConnectionEdge(item)
    if (!parsed) return null
    return {
      id: normalizeConnection(parsed.from, parsed.to, directed),
      from: parsed.from,
      to: parsed.to,
    }
  }
  if (!item || typeof item !== 'object' || !item.from || !item.to) {
    return null
  }
  return {
    ...item,
    id: item.id || normalizeConnection(item.from, item.to, directed),
  }
}

/**
 * Computes optimal handle identifiers ('top', 'right', 'bottom', 'left')
 * between two card coordinates based on their relative positions.
 */
export function getOptimalHandles(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const fromCenterX = fromPos.x + CANVAS_CARD_WIDTH / 2
  const fromCenterY = fromPos.y + CANVAS_CARD_HEIGHT / 2
  const toCenterX = toPos.x + CANVAS_CARD_WIDTH / 2
  const toCenterY = toPos.y + CANVAS_CARD_HEIGHT / 2

  const dx = toCenterX - fromCenterX
  const dy = toCenterY - fromCenterY

  const normX = dx / CANVAS_CARD_WIDTH
  const normY = dy / CANVAS_CARD_HEIGHT

  if (Math.abs(normY) >= Math.abs(normX)) {
    if (dy >= 0) {
      return { sourceHandle: 'bottom', targetHandle: 'top' }
    } else {
      return { sourceHandle: 'top', targetHandle: 'bottom' }
    }
  } else {
    if (dx >= 0) {
      return { sourceHandle: 'right', targetHandle: 'left' }
    } else {
      return { sourceHandle: 'left', targetHandle: 'right' }
    }
  }
}

/**
 * Pure mapping function converting connection records or edge strings into React Flow Edges.
 */
export function connectionsToEdges(
  connections: (CanvasConnection | string)[] = [],
  directed = true,
  statusByConnection?: Record<string, ConnectionStatus>,
  positions?: Record<string, { x: number; y: number }>,
): Edge<CanvasEdgeData>[] {
  return connections
    .map((conn) => {
      const c = stringToCanvasConnection(conn, directed)
      if (!c) return null

      const normKey = normalizeConnection(c.from, c.to, directed)
      const status =
        statusByConnection?.[normKey] ??
        statusByConnection?.[c.id] ??
        (typeof conn === 'string' ? statusByConnection?.[conn] : undefined)

      let sourceHandle = c.sourceHandle
      let targetHandle = c.targetHandle

      if ((!sourceHandle || !targetHandle) && positions) {
        const fromPos = positions[c.from]
        const toPos = positions[c.to]
        if (fromPos && toPos) {
          const optimal = getOptimalHandles(fromPos, toPos)
          if (!sourceHandle) sourceHandle = optimal.sourceHandle
          if (!targetHandle) targetHandle = optimal.targetHandle
        }
      }

      const edge: Edge<CanvasEdgeData> = {
        id: c.id || normKey,
        source: c.from,
        target: c.to,
        sourceHandle: sourceHandle || undefined,
        targetHandle: targetHandle || undefined,
        type: 'canvas',
        data: {
          connectionId: c.id,
          from: c.from,
          to: c.to,
          points: c.points,
          status,
          directed,
        },
      }

      if (directed) {
        edge.markerEnd = {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color:
            status === 'correct'
              ? 'var(--color-feedback-success)'
              : status === 'wrong'
                ? 'var(--color-danger)'
                : 'var(--color-navy-900)',
        }
      }

      return edge
    })
    .filter((edge): edge is Edge<CanvasEdgeData> => edge !== null)
}

/**
 * Pure mapping function extracting x/y coordinates from React Flow Nodes.
 */
export function nodesToPositions(nodes: Node[] = []): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    if (node && node.id && node.position) {
      positions[node.id] = {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      }
    }
  }
  return positions
}

/**
 * Pure mapping function converting a React Flow Edge or Connection into a domain CanvasConnection.
 */
export function edgeToConnection(edge: {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: { points?: number }
}): CanvasConnection {
  const connection: CanvasConnection = {
    id: edge.id || `${edge.source}->${edge.target}`,
    from: edge.source,
    to: edge.target,
  }
  if (edge.sourceHandle) {
    connection.sourceHandle = edge.sourceHandle
  }
  if (edge.targetHandle) {
    connection.targetHandle = edge.targetHandle
  }
  if (edge.data?.points !== undefined) {
    connection.points = edge.data.points
  }
  return connection
}

/**
 * Sanitizes connection entries:
 * 1. Keeps only edges that parse (using parseConnectionEdge or object endpoints)
 * 2. Checks that both endpoints exist in validCardIds and from !== to
 * 3. Re-normalizes with the question's directed flag
 * 4. Deduplicates
 * 5. Caps at 80
 */
export function sanitizeCanvasAnswers(
  rawConnections: (string | CanvasConnection)[] = [],
  validCardIds: Set<string> | string[],
  directed = true,
): string[] {
  const cardSet = validCardIds instanceof Set ? validCardIds : new Set(validCardIds)
  const result: string[] = []
  const seen = new Set<string>()

  for (const item of rawConnections) {
    let from = ''
    let to = ''
    if (typeof item === 'string') {
      const parsed = parseConnectionEdge(item)
      if (!parsed) continue
      from = parsed.from
      to = parsed.to
    } else if (item && typeof item === 'object') {
      from = item.from
      to = item.to
    }
    if (!from || !to || from === to) continue
    if (!cardSet.has(from) || !cardSet.has(to)) continue

    const norm = normalizeConnection(from, to, directed)
    if (!seen.has(norm)) {
      seen.add(norm)
      result.push(norm)
      if (result.length >= 80) break
    }
  }

  return result
}
