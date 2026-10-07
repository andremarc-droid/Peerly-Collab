import { describe, it, expect } from 'vitest'
import { buildLearningGraph } from './graphModel'
import { stepSimulation } from './simulation'
import type { LearningCanvasWithId } from '../types'
import { Timestamp } from 'firebase/firestore'

describe('buildLearningGraph', () => {
  const dummyTimestamp = Timestamp.now()
  const mockCanvases: LearningCanvasWithId[] = [
    {
      id: 'c1',
      ownerId: 'u1',
      classId: 'class-1',
      kind: 'class',
      title: 'Cellular Respiration',
      description: 'Overview',
      status: 'published',
      nodeCount: 10,
      edgeCount: 8,
      refs: [
        { type: 'module', id: 'm1' },
        { type: 'quiz', id: 'q1' },
      ],
      sourceCanvasId: null,
      createdAt: dummyTimestamp,
      updatedAt: dummyTimestamp,
    },
    {
      id: 'c2',
      ownerId: 'u1',
      classId: 'class-2',
      kind: 'class',
      title: 'Photosynthesis',
      description: '',
      status: 'published',
      nodeCount: 5,
      edgeCount: 4,
      refs: [{ type: 'learning', id: 'c1' }],
      sourceCanvasId: null,
      createdAt: dummyTimestamp,
      updatedAt: dummyTimestamp,
    },
  ]

  const mockClasses = [
    { id: 'class-1', name: 'Biology 101' },
    { id: 'class-2', name: 'Botany 200' },
  ]

  it('builds nodes and links from canvas records and refs', () => {
    const graph = buildLearningGraph({
      canvases: mockCanvases,
      classes: mockClasses,
      moduleTitles: { m1: 'Energy Systems' },
      quizTitles: { q1: 'Cellular ATP Quiz' },
    })

    // Expect 4 nodes: c1 (canvas), c2 (canvas), m1 (module), q1 (quiz)
    expect(graph.nodes).toHaveLength(4)
    const nodeIds = graph.nodes.map((n) => n.id)
    expect(nodeIds).toContain('learning:c1')
    expect(nodeIds).toContain('learning:c2')
    expect(nodeIds).toContain('module:m1')
    expect(nodeIds).toContain('quiz:q1')

    // Check title resolution
    const moduleNode = graph.nodes.find((n) => n.id === 'module:m1')
    expect(moduleNode?.title).toBe('Energy Systems')

    const quizNode = graph.nodes.find((n) => n.id === 'quiz:q1')
    expect(quizNode?.title).toBe('Cellular ATP Quiz')

    // Links: c1 -> m1, c1 -> q1, c2 -> c1
    expect(graph.links).toHaveLength(3)
    expect(graph.links).toEqual(
      expect.arrayContaining([
        { id: 'learning:c1->module:m1', source: 'learning:c1', target: 'module:m1' },
        { id: 'learning:c1->quiz:q1', source: 'learning:c1', target: 'quiz:q1' },
        { id: 'learning:c2->learning:c1', source: 'learning:c2', target: 'learning:c1' },
      ]),
    )
  })

  it('filters by class correctly', () => {
    const graph = buildLearningGraph({
      canvases: mockCanvases,
      classes: mockClasses,
      selectedClassId: 'class-1',
    })

    // Only class-1 canvases (c1) and its refs (m1, q1)
    const nodeIds = graph.nodes.map((n) => n.id)
    expect(nodeIds).toContain('learning:c1')
    expect(nodeIds).not.toContain('learning:c2')
  })

  it('filters by allowedTypes', () => {
    const graph = buildLearningGraph({
      canvases: mockCanvases,
      classes: mockClasses,
      allowedTypes: new Set(['learning']),
    })

    // Only learning nodes should remain
    expect(graph.nodes.every((n) => n.type === 'learning')).toBe(true)
    // Only the link between c2 and c1 should remain
    expect(graph.links).toHaveLength(1)
    expect(graph.links[0].id).toBe('learning:c2->learning:c1')
  })

  it('filters and highlights by search query', () => {
    const graph = buildLearningGraph({
      canvases: mockCanvases,
      classes: mockClasses,
      searchQuery: 'respiration',
    })

    const c1Node = graph.nodes.find((n) => n.id === 'learning:c1')
    const c2Node = graph.nodes.find((n) => n.id === 'learning:c2')

    expect(c1Node?.isHighlighted).toBe(true)
    expect(c2Node?.isHighlighted).toBe(false)
  })

  it('classifies records with sourceCanvasId as note correctly', () => {
    const noteCanvas: LearningCanvasWithId = {
      id: 'n1',
      ownerId: 'u1',
      classId: 'class-1',
      kind: 'class',
      title: 'Mitochondria Note',
      description: 'Powerhouse of the cell',
      status: 'published',
      nodeCount: 1,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: 'note',
      createdAt: dummyTimestamp,
      updatedAt: dummyTimestamp,
    }

    const graph = buildLearningGraph({
      canvases: [...mockCanvases, noteCanvas],
      classes: mockClasses,
    })

    const noteNode = graph.nodes.find((n) => n.id === 'note:n1')
    expect(noteNode).toBeDefined()
    expect(noteNode?.type).toBe('note')
    expect(noteNode?.title).toBe('Mitochondria Note')
  })
})

describe('stepSimulation', () => {
  it('updates node positions and reduces kinetic energy over steps', () => {
    const nodes = [
      { id: 'a', rawId: 'a', type: 'learning' as const, title: 'A', classId: 'c', className: 'C', x: -10, y: 0, vx: 5, vy: 0, radius: 15, degree: 1 },
      { id: 'b', rawId: 'b', type: 'learning' as const, title: 'B', classId: 'c', className: 'C', x: 10, y: 0, vx: -5, vy: 0, radius: 15, degree: 1 },
    ]
    const links = [{ id: 'a->b', source: 'a', target: 'b' }]

    let prevEnergy = stepSimulation(nodes, links)
    expect(prevEnergy).toBeGreaterThan(0)

    for (let step = 0; step < 30; step++) {
      prevEnergy = stepSimulation(nodes, links)
    }

    // Positions should have adjusted smoothly
    expect(Number.isFinite(nodes[0].x)).toBe(true)
    expect(Number.isFinite(nodes[1].x)).toBe(true)
  })
})
