import { useState, useMemo, useCallback } from 'react'
import {
  FileText,
  Globe,
  BookOpen,
  HelpCircle,
  Network,
  Sparkles,
  Layers,
  ArrowRight,
  Trash2,
  Edit2,
  Link2,
  Crosshair,
  Search,
  X,
} from 'lucide-react'
import type { LearningCanvasNode, LearningCanvasEdge } from '../types'
import type { ResolvedReferenceInfo } from './ReferenceCard'

interface CanvasOutlineViewProps {
  nodes: LearningCanvasNode[]
  edges: LearningCanvasEdge[]
  readOnly?: boolean
  resolvedReferences?: Record<string, ResolvedReferenceInfo>
  onJumpToNode: (id: string) => void
  onEditNode?: (id: string) => void
  onDeleteNode?: (id: string) => void
  onConnectFromNode?: (id: string) => void
  onClose: () => void
}

export function CanvasOutlineView({
  nodes,
  edges,
  readOnly = false,
  resolvedReferences = {},
  onJumpToNode,
  onEditNode,
  onDeleteNode,
  onConnectFromNode,
  onClose,
}: CanvasOutlineViewProps) {
  const [search, setSearch] = useState('')

  const getNodeTitle = useCallback(
    (node: LearningCanvasNode): string => {
      if (node.type === 'text') return node.text ? node.text.slice(0, 80) : 'Empty text card'
      if (node.type === 'link') return node.link?.title || node.link?.url || 'Web link'
      if (node.type === 'reference') {
        const info = node.reference ? resolvedReferences[node.reference.refId] : undefined
        return info?.available ? info.title : 'Not available'
      }
      if (node.type === 'group') return node.group?.label || 'Group container'
      return 'Card'
    },
    [resolvedReferences]
  )

  const getNodeIcon = (node: LearningCanvasNode) => {
    if (node.type === 'text') return <FileText size={16} aria-hidden="true" />
    if (node.type === 'link') return <Globe size={16} aria-hidden="true" />
    if (node.type === 'group') return <Layers size={16} aria-hidden="true" />
    if (node.type === 'reference') {
      const info = node.reference ? resolvedReferences[node.reference.refId] : undefined
      if (node.reference?.refType === 'module') return <BookOpen size={16} aria-hidden="true" />
      if (node.reference?.refType === 'learning') return <Sparkles size={16} aria-hidden="true" />
      if (info?.isCanvasActivity) return <Network size={16} aria-hidden="true" />
      return <HelpCircle size={16} aria-hidden="true" />
    }
    return <FileText size={16} aria-hidden="true" />
  }

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes
    const q = search.toLowerCase()
    return nodes.filter((n) => getNodeTitle(n).toLowerCase().includes(q))
  }, [nodes, search, getNodeTitle])

  return (
    <aside
      aria-label="Canvas text outline"
      className="w-full lg:w-96 bg-white border border-navy-900-12 rounded-2xl p-4 flex flex-col h-full shadow-md shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-navy-900-12 pb-3 mb-3">
        <div>
          <h3 className="text-base font-bold text-navy-900 m-0">Text Outline</h3>
          <span className="text-xs text-navy-800-72">
            {nodes.length} cards · {edges.length} connections
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close outline view"
          className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800-72" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter cards in outline…"
          aria-label="Filter outline cards"
          className="w-full pl-8 pr-2.5 py-1.5 text-xs text-navy-900 bg-white border border-navy-900-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-800"
        />
      </div>

      {/* Cards list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
        {filteredNodes.length === 0 ? (
          <div className="p-6 text-center text-xs text-navy-800-72">
            No cards found.
          </div>
        ) : (
          filteredNodes.map((node) => {
            const outgoingEdges = edges.filter((e) => e.from === node.id)
            const incomingEdges = edges.filter((e) => e.to === node.id)

            return (
              <div
                key={node.id}
                className="p-3 rounded-xl border border-navy-900-12 bg-surface-primary hover:border-navy-800 transition-colors"
                data-testid={`outline-node-${node.id}`}
              >
                {/* Node Row Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 rounded-md bg-navy-900-8 text-navy-900 shrink-0">
                      {getNodeIcon(node)}
                    </span>
                    <span className="text-xs font-bold text-navy-900 truncate">
                      {getNodeTitle(node)}
                    </span>
                  </div>

                  {/* Actions toolbar */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onJumpToNode(node.id)}
                      aria-label={`Jump to ${getNodeTitle(node)}`}
                      className="p-1 rounded text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
                      title="Jump to card"
                    >
                      <Crosshair size={13} aria-hidden="true" />
                    </button>
                    {!readOnly && onConnectFromNode && (
                      <button
                        type="button"
                        onClick={() => onConnectFromNode(node.id)}
                        aria-label={`Connect from ${getNodeTitle(node)}`}
                        className="p-1 rounded text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
                        title="Connect to another card"
                      >
                        <Link2 size={13} aria-hidden="true" />
                      </button>
                    )}
                    {!readOnly && onEditNode && (
                      <button
                        type="button"
                        onClick={() => onEditNode(node.id)}
                        aria-label={`Edit ${getNodeTitle(node)}`}
                        className="p-1 rounded text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
                        title="Edit card"
                      >
                        <Edit2 size={13} aria-hidden="true" />
                      </button>
                    )}
                    {!readOnly && onDeleteNode && (
                      <button
                        type="button"
                        onClick={() => onDeleteNode(node.id)}
                        aria-label={`Delete ${getNodeTitle(node)}`}
                        className="p-1 rounded text-navy-900 hover:text-feedback-error hover:bg-feedback-error-bg focus:outline-none focus:ring-2 focus:ring-navy-800"
                        title="Delete card"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Connections info */}
                {(outgoingEdges.length > 0 || incomingEdges.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-navy-900-8 text-[11px] text-navy-800-72 space-y-1">
                    {outgoingEdges.map((e) => {
                      const targetNode = nodes.find((n) => n.id === e.to)
                      return (
                        <div key={e.id} className="flex items-center gap-1">
                          <ArrowRight size={11} className="text-navy-900" aria-hidden="true" />
                          <span>Connected to:</span>
                          <span className="font-semibold text-navy-900 truncate">
                            {targetNode ? getNodeTitle(targetNode) : e.to}
                          </span>
                          {e.label && <span className="italic">({e.label})</span>}
                        </div>
                      )
                    })}
                    {incomingEdges.map((e) => {
                      const sourceNode = nodes.find((n) => n.id === e.from)
                      return (
                        <div key={e.id} className="flex items-center gap-1">
                          <span className="text-navy-800-72">← From:</span>
                          <span className="font-semibold text-navy-900 truncate">
                            {sourceNode ? getNodeTitle(sourceNode) : e.from}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
