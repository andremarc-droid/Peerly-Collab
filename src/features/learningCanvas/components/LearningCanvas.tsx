import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '../learningCanvas.css'

import { TextCard } from './TextCard'
import { LinkCard } from './LinkCard'
import { ReferenceCard, type ResolvedReferenceInfo } from './ReferenceCard'
import { GroupNode } from './GroupNode'
import { LearningCanvasEdge } from './LearningCanvasEdge'
import { LearningCanvasToolbar, type AutosaveStatus } from './LearningCanvasToolbar'
import { CanvasOutlineView } from './CanvasOutlineView'
import { QuickAddMenu } from './QuickAddMenu'
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

import type {
  LearningCanvasContent,
  LearningCanvasNode,
  LearningCanvasEdge as DomainEdge,
  LearningCanvasNodeType,
  LearningCanvasColor,
  LearningCanvasArrow,
  LearningCanvasRefType,
} from '../types'

import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from '../jsonCanvas'
import { newNodePlacement, clampNode } from '../schemas'

interface LearningCanvasProps {
  initialContent: LearningCanvasContent
  title?: string
  readOnly?: boolean
  canEditStatus?: boolean
  status?: 'draft' | 'published'
  availableReferences?: ResolvedReferenceInfo[]
  onSave?: (content: LearningCanvasContent) => Promise<void>
  onToggleStatus?: () => void
  onCopyToMyCanvases?: () => void
  onReloadLatest?: () => Promise<LearningCanvasContent | void>
}

const nodeTypes = {
  text: TextCard,
  link: LinkCard,
  reference: ReferenceCard,
  group: GroupNode,
}

const edgeTypes = {
  learningEdge: LearningCanvasEdge,
}

function LearningCanvasInternal({
  initialContent,
  title = 'Learning Canvas',
  readOnly = false,
  canEditStatus = false,
  status = 'draft',
  availableReferences = [],
  onSave,
  onToggleStatus,
  onCopyToMyCanvases,
  onReloadLatest,
}: LearningCanvasProps) {
  const { fitView, screenToFlowPosition } = useReactFlow()

  // State: snap to grid (20px)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [isOutlineOpen, setIsOutlineOpen] = useState(false)
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('saved')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [matchingNodeIds, setMatchingNodeIds] = useState<string[]>([])
  const [searchIndex, setSearchIndex] = useState(0)

  // Live accessibility announcements
  const [liveMessage, setLiveMessage] = useState('')
  const announce = (msg: string) => setLiveMessage(msg)

  // Quick-add menu state
  const [quickAddState, setQuickAddState] = useState<{
    isOpen: boolean
    screenPos: { x: number; y: number }
    flowPos: { x: number; y: number }
    sourceHandle?: { nodeId: string; handleId: string }
  } | null>(null)

  // Dialogs
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false)
  const [connectDialogSourceId, setConnectDialogSourceId] = useState<string | undefined>()
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false)
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [pickerForNodeId, setPickerForNodeId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)

  // Map domain nodes to ReactFlow nodes
  const mapDomainNodesToFlow = useCallback(
    (domainNodes: LearningCanvasNode[]): Node[] => {
      return domainNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.x, y: n.y },
        style: { width: n.width, height: n.height },
        data: {
          ...n,
          readOnly,
          isHighlighted: matchingNodeIds.includes(n.id),
          resolvedInfo: n.reference
            ? availableReferences.find((r) => r.id === n.reference?.refId)
            : undefined,
          onUpdate: handleNodeUpdate,
          onDelete: handleNodeDelete,
          onPickReference: (nodeId: string) => setPickerForNodeId(nodeId),
          onOpenReference: handleOpenReference,
        },
      }))
    },
    [readOnly, matchingNodeIds, availableReferences]
  )

  // Map domain edges to ReactFlow edges
  const mapDomainEdgesToFlow = useCallback(
    (domainEdges: DomainEdge[]): Edge[] => {
      return domainEdges.map((e) => ({
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
          onUpdateEdge: handleEdgeUpdate,
          onDeleteEdge: handleEdgeDelete,
        },
      }))
    },
    [readOnly]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(mapDomainNodesToFlow(initialContent.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(mapDomainEdgesToFlow(initialContent.edges))

  // Undo / Redo history stack (cap 50)
  const historyRef = useRef<{ nodes: LearningCanvasNode[]; edges: DomainEdge[] }[]>([])
  const historyIndexRef = useRef<number>(-1)
  const isUndoRedoAction = useRef(false)

  // Extract domain representation
  const getCurrentDomainContent = useCallback((): LearningCanvasContent => {
    const domainNodes: LearningCanvasNode[] = nodes.map((n) => {
      const data = n.data as unknown as Record<string, unknown>
      const width = typeof n.style?.width === 'number' ? n.style.width : (n.measured?.width ?? 240)
      const height = typeof n.style?.height === 'number' ? n.style.height : (n.measured?.height ?? 140)

      const baseNode = {
        id: n.id,
        type: n.type as LearningCanvasNodeType,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        width: Math.round(width),
        height: Math.round(height),
        color: (data.color as LearningCanvasColor) || 'none',
      }

      if (n.type === 'text') {
        return clampNode({ ...baseNode, text: (data.text as string) || '' })
      }
      if (n.type === 'link') {
        return clampNode({ ...baseNode, link: data.link as { url: string; title?: string; note?: string } })
      }
      if (n.type === 'reference') {
        return clampNode({ ...baseNode, reference: data.reference as { refType: LearningCanvasRefType; refId: string } })
      }
      if (n.type === 'group') {
        return clampNode({ ...baseNode, group: data.group as { label?: string } })
      }
      return clampNode(baseNode as unknown as LearningCanvasNode)
    })

    const domainEdges: DomainEdge[] = edges.map((e) => {
      const data = e.data as unknown as Record<string, unknown>
      return {
        id: e.id,
        from: e.source,
        to: e.target,
        fromSide: (e.sourceHandle as DomainEdge['fromSide']) || undefined,
        toSide: (e.targetHandle as DomainEdge['toSide']) || undefined,
        label: (data?.label as string) || undefined,
        arrow: (data?.arrow as LearningCanvasArrow) || 'to',
      }
    })

    return {
      version: 1,
      nodes: domainNodes,
      edges: domainEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    }
  }, [nodes, edges])

  // Push snapshot
  const pushHistorySnapshot = useCallback(() => {
    if (readOnly || isUndoRedoAction.current) return
    const current = getCurrentDomainContent()
    const history = historyRef.current.slice(0, historyIndexRef.current + 1)
    history.push({ nodes: current.nodes, edges: current.edges })
    if (history.length > 50) history.shift()
    historyRef.current = history
    historyIndexRef.current = history.length - 1
  }, [readOnly, getCurrentDomainContent])

  // Initialize history
  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = [{ nodes: initialContent.nodes, edges: initialContent.edges }]
      historyIndexRef.current = 0
    }
  }, [initialContent])

  // Debounced Autosave (2s)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDirtyRef = useRef(false)

  const triggerAutosave = useCallback(() => {
    if (readOnly || !onSave) return
    isDirtyRef.current = true
    setAutosaveStatus('unsaved')

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        setAutosaveStatus('saving')
        const content = getCurrentDomainContent()
        await onSave(content)
        isDirtyRef.current = false
        setAutosaveStatus('saved')
      } catch (err) {
        setAutosaveStatus('error')
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('modified in another session') || msg.includes('conflict')) {
          setIsConflictDialogOpen(true)
        }
      }
    }, 2000)
  }, [readOnly, onSave, getCurrentDomainContent])

  // Browser unsaved changes guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Manual retry save
  const handleRetrySave = async () => {
    if (!onSave) return
    try {
      setAutosaveStatus('saving')
      const content = getCurrentDomainContent()
      await onSave(content)
      isDirtyRef.current = false
      setAutosaveStatus('saved')
    } catch {
      setAutosaveStatus('error')
    }
  }

  // Node Mutations
  function handleNodeUpdate(id: string, updates: Partial<LearningCanvasNode>) {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            style: {
              ...n.style,
              width: updates.width ?? n.style?.width,
              height: updates.height ?? n.style?.height,
            },
            data: {
              ...n.data,
              ...updates,
            },
          }
        }
        return n
      })
    )
    pushHistorySnapshot()
    triggerAutosave()
  }

  function handleNodeDelete(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    announce('Card deleted')
    pushHistorySnapshot()
    triggerAutosave()
  }

  function handleEdgeUpdate(id: string, updates: { label?: string; arrow?: LearningCanvasArrow }) {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id === id) {
          return {
            ...e,
            data: {
              ...e.data,
              ...updates,
            },
          }
        }
        return e
      })
    )
    pushHistorySnapshot()
    triggerAutosave()
  }

  function handleEdgeDelete(id: string) {
    setEdges((eds) => eds.filter((e) => e.id !== id))
    announce('Connection removed')
    pushHistorySnapshot()
    triggerAutosave()
  }

  function handleOpenReference(refType: LearningCanvasRefType, refId: string) {
    if (refType === 'module') {
      window.open(`/student/modules/${refId}`, '_blank')
    } else if (refType === 'quiz') {
      window.open(`/student/quizzes/${refId}`, '_blank')
    } else if (refType === 'learning') {
      window.open(`/student/learning/${refId}`, '_blank')
    }
  }

  // Connect handler
  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'learningEdge',
            data: {
              arrow: 'to',
              readOnly,
              onUpdateEdge: handleEdgeUpdate,
              onDeleteEdge: handleEdgeDelete,
            },
          },
          eds
        )
      )
      announce('Cards connected')
      pushHistorySnapshot()
      triggerAutosave()
    },
    [readOnly, pushHistorySnapshot, triggerAutosave]
  )

  // Drag handle into empty space -> open quick-add menu
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (readOnly || connectionState.isValid || !connectionState.fromNode) return

      const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0]?.clientX ?? 0
      const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0]?.clientY ?? 0

      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })

      setQuickAddState({
        isOpen: true,
        screenPos: { x: clientX, y: clientY },
        flowPos,
        sourceHandle: {
          nodeId: connectionState.fromNode.id,
          handleId: connectionState.fromHandle?.id ?? 'right',
        },
      })
    },
    [readOnly, screenToFlowPosition]
  )

  // Double click pane -> add text card
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (readOnly) return
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const newId = `node_${Date.now()}`
      const newNode: Node = {
        id: newId,
        type: 'text',
        position: flowPos,
        style: { width: 240, height: 140 },
        data: {
          id: newId,
          type: 'text',
          text: '',
          color: 'none',
          readOnly,
          onUpdate: handleNodeUpdate,
          onDelete: handleNodeDelete,
        },
      }
      setNodes((nds) => [...nds, newNode])
      announce('Text card created')
      pushHistorySnapshot()
      triggerAutosave()
    },
    [readOnly, screenToFlowPosition, pushHistorySnapshot, triggerAutosave]
  )

  // Add Card from Toolbar or QuickAdd
  const handleAddCard = useCallback(
    (type: LearningCanvasNodeType, targetPos?: { x: number; y: number }, connectFromNodeId?: string) => {
      if (readOnly) return
      const newId = `node_${Date.now()}`
      const existingDomainNodes = getCurrentDomainContent().nodes
      const pos = targetPos || newNodePlacement(existingDomainNodes)

      const baseData = {
        id: newId,
        type,
        color: (type === 'group' ? 'tint' : 'none') as LearningCanvasColor,
        readOnly,
        onUpdate: handleNodeUpdate,
        onDelete: handleNodeDelete,
        onPickReference: (nodeId: string) => setPickerForNodeId(nodeId),
        onOpenReference: handleOpenReference,
      }

      let extraData = {}
      let size = { width: 240, height: 140 }

      if (type === 'text') extraData = { text: '' }
      else if (type === 'link') extraData = { link: { url: 'https://' } }
      else if (type === 'reference') extraData = { reference: { refType: 'module', refId: '' } }
      else if (type === 'group') {
        extraData = { group: { label: 'New Group' } }
        size = { width: 360, height: 260 }
      }

      const newNode: Node = {
        id: newId,
        type,
        position: pos,
        style: size,
        data: { ...baseData, ...extraData },
      }

      setNodes((nds) => [...nds, newNode])

      if (connectFromNodeId) {
        const newEdge: Edge = {
          id: `edge_${Date.now()}`,
          source: connectFromNodeId,
          target: newId,
          type: 'learningEdge',
          data: {
            arrow: 'to',
            readOnly,
            onUpdateEdge: handleEdgeUpdate,
            onDeleteEdge: handleEdgeDelete,
          },
        }
        setEdges((eds) => [...eds, newEdge])
      }

      announce(`${type} card added`)
      pushHistorySnapshot()
      triggerAutosave()
    },
    [readOnly, getCurrentDomainContent, pushHistorySnapshot, triggerAutosave]
  )

  // Group Dragging Child Movement
  const groupDragRef = useRef<{
    groupId: string
    initialPos: { x: number; y: number }
    containedNodes: Array<{ id: string; initialX: number; initialY: number }>
  } | null>(null)

  const onNodeDragStart: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      if (node.type !== 'group') return

      const groupWidth = typeof node.style?.width === 'number' ? node.style.width : (node.measured?.width ?? 360)
      const groupHeight = typeof node.style?.height === 'number' ? node.style.height : (node.measured?.height ?? 260)

      const groupMinX = node.position.x
      const groupMinY = node.position.y
      const groupMaxX = groupMinX + groupWidth
      const groupMaxY = groupMinY + groupHeight

      const contained = nodes
        .filter((n) => {
          if (n.id === node.id || n.type === 'group') return false
          const nW = typeof n.style?.width === 'number' ? n.style.width : (n.measured?.width ?? 240)
          const nH = typeof n.style?.height === 'number' ? n.style.height : (n.measured?.height ?? 140)
          return (
            n.position.x >= groupMinX &&
            n.position.y >= groupMinY &&
            n.position.x + nW <= groupMaxX &&
            n.position.y + nH <= groupMaxY
          )
        })
        .map((n) => ({
          id: n.id,
          initialX: n.position.x,
          initialY: n.position.y,
        }))

      groupDragRef.current = {
        groupId: node.id,
        initialPos: { ...node.position },
        containedNodes: contained,
      }
    },
    [nodes]
  )

  const onNodeDrag: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      if (groupDragRef.current && groupDragRef.current.groupId === node.id) {
        const dx = node.position.x - groupDragRef.current.initialPos.x
        const dy = node.position.y - groupDragRef.current.initialPos.y

        setNodes((nds) =>
          nds.map((n) => {
            const match = groupDragRef.current?.containedNodes.find((c) => c.id === n.id)
            if (match) {
              return {
                ...n,
                position: {
                  x: match.initialX + dx,
                  y: match.initialY + dy,
                },
              }
            }
            return n
          })
        )
      }
    },
    [setNodes]
  )

  const onNodeDragStop = useCallback(() => {
    groupDragRef.current = null
    pushHistorySnapshot()
    triggerAutosave()
  }, [pushHistorySnapshot, triggerAutosave])

  // Undo and Redo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    isUndoRedoAction.current = true
    const targetIdx = historyIndexRef.current - 1
    const snapshot = historyRef.current[targetIdx]
    historyIndexRef.current = targetIdx

    setNodes(mapDomainNodesToFlow(snapshot.nodes))
    setEdges(mapDomainEdgesToFlow(snapshot.edges))
    announce('Undo performed')
    triggerAutosave()
    setTimeout(() => {
      isUndoRedoAction.current = false
    }, 50)
  }, [mapDomainNodesToFlow, mapDomainEdgesToFlow, triggerAutosave])

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    isUndoRedoAction.current = true
    const targetIdx = historyIndexRef.current + 1
    const snapshot = historyRef.current[targetIdx]
    historyIndexRef.current = targetIdx

    setNodes(mapDomainNodesToFlow(snapshot.nodes))
    setEdges(mapDomainEdgesToFlow(snapshot.edges))
    announce('Redo performed')
    triggerAutosave()
    setTimeout(() => {
      isUndoRedoAction.current = false
    }, 50)
  }, [mapDomainNodesToFlow, mapDomainEdgesToFlow, triggerAutosave])

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        Boolean(activeEl?.getAttribute('contenteditable'))

      if (isInput) return

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (readOnly) return
        const selectedNodes = nodes.filter((n) => n.selected)
        if (selectedNodes.length === 0) return
        const newNodes = selectedNodes.map((n) => {
          const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 30, y: n.position.y + 30 },
            selected: true,
            data: { ...n.data, id: newId },
          }
        })
        setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
        announce('Selected cards duplicated')
        pushHistorySnapshot()
        triggerAutosave()
        return
      }

      // Select All (Ctrl+A)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })))
        announce('All cards selected')
        return
      }

      // Delete (Delete / Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (readOnly) return
        const hasSelected = nodes.some((n) => n.selected) || edges.some((e) => e.selected)
        if (hasSelected) {
          e.preventDefault()
          setNodes((nds) => nds.filter((n) => !n.selected))
          setEdges((eds) => eds.filter((e) => !e.selected && !nodes.some((n) => n.selected && (n.id === e.source || n.id === e.target))))
          announce('Selected items deleted')
          pushHistorySnapshot()
          triggerAutosave()
        }
        return
      }

      // N: Add text card
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleAddCard('text')
        return
      }

      // G: Add group
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleAddCard('group')
        return
      }

      // F: Fit view
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        fitView({ duration: 300 })
        return
      }

      // /: Focus search
      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[type="search"]')
        searchInput?.focus()
        return
      }

      // ?: Help dialog
      if (e.key === '?') {
        e.preventDefault()
        setIsHelpDialogOpen(true)
        return
      }

      // Nudge with arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (readOnly) return
        const step = e.shiftKey ? 20 : 5
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowUp') dy = -step
        if (e.key === 'ArrowDown') dy = step
        if (e.key === 'ArrowLeft') dx = -step
        if (e.key === 'ArrowRight') dx = step

        const selectedCount = nodes.filter((n) => n.selected).length
        if (selectedCount > 0) {
          e.preventDefault()
          setNodes((nds) =>
            nds.map((n) => {
              if (n.selected) {
                return {
                  ...n,
                  position: { x: n.position.x + dx, y: n.position.y + dy },
                }
              }
              return n
            })
          )
          pushHistorySnapshot()
          triggerAutosave()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    readOnly,
    nodes,
    edges,
    handleUndo,
    handleRedo,
    handleAddCard,
    fitView,
    pushHistorySnapshot,
    triggerAutosave,
  ])

  // Search filter and highlight
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatchingNodeIds([])
      setSearchIndex(0)
      return
    }

    const q = searchQuery.toLowerCase()
    const matches = nodes
      .filter((n) => {
        const data = n.data as Record<string, unknown>
        if (n.type === 'text') return ((data.text as string) || '').toLowerCase().includes(q)
        if (n.type === 'link') {
          const l = data.link as { title?: string; note?: string; url?: string }
          return (
            (l?.title || '').toLowerCase().includes(q) ||
            (l?.note || '').toLowerCase().includes(q) ||
            (l?.url || '').toLowerCase().includes(q)
          )
        }
        if (n.type === 'reference') {
          const info = data.resolvedInfo as ResolvedReferenceInfo | undefined
          return (info?.title || '').toLowerCase().includes(q)
        }
        if (n.type === 'group') {
          const g = data.group as { label?: string }
          return (g?.label || '').toLowerCase().includes(q)
        }
        return false
      })
      .map((n) => n.id)

    setMatchingNodeIds(matches)
    setSearchIndex(0)

    if (matches.length > 0) {
      const matchNode = nodes.find((n) => n.id === matches[0])
      if (matchNode) {
        fitView({ nodes: [matchNode], duration: 300, maxZoom: 1.2 })
      }
    }
  }, [searchQuery, nodes, fitView])

  const handleSearchNext = () => {
    if (matchingNodeIds.length === 0) return
    const nextIdx = (searchIndex + 1) % matchingNodeIds.length
    setSearchIndex(nextIdx)
    const matchNode = nodes.find((n) => n.id === matchingNodeIds[nextIdx])
    if (matchNode) {
      fitView({ nodes: [matchNode], duration: 300, maxZoom: 1.2 })
    }
  }

  const handleSearchPrev = () => {
    if (matchingNodeIds.length === 0) return
    const prevIdx = (searchIndex - 1 + matchingNodeIds.length) % matchingNodeIds.length
    setSearchIndex(prevIdx)
    const matchNode = nodes.find((n) => n.id === matchingNodeIds[prevIdx])
    if (matchNode) {
      fitView({ nodes: [matchNode], duration: 300, maxZoom: 1.2 })
    }
  }

  // Export .canvas
  const handleExport = () => {
    const domainContent = getCurrentDomainContent()
    const jsonString = toJsonCanvas(domainContent, title)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'canvas'}.canvas`
    a.click()
    URL.revokeObjectURL(url)
    announce('Canvas exported')
  }

  // Import .canvas
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const result = fromJsonCanvas(text)
      setImportResult(result)
    } catch {
      announce('Failed to read canvas file')
    }
  }

  const handleConfirmReplace = () => {
    if (!importResult) return
    setNodes(mapDomainNodesToFlow(importResult.content.nodes))
    setEdges(mapDomainEdgesToFlow(importResult.content.edges))
    setImportResult(null)
    announce('Canvas replaced with imported file')
    pushHistorySnapshot()
    triggerAutosave()
  }

  // Outline View actions
  const handleJumpToNode = (id: string) => {
    const node = nodes.find((n) => n.id === id)
    if (node) {
      fitView({ nodes: [node], duration: 300, maxZoom: 1.2 })
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })))
    }
  }

  const handleConnectFromNode = (id: string) => {
    setConnectDialogSourceId(id)
    setIsConnectDialogOpen(true)
  }

  // Keyboard Connect Dialog submit
  const handleConnectDialogSubmit = (
    srcId: string,
    tgtId: string,
    arrow: LearningCanvasArrow,
    label?: string
  ) => {
    const newEdge: Edge = {
      id: `edge_${Date.now()}`,
      source: srcId,
      target: tgtId,
      type: 'learningEdge',
      data: {
        label,
        arrow,
        readOnly,
        onUpdateEdge: handleEdgeUpdate,
        onDeleteEdge: handleEdgeDelete,
      },
    }
    setEdges((eds) => [...eds, newEdge])
    announce('Cards connected via keyboard')
    pushHistorySnapshot()
    triggerAutosave()
  }

  // Domain nodes & edges for outline view
  const currentDomainContent = useMemo(() => getCurrentDomainContent(), [getCurrentDomainContent])

  return (
    <div className="flex flex-col h-full w-full gap-3" data-testid="learning-canvas-root">
      {/* Invisible screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {/* Top Toolbar */}
      <LearningCanvasToolbar
        readOnly={readOnly}
        canEditStatus={canEditStatus}
        status={status}
        autosaveStatus={autosaveStatus}
        snapToGrid={snapToGrid}
        canUndo={historyIndexRef.current > 0}
        canRedo={historyIndexRef.current < historyRef.current.length - 1}
        isOutlineOpen={isOutlineOpen}
        searchQuery={searchQuery}
        searchMatchCount={matchingNodeIds.length}
        searchMatchIndex={searchIndex}
        onToggleSnapToGrid={() => setSnapToGrid(!snapToGrid)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
        onSearchChange={setSearchQuery}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onAddCard={(type) => handleAddCard(type)}
        onOpenConnectDialog={() => {
          setConnectDialogSourceId(undefined)
          setIsConnectDialogOpen(true)
        }}
        onExport={handleExport}
        onImportFile={handleImportFile}
        onOpenHelp={() => setIsHelpDialogOpen(true)}
        onToggleStatus={onToggleStatus}
        onRetrySave={handleRetrySave}
        onCopyToMyCanvases={onCopyToMyCanvases}
      />

      {/* Main Board + Outline View split container */}
      <div className="flex-1 min-h-0 flex gap-3 items-stretch relative">
        {/* ReactFlow Whiteboard Container */}
        <div className="learning-canvas-wrapper flex-1 min-w-0 h-full relative">
          {/* SVG Arrow Marker definitions */}
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

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onDoubleClick={onPaneDoubleClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            snapToGrid={snapToGrid}
            snapGrid={[20, 20]}
            minZoom={CANVAS_MIN_ZOOM}
            maxZoom={CANVAS_MAX_ZOOM}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={true}
            selectionOnDrag={!readOnly}
            panOnDrag={readOnly ? true : [1, 2]}
            fitView
            proOptions={{ hideAttribution: true }}
            className="learning-flow-container"
          >
            <CanvasControls />
          </ReactFlow>

          {/* Quick Add Menu upon drag release in empty space */}
          {quickAddState?.isOpen && (
            <QuickAddMenu
              position={quickAddState.screenPos}
              onSelect={(type) => {
                const srcId = quickAddState.sourceHandle?.nodeId
                handleAddCard(type, quickAddState.flowPos, srcId)
                setQuickAddState(null)
              }}
              onClose={() => setQuickAddState(null)}
            />
          )}
        </div>

        {/* Outline View Drawer */}
        {isOutlineOpen && (
          <CanvasOutlineView
            nodes={currentDomainContent.nodes}
            edges={currentDomainContent.edges}
            readOnly={readOnly}
            onJumpToNode={handleJumpToNode}
            onConnectFromNode={handleConnectFromNode}
            onDeleteNode={(id) => handleNodeDelete(id)}
            onClose={() => setIsOutlineOpen(false)}
          />
        )}
      </div>

      {/* Accessible Dialogs */}
      <ConnectCardsDialog
        open={isConnectDialogOpen}
        onClose={() => setIsConnectDialogOpen(false)}
        nodes={currentDomainContent.nodes}
        initialSourceId={connectDialogSourceId}
        onConnect={handleConnectDialogSubmit}
      />

      <ReferencePickerDialog
        open={Boolean(pickerForNodeId)}
        onClose={() => setPickerForNodeId(null)}
        items={availableReferences}
        onSelect={(refType, refId) => {
          if (pickerForNodeId) {
            handleNodeUpdate(pickerForNodeId, { reference: { refType, refId } })
          }
        }}
      />

      <ShortcutsHelpDialog
        open={isHelpDialogOpen}
        onClose={() => setIsHelpDialogOpen(false)}
      />

      {importResult && (
        <LossyImportDialog
          open={Boolean(importResult)}
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
          if (onReloadLatest) {
            const reloaded = await onReloadLatest()
            if (reloaded) {
              setNodes(mapDomainNodesToFlow(reloaded.nodes))
              setEdges(mapDomainEdgesToFlow(reloaded.edges))
              isDirtyRef.current = false
              setAutosaveStatus('saved')
              announce('Canvas reloaded from server')
            }
          }
        }}
        onKeepMine={async () => {
          if (onSave) {
            const content = getCurrentDomainContent()
            await onSave(content)
            isDirtyRef.current = false
            setAutosaveStatus('saved')
            announce('Overwritten with local changes')
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
