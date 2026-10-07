import type { LearningCanvasWithId, LearningCanvasRefType } from '../types'

export type GraphNodeType = 'note' | 'learning' | 'module' | 'quiz' | 'link'

export interface GraphNode {
  id: string
  rawId: string
  type: GraphNodeType
  title: string
  classId: string
  className: string
  description?: string
  content?: string
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
  showOrphans?: boolean
  includeClassItems?: boolean
  includedNodeIds?: Set<string> | null
}

export function buildLearningGraph({
  canvases,
  classes,
  moduleTitles = {},
  quizTitles = {},
  selectedClassId,
  allowedTypes,
  searchQuery,
  showOrphans = true,
  includeClassItems = true,
  includedNodeIds,
}: BuildGraphOptions): GraphData {
  const classMap = new Map<string, string>(classes.map((c) => [c.id, c.name]))

  // 1. Filter canvases by selected class if specified
  let filteredCanvases =
    selectedClassId && selectedClassId !== 'all'
      ? canvases.filter((c) => c.classId === selectedClassId)
      : canvases

  if (includedNodeIds) {
    filteredCanvases = filteredCanvases.filter((c) => {
      const isNote = c.sourceCanvasId === 'note'
      const id = `${isNote ? 'note' : 'learning'}:${c.id}`
      return includedNodeIds.has(id)
    })
  }

  const nodeMap = new Map<string, GraphNode>()
  const rawLinks: Array<{ source: string; target: string }> = []

  // 2. Add canvas & note nodes
  for (const c of filteredCanvases) {
    const isNote = c.sourceCanvasId === 'note'
    const type: GraphNodeType = isNote ? 'note' : 'learning'
    const id = `${type}:${c.id}`

    nodeMap.set(id, {
      id,
      rawId: c.id,
      type,
      title: c.title,
      classId: c.classId,
      className: classMap.get(c.classId) || 'Class',
      description: c.description,
      content: c.description,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: isNote ? 18 : 22,
      degree: 0,
    })

    // Add referenced nodes and links
    if (Array.isArray(c.refs)) {
      for (const ref of c.refs) {
        let refTargetType: GraphNodeType = ref.type as GraphNodeType
        let title = `${ref.type === 'module' ? 'Module' : ref.type === 'quiz' ? 'Quiz' : 'Canvas'}`

        if (ref.type === 'module' && moduleTitles[ref.id]) {
          title = moduleTitles[ref.id]
        } else if (ref.type === 'quiz' && quizTitles[ref.id]) {
          title = quizTitles[ref.id]
        } else if (ref.type === 'learning') {
          const refCanvas = canvases.find((item) => item.id === ref.id)
          if (refCanvas) {
            title = refCanvas.title
            if (refCanvas.sourceCanvasId === 'note') {
              refTargetType = 'note'
            }
          }
        }

        const targetId = `${refTargetType}:${ref.id}`
        // If includedNodeIds is set, only connect and add target if it is in includedNodeIds
        if (!includedNodeIds || includedNodeIds.has(targetId)) {
          rawLinks.push({ source: id, target: targetId })

          if (!nodeMap.has(targetId)) {
            nodeMap.set(targetId, {
              id: targetId,
              rawId: ref.id,
              type: refTargetType,
              title,
              classId: c.classId,
              className: classMap.get(c.classId) || 'Class',
              x: 0,
              y: 0,
              vx: 0,
              vy: 0,
              radius: refTargetType === 'learning' || refTargetType === 'note' ? 18 : 15,
              degree: 0,
            })
          }
        }
      }
    }
  }

  // 3. Optionally include stand-alone class modules and quizzes as discoverable nodes
  if (includeClassItems) {
    const targetClassId = selectedClassId && selectedClassId !== 'all' ? selectedClassId : classes[0]?.id || ''
    const targetClassName = classMap.get(targetClassId) || 'Class'

    for (const [mId, mTitle] of Object.entries(moduleTitles)) {
      const id = `module:${mId}`
      if ((!includedNodeIds || includedNodeIds.has(id)) && !nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          rawId: mId,
          type: 'module',
          title: mTitle,
          classId: targetClassId,
          className: targetClassName,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          radius: 16,
          degree: 0,
        })
      }
    }

    for (const [qId, qTitle] of Object.entries(quizTitles)) {
      const id = `quiz:${qId}`
      if ((!includedNodeIds || includedNodeIds.has(id)) && !nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          rawId: qId,
          type: 'quiz',
          title: qTitle,
          classId: targetClassId,
          className: targetClassName,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          radius: 16,
          degree: 0,
        })
      }
    }
  }

  // 4. Filter by allowed types if provided
  let activeNodes = Array.from(nodeMap.values())
  if (allowedTypes && allowedTypes.size > 0) {
    activeNodes = activeNodes.filter((n) => allowedTypes.has(n.type))
  }

  const activeNodeIds = new Set(activeNodes.map((n) => n.id))

  // 5. Filter links whose endpoints both exist in activeNodes
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

  // 6. Calculate degree
  const degreeMap = new Map<string, number>()
  for (const l of validLinks) {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1)
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1)
  }

  activeNodes.forEach((n) => {
    n.degree = degreeMap.get(n.id) || 0
  })

  // 7. Filter orphans if disabled
  if (!showOrphans) {
    activeNodes = activeNodes.filter((n) => n.degree > 0)
  }

  const query = (searchQuery || '').trim().toLowerCase()

  // 8. Layout initial positions circularly
  const total = activeNodes.length
  const angleStep = (2 * Math.PI) / (total || 1)
  const initialRadius = Math.min(320, 60 + total * 16)

  activeNodes.forEach((node, i) => {
    node.radius = Math.min(32, (node.type === 'learning' || node.type === 'note' ? 18 : 14) + node.degree * 2)

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
