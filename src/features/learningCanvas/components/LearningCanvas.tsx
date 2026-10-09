import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  type Connection,
  type Edge,
  type Node,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '../../canvas/canvas.css' // defines .canvas-handle (44px hit area) used by CardHandles
import '../learningCanvas.css'

import { TextCard } from './TextCard'
import { LinkCard } from './LinkCard'
import { ReferenceCard, type ResolvedReferenceInfo } from './ReferenceCard'
import { GroupNode } from './GroupNode'
import { ImageCard } from './ImageCard'
import { LearningCanvasEdge } from './LearningCanvasEdge'
import { LearningCanvasToolbar } from './LearningCanvasToolbar'
import { CanvasOutlineView } from './CanvasOutlineView'
import { QuickAddMenu } from './QuickAddMenu'
import { ConnectionNotice } from './ConnectionNotice'
import { ConnectCardsDialog } from './ConnectCardsDialog'
import { ReferencePickerDialog } from './ReferencePickerDialog'
import { ShortcutsHelpDialog } from './ShortcutsHelpDialog'
import { LossyImportDialog } from './LossyImportDialog'
import { VersionConflictDialog } from './VersionConflictDialog'

import {
  ExpandableCanvasContainer,
  CanvasControls,
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
} from '../../canvas/shared'
import { processImageFile } from '../../canvas/imageProcessing'
import { getOptimalHandles } from '../../canvas/mapping'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'

import type {
  LearningCanvasContent,
  LearningCanvasNode,
  LearningCanvasImageNode,
  LearningCanvasEdge as DomainEdge,
  LearningCanvasNodeType,
  LearningCanvasColor,
  LearningCanvasArrow,
  LearningCanvasRefType,
} from '../types'

import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from '../jsonCanvas'
import { newNodePlacement, clampNode } from '../schemas'
import { persistableBoardDiffers, toSavableContent } from '../savableContent'
import { CanvasConflictError } from '../errors'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { useAutosave } from '../hooks/useAutosave'
import { mergeContent, sameBoard } from '../collab/mergeContent'
import type { CursorPosition, RemoteCursor } from '../collab/types'
import {
  MAX_LEARNING_CANVAS_NODES,
  MAX_LEARNING_CANVAS_GROUPS,
  MAX_LEARNING_CANVAS_EDGES,
} from '../constants'

interface LearningCanvasProps {
  initialContent: LearningCanvasContent
  remoteContent?: LearningCanvasContent | null
  remoteCursors?: RemoteCursor[]
  onPublishCursor?: (position: CursorPosition | null) => void
  onRemoteContentApplied?: (content: LearningCanvasContent) => void
  title?: string
  readOnly?: boolean
  canEditStatus?: boolean
  status?: 'draft' | 'published'
  availableReferences?: ResolvedReferenceInfo[]
  /** `force: true` means "overwrite whatever is on the server" (Keep my changes). */
  onSave?: (
    content: LearningCanvasContent,
    options?: { force?: boolean },
  ) => Promise<LearningCanvasContent | void>
  onToggleStatus?: () => void
  onCopyToMyCanvases?: () => void
  onReloadLatest?: () => Promise<LearningCanvasContent | null | undefined>
  /** The page knows the class and the viewer's role, so it builds the right URL. */
  onOpenReference?: (refType: LearningCanvasRefType, refId: string) => void
}

const nodeTypes = {
  text: TextCard,
  link: LinkCard,
  reference: ReferenceCard,
  group: GroupNode,
  image: ImageCard,
}

const edgeTypes = {
  learningEdge: LearningCanvasEdge,
}

// ---------------------------------------------------------------------------
// Pure helpers (no component state, so they cannot capture stale values)
// ---------------------------------------------------------------------------

interface Snapshot {
  nodes: LearningCanvasNode[]
  edges: DomainEdge[]
}

interface FlowCallbacks {
  onUpdate: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete: (id: string) => void
  onPickReference: (nodeId: string) => void
  onOpenReference: (refType: LearningCanvasRefType, refId: string) => void
  onUpdateEdge: (id: string, updates: { label?: string; arrow?: LearningCanvasArrow }) => void
  onDeleteEdge: (id: string) => void
}

const VALID_SIDES: readonly string[] = ['top', 'right', 'bottom', 'left']

function toSide(value: unknown): DomainEdge['fromSide'] {
  return typeof value === 'string' && VALID_SIDES.includes(value)
    ? (value as DomainEdge['fromSide'])
    : undefined
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * The id of the (non-group) card under a screen point, or null for empty board space.
 * Groups count as empty space so dropping inside a group still opens the quick-add menu.
 * React Flow only reports a drop target when it lands on a handle, so a drop on a card's
 * body has to be found from the DOM.
 */
function cardIdAtPoint(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== 'function') return null
  const el = document.elementFromPoint(x, y)
  const nodeEl = el?.closest('.react-flow__node')
  if (!nodeEl || nodeEl.classList.contains('react-flow__node-group')) return null
  return nodeEl.getAttribute('data-id')
}

function domainToFlowNode(n: LearningCanvasNode, readOnly: boolean, cb: FlowCallbacks): Node {
  return {
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    style: { width: n.width, height: n.height },
    data: {
      ...n,
      readOnly,
      onUpdate: cb.onUpdate,
      onDelete: cb.onDelete,
      onPickReference: cb.onPickReference,
      onOpenReference: cb.onOpenReference,
    },
  }
}

function domainToFlowEdge(e: DomainEdge, readOnly: boolean, cb: FlowCallbacks): Edge {
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    sourceHandle: e.fromSide,
    targetHandle: e.toSide,
    type: 'learningEdge',
    data: {
      label: e.label,
      arrow: e.arrow,
      readOnly,
      onUpdateEdge: cb.onUpdateEdge,
      onDeleteEdge: cb.onDeleteEdge,
    },
  }
}

function flowToDomain(nodes: Node[], edges: Edge[]): Snapshot {
  const domainNodes = nodes.flatMap((n): LearningCanvasNode[] => {
    const data = n.data as Record<string, unknown>
    const width = typeof n.style?.width === 'number' ? n.style.width : (n.measured?.width ?? 240)
    const height = typeof n.style?.height === 'number' ? n.style.height : (n.measured?.height ?? 140)
    const base = {
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(width),
      height: Math.round(height),
      color: (data.color as LearningCanvasColor) || 'none',
    }

    switch (n.type) {
      case 'text':
        return [clampNode<LearningCanvasNode>({ ...base, type: 'text', text: (data.text as string) || '' })]
      case 'link':
        return [
          clampNode<LearningCanvasNode>({
            ...base,
            type: 'link',
            link: data.link as { url: string; title: string; note?: string },
          }),
        ]
      case 'reference':
        return [
          clampNode<LearningCanvasNode>({
            ...base,
            type: 'reference',
            reference: data.reference as { refType: LearningCanvasRefType; refId: string },
          }),
        ]
      case 'group':
        return [
          clampNode<LearningCanvasNode>({
            ...base,
            type: 'group',
            group: data.group as { label: string },
          }),
        ]
      case 'image':
        return [
          clampNode<LearningCanvasNode>({
            ...base,
            type: 'image',
            image: data.image as { dataUrl: string; alt?: string; caption?: string },
          }),
        ]
      default:
        return []
    }
  })

  const domainEdges: DomainEdge[] = edges.map((e) => {
    const data = (e.data ?? {}) as Record<string, unknown>
    return {
      id: e.id,
      from: e.source,
      to: e.target,
      fromSide: toSide(e.sourceHandle),
      toSide: toSide(e.targetHandle),
      label: (data.label as string) || undefined,
      arrow: (data.arrow as LearningCanvasArrow) || 'to',
    }
  })

  return { nodes: domainNodes, edges: domainEdges }
}

function LearningCanvasInternal({
  initialContent,
  remoteContent,
  remoteCursors = [],
  onPublishCursor,
  onRemoteContentApplied,
  title = 'Learning Canvas',
  readOnly = false,
  canEditStatus = false,
  status = 'draft',
  availableReferences = [],
  onSave,
  onToggleStatus,
  onCopyToMyCanvases,
  onReloadLatest,
  onOpenReference,
}: LearningCanvasProps) {
  const { fitView, screenToFlowPosition } = useReactFlow()
  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const [snapToGrid, setSnapToGrid] = useState(false)
  const [isOutlineOpen, setIsOutlineOpen] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)

  // Live accessibility announcements
  const [liveMessage, setLiveMessage] = useState('')
  const announce = useCallback((msg: string) => setLiveMessage(msg), [])

  // Quick-add menu
  const [quickAddState, setQuickAddState] = useState<{
    screenPos: { x: number; y: number }
    flowPos: { x: number; y: number }
    sourceNodeId?: string
  } | null>(null)

  // Visible message when a drag-connection is rejected (self, duplicate, limit)
  const [connectNotice, setConnectNotice] = useState<{ message: string; key: number } | null>(null)
  const dismissConnectNotice = useCallback(() => setConnectNotice(null), [])

  // Dialogs
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false)
  const [connectDialogSourceId, setConnectDialogSourceId] = useState<string | undefined>()
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false)
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [pickerForNodeId, setPickerForNodeId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)

  // Stable callbacks handed to every card/edge. They forward to the handlers
  // below through a ref, so cards created at any point in time (including
  // before the latest render) always run the current logic. This is what
  // fixes "autosave saves the original text".
  const handlersRef = useRef<FlowCallbacks | null>(null)
  const [callbacks] = useState<FlowCallbacks>(() => ({
    onUpdate: (id, updates) => handlersRef.current?.onUpdate(id, updates),
    onDelete: (id) => handlersRef.current?.onDelete(id),
    onPickReference: (id) => handlersRef.current?.onPickReference(id),
    onOpenReference: (refType, refId) => handlersRef.current?.onOpenReference(refType, refId),
    onUpdateEdge: (id, updates) => handlersRef.current?.onUpdateEdge(id, updates),
    onDeleteEdge: (id) => handlersRef.current?.onDeleteEdge(id),
  }))

  const [initialFlow] = useState(() => ({
    nodes: initialContent.nodes.map((n) => domainToFlowNode(n, readOnly, callbacks)),
    edges: initialContent.edges.map((e) => domainToFlowEdge(e, readOnly, callbacks)),
  }))
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialFlow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialFlow.edges)
  const remoteBaseRef = useRef(initialContent)

  // Always-current copy of the board, readable from timers and event handlers.
  const stateRef = useRef({ nodes, edges })
  useEffect(() => {
    stateRef.current = { nodes, edges }
  }, [nodes, edges])

  const readSnapshot = (): Snapshot => flowToDomain(stateRef.current.nodes, stateRef.current.edges)
  const readContent = (): LearningCanvasContent => ({
    version: 1,
    ...readSnapshot(),
    viewport: { x: 0, y: 0, zoom: 1 },
  })

  // Keep readOnly in stored card data in sync when the prop changes after mount
  // (the pages learn the canvas kind asynchronously).
  useEffect(() => {
    setNodes((nds) =>
      nds.every((n) => n.data.readOnly === readOnly)
        ? nds
        : nds.map((n) => (n.data.readOnly === readOnly ? n : { ...n, data: { ...n.data, readOnly } })),
    )
    setEdges((eds) =>
      eds.every((e) => e.data?.readOnly === readOnly)
        ? eds
        : eds.map((e) => (e.data?.readOnly === readOnly ? e : { ...e, data: { ...e.data, readOnly } })),
    )
  }, [readOnly, setNodes, setEdges])

  // Undo / redo (snapshot is recorded BEFORE each change)
  const history = useUndoRedo<Snapshot>(50)
  const recordHistory = () => {
    if (!readOnly) history.record(readSnapshot())
  }

  // Autosave (always saves the latest board; flushes when leaving)
  const autosave = useAutosave<LearningCanvasContent>({
    enabled: !readOnly && Boolean(onSave),
    getLatest: () => toSavableContent(readContent()),
    save: async (content) => {
      const saved = await onSave?.(content)
      if (!saved) return
      remoteBaseRef.current = saved
      onRemoteContentApplied?.(saved)
      const latestLocal = readContent()
      // `content` is the persistable snapshot we just wrote. Merge against the live board so
      // half-finished cards stay on screen, then only resave if persistable work still differs.
      const liveMerged = mergeContent(content, latestLocal, saved).content
      if (!sameBoard(latestLocal, liveMerged)) {
        applySnapshot({ nodes: liveMerged.nodes, edges: liveMerged.edges })
      }
      if (persistableBoardDiffers(liveMerged, saved)) markDirty()
    },
    onError: (error) => {
      if (error instanceof CanvasConflictError) setIsConflictDialogOpen(true)
    },
  })
  const { markDirty } = autosave
  useUnsavedChangesGuard(autosave.isDirty)

  // Manual save: skips the autosave wait and reports the outcome to screen readers.
  const saveNow = () => {
    if (readOnly || !onSave) return
    void autosave.flush().then((saved) => {
      announce(saved ? 'Canvas saved' : 'The canvas could not be saved. Try again.')
    })
  }
  const applySnapshot = useCallback((snap: Snapshot) => {
    setNodes(snap.nodes.map((n) => domainToFlowNode(n, readOnly, callbacks)))
    setEdges(snap.edges.map((e) => domainToFlowEdge(e, readOnly, callbacks)))
  }, [callbacks, readOnly, setEdges, setNodes])

  useEffect(() => {
    if (!remoteContent || sameBoard(remoteBaseRef.current, remoteContent)) return
    const local: LearningCanvasContent = {
      version: 1,
      ...flowToDomain(stateRef.current.nodes, stateRef.current.edges),
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    const merged = mergeContent(remoteBaseRef.current, local, remoteContent).content
    remoteBaseRef.current = remoteContent
    if (!sameBoard(local, merged)) {
      applySnapshot({ nodes: merged.nodes, edges: merged.edges })
    }
    if (persistableBoardDiffers(merged, remoteContent)) markDirty()
    onRemoteContentApplied?.(remoteContent)
  }, [remoteContent, applySnapshot, markDirty, onRemoteContentApplied])

  // ---- Node / edge mutations ----------------------------------------------

  const updateNode = (id: string, updates: Partial<LearningCanvasNode>) => {
    if (readOnly) return
    recordHistory()
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n
        const nodeStyle = { ...n.style }
        if (updates.width !== undefined) nodeStyle.width = updates.width
        if (updates.height !== undefined) nodeStyle.height = updates.height
        return { ...n, style: nodeStyle, data: { ...n.data, ...updates } }
      }),
    )
    markDirty()
  }

  const deleteNode = (id: string) => {
    if (readOnly) return
    recordHistory()
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    announce('Card deleted')
    markDirty()
  }

  const updateEdge = (id: string, updates: { label?: string; arrow?: LearningCanvasArrow }) => {
    if (readOnly) return
    recordHistory()
    setEdges((eds) =>
      eds.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...updates } } : e)),
    )
    markDirty()
  }

  const deleteEdge = (id: string) => {
    if (readOnly) return
    recordHistory()
    setEdges((eds) => eds.filter((e) => e.id !== id))
    announce('Connection removed')
    markDirty()
  }

  // Forward the stable callbacks to the current handlers after every render.
  useEffect(() => {
    handlersRef.current = {
      onUpdate: updateNode,
      onDelete: deleteNode,
      onPickReference: (id) => setPickerForNodeId(id),
      onOpenReference: (refType, refId) => onOpenReference?.(refType, refId),
      onUpdateEdge: updateEdge,
      onDeleteEdge: deleteEdge,
    }
  })

  const addCard = (
    type: LearningCanvasNodeType,
    targetPos?: { x: number; y: number },
    connectFromNodeId?: string,
  ) => {
    if (readOnly) return
    const snapshot = readSnapshot()

    if (snapshot.nodes.length >= MAX_LEARNING_CANVAS_NODES) {
      announce(`This canvas is full (${MAX_LEARNING_CANVAS_NODES} cards maximum).`)
      return
    }
    if (
      type === 'group' &&
      snapshot.nodes.filter((n) => n.type === 'group').length >= MAX_LEARNING_CANVAS_GROUPS
    ) {
      announce(`A canvas can have at most ${MAX_LEARNING_CANVAS_GROUPS} groups.`)
      return
    }

    const size =
      type === 'group'
        ? { width: 360, height: 260 }
        : type === 'image'
          ? { width: 280, height: 220 }
          : { width: 240, height: 140 }
    const pos = targetPos ?? newNodePlacement(snapshot.nodes, size)
    const base = {
      id: makeId('node'),
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      ...size,
      color: (type === 'group' ? 'tint' : 'none') as LearningCanvasColor,
    }

    let node: LearningCanvasNode
    if (type === 'text') node = { ...base, type: 'text', text: '' }
    else if (type === 'link') node = { ...base, type: 'link', link: { url: 'https://', title: '' } }
    else if (type === 'reference') node = { ...base, type: 'reference', reference: { refType: 'module', refId: '' } }
    else if (type === 'image') node = { ...base, type: 'image', image: { dataUrl: '', alt: 'Image' } }
    else node = { ...base, type: 'group', group: { label: 'New Group' } }

    history.record(snapshot)
    setNodes((nds) => [...nds, domainToFlowNode(node, readOnly, callbacks)])

    if (
      connectFromNodeId &&
      snapshot.nodes.some((n) => n.id === connectFromNodeId) &&
      snapshot.edges.length < MAX_LEARNING_CANVAS_EDGES
    ) {
      const edge: DomainEdge = { id: makeId('edge'), from: connectFromNodeId, to: node.id, arrow: 'to' }
      setEdges((eds) => [...eds, domainToFlowEdge(edge, readOnly, callbacks)])
    }

    // A reference card is meaningless (and cannot be saved) until it has a target.
    if (type === 'reference') setPickerForNodeId(node.id)

    announce(`${type} card added`)
    markDirty()
  }

  const handleAddImageFile = async (file: File) => {
    if (readOnly) return
    const snapshot = readSnapshot()

    if (snapshot.nodes.length >= MAX_LEARNING_CANVAS_NODES) {
      announce(`This canvas is full (${MAX_LEARNING_CANVAS_NODES} cards maximum).`)
      return
    }

    try {
      announce('Processing image…')
      const processed = await processImageFile(file)
      const dataUrl = `data:${processed.mimeType};base64,${processed.data}`

      const size = { width: 280, height: 220 }
      const pos = newNodePlacement(snapshot.nodes, size)
      const node: LearningCanvasImageNode = {
        id: makeId('node'),
        type: 'image',
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        width: size.width,
        height: size.height,
        color: 'none',
        image: {
          dataUrl,
          alt: file.name.replace(/\.[^/.]+$/, '').slice(0, 120),
          caption: '',
        },
      }

      history.record(snapshot)
      setNodes((nds) => [...nds, domainToFlowNode(node, readOnly, callbacks)])
      announce('Image card added')
      markDirty()
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Failed to process image.')
    }
  }

  // ---- Connections ---------------------------------------------------------

  const rejectConnection = (message: string) => {
    announce(message)
    setConnectNotice({ message, key: Date.now() })
  }

  const addConnection = (params: Pick<Connection, 'source' | 'target'> & Partial<Connection>) => {
    if (readOnly) return
    if (params.source === params.target) {
      rejectConnection('A card cannot be connected to itself.')
      return
    }
    const current = stateRef.current.edges
    const isDuplicate = current.some(
      (e) =>
        e.source === params.source &&
        e.target === params.target &&
        (e.sourceHandle ?? null) === (params.sourceHandle ?? null) &&
        (e.targetHandle ?? null) === (params.targetHandle ?? null),
    )
    if (isDuplicate) {
      rejectConnection('Those cards are already connected.')
      return
    }
    if (current.length >= MAX_LEARNING_CANVAS_EDGES) {
      rejectConnection(`A canvas can have at most ${MAX_LEARNING_CANVAS_EDGES} connections.`)
      return
    }
    recordHistory()
    const newEdge: Edge = {
      id: makeId('edge'),
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: 'learningEdge',
      data: {
        arrow: 'to',
        readOnly,
        onUpdateEdge: callbacks.onUpdateEdge,
        onDeleteEdge: callbacks.onDeleteEdge,
      },
    }
    setEdges((eds) => [...eds, newEdge])
    announce('Cards connected')
    markDirty()
  }

  const onConnect = (params: Connection) => addConnection(params)

  // Dropped on a card's body rather than a handle: connect to that card, picking the sides
  // that face each other.
  const connectToCardBody = (fromId: string, toId: string, fromHandleId: string | null) => {
    const { nodes: current } = stateRef.current
    const from = current.find((n) => n.id === fromId)
    const to = current.find((n) => n.id === toId)
    if (!from || !to) return
    const sides = getOptimalHandles(from.position, to.position)
    addConnection({
      source: fromId,
      target: toId,
      sourceHandle: fromHandleId ?? sides.sourceHandle,
      targetHandle: sides.targetHandle,
    })
  }

  const onConnectEnd: OnConnectEnd = (event, connectionState) => {
    if (readOnly || connectionState.isValid || !connectionState.fromNode) return
    // Released on a handle that React Flow rejected: never offer to create a new card there.
    if (connectionState.toNode || connectionState.toHandle) return
    const clientX = 'clientX' in event ? event.clientX : (event.changedTouches[0]?.clientX ?? 0)
    const clientY = 'clientY' in event ? event.clientY : (event.changedTouches[0]?.clientY ?? 0)
    const overCardId = cardIdAtPoint(clientX, clientY)
    if (overCardId) {
      // Released back on the card it started from: nothing to do.
      if (overCardId !== connectionState.fromNode.id) {
        connectToCardBody(connectionState.fromNode.id, overCardId, connectionState.fromHandle?.id ?? null)
      }
      return
    }
    setQuickAddState({
      screenPos: { x: clientX, y: clientY },
      flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
      sourceNodeId: connectionState.fromNode.id,
    })
  }

  const handleConnectDialogSubmit = (
    srcId: string,
    tgtId: string,
    arrow: LearningCanvasArrow,
    label?: string,
  ) => {
    if (readOnly || srcId === tgtId) return
    const { edges: current } = stateRef.current
    if (current.some((e) => e.source === srcId && e.target === tgtId && !e.sourceHandle && !e.targetHandle)) {
      announce('Those cards are already connected')
      return
    }
    if (current.length >= MAX_LEARNING_CANVAS_EDGES) {
      announce(`A canvas can have at most ${MAX_LEARNING_CANVAS_EDGES} connections.`)
      return
    }
    recordHistory()
    const edge: DomainEdge = { id: makeId('edge'), from: srcId, to: tgtId, arrow, ...(label ? { label } : {}) }
    setEdges((eds) => [...eds, domainToFlowEdge(edge, readOnly, callbacks)])
    announce('Cards connected via keyboard')
    markDirty()
  }

  // ---- Pointer handling ------------------------------------------------------

  // Double-click creates a card only on empty board space. Zoom-on-double-click
  // is disabled on the <ReactFlow> element so double-clicking a card to edit it
  // does neither.
  const handleBoardDoubleClick = (event: ReactMouseEvent) => {
    if (readOnly) return
    const target = event.target
    if (!(target instanceof Element) || !target.classList.contains('react-flow__pane')) return
    addCard('text', screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const handleBoardMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onPublishCursor) return
    onPublishCursor(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  // Group dragging: children fully inside the group move with it.
  const groupDragRef = useRef<{
    groupId: string
    initialPos: { x: number; y: number }
    containedNodes: Array<{ id: string; initialX: number; initialY: number }>
  } | null>(null)

  const onNodeDragStart: OnNodeDrag<Node> = (_event, node) => {
    recordHistory() // one history entry per drag
    if (node.type !== 'group') return

    const groupWidth = typeof node.style?.width === 'number' ? node.style.width : (node.measured?.width ?? 360)
    const groupHeight = typeof node.style?.height === 'number' ? node.style.height : (node.measured?.height ?? 260)
    const minX = node.position.x
    const minY = node.position.y
    const maxX = minX + groupWidth
    const maxY = minY + groupHeight

    const contained = nodes
      .filter((n) => {
        if (n.id === node.id || n.type === 'group') return false
        const w = typeof n.style?.width === 'number' ? n.style.width : (n.measured?.width ?? 240)
        const h = typeof n.style?.height === 'number' ? n.style.height : (n.measured?.height ?? 140)
        return n.position.x >= minX && n.position.y >= minY && n.position.x + w <= maxX && n.position.y + h <= maxY
      })
      .map((n) => ({ id: n.id, initialX: n.position.x, initialY: n.position.y }))

    groupDragRef.current = { groupId: node.id, initialPos: { ...node.position }, containedNodes: contained }
  }

  const onNodeDrag: OnNodeDrag<Node> = (_event, node) => {
    const drag = groupDragRef.current
    if (!drag || drag.groupId !== node.id) return
    const dx = node.position.x - drag.initialPos.x
    const dy = node.position.y - drag.initialPos.y
    setNodes((nds) =>
      nds.map((n) => {
        const match = drag.containedNodes.find((c) => c.id === n.id)
        return match ? { ...n, position: { x: match.initialX + dx, y: match.initialY + dy } } : n
      }),
    )
  }

  const onNodeDragStop = () => {
    groupDragRef.current = null
    markDirty()
  }

  // ---- Undo / redo -----------------------------------------------------------

  const handleUndo = () => {
    if (readOnly) return
    const snap = history.undo(readSnapshot())
    if (!snap) return
    applySnapshot(snap)
    announce('Undo performed')
    markDirty()
  }

  const handleRedo = () => {
    if (readOnly) return
    const snap = history.redo(readSnapshot())
    if (!snap) return
    applySnapshot(snap)
    announce('Redo performed')
    markDirty()
  }

  // ---- Keyboard shortcuts (only while the board has focus) ---------------------

  const lastNudgeRef = useRef(0)

  const handleKeyDownCapture = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || isEditableTarget(e.target)) return

    const consume = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const key = e.key.toLowerCase()
    const mod = e.ctrlKey || e.metaKey

    if (mod && !e.altKey) {
      if (key === 'z') {
        consume()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if (key === 'y') {
        consume()
        handleRedo()
      } else if (key === 'd') {
        consume()
        if (readOnly) return
        const current = stateRef.current.nodes
        const selected = current.filter((n) => n.selected)
        if (selected.length === 0) return
        const groups = current.filter((n) => n.type === 'group').length
        const newGroups = selected.filter((n) => n.type === 'group').length
        if (
          current.length + selected.length > MAX_LEARNING_CANVAS_NODES ||
          groups + newGroups > MAX_LEARNING_CANVAS_GROUPS
        ) {
          announce('Not enough room on the canvas to duplicate the selection.')
          return
        }
        recordHistory()
        const copies = selected.map((n) => {
          const newId = makeId('node')
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data, id: newId },
          }
        })
        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...copies])
        announce('Selected cards duplicated')
        markDirty()
      } else if (key === 's') {
        // Only while the board (not a card's text box) has focus, so typing is never hijacked.
        consume()
        saveNow()
      } else if (key === 'a') {
        consume()
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))
        announce('All cards selected')
      }
      return
    }
    if (e.altKey) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (readOnly) return
      const { nodes: curNodes, edges: curEdges } = stateRef.current
      const selectedIds = new Set(curNodes.filter((n) => n.selected).map((n) => n.id))
      if (selectedIds.size === 0 && !curEdges.some((ed) => ed.selected)) return
      consume()
      recordHistory()
      setNodes((nds) => nds.filter((n) => !selectedIds.has(n.id)))
      setEdges((eds) =>
        eds.filter((ed) => !ed.selected && !selectedIds.has(ed.source) && !selectedIds.has(ed.target)),
      )
      announce('Selected items deleted')
      markDirty()
      return
    }

    if (key === 'n') {
      consume()
      addCard('text')
    } else if (key === 'g') {
      consume()
      addCard('group')
    } else if (key === 'f') {
      consume()
      fitView({ duration: 300 })
    } else if (e.key === '/') {
      consume()
      rootRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    } else if (e.key === '?') {
      consume()
      setIsHelpDialogOpen(true)
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (readOnly || !stateRef.current.nodes.some((n) => n.selected)) return
      // Handled here (capture phase) so React Flow's own arrow-key nudge does not
      // move the card a second time.
      consume()
      const step = e.shiftKey ? 20 : 5
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      const now = Date.now()
      if (now - lastNudgeRef.current > 600) recordHistory() // group a burst of nudges into one undo step
      lastNudgeRef.current = now
      setNodes((nds) =>
        nds.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
      )
      markDirty()
    }
  }

  // Clicking empty board space gives the board keyboard focus (shortcuts are scoped to it).
  const handleBoardMouseDownCapture = () => {
    const board = boardRef.current
    if (board && !board.contains(document.activeElement)) {
      board.focus({ preventScroll: true })
    }
  }

  // ---- Search ----------------------------------------------------------------

  const refByKey = useMemo(
    () => new Map(availableReferences.map((r) => [`${r.type}:${r.id}`, r])),
    [availableReferences],
  )

  const matchingNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return nodes
      .filter((n) => {
        const data = n.data as Record<string, unknown>
        if (n.type === 'text') return ((data.text as string) || '').toLowerCase().includes(q)
        if (n.type === 'link') {
          const l = data.link as { title?: string; note?: string; url?: string } | undefined
          return [l?.title, l?.note, l?.url].some((v) => (v || '').toLowerCase().includes(q))
        }
        if (n.type === 'reference') {
          const ref = data.reference as { refType: LearningCanvasRefType; refId: string } | undefined
          const info = ref ? refByKey.get(`${ref.refType}:${ref.refId}`) : undefined
          return (info?.title || '').toLowerCase().includes(q)
        }
        if (n.type === 'group') {
          const g = data.group as { label?: string } | undefined
          return (g?.label || '').toLowerCase().includes(q)
        }
        return false
      })
      .map((n) => n.id)
  }, [searchQuery, nodes, refByKey])

  const matchSet = useMemo(() => new Set(matchingNodeIds), [matchingNodeIds])
  const safeSearchIndex = matchingNodeIds.length === 0 ? 0 : Math.min(searchIndex, matchingNodeIds.length - 1)

  // Highlight and resolved reference info are derived at render time, so they
  // update live instead of being frozen when the card was created.
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const highlighted = matchSet.has(n.id)
        const data = n.data as {
          isHighlighted?: boolean
          resolvedInfo?: ResolvedReferenceInfo
          reference?: { refType: LearningCanvasRefType; refId: string }
        }
        const info =
          n.type === 'reference' && data.reference
            ? refByKey.get(`${data.reference.refType}:${data.reference.refId}`)
            : undefined
        if (Boolean(data.isHighlighted) === highlighted && data.resolvedInfo === info) return n
        return { ...n, data: { ...n.data, isHighlighted: highlighted, resolvedInfo: info } }
      }),
    [nodes, matchSet, refByKey],
  )

  // Re-centre only when the query changes, never because a card was edited.
  const matchesRef = useRef<string[]>([])
  useEffect(() => {
    matchesRef.current = matchingNodeIds
  })
  useEffect(() => {
    const first = matchesRef.current[0]
    if (searchQuery.trim() && first) {
      fitView({ nodes: [{ id: first }], duration: 300, maxZoom: 1.2 })
    }
  }, [searchQuery, fitView])

  const focusMatch = (index: number) => {
    const id = matchingNodeIds[index]
    if (id) fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2 })
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    setSearchIndex(0)
  }

  const handleSearchNext = () => {
    if (matchingNodeIds.length === 0) return
    const next = (safeSearchIndex + 1) % matchingNodeIds.length
    setSearchIndex(next)
    focusMatch(next)
  }

  const handleSearchPrev = () => {
    if (matchingNodeIds.length === 0) return
    const prev = (safeSearchIndex - 1 + matchingNodeIds.length) % matchingNodeIds.length
    setSearchIndex(prev)
    focusMatch(prev)
  }

  // ---- Import / export -----------------------------------------------------------

  const handleExport = () => {
    const json = JSON.stringify(toJsonCanvas(readContent()), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'canvas'}.canvas`
    a.click()
    URL.revokeObjectURL(url)
    announce('Canvas exported')
  }

  const handleImportFile = async (file: File) => {
    try {
      setImportResult(fromJsonCanvas(await file.text()))
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Failed to read canvas file')
    }
  }

  const handleConfirmReplace = () => {
    if (!importResult || readOnly) return
    recordHistory()
    applySnapshot({ nodes: importResult.content.nodes, edges: importResult.content.edges })
    setImportResult(null)
    announce('Canvas replaced with imported file')
    markDirty()
  }

  // ---- Outline ---------------------------------------------------------------------

  const handleJumpToNode = (id: string) => {
    if (!nodes.some((n) => n.id === id)) return
    fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2 })
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })))
  }

  const handleConnectFromNode = (id: string) => {
    setConnectDialogSourceId(id)
    setIsConnectDialogOpen(true)
  }

  const currentDomain = useMemo(() => flowToDomain(nodes, edges), [nodes, edges])

  return (
    <div ref={rootRef} className="flex flex-col h-full w-full gap-3" data-testid="learning-canvas-root">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <LearningCanvasToolbar
        readOnly={readOnly}
        canEditStatus={canEditStatus}
        status={status}
        autosaveStatus={autosave.status}
        snapToGrid={snapToGrid}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        isOutlineOpen={isOutlineOpen}
        searchQuery={searchQuery}
        searchMatchCount={matchingNodeIds.length}
        searchMatchIndex={safeSearchIndex}
        onToggleSnapToGrid={() => setSnapToGrid((v) => !v)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleOutline={() => setIsOutlineOpen((v) => !v)}
        onSearchChange={handleSearchChange}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onAddCard={(type) => addCard(type)}
        onAddImageFile={handleAddImageFile}
        onOpenConnectDialog={() => {
          setConnectDialogSourceId(undefined)
          setIsConnectDialogOpen(true)
        }}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onOpenHelp={() => setIsHelpDialogOpen(true)}
        onToggleStatus={onToggleStatus}
        onRetrySave={() => {
          void autosave.flush()
        }}
        onSaveNow={onSave ? saveNow : undefined}
        onCopyToMyCanvases={onCopyToMyCanvases}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 items-stretch relative">
        <div className="learning-canvas-wrapper flex-1 min-w-0 min-h-0 lg:h-full relative">
          <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
            <defs>
              <marker
                id="learning-arrow-end"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-navy-800)" />
              </marker>
              <marker
                id="learning-arrow-start"
                viewBox="0 0 10 10"
                refX="2"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 8 1.5 L 0 5 L 8 8.5 z" fill="var(--color-navy-800)" />
              </marker>
            </defs>
          </svg>

          <div
            ref={boardRef}
            tabIndex={-1}
            className="w-full h-full outline-none"
            data-testid="learning-canvas-board"
            onKeyDownCapture={handleKeyDownCapture}
            onMouseDownCapture={handleBoardMouseDownCapture}
            onMouseMove={handleBoardMouseMove}
            onMouseLeave={() => onPublishCursor?.(null)}
          >
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onDoubleClick={handleBoardDoubleClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              snapToGrid={snapToGrid}
              snapGrid={[20, 20]}
              minZoom={CANVAS_MIN_ZOOM}
              maxZoom={CANVAS_MAX_ZOOM}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable={true}
              selectionOnDrag={!readOnly}
              panOnDrag={readOnly ? true : [1, 2]}
              zoomOnDoubleClick={false}
              deleteKeyCode={null}
              fitView
              proOptions={{ hideAttribution: true }}
              className="learning-flow-container"
            >
              <CanvasControls />
            </ReactFlow>
            <ViewportPortal>
              <svg className="learning-canvas-cursors" aria-hidden="false">
                {remoteCursors.map((cursor) => (
                  <g
                    key={cursor.uid}
                    className="learning-canvas-cursor"
                    transform={`translate(${cursor.x} ${cursor.y})`}
                    role="img"
                    aria-label={`${cursor.name} cursor`}
                  >
                    <path className="learning-canvas-cursor__pointer" d="M 0 0 L 0 18 L 5 13 L 10 23 L 14 21 L 9 11 L 16 10 Z" />
                    <rect className="learning-canvas-cursor__label" x="14" y="14" width={Math.max(42, cursor.name.length * 8 + 12)} height="22" rx="8" />
                    <text className="learning-canvas-cursor__name" x="20" y="29">{cursor.name}</text>
                  </g>
                ))}
              </svg>
            </ViewportPortal>
          </div>

          {connectNotice && (
            <ConnectionNotice
              key={connectNotice.key}
              message={connectNotice.message}
              onDismiss={dismissConnectNotice}
            />
          )}

          {quickAddState && (
            <QuickAddMenu
              position={quickAddState.screenPos}
              onSelect={(type) => {
                addCard(type, quickAddState.flowPos, quickAddState.sourceNodeId)
                setQuickAddState(null)
              }}
              onClose={() => setQuickAddState(null)}
            />
          )}
        </div>

        {isOutlineOpen && (
          <CanvasOutlineView
            nodes={currentDomain.nodes}
            edges={currentDomain.edges}
            readOnly={readOnly}
            onJumpToNode={handleJumpToNode}
            onConnectFromNode={handleConnectFromNode}
            onDeleteNode={deleteNode}
            onClose={() => setIsOutlineOpen(false)}
          />
        )}
      </div>

      {/* Mounted only while open so its source/target selects start from the current cards. */}
      {isConnectDialogOpen && (
        <ConnectCardsDialog
          open
          onClose={() => setIsConnectDialogOpen(false)}
          nodes={currentDomain.nodes}
          initialSourceId={connectDialogSourceId}
          onConnect={handleConnectDialogSubmit}
        />
      )}

      <ReferencePickerDialog
        open={Boolean(pickerForNodeId)}
        onClose={() => setPickerForNodeId(null)}
        items={availableReferences}
        onSelect={(refType, refId) => {
          if (pickerForNodeId) {
            updateNode(pickerForNodeId, { reference: { refType, refId } })
            setPickerForNodeId(null)
          }
        }}
      />

      <ShortcutsHelpDialog open={isHelpDialogOpen} onClose={() => setIsHelpDialogOpen(false)} />

      {importResult && (
        <LossyImportDialog
          open
          onClose={() => setImportResult(null)}
          importResult={importResult}
          onConfirmReplace={handleConfirmReplace}
          mode="editor"
        />
      )}

      <VersionConflictDialog
        open={isConflictDialogOpen}
        onClose={() => setIsConflictDialogOpen(false)}
        onReload={async () => {
          if (!onReloadLatest) return
          const reloaded = await onReloadLatest()
          if (reloaded) {
            history.clear()
            applySnapshot({ nodes: reloaded.nodes, edges: reloaded.edges })
            autosave.markSaved()
            announce('Canvas reloaded from server')
          }
        }}
        onKeepMine={async () => {
          if (!onSave) return
          try {
            await onSave(toSavableContent(readContent()), { force: true })
            autosave.markSaved()
            announce('Overwritten with local changes')
          } catch {
            announce('Could not overwrite the saved canvas. Try again.')
          }
        }}
      />
    </div>
  )
}

/**
 * Public LearningCanvas component wrapped with ReactFlowProvider
 * and ExpandableCanvasContainer for full-width responsive display.
 */
export function LearningCanvas(props: LearningCanvasProps) {
  return (
    <ExpandableCanvasContainer title={props.title}>
      <ReactFlowProvider>
        <LearningCanvasInternal {...props} />
      </ReactFlowProvider>
    </ExpandableCanvasContainer>
  )
}
