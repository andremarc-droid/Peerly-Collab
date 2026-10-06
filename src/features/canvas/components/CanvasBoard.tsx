import { useCallback, useMemo, useState } from 'react'
import {
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
} from '@xyflow/react'
import '../canvas.css'
import { cardsToNodes, connectionsToEdges, edgeToConnection, nodesToPositions, stringToCanvasConnection, type ConnectionStatus } from '../mapping'
import { normalizeConnection } from '../schemas'
import type { CanvasCard, CanvasConnection } from '../types'
import { canvasEdgeTypes } from './edges/edgeTypes'
import { canvasNodeTypes } from './nodes/nodeTypes'
import { CanvasControls } from './CanvasControls'

export type CanvasBoardMode = 'edit' | 'play' | 'review'

export interface CanvasBoardProps {
  cards: CanvasCard[]
  connections: (CanvasConnection | string)[]
  mode?: CanvasBoardMode
  directed?: boolean
  maxConnections?: number
  positions?: Record<string, { x: number; y: number }>
  statusByConnection?: Record<string, ConnectionStatus>
  onConnectionsChange?: (connections: CanvasConnection[]) => void
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void
  onCardsChange?: (cards: CanvasCard[]) => void
  onCardClick?: (card: CanvasCard) => void
  onConnectionClick?: (connection: CanvasConnection) => void
  connectCardsDialogSlot?: React.ReactNode
  className?: string
}

function CanvasBoardInner({
  cards = [],
  connections = [],
  mode = 'play',
  directed = true,
  maxConnections = 80,
  positions,
  statusByConnection,
  onConnectionsChange,
  onPositionsChange,
  onCardsChange,
  onCardClick,
  onConnectionClick,
  connectCardsDialogSlot,
  className = '',
}: CanvasBoardProps) {
  const [liveAnnouncement, setLiveAnnouncement] = useState('')

  const isEditMode = mode === 'edit'

  // Map initial nodes and edges
  const initialNodes = useMemo(
    () => cardsToNodes(cards, positions, { readOnly: !isEditMode, deletable: isEditMode }),
    [cards, positions, isEditMode],
  )
  const initialEdges = useMemo(
    () => connectionsToEdges(connections, directed, statusByConnection),
    [connections, directed, statusByConnection],
  )

  const [nodes, setNodes] = useState<Node[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)

  // Stable signature of card ids, contents, titles, URLs, and positions
  const cardsSignature = useMemo(
    () =>
      cards
        .map((c) => {
          const p = positions?.[c.id] ?? c.position
          return `${c.id}:${c.type}:${c.title ?? ''}:${c.content}:${c.url ?? ''}:${c.driveFileId ?? ''}:${p?.x ?? 0},${p?.y ?? 0}`
        })
        .join('|') + `::${mode}`,
    [cards, positions, mode],
  )

  // Stable signature of connection ids, endpoints, points, and review statuses
  const edgesSignature = useMemo(
    () =>
      connections
        .map((c) => {
          const conn = stringToCanvasConnection(c, directed)
          if (!conn) return ''
          const normKey = normalizeConnection(conn.from, conn.to, directed)
          const st = statusByConnection?.[conn.id] ?? statusByConnection?.[normKey] ?? ''
          return `${conn.id}:${conn.from}:${conn.to}:${conn.points ?? ''}:${st}`
        })
        .filter(Boolean)
        .join('|') + `::${directed}`,
    [connections, directed, statusByConnection],
  )

  // Synchronize incoming prop changes while preserving dragged positions
  const [prevCardsSig, setPrevCardsSig] = useState(cardsSignature)
  if (cardsSignature !== prevCardsSig) {
    setPrevCardsSig(cardsSignature)
    setNodes((currentNodes) => {
      const currentPositions: Record<string, { x: number; y: number }> = {}
      for (const n of currentNodes) {
        currentPositions[n.id] = { x: n.position.x, y: n.position.y }
      }
      return cardsToNodes(cards, { ...currentPositions, ...positions }, { readOnly: !isEditMode, deletable: isEditMode })
    })
  }

  const [prevEdgesSig, setPrevEdgesSig] = useState(edgesSignature)
  if (edgesSignature !== prevEdgesSig) {
    setPrevEdgesSig(edgesSignature)
    setEdges(initialEdges)
  }

  // Normalization helper matching canvas/schemas.normalizeConnection
  const getNormalizedEdgeId = useCallback(
    (source: string, target: string) => normalizeConnection(source, target, directed),
    [directed],
  )

  // Handle new connection creation
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (mode === 'review') return
      if (!connection.source || !connection.target) return

      // Enforce: no self-connections
      if (connection.source === connection.target) return

      // Convert current connections into domain list, dropping unparseable strings
      const currentList: CanvasConnection[] = connections
        .map((c) => stringToCanvasConnection(c, directed))
        .filter((c): c is CanvasConnection => c !== null)

      // Enforce: max connections cap
      if (currentList.length >= maxConnections) {
        setLiveAnnouncement('Limit reached')
        return
      }

      // Enforce: no duplicates using normalizeConnection
      const newEdgeId = getNormalizedEdgeId(connection.source, connection.target)
      const isDuplicate = currentList.some((existing) => {
        const existingNorm = getNormalizedEdgeId(existing.from, existing.to)
        return existingNorm === newEdgeId
      })

      if (isDuplicate) return

      const newConnection: CanvasConnection = {
        id: newEdgeId,
        from: connection.source,
        to: connection.target,
      }

      const updated = [...currentList, newConnection]
      setLiveAnnouncement('Connection added')
      onConnectionsChange?.(updated)
    },
    [mode, connections, directed, maxConnections, getNormalizedEdgeId, onConnectionsChange],
  )

  // Handle edge deletion via Delete key or interaction
  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (mode === 'review') return
      const deletedIds = new Set(deletedEdges.map((e) => e.id))

      const currentList: CanvasConnection[] = connections
        .map((c) => stringToCanvasConnection(c, directed))
        .filter((c): c is CanvasConnection => c !== null)

      const remaining = currentList.filter((c) => {
        const norm = getNormalizedEdgeId(c.from, c.to)
        return !deletedIds.has(c.id) && !deletedIds.has(norm)
      })

      setLiveAnnouncement('Connection removed')
      onConnectionsChange?.(remaining)
    },
    [mode, connections, directed, getNormalizedEdgeId, onConnectionsChange],
  )

  // Handle node drag stop: persist coordinates
  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: Node, allNodes: Node[]) => {
      if (mode === 'review') return
      const updatedPositions = nodesToPositions(allNodes)
      onPositionsChange?.(updatedPositions)
    },
    [mode, onPositionsChange],
  )

  // Handle node deletion in edit mode
  const handleNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      if (mode !== 'edit') return
      const deletedIds = new Set(deletedNodes.map((n) => n.id))

      const remainingCards = cards.filter((c) => !deletedIds.has(c.id))
      onCardsChange?.(remainingCards)

      const remainingConnections = connections
        .map((c) => stringToCanvasConnection(c, directed))
        .filter((c): c is CanvasConnection => c !== null)
        .filter((c) => !deletedIds.has(c.from) && !deletedIds.has(c.to))
      onConnectionsChange?.(remainingConnections)
    },
    [mode, cards, connections, directed, onCardsChange, onConnectionsChange],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
    },
    [],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    [],
  )

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const card = cards.find((c) => c.id === node.id)
      if (card) onCardClick?.(card)
    },
    [cards, onCardClick],
  )

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const conn = edgeToConnection(edge)
      onConnectionClick?.(conn)
    },
    [onConnectionClick],
  )

  const isDraggable = mode !== 'review'
  const isConnectable = mode !== 'review'
  const isDeletable = mode === 'edit'
  const onlyRenderVisible = cards.length > 30

  return (
    <div className={`canvas-board-wrapper ${className}`} data-testid="canvas-board">
      {/* Polite live region for accessibility announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Visible Connections counter for play and edit mode */}
      {mode !== 'review' && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-white text-navy-900 border border-navy-900-12 shadow-sm"
            role="status"
            aria-label={`Connections used ${connections.length} of ${maxConnections}`}
          >
            <span className="w-2 h-2 rounded-full bg-navy-800" aria-hidden="true" />
            <span>
              Connections used {connections.length} of {maxConnections}
            </span>
          </div>
        </div>
      )}

      <div className="canvas-flow-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={canvasNodeTypes}
          edgeTypes={canvasEdgeTypes}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={isDraggable}
          nodesConnectable={isConnectable}
          elementsSelectable={mode !== 'review'}
          deleteKeyCode={mode === 'review' ? null : ['Backspace', 'Delete']}
          minZoom={0.3}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          panOnDrag
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          preventScrolling={false}
          onlyRenderVisibleElements={onlyRenderVisible}
          onNodeClick={onCardClick ? handleNodeClick : undefined}
          onEdgeClick={onConnectionClick ? handleEdgeClick : undefined}
          onConnect={handleConnect}
          onEdgesDelete={handleEdgesDelete}
          onNodeDragStop={handleNodeDragStop}
          onNodesDelete={isDeletable ? handleNodesDelete : undefined}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          proOptions={{ hideAttribution: false }}
        >
          <CanvasControls connectCardsDialogSlot={connectCardsDialogSlot} />
          <MiniMap
            className="canvas-minimap"
            nodeColor="var(--color-navy-900-12)"
            maskColor="rgba(245, 246, 255, 0.7)"
            zoomable
            pannable
          />
        </ReactFlow>
      </div>
    </div>
  )
}

/**
 * CanvasBoard component wrapped in ReactFlowProvider.
 * Reusable across edit, play, and review modes.
 */
export default function CanvasBoard(props: CanvasBoardProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoardInner {...props} />
    </ReactFlowProvider>
  )
}
