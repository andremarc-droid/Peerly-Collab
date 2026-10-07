import { describe, expect, it } from 'vitest'
import { fromJsonCanvas, toJsonCanvas } from './jsonCanvas'
import type { LearningCanvasContent } from './types'

describe('JSON Canvas 1.0 import and export', () => {
  // Realistic fixture of a JSON Canvas 1.0 specification compliant document
  const realisticJsonCanvasFixture = {
    nodes: [
      {
        id: 'node-concept-intro',
        type: 'text',
        x: -200,
        y: -100,
        width: 320,
        height: 180,
        color: '1', // Red / c1
        text: '# Cellular Biology\nFundamental unit of life with structured organelles.',
      },
      {
        id: 'node-doc-summary',
        type: 'file',
        file: 'notes/mitochondria-research.pdf',
        subpath: '#energy-production',
        x: 240,
        y: -100,
        width: 280,
        height: 160,
        color: '4', // Green / c4
      },
      {
        id: 'node-web-resource',
        type: 'link',
        url: 'https://example.edu/articles/cellular-respiration',
        x: 240,
        y: 160,
        width: 300,
        height: 140,
        color: '5', // Cyan / c5
      },
      {
        id: 'node-cluster-group',
        type: 'group',
        label: 'Organelle Interactions',
        x: -260,
        y: -160,
        width: 860,
        height: 520,
        color: '6', // Purple / c6
      },
      {
        id: 'node-unknown-future-type',
        type: 'audio-clip',
        audioFile: 'sound.mp3',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      {
        id: 'node-xss-attempt',
        type: 'text',
        x: 0,
        y: 600,
        width: 300,
        height: 150,
        text: 'Clean text <script>alert("hacked")</script><iframe src="javascript:evil()"></iframe> safe markdown',
      },
    ],
    edges: [
      {
        id: 'edge-concept-to-doc',
        fromNode: 'node-concept-intro',
        fromSide: 'right',
        toNode: 'node-doc-summary',
        toSide: 'left',
        fromEnd: 'none',
        toEnd: 'arrow',
        label: 'detailed in',
      },
      {
        id: 'edge-doc-to-web',
        fromNode: 'node-doc-summary',
        fromSide: 'bottom',
        toNode: 'node-web-resource',
        toSide: 'top',
        fromEnd: 'arrow',
        toEnd: 'arrow',
        label: 'source',
      },
      {
        id: 'edge-self-loop',
        fromNode: 'node-concept-intro',
        toNode: 'node-concept-intro',
      },
      {
        id: 'edge-missing-target',
        fromNode: 'node-concept-intro',
        toNode: 'node-does-not-exist',
      },
    ],
  }

  it('imports realistic JSON Canvas with lossy report', () => {
    const { content, report } = fromJsonCanvas(realisticJsonCanvasFixture)

    // 1. File nodes converted to text cards
    expect(report.fileNodesConverted).toBe(1)
    const fileCard = content.nodes.find((n) => n.id === 'node-doc-summary')
    expect(fileCard).toBeDefined()
    expect(fileCard?.type).toBe('text')
    if (fileCard?.type === 'text') {
      expect(fileCard.text).toContain('mitochondria-research.pdf')
      expect(fileCard.text).toContain('#energy-production')
    }

    // 2. Unknown node types dropped
    expect(report.droppedNodes).toBe(1)
    expect(content.nodes.some((n) => n.id === 'node-unknown-future-type')).toBe(false)

    // 3. Script and iframe tags are sanitized and never executed
    const xssCard = content.nodes.find((n) => n.id === 'node-xss-attempt')
    expect(xssCard).toBeDefined()
    if (xssCard?.type === 'text') {
      expect(xssCard.text).not.toContain('<script')
      expect(xssCard.text).not.toContain('<iframe')
      expect(xssCard.text).toContain('Clean text')
      expect(xssCard.text).toContain('safe markdown')
    }

    // 4. Edges sanitized: self-loop and missing target dropped
    expect(report.droppedEdges).toBe(2)
    expect(content.edges.length).toBe(2)
    expect(content.edges[0]?.label).toBe('detailed in')
    expect(content.edges[0]?.arrow).toBe('to')
    expect(content.edges[1]?.arrow).toBe('both')

    // 5. Colors mapped to tokens
    const conceptNode = content.nodes.find((n) => n.id === 'node-concept-intro')
    expect(conceptNode?.color).toBe('c1')

    const groupNode = content.nodes.find((n) => n.id === 'node-cluster-group')
    expect(groupNode?.type).toBe('group')
    expect(groupNode?.color).toBe('c6')
  })

  it('handles duplicate IDs and clamps out-of-bound bounds during import', () => {
    const wildData = {
      nodes: [
        {
          id: 'duplicate-id',
          type: 'text',
          x: -50000,
          y: 75000,
          width: 20,
          height: 3000,
          text: 'Wild Card 1',
        },
        {
          id: 'duplicate-id',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Wild Card 2',
        },
      ],
      edges: [],
    }

    const { content, report } = fromJsonCanvas(wildData)
    expect(report.idCollisions).toBe(1)
    expect(report.clampedPositions).toBe(1)
    expect(report.clampedSizes).toBe(1)
    expect(content.nodes.length).toBe(2)
    expect(content.nodes[0]?.id).not.toBe(content.nodes[1]?.id)
    expect(content.nodes[0]?.x).toBe(-20000)
    expect(content.nodes[0]?.width).toBe(80)
    expect(content.nodes[0]?.height).toBe(1200)
  })

  it('performs round-trip serialization and deserialization cleanly', () => {
    const originalContent: LearningCanvasContent = {
      version: 1,
      nodes: [
        {
          id: 'n1',
          type: 'text',
          x: 50,
          y: 60,
          width: 240,
          height: 140,
          color: 'c2',
          text: 'Card note A',
        },
        {
          id: 'n2',
          type: 'link',
          x: 400,
          y: 60,
          width: 280,
          height: 150,
          color: 'navy',
          link: {
            url: 'https://example.com/guide',
            title: 'Example Guide',
          },
        },
        {
          id: 'g1',
          type: 'group',
          x: 20,
          y: 20,
          width: 700,
          height: 300,
          color: 'none',
          group: { label: 'Study Area' },
        },
      ],
      edges: [
        {
          id: 'e1',
          from: 'n1',
          to: 'n2',
          fromSide: 'right',
          toSide: 'left',
          label: 'reads',
          arrow: 'to',
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }

    // 1. Convert to JSON Canvas 1.0 format
    const exportedJsonCanvas = toJsonCanvas(originalContent)
    expect(exportedJsonCanvas.nodes?.length).toBe(3)
    expect(exportedJsonCanvas.edges?.length).toBe(1)

    // 2. Re-import into LearningCanvasContent
    const { content: reimported, report } = fromJsonCanvas(exportedJsonCanvas)
    expect(report.droppedNodes).toBe(0)
    expect(report.droppedEdges).toBe(0)
    expect(reimported.nodes.length).toBe(3)
    expect(reimported.edges.length).toBe(1)

    const reimportedText = reimported.nodes.find((n) => n.id === 'n1')
    expect(reimportedText?.color).toBe('c2')
    if (reimportedText?.type === 'text') {
      expect(reimportedText.text).toBe('Card note A')
    }

    const reimportedLink = reimported.nodes.find((n) => n.id === 'n2')
    expect(reimportedLink?.color).toBe('navy')
    if (reimportedLink?.type === 'link') {
      expect(reimportedLink.link.url).toBe('https://example.com/guide')
    }

    const reimportedEdge = reimported.edges[0]
    expect(reimportedEdge?.from).toBe('n1')
    expect(reimportedEdge?.to).toBe('n2')
    expect(reimportedEdge?.fromSide).toBe('right')
    expect(reimportedEdge?.toSide).toBe('left')
    expect(reimportedEdge?.label).toBe('reads')
    expect(reimportedEdge?.arrow).toBe('to')
  })
})
