import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  BookOpen,
  HelpCircle,
  Layout,
  ExternalLink,
  X,
  SlidersHorizontal,
  Orbit,
  ChevronRight,
  Plus,
  FileText,
  Edit3,
  Save,
  Link2,
  Unlink,
  FolderInput,
  MinusCircle,
  Cable,
  Undo2,
  Sparkles,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { useToast } from '../../../shared/ui/useToast'
import {
  buildLearningGraph,
  type GraphNode,
  type GraphNodeType,
  type GraphData,
} from '../graph/graphModel'
import { stepSimulation, type SimulationParams } from '../graph/simulation'
import { buildReferencePath, type CanvasViewerRole } from '../referenceRoutes'
import type { LearningCanvasWithId } from '../types'
import { AddNodeDialog } from './AddNodeDialog'
import { ImportExistingDialog } from './ImportExistingDialog'
import '../graph/graphView.css'

/* ── SVG icon paths (lucide-compatible 24×24 viewBox) ── */
const ICON_PATHS: Record<GraphNodeType, string> = {
  note:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  learning:
    'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z',
  module:
    'M2 3h6a4 4 0 0 1 4 4 4 4 0 0 1 4-4h6v18h-6a4 4 0 0 0-4 4 4 4 0 0 0-4-4H2V3Z',
  quiz:
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm0-14a1 1 0 0 0-1 1v1a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1Zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  link:
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
}

const TYPE_LABELS: Record<GraphNodeType, string> = {
  note: 'Note',
  learning: 'Canvas',
  module: 'Module',
  quiz: 'Quiz',
  link: 'Link',
}

const TYPE_ICONS: Record<GraphNodeType, React.ComponentType<{ size?: number; className?: string }>> = {
  note: FileText,
  learning: Layout,
  module: BookOpen,
  quiz: HelpCircle,
  link: ExternalLink,
}

/** Saved/dragged node coordinates beyond this are treated as corrupt (graph units). */
const MAX_NODE_COORD = 1500

function sanitizePositions<T extends Record<string, { x: number; y: number; isFixed?: boolean }>>(
  positions: T,
): T {
  const out: Record<string, { x: number; y: number; isFixed?: boolean }> = {}
  for (const [id, p] of Object.entries(positions)) {
    if (
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) <= MAX_NODE_COORD &&
      Math.abs(p.y) <= MAX_NODE_COORD
    ) {
      out[id] = p
    }
  }
  return out as T
}

interface LearningGraphViewProps {
  canvases: LearningCanvasWithId[]
  classes: Array<{ id: string; name: string }>
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
  selectedClassId?: string
  role: CanvasViewerRole
  onSwitchToCanvases?: () => void
  onCreateNote?: (data: { classId: string; title: string; content: string }) => Promise<string | void>
  onCreateCanvas?: (data: { classId: string; title: string; description: string }) => Promise<string | void>
  onUpdateNoteContent?: (canvasId: string, classId: string, content: string) => Promise<void>
  onConnectNodes?: (sourceId: string, targetId: string, classId: string) => Promise<void>
  onDisconnectNodes?: (sourceId: string, targetId: string, classId: string) => Promise<void>
}

export function LearningGraphView({
  canvases,
  classes,
  moduleTitles = {},
  quizTitles = {},
  selectedClassId,
  role,
  onSwitchToCanvases,
  onCreateNote,
  onCreateCanvas,
  onUpdateNoteContent,
  onConnectNodes,
  onDisconnectNodes,
}: LearningGraphViewProps) {
  const { showToast } = useToast()

  /* ── Search & filter state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [allowedTypes, setAllowedTypes] = useState<Set<GraphNodeType>>(
    new Set(['note', 'learning', 'module', 'quiz']),
  )

  /* ── Storage & Included Nodes (Custom Graph View + Positions) ── */
  const storageKey = `peerly:graph_nodes_${role}_${selectedClassId || 'all'}`

  type StoredPositions = Record<string, { x: number; y: number; isFixed?: boolean }>

  const loadFromStorage = useCallback((): { ids: Set<string>; positions: StoredPositions } => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return { ids: new Set<string>(parsed), positions: {} }
        }
        if (parsed && typeof parsed === 'object') {
          const ids = Array.isArray(parsed.nodeIds) ? new Set<string>(parsed.nodeIds) : new Set<string>()
          const positions = sanitizePositions(
            parsed.positions && typeof parsed.positions === 'object' ? (parsed.positions as StoredPositions) : {},
          )
          return { ids, positions }
        }
      }
    } catch {
      // ignore
    }
    return { ids: new Set<string>(), positions: {} }
  }, [storageKey])

  /* ── Unsaved draft (auto-saved per browser session) ──
     Survives switching tabs / refreshing; "Save graph" commits it to localStorage,
     "Discard" drops it. */
  const storageKeyRef = useRef(storageKey)

  const loadDraft = useCallback((): { ids: Set<string>; positions: StoredPositions } | null => {
    try {
      const raw = sessionStorage.getItem(`${storageKey}:draft`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodeIds)) return null
      const positions = sanitizePositions(
        parsed.positions && typeof parsed.positions === 'object' ? (parsed.positions as StoredPositions) : {},
      )
      return { ids: new Set<string>(parsed.nodeIds), positions }
    } catch {
      return null
    }
  }, [storageKey])

  /** Last on-screen positions of every node (pinned or not), so a remount doesn't re-run the layout from scratch. */
  const loadLayout = useCallback((): StoredPositions => {
    try {
      const raw = sessionStorage.getItem(`${storageKey}:layout`)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? sanitizePositions(parsed as StoredPositions) : {}
    } catch {
      return {}
    }
  }, [storageKey])

  const [savedNodeIds, setSavedNodeIds] = useState<Set<string>>(() => loadFromStorage().ids)
  const [includedNodeIds, setIncludedNodeIds] = useState<Set<string>>(
    () => (loadDraft() ?? loadFromStorage()).ids,
  )
  const [savedPositions, setSavedPositions] = useState<StoredPositions>(() => loadFromStorage().positions)
  const [currentPositions, setCurrentPositions] = useState<StoredPositions>(
    () => (loadDraft() ?? loadFromStorage()).positions,
  )

  // Sync on class/role switch
  useEffect(() => {
    storageKeyRef.current = storageKey
    const loaded = loadFromStorage()
    const working = loadDraft() ?? loaded
    setSavedNodeIds(loaded.ids)
    setIncludedNodeIds(working.ids)
    setSavedPositions(loaded.positions)
    setCurrentPositions(working.positions)
  }, [storageKey, loadFromStorage, loadDraft])

  // Dirty tracking (nodes added/removed OR positions moved)
  const isDirty = useMemo(() => {
    if (includedNodeIds.size !== savedNodeIds.size) return true
    for (const id of includedNodeIds) {
      if (!savedNodeIds.has(id)) return true
    }
    const currKeys = Object.keys(currentPositions)
    const savedKeys = Object.keys(savedPositions)
    if (currKeys.length !== savedKeys.length) return true
    for (const k of currKeys) {
      const cp = currentPositions[k]
      const sp = savedPositions[k]
      if (!sp || cp.x !== sp.x || cp.y !== sp.y) return true
    }
    return false
  }, [includedNodeIds, savedNodeIds, currentPositions, savedPositions])

  // Auto-save the unsaved work as a draft; clear it once it matches the saved graph.
  useEffect(() => {
    const draftKey = `${storageKeyRef.current}:draft`
    try {
      if (isDirty) {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            nodeIds: Array.from(includedNodeIds),
            positions: currentPositions,
          }),
        )
      } else {
        sessionStorage.removeItem(draftKey)
      }
    } catch {
      // ignore (storage unavailable)
    }
  }, [isDirty, includedNodeIds, currentPositions])

  const handleSaveGraph = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          nodeIds: Array.from(includedNodeIds),
          positions: currentPositions,
        }),
      )
    } catch {
      // ignore
    }
    setSavedNodeIds(new Set(includedNodeIds))
    setSavedPositions({ ...currentPositions })
    showToast('success', 'Graph layout and nodes saved.')
  }

  const handleDiscardGraph = () => {
    setIncludedNodeIds(new Set(savedNodeIds))
    setCurrentPositions({ ...savedPositions })
    // Re-apply saved positions to nodes
    nodesRef.current.forEach((n) => {
      const savedPos = savedPositions[n.id]
      if (savedPos) {
        n.x = savedPos.x
        n.y = savedPos.y
        n.fx = savedPos.x
        n.fy = savedPos.y
        n.isFixed = true
      } else {
        n.isFixed = false
        n.fx = undefined
        n.fy = undefined
      }
      n.vx = 0
      n.vy = 0
    })
    setGraphData({ nodes: [...nodesRef.current], links: [...linksRef.current] })
    showToast('success', 'Changes discarded.')
  }

  const handleAutoArrange = () => {
    setCurrentPositions({})
    nodesRef.current.forEach((n) => {
      n.isFixed = false
      n.fx = undefined
      n.fy = undefined
      n.vx = 0
      n.vy = 0
    })
    alphaRef.current = 1.0
    showToast('info', 'Graph layout relaxed.')
  }

  /* ── Dialog States ── */
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [confirmNewGraphOpen, setConfirmNewGraphOpen] = useState(false)

  /* ── Note inline edit ── */
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  /* ── Linking state ── */
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linkingBusy, setLinkingBusy] = useState(false)

  /* ── Connect mode (click-to-connect) ── */
  const [connectMode, setConnectMode] = useState(false)
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null)

  /* ── Force controls panel ── */
  const [showForcePanel, setShowForcePanel] = useState(false)
  const [forceParams, setForceParams] = useState<SimulationParams>({
    repulsion: 3000,
    springLength: 100,
    centerStrength: 0.02,
  })

  /* ── Zoom & pan ── */
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  /* ── Node dragging ── */
  const draggedNodeRef = useRef<GraphNode | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)

  /* ── Simulation ── */
  const [graphData, setGraphData] = useState<GraphData>(() =>
    buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId,
      allowedTypes,
      searchQuery: '',
      includedNodeIds,
      customPositions: { ...loadLayout(), ...currentPositions },
    }),
  )

  const nodesRef = useRef<GraphNode[]>(graphData.nodes)
  const linksRef = useRef(graphData.links)
  const alphaRef = useRef(1.0)
  const animFrameRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isInitialMountRef = useRef(true)

  // On leaving the graph view, remember where every node ended up.
  useEffect(() => {
    return () => {
      try {
        const layout: StoredPositions = {}
        for (const n of nodesRef.current) {
          if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
            layout[n.id] = { x: Math.round(n.x), y: Math.round(n.y), isFixed: false }
          }
        }
        sessionStorage.setItem(`${storageKeyRef.current}:layout`, JSON.stringify(layout))
      } catch {
        // ignore
      }
    }
  }, [])

  // Sync draft text on selectedNode change
  useEffect(() => {
    setIsEditingNote(false)
    setNoteDraft(selectedNode?.content || selectedNode?.description || '')
    setLinkTargetId('')
  }, [selectedNode])

  /* ── Handlers for New Graph & Import ── */
  const handleNewGraphView = () => {
    if (includedNodeIds.size > 0 || graphData.nodes.length > 0) {
      setConfirmNewGraphOpen(true)
    } else {
      setAddDialogOpen(true)
    }
  }

  const handleConfirmNewGraph = () => {
    setIncludedNodeIds(new Set())
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelectedNode(null)
    setConfirmNewGraphOpen(false)
    showToast('success', 'Created fresh knowledge graph view.')
  }

  const handleImportItems = (newIds: string[]) => {
    setIncludedNodeIds((prev) => {
      const next = new Set(prev)
      newIds.forEach((id) => next.add(id))
      return next
    })
    showToast('success', `Imported ${newIds.length} materials into knowledge graph.`)
  }

  const handleNodeCreated = (type: 'note' | 'learning', id: string) => {
    setIncludedNodeIds((prev) => new Set([...prev, `${type}:${id}`]))
  }

  const handleRemoveFromGraph = (nodeId: string) => {
    setIncludedNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
    setSelectedNode(null)
    showToast('success', 'Removed from graph view.')
  }

  /* ── Rebuild graph on data changes ── */
  useEffect(() => {
    const fresh = buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId,
      allowedTypes,
      searchQuery,
      includedNodeIds,
      customPositions: currentPositions,
    })

    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]))
    fresh.nodes.forEach((n) => {
      const prev = prevMap.get(n.id)
      if (prev) {
        if (prev.isFixed) {
          n.x = prev.x
          n.y = prev.y
          n.isFixed = true
          n.fx = prev.fx ?? prev.x
          n.fy = prev.fy ?? prev.y
        } else if (!n.isFixed) {
          // Keep the live position, but never overwrite a saved (pinned) one.
          n.x = prev.x
          n.y = prev.y
        }
      }
    })

    nodesRef.current = fresh.nodes
    linksRef.current = fresh.links
    setGraphData(fresh)
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      alphaRef.current = 0.5
    }

    // Keep selectedNode reference fresh
    setSelectedNode((prev) => (prev ? fresh.nodes.find((n) => n.id === prev.id) || null : null))
  }, [
    canvases,
    classes,
    moduleTitles,
    quizTitles,
    selectedClassId,
    allowedTypes,
    searchQuery,
    includedNodeIds,
    currentPositions,
  ])

  /* ── Simulation animation loop ── */
  useEffect(() => {
    let active = true

    const loop = () => {
      if (!active) return

      if (alphaRef.current > 0.005) {
        const kineticEnergy = stepSimulation(
          nodesRef.current,
          linksRef.current,
          forceParams,
        )

        alphaRef.current *= 0.985
        if (kineticEnergy < 0.01) {
          alphaRef.current = 0
        }

        setGraphData({
          nodes: [...nodesRef.current],
          links: [...linksRef.current],
        })
      }

      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      active = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [forceParams])

  /* ── Highlighted links / nodes based on hover/selection ── */
  const activeFocusNodeId = hoveredNodeId || selectedNode?.id || null

  const highlightedLinkIds = useMemo(() => {
    if (!activeFocusNodeId) return null
    const set = new Set<string>()
    for (const link of graphData.links) {
      if (link.source === activeFocusNodeId || link.target === activeFocusNodeId) {
        set.add(link.id)
      }
    }
    return set
  }, [activeFocusNodeId, graphData.links])

  const neighborNodes = useMemo(() => {
    if (!selectedNode) return []
    const neighbors: GraphNode[] = []
    const neighborIds = new Set<string>()

    for (const link of graphData.links) {
      if (link.source === selectedNode.id) neighborIds.add(link.target)
      if (link.target === selectedNode.id) neighborIds.add(link.source)
    }

    const nMap = new Map(graphData.nodes.map((n) => [n.id, n]))
    for (const nid of neighborIds) {
      const found = nMap.get(nid)
      if (found) neighbors.push(found)
    }
    return neighbors
  }, [selectedNode, graphData])

  /* ── Candidates to link to ── */
  const unlinkedCandidates = useMemo(() => {
    if (!selectedNode) return []
    const neighborIdSet = new Set(neighborNodes.map((n) => n.id))
    neighborIdSet.add(selectedNode.id)
    return graphData.nodes.filter((n) => !neighborIdSet.has(n.id))
  }, [selectedNode, neighborNodes, graphData.nodes])

  /* ── Node map ── */
  const nodeMap = useMemo(
    () => new Map(graphData.nodes.map((n) => [n.id, n])),
    [graphData.nodes],
  )

  /* ── Type counts ── */
  const typeCounts = useMemo(() => {
    let note = 0
    let learning = 0
    let moduleCount = 0
    let quiz = 0
    let link = 0
    for (const n of graphData.nodes) {
      if (n.type === 'note') note++
      else if (n.type === 'learning') learning++
      else if (n.type === 'module') moduleCount++
      else if (n.type === 'quiz') quiz++
      else if (n.type === 'link') link++
    }
    return { note, learning, module: moduleCount, quiz, link }
  }, [graphData.nodes])

  /* ── Build Bézier control point for curved edges ── */
  const buildCurvePath = useCallback(
    (sx: number, sy: number, tx: number, ty: number): string => {
      const dx = tx - sx
      const dy = ty - sy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const curvature = Math.min(dist * 0.15, 40)
      const nx = -dy / dist
      const ny = dx / dist
      const cx = (sx + tx) / 2 + nx * curvature
      const cy = (sy + ty) / 2 + ny * curvature
      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
    },
    [],
  )

  /* ── Interaction handlers ── */
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'rect') {
      return
    }
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    setSelectedNode(null)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedNodeRef.current) {
      if (!dragMovedRef.current) {
        const moved = Math.hypot(
          e.clientX - dragStartRef.current.x,
          e.clientY - dragStartRef.current.y,
        )
        if (moved < 4) return
        dragMovedRef.current = true
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const svgCenterX = rect.width / 2
      const svgCenterY = rect.height / 2
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const clamp = (v: number) => Math.max(-MAX_NODE_COORD, Math.min(MAX_NODE_COORD, v))
      const targetX = clamp(Math.round((mouseX - svgCenterX - pan.x) / zoom))
      const targetY = clamp(Math.round((mouseY - svgCenterY - pan.y) / zoom))

      draggedNodeRef.current.x = targetX
      draggedNodeRef.current.y = targetY
      draggedNodeRef.current.fx = targetX
      draggedNodeRef.current.fy = targetY
      draggedNodeRef.current.isFixed = true
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      setGraphData({ nodes: [...nodesRef.current], links: [...linksRef.current] })
      return
    }

    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    }
  }

  const handlePointerUp = () => {
    isPanningRef.current = false
    if (draggedNodeRef.current && !dragMovedRef.current) {
      // Plain click: select only, do not pin or save a position.
      draggedNodeRef.current = null
    }
    if (draggedNodeRef.current) {
      dragMovedRef.current = false
      const node = draggedNodeRef.current
      node.isFixed = true
      node.fx = node.x
      node.fy = node.y
      node.vx = 0
      node.vy = 0
      setCurrentPositions((prev) => ({
        ...prev,
        [node.id]: { x: Math.round(node.x), y: Math.round(node.y), isFixed: true },
      }))
      draggedNodeRef.current = null
    }
  }

  useEffect(() => {
    const handleGlobalRelease = () => {
      isPanningRef.current = false
      if (draggedNodeRef.current && !dragMovedRef.current) {
        draggedNodeRef.current = null
      }
      if (draggedNodeRef.current) {
        dragMovedRef.current = false
        const node = draggedNodeRef.current
        node.isFixed = true
        node.fx = node.x
        node.fy = node.y
        node.vx = 0
        node.vy = 0
        setCurrentPositions((prev) => ({
          ...prev,
          [node.id]: { x: Math.round(node.x), y: Math.round(node.y), isFixed: true },
        }))
        draggedNodeRef.current = null
      }
    }
    window.addEventListener('pointerup', handleGlobalRelease)
    window.addEventListener('pointercancel', handleGlobalRelease)
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease)
      window.removeEventListener('pointercancel', handleGlobalRelease)
    }
  }, [])

  /* ── Native wheel handler to prevent page scroll ── */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
      setZoom((z) => Math.max(0.2, Math.min(3, z * zoomFactor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleResetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    alphaRef.current = 0.8
  }

  const toggleType = (t: GraphNodeType) => {
    setAllowedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) {
        if (next.size > 1) next.delete(t)
      } else {
        next.add(t)
      }
      return next
    })
  }

  /* ── Save note inline edit ── */
  const handleSaveNote = async () => {
    if (!selectedNode || !onUpdateNoteContent) return
    setSavingNote(true)
    try {
      await onUpdateNoteContent(selectedNode.rawId, selectedNode.classId, noteDraft)
      setIsEditingNote(false)
      selectedNode.content = noteDraft
      selectedNode.description = noteDraft.slice(0, 300)
    } finally {
      setSavingNote(false)
    }
  }

  /* ── Connect node (from inspector dropdown) ── */
  const handleConnect = async () => {
    if (!selectedNode || !linkTargetId || !onConnectNodes) return
    setLinkingBusy(true)
    try {
      await onConnectNodes(selectedNode.id, linkTargetId, selectedNode.classId)
      setLinkTargetId('')
    } finally {
      setLinkingBusy(false)
    }
  }

  /* ── Click-to-connect in connect mode ── */
  const handleConnectModeClick = async (node: GraphNode) => {
    if (!onConnectNodes) return
    if (!connectSourceId) {
      setConnectSourceId(node.id)
      setSelectedNode(node)
      showToast('info', `Selected "${node.title}" — now click the target node to connect.`)
      return
    }
    if (connectSourceId === node.id) {
      setConnectSourceId(null)
      showToast('info', 'Source deselected.')
      return
    }
    // Connect source → target
    const sourceNode = nodesRef.current.find((n) => n.id === connectSourceId)
    const classId = sourceNode?.classId || node.classId
    setLinkingBusy(true)
    try {
      await onConnectNodes(connectSourceId, node.id, classId)
      showToast('success', `Connected "${sourceNode?.title || 'Node'}" → "${node.title}".`)
      setConnectSourceId(null)
    } catch {
      showToast('error', 'Failed to create connection.')
    } finally {
      setLinkingBusy(false)
    }
  }

  /* ── Disconnect node ── */
  const handleDisconnect = async (neighborId: string) => {
    if (!selectedNode || !onDisconnectNodes) return
    setLinkingBusy(true)
    try {
      await onDisconnectNodes(selectedNode.id, neighborId, selectedNode.classId)
    } finally {
      setLinkingBusy(false)
    }
  }

  /* ── Minimap bounds ── */
  const minimapBounds = useMemo(() => {
    if (graphData.nodes.length === 0) return null
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const n of graphData.nodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
    const pad = 60
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    }
  }, [graphData.nodes])

  /* ── SVG dimensions for centering & transform ── */
  const [dimensions, setDimensions] = useState({ w: 800, h: 620 })

  useEffect(() => {
    const el = svgRef.current || containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setDimensions({ w: rect.width || 800, h: rect.height || 620 })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Filter classes ── */
  const filterActiveClass = (type: GraphNodeType) => {
    if (!allowedTypes.has(type)) return 'graph-view__filter'
    if (type === 'note') return 'graph-view__filter graph-view__filter--active-note'
    if (type === 'learning') return 'graph-view__filter graph-view__filter--active'
    if (type === 'module') return 'graph-view__filter graph-view__filter--active-module'
    return 'graph-view__filter graph-view__filter--active-quiz'
  }

  const hasAddCapabilities = Boolean(onCreateNote || onCreateCanvas)

  return (
    <div className="graph-view" ref={containerRef}>
      {/* ── Toolbar ── */}
      <div className="graph-view__toolbar">
        {/* Search */}
        <div className="graph-view__search">
          <Search size={16} className="graph-view__search-icon" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge graph…"
            className="graph-view__search-input"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="graph-view__search-clear"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-1.5" role="toolbar" aria-label="Node type filters">
          <button
            type="button"
            onClick={() => toggleType('note')}
            className={filterActiveClass('note')}
          >
            <FileText size={13} />
            Notes ({typeCounts.note})
          </button>
          <button
            type="button"
            onClick={() => toggleType('learning')}
            className={filterActiveClass('learning')}
          >
            <Layout size={13} />
            Canvases ({typeCounts.learning})
          </button>
          <button
            type="button"
            onClick={() => toggleType('module')}
            className={filterActiveClass('module')}
          >
            <BookOpen size={13} />
            Modules ({typeCounts.module})
          </button>
          <button
            type="button"
            onClick={() => toggleType('quiz')}
            className={filterActiveClass('quiz')}
          >
            <HelpCircle size={13} />
            Quizzes ({typeCounts.quiz})
          </button>
        </div>

        {/* View controls & Add Button */}
        <div className="graph-view__zoom-controls flex items-center">
          <Button
            type="button"
            variant="secondary"
            onClick={handleNewGraphView}
            className="py-1 px-2.5 text-xs min-h-8 gap-1.5 mr-1"
            title="Create new blank graph view"
          >
            <Plus size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Create new graph view</span>
            <span className="sm:hidden">New graph</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setImportDialogOpen(true)}
            className="py-1 px-2.5 text-xs min-h-8 gap-1.5 mr-1.5"
            title="Import existing modules and canvases from my class"
          >
            <FolderInput size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Import from class</span>
            <span className="sm:hidden">Import</span>
          </Button>

          {hasAddCapabilities && (
            <Button
              type="button"
              variant="primary"
              onClick={() => setAddDialogOpen(true)}
              className="py-1 px-2.5 text-xs min-h-8 gap-1 mr-1.5"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Add Node</span>
            </Button>
          )}

          {/* Connect Mode toggle */}
          {onConnectNodes && graphData.nodes.length >= 2 && (
            <button
              type="button"
              className={`graph-view__zoom-btn ${connectMode ? 'graph-view__zoom-btn--active' : ''}`}
              onClick={() => {
                setConnectMode((m) => !m)
                setConnectSourceId(null)
              }}
              aria-label="Toggle connect mode"
              aria-pressed={connectMode}
              title={connectMode ? 'Exit connect mode' : 'Connect mode — click two nodes to link them'}
            >
              <Cable size={16} />
            </button>
          )}

          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={() => setShowForcePanel((s) => !s)}
            aria-label="Toggle force controls"
            aria-pressed={showForcePanel}
          >
            <SlidersHorizontal size={16} />
          </button>
          <span className="graph-view__zoom-badge">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={handleResetView}
            aria-label="Reset view"
            title="Center and reset zoom"
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={handleAutoArrange}
            aria-label="Auto-arrange layout"
            title="Auto-arrange layout (relax node positions)"
          >
            <Sparkles size={16} />
          </button>
        </div>
      </div>

      {/* ── Force controls panel ── */}
      {showForcePanel && (
        <div className="graph-view__force-panel">
          <p className="graph-view__force-panel-title">Force Controls</p>
          <div className="graph-view__force-row">
            <span className="graph-view__force-label">Repulsion</span>
            <input
              type="range"
              min={500}
              max={8000}
              step={100}
              value={forceParams.repulsion ?? 3000}
              onChange={(e) => {
                setForceParams((p) => ({ ...p, repulsion: Number(e.target.value) }))
                alphaRef.current = 0.8
              }}
              className="graph-view__force-slider"
              aria-label="Repulsion force"
            />
          </div>
          <div className="graph-view__force-row">
            <span className="graph-view__force-label">Link distance</span>
            <input
              type="range"
              min={30}
              max={300}
              step={5}
              value={forceParams.springLength ?? 100}
              onChange={(e) => {
                setForceParams((p) => ({ ...p, springLength: Number(e.target.value) }))
                alphaRef.current = 0.8
              }}
              className="graph-view__force-slider"
              aria-label="Link distance"
            />
          </div>
          <div className="graph-view__force-row">
            <span className="graph-view__force-label">Center pull</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round((forceParams.centerStrength ?? 0.02) * 1000)}
              onChange={(e) => {
                setForceParams((p) => ({
                  ...p,
                  centerStrength: Number(e.target.value) / 1000,
                }))
                alphaRef.current = 0.8
              }}
              className="graph-view__force-slider"
              aria-label="Center gravity"
            />
          </div>
        </div>
      )}

      {/* ── SVG Canvas ── */}
      {graphData.nodes.length === 0 ? (
        <div className="graph-view__empty">
          <div className="graph-view__empty-icon">
            <Orbit size={24} />
          </div>
          <h3 className="text-base font-bold text-navy-900 m-0 mb-1">
            Start Your Knowledge Graph
          </h3>
          <p className="text-sm text-navy-800-72 max-w-md m-0 mb-5">
            Your graph view begins as a clean canvas. Create fresh concept notes to map out ideas,
            or import existing modules and whiteboard canvases from your class.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button
              type="button"
              variant="primary"
              onClick={handleNewGraphView}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Create new graph view</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportDialogOpen(true)}
            >
              <FolderInput size={16} aria-hidden="true" />
              <span>Import existing modules and canvases</span>
            </Button>
            {onSwitchToCanvases && (
              <Button
                type="button"
                variant="ghost"
                onClick={onSwitchToCanvases}
              >
                <span>Go to Canvases</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className={`graph-view__svg ${connectMode ? 'graph-view__svg--connect-mode' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Background dot grid */}
          <defs>
            <pattern id="graph-grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="0.8" className="graph-view__grid-dot" />
            </pattern>
            {/* Glow filter for nodes */}
            <filter id="graph-node-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Arrow marker for directed edges */}
            <marker
              id="graph-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-navy-800)" opacity="0.5" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid-dots)" />

          {/* Transform group – uses viewBox-relative coords */}
          <g
            transform={`translate(${dimensions.w / 2 + pan.x}, ${dimensions.h / 2 + pan.y}) scale(${zoom})`}
          >
            {/* ── Edges (curved) ── */}
            <g aria-hidden="true">
              {graphData.links.map((link) => {
                const source = nodeMap.get(link.source)
                const target = nodeMap.get(link.target)
                if (!source || !target) return null

                const isHighlighted =
                  highlightedLinkIds === null || highlightedLinkIds.has(link.id)
                const isDimmed = highlightedLinkIds !== null && !highlightedLinkIds.has(link.id)

                const edgeClass = isDimmed
                  ? 'graph-view__edge graph-view__edge--dimmed'
                  : isHighlighted && highlightedLinkIds !== null
                    ? 'graph-view__edge graph-view__edge--highlighted'
                    : 'graph-view__edge graph-view__edge--default'

                const pathD = buildCurvePath(source.x, source.y, target.x, target.y)

                return (
                  <g key={link.id}>
                    <path
                      id={`path-${link.id}`}
                      d={pathD}
                      className={edgeClass}
                      markerEnd="url(#graph-arrow)"
                    />
                    {isHighlighted && highlightedLinkIds !== null && (
                      <circle
                        r={2.5}
                        className="graph-view__particle graph-view__particle--active"
                      >
                        <animateMotion
                          dur="2.5s"
                          repeatCount="indefinite"
                          path={pathD}
                          rotate="auto"
                        />
                      </circle>
                    )}
                  </g>
                )
              })}
            </g>

            {/* ── Nodes ── */}
            <g>
              {graphData.nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id
                const isHovered = hoveredNodeId === node.id
                const isDimmed =
                  activeFocusNodeId !== null &&
                  node.id !== activeFocusNodeId &&
                  !neighborNodes.some((nbr) => nbr.id === node.id)

                const nodeGroupClass = isDimmed
                  ? 'graph-view__node graph-view__node--dimmed'
                  : isSelected
                    ? 'graph-view__node graph-view__node--selected'
                    : isHovered
                      ? 'graph-view__node graph-view__node--hovered'
                      : 'graph-view__node'

                const circleClass = `graph-view__node-circle graph-view__node-circle--${node.type}`
                const labelClass = isDimmed
                  ? 'graph-view__node-label graph-view__node-label--dimmed'
                  : 'graph-view__node-label'

                const iconPath = ICON_PATHS[node.type]

                return (
                  <g
                    key={node.id}
                    className={`${nodeGroupClass}${connectMode && connectSourceId === node.id ? ' graph-view__node--connect-source' : ''}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (connectMode) {
                        void handleConnectModeClick(node)
                        return
                      }
                      setSelectedNode(node)
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      if (!connectMode) {
                        const liveNode = nodesRef.current.find((n) => n.id === node.id) || node
                        dragStartRef.current = { x: e.clientX, y: e.clientY }
                        dragMovedRef.current = false
                        draggedNodeRef.current = liveNode
                        try {
                          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                        } catch {
                          // ignore
                        }
                      }
                    }}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(null)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${TYPE_LABELS[node.type]}: ${node.title}${connectMode ? ' (click to connect)' : ''}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (connectMode) {
                          void handleConnectModeClick(node)
                          return
                        }
                        setSelectedNode(node)
                      }
                    }}
                  >
                    {/* Radial glow on hover/selected */}
                    <circle
                      r={node.radius + 10}
                      className="graph-view__node-glow"
                      filter="url(#graph-node-glow)"
                    />

                    {/* Concentric selection / focus ring */}
                    <circle
                      r={node.radius + 5}
                      className="graph-view__node-ring"
                    />

                    {/* Node circle */}
                    <circle
                      r={node.radius}
                      className={circleClass}
                    />

                    {/* Inner icon */}
                    {iconPath && (
                      <path
                        d={iconPath}
                        className="graph-view__node-icon"
                        transform={`translate(-6, -6) scale(0.5)`}
                      />
                    )}

                    {/* Node Label */}
                    <text
                      y={node.radius + 14}
                      className={labelClass}
                    >
                      {node.title.length > 24
                        ? `${node.title.slice(0, 22)}…`
                        : node.title}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
      )}

      {/* ── Connect mode banner ── */}
      {connectMode && (
        <div className="graph-view__connect-banner" role="status" aria-live="polite">
          <Cable size={14} aria-hidden="true" />
          <span>
            {connectSourceId
              ? `Source selected — click the target node to connect`
              : `Connect mode active — click a node to select it as source`}
          </span>
          <button
            type="button"
            onClick={() => {
              setConnectMode(false)
              setConnectSourceId(null)
            }}
            className="graph-view__connect-banner-close"
            aria-label="Exit connect mode"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Save / Discard floating bar ── */}
      {isDirty && (
        <div className="graph-view__save-bar">
          <span className="graph-view__save-bar-text">Unsaved changes to your graph view</span>
          <button
            type="button"
            onClick={handleDiscardGraph}
            className="graph-view__save-bar-discard"
          >
            <Undo2 size={14} aria-hidden="true" />
            <span>Discard</span>
          </button>
          <button
            type="button"
            onClick={handleSaveGraph}
            className="graph-view__save-bar-save"
          >
            <Save size={14} aria-hidden="true" />
            <span>Save graph</span>
          </button>
        </div>
      )}

      {/* ── Stats footer ── */}
      <div className="graph-view__stats" aria-live="polite">
        <span>{graphData.nodes.length} nodes</span>
        <span>·</span>
        <span>{graphData.links.length} links</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <span className="graph-view__stats-dot graph-view__stats-dot--note" />
          <span>{typeCounts.note}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="graph-view__stats-dot graph-view__stats-dot--learning" />
          <span>{typeCounts.learning}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="graph-view__stats-dot graph-view__stats-dot--module" />
          <span>{typeCounts.module}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="graph-view__stats-dot graph-view__stats-dot--quiz" />
          <span>{typeCounts.quiz}</span>
        </div>
      </div>

      {/* ── Minimap ── */}
      {minimapBounds && (
        <div
          className={`graph-view__minimap ${
            selectedNode ? 'graph-view__minimap--hidden-by-inspector' : ''
          }`}
          aria-hidden="true"
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`${minimapBounds.x} ${minimapBounds.y} ${minimapBounds.width} ${minimapBounds.height}`}
          >
            {/* Minimap links */}
            {graphData.links.map((link) => {
              const s = nodeMap.get(link.source)
              const t = nodeMap.get(link.target)
              if (!s || !t) return null
              return (
                <line
                  key={`mm-${link.id}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="var(--color-navy-800)"
                  strokeWidth={1}
                  opacity={0.3}
                />
              )
            })}
            {/* Minimap nodes */}
            {graphData.nodes.map((n) => (
              <circle
                key={n.id}
                cx={n.x}
                cy={n.y}
                r={4}
                className={`graph-view__minimap-node graph-view__minimap-node--${n.type}`}
              />
            ))}
            {/* Viewport indicator */}
            <rect
              x={(-pan.x / zoom - dimensions.w / 2 / zoom)}
              y={(-pan.y / zoom - dimensions.h / 2 / zoom)}
              width={dimensions.w / zoom}
              height={dimensions.h / zoom}
              className="graph-view__minimap-viewport"
            />
          </svg>
        </div>
      )}

      {/* ── Inspector drawer (Obsidian-style note reading, editing & linking) ── */}
      {selectedNode && (
        <div className="graph-view__inspector">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-navy-900-08 text-navy-900">
                {(() => {
                  const Icon = TYPE_ICONS[selectedNode.type]
                  return <Icon size={18} />
                })()}
              </span>
              <div>
                <Badge>{TYPE_LABELS[selectedNode.type]}</Badge>
                <div className="text-[11px] text-navy-800-72">{selectedNode.className}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="p-1 text-navy-800 hover:text-navy-900 rounded-lg hover:bg-navy-900-05"
              aria-label="Close details"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title & stats */}
          <div>
            <h4 className="text-sm font-bold text-navy-900 m-0 mb-1">{selectedNode.title}</h4>
            <div className="text-xs text-navy-800-72">
              {selectedNode.degree === 1
                ? '1 connection'
                : `${selectedNode.degree} connections`}
            </div>
          </div>

          {/* Note Content / Markdown viewer & editor */}
          {selectedNode.type === 'note' && (
            <div className="border-t border-navy-900-10 pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-navy-800-72 uppercase tracking-wider">
                  Note Content
                </span>
                {onUpdateNoteContent && !isEditingNote && (
                  <button
                    type="button"
                    onClick={() => setIsEditingNote(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-900 hover:underline"
                  >
                    <Edit3 size={12} />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isEditingNote ? (
                <div className="grid gap-2">
                  <textarea
                    rows={4}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Write markdown notes, definitions, concepts…"
                    className="w-full p-2 text-xs text-navy-900 bg-navy-700-05 border border-navy-900-12 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingNote(false)}
                      className="px-2.5 py-1 text-xs font-semibold text-navy-800 rounded-lg hover:bg-navy-900-05"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveNote()}
                      disabled={savingNote}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-50"
                    >
                      <Save size={12} />
                      <span>{savingNote ? 'Saving…' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-navy-700-05 text-xs text-navy-900 font-sans max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {selectedNode.content || selectedNode.description || 'No notes added yet. Click Edit to write concepts.'}
                </div>
              )}
            </div>
          )}

          {/* Description for non-notes */}
          {selectedNode.type !== 'note' && selectedNode.description && (
            <div className="border-t border-navy-900-10 pt-2 text-xs text-navy-800-72 leading-relaxed">
              {selectedNode.description}
            </div>
          )}

          {/* Connected To Section */}
          <div className="border-t border-navy-900-10 pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-navy-800-72 uppercase tracking-wider">
                Connected to ({neighborNodes.length})
              </span>
            </div>

            {neighborNodes.length > 0 ? (
              <ul className="list-none m-0 p-0 grid gap-1 max-h-28 overflow-y-auto">
                {neighborNodes.map((neighbor) => {
                  const NeighborIcon = TYPE_ICONS[neighbor.type]
                  return (
                    <li key={neighbor.id} className="flex items-center justify-between gap-1 group">
                      <button
                        type="button"
                        className="flex items-center gap-2 flex-1 px-2 py-1 text-xs text-left text-navy-900 rounded-lg hover:bg-navy-900-05 transition-colors truncate"
                        onClick={() => setSelectedNode(neighbor)}
                      >
                        <NeighborIcon size={13} className="shrink-0 text-navy-800" />
                        <span className="truncate font-medium">{neighbor.title}</span>
                      </button>
                      {onDisconnectNodes && (selectedNode.type === 'note' || selectedNode.type === 'learning') && (
                        <button
                          type="button"
                          onClick={() => void handleDisconnect(neighbor.id)}
                          disabled={linkingBusy}
                          className="p-1 text-navy-800-72 hover:text-danger rounded-md hover:bg-navy-900-05 shrink-0"
                          title="Remove link"
                          aria-label={`Unlink ${neighbor.title}`}
                        >
                          <Unlink size={12} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-navy-800-72 m-0 italic">No connections yet.</p>
            )}

            {/* In-Graph Link Creator */}
            {onConnectNodes && (selectedNode.type === 'note' || selectedNode.type === 'learning') && unlinkedCandidates.length > 0 && (
              <div className="mt-2 pt-2 border-t border-navy-900-08 flex items-center gap-1.5">
                <select
                  value={linkTargetId}
                  onChange={(e) => setLinkTargetId(e.target.value)}
                  className="flex-1 p-1 text-[11px] font-semibold text-navy-900 bg-navy-700-05 border border-navy-900-12 rounded-lg truncate focus:outline-none"
                  aria-label="Select node to connect"
                >
                  <option value="">+ Connect to another node…</option>
                  {unlinkedCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({TYPE_LABELS[c.type]})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={!linkTargetId || linkingBusy}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-40 shrink-0"
                >
                  <Link2 size={12} />
                  <span>Link</span>
                </button>
              </div>
            )}
          </div>

          {/* Action to open in full view & remove from graph view */}
          <div className="pt-2 border-t border-navy-900-10 flex flex-col gap-2">
            <Button
              to={buildReferencePath(
                role,
                selectedNode.classId,
                selectedNode.type === 'module'
                  ? 'module'
                  : selectedNode.type === 'quiz'
                    ? 'quiz'
                    : 'learning',
                selectedNode.rawId,
              )}
              variant="primary"
              className="w-full justify-center text-xs"
            >
              <span>{selectedNode.type === 'note' ? 'Open in Whiteboard' : selectedNode.type === 'learning' ? 'Open Canvas' : `Open ${TYPE_LABELS[selectedNode.type]}`}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Button>

            <button
              type="button"
              onClick={() => handleRemoveFromGraph(selectedNode.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-navy-800-72 hover:text-danger hover:bg-feedback-error-bg rounded-xl border border-navy-900-10 transition-colors"
            >
              <MinusCircle size={14} aria-hidden="true" />
              <span>Remove from graph view</span>
            </button>
          </div>
        </div>
      )}

      {/* Import Existing Dialog */}
      <ImportExistingDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        canvases={canvases}
        moduleTitles={moduleTitles}
        quizTitles={quizTitles}
        classes={classes}
        selectedClassId={selectedClassId}
        alreadyIncludedIds={includedNodeIds}
        onImport={handleImportItems}
      />

      {/* Confirm New Graph Dialog */}
      <ConfirmDialog
        open={confirmNewGraphOpen}
        onClose={() => setConfirmNewGraphOpen(false)}
        onConfirm={handleConfirmNewGraph}
        title="Create new graph view?"
        description="Starting a new graph view will reset your canvas to a blank slate so you can build fresh knowledge connections. Your notes, canvases, and class materials remain safely stored."
        confirmLabel="Start fresh graph"
      />

      {/* Add Node Dialog */}
      {hasAddCapabilities && (
        <AddNodeDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          onCreateNote={onCreateNote || (async () => {})}
          onCreateCanvas={onCreateCanvas || (async () => {})}
          onCreated={handleNodeCreated}
          classes={classes}
          defaultClassId={selectedClassId !== 'all' ? selectedClassId : classes[0]?.id}
          moduleTitles={moduleTitles}
          quizTitles={quizTitles}
        />
      )}
    </div>
  )
}
