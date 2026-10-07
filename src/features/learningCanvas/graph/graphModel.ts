import type { LearningCanvasWithId, LearningCanvasRefType } from '../types'

export type GraphNodeType = LearningCanvasRefType

export interface GraphNode {
  id: string
  rawId: string
  type: GraphNodeType
  title: string
  classId: string
  className: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  degree: number
  isHighlighted?: boolean
}

export interface GraphLink {
  id: string
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface BuildGraphOptions {
  canvases: LearningCanvasWithId[]
  classes: Array<{ id: string; name: string }>
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
  selectedClassId?: string
  allowedTypes?: Set<GraphNodeType>
  searchQuery?: string
}

export function buildLearningGraph({
  canvases,
  classes,
  moduleTitles = {},
  quizTitles = {},
  selectedClassId,
  allowedTypes,
  searchQuery,
}: BuildGraphOptions): GraphData {
  const classMap = new Map<string, string>(classes.map((c) => [c.id, c.name]))

  // 1. Filter canvases by selected class if specified
  const filteredCanvases = selectedClassId && selectedClassId !== 'all'
    ? canvases.filter((c) => c.classId === selectedClassId)
    : canvases

  const nodeMap = new Map<string, GraphNode>()
  const rawLinks: Array<{ source: string; target: string }> = []

  // 2. Add canvas nodes
  for (const c of filteredCanvases) {
    const id = `learning:${c.id}`
    nodeMap.set(id, {
      id,
      rawId: c.id,
      type: 'learning',
      title: c.title,
      classId: c.classId,
      className: classMap.get(c.classId) || 'Class',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 20,
      degree: 0,
    })

    // Add referenced nodes and links
    if (Array.isArray(c.refs)) {
      for (const ref of c.refs) {
        const targetId = `${ref.type}:${ref.id}`
        rawLinks.push({ source: id, target: targetId })

        if (!nodeMap.has(targetId)) {
          let title = `${ref.type === 'module' ? 'Module' : ref.type === 'quiz' ? 'Quiz' : 'Canvas'}`
          if (ref.type === 'module' && moduleTitles[ref.id]) {
            title = moduleTitles[ref.id]
          } else if (ref.type === 'quiz' && quizTitles[ref.id]) {
            title = quizTitles[ref.id]
          } else if (ref.type === 'learning') {
            const refCanvas = canvases.find((item) => item.id === ref.id)
            if (refCanvas) title = refCanvas.title
          }

          nodeMap.set(targetId, {
            id: targetId,
            rawId: ref.id,
            type: ref.type,
            title,
            classId: c.classId,
            className: classMap.get(c.classId) || 'Class',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            radius: ref.type === 'learning' ? 18 : 15,
            degree: 0,
          })
        }
      }
    }
  }

  // 3. Filter by allowed types if provided
  let activeNodes = Array.from(nodeMap.values())
  if (allowedTypes && allowedTypes.size > 0) {
    activeNodes = activeNodes.filter((n) => allowedTypes.has(n.type))
  }

  const activeNodeIds = new Set(activeNodes.map((n) => n.id))

  // 4. Filter links whose endpoints both exist in activeNodes
  const validLinks: GraphLink[] = []
  const linkKeySet = new Set<string>()

  for (const l of rawLinks) {
    if (activeNodeIds.has(l.source) && activeNodeIds.has(l.target) && l.source !== l.target) {
      const key = `${l.source}->${l.target}`
      if (!linkKeySet.has(key)) {
        linkKeySet.add(key)
        validLinks.push({ id: key, source: l.source, target: l.target })
      }
    }
  }

  // 5. Calculate degree and adjust radius
  const degreeMap = new Map<string, number>()
  for (const l of validLinks) {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1)
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1)
  }

  const query = (searchQuery || '').trim().toLowerCase()

  // 6. Layout initial positions circularly
  const total = activeNodes.length
  const angleStep = (2 * Math.PI) / (total || 1)
  const initialRadius = Math.min(300, 60 + total * 15)

  activeNodes.forEach((node, i) => {
    const deg = degreeMap.get(node.id) || 0
    node.degree = deg
    node.radius = Math.min(30, (node.type === 'learning' ? 18 : 14) + deg * 2)

    // Position around center with slight perturbation to avoid zero-distance singularity
    const angle = i * angleStep
    const r = initialRadius + ((i % 3) - 1) * 30
    node.x = Math.cos(angle) * r
    node.y = Math.sin(angle) * r

    if (query) {
      node.isHighlighted = node.title.toLowerCase().includes(query)
    } else {
      node.isHighlighted = true
    }
  })

  return {
    nodes: activeNodes,
    links: validLinks,
  }
}
