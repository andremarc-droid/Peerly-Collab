import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  clampNode,
  computeRefs,
  countStats,
  LearningCanvasValidationError,
  newNodePlacement,
  parseLearningCanvasContent,
  parseLearningCanvasMetadata,
  validateLearningCanvasEdge,
  validateLearningCanvasNode,
} from './schemas'
import { mapLearningCanvasColor } from './constants'
import type {
  LearningCanvasEdge,
  LearningCanvasNode,
  LearningCanvasRecord,
  LearningCanvasTextNode,
} from './types'

describe('learningCanvas schemas and pure helpers', () => {
  describe('computeRefs', () => {
    it('extracts unique references from reference nodes', () => {
      const nodes: LearningCanvasNode[] = [
        {
          id: 'n1',
          type: 'reference',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          color: 'none',
          reference: { refType: 'module', refId: 'mod-1' },
        },
        {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          color: 'none',
          text: 'Hello',
        },
        {
          id: 'n3',
          type: 'reference',
          x: 200,
          y: 200,
          width: 200,
          height: 100,
          color: 'none',
          reference: { refType: 'module', refId: 'mod-1' }, // duplicate
        },
        {
          id: 'n4',
          type: 'reference',
          x: 300,
          y: 300,
          width: 200,
          height: 100,
          color: 'none',
          reference: { refType: 'quiz', refId: 'quiz-42' },
        },
      ]

      const refs = computeRefs(nodes)
      expect(refs).toEqual([
        { type: 'module', id: 'mod-1' },
        { type: 'quiz', id: 'quiz-42' },
      ])
    })

    it('rejects more than 80 distinct references', () => {
      const nodes: LearningCanvasNode[] = Array.from({ length: 85 }, (_, i) => ({
        id: `node-${i}`,
        type: 'reference',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: 'none',
        reference: { refType: 'module', refId: `mod-${i}` },
      }))

      expect(() => computeRefs(nodes)).toThrow(LearningCanvasValidationError)
      expect(() => computeRefs(nodes)).toThrow('Canvas cannot exceed 80 distinct references')
    })
  })

  describe('countStats', () => {
    it('accurately counts nodes, edges, and groups', () => {
      const nodes: LearningCanvasNode[] = [
        { id: '1', type: 'text', x: 0, y: 0, width: 100, height: 100, color: 'none', text: 'T1' },
        { id: '2', type: 'group', x: 0, y: 0, width: 200, height: 200, color: 'none', group: { label: 'G1' } },
        { id: '3', type: 'link', x: 0, y: 0, width: 100, height: 100, color: 'none', link: { url: 'https://test.io', title: 'L1' } },
      ]
      const edges: LearningCanvasEdge[] = [
        { id: 'e1', from: '1', to: '3', arrow: 'to' },
      ]

      const stats = countStats(nodes, edges)
      expect(stats).toEqual({
        nodeCount: 3,
        edgeCount: 1,
        groupCount: 1,
      })
    })
  })

  describe('clampNode', () => {
    it('clamps node position within [-20000, 20000] and dimensions within [80, 1200]', () => {
      const wildNode: LearningCanvasTextNode = {
        id: 'wild',
        type: 'text',
        x: -50000,
        y: 99999,
        width: 10,
        height: 5000,
        color: 'c1',
        text: 'Wild Card',
      }

      const clamped = clampNode(wildNode)
      expect(clamped.x).toBe(-20000)
      expect(clamped.y).toBe(20000)
      expect(clamped.width).toBe(80)
      expect(clamped.height).toBe(1200)
    })
  })

  describe('newNodePlacement', () => {
    it('places node at desired position if vacant', () => {
      const pos = newNodePlacement([], { x: 100, y: 200 })
      expect(pos).toEqual({ x: 100, y: 200 })
    })

    it('finds non-overlapping position when desired location is occupied', () => {
      const existing: LearningCanvasNode[] = [
        { id: '1', type: 'text', x: 0, y: 0, width: 240, height: 140, color: 'none', text: '1' },
      ]
      const pos = newNodePlacement(existing, { x: 0, y: 0, width: 240, height: 140 })
      expect(pos.x !== 0 || pos.y !== 0).toBe(true)
      // Verify no overlap
      const overlaps =
        pos.x < 240 + 40 &&
        pos.x + 240 + 40 > 0 &&
        pos.y < 140 + 40 &&
        pos.y + 140 + 40 > 0
      expect(overlaps).toBe(false)
    })
  })

  describe('mapLearningCanvasColor', () => {
    it('maps color tokens to valid theme style objects', () => {
      const tokens = ['none', 'navy', 'tint', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
      for (const token of tokens) {
        const style = mapLearningCanvasColor(token)
        expect(style.background).toBeDefined()
        expect(style.border).toBeDefined()
        expect(style.text).toBeDefined()
      }
    })
  })

  describe('validateLearningCanvasNode', () => {
    it('validates text node and enforces length <= 2000', () => {
      const valid = validateLearningCanvasNode({
        id: 't1',
        type: 'text',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        color: 'navy',
        text: 'Important note',
      })
      expect(valid.type).toBe('text')

      expect(() =>
        validateLearningCanvasNode({
          id: 't1',
          type: 'text',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          color: 'navy',
          text: 'a'.repeat(2001),
        }),
      ).toThrow('Text card content cannot exceed 2000 characters')
    })

    it('requires https:// URL for link nodes', () => {
      expect(() =>
        validateLearningCanvasNode({
          id: 'l1',
          type: 'link',
          x: 100,
          y: 100,
          width: 200,
          height: 150,
          color: 'none',
          link: { url: 'http://insecure.test', title: 'Insecure' },
        }),
      ).toThrow('Link card requires an https:// URL')
    })

    it('validates group node with label limit', () => {
      const valid = validateLearningCanvasNode({
        id: 'g1',
        type: 'group',
        x: 0,
        y: 0,
        width: 500,
        height: 400,
        color: 'tint',
        group: { label: 'Core concepts' },
      })
      expect(valid.type).toBe('group')

      expect(() =>
        validateLearningCanvasNode({
          id: 'g1',
          type: 'group',
          x: 0,
          y: 0,
          width: 500,
          height: 400,
          color: 'tint',
          group: { label: 'x'.repeat(81) },
        }),
      ).toThrow('Group label cannot exceed 80 characters')
    })
  })

  describe('validateLearningCanvasEdge', () => {
    const nodeIds = new Set(['n1', 'n2'])

    it('validates edge connecting two existing nodes', () => {
      const edge = validateLearningCanvasEdge(
        {
          id: 'e1',
          from: 'n1',
          to: 'n2',
          fromSide: 'right',
          toSide: 'left',
          label: 'relates to',
          arrow: 'to',
        },
        nodeIds,
      )
      expect(edge.from).toBe('n1')
      expect(edge.to).toBe('n2')
      expect(edge.arrow).toBe('to')
    })

    it('disallows self-connections', () => {
      expect(() =>
        validateLearningCanvasEdge(
          { id: 'e1', from: 'n1', to: 'n1', arrow: 'to' },
          nodeIds,
        ),
      ).toThrow('Self-connections are not allowed')
    })

    it('disallows edge to non-existent node', () => {
      expect(() =>
        validateLearningCanvasEdge(
          { id: 'e1', from: 'n1', to: 'n999', arrow: 'to' },
          nodeIds,
        ),
      ).toThrow('Edge target node "n999" does not exist')
    })
  })

  describe('parseLearningCanvasContent', () => {
    it('enforces maximum limits: 80 nodes, 10 groups, 120 edges', () => {
      const tooManyNodes = Array.from({ length: 81 }, (_, i) => ({
        id: `n${i}`,
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: 'none',
        text: '',
      }))

      expect(() =>
        parseLearningCanvasContent({
          version: 1,
          nodes: tooManyNodes,
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      ).toThrow('Canvas cannot exceed 80 nodes')

      const tooManyGroups = Array.from({ length: 11 }, (_, i) => ({
        id: `g${i}`,
        type: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: 'none',
        group: { label: `G${i}` },
      }))

      expect(() =>
        parseLearningCanvasContent({
          version: 1,
          nodes: tooManyGroups,
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      ).toThrow('Canvas cannot exceed 10 groups')
    })

    it('detects duplicate node ids and duplicate connections', () => {
      expect(() =>
        parseLearningCanvasContent({
          version: 1,
          nodes: [
            { id: 'dup', type: 'text', x: 0, y: 0, width: 100, height: 100, color: 'none', text: '1' },
            { id: 'dup', type: 'text', x: 10, y: 10, width: 100, height: 100, color: 'none', text: '2' },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      ).toThrow('Duplicate node ID: dup')

      expect(() =>
        parseLearningCanvasContent({
          version: 1,
          nodes: [
            { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, color: 'none', text: '1' },
            { id: 'b', type: 'text', x: 10, y: 10, width: 100, height: 100, color: 'none', text: '2' },
          ],
          edges: [
            { id: 'e1', from: 'a', to: 'b', arrow: 'to' },
            { id: 'e2', from: 'a', to: 'b', arrow: 'to' },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      ).toThrow('Duplicate connection between "a" and "b"')
    })
  })

  describe('parseLearningCanvasMetadata', () => {
    it('validates class canvas metadata', () => {
      const now = Timestamp.now()
      const valid: LearningCanvasRecord = {
        ownerId: 'instructor1',
        classId: 'classA',
        kind: 'class',
        title: 'Photosynthesis Overview',
        description: 'Visual map of cellular respiration and photosynthesis',
        status: 'draft',
        nodeCount: 10,
        edgeCount: 12,
        refs: [{ type: 'module', id: 'mod-1' }],
        sourceCanvasId: null,
        createdAt: now,
        updatedAt: now,
      }

      const parsed = parseLearningCanvasMetadata(valid)
      expect(parsed.title).toBe('Photosynthesis Overview')
      expect(parsed.kind).toBe('class')
      expect(parsed.status).toBe('draft')
    })

    it('rejects invalid status for personal canvas', () => {
      const now = Timestamp.now()
      expect(() =>
        parseLearningCanvasMetadata({
          ownerId: 'student1',
          classId: 'classA',
          kind: 'personal',
          title: 'My Notes',
          description: '',
          status: 'published', // Personal must be private
          nodeCount: 0,
          edgeCount: 0,
          refs: [],
          sourceCanvasId: null,
          createdAt: now,
          updatedAt: now,
        }),
      ).toThrow('Personal canvas status must be "private"')
    })

    it('rejects title longer than 120 characters', () => {
      const now = Timestamp.now()
      expect(() =>
        parseLearningCanvasMetadata({
          ownerId: 'instructor1',
          classId: 'classA',
          kind: 'class',
          title: 'x'.repeat(121),
          description: '',
          status: 'draft',
          nodeCount: 0,
          edgeCount: 0,
          refs: [],
          sourceCanvasId: null,
          createdAt: now,
          updatedAt: now,
        }),
      ).toThrow('Canvas title cannot exceed 120 characters')
    })
  })
})
