import { Timestamp } from 'firebase/firestore'
import {
  MAX_CANVAS_DESCRIPTION_LENGTH,
  MAX_CANVAS_TITLE_LENGTH,
  MAX_EDGE_LABEL_LENGTH,
  MAX_GROUP_LABEL_LENGTH,
  MAX_LEARNING_CANVAS_EDGES,
  MAX_LEARNING_CANVAS_GROUPS,
  MAX_LEARNING_CANVAS_NODES,
  MAX_LEARNING_CANVAS_REFS,
  MAX_LINK_NOTE_LENGTH,
  MAX_LINK_TITLE_LENGTH,
  MAX_NODE_COORD,
  MAX_NODE_DIMENSION,
  MAX_TEXT_NODE_LENGTH,
  MIN_NODE_COORD,
  MIN_NODE_DIMENSION,
} from './constants'
import type {
  LearningCanvasArrow,
  LearningCanvasColor,
  LearningCanvasContent,
  LearningCanvasEdge,
  LearningCanvasEdgeSide,
  LearningCanvasKind,
  LearningCanvasNode,
  LearningCanvasNodeType,
  LearningCanvasRecord,
  LearningCanvasRef,
  LearningCanvasRefType,
  LearningCanvasStatus,
  LearningCanvasViewport,
} from './types'

export class LearningCanvasValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LearningCanvasValidationError'
  }
}

type RecordValue = Record<string, unknown>

function record(value: unknown, fieldName: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LearningCanvasValidationError(`${fieldName} must be an object.`)
  }
  return value as RecordValue
}

function string(value: unknown, fieldName: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new LearningCanvasValidationError(
      `${fieldName} must be a${allowEmpty ? ' string' : ' non-empty string'}.`,
    )
  }
  return value
}

function numberField(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LearningCanvasValidationError(`${fieldName} must be a valid number.`)
  }
  return value
}

function timestampField(value: unknown, fieldName: string): Timestamp {
  if (!value) {
    throw new LearningCanvasValidationError(`${fieldName} is required.`)
  }
  if (value instanceof Timestamp) {
    return value
  }
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
    const v = value as { seconds: number; nanoseconds?: number }
    return new Timestamp(v.seconds, v.nanoseconds ?? 0)
  }
  if (value instanceof Date) {
    return Timestamp.fromDate(value)
  }
  throw new LearningCanvasValidationError(`${fieldName} must be a valid Firestore timestamp.`)
}

export function computeRefs(nodes: LearningCanvasNode[]): LearningCanvasRef[] {
  const seen = new Set<string>()
  const refs: LearningCanvasRef[] = []

  for (const node of nodes) {
    if (node.type === 'reference') {
      const key = `${node.reference.refType}:${node.reference.refId}`
      if (!seen.has(key)) {
        seen.add(key)
        refs.push({
          type: node.reference.refType,
          id: node.reference.refId,
        })
      }
    }
  }

  if (refs.length > MAX_LEARNING_CANVAS_REFS) {
    throw new LearningCanvasValidationError(
      `Canvas cannot exceed ${MAX_LEARNING_CANVAS_REFS} distinct references.`,
    )
  }

  return refs
}

export function countStats(
  nodes: LearningCanvasNode[],
  edges: LearningCanvasEdge[],
): { nodeCount: number; edgeCount: number; groupCount: number } {
  const groupCount = nodes.filter((n) => n.type === 'group').length
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    groupCount,
  }
}

export function clampNode<T extends LearningCanvasNode>(node: T): T {
  const x = Math.min(Math.max(node.x, MIN_NODE_COORD), MAX_NODE_COORD)
  const y = Math.min(Math.max(node.y, MIN_NODE_COORD), MAX_NODE_COORD)
  const width = Math.min(Math.max(node.width, MIN_NODE_DIMENSION), MAX_NODE_DIMENSION)
  const height = Math.min(Math.max(node.height, MIN_NODE_DIMENSION), MAX_NODE_DIMENSION)

  return {
    ...node,
    x,
    y,
    width,
    height,
  }
}

export function newNodePlacement(
  existingNodes: LearningCanvasNode[],
  desired?: { x?: number; y?: number; width?: number; height?: number },
): { x: number; y: number } {
  const width = desired?.width ?? 240
  const height = desired?.height ?? 140
  const margin = 40

  let candidateX = desired?.x ?? 0
  let candidateY = desired?.y ?? 0

  candidateX = Math.min(Math.max(candidateX, MIN_NODE_COORD), MAX_NODE_COORD - width)
  candidateY = Math.min(Math.max(candidateY, MIN_NODE_COORD), MAX_NODE_COORD - height)

  const overlaps = (x: number, y: number) => {
    return existingNodes.some((n) => {
      return (
        x < n.x + n.width + margin &&
        x + width + margin > n.x &&
        y < n.y + n.height + margin &&
        y + height + margin > n.y
      )
    })
  }

  if (!overlaps(candidateX, candidateY)) {
    return { x: candidateX, y: candidateY }
  }

  // Spiral / grid search for a free slot
  const stepX = width + margin
  const stepY = height + margin
  for (let ring = 1; ring <= 15; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
          const testX = candidateX + dx * stepX
          const testY = candidateY + dy * stepY
          if (
            testX >= MIN_NODE_COORD &&
            testX <= MAX_NODE_COORD - width &&
            testY >= MIN_NODE_COORD &&
            testY <= MAX_NODE_COORD - height &&
            !overlaps(testX, testY)
          ) {
            return { x: testX, y: testY }
          }
        }
      }
    }
  }

  // Fallback to offset if board is full
  return {
    x: Math.min(candidateX + 40, MAX_NODE_COORD - width),
    y: Math.min(candidateY + 40, MAX_NODE_COORD - height),
  }
}

const VALID_COLORS: readonly LearningCanvasColor[] = [
  'none',
  'navy',
  'tint',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
]

const VALID_SIDES: readonly LearningCanvasEdgeSide[] = ['top', 'right', 'bottom', 'left']
const VALID_ARROWS: readonly LearningCanvasArrow[] = ['none', 'to', 'both']
const VALID_REF_TYPES: readonly LearningCanvasRefType[] = ['module', 'quiz', 'learning']

export function validateLearningCanvasNode(value: unknown): LearningCanvasNode {
  const obj = record(value, 'Node')
  const id = string(obj.id, 'Node id')
  const type = string(obj.type, 'Node type') as LearningCanvasNodeType
  if (!['text', 'link', 'reference', 'group'].includes(type)) {
    throw new LearningCanvasValidationError(`Unsupported node type: ${type}.`)
  }

  const x = numberField(obj.x, 'Node x')
  const y = numberField(obj.y, 'Node y')
  if (x < MIN_NODE_COORD || x > MAX_NODE_COORD || y < MIN_NODE_COORD || y > MAX_NODE_COORD) {
    throw new LearningCanvasValidationError(
      `Node position must be between ${MIN_NODE_COORD} and ${MAX_NODE_COORD} pixels.`,
    )
  }

  const width = numberField(obj.width, 'Node width')
  const height = numberField(obj.height, 'Node height')
  if (
    width < MIN_NODE_DIMENSION ||
    width > MAX_NODE_DIMENSION ||
    height < MIN_NODE_DIMENSION ||
    height > MAX_NODE_DIMENSION
  ) {
    throw new LearningCanvasValidationError(
      `Node dimensions must be between ${MIN_NODE_DIMENSION} and ${MAX_NODE_DIMENSION} pixels.`,
    )
  }

  const color = (obj.color ? string(obj.color, 'Node color') : 'none') as LearningCanvasColor
  if (!VALID_COLORS.includes(color)) {
    throw new LearningCanvasValidationError(`Invalid color token: ${color}.`)
  }

  const base = {
    id,
    type,
    x,
    y,
    width,
    height,
    color,
  }

  if (type === 'text') {
    const text = typeof obj.text === 'string' ? obj.text : ''
    if (text.length > MAX_TEXT_NODE_LENGTH) {
      throw new LearningCanvasValidationError(
        `Text card content cannot exceed ${MAX_TEXT_NODE_LENGTH} characters.`,
      )
    }
    return { ...base, type: 'text', text }
  }

  if (type === 'link') {
    const linkObj = record(obj.link, 'Link object')
    const url = string(linkObj.url, 'Link url')
    if (!url.startsWith('https://')) {
      throw new LearningCanvasValidationError('Link card requires an https:// URL.')
    }
    try {
      new URL(url)
    } catch {
      throw new LearningCanvasValidationError('Invalid link URL.')
    }

    const title = string(linkObj.title, 'Link title')
    if (title.length > MAX_LINK_TITLE_LENGTH) {
      throw new LearningCanvasValidationError(
        `Link title cannot exceed ${MAX_LINK_TITLE_LENGTH} characters.`,
      )
    }

    let note: string | undefined
    if (linkObj.note !== undefined && linkObj.note !== null) {
      note = typeof linkObj.note === 'string' ? linkObj.note : ''
      if (note.length > MAX_LINK_NOTE_LENGTH) {
        throw new LearningCanvasValidationError(
          `Link note cannot exceed ${MAX_LINK_NOTE_LENGTH} characters.`,
        )
      }
    }

    return {
      ...base,
      type: 'link',
      link: { url, title, ...(note !== undefined ? { note } : {}) },
    }
  }

  if (type === 'reference') {
    const refObj = record(obj.reference, 'Reference object')
    const refType = string(refObj.refType, 'Reference type') as LearningCanvasRefType
    if (!VALID_REF_TYPES.includes(refType)) {
      throw new LearningCanvasValidationError(`Invalid reference type: ${refType}.`)
    }
    const refId = string(refObj.refId, 'Reference id')
    return {
      ...base,
      type: 'reference',
      reference: { refType, refId },
    }
  }

  if (type === 'group') {
    const groupObj = record(obj.group, 'Group object')
    const label = typeof groupObj.label === 'string' ? groupObj.label : ''
    if (label.length > MAX_GROUP_LABEL_LENGTH) {
      throw new LearningCanvasValidationError(
        `Group label cannot exceed ${MAX_GROUP_LABEL_LENGTH} characters.`,
      )
    }
    return {
      ...base,
      type: 'group',
      group: { label },
    }
  }

  throw new LearningCanvasValidationError('Invalid node structure.')
}

export function validateLearningCanvasEdge(
  value: unknown,
  nodeIds: Set<string>,
): LearningCanvasEdge {
  const obj = record(value, 'Edge')
  const id = string(obj.id, 'Edge id')
  const from = string(obj.from, 'Edge from')
  const to = string(obj.to, 'Edge to')

  if (from === to) {
    throw new LearningCanvasValidationError('Self-connections are not allowed.')
  }
  if (!nodeIds.has(from)) {
    throw new LearningCanvasValidationError(`Edge source node "${from}" does not exist.`)
  }
  if (!nodeIds.has(to)) {
    throw new LearningCanvasValidationError(`Edge target node "${to}" does not exist.`)
  }

  let fromSide: LearningCanvasEdgeSide | undefined
  if (obj.fromSide !== undefined && obj.fromSide !== null) {
    const side = string(obj.fromSide, 'Edge fromSide') as LearningCanvasEdgeSide
    if (!VALID_SIDES.includes(side)) {
      throw new LearningCanvasValidationError(`Invalid fromSide: ${side}.`)
    }
    fromSide = side
  }

  let toSide: LearningCanvasEdgeSide | undefined
  if (obj.toSide !== undefined && obj.toSide !== null) {
    const side = string(obj.toSide, 'Edge toSide') as LearningCanvasEdgeSide
    if (!VALID_SIDES.includes(side)) {
      throw new LearningCanvasValidationError(`Invalid toSide: ${side}.`)
    }
    toSide = side
  }

  let label: string | undefined
  if (obj.label !== undefined && obj.label !== null) {
    const l = typeof obj.label === 'string' ? obj.label : ''
    if (l.length > MAX_EDGE_LABEL_LENGTH) {
      throw new LearningCanvasValidationError(
        `Edge label cannot exceed ${MAX_EDGE_LABEL_LENGTH} characters.`,
      )
    }
    label = l
  }

  const arrow = (obj.arrow ? string(obj.arrow, 'Edge arrow') : 'to') as LearningCanvasArrow
  if (!VALID_ARROWS.includes(arrow)) {
    throw new LearningCanvasValidationError(`Invalid edge arrow style: ${arrow}.`)
  }

  return {
    id,
    from,
    to,
    ...(fromSide ? { fromSide } : {}),
    ...(toSide ? { toSide } : {}),
    ...(label !== undefined ? { label } : {}),
    arrow,
  }
}

export function parseLearningCanvasContent(value: unknown): LearningCanvasContent {
  const obj = record(value, 'Content')

  if (obj.version !== 1) {
    throw new LearningCanvasValidationError('Content version must be 1.')
  }

  if (!Array.isArray(obj.nodes)) {
    throw new LearningCanvasValidationError('Nodes must be an array.')
  }
  if (obj.nodes.length > MAX_LEARNING_CANVAS_NODES) {
    throw new LearningCanvasValidationError(
      `Canvas cannot exceed ${MAX_LEARNING_CANVAS_NODES} nodes.`,
    )
  }

  const seenNodeIds = new Set<string>()
  let groupCount = 0
  const parsedNodes: LearningCanvasNode[] = []

  for (const rawNode of obj.nodes) {
    const node = validateLearningCanvasNode(rawNode)
    if (seenNodeIds.has(node.id)) {
      throw new LearningCanvasValidationError(`Duplicate node ID: ${node.id}.`)
    }
    seenNodeIds.add(node.id)
    if (node.type === 'group') {
      groupCount++
    }
    parsedNodes.push(node)
  }

  if (groupCount > MAX_LEARNING_CANVAS_GROUPS) {
    throw new LearningCanvasValidationError(
      `Canvas cannot exceed ${MAX_LEARNING_CANVAS_GROUPS} groups.`,
    )
  }

  if (!Array.isArray(obj.edges)) {
    throw new LearningCanvasValidationError('Edges must be an array.')
  }
  if (obj.edges.length > MAX_LEARNING_CANVAS_EDGES) {
    throw new LearningCanvasValidationError(
      `Canvas cannot exceed ${MAX_LEARNING_CANVAS_EDGES} connections.`,
    )
  }

  const seenEdgeIds = new Set<string>()
  const seenConnections = new Set<string>()
  const parsedEdges: LearningCanvasEdge[] = []

  for (const rawEdge of obj.edges) {
    const edge = validateLearningCanvasEdge(rawEdge, seenNodeIds)
    if (seenEdgeIds.has(edge.id)) {
      throw new LearningCanvasValidationError(`Duplicate edge ID: ${edge.id}.`)
    }
    seenEdgeIds.add(edge.id)

    // Check duplicate connection between same nodes
    const connKey = `${edge.from}->${edge.to}:${edge.fromSide ?? ''}:${edge.toSide ?? ''}`
    if (seenConnections.has(connKey)) {
      throw new LearningCanvasValidationError(
        `Duplicate connection between "${edge.from}" and "${edge.to}".`,
      )
    }
    seenConnections.add(connKey)
    parsedEdges.push(edge)
  }

  const vpObj = record(obj.viewport, 'Viewport')
  const viewport: LearningCanvasViewport = {
    x: numberField(vpObj.x, 'Viewport x'),
    y: numberField(vpObj.y, 'Viewport y'),
    zoom: numberField(vpObj.zoom, 'Viewport zoom'),
  }

  return {
    version: 1,
    nodes: parsedNodes,
    edges: parsedEdges,
    viewport,
  }
}

export function parseLearningCanvasMetadata(value: unknown): LearningCanvasRecord {
  const obj = record(value, 'LearningCanvas')

  const ownerId = string(obj.ownerId, 'ownerId')
  const classId = string(obj.classId, 'classId')

  const kind = string(obj.kind, 'kind') as LearningCanvasKind
  if (kind !== 'class' && kind !== 'personal') {
    throw new LearningCanvasValidationError('Kind must be either "class" or "personal".')
  }

  const title = string(obj.title, 'title')
  if (title.length > MAX_CANVAS_TITLE_LENGTH) {
    throw new LearningCanvasValidationError(
      `Canvas title cannot exceed ${MAX_CANVAS_TITLE_LENGTH} characters.`,
    )
  }

  const description = typeof obj.description === 'string' ? obj.description : ''
  if (description.length > MAX_CANVAS_DESCRIPTION_LENGTH) {
    throw new LearningCanvasValidationError(
      `Canvas description cannot exceed ${MAX_CANVAS_DESCRIPTION_LENGTH} characters.`,
    )
  }

  const status = string(obj.status, 'status') as LearningCanvasStatus
  if (kind === 'personal') {
    if (status !== 'private') {
      throw new LearningCanvasValidationError('Personal canvas status must be "private".')
    }
  } else {
    if (status !== 'draft' && status !== 'published') {
      throw new LearningCanvasValidationError('Class canvas status must be "draft" or "published".')
    }
  }

  const nodeCount = numberField(obj.nodeCount, 'nodeCount')
  if (!Number.isInteger(nodeCount) || nodeCount < 0 || nodeCount > MAX_LEARNING_CANVAS_NODES) {
    throw new LearningCanvasValidationError(
      `nodeCount must be an integer between 0 and ${MAX_LEARNING_CANVAS_NODES}.`,
    )
  }

  const edgeCount = numberField(obj.edgeCount, 'edgeCount')
  if (!Number.isInteger(edgeCount) || edgeCount < 0 || edgeCount > MAX_LEARNING_CANVAS_EDGES) {
    throw new LearningCanvasValidationError(
      `edgeCount must be an integer between 0 and ${MAX_LEARNING_CANVAS_EDGES}.`,
    )
  }

  if (!Array.isArray(obj.refs)) {
    throw new LearningCanvasValidationError('refs must be an array.')
  }
  if (obj.refs.length > MAX_LEARNING_CANVAS_REFS) {
    throw new LearningCanvasValidationError(
      `refs cannot exceed ${MAX_LEARNING_CANVAS_REFS} items.`,
    )
  }

  const refs: LearningCanvasRef[] = []
  for (const rawRef of obj.refs) {
    const refObj = record(rawRef, 'ref')
    const refType = string(refObj.type, 'ref type') as LearningCanvasRefType
    if (!VALID_REF_TYPES.includes(refType)) {
      throw new LearningCanvasValidationError(`Invalid ref type: ${refType}.`)
    }
    const id = string(refObj.id, 'ref id')
    refs.push({ type: refType, id })
  }

  let sourceCanvasId: string | null = null
  if (obj.sourceCanvasId !== undefined && obj.sourceCanvasId !== null) {
    sourceCanvasId = string(obj.sourceCanvasId, 'sourceCanvasId')
  }

  const createdAt = timestampField(obj.createdAt, 'createdAt')
  const updatedAt = timestampField(obj.updatedAt, 'updatedAt')

  return {
    ownerId,
    classId,
    kind,
    title,
    description,
    status,
    nodeCount,
    edgeCount,
    refs,
    sourceCanvasId,
    createdAt,
    updatedAt,
  }
}
