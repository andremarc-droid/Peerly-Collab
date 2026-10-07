import {
  MAX_EDGE_LABEL_LENGTH,
  MAX_GROUP_LABEL_LENGTH,
  MAX_LEARNING_CANVAS_EDGES,
  MAX_LEARNING_CANVAS_GROUPS,
  MAX_LEARNING_CANVAS_NODES,
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
  LearningCanvasGroupNode,
  LearningCanvasLinkNode,
  LearningCanvasNode,
  LearningCanvasTextNode,
} from './types'

export interface JsonCanvasNodeGeneric {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  color?: string
  [key: string]: unknown
}

export interface JsonCanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  color?: string
  label?: string
}

export interface JsonCanvas {
  nodes?: JsonCanvasNodeGeneric[]
  edges?: JsonCanvasEdge[]
}

export interface JsonCanvasImportReport {
  droppedNodes: number
  fileNodesConverted: number
  clampedPositions: number
  clampedSizes: number
  droppedEdges: number
  idCollisions: number
  notes: string[]
}

export interface FromJsonCanvasResult {
  content: LearningCanvasContent
  report: JsonCanvasImportReport
}

function sanitizeText(raw: string): string {
  // Strip out executable script tags and iframe injections to ensure pure markdown/text
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
}

function colorToJsonCanvas(color: LearningCanvasColor): string | undefined {
  switch (color) {
    case 'c1':
      return '1'
    case 'c2':
      return '2'
    case 'c3':
      return '3'
    case 'c4':
      return '4'
    case 'c5':
      return '5'
    case 'c6':
      return '6'
    case 'navy':
      return 'navy'
    case 'tint':
      return 'tint'
    case 'none':
    default:
      return undefined
  }
}

function colorFromJsonCanvas(color?: string): LearningCanvasColor {
  if (!color) return 'none'
  const trimmed = color.trim().toLowerCase()
  if (trimmed === '1') return 'c1'
  if (trimmed === '2') return 'c2'
  if (trimmed === '3') return 'c3'
  if (trimmed === '4') return 'c4'
  if (trimmed === '5') return 'c5'
  if (trimmed === '6') return 'c6'
  if (trimmed === 'navy') return 'navy'
  if (trimmed === 'tint') return 'tint'
  return 'none'
}

/**
 * Serializes a LearningCanvasContent into the JSON Canvas 1.0 format.
 */
export function toJsonCanvas(content: LearningCanvasContent): JsonCanvas {
  const nodes: JsonCanvasNodeGeneric[] = content.nodes.map((node) => {
    const base = {
      id: node.id,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height),
      ...(colorToJsonCanvas(node.color) ? { color: colorToJsonCanvas(node.color) } : {}),
    }

    if (node.type === 'text') {
      return { ...base, type: 'text', text: node.text }
    }
    if (node.type === 'link') {
      return { ...base, type: 'link', url: node.link.url }
    }
    if (node.type === 'group') {
      return { ...base, type: 'group', label: node.group.label }
    }
    if (node.type === 'image') {
      return { ...base, type: 'file', file: node.image.dataUrl }
    }
    if (node.type === 'reference') {
      // JSON Canvas has no concept of internal LMS reference nodes, represent as markdown text card
      const text = `**[Reference: ${node.reference.refType}]**\nID: \`${node.reference.refId}\``
      return { ...base, type: 'text', text }
    }

    return { ...base, type: 'text', text: '' }
  })

  const edges: JsonCanvasEdge[] = content.edges.map((edge) => {
    let fromEnd: 'none' | 'arrow' = 'none'
    let toEnd: 'none' | 'arrow' = 'arrow'

    if (edge.arrow === 'both') {
      fromEnd = 'arrow'
      toEnd = 'arrow'
    } else if (edge.arrow === 'none') {
      fromEnd = 'none'
      toEnd = 'none'
    }

    return {
      id: edge.id,
      fromNode: edge.from,
      toNode: edge.to,
      ...(edge.fromSide ? { fromSide: edge.fromSide } : {}),
      ...(edge.toSide ? { toSide: edge.toSide } : {}),
      fromEnd,
      toEnd,
      ...(edge.label ? { label: edge.label } : {}),
    }
  })

  return { nodes, edges }
}

/**
 * Imports a JSON Canvas 1.0 structure into LearningCanvasContent.
 * Import is lossy and produces a detailed diagnostic report.
 */
export function fromJsonCanvas(input: unknown): {
  content: LearningCanvasContent
  report: JsonCanvasImportReport
} {
  const report: JsonCanvasImportReport = {
    droppedNodes: 0,
    fileNodesConverted: 0,
    clampedPositions: 0,
    clampedSizes: 0,
    droppedEdges: 0,
    idCollisions: 0,
    notes: [],
  }

  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new Error('Invalid JSON format.')
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Canvas data must be a JSON object.')
  }

  const raw = parsed as Record<string, unknown>
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : []

  const validNodes: LearningCanvasNode[] = []
  const existingNodeIds = new Set<string>()
  const idMap = new Map<string, string>()
  let groupCount = 0

  for (const rawNode of rawNodes) {
    if (typeof rawNode !== 'object' || rawNode === null) {
      report.droppedNodes++
      continue
    }

    if (validNodes.length >= MAX_LEARNING_CANVAS_NODES) {
      report.droppedNodes++
      report.notes.push(
        `Exceeded maximum node capacity of ${MAX_LEARNING_CANVAS_NODES}. Remaining nodes dropped.`,
      )
      continue
    }

    const n = rawNode as Record<string, unknown>
    const type = typeof n.type === 'string' ? n.type : ''

    let origId = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : `node_${validNodes.length + 1}`
    let resolvedId = origId
    if (existingNodeIds.has(origId)) {
      report.idCollisions++
      let counter = 1
      while (existingNodeIds.has(`${origId}_${counter}`)) {
        counter++
      }
      resolvedId = `${origId}_${counter}`
      report.notes.push(`ID collision for "${origId}". Renamed to "${resolvedId}".`)
    }
    existingNodeIds.add(resolvedId)
    idMap.set(origId, resolvedId)

    // Clamp coordinates
    const rawX = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : 0
    const rawY = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : 0
    let x = Math.min(Math.max(rawX, MIN_NODE_COORD), MAX_NODE_COORD)
    let y = Math.min(Math.max(rawY, MIN_NODE_COORD), MAX_NODE_COORD)
    if (x !== rawX || y !== rawY) {
      report.clampedPositions++
    }

    // Clamp dimensions
    const rawW = typeof n.width === 'number' && Number.isFinite(n.width) ? n.width : 240
    const rawH = typeof n.height === 'number' && Number.isFinite(n.height) ? n.height : 140
    let width = Math.min(Math.max(rawW, MIN_NODE_DIMENSION), MAX_NODE_DIMENSION)
    let height = Math.min(Math.max(rawH, MIN_NODE_DIMENSION), MAX_NODE_DIMENSION)
    if (width !== rawW || height !== rawH) {
      report.clampedSizes++
    }

    const color = colorFromJsonCanvas(typeof n.color === 'string' ? n.color : undefined)
    const base = {
      id: resolvedId,
      x,
      y,
      width,
      height,
      color,
    }

    if (type === 'text') {
      const textRaw = typeof n.text === 'string' ? n.text : ''
      const safeText = sanitizeText(textRaw).slice(0, MAX_TEXT_NODE_LENGTH)
      const textNode: LearningCanvasTextNode = {
        ...base,
        type: 'text',
        text: safeText,
      }
      validNodes.push(textNode)
    } else if (type === 'file') {
      const fileData = typeof n.file === 'string' ? n.file : ''
      if (fileData.startsWith('data:image/')) {
        const imageNode: LearningCanvasImageNode = {
          ...base,
          type: 'image',
          image: {
            dataUrl: fileData,
            alt: typeof n.alt === 'string' ? n.alt : 'Imported image',
            caption: typeof n.subpath === 'string' ? n.subpath : undefined,
          },
        }
        validNodes.push(imageNode)
      } else {
        report.fileNodesConverted++
        const fileName = fileData || 'Untitled attachment'
        const subpath = typeof n.subpath === 'string' ? ` (${n.subpath})` : ''
        const safeText = sanitizeText(`📁 File: ${fileName}${subpath}`).slice(0, MAX_TEXT_NODE_LENGTH)
        const textNode: LearningCanvasTextNode = {
          ...base,
          type: 'text',
          text: safeText,
        }
        validNodes.push(textNode)
        report.notes.push(`File node "${fileName}" converted to text card.`)
      }
    } else if (type === 'link') {
      const urlRaw = typeof n.url === 'string' ? n.url.trim() : ''
      if (urlRaw.startsWith('https://')) {
        let title = typeof n.title === 'string' && n.title.trim() ? n.title : urlRaw
        title = title.slice(0, MAX_LINK_TITLE_LENGTH)
        const linkNode: LearningCanvasLinkNode = {
          ...base,
          type: 'link',
          link: {
            url: urlRaw,
            title,
          },
        }
        validNodes.push(linkNode)
      } else {
        // Fall back to text node if not https
        report.notes.push(`Non-https link "${urlRaw}" converted to text card for security.`)
        const textNode: LearningCanvasTextNode = {
          ...base,
          type: 'text',
          text: sanitizeText(`🔗 Link: ${urlRaw}`).slice(0, MAX_TEXT_NODE_LENGTH),
        }
        validNodes.push(textNode)
      }
    } else if (type === 'group') {
      if (groupCount >= MAX_LEARNING_CANVAS_GROUPS) {
        report.droppedNodes++
        report.notes.push(
          `Exceeded maximum group capacity of ${MAX_LEARNING_CANVAS_GROUPS}. Group dropped.`,
        )
        continue
      }
      groupCount++
      const label = typeof n.label === 'string' ? n.label.slice(0, MAX_GROUP_LABEL_LENGTH) : ''
      const groupNode: LearningCanvasGroupNode = {
        ...base,
        type: 'group',
        group: { label },
      }
      validNodes.push(groupNode)
    } else {
      // Unknown type
      report.droppedNodes++
      report.notes.push(`Unknown node type "${type}" dropped.`)
    }
  }

  const validEdges: LearningCanvasEdge[] = []
  const existingEdgeIds = new Set<string>()
  const existingConnections = new Set<string>()

  for (const rawEdge of rawEdges) {
    if (typeof rawEdge !== 'object' || rawEdge === null) {
      report.droppedEdges++
      continue
    }

    if (validEdges.length >= MAX_LEARNING_CANVAS_EDGES) {
      report.droppedEdges++
      report.notes.push(
        `Exceeded maximum edge capacity of ${MAX_LEARNING_CANVAS_EDGES}. Remaining edges dropped.`,
      )
      continue
    }

    const e = rawEdge as Record<string, unknown>
    const rawFrom = typeof e.fromNode === 'string' ? e.fromNode : ''
    const rawTo = typeof e.toNode === 'string' ? e.toNode : ''

    const from = idMap.get(rawFrom) ?? rawFrom
    const to = idMap.get(rawTo) ?? rawTo

    if (!existingNodeIds.has(from) || !existingNodeIds.has(to)) {
      report.droppedEdges++
      report.notes.push(`Edge dropped: connected nodes "${rawFrom}" or "${rawTo}" not found.`)
      continue
    }

    if (from === to) {
      report.droppedEdges++
      report.notes.push(`Self-edge dropped for node "${from}".`)
      continue
    }

    const validSides = ['top', 'right', 'bottom', 'left']
    const fromSide =
      typeof e.fromSide === 'string' && validSides.includes(e.fromSide)
        ? (e.fromSide as LearningCanvasEdgeSide)
        : undefined
    const toSide =
      typeof e.toSide === 'string' && validSides.includes(e.toSide)
        ? (e.toSide as LearningCanvasEdgeSide)
        : undefined

    const connKey = `${from}->${to}:${fromSide ?? ''}:${toSide ?? ''}`
    if (existingConnections.has(connKey)) {
      report.droppedEdges++
      report.notes.push(`Duplicate edge between "${from}" and "${to}" dropped.`)
      continue
    }
    existingConnections.add(connKey)

    let origEdgeId =
      typeof e.id === 'string' && e.id.trim() ? e.id.trim() : `edge_${validEdges.length + 1}`
    let edgeId = origEdgeId
    if (existingEdgeIds.has(origEdgeId)) {
      let counter = 1
      while (existingEdgeIds.has(`${origEdgeId}_${counter}`)) {
        counter++
      }
      edgeId = `${origEdgeId}_${counter}`
    }
    existingEdgeIds.add(edgeId)

    let arrow: LearningCanvasArrow = 'to'
    const fromEnd = typeof e.fromEnd === 'string' ? e.fromEnd : 'none'
    const toEnd = typeof e.toEnd === 'string' ? e.toEnd : 'arrow'

    if (fromEnd === 'arrow' && toEnd === 'arrow') {
      arrow = 'both'
    } else if (fromEnd === 'none' && toEnd === 'none') {
      arrow = 'none'
    }

    const label =
      typeof e.label === 'string' ? e.label.slice(0, MAX_EDGE_LABEL_LENGTH) : undefined

    validEdges.push({
      id: edgeId,
      from,
      to,
      ...(fromSide ? { fromSide } : {}),
      ...(toSide ? { toSide } : {}),
      ...(label ? { label } : {}),
      arrow,
    })
  }

  return {
    content: {
      version: 1,
      nodes: validNodes,
      edges: validEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    report,
  }
}
