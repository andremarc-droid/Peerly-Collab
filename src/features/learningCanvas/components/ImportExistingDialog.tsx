import { useState, useMemo } from 'react'
import {
  Layout,
  FileText,
  BookOpen,
  HelpCircle,
  Search,
  CheckSquare,
  Square,
  Upload,
} from 'lucide-react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import type { LearningCanvasWithId } from '../types'
import type { GraphNodeType } from '../graph/graphModel'

export interface ImportableItem {
  id: string
  rawId: string
  type: GraphNodeType
  title: string
  classId: string
  className: string
  subtitle: string
  alreadyInGraph: boolean
}

interface ImportExistingDialogProps {
  open: boolean
  onClose: () => void
  canvases: LearningCanvasWithId[]
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
  classes: Array<{ id: string; name: string }>
  selectedClassId?: string
  alreadyIncludedIds: Set<string>
  onImport: (selectedIds: string[]) => void
}

export function ImportExistingDialog({
  open,
  onClose,
  canvases,
  moduleTitles = {},
  quizTitles = {},
  classes,
  selectedClassId,
  alreadyIncludedIds,
  onImport,
}: ImportExistingDialogProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'canvas' | 'note' | 'module' | 'quiz'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes])

  // Build the list of all importable items
  const allItems = useMemo<ImportableItem[]>(() => {
    const items: ImportableItem[] = []
    const targetClassId =
      selectedClassId && selectedClassId !== 'all' ? selectedClassId : classes[0]?.id || ''
    const fallbackClassName = classMap.get(targetClassId) || 'Class'

    // 1. Canvases and Notes
    const relevantCanvases =
      selectedClassId && selectedClassId !== 'all'
        ? canvases.filter((c) => c.classId === selectedClassId)
        : canvases

    for (const c of relevantCanvases) {
      const isNote = c.sourceCanvasId === 'note'
      const type: GraphNodeType = isNote ? 'note' : 'learning'
      const id = `${type}:${c.id}`
      const className = classMap.get(c.classId) || fallbackClassName
      const subtitle = isNote
        ? `Concept Note · ${className}`
        : `Whiteboard Canvas · ${className} · ${c.nodeCount} cards`

      items.push({
        id,
        rawId: c.id,
        type,
        title: c.title,
        classId: c.classId,
        className,
        subtitle,
        alreadyInGraph: alreadyIncludedIds.has(id),
      })
    }

    // 2. Modules
    for (const [mId, mTitle] of Object.entries(moduleTitles)) {
      const id = `module:${mId}`
      items.push({
        id,
        rawId: mId,
        type: 'module',
        title: mTitle,
        classId: targetClassId,
        className: fallbackClassName,
        subtitle: `Course Module · ${fallbackClassName}`,
        alreadyInGraph: alreadyIncludedIds.has(id),
      })
    }

    // 3. Quizzes
    for (const [qId, qTitle] of Object.entries(quizTitles)) {
      const id = `quiz:${qId}`
      items.push({
        id,
        rawId: qId,
        type: 'quiz',
        title: qTitle,
        classId: targetClassId,
        className: fallbackClassName,
        subtitle: `Quiz Activity · ${fallbackClassName}`,
        alreadyInGraph: alreadyIncludedIds.has(id),
      })
    }

    return items
  }, [canvases, moduleTitles, quizTitles, classes, selectedClassId, classMap, alreadyIncludedIds])

  // Filter items
  const filteredItems = useMemo(() => {
    let result = allItems

    if (activeTab === 'canvas') {
      result = result.filter((i) => i.type === 'learning')
    } else if (activeTab === 'note') {
      result = result.filter((i) => i.type === 'note')
    } else if (activeTab === 'module') {
      result = result.filter((i) => i.type === 'module')
    } else if (activeTab === 'quiz') {
      result = result.filter((i) => i.type === 'quiz')
    }

    const query = searchQuery.trim().toLowerCase()
    if (query) {
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.className.toLowerCase().includes(query) ||
          i.subtitle.toLowerCase().includes(query),
      )
    }

    return result
  }, [allItems, activeTab, searchQuery])

  // Counts
  const counts = useMemo(() => {
    let canvas = 0
    let note = 0
    let module = 0
    let quiz = 0
    for (const i of allItems) {
      if (i.type === 'learning') canvas++
      else if (i.type === 'note') note++
      else if (i.type === 'module') module++
      else if (i.type === 'quiz') quiz++
    }
    return { all: allItems.length, canvas, note, module, quiz }
  }, [allItems])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllVisible = () => {
    const visibleIds = filteredItems.map((i) => i.id)
    const allSelected = visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const handleImportAll = () => {
    const allIds = allItems.map((i) => i.id)
    onImport(allIds)
    onClose()
  }

  const handleImportSelected = () => {
    if (selectedIds.size === 0) return
    onImport(Array.from(selectedIds))
    onClose()
  }

  // Icon mapping
  const renderIcon = (type: GraphNodeType) => {
    switch (type) {
      case 'note':
        return <FileText size={18} className="text-navy-900" />
      case 'learning':
        return <Layout size={18} className="text-navy-900" />
      case 'module':
        return <BookOpen size={18} className="text-navy-800" />
      case 'quiz':
        return <HelpCircle size={18} className="text-navy-800" />
      default:
        return <FileText size={18} />
    }
  }

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import from Class"
      description="Choose existing whiteboard canvases and modules from your class to include in your graph view."
      className="max-w-2xl"
    >
      <div className="grid gap-4">
        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800-72 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search materials..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-navy-900-15 bg-white text-navy-900 placeholder:text-navy-800-72 focus:outline-none focus:ring-2 focus:ring-navy-800"
            />
          </div>

          {/* Quick Import All Button */}
          <Button
            type="button"
            variant="secondary"
            onClick={handleImportAll}
            className="text-xs py-1.5 px-3 min-h-8 shrink-0 gap-1.5"
          >
            <Upload size={14} aria-hidden="true" />
            <span>Import All ({allItems.length})</span>
          </Button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-navy-900-10 pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-navy-900 text-white'
                : 'text-navy-800-72 hover:bg-navy-900-05 hover:text-navy-900'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('canvas')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'canvas'
                ? 'bg-navy-900 text-white'
                : 'text-navy-800-72 hover:bg-navy-900-05 hover:text-navy-900'
            }`}
          >
            Canvases ({counts.canvas})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('note')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'note'
                ? 'bg-navy-900 text-white'
                : 'text-navy-800-72 hover:bg-navy-900-05 hover:text-navy-900'
            }`}
          >
            Notes ({counts.note})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('module')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'module'
                ? 'bg-navy-900 text-white'
                : 'text-navy-800-72 hover:bg-navy-900-05 hover:text-navy-900'
            }`}
          >
            Modules ({counts.module})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quiz')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'quiz'
                ? 'bg-navy-900 text-white'
                : 'text-navy-800-72 hover:bg-navy-900-05 hover:text-navy-900'
            }`}
          >
            Quizzes ({counts.quiz})
          </button>
        </div>

        {/* Selection summary bar */}
        <div className="flex items-center justify-between text-xs text-navy-800-72 px-1">
          <button
            type="button"
            onClick={handleSelectAllVisible}
            className="flex items-center gap-1.5 font-semibold text-navy-900 hover:text-navy-800 transition-colors"
          >
            {allVisibleSelected ? (
              <CheckSquare size={15} className="text-navy-900" />
            ) : (
              <Square size={15} className="text-navy-800-72" />
            )}
            <span>
              {allVisibleSelected ? 'Deselect visible' : 'Select all visible'} ({filteredItems.length})
            </span>
          </button>

          <span>
            {selectedIds.size} selected
          </span>
        </div>

        {/* Scrollable list */}
        <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 border border-navy-900-10 rounded-xl p-2 bg-navy-900-03">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-sm font-semibold text-navy-900 m-0 mb-1">No materials match</p>
              <p className="text-xs text-navy-800-72 m-0">
                {allItems.length === 0
                  ? 'No existing modules or canvases found in your class.'
                  : 'Try adjusting your search query or type filter.'}
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.id)

              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white border-navy-800 shadow-sm ring-1 ring-navy-800'
                      : 'bg-white border-navy-900-10 hover:border-navy-900-25'
                  }`}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      toggleSelect(item.id)
                    }
                  }}
                >
                  {/* Checkbox indicator */}
                  <div className="text-navy-900 shrink-0">
                    {isSelected ? (
                      <CheckSquare size={18} className="text-navy-900" />
                    ) : (
                      <Square size={18} className="text-navy-900-40" />
                    )}
                  </div>

                  {/* Icon Tile */}
                  <div className="w-8 h-8 rounded-lg bg-navy-900-08 flex items-center justify-center shrink-0">
                    {renderIcon(item.type)}
                  </div>

                  {/* Title & Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-navy-900 m-0 truncate">
                        {item.title}
                      </p>
                      {item.alreadyInGraph && (
                        <Badge className="shrink-0 text-[10px] py-0 px-1.5">
                          In graph
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-navy-800-72 m-0 truncate">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-navy-900-10">
          <Button type="button" variant="ghost" onClick={onClose} className="text-xs">
            Cancel
          </Button>

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleImportAll}
              className="text-xs"
            >
              Import All
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleImportSelected}
              disabled={selectedIds.size === 0}
              className="text-xs"
            >
              Import Selected ({selectedIds.size})
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
