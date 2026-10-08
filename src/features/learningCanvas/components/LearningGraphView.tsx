import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  LocateFixed,
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
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import {
  buildLearningGraph,
  type GraphNode,
  type GraphNodeType,
  type GraphData,
  type GraphLink,
} from '../graph/graphModel'
import { stepSimulation, type SimulationParams } from '../graph/simulation'
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX, noteDescription } from '../noteContent'
import { buildReferencePath, type CanvasViewerRole } from '../referenceRoutes'
import type { LearningCanvasWithId } from '../types'
import { createSharedGraph, logGraphActivity, saveSharedGraph, watchGraphRole, watchSharedGraph, type SharedGraphNode, type SharedGraphSnapshot } from '../graph/sharing'
import {
  addGraphLink,
  graphLinksEqual,
  mergeGraphLinks,
  mergeNodeIds,
  mergePositions,
  removeGraphLink,
} from '../graph/sharedGraphMerge'
import { AddNodeDialog } from './AddNodeDialog'
import { ImportExistingDialog } from './ImportExistingDialog'
import { GraphCollabSidebar } from '../graph/GraphCollabSidebar'
import { useGraphFullscreen } from '../graph/useGraphFullscreen'
import { SharedGraphList } from '../graph/SharedGraphList'
import { useSearchParams } from 'react-router-dom'
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
const EMPTY_GRAPH_DATA: GraphData = { nodes: [], links: [] }
const EMPTY_GRAPH_LINKS: GraphLink[] = []

/** Every node type the graph shows. The per-type filter buttons were removed, so nothing is hidden by type. */
const ALL_NODE_TYPES: Set<GraphNodeType> = new Set(['note', 'learning', 'module', 'quiz'])

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
  onUpdateNote?: (canvasId: string, classId: string, input: { title: string; content: string }) => Promise<void>
  /** Reads a note's full text. Graph nodes only carry a 300 character preview of it. */
  onLoadNoteContent?: (canvasId: string, classId: string) => Promise<string>
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
  onUpdateNote,
  onLoadNoteContent,
  onConnectNodes,
  onDisconnectNodes,
}: LearningGraphViewProps) {
  const { showToast } = useToast()
  const { user } = useAuth()
  const uid = user?.uid
  const [searchParams, setSearchParams] = useSearchParams()
  const sharedGraphId = searchParams.get('graphId')
  const localGraphId = searchParams.get('localGraphId')
  const returnClassId = searchParams.get('returnClassId')
  const graphClassId = sharedGraphId
    ? searchParams.get('classId') || selectedClassId || ''
    : localGraphId
      ? searchParams.get('classId') || (selectedClassId && selectedClassId !== 'all' ? selectedClassId : classes[0]?.id || '')
      : selectedClassId && selectedClassId !== 'all' ? selectedClassId : classes[0]?.id || ''
  const [loadedSharedGraph, setLoadedSharedGraph] = useState<{ id: string; ownerId: string | null; ownerName: string | null } | null>(null)
  const [sharedGraphContents, setSharedGraphContents] = useState<SharedGraphSnapshot | null>(null)
  const [sharedGraphRoleRecord, setSharedGraphRoleRecord] = useState<{ graphId: string; role: 'viewer' | 'editor' | null } | null>(null)
  const [sharedGraphErrorRecord, setSharedGraphErrorRecord] = useState<{ graphId: string; message: string } | null>(null)
  const invalidGraphLink = Boolean(sharedGraphId && (!graphClassId || graphClassId === 'all'))
  const sharedGraphReady = !sharedGraphId || invalidGraphLink || loadedSharedGraph?.id === sharedGraphId
  const sharedGraphOwnerId = loadedSharedGraph?.id === sharedGraphId ? loadedSharedGraph.ownerId : null
  const sharedGraphOwnerName = loadedSharedGraph?.id === sharedGraphId ? loadedSharedGraph.ownerName : null
  const sharedGraphRole = sharedGraphRoleRecord?.graphId === sharedGraphId ? sharedGraphRoleRecord.role : null
  const sharedGraphError = sharedGraphErrorRecord?.graphId === sharedGraphId
    ? sharedGraphErrorRecord.message
    : invalidGraphLink ? 'This shared graph link is missing its class.' : null
  const [sharingBusy, setSharingBusy] = useState(false)
  /** Notes added inside a shared graph by an invited editor. They live in the graph itself, not in a class. */
  const [graphNotes, setGraphNotes] = useState<Record<string, SharedGraphNode>>({})
  const [sharedGraphLinksRecord, setSharedGraphLinksRecord] = useState<{ graphId: string; links: GraphLink[] } | null>(null)
  const [savedSharedGraphLinksRecord, setSavedSharedGraphLinksRecord] = useState<{ graphId: string; links: GraphLink[] } | null>(null)
  const [syncingSharedGraph, setSyncingSharedGraph] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const isSharedGraphOwner = Boolean(sharedGraphOwnerId && user?.uid === sharedGraphOwnerId)
  const canEditSharedGraph = !sharedGraphId || (sharedGraphReady && (isSharedGraphOwner || sharedGraphRole === 'editor'))

  /* ── Search & filter state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const allowedTypes = ALL_NODE_TYPES

  /* ── Storage & Included Nodes (Custom Graph View + Positions) ── */
  const myGraphScopeClassId = localGraphId ? returnClassId || selectedClassId : selectedClassId
  const myGraphStorageKey = `peerly:graph_nodes_${role}_${myGraphScopeClassId || 'all'}`
  const storageKey = sharedGraphId
    ? `peerly:graph_shared_${graphClassId}_${sharedGraphId}`
    : localGraphId
      ? `${myGraphStorageKey}:view:${localGraphId}`
      : myGraphStorageKey

  type StoredPositions = Record<string, { x: number; y: number; isFixed?: boolean }>

  const readFromStorage = useCallback((key: string): { ids: Set<string>; positions: StoredPositions } => {
    try {
      const saved = localStorage.getItem(key)
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
  }, [])

  const loadFromStorage = useCallback(
    (key = storageKey): { ids: Set<string>; positions: StoredPositions } =>
      sharedGraphId && key === storageKey
        ? { ids: new Set<string>(), positions: {} }
        : readFromStorage(key),
    [readFromStorage, sharedGraphId, storageKey],
  )

  /* ── Unsaved draft (auto-saved per browser session) ──
     Survives switching tabs / refreshing; "Save graph" commits it to localStorage,
     "Discard" drops it. */
  const storageKeyRef = useRef(storageKey)

  const loadDraft = useCallback((key = storageKey): { ids: Set<string>; positions: StoredPositions } | null => {
    if (sharedGraphId && key === storageKey) return null
    try {
      const raw = sessionStorage.getItem(`${key}:draft`)
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
  }, [sharedGraphId, storageKey])

  /** Last on-screen positions of every node (pinned or not), so a remount doesn't re-run the layout from scratch. */
  const loadLayout = useCallback((key = storageKey): StoredPositions => {
    if (sharedGraphId && key === storageKey) return {}
    try {
      const raw = sessionStorage.getItem(`${key}:layout`)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? sanitizePositions(parsed as StoredPositions) : {}
    } catch {
      return {}
    }
  }, [sharedGraphId, storageKey])

  const [savedNodeIds, setSavedNodeIds] = useState<Set<string>>(() => loadFromStorage().ids)
  const [includedNodeIds, setIncludedNodeIds] = useState<Set<string>>(
    () => (loadDraft() ?? loadFromStorage()).ids,
  )
  const [savedPositions, setSavedPositions] = useState<StoredPositions>(() => loadFromStorage().positions)
  const [currentPositions, setCurrentPositions] = useState<StoredPositions>(
    () => (loadDraft() ?? loadFromStorage()).positions,
  )
  const currentSharedLinks = useMemo(
    () => sharedGraphLinksRecord?.graphId === sharedGraphId
      ? sharedGraphLinksRecord.links.filter(
          (link) => includedNodeIds.has(link.source) && includedNodeIds.has(link.target),
        )
      : EMPTY_GRAPH_LINKS,
    [sharedGraphLinksRecord, sharedGraphId, includedNodeIds],
  )
  const savedSharedLinks = useMemo(
    () => savedSharedGraphLinksRecord?.graphId === sharedGraphId
      ? savedSharedGraphLinksRecord.links
      : EMPTY_GRAPH_LINKS,
    [savedSharedGraphLinksRecord, sharedGraphId],
  )
  const includedNodeIdsRef = useRef(includedNodeIds)
  const currentPositionsRef = useRef(currentPositions)
  const sharedGraphLinksRef = useRef(sharedGraphLinksRecord)
  const sharedGraphBaselineRef = useRef<{
    graphId: string
    nodeIds: string[]
    positions: StoredPositions
    links: GraphLink[]
  } | null>(null)

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
      if (!sp || cp.x !== sp.x || cp.y !== sp.y || (cp.isFixed === true) !== (sp.isFixed === true)) return true
    }
    if (sharedGraphId && !graphLinksEqual(currentSharedLinks, savedSharedLinks)) return true
    return false
  }, [includedNodeIds, savedNodeIds, currentPositions, savedPositions, sharedGraphId, currentSharedLinks, savedSharedLinks])

  // Lets the live listener know this person has edits that haven't reached the shared graph yet.
  const dirtyRef = useRef<{ graphId: string | null; dirty: boolean }>({ graphId: sharedGraphId, dirty: false })
  useEffect(() => {
    includedNodeIdsRef.current = includedNodeIds
    currentPositionsRef.current = currentPositions
    sharedGraphLinksRef.current = sharedGraphLinksRecord
    dirtyRef.current = { graphId: sharedGraphId, dirty: isDirty }
  }, [includedNodeIds, currentPositions, sharedGraphLinksRecord, isDirty, sharedGraphId])

  // Auto-save the unsaved work as a draft; clear it once it matches the saved graph.
  useEffect(() => {
    const draftKey = `${storageKeyRef.current}:draft`
    if (sharedGraphId) return
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
  }, [isDirty, includedNodeIds, currentPositions, sharedGraphId])

  const handleSaveGraph = () => {
    if (sharedGraphId) return
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

  const handleCreateSharedGraph = async () => {
    if (!user || !graphClassId || graphClassId === 'all' || sharedGraphId) return
    setSharingBusy(true)
    try {
      const id = await createSharedGraph(graphClassId, user.uid, user.displayName || user.email || 'Graph owner', {
        nodeIds: Array.from(includedNodeIds),
        positions: Object.fromEntries(
          Object.entries(currentPositions).filter(([nodeId]) => includedNodeIds.has(nodeId)).slice(0, 80),
        ),
        nodes: allGraphData.nodes,
        links: allGraphData.links,
      })
      await logGraphActivity(graphClassId, id, {
        uid: user.uid,
        name: user.displayName || user.email || 'Learner',
      }, 'Created and saved this shared graph view', 'member')
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('tab', 'graph')
        next.set('classId', graphClassId)
        next.set('graphId', id)
        return next
      })
      showToast('success', 'Saved a shareable graph view.')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not share this graph.')
    } finally {
      setSharingBusy(false)
    }
  }

  const handleReturnToMyGraph = () => {
    const targetClassId = localGraphId ? returnClassId || selectedClassId || 'all' : selectedClassId || 'all'
    const targetStorageKey = `peerly:graph_nodes_${role}_${targetClassId}`
    const loaded = loadFromStorage(targetStorageKey)
    const working = loadDraft(targetStorageKey) ?? loaded
    setSavedNodeIds(loaded.ids)
    setIncludedNodeIds(working.ids)
    setSavedPositions(loaded.positions)
    setCurrentPositions(working.positions)
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('graphId')
      next.delete('localGraphId')
      next.delete('returnClassId')
      next.set('classId', targetClassId)
      return next
    })
  }

  const handleDiscardGraph = () => {
    if (!canEditSharedGraph) return
    setIncludedNodeIds(new Set(savedNodeIds))
    setCurrentPositions({ ...savedPositions })
    if (sharedGraphId) {
      setSharedGraphLinksRecord({ graphId: sharedGraphId, links: [...savedSharedLinks] })
    }
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
    if (!canEditSharedGraph) return
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
  const [noteTitleDraft, setNoteTitleDraft] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [savingNote, setSavingNote] = useState(false)
  /** The selected note's full text (nodes only carry a 300 character preview). */
  const [noteLoad, setNoteLoad] = useState<
    { id: string; status: 'ready'; text: string } | { id: string; status: 'error' } | null
  >(null)
  const loadNoteRef = useRef(onLoadNoteContent)
  useEffect(() => {
    loadNoteRef.current = onLoadNoteContent
  })

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

  /* ── Touch: tracked pointers for two-finger pinch zoom ── */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)

  /* ── Simulation ── */
  // Ids whose on-screen position was restored (saved layout or pinned drags).
  // These are treated as settled so returning to this tab doesn't re-run the physics.
  const [restoredIds] = useState(() => new Set(Object.keys({ ...loadLayout(), ...currentPositions })))
  const [graphData, setGraphData] = useState<GraphData>(() => sharedGraphId
    ? EMPTY_GRAPH_DATA
    : buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId,
      allowedTypes,
      searchQuery: '',
      includedNodeIds,
      customPositions: { ...loadLayout(), ...currentPositions },
    }))

  const unfilteredLocalGraph = useMemo(() => buildLearningGraph({
    canvases,
    classes,
    moduleTitles,
    quizTitles,
    selectedClassId: sharedGraphId || localGraphId ? graphClassId : selectedClassId,
    allowedTypes,
    searchQuery: '',
    includedNodeIds,
    customPositions: currentPositions,
  }), [
    canvases,
    classes,
    moduleTitles,
    quizTitles,
    sharedGraphId,
    localGraphId,
    graphClassId,
    selectedClassId,
    allowedTypes,
    includedNodeIds,
    currentPositions,
  ])

  const allGraphData = useMemo<GraphData>(() => {
    if (!sharedGraphId) return unfilteredLocalGraph
    if (sharedGraphError || !sharedGraphContents || sharedGraphContents.id !== sharedGraphId) return EMPTY_GRAPH_DATA

    const snapshotIds = new Set<string>()
    const snapshotNodes = sharedGraphContents.nodes.flatMap((snapshot) => {
      if (!includedNodeIds.has(snapshot.id) || snapshotIds.has(snapshot.id)) return []
      snapshotIds.add(snapshot.id)
      const position = currentPositions[snapshot.id] ?? sharedGraphContents.positions[snapshot.id]
      return [{
        ...snapshot,
        x: position?.x ?? snapshot.x,
        y: position?.y ?? snapshot.y,
        vx: 0,
        vy: 0,
        radius: snapshot.type === 'learning' || snapshot.type === 'note' ? 18 : 16,
        degree: 0,
        isFixed: position?.isFixed ?? snapshot.isFixed,
        ...(position?.isFixed ? { fx: position.x, fy: position.y } : {}),
      }]
    })
    const localNodes = unfilteredLocalGraph.nodes.filter(
      (node) => includedNodeIds.has(node.id) && !snapshotIds.has(node.id),
    )
    const noteNodes = Object.values(graphNotes)
      .filter((note) => includedNodeIds.has(note.id) && !snapshotIds.has(note.id))
      .map((note) => ({ ...note, vx: 0, vy: 0, radius: 18, degree: 0 }))
    const nodes = [...snapshotNodes, ...localNodes, ...noteNodes]
    const includedIds = new Set(nodes.map((node) => node.id))
    const links = currentSharedLinks.filter(
      (link) => includedIds.has(link.source) && includedIds.has(link.target),
    )
    return { nodes, links }
  }, [
    sharedGraphId,
    sharedGraphError,
    sharedGraphContents,
    includedNodeIds,
    currentPositions,
    unfilteredLocalGraph,
    graphNotes,
    currentSharedLinks,
  ])

  // A node can be on screen before the shared copy has its details (for example a note that was just
  // created). That also counts as unsynced, so it is saved even when the node list itself didn't change.
  const missingFromSnapshot = useMemo(() => {
    if (!sharedGraphId || !sharedGraphContents || sharedGraphContents.id !== sharedGraphId) return false
    const stored = new Set(sharedGraphContents.nodes.map((node) => node.id))
    return allGraphData.nodes.some((node) => includedNodeIds.has(node.id) && !stored.has(node.id))
  }, [allGraphData.nodes, includedNodeIds, sharedGraphContents, sharedGraphId])

  const missingRetriesRef = useRef(0)
  useEffect(() => {
    if (!missingFromSnapshot) missingRetriesRef.current = 0
    if (!sharedGraphId || !graphClassId || !user || !sharedGraphReady || !canEditSharedGraph || (!isDirty && !missingFromSnapshot)) return
    // A node that can't be stored (for example one far off the canvas) must not make this save forever.
    const missingOnly = !isDirty
    if (missingOnly && missingRetriesRef.current >= 2) return
    const timer = window.setTimeout(() => {
      if (missingOnly) missingRetriesRef.current += 1
      setSyncingSharedGraph(true)
      void saveSharedGraph(graphClassId, sharedGraphId, {
        nodeIds: Array.from(includedNodeIds),
        positions: Object.fromEntries(
          Object.entries(currentPositions).filter(([nodeId]) => includedNodeIds.has(nodeId)).slice(0, 80),
        ),
        nodes: allGraphData.nodes,
        links: currentSharedLinks,
      }).then(async () => {
        setSavedNodeIds(new Set(includedNodeIds))
        const positions = Object.fromEntries(
          Object.entries(currentPositions).filter(([nodeId]) => includedNodeIds.has(nodeId)).slice(0, 80),
        )
        setSavedPositions(positions)
        setSavedSharedGraphLinksRecord({ graphId: sharedGraphId, links: [...currentSharedLinks] })
        setSyncError(null)
        await logGraphActivity(graphClassId, sharedGraphId, {
          uid: user.uid,
          name: user.displayName || user.email || 'Learner',
        }, 'Updated the graph layout or included materials')
      }).catch((error: unknown) => {
        console.error('Shared graph sync failed', error)
        const message = error instanceof Error ? error.message : 'Could not sync this graph.'
        setSyncError(message)
        showToast('error', message)
      }).finally(() => setSyncingSharedGraph(false))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [canEditSharedGraph, currentPositions, currentSharedLinks, graphClassId, allGraphData, includedNodeIds, isDirty, missingFromSnapshot, sharedGraphId, sharedGraphReady, showToast, user])

  const nodesRef = useRef<GraphNode[]>(graphData.nodes)
  const linksRef = useRef(graphData.links)
  const alphaRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { isExpanded: isFullscreen, toggle: toggleFullscreen } = useGraphFullscreen(rootRef)
  const isInitialMountRef = useRef(true)

  useEffect(() => {
    if (!sharedGraphId || !graphClassId || graphClassId === 'all' || !uid) return
    const onError = (error: Error) => {
      setSharedGraphErrorRecord({ graphId: sharedGraphId, message: error.message || 'This graph is unavailable.' })
    }
    const stopGraph = watchSharedGraph(graphClassId, sharedGraphId, (graph) => {
      if (!graph) {
        sharedGraphBaselineRef.current = null
        setSharedGraphContents(null)
        setLoadedSharedGraph({ id: sharedGraphId, ownerId: null, ownerName: null })
        return
      }

      const baseline = sharedGraphBaselineRef.current?.graphId === sharedGraphId
        ? sharedGraphBaselineRef.current
        : null
      const hasLocalEdits = dirtyRef.current.graphId === sharedGraphId && dirtyRef.current.dirty
      const ids = new Set(graph.nodeIds)
      const positions = Object.fromEntries(
        Object.entries(sanitizePositions(graph.positions)).filter(([nodeId]) => ids.has(nodeId)),
      )
      const previousLinks = sharedGraphLinksRef.current?.graphId === sharedGraphId
        ? sharedGraphLinksRef.current.links
        : graph.links
      const mergedIds = baseline && hasLocalEdits
        ? new Set(mergeNodeIds([...includedNodeIdsRef.current], baseline.nodeIds, graph.nodeIds))
        : ids
      const mergedPositions = baseline && hasLocalEdits
        ? mergePositions(currentPositionsRef.current, baseline.positions, positions)
        : positions
      const mergedLinks = baseline && hasLocalEdits
        ? mergeGraphLinks(previousLinks, baseline.links, graph.links, mergedIds)
        : graph.links.filter((link) => mergedIds.has(link.source) && mergedIds.has(link.target))

      sharedGraphBaselineRef.current = {
        graphId: sharedGraphId,
        nodeIds: graph.nodeIds,
        positions,
        links: graph.links,
      }
      setGraphData(EMPTY_GRAPH_DATA)
      setSharedGraphLinksRecord({ graphId: sharedGraphId, links: mergedLinks })
      setSavedSharedGraphLinksRecord({ graphId: sharedGraphId, links: graph.links })
      setSharedGraphContents(graph)
      setSavedNodeIds(ids)
      setSavedPositions(positions)
      setIncludedNodeIds(mergedIds)
      setCurrentPositions(mergedPositions)
      setLoadedSharedGraph({ id: sharedGraphId, ownerId: graph.ownerId, ownerName: graph.ownerName })
    }, onError)
    const stopRole = watchGraphRole(graphClassId, sharedGraphId, uid, (role) => {
      setSharedGraphRoleRecord({ graphId: sharedGraphId, role })
    }, onError)
    return () => {
      stopGraph()
      stopRole()
    }
  }, [graphClassId, sharedGraphId, uid])

  useEffect(() => {
    setGraphNotes({})
    setSelectedNode(null)
    setConnectSourceId(null)
    setConnectMode(false)
  }, [sharedGraphId])

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

  // Leave edit mode only when a different node is selected. A graph refresh replaces the node object
  // but must not throw away a note the person is typing.
  const selectedNodeId = selectedNode?.id ?? null
  useEffect(() => {
    setIsEditingNote(false)
    setNoteError(null)
    setLinkTargetId('')
  }, [selectedNodeId])

  // Load the full note text for the selected note, and again whenever its preview changes
  // (for example after it is edited in the Notes tab or the whiteboard).
  const noteRawId = selectedNode?.type === 'note' ? selectedNode.rawId : null
  const noteClassId = selectedNode?.type === 'note' ? selectedNode.classId : null
  const notePreview = selectedNode?.type === 'note' ? (selectedNode.description ?? '') : ''
  useEffect(() => {
    const load = loadNoteRef.current
    if (!noteRawId || !noteClassId || !load) {
      setNoteLoad(null)
      return undefined
    }
    let cancelled = false
    load(noteRawId, noteClassId)
      .then((text) => {
        if (!cancelled) setNoteLoad({ id: noteRawId, status: 'ready', text })
      })
      .catch(() => {
        if (!cancelled) setNoteLoad({ id: noteRawId, status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [noteRawId, noteClassId, notePreview])

  /* ── Handlers for New Graph & Import ── */
  const handleNewGraphView = () => {
    if (!canEditSharedGraph) return
    if (sharedGraphId || includedNodeIds.size > 0 || graphData.nodes.length > 0) {
      setConfirmNewGraphOpen(true)
    } else {
      handleConfirmNewGraph()
    }
  }

  const handleConfirmNewGraph = () => {
    if (!canEditSharedGraph) return
    const newLocalGraphId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('graphId')
      next.set('localGraphId', newLocalGraphId)
      next.set('classId', graphClassId || selectedClassId || 'all')
      next.set('returnClassId', localGraphId ? returnClassId || selectedClassId || 'all' : selectedClassId || 'all')
      next.set('tab', 'graph')
      return next
    })
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelectedNode(null)
    setSearchQuery('')
    setConnectMode(false)
    setConnectSourceId(null)
    setConfirmNewGraphOpen(false)
    showToast('success', 'Created a separate blank graph view.')
  }

  const handleImportItems = (newIds: string[]) => {
    if (!canEditSharedGraph || (sharedGraphId && !isSharedGraphOwner)) return
    const nextIds = new Set(includedNodeIds)
    newIds.forEach((id) => nextIds.add(id))
    const importedGraph = buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId: sharedGraphId || localGraphId ? graphClassId : selectedClassId,
      allowedTypes,
      searchQuery: '',
      includedNodeIds: nextIds,
      customPositions: currentPositions,
    })
    setIncludedNodeIds((prev) => {
      const next = new Set(prev)
      newIds.forEach((id) => next.add(id))
      return next
    })
    if (sharedGraphId) {
      setSharedGraphLinksRecord((previous) => {
        const existing = previous?.graphId === sharedGraphId ? previous.links : currentSharedLinks
        const importedLinks = importedGraph.links.filter(
          (link) => newIds.includes(link.source) || newIds.includes(link.target),
        )
        const links = [...new Map([...existing, ...importedLinks].map((link) => [link.id, link])).values()]
        return { graphId: sharedGraphId, links: links.slice(0, 120) }
      })
    }
    showToast('success', `Imported ${newIds.length} materials into knowledge graph.`)
  }

  const handleNodeCreated = (type: 'note' | 'learning', id: string) => {
    if (!canEditSharedGraph) return
    setIncludedNodeIds((prev) => new Set([...prev, `${type}:${id}`]))
  }

  /**
   * An invited editor can't create documents in someone else's class, so their note is stored only in the
   * shared graph. Everyone with access sees it, and nothing in the class is touched.
   */
  const handleCreateGraphNote = async ({ title, content }: { classId: string; title: string; content: string }): Promise<string> => {
    if (!sharedGraphId || !canEditSharedGraph) throw new Error('You cannot add notes to this graph.')
    const rawId = `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const id = `note:${rawId}`
    const x = Math.round((Math.random() - 0.5) * 240)
    const y = Math.round((Math.random() - 0.5) * 240)
    setGraphNotes((prev) => ({
      ...prev,
      [id]: {
        id,
        rawId,
        type: 'note',
        title: title.slice(0, 500),
        classId: graphClassId,
        className: classes.find((item) => item.id === graphClassId)?.name ?? '',
        description: noteDescription(content),
        content: content.slice(0, 2000),
        x,
        y,
        isFixed: true,
      },
    }))
    setCurrentPositions((prev) => ({ ...prev, [id]: { x, y, isFixed: true } }))
    return rawId
  }

  const handleRemoveFromGraph = (nodeId: string) => {
    if (!canEditSharedGraph) return
    setCurrentPositions((previous) => {
      const next = { ...previous }
      delete next[nodeId]
      return next
    })
    setIncludedNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
    if (sharedGraphId) {
      setSharedGraphLinksRecord((previous) => ({
        graphId: sharedGraphId,
        links: (previous?.graphId === sharedGraphId ? previous.links : currentSharedLinks)
          .filter((link) => link.source !== nodeId && link.target !== nodeId),
      }))
    }
    setSelectedNode(null)
    showToast('success', 'Removed from graph view.')
  }

  /* ── Rebuild graph on data changes ── */
  useEffect(() => {
    let fresh: GraphData
    if (sharedGraphId) {
      const query = searchQuery.trim().toLowerCase()
      const nodes = allGraphData.nodes.filter(
        (node) => allowedTypes.has(node.type) && (!query || node.title.toLowerCase().includes(query)),
      )
      const visibleIds = new Set(nodes.map((node) => node.id))
      const links = allGraphData.links.filter(
        (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
      )
      const degrees = new Map<string, number>()
      for (const link of links) {
        degrees.set(link.source, (degrees.get(link.source) || 0) + 1)
        degrees.set(link.target, (degrees.get(link.target) || 0) + 1)
      }
      fresh = {
        nodes: nodes.map((node) => ({
          ...node,
          degree: degrees.get(node.id) || 0,
          radius: Math.min(32, (node.type === 'learning' || node.type === 'note' ? 18 : 14) + (degrees.get(node.id) || 0) * 2),
          isHighlighted: !query || node.title.toLowerCase().includes(query),
        })),
        links,
      }
    } else {
      fresh = buildLearningGraph({
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
    }

    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]))
    let needsRelax = false
    fresh.nodes.forEach((n) => {
      const prev = prevMap.get(n.id)
      // Only nodes that have never been placed need the layout to run.
      const wasPlaced = Boolean(currentPositions[n.id]) || (isInitialMountRef.current ? restoredIds.has(n.id) : Boolean(prev))
      if (!sharedGraphId && !wasPlaced) needsRelax = true
      if (prev && !sharedGraphId) {
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
      // Coming back to this tab with a saved layout must NOT re-run the physics.
      alphaRef.current = needsRelax ? 0.5 : 0
    } else if (needsRelax) {
      alphaRef.current = Math.max(alphaRef.current, 0.5)
    }

    // Keep selectedNode reference fresh
    setSelectedNode((prev) => (prev ? fresh.nodes.find((n) => n.id === prev.id) || null : null))
  }, [
    allGraphData,
    canvases,
    classes,
    moduleTitles,
    quizTitles,
    sharedGraphContents,
    sharedGraphId,
    graphNotes,
    selectedClassId,
    allowedTypes,
    searchQuery,
    includedNodeIds,
    currentPositions,
    restoredIds,
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
  // Runs for every pointer (including ones that land on a node) so a second finger always starts a pinch.
  const handlePointerDownCapture = (e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom }
      isPanningRef.current = false
      draggedNodeRef.current = null
      dragMovedRef.current = false
    }
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'rect') {
      return
    }
    if (pointersRef.current.size > 1) return
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    setSelectedNode(null)
    // Keep receiving moves even if the finger slides off the svg.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      setZoom(Math.max(0.2, Math.min(3, pinchRef.current.zoom * (dist / pinchRef.current.dist))))
      return
    }
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
    const handleGlobalRelease = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
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

  /* ── Note inline edit (title and content are saved together) ── */
  const loadedNote = selectedNode?.type === 'note' && noteLoad?.id === selectedNode.rawId ? noteLoad : null
  // Editing is only allowed once the full text is loaded, so a truncated preview can never be saved back.
  const noteReady = loadedNote?.status === 'ready'
  const displayNoteText =
    loadedNote?.status === 'ready' ? loadedNote.text : selectedNode?.content || selectedNode?.description || ''

  const startEditingNote = () => {
    if (!selectedNode || loadedNote?.status !== 'ready') return
    setNoteTitleDraft(selectedNode.title)
    setNoteDraft(loadedNote.text)
    setNoteError(null)
    setIsEditingNote(true)
  }

  const handleSaveNote = async () => {
    if (!selectedNode || !onUpdateNote || sharedGraphId) return
    const title = noteTitleDraft.trim()
    if (!title) {
      setNoteError('A note needs a title.')
      return
    }
    setSavingNote(true)
    setNoteError(null)
    try {
      await onUpdateNote(selectedNode.rawId, selectedNode.classId, { title, content: noteDraft })
      setIsEditingNote(false)
      setNoteLoad({ id: selectedNode.rawId, status: 'ready', text: noteDraft })
      selectedNode.title = title
      selectedNode.content = noteDraft
      selectedNode.description = noteDescription(noteDraft)
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : 'The note could not be saved.')
    } finally {
      setSavingNote(false)
    }
  }

  /* ── Connect node (from inspector dropdown) ── */
  const handleConnect = async () => {
    if (!selectedNode || !linkTargetId || !canEditSharedGraph) return
    setLinkingBusy(true)
    try {
      if (sharedGraphId) {
        const next = addGraphLink(currentSharedLinks, selectedNode.id, linkTargetId, includedNodeIds)
        if (next === currentSharedLinks) {
          showToast('error', 'Choose two different nodes in this graph view; it can contain up to 120 links.')
          return
        }
        setSharedGraphLinksRecord({ graphId: sharedGraphId, links: next })
      } else if (onConnectNodes) {
        await onConnectNodes(selectedNode.id, linkTargetId, selectedNode.classId)
      } else {
        return
      }
      setLinkTargetId('')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not create the connection.')
    } finally {
      setLinkingBusy(false)
    }
  }

  /* ── Click-to-connect in connect mode ── */
  const handleConnectModeClick = async (node: GraphNode) => {
    if (!canEditSharedGraph || (!sharedGraphId && !onConnectNodes)) return
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
      if (sharedGraphId) {
        const next = addGraphLink(currentSharedLinks, connectSourceId, node.id, includedNodeIds)
        if (next === currentSharedLinks) {
          showToast('error', 'Choose two different nodes in this graph view; it can contain up to 120 links.')
        } else {
          setSharedGraphLinksRecord({ graphId: sharedGraphId, links: next })
          showToast('success', `Connected "${sourceNode?.title || 'Node'}" → "${node.title}".`)
        }
      } else if (onConnectNodes) {
        await onConnectNodes(connectSourceId, node.id, classId)
        showToast('success', `Connected "${sourceNode?.title || 'Node'}" → "${node.title}".`)
      }
      setConnectSourceId(null)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Failed to create connection.')
    } finally {
      setLinkingBusy(false)
    }
  }

  /* ── Disconnect node ── */
  const handleDisconnect = async (neighborId: string) => {
    if (!selectedNode || !canEditSharedGraph) return
    setLinkingBusy(true)
    try {
      if (sharedGraphId) {
        const next = removeGraphLink(currentSharedLinks, selectedNode.id, neighborId)
        if (next.length !== currentSharedLinks.length) {
          setSharedGraphLinksRecord({ graphId: sharedGraphId, links: next })
        }
      } else if (onDisconnectNodes) {
        await onDisconnectNodes(selectedNode.id, neighborId, selectedNode.classId)
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not remove the connection.')
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
    const el = stageRef.current || svgRef.current || containerRef.current
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

  // The owner and invited editors can add nodes inside a shared graph; viewers cannot (canEditSharedGraph).
  const hasAddCapabilities = Boolean(onCreateNote || onCreateCanvas) && canEditSharedGraph
  // Invited editors (not the owner) add graph-only notes, because they may have no right to create class documents.
  const usesGraphNotes = Boolean(sharedGraphId) && !isSharedGraphOwner

  const hasSharedAccess = Boolean(sharedGraphId && sharedGraphReady && !sharedGraphError && (isSharedGraphOwner || sharedGraphRole))
  const showCollabSidebar = hasSharedAccess && Boolean(user) && Boolean(sharedGraphId)

  return (
    <div
      ref={rootRef}
      className={isFullscreen ? 'fixed inset-0 z-50 grid content-start gap-4 overflow-auto bg-white p-4' : 'grid gap-4'}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
    >
      {user && <SharedGraphList uid={user.uid} selectedClassId={selectedClassId || 'all'} classIds={classes.map((item) => item.id)} activeGraphId={sharedGraphId} />}
      {sharedGraphId && sharedGraphError && <Alert tone="error" label="Shared graph unavailable">{sharedGraphError}</Alert>}
      {sharedGraphId && sharedGraphReady && !sharedGraphError && !isSharedGraphOwner && !sharedGraphRole && (
        <Alert tone="error" label="No access to this graph">This graph is only available to its owner and invited active class members.</Alert>
      )}
      <div className={showCollabSidebar ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid gap-4'}>
    <div className={`graph-view${isFullscreen ? ' graph-view--expanded' : ''}`} ref={containerRef}>
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

        {/* Primary actions */}
        <div className="graph-view__actions">
          {(sharedGraphId || localGraphId) && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleReturnToMyGraph}
              className="py-1 px-2.5 text-xs min-h-11 gap-1.5 mr-1"
            >
              <Orbit size={14} aria-hidden="true" />
              <span>My graph</span>
            </Button>
          )}
          {!sharedGraphId && user && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCreateSharedGraph()}
              disabled={sharingBusy || !graphClassId}
              className="py-1 px-2.5 text-xs min-h-11 gap-1.5 mr-1"
              title={graphClassId ? 'Save this graph view and invite people with a code' : 'Create or join a class before saving a graph view'}
            >
              <Link2 size={14} aria-hidden="true" />
              <span>{sharingBusy ? 'Preparing…' : 'Share graph'}</span>
            </Button>
          )}
          {canEditSharedGraph && (
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
          )}

          {canEditSharedGraph && (!sharedGraphId || isSharedGraphOwner) && (
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
          )}

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

        </div>

        {/* View controls */}
        <div className="graph-view__zoom-controls flex items-center">
          {/* Connect Mode toggle */}
          {canEditSharedGraph && (sharedGraphId || onConnectNodes) && graphData.nodes.length >= 2 && (
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
            <LocateFixed size={16} />
          </button>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="graph-view__zoom-btn"
            onClick={handleAutoArrange}
            aria-label="Auto-arrange layout"
            title="Auto-arrange layout (relax node positions)"
            disabled={!canEditSharedGraph}
          >
            <Sparkles size={16} />
          </button>
        </div>
      </div>

      {canEditSharedGraph && syncingSharedGraph && (
        <p className="m-0 px-4 pt-2 text-sm text-navy-800" role="status" aria-live="polite">Syncing graph changes…</p>
      )}
      {canEditSharedGraph && syncError && (
        <div className="px-4 pt-2"><Alert tone="error" label="Changes not synced">{syncError} Other people won’t see your latest changes until this is fixed.</Alert></div>
      )}

      {/* Stage: the SVG plus every graph overlay. Collaboration UI never lives here. */}
      <div className="graph-view__stage" ref={stageRef}>

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
      {sharedGraphId && (sharedGraphError || !sharedGraphReady || (!isSharedGraphOwner && !sharedGraphRole)) ? (
        sharedGraphReady ? null : <p className="m-0 text-sm text-navy-900" role="status">Loading this graph view…</p>
      ) : graphData.nodes.length === 0 ? (
        <div className="graph-view__empty">
          <div className="graph-view__empty-icon">
            <Orbit size={24} />
          </div>
          <h3 className="text-base font-bold text-navy-900 m-0 mb-1">
            {sharedGraphId ? 'This graph is empty' : 'Start Your Knowledge Graph'}
          </h3>
          <p className="text-sm text-navy-800-72 max-w-md m-0 mb-5">
            {sharedGraphId
              ? 'No materials have been added to this shared graph yet.'
              : 'Your graph view begins as a clean canvas. Create fresh concept notes to map out ideas, or import existing modules and whiteboard canvases from your class.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {canEditSharedGraph && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleNewGraphView}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>Create new graph view</span>
                </Button>
                {(!sharedGraphId || isSharedGraphOwner) && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setImportDialogOpen(true)}
                  >
                    <FolderInput size={16} aria-hidden="true" />
                    <span>Import existing modules and canvases</span>
                  </Button>
                )}
              </>
            )}
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
          onPointerDownCapture={handlePointerDownCapture}
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
                      if (!connectMode && canEditSharedGraph && pointersRef.current.size < 2) {
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
                    {/* Oversized invisible hit area so small nodes are easy to tap */}
                    <circle r={Math.max(node.radius + 10, 26)} className="graph-view__node-hit" />

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
      {isDirty && !sharedGraphId && (
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
                {onUpdateNote && !isEditingNote && !sharedGraphId && (
                  <button
                    type="button"
                    onClick={startEditingNote}
                    disabled={!noteReady}
                    className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-navy-900 hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    <Edit3 size={12} />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isEditingNote ? (
                <div className="grid gap-2">
                  {noteError && (
                    <p role="alert" className="m-0 text-sm font-semibold text-feedback-error">
                      {noteError}
                    </p>
                  )}
                  <label className="grid gap-1 text-sm font-semibold text-navy-900">
                    Title
                    <input
                      type="text"
                      value={noteTitleDraft}
                      maxLength={NOTE_TITLE_MAX}
                      onChange={(e) => setNoteTitleDraft(e.target.value)}
                      className="w-full min-h-11 px-3 text-sm font-normal text-navy-900 bg-navy-700-05 border border-navy-900-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-navy-900">
                    Content
                    <textarea
                      rows={6}
                      value={noteDraft}
                      maxLength={NOTE_CONTENT_MAX}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Write markdown notes, definitions, concepts…"
                      className="w-full p-2 text-sm font-normal text-navy-900 bg-navy-700-05 border border-navy-900-12 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
                    />
                    <span className="text-sm font-normal text-navy-800-72">
                      {noteDraft.length}/{NOTE_CONTENT_MAX} characters
                    </span>
                  </label>
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
                      disabled={savingNote || !noteTitleDraft.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-navy-900 rounded-lg hover:bg-navy-800 disabled:opacity-50"
                    >
                      <Save size={12} />
                      <span>{savingNote ? 'Saving…' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-navy-700-05 text-sm text-navy-900 font-sans max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {displayNoteText || 'No notes added yet. Click Edit to write concepts.'}
                  {loadedNote?.status === 'error' && onLoadNoteContent && !sharedGraphId && (
                    <p className="m-0 mt-2 text-sm font-semibold text-navy-800">
                      Could not load the full note, so editing is unavailable right now.
                    </p>
                  )}
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
                      {canEditSharedGraph && (sharedGraphId || (onDisconnectNodes && (selectedNode.type === 'note' || selectedNode.type === 'learning'))) && (
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
            {canEditSharedGraph
              && (sharedGraphId || (onConnectNodes && (selectedNode.type === 'note' || selectedNode.type === 'learning')))
              && unlinkedCandidates.length > 0 && (
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
            {!sharedGraphId && (
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
            )}

            {canEditSharedGraph && (
            <button
              type="button"
              onClick={() => handleRemoveFromGraph(selectedNode.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-navy-800-72 hover:text-danger hover:bg-feedback-error-bg rounded-xl border border-navy-900-10 transition-colors"
            >
              <MinusCircle size={14} aria-hidden="true" />
              <span>Remove from graph view</span>
            </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>

    {showCollabSidebar && user && sharedGraphId && (
      <GraphCollabSidebar
        classId={graphClassId}
        graphId={sharedGraphId}
        uid={user.uid}
        name={user.displayName || user.email || 'Learner'}
        ownerId={sharedGraphOwnerId || ''}
        ownerName={sharedGraphOwnerName || 'Graph owner'}
        owner={isSharedGraphOwner}
      />
    )}
      </div>

      {/* Import Existing Dialog */}
      <ImportExistingDialog
        open={importDialogOpen && (!sharedGraphId || isSharedGraphOwner)}
        onClose={() => setImportDialogOpen(false)}
        canvases={canvases}
        moduleTitles={moduleTitles}
        quizTitles={quizTitles}
        classes={classes}
        selectedClassId={sharedGraphId ? graphClassId : selectedClassId}
        alreadyIncludedIds={includedNodeIds}
        onImport={handleImportItems}
      />

      {/* Confirm New Graph Dialog */}
      <ConfirmDialog
        open={confirmNewGraphOpen}
        onClose={() => setConfirmNewGraphOpen(false)}
        onConfirm={handleConfirmNewGraph}
        title="Create new graph view?"
        description="A separate blank graph view will be created. This graph, your other saved views, and your notes and canvases will remain unchanged."
        confirmLabel="Create separate view"
      />

      {/* Add Node Dialog */}
      {hasAddCapabilities && (
        <AddNodeDialog
          key={sharedGraphId ?? localGraphId ?? 'my-graph'}
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          noteOnly={usesGraphNotes}
          onCreateNote={usesGraphNotes ? handleCreateGraphNote : onCreateNote || (async () => {})}
          onCreateCanvas={onCreateCanvas || (async () => {})}
          onCreated={handleNodeCreated}
          classes={classes}
          defaultClassId={sharedGraphId && graphClassId ? graphClassId : selectedClassId !== 'all' ? selectedClassId : classes[0]?.id}
          moduleTitles={moduleTitles}
          quizTitles={quizTitles}
        />
      )}
    </div>
  )
}
