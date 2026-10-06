import { describe, expect, it } from 'vitest'
import { CANVAS_CARD_HEIGHT, CANVAS_CARD_WIDTH } from './schemas'
import { cardsToNodes, connectionsToEdges, edgeToConnection, getOptimalHandles, nodesToPositions, stringToCanvasConnection } from './mapping'
import type { CanvasCard, CanvasConnection } from './types'

describe('canvas pure mapping functions', () => {
  const cards: CanvasCard[] = [
    {
      id: 'c1',
      type: 'note',
      title: 'First Note',
      content: 'Sticky content',
      position: { x: 10, y: 20 },
    },
    {
      id: 'c2',
      type: 'paragraph',
      title: 'Longer Text',
      content: 'Paragraph content goes here.',
      position: { x: 200, y: 150 },
    },
  ]

  it('maps cards to nodes with fixed width and height and preserves or overrides positions', () => {
    const defaultNodes = cardsToNodes(cards)
    expect(defaultNodes).toHaveLength(2)
    expect(defaultNodes[0].id).toBe('c1')
    expect(defaultNodes[0].type).toBe('note')
    expect(defaultNodes[0].width).toBe(CANVAS_CARD_WIDTH)
    expect(defaultNodes[0].height).toBe(CANVAS_CARD_HEIGHT)
    expect(defaultNodes[0].position).toEqual({ x: 10, y: 20 })
    expect(defaultNodes[0].data.card).toEqual(cards[0])

    // With positions override
    const overriddenNodes = cardsToNodes(cards, { c1: { x: 50, y: 75 } })
    expect(overriddenNodes[0].position).toEqual({ x: 50, y: 75 })
    expect(overriddenNodes[1].position).toEqual({ x: 200, y: 150 })
  })

  it('maps connections to edges with markers when directed, and omits when undirected', () => {
    const connections: CanvasConnection[] = [
      { id: 'conn-1', from: 'c1', to: 'c2', points: 5 },
    ]

    const directedEdges = connectionsToEdges(connections, true)
    expect(directedEdges).toHaveLength(1)
    expect(directedEdges[0].id).toBe('conn-1')
    expect(directedEdges[0].source).toBe('c1')
    expect(directedEdges[0].target).toBe('c2')
    expect(directedEdges[0].markerEnd).toBeDefined()
    expect(directedEdges[0].data?.points).toBe(5)

    const undirectedEdges = connectionsToEdges(connections, false)
    expect(undirectedEdges[0].markerEnd).toBeUndefined()
  })

  it('maps string connections and attaches status from statusByConnection', () => {
    const rawConnections = ['c1->c2', 'c2->c3']
    const statusMap = {
      'c1->c2': 'correct' as const,
      'c2->c3': 'wrong' as const,
    }

    const edges = connectionsToEdges(rawConnections, true, statusMap)
    expect(edges).toHaveLength(2)
    expect(edges[0].source).toBe('c1')
    expect(edges[0].target).toBe('c2')
    expect(edges[0].data?.status).toBe('correct')
    expect(edges[1].data?.status).toBe('wrong')
  })

  it('extracts positions from nodes in nodesToPositions', () => {
    const nodes = [
      { id: 'c1', position: { x: 42.4, y: 99.6 }, data: {} },
      { id: 'c2', position: { x: 100, y: 200 }, data: {} },
    ] as any

    const positions = nodesToPositions(nodes)
    expect(positions).toEqual({
      c1: { x: 42, y: 100 },
      c2: { x: 100, y: 200 },
    })
  })

  it('converts edge to connection in edgeToConnection', () => {
    const edge = {
      id: 'e1',
      source: 'c1',
      target: 'c2',
      data: { points: 10 },
    }
    const connection = edgeToConnection(edge)
    expect(connection).toEqual({
      id: 'e1',
      from: 'c1',
      to: 'c2',
      points: 10,
    })
  })

  it('respects deletable options in cardsToNodes', () => {
    const editableNodes = cardsToNodes(cards, undefined, { deletable: true })
    expect(editableNodes[0].deletable).toBe(true)

    const nonDeletableNodes = cardsToNodes(cards, undefined, { deletable: false })
    expect(nonDeletableNodes[0].deletable).toBe(false)
  })

  it('converts directed and undirected string connections in stringToCanvasConnection and drops unparseable strings', () => {
    // Directed
    const dir = stringToCanvasConnection('c1->c2', true)
    expect(dir).toEqual({ id: 'c1->c2', from: 'c1', to: 'c2' })

    // Undirected: normalizes canonical order
    const undir1 = stringToCanvasConnection('c2<->c1', false)
    expect(undir1).toEqual({ id: 'c1<->c2', from: 'c2', to: 'c1' })

    const undir2 = stringToCanvasConnection('c1<->c2', false)
    expect(undir2).toEqual({ id: 'c1<->c2', from: 'c1', to: 'c2' })

    // Object pass-through
    const obj = stringToCanvasConnection({ id: 'custom', from: 'c1', to: 'c2', points: 3 }, true)
    expect(obj).toEqual({ id: 'custom', from: 'c1', to: 'c2', points: 3 })

    // Unparseable / corrupted strings return null
    expect(stringToCanvasConnection('corrupted<', false)).toBeNull()
    expect(stringToCanvasConnection('just-text', true)).toBeNull()
    expect(stringToCanvasConnection('', true)).toBeNull()
  })

  it('determines optimal handles based on relative card positions in getOptimalHandles', () => {
    // Target below source
    expect(getOptimalHandles({ x: 100, y: 100 }, { x: 100, y: 300 })).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })

    // Target above source
    expect(getOptimalHandles({ x: 100, y: 300 }, { x: 100, y: 100 })).toEqual({
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })

    // Target right of source
    expect(getOptimalHandles({ x: 100, y: 100 }, { x: 400, y: 100 })).toEqual({
      sourceHandle: 'right',
      targetHandle: 'left',
    })

    // Target left of source
    expect(getOptimalHandles({ x: 400, y: 100 }, { x: 100, y: 100 })).toEqual({
      sourceHandle: 'left',
      targetHandle: 'right',
    })
  })

  it('preserves explicit handles and computes optimal handles from positions in connectionsToEdges', () => {
    // Explicit handles
    const explicitConn: CanvasConnection = {
      id: 'c1->c2',
      from: 'c1',
      to: 'c2',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }
    const explicitEdges = connectionsToEdges([explicitConn], true)
    expect(explicitEdges[0].sourceHandle).toBe('bottom')
    expect(explicitEdges[0].targetHandle).toBe('top')

    // Derived handles from positions when not explicitly set
    const unpinnedConn: CanvasConnection = {
      id: 'c1->c2',
      from: 'c1',
      to: 'c2',
    }
    const positions = {
      c1: { x: 200, y: 100 }, // Source card above
      c2: { x: 200, y: 400 }, // Target card below
    }
    const derivedEdges = connectionsToEdges([unpinnedConn], true, undefined, positions)
    expect(derivedEdges[0].sourceHandle).toBe('bottom')
    expect(derivedEdges[0].targetHandle).toBe('top')
  })

  it('preserves sourceHandle and targetHandle in edgeToConnection', () => {
    const edge = {
      id: 'e1',
      source: 'c1',
      target: 'c2',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { points: 5 },
    }
    const conn = edgeToConnection(edge)
    expect(conn.sourceHandle).toBe('bottom')
    expect(conn.targetHandle).toBe('top')
    expect(conn.points).toBe(5)
  })
})
