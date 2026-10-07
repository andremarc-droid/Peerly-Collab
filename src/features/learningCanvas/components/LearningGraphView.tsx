import { useState, useEffect, useRef, useMemo } from 'react'
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
  Filter,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import {
  buildLearningGraph,
  type GraphNode,
  type GraphNodeType,
  type GraphData,
} from '../graph/graphModel'
import { stepSimulation } from '../graph/simulation'
import { buildReferencePath, type CanvasViewerRole } from '../referenceRoutes'
import type { LearningCanvasWithId } from '../types'

interface LearningGraphViewProps {
  canvases: LearningCanvasWithId[]
  classes: Array<{ id: string; name: string }>
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
  selectedClassId?: string
  role: CanvasViewerRole
}

export function LearningGraphView({
  canvases,
  classes,
  moduleTitles = {},
  quizTitles = {},
  selectedClassId,
  role,
}: LearningGraphViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [allowedTypes, setAllowedTypes] = useState<Set<GraphNodeType>>(
    new Set(['learning', 'module', 'quiz']),
  )

  // Zoom and Pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  // Node Dragging
  const draggedNodeRef = useRef<GraphNode | null>(null)

  // Simulation animation frame & state
  const [graphData, setGraphData] = useState<GraphData>(() =>
    buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId,
      allowedTypes,
      searchQuery,
    }),
  )

  const nodesRef = useRef<GraphNode[]>(graphData.nodes)
  const linksRef = useRef(graphData.links)
  const animFrameRef = useRef<number | null>(null)
  const alphaRef = useRef<number>(1.0)

  // Rebuild graph when inputs change
  useEffect(() => {
    const fresh = buildLearningGraph({
      canvases,
      classes,
      moduleTitles,
      quizTitles,
      selectedClassId,
      allowedTypes,
      searchQuery,
    })

    // Preserve existing coordinates for nodes that already existed
    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]))
    fresh.nodes.forEach((n) => {
      const prev = prevMap.get(n.id)
      if (prev) {
        n.x = prev.x
        n.y = prev.y
      }
    })

    nodesRef.current = fresh.nodes
    linksRef.current = fresh.links
    setGraphData(fresh)
    alphaRef.current = 1.0 // kick off simulation
  }, [canvases, classes, moduleTitles, quizTitles, selectedClassId, allowedTypes, searchQuery])

  // Simulation ticker
  useEffect(() => {
    const tick = () => {
      if (alphaRef.current > 0.005) {
        stepSimulation(nodesRef.current, linksRef.current)
        alphaRef.current *= 0.96
        setGraphData({
          nodes: [...nodesRef.current],
          links: [...linksRef.current],
        })
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  // Highlight sets based on hovered node
  const { highlightedNodeIds, highlightedLinkIds } = useMemo(() => {
    if (!hoveredNodeId) {
      return { highlightedNodeIds: null, highlightedLinkIds: null }
    }
    const nIds = new Set<string>([hoveredNodeId])
    const lIds = new Set<string>()

    for (const link of graphData.links) {
      if (link.source === hoveredNodeId) {
        nIds.add(link.target)
        lIds.add(link.id)
      } else if (link.target === hoveredNodeId) {
        nIds.add(link.source)
        lIds.add(link.id)
      }
    }

    return { highlightedNodeIds: nIds, highlightedLinkIds: lIds }
  }, [hoveredNodeId, graphData.links])

  // Pan interaction
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'rect') {
      return
    }
    isPanningRef.current = true
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedNodeRef.current) {
      // User is dragging a node
      const rect = e.currentTarget.getBoundingClientRect()
      const svgCenterX = rect.width / 2
      const svgCenterY = rect.height / 2
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Invert pan & zoom to world coords
      draggedNodeRef.current.x = (mouseX - svgCenterX - pan.x) / zoom
      draggedNodeRef.current.y = (mouseY - svgCenterY - pan.y) / zoom
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      alphaRef.current = 0.5 // revive physics
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
    draggedNodeRef.current = null
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => Math.max(0.2, Math.min(3, z * zoomFactor)))
  }

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

  const nodeMap = useMemo(() => new Map(graphData.nodes.map((n) => [n.id, n])), [graphData.nodes])

  // Count items by type
  const typeCounts = useMemo(() => {
    let learning = 0
    let moduleCount = 0
    let quiz = 0
    for (const n of graphData.nodes) {
      if (n.type === 'learning') learning++
      else if (n.type === 'module') moduleCount++
      else if (n.type === 'quiz') quiz++
    }
    return { learning, module: moduleCount, quiz }
  }, [graphData.nodes])

  return (
    <div className="relative flex flex-col w-full h-[620px] rounded-3xl border border-navy-900-15 bg-navy-900-05 overflow-hidden shadow-xs">
      {/* Top Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 p-2 bg-white/95 backdrop-blur-xs rounded-2xl border border-navy-900-10 shadow-xs pointer-events-auto">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={16} className="absolute left-3 top-2.5 text-navy-800-72 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learning graph…"
            className="w-full pl-9 pr-7 py-1.5 text-xs text-navy-900 bg-navy-900-05 border border-navy-900-15 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-navy-800 hover:text-navy-900 p-0.5 rounded-full"
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
            onClick={() => toggleType('learning')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              allowedTypes.has('learning')
                ? 'bg-navy-900 text-white border-navy-900'
                : 'bg-white text-navy-800-72 border-navy-900-15 hover:border-navy-900-40'
            }`}
          >
            <Layout size={13} />
            Canvases ({typeCounts.learning})
          </button>
          <button
            type="button"
            onClick={() => toggleType('module')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              allowedTypes.has('module')
                ? 'bg-navy-800 text-white border-navy-800'
                : 'bg-white text-navy-800-72 border-navy-900-15 hover:border-navy-900-40'
            }`}
          >
            <BookOpen size={13} />
            Modules ({typeCounts.module})
          </button>
          <button
            type="button"
            onClick={() => toggleType('quiz')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              allowedTypes.has('quiz')
                ? 'bg-navy-700 text-white border-navy-700'
                : 'bg-white text-navy-800-72 border-navy-900-15 hover:border-navy-900-40'
            }`}
          >
            <HelpCircle size={13} />
            Quizzes ({typeCounts.quiz})
          </button>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-1 border-l border-navy-900-10 pl-2">
          <Button
            type="button"
            variant="ghost"
            className="p-1.5 h-8 w-8 min-h-0"
            onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="p-1.5 h-8 w-8 min-h-0"
            onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="p-1.5 h-8 w-8 min-h-0"
            onClick={handleResetView}
            aria-label="Reset view"
          >
            <Maximize2 size={16} />
          </Button>
        </div>
      </div>

      {/* SVG Interactive Canvas */}
      {graphData.nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white border border-navy-900-15 flex items-center justify-center text-navy-900 mb-3 shadow-xs">
            <Filter size={24} />
          </div>
          <h3 className="text-base font-bold text-navy-900 m-0 mb-1">No graph connections</h3>
          <p className="text-sm text-navy-800-72 max-w-sm m-0">
            Create learning canvases and add references to modules, quizzes, or other canvases to explore the interactive knowledge graph.
          </p>
        </div>
      ) : (
        <svg
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          {/* Background grid dots */}
          <defs>
            <pattern id="graph-grid-dots" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="1" className="fill-navy-900-20" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#graph-grid-dots)" />

          {/* Transform group */}
          <g
            transform={`translate(calc(50% + ${pan.x}px), calc(50% + ${pan.y}px)) scale(${zoom})`}
          >
            {/* Links */}
            <g className="links" aria-hidden="true">
              {graphData.links.map((link) => {
                const source = nodeMap.get(link.source)
                const target = nodeMap.get(link.target)
                if (!source || !target) return null

                const isHighlighted =
                  highlightedLinkIds === null || highlightedLinkIds.has(link.id)

                return (
                  <line
                    key={link.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    className={`transition-opacity duration-150 ${
                      isHighlighted
                        ? 'stroke-navy-800 opacity-90 stroke-[2]'
                        : 'stroke-navy-900-20 opacity-20 stroke-[1.5]'
                    }`}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {graphData.nodes.map((node) => {
                const isSelected = selectedNode?.id === node.id
                const isHovered = hoveredNodeId === node.id
                const isHighlighted =
                  highlightedNodeIds === null || highlightedNodeIds.has(node.id)
                const opacityClass =
                  node.isHighlighted === false || !isHighlighted ? 'opacity-25' : 'opacity-100'

                // Color by node type
                const fillClass =
                  node.type === 'learning'
                    ? 'fill-navy-900'
                    : node.type === 'module'
                    ? 'fill-navy-800'
                    : 'fill-navy-700'

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className={`cursor-pointer transition-opacity duration-150 ${opacityClass}`}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      draggedNodeRef.current = node
                    }}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNode(node)
                    }}
                  >
                    {/* Focus / Selection ring */}
                    {(isSelected || isHovered) && (
                      <circle
                        r={node.radius + 6}
                        className="fill-none stroke-navy-800 stroke-[3] animate-pulse"
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      r={node.radius}
                      className={`${fillClass} stroke-white stroke-[2] shadow-sm`}
                    />

                    {/* Label */}
                    <text
                      y={node.radius + 14}
                      textAnchor="middle"
                      className="text-[11px] font-semibold fill-navy-900 pointer-events-none drop-shadow-xs"
                    >
                      {node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
      )}

      {/* Selected Node Inspector Drawer */}
      {selectedNode && (
        <div className="absolute bottom-3 right-3 z-20 w-80 max-w-[calc(100%-24px)] p-4 bg-white/95 backdrop-blur-xs rounded-2xl border border-navy-900-15 shadow-md flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-navy-900-08 text-navy-900">
                {selectedNode.type === 'learning' ? (
                  <Layout size={18} />
                ) : selectedNode.type === 'module' ? (
                  <BookOpen size={18} />
                ) : (
                  <HelpCircle size={18} />
                )}
              </span>
              <div>
                <Badge>
                  {selectedNode.type === 'learning'
                    ? 'Canvas'
                    : selectedNode.type === 'module'
                    ? 'Module'
                    : 'Quiz'}
                </Badge>
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

          <div>
            <h4 className="text-sm font-bold text-navy-900 m-0 mb-1">{selectedNode.title}</h4>
            <div className="text-xs text-navy-800-72">
              {selectedNode.degree === 1
                ? '1 connected link'
                : `${selectedNode.degree} connected links`}
            </div>
          </div>

          <div className="pt-2 border-t border-navy-900-10 flex justify-end">
            <Button
              to={buildReferencePath(role, selectedNode.classId, selectedNode.type, selectedNode.rawId)}
              variant="primary"
              className="w-full justify-center"
            >
              <span>Open {selectedNode.type === 'learning' ? 'Canvas' : selectedNode.type === 'module' ? 'Module' : 'Quiz'}</span>
              <ExternalLink size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
