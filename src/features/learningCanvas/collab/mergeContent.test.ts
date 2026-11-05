import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  LearningCanvasContent,
  LearningCanvasEdge,
  LearningCanvasGroupNode,
  LearningCanvasImageNode,
  LearningCanvasLinkNode,
  LearningCanvasNode,
  LearningCanvasNodeType,
  LearningCanvasReferenceNode,
  LearningCanvasTextNode,
} from '../types'
import { validateLearningCanvasEdge, validateLearningCanvasNode } from '../schemas'
import {
  mergeById,
  mergeContent,
  sameBoard,
  sameEdge,
  sameNode,
} from './mergeContent'

function makeTextNode(id: string, text: string, extra?: Partial<LearningCanvasTextNode>): LearningCanvasTextNode {
  return { id, type: 'text', text, x: 10, y: 20, width: 240, height: 140, color: 'none', ...extra }
}

function makeImageNode(
  id: string,
  dataUrl: string,
  extra?: Partial<LearningCanvasImageNode['image']>,
): LearningCanvasImageNode {
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    color: 'none',
    image: {
      dataUrl,
      alt: extra?.alt ?? 'Sample image',
      caption: extra?.caption ?? 'Caption',
    },
  }
}

function makeLinkNode(id: string, url: string, title: string, note?: string): LearningCanvasLinkNode {
  return {
    id,
    type: 'link',
    x: 50,
    y: 50,
    width: 280,
    height: 160,
    color: 'tint',
    link: { url, title, note },
  }
}

function makeRefNode(
  id: string,
  refType: 'module' | 'quiz' | 'learning',
  refId: string,
): LearningCanvasReferenceNode {
  return {
    id,
    type: 'reference',
    x: 100,
    y: 100,
    width: 260,
    height: 150,
    color: 'navy',
    reference: { refType, refId },
  }
}

function makeGroupNode(id: string, label: string): LearningCanvasGroupNode {
  return {
    id,
    type: 'group',
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    color: 'c1',
    group: { label },
  }
}

function makeEdge(
  id: string,
  from: string,
  to: string,
  extra?: Partial<LearningCanvasEdge>,
): LearningCanvasEdge {
  return {
    id,
    from,
    to,
    fromSide: 'right',
    toSide: 'left',
    arrow: 'to',
    label: '',
    ...extra,
  }
}

function makeContent(
  nodes: LearningCanvasNode[],
  edges: LearningCanvasEdge[] = [],
): LearningCanvasContent {
  return {
    version: 1,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

describe('sameNode equality', () => {
  it('detects unchanged vs changed image nodes correctly', () => {
    const img1 = makeImageNode('img-1', 'data:image/png;base64,AAAA1111')
    const img1Clone = makeImageNode('img-1', 'data:image/png;base64,AAAA1111')
    const imgChangedData = makeImageNode('img-1', 'data:image/png;base64,ZZZZ9999')
    const imgChangedAlt = makeImageNode('img-1', 'data:image/png;base64,AAAA1111', { alt: 'Different alt' })
    const imgChangedCaption = makeImageNode('img-1', 'data:image/png;base64,AAAA1111', { caption: 'Different caption' })

    expect(sameNode(img1, img1Clone)).toBe(true)
    expect(sameNode(img1, imgChangedData)).toBe(false)
    expect(sameNode(img1, imgChangedAlt)).toBe(false)
    expect(sameNode(img1, imgChangedCaption)).toBe(false)
  })

  it('detects same-length different image payloads', () => {
    const imgA = makeImageNode('img-1', 'data:image/png;base64,1234567890ABCDEF')
    const imgB = makeImageNode('img-1', 'data:image/png;base64,FEDCBA0987654321')
    expect(imgA.image.dataUrl.length).toBe(imgB.image.dataUrl.length)
    expect(sameNode(imgA, imgB)).toBe(false)
  })

  it('detects text node changes', () => {
    const textA = makeTextNode('t1', 'Hello world')
    const textB = makeTextNode('t1', 'Hello world')
    const textC = makeTextNode('t1', 'Different text')

    expect(sameNode(textA, textB)).toBe(true)
    expect(sameNode(textA, textC)).toBe(false)
  })

  it('detects link node changes', () => {
    const linkA = makeLinkNode('l1', 'https://example.com', 'Title', 'Note')
    const linkB = makeLinkNode('l1', 'https://example.com', 'Title', 'Note')
    const linkDiffUrl = makeLinkNode('l1', 'https://other.com', 'Title', 'Note')
    const linkDiffTitle = makeLinkNode('l1', 'https://example.com', 'New Title', 'Note')
    const linkDiffNote = makeLinkNode('l1', 'https://example.com', 'Title', 'New Note')

    expect(sameNode(linkA, linkB)).toBe(true)
    expect(sameNode(linkA, linkDiffUrl)).toBe(false)
    expect(sameNode(linkA, linkDiffTitle)).toBe(false)
    expect(sameNode(linkA, linkDiffNote)).toBe(false)
  })

  it('detects reference node changes', () => {
    const refA = makeRefNode('r1', 'module', 'mod-123')
    const refB = makeRefNode('r1', 'module', 'mod-123')
    const refDiffType = makeRefNode('r1', 'quiz', 'mod-123')
    const refDiffId = makeRefNode('r1', 'module', 'mod-456')

    expect(sameNode(refA, refB)).toBe(true)
    expect(sameNode(refA, refDiffType)).toBe(false)
    expect(sameNode(refA, refDiffId)).toBe(false)
  })

  it('detects group node changes', () => {
    const gA = makeGroupNode('g1', 'Group 1')
    const gB = makeGroupNode('g1', 'Group 1')
    const gC = makeGroupNode('g1', 'Renamed Group')

    expect(sameNode(gA, gB)).toBe(true)
    expect(sameNode(gA, gC)).toBe(false)
  })

  it('detects base geometry and color changes', () => {
    const base = makeTextNode('t1', 'Text')
    expect(sameNode(base, { ...base, x: 99 })).toBe(false)
    expect(sameNode(base, { ...base, y: 99 })).toBe(false)
    expect(sameNode(base, { ...base, width: 999 })).toBe(false)
    expect(sameNode(base, { ...base, height: 999 })).toBe(false)
    expect(sameNode(base, { ...base, color: 'c2' })).toBe(false)
  })
})

describe('sameEdge equality', () => {
  it('detects unchanged vs changed edge properties', () => {
    const edge = makeEdge('e1', 'n1', 'n2')
    const edgeClone = makeEdge('e1', 'n1', 'n2')
    expect(sameEdge(edge, edgeClone)).toBe(true)

    expect(sameEdge(edge, { ...edge, from: 'n3' })).toBe(false)
    expect(sameEdge(edge, { ...edge, to: 'n4' })).toBe(false)
    expect(sameEdge(edge, { ...edge, fromSide: 'bottom' })).toBe(false)
    expect(sameEdge(edge, { ...edge, toSide: 'top' })).toBe(false)
    expect(sameEdge(edge, { ...edge, arrow: 'both' })).toBe(false)
    expect(sameEdge(edge, { ...edge, label: 'connects' })).toBe(false)
  })
})

describe('sameBoard equality', () => {
  it('returns true for matching boards regardless of item order', () => {
    const n1 = makeTextNode('n1', 'Node 1')
    const n2 = makeTextNode('n2', 'Node 2')
    const e1 = makeEdge('e1', 'n1', 'n2')

    const boardA = makeContent([n1, n2], [e1])
    const boardB = makeContent([n2, n1], [e1])

    expect(sameBoard(boardA, boardB)).toBe(true)
  })

  it('returns false when nodes or edges differ', () => {
    const n1 = makeTextNode('n1', 'Node 1')
    const n2 = makeTextNode('n2', 'Node 2')
    const e1 = makeEdge('e1', 'n1', 'n2')

    const boardA = makeContent([n1, n2], [e1])
    const boardB = makeContent([n1, { ...n2, text: 'Changed' }], [e1])
    const boardC = makeContent([n1, n2], [{ ...e1, arrow: 'none' }])

    expect(sameBoard(boardA, boardB)).toBe(false)
    expect(sameBoard(boardA, boardC)).toBe(false)
  })
})

describe('mergeById with custom and fallback comparators', () => {
  it('falls back to sameItem when no comparator is provided', () => {
    const base = [{ id: '1', val: 'a' }]
    const local = [{ id: '1', val: 'b' }]
    const remote = [{ id: '1', val: 'a' }]

    const result = mergeById(base, local, remote)
    expect(result.items).toEqual([{ id: '1', val: 'b' }])
  })

  it('uses custom comparator to determine whether item changed', () => {
    const baseNode = makeTextNode('n1', 'Initial')
    const localNode = makeTextNode('n1', 'Initial') // local unchanged
    const remoteNode = makeTextNode('n1', 'Remote update') // remote changed

    const result = mergeById([baseNode], [localNode], [remoteNode], sameNode)
    expect(result.items).toEqual([remoteNode])
  })
})

describe('3-way merge with large image nodes and mixed content', () => {
  it('correctly merges concurrent edits with ~350KB base64 images without data corruption', () => {
    // Generate ~350 KB payload
    const largePayloadA = 'data:image/jpeg;base64,' + 'A'.repeat(350 * 1024)
    const largePayloadB = 'data:image/jpeg;base64,' + 'B'.repeat(350 * 1024)

    const baseImage = makeImageNode('img-large', largePayloadA, { caption: 'Initial caption' })
    const baseText = makeTextNode('text-1', 'Initial text')
    const baseEdge = makeEdge('e1', 'img-large', 'text-1')

    const base = makeContent([baseImage, baseText], [baseEdge])

    // Local changes text card and edge arrow, leaves image untouched
    const localImage = { ...baseImage }
    const localText = makeTextNode('text-1', 'Local updated text')
    const localEdge = makeEdge('e1', 'img-large', 'text-1', { arrow: 'both' })
    const local = makeContent([localImage, localText], [localEdge])

    // Remote changes image caption and replaced image dataUrl, leaves text card untouched, adds new remote card
    const remoteImage = makeImageNode('img-large', largePayloadB, { caption: 'Remote updated caption' })
    const remoteText = { ...baseText }
    const remoteNewCard = makeTextNode('text-remote', 'New from remote')
    const remoteNewEdge = makeEdge('e2', 'text-remote', 'img-large')
    const remote = makeContent([remoteImage, remoteText, remoteNewCard], [baseEdge, remoteNewEdge])

    const start = performance.now()
    const merged = mergeContent(base, local, remote)
    const elapsed = performance.now() - start

    // Merge must complete fast without multi-second stringify bottlenecks
    expect(elapsed).toBeLessThan(1500)

    // Check merged nodes:
    // 1. Image was unchanged locally, changed remotely -> remote wins
    const mergedImage = merged.content.nodes.find((n) => n.id === 'img-large') as LearningCanvasImageNode
    expect(mergedImage).toBeDefined()
    expect(mergedImage.image.caption).toBe('Remote updated caption')
    expect(mergedImage.image.dataUrl).toBe(largePayloadB)

    // 2. Text was changed locally, unchanged remotely -> local wins
    const mergedText = merged.content.nodes.find((n) => n.id === 'text-1') as LearningCanvasTextNode
    expect(mergedText).toBeDefined()
    expect(mergedText.text).toBe('Local updated text')

    // 3. New remote card was added
    const mergedRemoteCard = merged.content.nodes.find((n) => n.id === 'text-remote')
    expect(mergedRemoteCard).toBeDefined()

    // 4. Edges merged properly
    expect(merged.content.edges).toHaveLength(2)
    const edge1 = merged.content.edges.find((e) => e.id === 'e1')
    expect(edge1?.arrow).toBe('both') // local changed edge arrow, wins
    const edge2 = merged.content.edges.find((e) => e.id === 'e2')
    expect(edge2).toBeDefined() // remote added edge2
  })
})

type DeepRequired<T> = {
  [K in keyof Required<T>]: Required<T>[K] extends Record<string, unknown>
    ? DeepRequired<Required<T>[K]>
    : Required<T>[K]
}

function mutateScalarSameLength(key: string, value: unknown): unknown {
  if (typeof value === 'number') return value + 1
  if (typeof value === 'boolean') return !value
  if (typeof value === 'string') {
    if (key === 'color') return value === 'none' ? 'tint' : 'none'
    if (key === 'refType') return value === 'module' ? 'quiz' : 'module'
    if (key === 'fromSide' || key === 'toSide') return value === 'left' ? 'right' : 'left'
    if (key === 'arrow') return value === 'to' ? 'both' : 'to'
    if (value.startsWith('https://')) {
      return 'https://changed.example/path'
    }
    if (value.startsWith('data:image/')) {
      const prefix = 'data:image/png;base64,'
      const body = value.slice(prefix.length)
      const flipped = (body[0] === 'A' ? 'B' : 'A') + body.slice(1)
      return prefix + flipped
    }
    // Mutate string keeping the exact same length so length-only checks fail
    const first = value[0] === 'X' ? 'Y' : 'X'
    return first + value.slice(1)
  }
  throw new Error(`Unsupported scalar type for key "${key}": ${typeof value}`)
}

function extractInterfaceKeysFromTypesSource(source: string, interfaceName: string): string[] {
  const re = new RegExp(`export interface ${interfaceName}(?:\\s+extends\\s+\\w+)?\\s*\\{([\\s\\S]*?)\\n\\}`)
  const match = source.match(re)
  if (!match?.[1]) throw new Error(`Could not find interface ${interfaceName} in types.ts`)
  const body = match[1]
  // Match top-level property names (2-space indent) and nested property names (4-space indent)
  const keys: string[] = []
  for (const line of body.split('\n')) {
    const propMatch = line.match(/^\s{2,4}([a-zA-Z0-9_]+)\??\s*:/)
    if (propMatch?.[1]) keys.push(propMatch[1])
  }
  return keys
}

describe('sameNode and sameEdge exhaustive schema/type key enumeration', () => {
  const completeNodesByType: {
    text: DeepRequired<LearningCanvasTextNode>
    link: DeepRequired<LearningCanvasLinkNode>
    reference: DeepRequired<LearningCanvasReferenceNode>
    group: DeepRequired<LearningCanvasGroupNode>
    image: DeepRequired<LearningCanvasImageNode>
  } = {
    text: {
      id: 'node-text-1',
      type: 'text',
      x: 100,
      y: 200,
      width: 240,
      height: 140,
      color: 'none',
      text: 'Markdown content',
    },
    link: {
      id: 'node-link-1',
      type: 'link',
      x: 100,
      y: 200,
      width: 280,
      height: 160,
      color: 'tint',
      link: {
        url: 'https://initial.example/path',
        title: 'Example Title',
        note: 'Example Note',
      },
    },
    reference: {
      id: 'node-ref-1',
      type: 'reference',
      x: 100,
      y: 200,
      width: 260,
      height: 150,
      color: 'navy',
      reference: {
        refType: 'module',
        refId: 'mod-101',
      },
    },
    group: {
      id: 'node-group-1',
      type: 'group',
      x: 50,
      y: 60,
      width: 400,
      height: 300,
      color: 'c1',
      group: {
        label: 'Study Group Box',
      },
    },
    image: {
      id: 'node-img-1',
      type: 'image',
      x: 120,
      y: 180,
      width: 300,
      height: 220,
      color: 'none',
      image: {
        dataUrl: 'data:image/png;base64,AAAA1111BBBB2222',
        alt: 'Diagram alt text',
        caption: 'Diagram caption',
      },
    },
  }

  const completeEdge: DeepRequired<LearningCanvasEdge> = {
    id: 'edge-full-1',
    from: 'node-text-1',
    to: 'node-link-1',
    fromSide: 'left',
    toSide: 'right',
    label: 'relates to',
    arrow: 'to',
  }

  it('compares every top-level and nested key of every LearningCanvasNodeType and LearningCanvasEdge', () => {
    const typesSource = readFileSync(resolve(__dirname, '../types.ts'), 'utf8')
    const baseKeys = extractInterfaceKeysFromTypesSource(typesSource, 'LearningCanvasNodeBase')
    const interfaceByType: Record<LearningCanvasNodeType, string> = {
      text: 'LearningCanvasTextNode',
      link: 'LearningCanvasLinkNode',
      reference: 'LearningCanvasReferenceNode',
      group: 'LearningCanvasGroupNode',
      image: 'LearningCanvasImageNode',
    }

    const nodeTypes: LearningCanvasNodeType[] = ['text', 'link', 'reference', 'group', 'image']
    for (const nodeType of nodeTypes) {
      const sample = completeNodesByType[nodeType]
      // Validate through runtime schema so schema and fixture stay in sync
      const validated = validateLearningCanvasNode(sample)
      expect(sameNode(validated, structuredClone(validated))).toBe(true)

      // Verify fixture includes every key declared in types.ts for this node type
      const declaredKeys = new Set([
        ...baseKeys,
        ...extractInterfaceKeysFromTypesSource(typesSource, interfaceByType[nodeType]),
      ])
      const presentKeys = new Set<string>()

      for (const [topKey, topVal] of Object.entries(validated)) {
        presentKeys.add(topKey)
        if (topKey === 'type') continue

        if (topVal && typeof topVal === 'object' && !Array.isArray(topVal)) {
          for (const [nestedKey, nestedVal] of Object.entries(topVal as Record<string, unknown>)) {
            presentKeys.add(nestedKey)
            const mutated = structuredClone(validated) as unknown as Record<string, unknown>
            const nestedObj = { ...(mutated[topKey] as Record<string, unknown>) }
            nestedObj[nestedKey] = mutateScalarSameLength(nestedKey, nestedVal)
            mutated[topKey] = nestedObj
            expect(
              sameNode(validated, mutated as unknown as LearningCanvasNode),
              `Expected sameNode to detect change in ${nodeType}.${topKey}.${nestedKey}`,
            ).toBe(false)
          }
        } else {
          const mutated = structuredClone(validated) as unknown as Record<string, unknown>
          mutated[topKey] = mutateScalarSameLength(topKey, topVal)
          expect(
            sameNode(validated, mutated as unknown as LearningCanvasNode),
            `Expected sameNode to detect change in ${nodeType}.${topKey}`,
          ).toBe(false)
        }
      }

      expect(presentKeys).toEqual(declaredKeys)
    }

    // Exhaustively check every key on LearningCanvasEdge
    const declaredEdgeKeys = new Set(extractInterfaceKeysFromTypesSource(typesSource, 'LearningCanvasEdge'))
    const validatedEdge = validateLearningCanvasEdge(completeEdge, new Set(['node-text-1', 'node-link-1']))
    expect(sameEdge(validatedEdge, structuredClone(validatedEdge))).toBe(true)

    const presentEdgeKeys = new Set(Object.keys(validatedEdge))
    expect(presentEdgeKeys).toEqual(declaredEdgeKeys)

    for (const [edgeKey, edgeVal] of Object.entries(validatedEdge)) {
      const mutatedEdge = structuredClone(validatedEdge) as unknown as Record<string, unknown>
      mutatedEdge[edgeKey] = mutateScalarSameLength(edgeKey, edgeVal)
      expect(
        sameEdge(validatedEdge, mutatedEdge as unknown as LearningCanvasEdge),
        `Expected sameEdge to detect change in edge.${edgeKey}`,
      ).toBe(false)
    }
  })
})

