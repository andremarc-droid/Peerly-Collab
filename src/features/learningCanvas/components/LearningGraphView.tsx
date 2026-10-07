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
  Filter,
  SlidersHorizontal,
  Orbit,
  ChevronRight,
} from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import {
  buildLearningGraph,
  type GraphNode,
  type GraphNodeType,
  type GraphData,
} from '../graph/graphModel'
import { stepSimulation, type SimulationParams } from '../graph/simulation'
import { buildReferencePath, type CanvasViewerRole } from '../referenceRoutes'
import type { LearningCanvasWithId } from '../types'
import '../graph/graphView.css'

/* ── SVG icon paths (lucide-compatible 24×24 viewBox) ── */
const ICON_PATHS: Record<GraphNodeType, string> = {
  learning:
    'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z',
  module:
    'M2 3h6a4 4 0 0 1 4 4 4 4 0 0 1 4-4h6v18h-6a4 4 0 0 0-4 4 4 4 0 0 0-4-4H2V3Z',
  quiz:
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm0-14a1 1 0 0 0-1 1v1a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1Zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
}

const TYPE_LABELS: Record<GraphNodeType, string> = {
  learning: 'Canvas',
  module: 'Module',
  quiz: 'Quiz',
}

const TYPE_ICONS: Record<GraphNodeType, React.ComponentType<{ size: number }>> = {
  learning: Layout,
  module: BookOpen,
  quiz: HelpCircle,
}

interface LearningGraphViewProps {
  canvases: LearningCanvasWithId[]
  classes: Array<{ id: string; name: string }>
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
  selectedClassId?: string
  role: CanvasViewerRole
  onSwitchToCanvases?: () => void
}

export function LearningGraphView({
  canvases,
  classes,
  moduleTitles = {},
  quizTitles = {},
  selectedClassId,
  role,
  onSwitchToCanvases,
}: LearningGraphViewProps) {
  /* ── Search & filter state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [allowedTypes, setAllowedTypes] = useState<Set<GraphNodeType>>(
    new Set(['learning', 'module', 'quiz']),
  )

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

  /* ── Simulation ── */
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
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
    })

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
    alphaRef.current = 1.0
  }, [canvases, classes, moduleTitles, quizTitles, selectedClassId, allowedTypes, searchQuery])

  /* ── Simulation loop ── */
  useEffect(() => {
    const tick = () => {
      if (alphaRef.current > 0.005) {
        stepSimulation(nodesRef.current, linksRef.current, forceParams)
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
  }, [forceParams])

  /* ── Highlight sets from hovered node ── */
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

  /* ── Neighbor nodes for inspector ── */
  const neighborNodes = useMemo(() => {
    if (!selectedNode) return []
    const neighbors: GraphNode[] = []
    const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]))

    for (const link of graphData.links) {
      if (link.source === selectedNode.id) {
        const target = nodeMap.get(link.target)
        if (target) neighbors.push(target)
      } else if (link.target === selectedNode.id) {
        const source = nodeMap.get(link.source)
        if (source) neighbors.push(source)
      }
    }
    return neighbors
  }, [selectedNode, graphData])

  /* ── Node map ── */
  const nodeMap = useMemo(
    () => new Map(graphData.nodes.map((n) => [n.id, n])),
    [graphData.nodes],
  )

  /* ── Type counts ── */
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

  /* ── Build Bézier control point for curved edges ── */
  const buildCurvePath = useCallback(
    (sx: number, sy: number, tx: number, ty: number): string => {
      const dx = tx - sx
      const dy = ty - sy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      // Curvature proportional to distance but capped
      const curvature = Math.min(dist * 0.15, 40)
      // Perpendicular offset for control point
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
    // Deselect node on background click
    setSelectedNode(null)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedNodeRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const svgCenterX = rect.width / 2
      const svgCenterY = rect.height / 2
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      draggedNodeRef.current.x = (mouseX - svgCenterX - pan.x) / zoom
      draggedNodeRef.current.y = (mouseY - svgCenterY - pan.y) / zoom
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      alphaRef.current = 0.5
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

  /* ── Container dimensions for centering & minimap ── */
  const [dimensions, setDimensions] = useState({ w: 800, h: 620 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setDimensions({ w: el.clientWidth || 800, h: el.clientHeight || 620 })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Filter classes ── */
  const filterActiveClass = (type: GraphNodeType) => {
    if (!allowedTypes.has(type)) return 'graph-view__filter'
    if (type === 'learning') return 'graph-view__filter graph-view__filter--active'
    if (type === 'module') return 'graph-view__filter graph-view__filter--active-module'
    return 'graph-view__filter graph-view__filter--active-quiz'
  }

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

        {/* View controls */}
        <div className="graph-view__zoom-controls">
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
          >
            <Maximize2 size={16} />
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
          <h3 className="text-base font-bold text-navy-900 m-0 mb-1">No graph connections</h3>
          <p className="text-sm text-navy-800-72 max-w-sm m-0 mb-4">
            Create learning canvases and add references to modules, quizzes, or other canvases to
            explore the interactive knowledge graph.
          </p>
          {onSwitchToCanvases && (
            <Button
              type="button"
              variant="primary"
              onClick={onSwitchToCanvases}
            >
              <span>Go to Canvases</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="graph-view__svg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
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

                const path = buildCurvePath(source.x, source.y, target.x, target.y)

                return (
                  <g key={link.id}>
                    <path
                      d={path}
                      className={edgeClass}
                      markerEnd="url(#graph-arrow)"
                    />
                    {/* Animated particle along highlighted edges */}
                    {isHighlighted && highlightedLinkIds !== null && (
                      <circle r="2.5" className="graph-view__particle graph-view__particle--active">
                        <animateMotion
                          dur="2s"
                          repeatCount="indefinite"
                          path={path}
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
                const isDimmedBySearch = node.isHighlighted === false
                const isDimmedByHover =
                  highlightedNodeIds !== null && !highlightedNodeIds.has(node.id)
                const isDimmed = isDimmedBySearch || isDimmedByHover

                const nodeClass = isDimmed
                  ? 'graph-view__node graph-view__node--dimmed'
                  : isSelected
                    ? 'graph-view__node graph-view__node--selected'
                    : 'graph-view__node'

                const circleClass = `graph-view__node-circle graph-view__node-circle--${node.type}`
                const iconScale = node.radius / 20 // Scale icon proportionally

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className={nodeClass}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      draggedNodeRef.current = node
                    }}
                    onPointerEnter={() => setHoveredNodeId(node.id)}
                    onPointerLeave={() => setHoveredNodeId(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNode((prev) => (prev?.id === node.id ? null : node))
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${TYPE_LABELS[node.type]}: ${node.title}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedNode((prev) => (prev?.id === node.id ? null : node))
                      }
                    }}
                  >
                    {/* Glow halo (visible on hover/select) */}
                    <circle
                      r={node.radius + 12}
                      className="graph-view__node-glow"
                    />

                    {/* Selection / hover ring */}
                    <circle
                      r={node.radius + 5}
                      className="graph-view__node-ring"
                    />

                    {/* Node body */}
                    <circle r={node.radius} className={circleClass} />

                    {/* Icon inside node */}
                    <g
                      transform={`translate(${-iconScale * 8}, ${-iconScale * 8}) scale(${iconScale * 0.67})`}
                      className="graph-view__node-icon"
                    >
                      <path d={ICON_PATHS[node.type]} />
                    </g>

                    {/* Label underneath */}
                    <text
                      y={node.radius + 16}
                      className={`graph-view__node-label ${isDimmed ? 'graph-view__node-label--dimmed' : ''}`}
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

      {/* ── Stats footer ── */}
      {graphData.nodes.length > 0 && !selectedNode && (
        <div className="graph-view__stats">
          <span className="graph-view__stats-dot graph-view__stats-dot--learning" />
          <span>{typeCounts.learning} canvases</span>
          <span className="graph-view__stats-dot graph-view__stats-dot--module" />
          <span>{typeCounts.module} modules</span>
          <span className="graph-view__stats-dot graph-view__stats-dot--quiz" />
          <span>{typeCounts.quiz} quizzes</span>
          <span>·</span>
          <span>{graphData.links.length} connections</span>
        </div>
      )}

      {/* ── Minimap ── */}
      {graphData.nodes.length > 0 && minimapBounds && !selectedNode && (
        <div className={`graph-view__minimap ${showForcePanel ? 'graph-view__minimap--hidden-by-inspector' : ''}`}>
          <svg width="100%" height="100%" viewBox={`${minimapBounds.x} ${minimapBounds.y} ${minimapBounds.width} ${minimapBounds.height}`}>
            {/* Minimap edges */}
            {graphData.links.map((link) => {
              const s = nodeMap.get(link.source)
              const t = nodeMap.get(link.target)
              if (!s || !t) return null
              return (
                <line
                  key={link.id}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="var(--color-navy-800)"
                  strokeWidth={1}
                  opacity={0.2}
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

      {/* ── Inspector drawer ── */}
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

          {/* Neighbor list */}
          {neighborNodes.length > 0 && (
            <div className="border-t border-navy-900-10 pt-2">
              <p className="text-[11px] font-bold text-navy-800-72 uppercase tracking-wider m-0 mb-1.5">
                Connected to
              </p>
              <ul className="list-none m-0 p-0 grid gap-1 max-h-32 overflow-y-auto">
                {neighborNodes.map((neighbor) => {
                  const NeighborIcon = TYPE_ICONS[neighbor.type]
                  return (
                    <li key={neighbor.id}>
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left text-navy-900 rounded-lg hover:bg-navy-900-05 transition-colors"
                        onClick={() => setSelectedNode(neighbor)}
                      >
                        <NeighborIcon size={14} />
                        <span className="flex-1 truncate font-medium">{neighbor.title}</span>
                        <ChevronRight size={12} className="text-navy-800-72 flex-shrink-0" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Action */}
          <div className="pt-2 border-t border-navy-900-10 flex justify-end">
            <Button
              to={buildReferencePath(role, selectedNode.classId, selectedNode.type, selectedNode.rawId)}
              variant="primary"
              className="w-full justify-center"
            >
              <span>Open {TYPE_LABELS[selectedNode.type]}</span>
              <ExternalLink size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
