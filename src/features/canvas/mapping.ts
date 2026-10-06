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
 * Pure mapping function converting connection records or edge strings into React Flow Edges.
 */
export function connectionsToEdges(
  connections: (CanvasConnection | string)[] = [],
  directed = true,
  statusByConnection?: Record<string, ConnectionStatus>,
): Edge<CanvasEdgeData>[] {
  return connections.map((conn) => {
    let from = ''
    let to = ''
    let id = ''
    let points: number | undefined

    if (typeof conn === 'string') {
      const parsed = parseConnectionEdge(conn)
      if (parsed) {
        from = parsed.from
        to = parsed.to
      } else {
        const parts = conn.split('->')
        from = parts[0]?.trim() ?? ''
        to = parts[1]?.trim() ?? ''
      }
      id = conn
    } else {
      from = conn.from
      to = conn.to
      id = conn.id || normalizeConnection(from, to, directed)
      points = conn.points
    }

    const normKey = normalizeConnection(from, to, directed)
    const status = statusByConnection?.[normKey] ?? (typeof conn === 'object' && conn.id ? statusByConnection?.[conn.id] : undefined)

    const edge: Edge<CanvasEdgeData> = {
      id: id || normKey,
      source: from,
      target: to,
      type: 'canvas',
      data: {
        connectionId: id,
        from,
        to,
        points,
        status,
        directed,
      },
    }

    if (directed) {
      edge.markerEnd = {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: status === 'correct' ? 'var(--color-feedback-success)' : status === 'wrong' ? 'var(--color-danger)' : 'var(--color-navy-900)',
      }
    }

    return edge
  })
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
  data?: { points?: number }
}): CanvasConnection {
  const connection: CanvasConnection = {
    id: edge.id || `${edge.source}->${edge.target}`,
    from: edge.source,
    to: edge.target,
  }
  if (edge.data?.points !== undefined) {
    connection.points = edge.data.points
  }
  return connection
}
